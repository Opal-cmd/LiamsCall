'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { ROOT } = require('./blog-utils');
const { syncFilesToGit } = require('./blog-git-backup');

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

test('syncFilesToGit writes upserts and deletes in one atomic git commit', async () => {
  const rel = 'content/blog/tmp-atomic-backup-test.md';
  const removeRel = 'public/blog/tmp-removed-post/index.html';
  const abs = path.join(ROOT, rel);
  const oldFetch = global.fetch;
  const oldEnv = {
    BLOG_GIT_TOKEN: process.env.BLOG_GIT_TOKEN,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    BLOG_GIT_REPO: process.env.BLOG_GIT_REPO,
    GITHUB_REPOSITORY: process.env.GITHUB_REPOSITORY,
    BLOG_GIT_BRANCH: process.env.BLOG_GIT_BRANCH,
  };
  const calls = [];

  fs.writeFileSync(abs, 'temporary backup content\n', 'utf8');
  process.env.BLOG_GIT_TOKEN = 'test-token';
  delete process.env.GITHUB_TOKEN;
  process.env.BLOG_GIT_REPO = 'Opal-cmd/LiamsCall';
  delete process.env.GITHUB_REPOSITORY;
  process.env.BLOG_GIT_BRANCH = 'main';

  global.fetch = async (url, options = {}) => {
    const parsed = new URL(String(url));
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ method, pathname: parsed.pathname, body });

    if (method === 'GET' && parsed.pathname.endsWith(`/contents/${removeRel}`)) {
      return jsonResponse(200, { type: 'file', sha: 'old-file-sha' });
    }
    if (method === 'GET' && parsed.pathname.endsWith('/git/ref/heads/main')) {
      return jsonResponse(200, { object: { sha: 'base-commit-sha' } });
    }
    if (method === 'GET' && parsed.pathname.endsWith('/git/commits/base-commit-sha')) {
      return jsonResponse(200, { tree: { sha: 'base-tree-sha' } });
    }
    if (method === 'POST' && parsed.pathname.endsWith('/git/blobs')) {
      assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), 'temporary backup content\n');
      assert.equal(body.encoding, 'base64');
      return jsonResponse(201, { sha: 'new-blob-sha' });
    }
    if (method === 'POST' && parsed.pathname.endsWith('/git/trees')) {
      assert.equal(body.base_tree, 'base-tree-sha');
      assert.deepEqual(body.tree, [
        { path: rel, mode: '100644', type: 'blob', sha: 'new-blob-sha' },
        { path: removeRel, mode: '100644', type: 'blob', sha: null },
      ]);
      return jsonResponse(201, { sha: 'next-tree-sha' });
    }
    if (method === 'POST' && parsed.pathname.endsWith('/git/commits')) {
      assert.equal(body.message, 'Atomic backup test');
      assert.equal(body.tree, 'next-tree-sha');
      assert.deepEqual(body.parents, ['base-commit-sha']);
      return jsonResponse(201, {
        sha: 'new-commit-sha',
        html_url: 'https://github.com/Opal-cmd/LiamsCall/commit/new-commit-sha',
      });
    }
    if (method === 'PATCH' && parsed.pathname.endsWith('/git/refs/heads/main')) {
      assert.equal(body.sha, 'new-commit-sha');
      assert.equal(body.force, false);
      return jsonResponse(200, {});
    }
    throw new Error(`Unexpected GitHub request: ${method} ${parsed.pathname}`);
  };

  try {
    const result = await syncFilesToGit({
      upsert: [rel],
      remove: [removeRel],
      message: 'Atomic backup test',
    });

    assert.equal(result.ok, true);
    assert.equal(result.commitUrl, 'https://github.com/Opal-cmd/LiamsCall/commit/new-commit-sha');
    assert.deepEqual(
      result.files.map((file) => [file.path, file.action, file.ok, file.commitUrl]),
      [
        [rel, 'upsert', true, 'https://github.com/Opal-cmd/LiamsCall/commit/new-commit-sha'],
        [removeRel, 'delete', true, 'https://github.com/Opal-cmd/LiamsCall/commit/new-commit-sha'],
      ],
    );
    assert.equal(calls.some((call) => call.method === 'PUT' && call.pathname.includes('/contents/')), false);
    assert.equal(calls.some((call) => call.method === 'DELETE' && call.pathname.includes('/contents/')), false);
  } finally {
    global.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(abs, { force: true });
  }
});
