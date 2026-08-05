'use strict';

/**
 * Persist Blog desk changes to GitHub so Render redeploys do not wipe
 * seeds, topics, drafts, or published posts that only lived on disk.
 *
 * Env:
 *   BLOG_GIT_TOKEN or GITHUB_TOKEN  — PAT with Contents: Read and Write
 *   BLOG_GIT_REPO or GITHUB_REPOSITORY — "owner/repo" (e.g. Opal-cmd/LiamsCall)
 *   BLOG_GIT_BRANCH — default "main"
 */

const fs = require('fs');
const path = require('path');
const { ROOT, toSlug } = require('./blog-utils');

const API = 'https://api.github.com';

function gitToken() {
  return String(process.env.BLOG_GIT_TOKEN || process.env.GITHUB_TOKEN || '').trim();
}

function gitRepo() {
  return String(process.env.BLOG_GIT_REPO || process.env.GITHUB_REPOSITORY || '').trim();
}

function gitBranch() {
  return String(process.env.BLOG_GIT_BRANCH || 'main').trim() || 'main';
}

function backupConfigured() {
  return Boolean(gitToken() && gitRepo());
}

function backupStatus() {
  return {
    configured: backupConfigured(),
    repo: gitRepo() || null,
    branch: gitBranch(),
  };
}

function notConfiguredResult() {
  return {
    ok: false,
    skipped: true,
    reason:
      'Git backup is not configured. Set BLOG_GIT_TOKEN and BLOG_GIT_REPO on the server so drafts and posts survive redeploys.',
  };
}

async function githubRequest(method, apiPath, body) {
  const token = gitToken();
  const res = await fetch(`${API}${apiPath}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'LiamsCall-BlogDesk-Backup',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const msg = data?.message || `GitHub ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function encodeRepoPath(repoPath) {
  return String(repoPath)
    .replace(/\\/g, '/')
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/');
}

async function getFileMeta(repoPath) {
  const repo = gitRepo();
  const branch = gitBranch();
  try {
    return await githubRequest(
      'GET',
      `/repos/${repo}/contents/${encodeRepoPath(repoPath)}?ref=${encodeURIComponent(branch)}`,
    );
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

function draftContentPath(slug) {
  return `content/blog/drafts/${toSlug(slug)}.md`;
}

function publishedContentPath(slug) {
  return `content/blog/${toSlug(slug)}.md`;
}

function publicPostPath(slug) {
  return `public/blog/${toSlug(slug)}/index.html`;
}

function postImagePath(slug) {
  const rel = `public/assets/blog/${toSlug(slug)}.jpg`;
  return fs.existsSync(path.join(ROOT, rel)) ? rel : null;
}

function siteMetaPaths() {
  return [
    'public/blog/index.html',
    'public/sitemap.xml',
    'public/sitemap.html',
    'public/site-identity.json',
    'public/.well-known/brand.json',
  ].filter((rel) => fs.existsSync(path.join(ROOT, rel)));
}

/** Record of which stock photo each post used — must survive redeploys. */
function imageManifestPaths() {
  const rel = 'content/blog/image-manifest.json';
  return fs.existsSync(path.join(ROOT, rel)) ? [rel] : [];
}

function existingPaths(rels) {
  return [...new Set((rels || []).map((p) => String(p).replace(/\\/g, '/')).filter(Boolean))].filter(
    (rel) => fs.existsSync(path.join(ROOT, rel)),
  );
}

async function putOneFile(rel, message) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    return { path: rel, ok: false, error: 'File missing on disk' };
  }
  const content = fs.readFileSync(abs);
  const b64 = content.toString('base64');
  const repo = gitRepo();
  const branch = gitBranch();
  const encoded = encodeRepoPath(rel);

  const tryPut = async (sha) =>
    githubRequest('PUT', `/repos/${repo}/contents/${encoded}`, {
      message,
      content: b64,
      branch,
      ...(sha ? { sha } : {}),
      committer: {
        name: 'liamscall-blog-bot',
        email: 'blog-bot@liamscall.com',
      },
    });

  try {
    const meta = await getFileMeta(rel);
    const data = await tryPut(meta && meta.type === 'file' ? meta.sha : undefined);
    return {
      path: rel,
      ok: true,
      action: 'upsert',
      commitUrl: data?.commit?.html_url || null,
    };
  } catch (err) {
    if (err.status === 409 || /sha/i.test(err.message || '')) {
      try {
        const fresh = await getFileMeta(rel);
        const data = await tryPut(fresh?.sha);
        return {
          path: rel,
          ok: true,
          action: 'upsert',
          commitUrl: data?.commit?.html_url || null,
        };
      } catch (retryErr) {
        return { path: rel, ok: false, action: 'upsert', error: retryErr.message || String(retryErr) };
      }
    }
    return { path: rel, ok: false, action: 'upsert', error: err.message || String(err) };
  }
}

async function deleteOneFile(rel, message) {
  const repo = gitRepo();
  const branch = gitBranch();
  const encoded = encodeRepoPath(rel);
  const meta = await getFileMeta(rel);
  if (!meta || meta.type !== 'file' || !meta.sha) {
    return { path: rel, ok: true, action: 'delete', skipped: true, reason: 'Not on GitHub' };
  }
  try {
    const data = await githubRequest('DELETE', `/repos/${repo}/contents/${encoded}`, {
      message,
      sha: meta.sha,
      branch,
      committer: {
        name: 'liamscall-blog-bot',
        email: 'blog-bot@liamscall.com',
      },
    });
    return {
      path: rel,
      ok: true,
      action: 'delete',
      commitUrl: data?.commit?.html_url || null,
    };
  } catch (err) {
    if (err.status === 404) {
      return { path: rel, ok: true, action: 'delete', skipped: true, reason: 'Already gone' };
    }
    return { path: rel, ok: false, action: 'delete', error: err.message || String(err) };
  }
}

/**
 * Upsert and/or delete repo-relative paths in GitHub.
 * @param {{ upsert?: string[], remove?: string[], message?: string }} opts
 */
async function syncFilesToGit(opts = {}) {
  if (!backupConfigured()) return notConfiguredResult();

  const upsert = existingPaths(opts.upsert || []);
  const remove = [...new Set((opts.remove || []).map((p) => String(p).replace(/\\/g, '/')).filter(Boolean))];
  const message = opts.message || 'Blog desk backup';

  if (!upsert.length && !remove.length) {
    return { ok: false, skipped: true, reason: 'No files to sync.' };
  }

  const results = [];
  for (const rel of upsert) {
    results.push(await putOneFile(rel, `${message}: update ${path.posix.basename(rel)}`));
  }
  for (const rel of remove) {
    // Don't delete a path we just upserted in the same sync.
    if (upsert.includes(rel)) continue;
    results.push(await deleteOneFile(rel, `${message}: remove ${path.posix.basename(rel)}`));
  }

  const failed = results.filter((r) => !r.ok);
  const okOnes = results.filter((r) => r.ok && !r.skipped);
  return {
    ok: failed.length === 0 && (okOnes.length > 0 || results.some((r) => r.skipped)),
    files: results,
    commitUrl: okOnes.find((r) => r.commitUrl)?.commitUrl || null,
    error: failed.length ? failed.map((f) => `${f.path}: ${f.error}`).join('; ') : undefined,
  };
}

async function backupFilesToGit(relativePaths, message) {
  return syncFilesToGit({ upsert: relativePaths, message });
}

async function backupSourcesYaml(reason = 'Blog desk saved seeds/sources') {
  return syncFilesToGit({ upsert: ['content/blog/sources.yaml'], message: reason });
}

async function backupTopicsYaml(reason = 'Blog desk saved topics') {
  return syncFilesToGit({ upsert: ['content/blog/topics.yaml'], message: reason });
}

async function backupDraft(slug, reason) {
  const safe = toSlug(slug);
  const upsert = [draftContentPath(safe), 'content/blog/topics.yaml', ...imageManifestPaths()];
  const img = postImagePath(safe);
  if (img) upsert.push(img);
  return syncFilesToGit({
    upsert,
    message: reason || `Blog desk draft: ${safe}`,
  });
}

async function backupApprovedPost(slug, reason) {
  const safe = toSlug(slug);
  const upsert = [
    publishedContentPath(safe),
    publicPostPath(safe),
    ...siteMetaPaths(),
    ...imageManifestPaths(),
    'content/blog/topics.yaml',
  ];
  const img = postImagePath(safe);
  if (img) upsert.push(img);
  return syncFilesToGit({
    upsert,
    remove: [draftContentPath(safe)],
    message: reason || `Blog desk publish: ${safe}`,
  });
}

async function backupUnpublishedPost(slug, reason) {
  const safe = toSlug(slug);
  const upsert = [draftContentPath(safe), ...siteMetaPaths()];
  return syncFilesToGit({
    upsert,
    remove: [publishedContentPath(safe), publicPostPath(safe)],
    message: reason || `Blog desk unpublish: ${safe}`,
  });
}

async function backupDeletedDraft(slug, reason) {
  const safe = toSlug(slug);
  return syncFilesToGit({
    remove: [draftContentPath(safe)],
    message: reason || `Blog desk delete draft: ${safe}`,
  });
}

async function backupDeletedPublished(slug, reason) {
  const safe = toSlug(slug);
  const remove = [publishedContentPath(safe), publicPostPath(safe)];
  const img = postImagePath(safe);
  // Keep image file if still on disk from another use; only remove if gone locally.
  if (!img) remove.push(`public/assets/blog/${safe}.jpg`);
  return syncFilesToGit({
    upsert: siteMetaPaths(),
    remove,
    message: reason || `Blog desk delete live post: ${safe}`,
  });
}

module.exports = {
  backupConfigured,
  backupStatus,
  backupFilesToGit,
  syncFilesToGit,
  backupSourcesYaml,
  backupTopicsYaml,
  backupDraft,
  backupApprovedPost,
  backupUnpublishedPost,
  backupDeletedDraft,
  backupDeletedPublished,
  draftContentPath,
  publishedContentPath,
  publicPostPath,
};
