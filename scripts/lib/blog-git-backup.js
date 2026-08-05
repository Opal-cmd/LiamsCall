'use strict';

/**
 * Persist Blog desk YAML (seeds/topics) to GitHub so Render redeploys
 * do not wipe admin edits that only lived on the ephemeral disk.
 *
 * Env:
 *   BLOG_GIT_TOKEN or GITHUB_TOKEN  — PAT with Contents: Read and Write
 *   BLOG_GIT_REPO or GITHUB_REPOSITORY — "owner/repo" (e.g. Opal-cmd/LiamsCall)
 *   BLOG_GIT_BRANCH — default "main"
 */

const fs = require('fs');
const path = require('path');
const { ROOT } = require('./blog-utils');

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

async function getFileMeta(repoPath) {
  const repo = gitRepo();
  const branch = gitBranch();
  const encoded = repoPath
    .split('/')
    .map((p) => encodeURIComponent(p))
    .join('/');
  try {
    return await githubRequest(
      'GET',
      `/repos/${repo}/contents/${encoded}?ref=${encodeURIComponent(branch)}`,
    );
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * Commit one or more repo-relative files from disk to GitHub.
 * @param {string[]} relativePaths e.g. ['content/blog/sources.yaml']
 * @param {string} message
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, commitUrl?: string, files?: string[], error?: string }>}
 */
async function backupFilesToGit(relativePaths, message) {
  if (!backupConfigured()) {
    return {
      ok: false,
      skipped: true,
      reason:
        'Git backup is not configured. Set BLOG_GIT_TOKEN and BLOG_GIT_REPO on the server so Seeds/Topics survive redeploys.',
    };
  }

  const paths = [...new Set((relativePaths || []).map((p) => String(p).replace(/\\/g, '/')).filter(Boolean))];
  if (!paths.length) {
    return { ok: false, skipped: true, reason: 'No files to back up.' };
  }

  const repo = gitRepo();
  const branch = gitBranch();
  const results = [];

  for (const rel of paths) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      results.push({ path: rel, ok: false, error: 'File missing on disk' });
      continue;
    }
    const content = fs.readFileSync(abs);
    const meta = await getFileMeta(rel);
    const existingSha = meta && meta.type === 'file' ? meta.sha : undefined;
    const b64 = content.toString('base64');

    // Skip no-op updates when content matches (same sha of blob).
    if (existingSha) {
      // GitHub blob sha is git sha of content; compare via API put only when needed.
      // Cheap check: if base64 lengths differ we must update; otherwise still PUT —
      // GitHub returns 200 with same commit if unchanged is rare; we always PUT when
      // admin explicitly saved. Optional: compare sha of content.
    }

    try {
      const encoded = rel
        .split('/')
        .map((p) => encodeURIComponent(p))
        .join('/');
      const data = await githubRequest('PUT', `/repos/${repo}/contents/${encoded}`, {
        message: message || `Backup ${rel} from Blog desk`,
        content: b64,
        branch,
        ...(existingSha ? { sha: existingSha } : {}),
        committer: {
          name: 'liamscall-blog-bot',
          email: 'blog-bot@liamscall.com',
        },
      });
      results.push({
        path: rel,
        ok: true,
        commitUrl: data?.commit?.html_url || null,
        contentUrl: data?.content?.html_url || null,
      });
    } catch (err) {
      // Stale SHA — refetch once and retry.
      if (err.status === 409 || /sha/i.test(err.message || '')) {
        try {
          const fresh = await getFileMeta(rel);
          const encoded = rel
            .split('/')
            .map((p) => encodeURIComponent(p))
            .join('/');
          const data = await githubRequest('PUT', `/repos/${repo}/contents/${encoded}`, {
            message: message || `Backup ${rel} from Blog desk`,
            content: b64,
            branch,
            ...(fresh?.sha ? { sha: fresh.sha } : {}),
            committer: {
              name: 'liamscall-blog-bot',
              email: 'blog-bot@liamscall.com',
            },
          });
          results.push({
            path: rel,
            ok: true,
            commitUrl: data?.commit?.html_url || null,
            contentUrl: data?.content?.html_url || null,
          });
          continue;
        } catch (retryErr) {
          results.push({ path: rel, ok: false, error: retryErr.message || String(retryErr) });
          continue;
        }
      }
      results.push({ path: rel, ok: false, error: err.message || String(err) });
    }
  }

  const failed = results.filter((r) => !r.ok);
  const okOnes = results.filter((r) => r.ok);
  return {
    ok: failed.length === 0 && okOnes.length > 0,
    files: results,
    commitUrl: okOnes.find((r) => r.commitUrl)?.commitUrl || null,
    error: failed.length ? failed.map((f) => `${f.path}: ${f.error}`).join('; ') : undefined,
  };
}

async function backupSourcesYaml(reason = 'Blog desk saved seeds/sources') {
  return backupFilesToGit(['content/blog/sources.yaml'], reason);
}

async function backupTopicsYaml(reason = 'Blog desk saved topics') {
  return backupFilesToGit(['content/blog/topics.yaml'], reason);
}

module.exports = {
  backupConfigured,
  backupStatus,
  backupFilesToGit,
  backupSourcesYaml,
  backupTopicsYaml,
};
