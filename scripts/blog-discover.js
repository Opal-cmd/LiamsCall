#!/usr/bin/env node
'use strict';

/**
 * Discover ORIGINAL blog topic angles inspired by allowlisted feeds/seeds.
 * Never copies articles - only proposes new Liam's Call topics into topics.yaml.
 *
 * Niche (hard): families/caregivers supporting someone with drug/alcohol
 * addiction, homelessness/housing crisis, or mental health challenges tied
 * to those — not general wellness tips, and not eldercare.
 *
 * Usage:
 *   node scripts/blog-discover.js
 *   node scripts/blog-discover.js --limit=5
 *   node scripts/blog-discover.js --dry-run
 *
 * Env: GEMINI_API_KEY (recommended), BLOG_GEMINI_MODEL or GEMINI_MODEL (optional, default gemini-3.6-flash)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  toSlug,
  loadTopics,
  appendTopics,
  loadSources,
} = require('./lib/blog-utils');

const MODEL = process.env.BLOG_GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const API_KEY = process.env.GEMINI_API_KEY;

function parseArgs(argv) {
  const out = { limit: 5, dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--limit=')) out.limit = Math.max(1, Number(a.slice('--limit='.length)) || 5);
  }
  return out;
}

function decodeXml(s) {
  return String(s || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseRssItems(xml) {
  const items = [];
  const blocks = String(xml || '').split(/<item[\s>]/i).slice(1);
  for (const block of blocks) {
    const chunk = block.split(/<\/item>/i)[0] || '';
    const title = decodeXml((chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const link = decodeXml((chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || '');
    const desc = decodeXml(
      (chunk.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] ||
        (chunk.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i) || [])[1] ||
        '',
    ).slice(0, 280);
    if (title && link) items.push({ title, url: link, summary: desc });
  }
  // Atom fallback
  if (!items.length) {
    const entries = String(xml || '').split(/<entry[\s>]/i).slice(1);
    for (const block of entries) {
      const chunk = block.split(/<\/entry>/i)[0] || '';
      const title = decodeXml((chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
      const linkMatch = chunk.match(/<link[^>]+href=["']([^"']+)["']/i);
      const link = linkMatch ? linkMatch[1] : '';
      const desc = decodeXml((chunk.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) || [])[1] || '').slice(0, 280);
      if (title && link) items.push({ title, url: link, summary: desc });
    }
  }
  return items;
}

async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'LiamsCallBlogDiscover/1.0 (+https://liamscall.com)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Feed ${url} → ${res.status}`);
  return parseRssItems(await res.text());
}

function guessRisk(text, fallback = 'safe') {
  const t = String(text || '').toLowerCase();
  if (/\b(crisis|988|suicide|overdose|shelter|homeless|medication|diagnos|psychosis|detox|withdrawal|er visit|emergency)\b/.test(t)) {
    return 'review';
  }
  return fallback === 'review' ? 'review' : 'safe';
}

/** Eldercare / aging — out of niche for Liam's Call. */
function isEldercareOffNiche(text) {
  const t = String(text || '').toLowerCase();
  return /\b(elder(?:ly)?|senior(?:s)?|aging parent|ageing parent|dementia|alzheimer|nursing home|long[- ]term care|ltc|retirement home|geriatric|palliative(?!.*(substance|addiction|overdose|shelter|homeless)))\b/.test(t);
}

/**
 * On-niche: addiction, homelessness/housing crisis, or mental health only when
 * tied to those — or caregiving for that group. Rejects general wellness tips.
 */
function isOnNiche(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return false;
  if (isEldercareOffNiche(t)) return false;

  const addiction =
    /\b(addiction|substance|drug|drugs|alcohol|opioid|fentanyl|overdose|detox|withdrawal|recovery|sobriety|relapse|treatment|raam|connexontario|active use|still using|is using|substance use)\b/.test(t);
  const housing =
    /\b(homeless|homelessness|housing|shelter|encampment|evict|couch[- ]surf|unsheltered|211)\b/.test(t);
  const mhTied =
    /\b(mental health|psychosis|crisis|988|suicide|self[- ]harm|psych(?:iatric)?|trauma)\b/.test(t) &&
    (addiction || housing || /\b(substance|drug|alcohol|overdose|shelter|homeless|housing|loved one who|someone who uses|family member who)\b/.test(t));
  const caregiverOfGroup =
    /\b(caregiver|family|families|parent|partner|spouse|loved one|sibling)\b/.test(t) &&
    (addiction || housing || mhTied || /\b(substance|addiction|homeless|housing|detox|recovery|crisis|988)\b/.test(t));

  // Reject standalone general MH / wellness without addiction or housing.
  const generalWellnessOnly =
    /\b(wellness tip|self[- ]care tip|mindfulness|meditation|gratitude|work[- ]life|burnout tip|anxiety tip|depression tip|holiday loneliness|menopause|eating disorder)\b/.test(t) &&
    !addiction &&
    !housing;

  if (generalWellnessOnly) return false;
  return addiction || housing || mhTied || caregiverOfGroup;
}

function isCaregiverRelevant(text) {
  const t = String(text || '').toLowerCase();
  // Skip obvious admin / unrelated campaigns
  if (/\b(grant|funding opportunity|rfa|nofo|contract award|billing|ehr|data exchange|hiv testing day)\b/.test(t)) {
    return false;
  }
  return isOnNiche(t);
}

function heuristicTopics(inspirations, limit) {
  const out = [];
  for (const src of inspirations.slice(0, limit * 4)) {
    if (out.length >= limit) break;
    if (!isOnNiche(`${src.title} ${src.summary} ${src.category}`)) continue;
    const id = `insp-${toSlug(src.title).slice(0, 48)}`;
    out.push({
      id,
      title: `For families facing addiction or housing crisis: ${src.title}`.slice(0, 110),
      category: src.category || 'Care Giver Tips',
      risk: guessRisk(`${src.title} ${src.summary}`, src.default_risk || 'review'),
      angle: `Write an original Liam's Call post for families/caregivers supporting someone with addiction, homelessness, or a related mental-health crisis — inspired by themes around "${src.title}". Not eldercare. Not general wellness. Do not rewrite or quote the source at length. One calm practical takeaway. Further reading may link ${src.url}.`,
      source_url: src.url,
      source_name: src.source_name || '',
    });
  }
  return out;
}

async function geminiPropose(inspirations, limit) {
  if (!API_KEY) return null;
  const payload = inspirations.slice(0, 12).map((s, i) => ({
    i,
    title: s.title,
    url: s.url,
    summary: s.summary || '',
    source: s.source_name || '',
  }));
  const system = `You help Liam's Call invent ORIGINAL blog topic ideas for a narrow audience.

WHO WE SERVE (required in every topic):
- Families and caregivers supporting someone dealing with drug/alcohol addiction, homelessness or housing crisis, and/or mental health challenges tied to addiction or housing — in Canada and the U.S.
- Caregiving here means that group only (partner, parent, sibling, friend of someone in addiction/housing/crisis) — NEVER eldercare, dementia, nursing homes, or aging-parent care.

IN SCOPE:
- Practical next steps for families around detox/referral, overdose aftermath, refusal of treatment, shelter/housing search, 988/crisis with someone nearby, relapse, dual diagnosis when tied to substance use, supporting a teen with substance use, etc.
- Mental health angles ONLY when clearly linked to addiction, substance use, homelessness, or housing instability — not standalone anxiety/depression/wellness tips.

OUT OF SCOPE (never propose):
- General mental health tips, mindfulness, burnout-as-self-care, holiday loneliness, menopause, eating disorders (unless explicitly tied to substance use), workplace wellness.
- Elder caregiving, dementia, long-term care, aging parents.
- Clinical treatment protocols, medication advice, invented phone numbers.

Rules:
- Never rewrite or paraphrase a source article into a post that copies its structure.
- Use sources only as inspiration for a new niche angle.
- Prefer concrete situations + one practical takeaway. Titles should name the situation (who + what), not vague themes.
- Return ONLY JSON: {"topics":[{"id":"kebab-id","title":"...","category":"...","risk":"safe|review","angle":"...","source_url":"...","source_name":"..."}]}
- Propose at most ${limit} topics.
- risk=review if crisis, shelters, treatment, diagnosis, or hotlines are central.`;

  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.6,
      max_tokens: 2500,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: `Create up to ${limit} original ON-NICHE topic ideas from these inspirations. Drop any that are general wellness or eldercare:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
      ...(/gemini-2\.5|gemini-3/i.test(MODEL)
        ? { reasoning_effort: process.env.GEMINI_REASONING_EFFORT || 'none' }
        : {}),
    }),
  });
  if (!res.ok) throw new Error(`Gemini discover failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const parsed = JSON.parse(fence ? fence[1] : text);
  return (parsed.topics || [])
    .map((t) => ({
      id: toSlug(t.id || t.title).slice(0, 60),
      title: t.title,
      category: t.category || 'Care Giver Tips',
      risk: guessRisk(`${t.title} ${t.angle} ${t.risk}`, t.risk || 'review'),
      angle: t.angle,
      source_url: t.source_url || '',
      source_name: t.source_name || '',
    }))
    .filter((t) => isOnNiche(`${t.title} ${t.angle} ${t.category}`));
}

async function collectInspirations() {
  const { feeds, seeds } = loadSources();
  const existing = loadTopics();
  const seenUrls = new Set(existing.map((t) => t.source_url).filter(Boolean));
  const list = [];

  for (const feed of feeds) {
    try {
      const items = await fetchFeed(feed.url);
      const kept = items.filter((item) => isCaregiverRelevant(`${item.title} ${item.summary}`));
      console.log(`Feed ${feed.id}: ${kept.length}/${items.length} relevant`);
      for (const item of kept.slice(0, 8)) {
        if (seenUrls.has(item.url)) continue;
        list.push({
          ...item,
          source_name: feed.name,
          default_risk: feed.default_risk || 'review',
          category: 'Care Giver Tips',
        });
      }
    } catch (err) {
      console.warn(`Feed skip ${feed.id}: ${err.message}`);
    }
  }

  // Prefer curated seeds first so discovery stays on-brand even if feeds are noisy.
  const seedItems = [];
  for (const seed of seeds) {
    if (seenUrls.has(seed.url)) continue;
    seedItems.push({
      title: seed.title,
      url: seed.url,
      summary: '',
      source_name: seed.title.split(' - ')[0] || 'Seed',
      default_risk: seed.risk || 'review',
      category: seed.category || 'Caregiving',
    });
  }

  return [...seedItems, ...list];
}

async function main() {
  const args = parseArgs(process.argv);
  const inspirations = await collectInspirations();
  if (!inspirations.length) {
    console.log('No new inspirations found.');
    return;
  }

  let proposed = [];
  try {
    proposed = (await geminiPropose(inspirations, args.limit)) || [];
  } catch (err) {
    console.warn(`Gemini propose failed, using heuristic: ${err.message}`);
  }
  if (!proposed.length) proposed = heuristicTopics(inspirations, args.limit);

  // Hard filter: never enqueue general wellness or eldercare topics.
  const before = proposed.length;
  proposed = proposed.filter((t) => isOnNiche(`${t.title} ${t.angle} ${t.category}`));
  if (before && proposed.length < before) {
    console.warn(`Dropped ${before - proposed.length} off-niche topic(s).`);
  }

  // Every discovered topic enters the queue as review-tier. Only an admin
  // editing the topic in the Blog desk can mark one safe.
  proposed = proposed.slice(0, args.limit).map((t) => ({
    ...t,
    id: toSlug(t.id || t.title).slice(0, 60),
    risk: 'review',
    used: false,
  }));

  if (args.dryRun) {
    console.log(JSON.stringify(proposed, null, 2));
    return;
  }

  const added = appendTopics(proposed);
  const summary = { added, count: added.length, proposed: proposed.map((p) => p.id) };
  fs.writeFileSync(path.join(ROOT, '.blog-discover-result.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
