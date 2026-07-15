'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'blog');
const DRAFTS_DIR = path.join(CONTENT_DIR, 'drafts');
const PUBLIC_BLOG_DIR = path.join(ROOT, 'public', 'blog');
const SITEMAP_PATH = path.join(ROOT, 'public', 'sitemap.xml');
const TOPICS_PATH = path.join(CONTENT_DIR, 'topics.yaml');
const SITE = 'https://liamscall.com';
const {
  SITE_IDENTITY,
  sitemapXmlComment,
  organizationSchema,
} = require('./site-identity');

/** Verified numbers that may appear in posts (digits only, with and without country code). */
const ALLOWED_PHONE_DIGITS = new Set([
  '988',
  '911',
  '211',
  '311',
  '811',
  '18332273778',
  '8332273778',
  '18665312600',
  '8665312600',
  '18006686868',
  '8006686868',
  '18552423310',
  '8552423310',
  '18006624357',
  '8006624357',
  '4163384766',
  '18773384766',
  '8773384766',
  '686868',
]);

const ALLOWED_HOSTS = new Set([
  'liamscall.com',
  'www.liamscall.com',
  'ontariocaregiver.ca',
  'www.ontariocaregiver.ca',
  'connexontario.ca',
  'www.connexontario.ca',
  '988.ca',
  'www.988.ca',
  '988lifeline.org',
  'www.988lifeline.org',
  '211.ca',
  'www.211.ca',
  '211.org',
  'www.211.org',
  '211ontario.ca',
  'www.211ontario.ca',
  'toronto.ca',
  'www.toronto.ca',
  'samhsa.gov',
  'www.samhsa.gov',
  'kidshelpphone.ca',
  'www.kidshelpphone.ca',
  'mentalhealthcommission.ca',
  'www.mentalhealthcommission.ca',
  'nami.org',
  'www.nami.org',
  'camh.ca',
  'www.camh.ca',
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseFrontmatter(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '');
  if (!text.startsWith('---')) {
    return { meta: {}, body: text.trim() };
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) return { meta: {}, body: text.trim() };
  const fm = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\s*\n/, '').trim();
  const meta = {};
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    meta[m[1]] = val;
  }
  return { meta, body };
}

function toSlug(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSafeImageSrc(src) {
  const s = String(src || '').trim();
  if (!s || /["'<>\s]/.test(s)) return false;
  if (s.startsWith('/assets/') || s.startsWith('/blog/')) return true;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    return ALLOWED_HOSTS.has(u.hostname.toLowerCase()) || u.hostname.toLowerCase().endsWith('.liamscall.com');
  } catch {
    return false;
  }
}

function inlineMarkdown(text) {
  let s = escapeHtml(text);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => {
    const rawSrc = String(src || '').trim();
    if (!isSafeImageSrc(rawSrc)) return escapeHtml(`![${alt}](${rawSrc})`);
    return `<img src="${rawSrc.replace(/"/g, '')}" alt="${escapeHtml(alt)}" loading="lazy" class="blog-img">`;
  });
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|tel:[^)\s]+)\)/g, (_m, label, href) => {
    const safeHref = href.replace(/"/g, '');
    const external = safeHref.startsWith('http');
    const rel = external ? ' target="_blank" rel="noopener noreferrer"' : '';
    return `<a href="${safeHref}"${rel}>${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return s;
}

function markdownToHtml(md) {
  const lines = String(md || '').split(/\r?\n/);
  const out = [];
  let para = [];
  let list = null;

  const flushPara = () => {
    if (!para.length) return;
    out.push(`<p>${inlineMarkdown(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    out.push(`<${list.type}>${list.items.map((i) => `<li>${inlineMarkdown(i)}</li>`).join('')}</${list.type}>`);
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }
    if (/^!\[/.test(trimmed) && /\]\([^)\s]+\)$/.test(trimmed)) {
      flushPara();
      flushList();
      out.push(`<figure class="blog-figure">${inlineMarkdown(trimmed)}</figure>`);
      continue;
    }
    if (/^###\s+/.test(trimmed)) {
      flushPara();
      flushList();
      out.push(`<h3>${inlineMarkdown(trimmed.replace(/^###\s+/, ''))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      flushPara();
      flushList();
      out.push(`<h2>${inlineMarkdown(trimmed.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }
    const ul = trimmed.match(/^[-*]\s+(.+)$/);
    if (ul) {
      flushPara();
      if (!list || list.type !== 'ul') {
        flushList();
        list = { type: 'ul', items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }
    const ol = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      flushPara();
      if (!list || list.type !== 'ol') {
        flushList();
        list = { type: 'ol', items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }
    flushList();
    para.push(trimmed);
  }
  flushPara();
  flushList();
  return out.join('\n');
}

function extractExcerpt(body, max = 160) {
  const plain = String(body || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max).replace(/\s+\S*$/, '')}...`;
}

function listMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(dir, f));
}

function loadPost(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  const slug = meta.slug || toSlug(meta.title || path.basename(filePath, '.md'));
  return {
    filePath,
    slug,
    title: meta.title || slug,
    date: meta.date || '1970-01-01',
    category: meta.category || 'Caregiving',
    region: meta.region || 'Canada',
    description: meta.description || extractExcerpt(body),
    risk: (meta.risk || 'safe').toLowerCase(),
    image: meta.image || '',
    body,
    html: markdownToHtml(body),
  };
}

function loadPublishedPosts() {
  return listMarkdownFiles(CONTENT_DIR)
    .map(loadPost)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

function findDisallowedPhones(text) {
  const re =
    /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b(?:9-?8-?8|9-?1-?1|2-?1-?1|3-?1-?1|8-?1-?1)\b|\b686868\b)/gi;
  const bad = [];
  for (const match of String(text || '').matchAll(re)) {
    const digits = digitsOnly(match[0]);
    if (!digits) continue;
    if (!ALLOWED_PHONE_DIGITS.has(digits)) bad.push(match[0]);
  }
  return [...new Set(bad)];
}

function findDisallowedUrls(text) {
  const re = /https?:\/\/[^\s)\]>"']+/gi;
  const bad = [];
  for (const match of String(text || '').matchAll(re)) {
    try {
      const host = new URL(match[0].replace(/[.,;:!?)]+$/, '')).hostname.toLowerCase();
      if (!ALLOWED_HOSTS.has(host)) bad.push(match[0]);
    } catch {
      bad.push(match[0]);
    }
  }
  return [...new Set(bad)];
}

function assertPostGuards(post, { strictSafe = false } = {}) {
  const badPhones = findDisallowedPhones(`${post.body}\n${post.title}`);
  const badUrls = findDisallowedUrls(post.body);
  if (strictSafe || post.risk === 'safe') {
    if (badPhones.length) {
      throw new Error(`Disallowed phone number(s) in ${post.slug}: ${badPhones.join(', ')}`);
    }
    if (badUrls.length) {
      throw new Error(`Disallowed URL(s) in ${post.slug}: ${badUrls.join(', ')}`);
    }
  }
  return { badPhones, badUrls };
}

function parseTopicsYaml(raw) {
  const topics = [];
  let current = null;
  for (const line of String(raw || '').split(/\r?\n/)) {
    const id = line.match(/^\s+-\s+id:\s*(.+)$/);
    if (id) {
      if (current) topics.push(current);
      current = { id: id[1].trim(), used: false, risk: 'safe' };
      continue;
    }
    if (!current) continue;
    const kv = line.match(/^\s{4}([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (kv[1] === 'used') current.used = val === 'true';
    else current[kv[1]] = val;
  }
  if (current) topics.push(current);
  return topics;
}

function loadTopics() {
  if (!fs.existsSync(TOPICS_PATH)) return [];
  return parseTopicsYaml(fs.readFileSync(TOPICS_PATH, 'utf8'));
}

function yamlQuote(val) {
  const s = String(val ?? '');
  if (/[:#"'\n]/.test(s) || s.includes(' - ')) return JSON.stringify(s);
  return JSON.stringify(s);
}

function serializeTopics(topics) {
  const header = `# Hybrid topic queue for automated blog generation.
# risk: safe  → may auto-publish
# risk: review → always write to drafts/ and open a PR
# used: true  → already generated (do not pick again)
# source_url (optional) → reputable article that inspired the angle (never copy it)

topics:
`;
  const blocks = topics.map((t) => {
    const lines = [
      `  - id: ${t.id}`,
      `    title: ${yamlQuote(t.title)}`,
      `    category: ${yamlQuote(t.category || 'Caregiving')}`,
      `    risk: ${(t.risk || 'safe').toLowerCase()}`,
      `    used: ${t.used ? 'true' : 'false'}`,
      `    angle: ${yamlQuote(t.angle || '')}`,
    ];
    if (t.source_url) lines.push(`    source_url: ${yamlQuote(t.source_url)}`);
    if (t.source_name) lines.push(`    source_name: ${yamlQuote(t.source_name)}`);
    return lines.join('\n');
  });
  return `${header}${blocks.join('\n\n')}\n`;
}

function saveTopics(topics) {
  fs.writeFileSync(TOPICS_PATH, serializeTopics(topics), 'utf8');
}

function appendTopics(newTopics) {
  const existing = loadTopics();
  const ids = new Set(existing.map((t) => t.id));
  const urls = new Set(existing.map((t) => t.source_url).filter(Boolean));
  const added = [];
  for (const t of newTopics) {
    if (!t?.id || ids.has(t.id)) continue;
    if (t.source_url && urls.has(t.source_url)) continue;
    existing.push({
      id: t.id,
      title: t.title,
      category: t.category || 'Caregiving',
      risk: (t.risk || 'safe').toLowerCase(),
      used: false,
      angle: t.angle || '',
      source_url: t.source_url || '',
      source_name: t.source_name || '',
    });
    ids.add(t.id);
    if (t.source_url) urls.add(t.source_url);
    added.push(t.id);
  }
  if (added.length) saveTopics(existing);
  return added;
}

function parseSourcesYaml(raw) {
  const feeds = [];
  const seeds = [];
  let section = null;
  let current = null;
  const flush = () => {
    if (!current) return;
    if (section === 'feeds') feeds.push(current);
    if (section === 'seeds') seeds.push(current);
    current = null;
  };
  for (const line of String(raw || '').split(/\r?\n/)) {
    if (/^feeds:\s*$/.test(line)) {
      flush();
      section = 'feeds';
      continue;
    }
    if (/^seeds:\s*$/.test(line)) {
      flush();
      section = 'seeds';
      continue;
    }
    const item = line.match(/^\s+-\s+(?:id|title):\s*(.+)$/);
    if (item && (line.includes('id:') || line.includes('title:'))) {
      flush();
      current = {};
      if (line.includes('id:')) current.id = item[1].trim().replace(/^["']|["']$/g, '');
      else current.title = item[1].trim().replace(/^["']|["']$/g, '');
      continue;
    }
    if (!current) continue;
    const kv = line.match(/^\s{4}([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    current[kv[1]] = val;
  }
  flush();
  return { feeds, seeds };
}

function loadSources() {
  const p = path.join(CONTENT_DIR, 'sources.yaml');
  if (!fs.existsSync(p)) return { feeds: [], seeds: [] };
  return parseSourcesYaml(fs.readFileSync(p, 'utf8'));
}

function serializeSources({ feeds = [], seeds = [] } = {}) {
  const feedBlocks = feeds.map((f) => {
    const lines = [
      `  - id: ${f.id}`,
      `    name: ${yamlQuote(f.name || f.id)}`,
      `    url: ${yamlQuote(f.url || '')}`,
      `    default_risk: ${(f.default_risk || 'review').toLowerCase()}`,
    ];
    if (f.notes) lines.push(`    notes: ${yamlQuote(f.notes)}`);
    return lines.join('\n');
  });
  const seedBlocks = seeds.map((s) => {
    const lines = [
      `  - title: ${yamlQuote(s.title || '')}`,
      `    url: ${yamlQuote(s.url || '')}`,
      `    category: ${yamlQuote(s.category || 'Caregiving')}`,
      `    risk: ${(s.risk || 'safe').toLowerCase()}`,
    ];
    return lines.join('\n');
  });
  return `# Allowlisted idea sources for blog discovery.
# We only use titles/summaries to invent ORIGINAL Liam's Call angles.
# Never scrape or republish full articles.

feeds:
${feedBlocks.join('\n\n')}

# Curated inspiration links when RSS is thin or unavailable.
# title + url only - discovery will invent a new angle, not rewrite the page.
seeds:
${seedBlocks.join('\n\n')}
`;
}

function saveSources(data) {
  const p = path.join(CONTENT_DIR, 'sources.yaml');
  fs.writeFileSync(p, serializeSources(data), 'utf8');
}

function adsenseConfig() {
  const client = String(process.env.ADSENSE_CLIENT_ID || '').trim();
  const sidebarSlot = String(process.env.ADSENSE_SLOT_SIDEBAR || '').trim();
  const articleSlot = String(process.env.ADSENSE_SLOT_ARTICLE || '').trim();
  return {
    enabled: Boolean(client && /^ca-pub-\d+$/i.test(client)),
    client,
    sidebarSlot,
    articleSlot,
  };
}

function renderAdSlot(slotName, { label = 'Ad space' } = {}) {
  const ads = adsenseConfig();
  const slotId =
    slotName === 'article' ? ads.articleSlot : ads.sidebarSlot;
  if (ads.enabled && slotId) {
    return `
        <div class="ad-slot" data-ad-slot="${escapeHtml(slotName)}" aria-label="${escapeHtml(label)}">
          <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${escapeHtml(ads.client)}" crossorigin="anonymous"></script>
          <ins class="adsbygoogle"
               style="display:block"
               data-ad-client="${escapeHtml(ads.client)}"
               data-ad-slot="${escapeHtml(slotId)}"
               data-ad-format="auto"
               data-full-width-responsive="true"></ins>
          <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
        </div>`;
  }
  return `
        <div class="ad-slot ad-slot--placeholder" data-ad-slot="${escapeHtml(slotName)}" aria-label="${escapeHtml(label)}">
          <div class="ad-slot-label">Sponsored</div>
          <div class="ad-slot-body">
            <p>${escapeHtml(label)}</p>
            <p>Standard insertion area — Google Ads appear here after publisher approval.</p>
          </div>
        </div>`;
}

function renderChatCtaCard() {
  return `
        <a class="sidebar-cta" href="/">
          <div class="sidebar-cta-title">Chat</div>
          <div class="sidebar-cta-body">
            <p>Need to talk something through?</p>
            <p>Open Liam's Call AI for caregiver, mental health, addiction, and housing support.</p>
          </div>
        </a>`;
}

function markTopicUsed(topicId) {
  let raw = fs.readFileSync(TOPICS_PATH, 'utf8');
  const lines = raw.split(/\r?\n/);
  let inTopic = false;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].match(new RegExp(`^\\s+-\\s+id:\\s*${topicId}\\s*$`))) {
      inTopic = true;
      continue;
    }
    if (inTopic && /^\s+-\s+id:/.test(lines[i])) break;
    if (inTopic && /^\s{4}used:/.test(lines[i])) {
      lines[i] = '    used: true';
      break;
    }
  }
  fs.writeFileSync(TOPICS_PATH, `${lines.join('\n').replace(/\n*$/, '\n')}`);
}

function formatDateDisplay(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

function blogShell({ title, description, canonical, schema, active, bodyHtml, breadcrumb }) {
  const navLink = (key, href, label) =>
    `<a class="side-link${active === key ? ' active' : ''}" href="${href}">${label}</a>`;
  const schemaBlock = schema
    ? `\n  <script type="application/ld+json">\n${JSON.stringify(schema, null, 4)}\n  </script>`
    : '';
  const crumb = breadcrumb
    ? `<nav class="blog-crumb" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> ${breadcrumb}</nav>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#0f4a3a">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="${schema?.['@type'] === 'Article' ? 'article' : 'website'}">
  <meta property="og:site_name" content="Liam's Call">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${SITE}/assets/logo-icon.svg">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" type="image/svg+xml" href="/assets/logo-icon.svg">${schemaBlock}
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <style>
    :root { --green-dark: #0f4a3a; --beige-main: #e8dfd3; --sidebar-w: 16rem; }
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f3f0ea; margin: 0; color: #1f2937; }
    a { color: var(--green-dark); }
    .pill-dark { background: var(--green-dark); color: #fff; border-radius: 9999px; text-decoration: none; }
    .page-shell { display: flex; min-height: 100vh; align-items: stretch; }
    .site-sidebar {
      width: var(--sidebar-w); min-width: var(--sidebar-w); flex-shrink: 0; background: #fff;
      border-right: 1px solid #f3f4f6; padding: 1.75rem 1.5rem; display: flex; flex-direction: column;
      position: sticky; top: 0; height: 100vh; overflow-y: auto;
    }
    .sidebar-home-btn { display: flex; align-items: center; gap: 0.65rem; margin-bottom: 1.75rem; text-decoration: none; }
    .sidebar-home-btn img {
      height: 1.75rem; width: auto;
      filter: invert(18%) sepia(60%) saturate(800%) hue-rotate(120deg) brightness(70%) contrast(120%);
    }
    .sidebar-home-btn span { font-size: 0.9rem; font-weight: 700; color: var(--green-dark); letter-spacing: -0.02em; }
    .side-nav { display: flex; flex-direction: column; gap: 1.15rem; }
    .side-link { font-size: 0.9rem; color: #111827; text-decoration: none; }
    .side-link:hover { opacity: 0.75; }
    .side-link.active { font-weight: 600; text-decoration: underline; text-underline-offset: 4px; color: var(--green-dark); }
    .sidebar-spacer { margin-top: auto; padding-top: 1.5rem; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .sidebar-cta {
      display: block; border-radius: 0.75rem; overflow: hidden; border: 1px solid #e5e7eb;
      background: #1a2d5a; color: #fff; font-size: 10px; line-height: 1.35; text-decoration: none;
    }
    .sidebar-cta-title { padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.1); font-weight: 600; color: #fff; }
    .sidebar-cta-body { padding: 0.7rem 0.75rem; }
    .sidebar-cta-body p { margin: 0 0 0.5rem; color: #fff; }
    .sidebar-cta-body p:last-child { margin-bottom: 0; color: rgba(255,255,255,0.7); }
    .sidebar-cta-body p:first-child { font-weight: 600; font-size: 11px; color: #fff; }
    .ad-slot {
      border-radius: 0.75rem; overflow: hidden; border: 1px dashed rgba(15,74,58,0.28);
      background: #fafaf8; font-size: 10px; line-height: 1.35; min-height: 5.5rem;
    }
    .ad-slot--placeholder { color: #6b7280; }
    .ad-slot-label {
      padding: 0.4rem 0.65rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      border-bottom: 1px solid #ece7df; color: #9a6700; font-size: 0.65rem;
    }
    .ad-slot-body { padding: 0.65rem 0.75rem; }
    .ad-slot-body p { margin: 0 0 0.35rem; }
    .ad-slot-body p:last-child { margin-bottom: 0; color: #9ca3af; }
    .ad-slot-article { margin: 1.5rem 0; }
    .blog-figure { margin: 0 0 1.25rem; }
    .blog-img { display: block; max-width: 100%; height: auto; border-radius: 0.75rem; }
    .blog-filters { display: flex; flex-wrap: wrap; gap: 0.45rem; margin: 0 0 1.25rem; }
    .blog-filter {
      appearance: none; border: 1px solid #e5e7eb; background: #fff; color: #374151;
      border-radius: 999px; padding: 0.35rem 0.75rem; font-size: 0.78rem; font-weight: 600; cursor: pointer;
    }
    .blog-filter.is-active { background: var(--green-dark); color: #fff; border-color: var(--green-dark); }
    .blog-filter-meta { font-size: 0.75rem; color: #9ca3af; margin: -0.5rem 0 1rem; }
    .post-card.is-hidden { display: none; }
    .sidebar-legal { display: flex; align-items: center; gap: 0.55rem; margin-top: 0.25rem; padding-top: 0.75rem; border-top: 1px solid #f3f4f6; }
    .sidebar-legal a { font-size: 10px !important; color: #d1d5db !important; text-decoration: none !important; }
    .sidebar-legal span { font-size: 10px; color: #e5e7eb; }
    .mobile-topbar { display: none; }
    #sidebar-overlay { display: none; }
    .site-main { flex: 1; min-width: 0; }
    main { max-width: 42rem; margin: 0 auto; padding: 2rem 1.5rem 4rem; }
    h1 { font-size: clamp(1.45rem, 3vw, 1.95rem); font-weight: 700; color: var(--green-dark); letter-spacing: -0.02em; margin: 0.35rem 0 0.85rem; line-height: 1.25; }
    .blog-crumb { font-size: 0.75rem; color: #9ca3af; margin-bottom: 0.75rem; }
    .blog-crumb a { color: #6b7280; text-decoration: none; }
    .blog-back {
      display: inline-flex; align-items: center; gap: 0.25rem;
      font-size: 0.85rem; font-weight: 600; color: var(--green-dark);
      text-decoration: none; margin-bottom: 1rem;
    }
    .blog-back:hover { text-decoration: underline; text-underline-offset: 3px; }
    .blog-back-wrap { margin: 1.75rem 0 0; }
    .blog-meta { font-size: 0.75rem; color: #6b7280; margin-bottom: 1.5rem; }
    .blog-body { font-size: 0.95rem; line-height: 1.7; color: #4b5563; }
    .blog-body p { margin: 0 0 1rem; }
    .blog-body h2 { font-size: 1.15rem; color: #111827; margin: 1.75rem 0 0.65rem; }
    .blog-body h3 { font-size: 1.05rem; color: #111827; margin: 1.4rem 0 0.5rem; }
    .blog-body ul, .blog-body ol { margin: 0 0 1rem 1.15rem; padding: 0; }
    .blog-body li { margin-bottom: 0.35rem; }
    .blog-cta {
      margin-top: 2rem; padding: 1.15rem 1.25rem; border-radius: 0.9rem;
      background: var(--beige-main); border: 1px solid rgba(15,74,58,0.08);
    }
    .blog-cta p { margin: 0 0 0.75rem; font-size: 0.875rem; color: #4b5563; }
    .blog-cta a.pill-dark { display: inline-block; padding: 0.55rem 1rem; font-size: 0.82rem; font-weight: 600; }
    .blog-disclaimer { margin-top: 1.5rem; font-size: 0.72rem; color: #9ca3af; line-height: 1.45; }
    .post-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1rem; }
    .post-card {
      display: block; text-decoration: none; color: inherit; padding: 1.15rem 1.2rem;
      border-radius: 0.9rem; background: #fff; border: 1px solid #e5e7eb;
    }
    .post-card:hover { border-color: rgba(15,74,58,0.25); }
    .post-card .cat { font-size: 0.65rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--green-dark); opacity: 0.7; }
    .post-card h2 { font-size: 1.05rem; margin: 0.35rem 0 0.45rem; color: #111827; font-weight: 650; }
    .post-card p { margin: 0; font-size: 0.85rem; color: #6b7280; line-height: 1.5; }
    .post-card .date { display: block; margin-top: 0.55rem; font-size: 0.72rem; color: #9ca3af; }
    @media (max-width: 767px) {
      .site-sidebar {
        position: fixed; top: 0; left: 0; height: 100%; width: 15.5rem; min-width: 15.5rem;
        transform: translateX(-100%); transition: transform 260ms ease; z-index: 60;
        box-shadow: 0 12px 32px rgba(15, 74, 58, 0.2);
      }
      .site-sidebar.is-open { transform: translateX(0); }
      #sidebar-overlay.is-open {
        display: block; position: fixed; inset: 0; background: rgba(15, 23, 42, 0.35); z-index: 50;
      }
      .mobile-topbar {
        display: flex; align-items: center; position: sticky; top: 0; z-index: 30;
        height: 3.25rem; padding: 0 1rem; border-bottom: 1px solid rgba(15, 74, 58, 0.08);
        background: rgba(243, 240, 234, 0.92); backdrop-filter: blur(10px);
      }
      .mobile-menu-toggle {
        display: inline-flex; align-items: center; justify-content: center; width: 2.15rem; height: 2.15rem;
        border-radius: 0.65rem; border: none; background: var(--green-dark); color: #fff; cursor: pointer;
      }
      .mobile-menu-toggle svg { width: 1.05rem; height: 1.05rem; stroke: currentColor; }
      .mobile-top-brand { display: flex; align-items: center; gap: 0.5rem; margin: 0 auto; text-decoration: none; }
      .mobile-top-brand img { height: 1.35rem; width: auto; }
      .mobile-top-brand span { font-size: 0.92rem; font-weight: 700; color: var(--green-dark); }
      main { padding: 1.5rem 1.1rem 3rem; }
    }
  </style>
</head>
<body>
  <div class="page-shell">
    <div id="sidebar-overlay"></div>
    <aside id="site-sidebar" class="site-sidebar">
      <a class="sidebar-home-btn" href="/">
        <img src="/assets/logo-icon.svg" alt="">
        <span>Liam's Call</span>
      </a>
      <nav class="side-nav">
        ${navLink('chat', '/', 'New Chat')}
        ${navLink('blog', '/blog', 'Blog')}
        ${navLink('resources', '/resources', 'Resources')}
        ${navLink('about', '/about', 'About Us')}
      </nav>
      <div class="sidebar-spacer">
        ${renderChatCtaCard()}
        ${renderAdSlot('sidebar', { label: 'Sidebar ad' })}
        <div class="sidebar-legal">
          ${navLink('privacy', '/privacy', 'Privacy')}
          <span>&middot;</span>
          ${navLink('terms', '/terms', 'Terms')}
        </div>
      </div>
    </aside>
    <div class="site-main">
      <div class="mobile-topbar">
        <button id="mobile-menu-toggle" type="button" class="mobile-menu-toggle" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="site-sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <a class="mobile-top-brand" href="/">
          <img src="/assets/logo-icon.svg" alt="">
          <span>Liam's Call</span>
        </a>
      </div>
      <main>
        ${crumb}
        ${bodyHtml}
      </main>
    </div>
  </div>
  <script>
    (function () {
      var sidebar = document.getElementById('site-sidebar');
      var overlay = document.getElementById('sidebar-overlay');
      var toggle = document.getElementById('mobile-menu-toggle');
      function closeMenu() {
        sidebar.classList.remove('is-open');
        overlay.classList.remove('is-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      }
      function openMenu() {
        sidebar.classList.add('is-open');
        overlay.classList.add('is-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'true');
      }
      if (toggle) {
        toggle.addEventListener('click', function () {
          if (sidebar.classList.contains('is-open')) closeMenu();
          else openMenu();
        });
      }
      overlay.addEventListener('click', closeMenu);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMenu();
      });
    })();
  </script>
</body>
</html>
`;
}

function fileLastmod(absPath) {
  try {
    return fs.statSync(absPath).mtime.toISOString();
  } catch {
    return '';
  }
}

function toIsoDate(value) {
  if (!value) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T12:00:00.000Z`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

/** Prefer the newest signal Google can use for recrawl scheduling. */
function bestLastmod(...candidates) {
  const times = candidates
    .map((c) => {
      if (!c) return 0;
      const t = Date.parse(c);
      return Number.isNaN(t) ? 0 : t;
    })
    .filter(Boolean);
  if (!times.length) return '';
  return new Date(Math.max(...times)).toISOString();
}

function absoluteAssetUrl(src) {
  const raw = String(src || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${SITE}${raw}`;
  return `${SITE}/${raw.replace(/^\.\//, '')}`;
}

function extractBodyImages(body) {
  const out = [];
  const md = String(body || '');
  for (const m of md.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
    const loc = absoluteAssetUrl(m[2]);
    if (!loc || !loc.startsWith(SITE)) continue;
    out.push({
      loc,
      title: (m[1] || '').trim() || undefined,
      caption: (m[1] || '').trim() || undefined,
    });
  }
  return out;
}

function defaultBrandImage() {
  return {
    loc: `${SITE}/assets/logo-icon.svg`,
    title: SITE_IDENTITY.siteName,
    caption: `${SITE_IDENTITY.siteName} — ${SITE_IDENTITY.subCategory}`,
    geoLocation: 'Ontario, Canada',
    license: `${SITE}/terms`,
  };
}

function hreflangLinks(loc) {
  // Single-language CA-focused site: self-referencing alternates (Google best practice).
  return [
    { hreflang: 'en-CA', href: loc },
    { hreflang: 'en', href: loc },
    { hreflang: 'x-default', href: loc },
  ];
}

function xmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderImageBlock(img) {
  if (!img?.loc) return '';
  const lines = ['    <image:image>', `      <image:loc>${xmlEscape(img.loc)}</image:loc>`];
  if (img.title) lines.push(`      <image:title>${xmlEscape(img.title)}</image:title>`);
  if (img.caption) lines.push(`      <image:caption>${xmlEscape(img.caption)}</image:caption>`);
  if (img.geoLocation) {
    lines.push(`      <image:geo_location>${xmlEscape(img.geoLocation)}</image:geo_location>`);
  }
  if (img.license) lines.push(`      <image:license>${xmlEscape(img.license)}</image:license>`);
  lines.push('    </image:image>');
  return lines.join('\n');
}

function renderUrlEntry(entry) {
  const lines = ['  <url>', `    <loc>${xmlEscape(entry.loc)}</loc>`];
  if (entry.lastmod) lines.push(`    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`);
  if (entry.changefreq) lines.push(`    <changefreq>${xmlEscape(entry.changefreq)}</changefreq>`);
  if (entry.priority) lines.push(`    <priority>${xmlEscape(entry.priority)}</priority>`);
  for (const alt of entry.hreflang || []) {
    lines.push(
      `    <xhtml:link rel="alternate" hreflang="${xmlEscape(alt.hreflang)}" href="${xmlEscape(alt.href)}"/>`,
    );
  }
  const seen = new Set();
  for (const img of entry.images || []) {
    if (!img?.loc || seen.has(img.loc)) continue;
    seen.add(img.loc);
    lines.push(renderImageBlock(img));
  }
  lines.push('  </url>');
  return lines.join('\n');
}

function writeSitemap(posts) {
  const publicDir = path.join(ROOT, 'public');
  const brandImage = defaultBrandImage();

  // Standalone content pages (generated HTML in public/) — keep in sync with server routes.
  const contentPages = [
    {
      route: '/',
      file: 'index.html',
      priority: '1.0',
      changefreq: 'daily',
      images: [
        brandImage,
        {
          loc: `${SITE}/assets/logo-horizontal.svg`,
          title: `${SITE_IDENTITY.siteName} wordmark`,
          caption: 'Primary horizontal logo for Liam\'s Call',
          geoLocation: 'Ontario, Canada',
          license: `${SITE}/terms`,
        },
      ],
    },
    {
      route: '/blog',
      file: path.join('blog', 'index.html'),
      priority: '0.9',
      changefreq: 'daily',
      images: [brandImage],
    },
    {
      route: '/resources',
      file: 'resources.html',
      priority: '0.8',
      changefreq: 'weekly',
      images: [brandImage],
    },
    {
      route: '/about',
      file: 'about.html',
      priority: '0.7',
      changefreq: 'monthly',
      images: [brandImage],
    },
    {
      route: '/privacy',
      file: 'privacy.html',
      priority: '0.5',
      changefreq: 'yearly',
      images: [brandImage],
    },
    {
      route: '/terms',
      file: 'terms.html',
      priority: '0.5',
      changefreq: 'yearly',
      images: [brandImage],
    },
  ];

  const staticUrls = contentPages
    .filter((p) => fs.existsSync(path.join(publicDir, p.file)))
    .map((p) => {
      const loc = `${SITE}${p.route}`;
      return {
        loc,
        priority: p.priority,
        changefreq: p.changefreq,
        lastmod: bestLastmod(fileLastmod(path.join(publicDir, p.file))),
        hreflang: hreflangLinks(loc),
        images: p.images || [brandImage],
      };
    });

  const postUrls = posts.map((p) => {
    const loc = `${SITE}/blog/${p.slug}`;
    const htmlPath = path.join(PUBLIC_BLOG_DIR, p.slug, 'index.html');
    const mdPath = p.filePath || path.join(CONTENT_DIR, `${p.slug}.md`);
    const images = [brandImage];
    if (p.image) {
      images.push({
        loc: absoluteAssetUrl(p.image),
        title: p.title,
        caption: p.description || p.title,
        geoLocation: p.region || 'Canada',
        license: `${SITE}/terms`,
      });
    }
    images.push(...extractBodyImages(p.body));

    return {
      loc,
      priority: '0.75',
      changefreq: 'weekly',
      lastmod: bestLastmod(toIsoDate(p.date), fileLastmod(mdPath), fileLastmod(htmlPath)),
      hreflang: hreflangLinks(loc),
      images,
    };
  });

  const entries = [...staticUrls, ...postUrls];
  const body = entries.map(renderUrlEntry).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
${sitemapXmlComment()}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>
`;
  fs.writeFileSync(SITEMAP_PATH, xml);

  // Machine-readable identity for directories / partners (not for human nav).
  const identityPath = path.join(ROOT, 'public', 'site-identity.json');
  fs.writeFileSync(
    identityPath,
    `${JSON.stringify(
      {
        siteName: SITE_IDENTITY.siteName,
        domain: SITE_IDENTITY.domain,
        url: SITE_IDENTITY.url,
        category: SITE_IDENTITY.category,
        subCategory: SITE_IDENTITY.subCategory,
        shortDescription: SITE_IDENTITY.shortDescription,
        fullDescription: SITE_IDENTITY.fullDescription,
        languages: ['en-CA', 'en'],
        organization: organizationSchema(),
        sitemap: {
          url: `${SITE}/sitemap.xml`,
          extensions: ['xhtml/hreflang', 'image'],
          notes:
            'Video and Google News sitemap extensions are omitted until video/news publishing is live.',
        },
      },
      null,
      2,
    )}\n`,
  );
}

module.exports = {
  ROOT,
  CONTENT_DIR,
  DRAFTS_DIR,
  PUBLIC_BLOG_DIR,
  TOPICS_PATH,
  SITE,
  ensureDir,
  parseFrontmatter,
  toSlug,
  escapeHtml,
  markdownToHtml,
  extractExcerpt,
  loadPost,
  loadPublishedPosts,
  listMarkdownFiles,
  assertPostGuards,
  loadTopics,
  saveTopics,
  appendTopics,
  loadSources,
  saveSources,
  serializeSources,
  markTopicUsed,
  formatDateDisplay,
  blogShell,
  writeSitemap,
  renderAdSlot,
  adsenseConfig,
};
