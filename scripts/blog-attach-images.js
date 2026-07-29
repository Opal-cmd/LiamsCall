#!/usr/bin/env node
'use strict';

/**
 * Attach hero images to published (and optional draft) blog posts.
 *
 *   node scripts/blog-attach-images.js
 *   node scripts/blog-attach-images.js --force
 *   node scripts/blog-attach-images.js --drafts
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const {
  CONTENT_DIR,
  DRAFTS_DIR,
  listMarkdownFiles,
  loadPost,
  loadTopics,
} = require('./lib/blog-utils');
const { ensurePostImage, setFrontmatterImage } = require('./lib/blog-images');

function parseArgs(argv) {
  return {
    force: argv.includes('--force'),
    drafts: argv.includes('--drafts'),
  };
}

function sourceUrlForPost(post, topics) {
  const match = (topics || []).find(
    (t) =>
      toLoose(t.title) === toLoose(post.title) ||
      (t.id && toLoose(t.id) === toLoose(post.slug)),
  );
  return (match && (match.source_url || match.url)) || '';
}

function toLoose(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

async function attachFile(filePath, { force, topics }) {
  const post = loadPost(filePath);
  if (!force && post.image && post.image.startsWith('/assets/blog/')) {
    const disk = path.join(__dirname, '..', 'public', post.image.replace(/^\//, ''));
    if (fs.existsSync(disk)) {
      console.log(`skip ${post.slug} (already has image)`);
      return { slug: post.slug, image: post.image, skipped: true };
    }
  }

  const sourceUrl = sourceUrlForPost(post, topics);
  const image = await ensurePostImage({
    slug: post.slug,
    category: post.category,
    title: post.title,
    sourceUrl,
    force,
  });

  const raw = fs.readFileSync(filePath, 'utf8');
  const next = setFrontmatterImage(raw, image);
  fs.writeFileSync(filePath, next);
  console.log(`ok ${post.slug} → ${image}${sourceUrl ? ` (source tried)` : ' (stock)'}`);
  return { slug: post.slug, image, skipped: false };
}

async function main() {
  const args = parseArgs(process.argv);
  const topics = loadTopics();
  const files = [
    ...listMarkdownFiles(CONTENT_DIR),
    ...(args.drafts ? listMarkdownFiles(DRAFTS_DIR) : []),
  ];

  const results = [];
  for (const file of files) {
    try {
      results.push(await attachFile(file, { force: args.force, topics }));
    } catch (err) {
      console.error(`fail ${path.basename(file)}: ${err.message || err}`);
    }
  }

  const attached = results.filter((r) => r && !r.skipped).length;
  console.log(`Done. Attached/refreshed ${attached} of ${files.length} posts.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
