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
  loadSources,
  saveSources,
  loadTopics,
  saveTopics,
} = require('./blog-utils');
const { ensurePostImage, setFrontmatterImage } = require('./blog-images');
const { generateTopic } = require('./blog-generate-core');
const {
  backupConfigured,
  backupStatus,
  backupSourcesYaml,
  backupTopicsYaml,
} = require('./blog-git-backup');

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
        region: post.region || 'Canada',
        description: post.description,
        risk: post.risk,
        image: post.image || '',
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
    region: post.region || 'Canada',
    description: post.description,
    risk: post.risk,
    image: post.image || '',
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
    region: post.region || 'Canada',
    description: post.description,
    risk: post.risk,
    body: post.body,
    image: post.image || '',
    source_url: post.sourceUrl || '',
    raw,
    html: post.html,
    status: 'draft',
  };
}

function writeMarkdown({ title, slug, date, category, region, description, risk, body, image, sourceUrl }) {
  const lines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `slug: ${toSlug(slug || title)}`,
    `date: ${date || new Date().toISOString().slice(0, 10)}`,
    `category: ${JSON.stringify(category || 'Caregiving')}`,
    `region: ${JSON.stringify(region || 'Canada')}`,
    `description: ${JSON.stringify(description || '')}`,
    `risk: ${(risk || 'review').toLowerCase()}`,
  ];
  if (sourceUrl) lines.push(`source_url: ${JSON.stringify(sourceUrl)}`);
  if (image) lines.push(`image: ${JSON.stringify(image)}`);
  lines.push('---', '', String(body || '').trim(), '');
  return lines.join('\n');
}

async function attachImageToMarkdown(md, { slug, title, category, description, sourceUrl }) {
  try {
    const { path: image, origin } = await ensurePostImage({
      slug,
      title,
      category,
      description: description || '',
      sourceUrl: sourceUrl || '',
    });
    console.log(`Blog image attached for ${slug} (${origin}): ${image}`);
    return setFrontmatterImage(md, image);
  } catch (err) {
    console.warn(`Blog image attach skipped for ${slug}: ${err.message || err}`);
    return md;
  }
}

async function saveDraft(slug, updates = {}) {
  const filePath = draftPathFor(slug);
  const current = loadPost(filePath);
  const nextSlug = toSlug(updates.slug || current.slug);
  const title = updates.title ?? current.title;
  const category = updates.category ?? current.category;
  const description = updates.description ?? current.description;
  const sourceUrl = updates.source_url ?? updates.sourceUrl ?? current.sourceUrl ?? '';
  let md = writeMarkdown({
    title,
    slug: nextSlug,
    date: updates.date ?? current.date,
    category,
    region: updates.region ?? current.region ?? 'Canada',
    description,
    risk: updates.risk ?? current.risk ?? 'review',
    body: updates.body ?? current.body,
    image: updates.image ?? current.image ?? '',
    sourceUrl,
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

  if (!(updates.image ?? current.image)) {
    md = await attachImageToMarkdown(md, {
      slug: nextSlug,
      title,
      category,
      description,
      sourceUrl,
    });
  }

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

/**
 * Move a draft to published content. Pass { rebuild: false } when batching.
 */
async function approveDraft(slug, options = {}) {
  const rebuild = options.rebuild !== false;
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

  if (!post.image) {
    raw = await attachImageToMarkdown(raw, {
      slug: post.slug,
      title: post.title,
      category: post.category,
      description: post.description,
      sourceUrl: post.sourceUrl || '',
    });
  }

  fs.writeFileSync(dest, raw, 'utf8');
  fs.unlinkSync(filePath);

  const buildLog = rebuild ? rebuildBlog() : '';
  return {
    ok: true,
    slug: post.slug,
    url: `/blog/${post.slug}`,
    buildLog,
  };
}

function unpublish(slug, options = {}) {
  const rebuild = options.rebuild !== false;
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
  const buildLog = rebuild ? rebuildBlog() : '';
  return { ok: true, slug: post.slug, buildLog };
}

function deletePublished(slug, options = {}) {
  const rebuild = options.rebuild !== false;
  const pub = publishedPathFor(slug);
  if (!fs.existsSync(pub)) throw new Error('Live post not found.');
  const safe = toSlug(slug);
  fs.unlinkSync(pub);
  const buildLog = rebuild ? rebuildBlog() : '';
  return { ok: true, slug: safe, buildLog };
}

function normalizeSlugList(slugs) {
  if (!Array.isArray(slugs) || !slugs.length) throw new Error('Select at least one post.');
  const out = [];
  const seen = new Set();
  for (const raw of slugs) {
    const slug = toSlug(raw);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  if (!out.length) throw new Error('Select at least one post.');
  return out;
}

async function batchDrafts(action, slugs) {
  const list = normalizeSlugList(slugs);
  const results = [];
  const errors = [];

  if (action === 'delete') {
    for (const slug of list) {
      try {
        results.push(deleteDraft(slug));
      } catch (err) {
        errors.push({ slug, error: err.message || String(err) });
      }
    }
    return { ok: errors.length === 0, action, results, errors };
  }

  if (action === 'approve') {
    for (const slug of list) {
      try {
        results.push(await approveDraft(slug, { rebuild: false }));
      } catch (err) {
        errors.push({ slug, error: err.message || String(err) });
      }
    }
    const buildLog = results.length ? rebuildBlog() : '';
    return { ok: errors.length === 0, action, results, errors, buildLog };
  }

  throw new Error('Unknown batch action. Use approve or delete.');
}

function batchPublished(action, slugs) {
  const list = normalizeSlugList(slugs);
  const results = [];
  const errors = [];

  if (action === 'unpublish') {
    for (const slug of list) {
      try {
        results.push(unpublish(slug, { rebuild: false }));
      } catch (err) {
        errors.push({ slug, error: err.message || String(err) });
      }
    }
    const buildLog = results.length ? rebuildBlog() : '';
    return { ok: errors.length === 0, action, results, errors, buildLog };
  }

  if (action === 'delete') {
    for (const slug of list) {
      try {
        results.push(deletePublished(slug, { rebuild: false }));
      } catch (err) {
        errors.push({ slug, error: err.message || String(err) });
      }
    }
    const buildLog = results.length ? rebuildBlog() : '';
    return { ok: errors.length === 0, action, results, errors, buildLog };
  }

  throw new Error('Unknown batch action. Use unpublish or delete.');
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

function getSources() {
  return loadSources();
}

async function updateSources(payload = {}) {
  const current = loadSources();
  const feeds = Array.isArray(payload.feeds) ? payload.feeds : current.feeds;
  const seeds = Array.isArray(payload.seeds) ? payload.seeds : current.seeds;
  const cleanFeeds = feeds
    .filter((f) => f && f.id && f.url)
    .map((f) => ({
      id: String(f.id).trim(),
      name: String(f.name || f.id).trim(),
      url: String(f.url).trim(),
      default_risk: String(f.default_risk || 'review').toLowerCase() === 'safe' ? 'safe' : 'review',
      notes: String(f.notes || '').trim(),
    }));
  const cleanSeeds = seeds
    .filter((s) => s && s.title && s.url)
    .map((s) => ({
      title: String(s.title).trim(),
      url: String(s.url).trim(),
      category: String(s.category || 'Caregiving').trim(),
      risk: String(s.risk || 'review').toLowerCase() === 'safe' ? 'safe' : 'review',
    }));
  saveSources({ feeds: cleanFeeds, seeds: cleanSeeds });
  const sources = loadSources();
  const backup = await backupSourcesYaml(
    `Blog desk: save seeds/sources (${cleanSeeds.length} seeds)`,
  );
  return { ...sources, backup };
}

function getTopics() {
  return loadTopics();
}

function normalizeDeskCategory(value) {
  const raw = String(value || '').trim();
  const allowed = ['Mental health', 'Addiction', 'Homelessness', 'Care Giver Tips'];
  if (!raw) return 'Care Giver Tips';
  const exact = allowed.find((c) => c.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  const legacy = {
    caregiving: 'Care Giver Tips',
    'care giver tips': 'Care Giver Tips',
    'caregiver wellbeing': 'Care Giver Tips',
    'caregiver tips': 'Care Giver Tips',
    routines: 'Care Giver Tips',
    communication: 'Care Giver Tips',
    'practical tips': 'Care Giver Tips',
    housing: 'Homelessness',
  };
  return legacy[raw.toLowerCase()] || 'Care Giver Tips';
}

function slugifyTopicId(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function updateTopics(payload = {}) {
  const incoming = Array.isArray(payload.topics) ? payload.topics : null;
  if (!incoming) throw new Error('topics array required.');
  const usedIds = new Set();
  const cleaned = incoming
    .map((t) => {
      if (!t) return null;
      const title = String(t.title || '').trim();
      let id = String(t.id || '').trim() || slugifyTopicId(title);
      if (!title || !id) return null;
      if (usedIds.has(id)) {
        let n = 2;
        while (usedIds.has(`${id}-${n}`)) n += 1;
        id = `${id}-${n}`;
      }
      usedIds.add(id);
      return {
        id,
        title,
        category: normalizeDeskCategory(t.category),
        risk: String(t.risk || 'review').toLowerCase() === 'safe' ? 'safe' : 'review',
        used: Boolean(t.used),
        angle: String(t.angle || '').trim(),
        source_url: String(t.source_url || '').trim(),
        source_name: String(t.source_name || '').trim(),
      };
    })
    .filter(Boolean);
  saveTopics(cleaned);
  return loadTopics();
}

async function updateTopicsAndBackup(payload = {}) {
  const topics = updateTopics(payload);
  if (payload && payload.skipBackup) {
    return { topics, backup: { ok: false, skipped: true, reason: 'Backup skipped for this save.' } };
  }
  const backup = await backupTopicsYaml(`Blog desk: save topics (${topics.length} topics)`);
  return { topics, backup };
}

/**
 * Generate an article for a topic from the Blog desk.
 * Always lands in drafts so a human approves before anything goes live.
 */
async function generateTopicArticle(topicId, options = {}) {
  const id = String(topicId || '').trim();
  if (!id) throw new Error('Topic id is required.');

  const topics = loadTopics();
  const topic = topics.find((t) => t.id === id);
  if (!topic) throw new Error(`Topic not found: ${id}`);
  if (topic.used && !options.allowUsed) {
    throw new Error('This topic is already marked used. Uncheck “Already used”, save, then generate — or confirm regenerate.');
  }

  const summary = await generateTopic({
    topicId: id,
    // Desk generate always writes a draft for human review.
    forceDraft: true,
  });

  let buildLog = '';
  if (summary.mode === 'published') {
    buildLog = rebuildBlog();
  }

  // Persist "used" flag + any seed link written during generate.
  const backup = await backupTopicsYaml(
    `Blog desk: generate topic ${id} → ${summary.slug || 'draft'}`,
  );

  return {
    ok: true,
    ...summary,
    url: summary.mode === 'published' ? `/blog/${summary.slug}` : null,
    topics: loadTopics(),
    buildLog,
    backup,
  };
}

module.exports = {
  listDrafts,
  listPublished,
  getDraft,
  saveDraft,
  deleteDraft,
  approveDraft,
  unpublish,
  deletePublished,
  batchDrafts,
  batchPublished,
  rebuildBlog,
  previewMarkdown,
  getSources,
  updateSources,
  getTopics,
  updateTopics,
  updateTopicsAndBackup,
  generateTopicArticle,
  backupConfigured,
  backupStatus,
};
