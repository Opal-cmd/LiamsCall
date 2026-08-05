'use strict';

/**
 * Shared Gemini blog generation used by CLI and Blog desk admin.
 */

const fs = require('fs');
const path = require('path');
const {
  CONTENT_DIR,
  DRAFTS_DIR,
  ROOT,
  ensureDir,
  toSlug,
  loadTopics,
  markTopicUsed,
  assertPostGuards,
  loadPost,
  resolveSourceForTopic,
  saveTopics,
  loadSources,
} = require('./blog-utils');
const { ensurePostImage } = require('./blog-images');

const SYSTEM = `You write calm, practical blog posts for Liam's Call (liamscall.com) — a free AI chat for caregivers and families facing mental health, addiction, and housing challenges in Canada and the U.S.

HARD RULES:
- Never invent phone numbers or local shelter/clinic contact details.
- Only link to these hosts if you include a URL: ontariocaregiver.ca, connexontario.ca, 988.ca, 988lifeline.org, 211.ca, 211ontario.ca, 211.org, toronto.ca, samhsa.gov, kidshelpphone.ca, mentalhealthcommission.ca, nami.org, camh.ca, hopeforwellness.ca, canada.ca, wellnesstogether.ca, liamscall.com — PLUS any exact resource URLs listed in the user message.
- Hyperlinks are required. Whenever you use a resource (inspiration article, org page, helpline overview), include a Markdown hyperlink to that exact URL in the body — do not mention a site without linking it.
- Always include: (1) at least one natural inline Markdown link to the inspiration source URL from the user message, and (2) a short final section titled "Further reading" (or "Resources") with Markdown links to every resource URL you used, including the inspiration source. Example: [Ontario Caregiver Organization](https://ontariocaregiver.ca/get-support/).
- Do not invent URLs. Do not copy or closely paraphrase source articles.
- Allowed phone/short codes only if relevant: 988, 911, 211, 311, 811, Ontario Caregiver Organization 1-833-227-3778, ConnexOntario 1-866-531-2600, Kids Help Phone 1-800-668-6868, Hope for Wellness 1-855-242-3310, SAMHSA 1-800-662-4357
- Never diagnose, recommend medications, or give dosing advice.
- Never use exclamation points.
- Write 500–800 words in Markdown paragraphs (optional ## headings). No # title in the body (title is separate).
- Tone: steady, kind friend; no performative AI warmth; no cheerleading.
- Opening: the first paragraph must be a short summary of what the post covers and what practical information it gives. Put that summary before any ## headings.
- Closing order (required): (1) one gentle practical next step that invites the reader to continue in Liam's Call chat with a Markdown link to https://liamscall.com/ ; (2) a short paragraph or line beginning with "Sources referenced:" that names and links the seed website(s) you used; (3) then the "## Further reading" section with the full link list.`;

function getModel() {
  return process.env.BLOG_GEMINI_MODEL || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
}

function getApiKey() {
  return process.env.GEMINI_API_KEY || '';
}

function pickTopic(topics, forcedId) {
  if (forcedId) {
    const t = topics.find((x) => x.id === forcedId);
    if (!t) throw new Error(`Topic not found: ${forcedId}`);
    return t;
  }
  const unused = topics.filter((t) => !t.used);
  if (!unused.length) throw new Error('No unused topics left in topics.yaml');
  const safe = unused.filter((t) => t.risk !== 'review');
  const pool = safe.length ? safe : unused;
  return pool[0];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function relatedResourceHints(topic) {
  const seeds = loadSources().seeds || [];
  const hay = `${topic.title || ''} ${topic.angle || ''} ${topic.category || ''}`.toLowerCase();
  const sourceUrl = String(topic.source_url || topic.url || '').trim();
  return seeds
    .filter((s) => s.url && s.url !== sourceUrl)
    .map((s) => {
      const blob = `${s.title || ''} ${s.url || ''} ${s.category || ''}`.toLowerCase();
      let score = 0;
      if (hay.includes('988') || hay.includes('crisis')) score += /988/.test(blob) ? 5 : 0;
      if (/shelter|homeless|housing|211/.test(hay)) score += /211|toronto|homeless/.test(blob) ? 5 : 0;
      if (/detox|addiction|substance|recovery|treatment/.test(hay)) score += /connex|samhsa|helpline|camh/.test(blob) ? 5 : 0;
      if (/caregiver|boundary|burnout|sleep|guilt|respite|identity/.test(hay)) score += /ontariocaregiver|nami|caregiver/.test(blob) ? 4 : 0;
      if (/kid|child|youth|teen/.test(hay)) score += /kidshelpphone/.test(blob) ? 5 : 0;
      if (/mental|anxiety|depression|psych/.test(hay)) score += /mentalhealth|camh|wellness|canada\.ca|connex/.test(blob) ? 3 : 0;
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => `- ${x.s.title || x.s.url}: ${x.s.url}`);
}

function buildUserPrompt(topic) {
  const sourceUrl = String(topic.source_url || topic.url || '').trim();
  const sourceName = String(topic.source_name || '').trim();
  const related = relatedResourceHints(topic);
  let sourceBlock;
  if (sourceUrl) {
    sourceBlock = `Primary resource used for this post (must be hyperlinked in the body AND listed under Further reading):
URL: ${sourceUrl}${sourceName ? `\nName: ${sourceName}` : ''}
Do NOT copy the article. Use it only as inspiration / citation.`;
  } else {
    sourceBlock = `No primary inspiration URL was provided. Still hyperlink every allowlisted resource you rely on.`;
  }

  const relatedBlock = related.length
    ? `\nAdditional allowlisted resources you may cite (if you use one, hyperlink it):\n${related.join('\n')}`
    : '';

  return `Write one blog post.

Title: ${topic.title}
Category: ${topic.category || 'Caregiving'}
Risk tier: ${topic.risk || 'safe'}
Angle: ${topic.angle || 'Practical caregiver support'}

${sourceBlock}
${relatedBlock}

Structure & linking requirements:
1. Start the body with one summary paragraph (what the post is about and what practical info it gives) before any ## headings.
2. Include natural inline Markdown links to resources you use while writing.
3. Close in this exact order: (a) a gentle next-step paragraph inviting https://liamscall.com/ chat, (b) a "Sources referenced:" line linking the seed site(s) used, (c) "## Further reading" listing Markdown links for every resource URL used (at least the primary resource when provided).
4. Never invent URLs.

Return ONLY valid JSON (no markdown fences) with keys:
{
  "title": "string",
  "description": "meta description under 160 chars",
  "slug": "kebab-case-slug",
  "body": "markdown body without the H1 title"
}`;
}

async function callGemini(userPrompt) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY. Add it to the server .env (or Render env), then try again.');
  const model = getModel();
  const body = {
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 4096,
    ...( /gemini-2\.5|gemini-3/i.test(model) ? { reasoning_effort: process.env.GEMINI_REASONING_EFFORT || 'none' } : {}),
  };
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Ensure opening summary + closing order: chat CTA → Sources referenced → Further reading.
 */
function ensureGeneratedBodyStructure(body, { sourceUrl, sourceName }) {
  let next = String(body || '').trim();
  const label = sourceName || 'Primary resource';

  // Opening: if body starts with a heading, prepend a short summary stub.
  const firstContentLine = next.split('\n').find((l) => l.trim()) || '';
  if (/^##\s+/.test(firstContentLine)) {
    console.warn('Generated body missing opening summary paragraph; prepending stub.');
    next = `This guide walks through practical next steps for this situation and points you to verified support options.\n\n${next}`;
  }

  let furtherBlock = '';
  const furtherMatch = next.match(/\n##\s*(Further reading|Resources)\s*\n[\s\S]*$/i);
  if (furtherMatch) {
    furtherBlock = furtherMatch[0].trim();
    next = next.slice(0, furtherMatch.index).trim();
  }

  const hasChatCta =
    /liamscall\.com\/?(?:["'\s)]|$)/i.test(next) ||
    /\[talk with liam'?s call/i.test(next);
  const hasSourcesLine = /sources referenced/i.test(next);
  const hasFurther = Boolean(furtherBlock) || /##\s*(further reading|resources)\b/i.test(next);
  const hasSourceUrl = sourceUrl ? next.includes(sourceUrl) || (furtherBlock && furtherBlock.includes(sourceUrl)) : true;

  const closingParts = [];

  if (!hasChatCta) {
    closingParts.push(
      `If you want to keep going privately, you can [talk with Liam's Call AI](https://liamscall.com/) — free, no account required.`,
    );
  }

  if (sourceUrl && (!hasSourcesLine || !next.includes(sourceUrl))) {
    console.warn(`Generated body missing Sources referenced for ${sourceUrl}; appending.`);
    closingParts.push(`Sources referenced: [${label}](${sourceUrl}).`);
  }

  if (closingParts.length) {
    next = `${next}\n\n${closingParts.join('\n\n')}`;
  }

  if (furtherBlock) {
    next = `${next}\n\n${furtherBlock}`;
  } else if (sourceUrl && (!hasFurther || !hasSourceUrl)) {
    console.warn(`Generated body missing Further reading for ${sourceUrl}; appending.`);
    next = `${next}\n\n## Further reading\n\n- [${label}](${sourceUrl})`;
  }

  return `${next.trim()}\n`;
}

function extractJson(text) {
  const trimmed = String(text || '').trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw);
}

function writeMarkdown({ title, description, slug, category, risk, body, date, image, region, sourceUrl }) {
  const lines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `slug: ${slug}`,
    `date: ${date}`,
    `category: ${JSON.stringify(category)}`,
    `region: ${JSON.stringify(region || 'Canada')}`,
    `description: ${JSON.stringify(description)}`,
    `risk: ${risk}`,
  ];
  if (sourceUrl) lines.push(`source_url: ${JSON.stringify(sourceUrl)}`);
  if (image) lines.push(`image: ${JSON.stringify(image)}`);
  lines.push('---', '', body.trim(), '');
  return lines.join('\n');
}

/**
 * Generate a post from a topic id (or the next unused topic if omitted).
 *
 * Generated posts always land in drafts for human review. Risk-based
 * auto-publishing only happens when a caller passes allowAutoPublish.
 * @param {{ topicId?: string|null, dryRun?: boolean, forceDraft?: boolean, allowAutoPublish?: boolean }} opts
 * @returns {Promise<{ mode: string, risk: string, topicId: string, slug: string, path: string, title: string }>}
 */
async function generateTopic(opts = {}) {
  const topicId = opts.topicId || null;
  const dryRun = Boolean(opts.dryRun);
  const forceDraft = Boolean(opts.forceDraft) || !opts.allowAutoPublish;

  const topics = loadTopics();
  const topic = pickTopic(topics, topicId);
  const declaredRisk = String(topic.risk || 'review').toLowerCase() === 'safe' ? 'safe' : 'review';
  const risk = forceDraft ? 'review' : declaredRisk;

  const resolved = resolveSourceForTopic(topic);
  if (resolved.source_url && !topic.source_url) {
    topic.source_url = resolved.source_url;
    topic.source_name = topic.source_name || resolved.source_name;
    // Persist so the desk queue keeps the seed link after generate.
    const idx = topics.findIndex((t) => t.id === topic.id);
    if (idx >= 0) {
      topics[idx] = { ...topics[idx], source_url: topic.source_url, source_name: topic.source_name };
      saveTopics(topics);
    }
  }

  const model = getModel();
  const content = await callGemini(buildUserPrompt(topic));
  const parsed = extractJson(content);

  const title = parsed.title || topic.title;
  const slug = toSlug(parsed.slug || title);
  const description = parsed.description || title;
  let body = parsed.body;
  if (!body || body.length < 200) throw new Error('Generated body too short.');

  const sourceUrl = String(topic.source_url || topic.url || resolved.source_url || '').trim();
  let image = '';
  try {
    const result = await ensurePostImage({
      slug,
      category: topic.category || 'Caregiving',
      title,
      angle: topic.angle || '',
      description,
      sourceUrl,
    });
    image = result.path;
  } catch (err) {
    console.warn(`Image attach skipped: ${err.message || err}`);
  }

  body = ensureGeneratedBodyStructure(body, {
    sourceUrl,
    sourceName: String(topic.source_name || '').trim(),
  });

  const md = writeMarkdown({
    title,
    description,
    slug,
    category: topic.category || 'Caregiving',
    risk,
    body,
    date: todayIso(),
    image,
    sourceUrl,
  });

  const tmpPath = path.join(DRAFTS_DIR, `_tmp-${slug}.md`);
  ensureDir(DRAFTS_DIR);
  fs.writeFileSync(tmpPath, md);
  try {
    const post = loadPost(tmpPath);
    // Hold every draft to the same phone/URL standard the build enforces at
    // publish time, so a reviewer never gets a post that cannot ship.
    assertPostGuards(post, {
      strictSafe: true,
      allowUrls: sourceUrl ? [sourceUrl] : [],
    });
  } finally {
    fs.unlinkSync(tmpPath);
  }

  if (dryRun) {
    return {
      mode: 'dry-run',
      risk,
      topicId: topic.id,
      slug,
      path: '',
      title,
      model,
      preview: md.slice(0, 500),
    };
  }

  let outPath;
  let mode;
  if (risk === 'review') {
    outPath = path.join(DRAFTS_DIR, `${slug}.md`);
    mode = 'draft';
  } else {
    outPath = path.join(CONTENT_DIR, `${slug}.md`);
    mode = 'published';
  }

  if (fs.existsSync(outPath)) {
    throw new Error(`Refusing to overwrite existing file: ${path.relative(ROOT, outPath).replace(/\\/g, '/')}`);
  }

  fs.writeFileSync(outPath, md);
  markTopicUsed(topic.id);

  const summary = {
    mode,
    risk,
    topicId: topic.id,
    slug,
    title,
    model,
    path: path.relative(ROOT, outPath).replace(/\\/g, '/'),
  };
  fs.writeFileSync(path.join(ROOT, '.blog-generate-result.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

module.exports = {
  generateTopic,
  pickTopic,
  getModel,
  getApiKey,
};
