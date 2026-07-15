#!/usr/bin/env node
'use strict';

/**
 * Generate a blog post from content/blog/topics.yaml via Gemini.
 *
 * Usage:
 *   node scripts/blog-generate.js
 *   node scripts/blog-generate.js --topic=saying-no-without-exploding
 *   node scripts/blog-generate.js --dry-run
 *
 * Env:
 *   GEMINI_API_KEY (required)
 *   GEMINI_MODEL (optional, default gemini-2.0-flash)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const {
  CONTENT_DIR,
  DRAFTS_DIR,
  ensureDir,
  toSlug,
  loadTopics,
  markTopicUsed,
  assertPostGuards,
  loadPost,
} = require('./lib/blog-utils');

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM = `You write calm, practical blog posts for Liam's Call (liamscall.com) — a free AI chat for caregivers and families facing mental health, addiction, and housing challenges in Canada and the U.S.

HARD RULES:
- Never invent phone numbers or local shelter/clinic contact details.
- Only link to these hosts if you include a URL: ontariocaregiver.ca, connexontario.ca, 988.ca, 988lifeline.org, 211.ca, 211.org, toronto.ca, samhsa.gov, kidshelpphone.ca, liamscall.com
- Allowed phone/short codes only if relevant: 988, 911, 211, 311, 811, Ontario Caregiver Organization 1-833-227-3778, ConnexOntario 1-866-531-2600, Kids Help Phone 1-800-668-6868, Hope for Wellness 1-855-242-3310, SAMHSA 1-800-662-4357
- Never diagnose, recommend medications, or give dosing advice.
- Never use exclamation points.
- Write 500–800 words in Markdown paragraphs (optional ## headings). No # title in the body (title is separate).
- Tone: steady, kind friend; no performative AI warmth; no cheerleading.
- End with one gentle practical next step, not a hard sell.`;

function parseArgs(argv) {
  const out = { topic: null, dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--topic=')) out.topic = a.slice('--topic='.length);
  }
  return out;
}

function pickTopic(topics, forcedId) {
  if (forcedId) {
    const t = topics.find((x) => x.id === forcedId);
    if (!t) throw new Error(`Topic not found: ${forcedId}`);
    return t;
  }
  const unused = topics.filter((t) => !t.used);
  if (!unused.length) throw new Error('No unused topics left in topics.yaml');
  // Prefer safe topics for automation, but still allow review if only review remain.
  const safe = unused.filter((t) => t.risk !== 'review');
  const pool = safe.length ? safe : unused;
  return pool[0];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function buildUserPrompt(topic) {
  return `Write one blog post.

Title: ${topic.title}
Category: ${topic.category || 'Caregiving'}
Risk tier: ${topic.risk || 'safe'}
Angle: ${topic.angle || 'Practical caregiver support'}

Return ONLY valid JSON (no markdown fences) with keys:
{
  "title": "string",
  "description": "meta description under 160 chars",
  "slug": "kebab-case-slug",
  "body": "markdown body without the H1 title"
}`;
}

async function callGemini(userPrompt) {
  if (!API_KEY) throw new Error('Missing GEMINI_API_KEY');
  const url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4096,
      ...( /gemini-2\.5|gemini-3/i.test(MODEL) ? { reasoning_effort: 'none' } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini error ${res.status}: ${text.slice(0, 400)}`);
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

function writeMarkdown({ title, description, slug, category, risk, body, date }) {
  return `---
title: ${JSON.stringify(title)}
slug: ${slug}
date: ${date}
category: ${JSON.stringify(category)}
description: ${JSON.stringify(description)}
risk: ${risk}
---

${body.trim()}
`;
}

async function main() {
  const args = parseArgs(process.argv);
  const topics = loadTopics();
  const topic = pickTopic(topics, args.topic);
  const risk = (topic.risk || 'safe').toLowerCase();

  console.log(`Generating topic=${topic.id} risk=${risk} model=${MODEL}`);
  const content = await callGemini(buildUserPrompt(topic));
  const parsed = extractJson(content);

  const title = parsed.title || topic.title;
  const slug = toSlug(parsed.slug || title);
  const description = parsed.description || title;
  const body = parsed.body;
  if (!body || body.length < 200) throw new Error('Generated body too short.');

  const md = writeMarkdown({
    title,
    description,
    slug,
    category: topic.category || 'Caregiving',
    risk,
    body,
    date: todayIso(),
  });

  // Validate via temp parse
  const tmpPath = path.join(DRAFTS_DIR, `_tmp-${slug}.md`);
  ensureDir(DRAFTS_DIR);
  fs.writeFileSync(tmpPath, md);
  try {
    const post = loadPost(tmpPath);
    assertPostGuards(post, { strictSafe: risk === 'safe' });
  } finally {
    fs.unlinkSync(tmpPath);
  }

  if (args.dryRun) {
    console.log('--- DRY RUN ---');
    console.log(md.slice(0, 500));
    console.log('...');
    return;
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
    throw new Error(`Refusing to overwrite existing file: ${outPath}`);
  }

  fs.writeFileSync(outPath, md);
  markTopicUsed(topic.id);

  // Machine-readable summary for CI
  const summary = {
    mode,
    risk,
    topicId: topic.id,
    slug,
    path: path.relative(path.join(__dirname, '..'), outPath).replace(/\\/g, '/'),
  };
  fs.writeFileSync(path.join(__dirname, '..', '.blog-generate-result.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
