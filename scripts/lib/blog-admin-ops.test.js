'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { saveDraft } = require('./blog-admin-ops');
const { DRAFTS_DIR, ensureDir } = require('./blog-utils');

function draftMarkdown({ title, slug, body }) {
  return [
    '---',
    `title: ${JSON.stringify(title)}`,
    `slug: ${slug}`,
    'date: 2026-08-02',
    'category: "Care Giver Tips"',
    'region: "Canada"',
    `description: ${JSON.stringify(`${title} description`)}`,
    'risk: review',
    `image: ${JSON.stringify(`/assets/blog/${slug}.jpg`)}`,
    '---',
    '',
    body,
    '',
  ].join('\n');
}

test('saveDraft refuses to overwrite an existing draft when renaming', async () => {
  ensureDir(DRAFTS_DIR);
  const originalSlug = 'tmp-save-draft-original';
  const existingSlug = 'tmp-save-draft-existing';
  const originalPath = path.join(DRAFTS_DIR, `${originalSlug}.md`);
  const existingPath = path.join(DRAFTS_DIR, `${existingSlug}.md`);
  const original = draftMarkdown({
    title: 'Temporary Original Draft',
    slug: originalSlug,
    body: 'Original draft body that should survive the failed rename.',
  });
  const existing = draftMarkdown({
    title: 'Temporary Existing Draft',
    slug: existingSlug,
    body: 'Existing draft body that must not be overwritten.',
  });

  fs.rmSync(originalPath, { force: true });
  fs.rmSync(existingPath, { force: true });
  fs.writeFileSync(originalPath, original, 'utf8');
  fs.writeFileSync(existingPath, existing, 'utf8');

  try {
    await assert.rejects(
      saveDraft(originalSlug, {
        slug: existingSlug,
        title: 'Renamed Draft',
        body: 'This body must not replace the existing draft.',
        image: `/assets/blog/${originalSlug}.jpg`,
      }),
      /draft with this name already exists/i,
    );
    assert.equal(fs.readFileSync(originalPath, 'utf8'), original);
    assert.equal(fs.readFileSync(existingPath, 'utf8'), existing);
  } finally {
    fs.rmSync(originalPath, { force: true });
    fs.rmSync(existingPath, { force: true });
  }
});
