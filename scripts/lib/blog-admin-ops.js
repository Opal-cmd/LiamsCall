'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  ROOT,
  CONTENT_DIR,
  DRAFTS_DIR,
  loadPost,
  listMarkdownFiles,
  loadPublishedPosts,
  assertPostGuards,
  toSlug,
  parseFrontmatter,
  markdownToHtml,
} = require('./blog-utils');

function rebuildBlog() {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'blog-build.js')], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || 'Blog rebuild failed').toString().trim();
    throw new Error(err.slice(0, 500));
  }
  return (result.stdout || '').toString().trim();
}

function listDrafts() {
  return listMarkdownFiles(DRAFTS_DIR)
    .map((filePath) => {
      const post = loadPost(filePath);
      return {
        slug: post.slug,
        title: post.title,
        date: post.date,
        category: post.category,
        description: post.description,
        risk: post.risk,
        status: 'draft',
      };
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function listPublished() {
  return loadPublishedPosts().map((post) => ({
    slug: post.slug,
    title: post.title,
    date: post.date,
    category: post.category,
    description: post.description,
    risk: post.risk,
    status: 'published',
    url: `/blog/${post.slug}`,
  }));
}

function draftPathFor(slug) {
  const safe = toSlug(slug);
  const file = path.join(DRAFTS_DIR, `${safe}.md`);
  if (!fs.existsSync(file)) throw new Error('Draft not found.');
  return file;
}

function publishedPathFor(slug) {
  const safe = toSlug(slug);
  return path.join(CONTENT_DIR, `${safe}.md`);
}

function getDraft(slug) {
  const filePath = draftPathFor(slug);
  const raw = fs.readFileSync(filePath, 'utf8');
  const post = loadPost(filePath);
  return {
    slug: post.slug,
    title: post.title,
    date: post.date,
    category: post.category,
    description: post.description,
    risk: post.risk,
    body: post.body,
    raw,
    html: post.html,
    status: 'draft',
  };
}

function writeMarkdown({ title, slug, date, category, description, risk, body }) {
  return `---
title: ${JSON.stringify(title)}
slug: ${toSlug(slug || title)}
date: ${date || new Date().toISOString().slice(0, 10)}
category: ${JSON.stringify(category || 'Caregiving')}
description: ${JSON.stringify(description || '')}
risk: ${(risk || 'review').toLowerCase()}
---

${String(body || '').trim()}
`;
}

function saveDraft(slug, updates = {}) {
  const filePath = draftPathFor(slug);
  const current = loadPost(filePath);
  const nextSlug = toSlug(updates.slug || current.slug);
  const md = writeMarkdown({
    title: updates.title ?? current.title,
    slug: nextSlug,
    date: updates.date ?? current.date,
    category: updates.category ?? current.category,
    description: updates.description ?? current.description,
    risk: updates.risk ?? current.risk ?? 'review',
    body: updates.body ?? current.body,
  });

  // Soft validate
  const tmpMeta = parseFrontmatter(md);
  assertPostGuards(
    {
      slug: nextSlug,
      title: tmpMeta.meta.title || nextSlug,
      body: tmpMeta.body,
      risk: (tmpMeta.meta.risk || 'review').toLowerCase(),
    },
    { strictSafe: false },
  );

  const dest = path.join(DRAFTS_DIR, `${nextSlug}.md`);
  fs.writeFileSync(dest, md, 'utf8');
  if (dest !== filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return getDraft(nextSlug);
}

function deleteDraft(slug) {
  const filePath = draftPathFor(slug);
  fs.unlinkSync(filePath);
  return { ok: true, slug: toSlug(slug) };
}

function approveDraft(slug) {
  const filePath = draftPathFor(slug);
  const post = loadPost(filePath);
  assertPostGuards(post, { strictSafe: false });

  const dest = publishedPathFor(post.slug);
  if (fs.existsSync(dest)) {
    throw new Error('A live post with this name already exists. Rename the draft first.');
  }

  let raw = fs.readFileSync(filePath, 'utf8');
  if (/^risk:\s*/m.test(raw)) raw = raw.replace(/^risk:\s*.*$/m, 'risk: safe');
  else raw = raw.replace(/^---\n/, '---\nrisk: safe\n');

  fs.writeFileSync(dest, raw, 'utf8');
  fs.unlinkSync(filePath);

  const buildLog = rebuildBlog();
  return {
    ok: true,
    slug: post.slug,
    url: `/blog/${post.slug}`,
    buildLog,
  };
}

function unpublish(slug) {
  const pub = publishedPathFor(slug);
  if (!fs.existsSync(pub)) throw new Error('Live post not found.');
  const post = loadPost(pub);
  fs.mkdirSync(DRAFTS_DIR, { recursive: true });
  const draft = path.join(DRAFTS_DIR, `${post.slug}.md`);
  if (fs.existsSync(draft)) throw new Error('A draft with this name already exists.');

  let raw = fs.readFileSync(pub, 'utf8');
  if (/^risk:\s*/m.test(raw)) raw = raw.replace(/^risk:\s*.*$/m, 'risk: review');
  else raw = raw.replace(/^---\n/, '---\nrisk: review\n');

  fs.writeFileSync(draft, raw, 'utf8');
  fs.unlinkSync(pub);
  const buildLog = rebuildBlog();
  return { ok: true, slug: post.slug, buildLog };
}

function previewMarkdown(rawOrParts) {
  let body = '';
  let title = 'Preview';
  if (typeof rawOrParts === 'string' && rawOrParts.trim().startsWith('---')) {
    const parsed = parseFrontmatter(rawOrParts);
    title = parsed.meta.title || title;
    body = parsed.body;
  } else if (rawOrParts && typeof rawOrParts === 'object') {
    title = rawOrParts.title || title;
    body = rawOrParts.body || '';
  } else {
    body = String(rawOrParts || '');
  }
  return { title, html: markdownToHtml(body) };
}

module.exports = {
  listDrafts,
  listPublished,
  getDraft,
  saveDraft,
  deleteDraft,
  approveDraft,
  unpublish,
  rebuildBlog,
  previewMarkdown,
};
