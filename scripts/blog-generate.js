#!/usr/bin/env node
'use strict';

/**
 * Generate a blog post from content/blog/topics.yaml via Gemini.
 *
 * Posts are written to content/blog/drafts for human review. Pass
 * --allow-auto-publish to let safe-tier topics go straight to the live blog.
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

const path = require('path');
const { spawnSync } = require('child_process');
const { generateTopic, getModel } = require('./lib/blog-generate-core');
const { ROOT, loadTopics } = require('./lib/blog-utils');

function rebuildPublishedBlog() {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'blog-build.js')], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error('Post was created, but the blog metadata rebuild failed.');
  }
}

function parseArgs(argv) {
  const out = { topic: null, dryRun: false, allowAutoPublish: false };
  for (const a of argv.slice(2)) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--allow-auto-publish') out.allowAutoPublish = true;
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
    allowAutoPublish: args.allowAutoPublish,
  });

  if (summary.mode === 'dry-run') {
    console.log('--- DRY RUN ---');
    console.log(summary.preview || '');
    console.log('...');
    return;
  }

  // Publishing is one operation: render the post and refresh its JSON-LD,
  // blog indexes, sitemap.xml/html, site-identity.json, and brand.json.
  if (summary.mode === 'published') rebuildPublishedBlog();

  console.log(JSON.stringify(summary));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
