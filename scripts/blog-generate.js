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
 *   BLOG_GEMINI_MODEL (optional, default gemini-3.6-flash)
 *   GEMINI_MODEL (optional fallback)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { generateTopic, getModel } = require('./lib/blog-generate-core');
const { loadTopics } = require('./lib/blog-utils');

function parseArgs(argv) {
  const out = { topic: null, dryRun: false };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--topic=')) out.topic = a.slice('--topic='.length);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const topics = loadTopics();
  const topicHint = args.topic || '(next unused)';
  console.log(`Generating topic=${topicHint} model=${getModel()}`);
  if (args.topic) {
    const found = topics.find((t) => t.id === args.topic);
    if (found) console.log(`risk=${(found.risk || 'safe').toLowerCase()}`);
  }

  const summary = await generateTopic({
    topicId: args.topic,
    dryRun: args.dryRun,
  });

  if (summary.mode === 'dry-run') {
    console.log('--- DRY RUN ---');
    console.log(summary.preview || '');
    console.log('...');
    return;
  }

  console.log(JSON.stringify(summary));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
