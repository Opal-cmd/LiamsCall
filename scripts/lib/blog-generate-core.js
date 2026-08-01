'use strict';

/**
 * Shared OpenAI blog generation used by CLI and Blog desk admin.
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
} = require('./blog-utils');
const { ensurePostImage } = require('./blog-images');

const SYSTEM = `You write calm, practical blog posts for Liam's Call (liamscall.com) — a free AI chat for caregivers and families facing mental health, addiction, and housing challenges in Canada and the U.S.

HARD RULES:
- Never invent phone numbers or local shelter/clinic contact details.
- Only link to these hosts if you include a URL: ontariocaregiver.ca, connexontario.ca, 988.ca, 988lifeline.org, 211.ca, 211ontario.ca, 211.org, toronto.ca, samhsa.gov, kidshelpphone.ca, mentalhealthcommission.ca, nami.org, camh.ca, hopeforwellness.ca, canada.ca, wellnesstogether.ca, liamscall.com — PLUS the inspiration source URL provided in the user message.
- Every post MUST include at least one Markdown hyperlink to the exact inspiration source URL from the user message (natural inline citation and a short "Further reading" line near the end). Do not invent other URLs. Do not copy or closely paraphrase the source article.
- Allowed phone/short codes only if relevant: 988, 911, 211, 311, 811, Ontario Caregiver Organization 1-833-227-3778, ConnexOntario 1-866-531-2600, Kids Help Phone 1-800-668-6868, Hope for Wellness 1-855-242-3310, SAMHSA 1-800-662-4357
- Never diagnose, recommend medications, or give dosing advice.
- Never use exclamation points.
- Write 500–800 words in Markdown paragraphs (optional ## headings). No # title in the body (title is separate).
- Tone: steady, kind friend; no performative AI warmth; no cheerleading.
- End with one gentle practical next step, not a hard sell.`;

function getModel() {
  return process.env.OPENAI_MODEL || 'gpt-4o-mini';
}

function getApiKey() {
  return process.env.OPENAI_API_KEY || '';
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

function buildUserPrompt(topic) {
  const sourceUrl = String(topic.source_url || topic.url || '').trim();
  const sourceName = String(topic.source_name || '').trim();
  let sourceBlock;
  if (sourceUrl) {
    sourceBlock = `Inspiration source (link to this; do NOT copy the article):
URL: ${sourceUrl}${sourceName ? `\nName: ${sourceName}` : ''}
Requirement: the body MUST include (1) one natural inline Markdown link to this exact URL and (2) a short final line like [Further reading](${sourceUrl}).`;
  } else {
    sourceBlock = `No inspiration source URL was provided. Still include at least one Markdown hyperlink to an allowlisted host that fits the topic (e.g. ontariocaregiver.ca, 211.ca, 988.ca).`;
  }

  return `Write one blog post.

Title: ${topic.title}
Category: ${topic.category || 'Caregiving'}
Risk tier: ${topic.risk || 'safe'}
Angle: ${topic.angle || 'Practical caregiver support'}

${sourceBlock}

Return ONLY valid JSON (no markdown fences) with keys:
{
  "title": "string",
  "description": "meta description under 160 chars",
  "slug": "kebab-case-slug",
  "body": "markdown body without the H1 title"
}`;
}

async function callOpenAI(userPrompt) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY. Add it to the server .env (or Render env), then try again.');
  const model = getModel();
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
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
 * @param {{ topicId?: string|null, dryRun?: boolean, forceDraft?: boolean }} opts
 * @returns {Promise<{ mode: string, risk: string, topicId: string, slug: string, path: string, title: string }>}
 */
async function generateTopic(opts = {}) {
  const topicId = opts.topicId || null;
  const dryRun = Boolean(opts.dryRun);
  const forceDraft = Boolean(opts.forceDraft);

  const topics = loadTopics();
  const topic = pickTopic(topics, topicId);
  let risk = (topic.risk || 'safe').toLowerCase();
  if (forceDraft) risk = 'review';

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
  const content = await callOpenAI(buildUserPrompt(topic));
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

  if (sourceUrl && !body.includes(sourceUrl)) {
    console.warn(`Generated body missing source hyperlink for ${sourceUrl}; appending Further reading.`);
    body = `${body.trim()}\n\n[Further reading](${sourceUrl})\n`;
  }

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
    assertPostGuards(post, {
      strictSafe: risk === 'safe',
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
