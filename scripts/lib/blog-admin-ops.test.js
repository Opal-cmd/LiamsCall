'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { approveDraft } = require('./blog-admin-ops');
const { CONTENT_DIR, DRAFTS_DIR } = require('./blog-utils');

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

test('approveDraft rejects unsafe reviewed drafts before moving files', async () => {
  const slug = 'tmp-approval-guard-test';
  const draftPath = path.join(DRAFTS_DIR, `${slug}.md`);
  const publishedPath = path.join(CONTENT_DIR, `${slug}.md`);
  const markdown = `---
title: "Temporary approval guard test"
slug: ${slug}
date: 2026-07-30
category: "Care Giver Tips"
region: "Canada"
description: "Temporary approval guard test"
risk: review
image: "/assets/blog/the-5-minute-reset.jpg"
---

This reviewed draft links to [an unverified resource](https://example.com/help) that cannot become a safe public post.
`;

  removeIfExists(draftPath);
  removeIfExists(publishedPath);
  fs.writeFileSync(draftPath, markdown, 'utf8');

  try {
    await assert.rejects(() => approveDraft(slug), /Disallowed URL\(s\)/);
    assert.equal(fs.existsSync(draftPath), true);
    assert.equal(fs.existsSync(publishedPath), false);
  } finally {
    removeIfExists(draftPath);
    removeIfExists(publishedPath);
  }
});
