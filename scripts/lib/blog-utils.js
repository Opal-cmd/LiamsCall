'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CONTENT_DIR = path.join(ROOT, 'content', 'blog');
const DRAFTS_DIR = path.join(CONTENT_DIR, 'drafts');
const PUBLIC_BLOG_DIR = path.join(ROOT, 'public', 'blog');
const SITEMAP_PATH = path.join(ROOT, 'public', 'sitemap.xml');
const HTML_SITEMAP_PATH = path.join(ROOT, 'public', 'sitemap.html');
const TOPICS_PATH = path.join(CONTENT_DIR, 'topics.yaml');
const SITE = 'https://liamscall.com';
const {
  SITE_IDENTITY,
  sitemapXmlComment,
  organizationSchema,
  speakableSpec,
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
  // Placeholders hidden for now until AdSense is approved.
  return '';
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

function blogShell({ title, description, canonical, schema, active, bodyHtml, breadcrumb, variant = 'index', ogImage }) {
  const navLink = (key, href, label) =>
    `<a class="side-link${active === key ? ' active' : ''}" href="${href}">${label}</a>`;
  const schemaBlock = schema
    ? `\n  <script type="application/ld+json">\n${JSON.stringify(schema, null, 4)}\n  </script>`
    : '';
  const crumb = breadcrumb
    ? `<nav class="blog-crumb" aria-label="Breadcrumb"><a href="/">Home</a> <span aria-hidden="true">/</span> ${breadcrumb}</nav>`
    : '';
  const mainClass = variant === 'article' ? 'blog-main is-article' : 'blog-main is-index';
  const shareImage =
    ogImage && String(ogImage).startsWith('/')
      ? `${SITE}${ogImage}`
      : ogImage && /^https?:\/\//i.test(String(ogImage))
        ? String(ogImage)
        : `${SITE}/assets/logo-icon.svg`;
  const twitterCard = shareImage.includes('logo-icon') ? 'summary' : 'summary_large_image';
  const swiperAssets =
    variant === 'index'
      ? `
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css">`
      : '';
  const swiperScript =
    variant === 'index'
      ? `
  <script src="https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.js"></script>
  <script>
    (function () {
      var root = document.getElementById('story-carousel');
      if (!root || typeof Swiper === 'undefined') return;
      var count = root.querySelectorAll('.swiper-slide').length;
      if (!count) return;
      new Swiper(root, {
        slidesPerView: 'auto',
        centeredSlides: true,
        spaceBetween: 28,
        loop: count > 2,
        grabCursor: true,
        speed: 450,
        watchSlidesProgress: true,
        resistanceRatio: 0.65,
        initialSlide: Math.min(Math.floor(count / 2), count - 1),
      });
    })();
  </script>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="theme-color" content="#0f4a3a">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="${
    schema?.['@type'] === 'Article' ||
    schema?.['@type'] === 'BlogPosting' ||
    (Array.isArray(schema?.['@graph']) &&
      schema['@graph'].some((n) => n?.['@type'] === 'BlogPosting' || n?.['@type'] === 'Article'))
      ? 'article'
      : 'website'
  }">
  <meta property="og:site_name" content="Liam's Call">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${escapeHtml(shareImage)}">
  <meta name="twitter:card" content="${twitterCard}">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" type="image/svg+xml" href="/assets/logo-icon.svg">${schemaBlock}${swiperAssets}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650;9..144,700&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet">
  <style>
    :root {
      --green-dark: #0f4a3a;
      --green-mid: #1f6b52;
      --ink: #121212;
      --muted: #5c5c5c;
      --line: rgba(18, 18, 18, 0.12);
      --paper: #f9f9f9;
      --paper-warm: #f6f1ea;
      --sky: #e6f0ff;
      --mint: #f2ffe0;
      --rose: #fff0f0;
      --sidebar-w: 15.5rem;
      --font-display: "Fraunces", Georgia, "Times New Roman", serif;
      --font-body: "DM Sans", ui-sans-serif, system-ui, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--font-body);
      background: var(--paper);
      color: var(--ink);
      -webkit-font-smoothing: antialiased;
    }
    a { color: var(--green-dark); }
    .pill-dark {
      display: inline-block;
      background: var(--ink);
      color: #fff !important;
      border-radius: 9999px;
      text-decoration: none;
      padding: 0.7rem 1.15rem;
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      transition: transform 180ms ease, background 180ms ease;
    }
    .pill-dark:hover { background: var(--green-dark); transform: translateY(-1px); }
    .page-shell { display: flex; min-height: 100vh; align-items: stretch; }
    .site-sidebar {
      width: var(--sidebar-w); min-width: var(--sidebar-w); flex-shrink: 0;
      background: #fff; border-right: 1px solid var(--line);
      padding: 1.75rem 1.35rem; display: flex; flex-direction: column;
      position: sticky; top: 0; height: 100vh; overflow-y: auto;
    }
    .sidebar-home-btn { display: flex; align-items: center; gap: 0.65rem; margin-bottom: 1.75rem; text-decoration: none; }
    .sidebar-home-btn img {
      height: 1.75rem; width: auto;
      filter: invert(18%) sepia(60%) saturate(800%) hue-rotate(120deg) brightness(70%) contrast(120%);
    }
    .sidebar-home-btn span {
      font-family: var(--font-display);
      font-size: 1.05rem; font-weight: 650; color: var(--green-dark); letter-spacing: -0.02em;
    }
    .side-nav { display: flex; flex-direction: column; gap: 1.05rem; }
    .side-link { font-size: 0.92rem; color: var(--ink); text-decoration: none; font-weight: 500; }
    .side-link:hover { color: var(--green-dark); }
    .side-link.active { font-weight: 700; text-decoration: underline; text-underline-offset: 5px; color: var(--green-dark); }
    .sidebar-spacer { margin-top: auto; padding-top: 1.5rem; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .sidebar-cta {
      display: block; overflow: hidden; border: 1px solid var(--line);
      background: var(--green-dark); color: #fff; font-size: 0.72rem; line-height: 1.4; text-decoration: none;
    }
    .sidebar-cta-title {
      padding: 0.55rem 0.8rem; border-bottom: 1px solid rgba(255,255,255,0.12);
      font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; font-size: 0.65rem;
    }
    .sidebar-cta-body { padding: 0.75rem 0.8rem; }
    .sidebar-cta-body p { margin: 0 0 0.45rem; color: #fff; }
    .sidebar-cta-body p:last-child { margin-bottom: 0; color: rgba(255,255,255,0.72); }
    .sidebar-cta-body p:first-child { font-weight: 600; font-size: 0.8rem; }
    .sidebar-legal { display: flex; align-items: center; gap: 0.55rem; margin-top: 0.25rem; padding-top: 0.75rem; border-top: 1px solid var(--line); }
    .sidebar-legal a { font-size: 10px !important; color: #9ca3af !important; text-decoration: none !important; }
    .sidebar-legal span { font-size: 10px; color: #d1d5db; }
    .mobile-topbar { display: none; }
    #sidebar-overlay { display: none; }
    .site-main { flex: 1; min-width: 0; background: var(--paper); }
    main.blog-main {
      max-width: 72rem;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }
    main.blog-main.is-index {
      max-width: none;
      margin: 0;
      padding: 0 0 4rem;
    }
    main.blog-main.is-article { max-width: 46rem; padding: 2.5rem 2rem 5rem; margin: 0 auto; }

    .blog-crumb { font-size: 0.75rem; color: var(--muted); margin: 0 1.5rem 0.5rem; letter-spacing: 0.02em; }
    main.blog-main.is-article .blog-crumb { margin: 0 0 1.25rem; }
    .blog-crumb a { color: var(--muted); text-decoration: none; }
    .blog-crumb a:hover { color: var(--green-dark); }

    .blog-hero {
      max-width: 72rem;
      margin: 0 auto;
      padding: 2.5rem 1.5rem 1.75rem;
      text-align: center;
    }
    .blog-kicker {
      margin: 0 0 0.85rem;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--green-dark);
    }
    .blog-hero h1 {
      margin: 0 0 0.85rem;
      font-family: var(--font-display);
      font-size: clamp(2.6rem, 7vw, 4.8rem);
      font-weight: 650;
      line-height: 0.98;
      letter-spacing: -0.035em;
      color: var(--ink);
    }
    .blog-hero-lead {
      margin: 0 auto;
      max-width: 34rem;
      font-size: 1.05rem;
      line-height: 1.55;
      color: var(--muted);
    }

    .story-strip-wrap {
      max-width: none;
      margin: 0 0 0.75rem;
      width: 100%;
    }
    .story-carousel.swiper {
      width: 100%;
      overflow: hidden;
      padding: 1.25rem 0 2rem;
    }
    .story-carousel .swiper-wrapper {
      align-items: stretch;
    }
    .story-carousel .swiper-slide {
      width: 260px;
      height: auto;
      margin: 0;
      transition: transform 300ms ease;
      transform: scale(0.825);
      transform-origin: center center;
    }
    .story-carousel .swiper-slide-active {
      transform: scale(1);
      z-index: 2;
    }
    .zoom-card {
      --page-color: #fff;
      --page-text-color: var(--ink);
      background: var(--page-color);
      color: var(--page-text-color);
      border-radius: 1.5rem;
      padding: 0.75rem 0.75rem 1rem;
      width: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      box-shadow: 0 10px 28px rgba(18, 18, 18, 0.08);
      height: 100%;
      min-height: 22.5rem;
    }
    .zoom-card.is-sky { --page-color: var(--sky); }
    .zoom-card.is-mint { --page-color: var(--mint); }
    .zoom-card.is-rose { --page-color: var(--rose); }
    .zoom-card.is-paper { --page-color: #fff; border: 1px solid var(--line); }
    .zoom-card-media {
      position: relative;
      display: block;
      width: 100%;
      height: 16rem;
      border-radius: 1.1rem;
      overflow: hidden;
      background: color-mix(in srgb, var(--ink) 8%, transparent);
      flex: 0 0 16rem;
    }
    .zoom-card-media img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      display: block;
      pointer-events: none;
    }
    .zoom-card-content {
      text-align: center;
      padding: 0 0.25rem;
      min-height: 3.6rem;
    }
    .zoom-card-link {
      text-decoration: none;
      color: inherit;
      display: block;
    }
    .zoom-card-title {
      margin: 0;
      font-family: var(--font-body);
      font-size: 0.78rem;
      line-height: 1.35;
      font-weight: 500;
      color: var(--page-text-color);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .zoom-card-title .t {
      font-family: var(--font-display);
      font-weight: 650;
    }

    .blog-toolbar {
      max-width: 72rem;
      margin: 0 auto;
      padding: 0 1.5rem 1.25rem;
    }
    .blog-filters { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0 0 0.65rem; }
    .blog-filter {
      appearance: none; border: 1px solid var(--line); background: #fff; color: var(--ink);
      border-radius: 999px; padding: 0.4rem 0.85rem; font-size: 0.78rem; font-weight: 600; cursor: pointer;
      font-family: inherit;
    }
    .blog-filter:hover { border-color: var(--green-dark); color: var(--green-dark); }
    .blog-filter.is-active { background: var(--ink); color: #fff; border-color: var(--ink); }
    .blog-filter-meta { font-size: 0.75rem; color: var(--muted); margin: 0; }

    .masonry-feed,
    .magazine-feed { display: flex; flex-direction: column; gap: 0; }
    .masonry-band,
    .magazine-band { padding: 2.5rem 0 3rem; }
    .masonry-band.is-empty,
    .magazine-band.is-empty { display: none; }
    .tone-paper { background: var(--paper); }
    .tone-sky { background: var(--sky); }
    .tone-mint { background: var(--mint); }
    .tone-rose { background: var(--rose); }
    .masonry-band-inner,
    .magazine-band-inner {
      max-width: 72rem;
      margin: 0 auto;
      padding: 0 1.5rem;
    }
    .blog-section-label {
      margin: 0 0 1.15rem;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--muted);
      text-align: center;
    }
    .selects-head .blog-section-label,
    .newsletter-copy .blog-section-label,
    .feature-hero-copy .blog-section-label { text-align: left; }

    .editorial-grid { display: flex; flex-direction: column; gap: 1.35rem; }
    .editorial-row {
      display: grid;
      gap: 1.15rem;
      align-items: stretch;
    }
    .editorial-row.is-split-wide { grid-template-columns: 1.7fr 1fr; }
    .editorial-row.is-split-narrow { grid-template-columns: 1fr 1.7fr; }
    .editorial-row.is-trio { grid-template-columns: repeat(3, 1fr); }

    .post-card,
    .select-card,
    .feature-hero {
      text-decoration: none;
      color: inherit;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .post-card,
    .select-card {
      background: #fff;
      transition: transform 220ms ease;
    }
    .post-card.tone-sky,
    .select-card.tone-sky { background: color-mix(in srgb, var(--sky) 70%, #fff); }
    .post-card.tone-mint,
    .select-card.tone-mint { background: color-mix(in srgb, var(--mint) 70%, #fff); }
    .post-card.tone-rose,
    .select-card.tone-rose { background: color-mix(in srgb, var(--rose) 70%, #fff); }
    .post-card.tone-paper,
    .select-card.tone-paper { background: color-mix(in srgb, var(--paper) 55%, #fff); }
    .post-card:hover,
    .select-card:hover { transform: translateY(-3px); }
    .post-card.is-hidden,
    .select-card.is-hidden,
    .feature-hero.is-hidden { display: none; }

    .card-media {
      position: relative;
      width: 100%;
      overflow: hidden;
      background: #ddd;
      aspect-ratio: 4 / 3;
    }
    .size-feature .card-media { aspect-ratio: 16 / 10; }
    .size-portrait .card-media { aspect-ratio: 4 / 5; }
    .size-tall .card-media { aspect-ratio: 3 / 4; }
    .size-std .card-media { aspect-ratio: 4 / 3; }
    .card-media.is-placeholder {
      background: linear-gradient(135deg, #dfe8e4, #c5d4ce);
      min-height: 12rem;
    }
    .card-media img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 480ms ease;
    }
    .card-media-veil {
      position: absolute;
      inset: 0;
      background: rgba(18, 18, 18, 0.0);
      transition: background 280ms ease;
      pointer-events: none;
    }
    .post-card:hover .card-media img,
    .select-card:hover .card-media img,
    .feature-hero:hover .card-media img { transform: scale(1.05); }
    .post-card:hover .card-media-veil,
    .select-card:hover .card-media-veil,
    .feature-hero:hover .card-media-veil { background: rgba(18, 18, 18, 0.08); }

    .card-copy { padding: 0.95rem 1rem 1.15rem; }
    .post-card .cat,
    .select-card .cat,
    .feature-hero .cat {
      display: block;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 0.45rem;
    }
    .post-card h2,
    .select-card h2 {
      margin: 0;
      font-family: var(--font-display);
      font-size: clamp(1.15rem, 2vw, 1.55rem);
      font-weight: 650;
      line-height: 1.12;
      letter-spacing: -0.025em;
      color: var(--ink);
    }
    .size-feature h2 {
      font-size: clamp(1.45rem, 2.8vw, 2.15rem);
    }
    .post-card p {
      margin: 0.55rem 0 0;
      font-size: 0.9rem;
      line-height: 1.5;
      color: var(--muted);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .feature-hero {
      display: grid;
      grid-template-columns: 1.35fr 1fr;
      gap: 1.5rem;
      align-items: center;
      background: transparent;
    }
    .feature-hero-media .card-media { aspect-ratio: 16 / 11; min-height: 18rem; }
    .feature-hero-copy h2 {
      margin: 0 0 0.75rem;
      font-family: var(--font-display);
      font-size: clamp(1.85rem, 4vw, 3rem);
      font-weight: 650;
      line-height: 1.05;
      letter-spacing: -0.03em;
      color: var(--ink);
    }
    .feature-hero-copy p {
      margin: 0 0 1.15rem;
      color: var(--muted);
      font-size: 1rem;
      line-height: 1.55;
      max-width: 28rem;
    }
    .feature-hero-cta {
      display: inline-block;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--green-dark);
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .selects-lead {
      margin: -0.35rem 0 1.25rem;
      max-width: 34rem;
      color: var(--muted);
      font-size: 0.95rem;
      line-height: 1.5;
    }
    .selects-rail {
      display: flex;
      align-items: stretch;
      gap: 1rem;
      overflow-x: auto;
      overflow-y: hidden;
      height: 24rem;
      padding-bottom: 0.35rem;
      scroll-snap-type: x mandatory;
      scrollbar-width: none;
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
      touch-action: pan-x;
    }
    .selects-rail.is-dragging { cursor: grabbing; scroll-snap-type: none; }
    .selects-rail::-webkit-scrollbar { display: none; }
    .select-card {
      flex: 0 0 15rem;
      width: 15rem;
      min-width: 15rem;
      max-width: 15rem;
      height: 22.5rem;
      min-height: 22.5rem;
      max-height: 22.5rem;
      scroll-snap-align: start;
      overflow: hidden;
      box-sizing: border-box;
    }
    .select-card .card-media {
      width: 100%;
      height: 15rem;
      min-height: 15rem;
      max-height: 15rem;
      aspect-ratio: auto;
      flex: 0 0 15rem;
    }
    .select-card .card-copy {
      height: 7.5rem;
      max-height: 7.5rem;
      overflow: hidden;
    }
    .select-card h2 {
      font-size: 1.05rem;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .newsletter-band { padding: 3rem 0; }
    .newsletter-layout {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 1.5rem;
      align-items: stretch;
    }
    .newsletter-copy h2 {
      margin: 0 0 0.65rem;
      font-family: var(--font-display);
      font-size: clamp(1.6rem, 3.2vw, 2.4rem);
      font-weight: 650;
      line-height: 1.08;
      letter-spacing: -0.03em;
      color: var(--ink);
    }
    .newsletter-copy > p {
      margin: 0 0 1.15rem;
      color: var(--muted);
      max-width: 28rem;
      line-height: 1.5;
    }
    .newsletter-form {
      display: flex;
      flex-wrap: wrap;
      gap: 0.55rem;
      max-width: 28rem;
    }
    .newsletter-form input {
      flex: 1 1 12rem;
      min-width: 0;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--ink);
      font: inherit;
      padding: 0.7rem 0.9rem;
    }
    .newsletter-form input:focus {
      outline: 2px solid var(--green-dark);
      outline-offset: 1px;
    }
    .newsletter-note {
      margin: 0.75rem 0 0;
      font-size: 0.85rem;
      color: var(--green-dark);
    }
    .newsletter-aside {
      min-height: 14rem;
      background:
        linear-gradient(160deg, color-mix(in srgb, var(--sky) 55%, transparent), transparent 60%),
        linear-gradient(20deg, color-mix(in srgb, var(--mint) 45%, transparent), var(--rose));
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .empty-feed { padding: 2rem 1.5rem; color: var(--muted); }

    .blog-back {
      display: inline-flex; align-items: center; gap: 0.3rem;
      font-size: 0.82rem; font-weight: 600; color: var(--green-dark);
      text-decoration: none; margin-bottom: 1.35rem;
    }
    .blog-back:hover { text-decoration: underline; text-underline-offset: 3px; }
    .blog-back-wrap { margin: 2rem 0 0; }
    .blog-meta {
      margin: 0 0 1rem;
      font-size: 0.78rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--green-dark);
    }
    .article-title {
      margin: 0 0 1rem;
      font-family: var(--font-display);
      font-size: clamp(2.2rem, 6vw, 3.75rem);
      font-weight: 650;
      line-height: 1.02;
      letter-spacing: -0.03em;
      color: var(--ink);
    }
    .speakable-summary {
      margin: 0 0 1.75rem;
      font-size: 1.15rem;
      line-height: 1.55;
      color: var(--muted);
      max-width: 36rem;
    }
    .blog-figure { margin: 0 0 1.75rem; }
    .blog-img { display: block; width: 100%; max-width: 100%; height: auto; }
    .blog-body {
      font-size: 1.05rem;
      line-height: 1.75;
      color: #2a2a2a;
    }
    .blog-body p { margin: 0 0 1.15rem; }
    .blog-body h2 {
      font-family: var(--font-display);
      font-size: 1.55rem;
      font-weight: 650;
      letter-spacing: -0.02em;
      color: var(--ink);
      margin: 2.2rem 0 0.75rem;
    }
    .blog-body h3 {
      font-family: var(--font-display);
      font-size: 1.25rem;
      font-weight: 650;
      color: var(--ink);
      margin: 1.75rem 0 0.55rem;
    }
    .blog-body ul, .blog-body ol { margin: 0 0 1.15rem 1.2rem; padding: 0; }
    .blog-body li { margin-bottom: 0.4rem; }
    .blog-body a { text-underline-offset: 3px; }
    .howto-block {
      margin: 2rem 0;
      padding: 1.25rem 1.35rem;
      background: #fff;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }
    .howto-block h2 { margin: 0 0 0.75rem; font-size: 1.15rem; }
    .howto-steps { margin: 0; padding-left: 1.2rem; color: #333; font-size: 0.95rem; line-height: 1.55; }
    .howto-steps li { margin: 0 0 0.45rem; }
    .blog-cta {
      margin-top: 2.5rem;
      padding: 1.5rem 0;
      border-top: 1px solid var(--line);
      border-bottom: 1px solid var(--line);
    }
    .blog-cta.band-cta {
      max-width: 72rem;
      margin: 2rem auto 0;
      padding: 2rem 1.5rem;
      border: none;
      text-align: center;
    }
    .blog-cta p { margin: 0 0 0.9rem; font-size: 1.05rem; color: var(--ink); font-family: var(--font-display); }
    .blog-disclaimer { margin-top: 1.5rem; font-size: 0.75rem; color: var(--muted); line-height: 1.5; }

    @media (max-width: 1000px) {
      .editorial-row.is-split-wide,
      .editorial-row.is-split-narrow,
      .editorial-row.is-trio { grid-template-columns: 1fr 1fr; }
      .feature-hero,
      .newsletter-layout { grid-template-columns: 1fr; }
      .newsletter-aside { min-height: 10rem; }
      .feature-hero-media .card-media { min-height: 14rem; }
    }
    @media (max-width: 700px) {
      .editorial-row.is-split-wide,
      .editorial-row.is-split-narrow,
      .editorial-row.is-trio { grid-template-columns: 1fr; }
      .size-feature .card-media,
      .size-portrait .card-media,
      .size-tall .card-media,
      .size-std .card-media,
      .feature-hero-media .card-media { aspect-ratio: 16 / 10; min-height: 0; }
      .blog-hero h1 { font-size: clamp(2.1rem, 11vw, 3.2rem); }
      .feature-hero-copy h2 { font-size: clamp(1.55rem, 7vw, 2.2rem); }
      .newsletter-copy h2 { font-size: clamp(1.4rem, 6.5vw, 1.9rem); }
      .newsletter-form { flex-direction: column; align-items: stretch; }
      .newsletter-form .pill-dark { width: 100%; text-align: center; }
      .story-carousel .swiper-slide { width: min(78vw, 280px); }
      .zoom-card { min-height: 20.5rem; }
      .zoom-card-media { height: 14rem; flex-basis: 14rem; }
      .selects-rail { height: 21.5rem; }
      .select-card {
        flex-basis: 13rem;
        width: 13rem;
        min-width: 13rem;
        max-width: 13rem;
        height: 20rem;
        min-height: 20rem;
        max-height: 20rem;
      }
      .select-card .card-media {
        height: 13rem;
        min-height: 13rem;
        max-height: 13rem;
        flex-basis: 13rem;
      }
      .select-card .card-copy { height: 7rem; max-height: 7rem; }
      .article-title { font-size: clamp(1.85rem, 9vw, 2.6rem); }
      .speakable-summary { font-size: 1.02rem; }
      .blog-body { font-size: 1rem; }
    }
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
        height: 3.25rem; padding: 0 1rem; border-bottom: 1px solid var(--line);
        background: rgba(249, 249, 249, 0.94); backdrop-filter: blur(10px);
      }
      .mobile-menu-toggle {
        display: inline-flex; align-items: center; justify-content: center; width: 2.15rem; height: 2.15rem;
        border-radius: 0.65rem; border: none; background: var(--green-dark); color: #fff; cursor: pointer;
      }
      .mobile-menu-toggle svg { width: 1.05rem; height: 1.05rem; stroke: currentColor; }
      .mobile-top-brand { display: flex; align-items: center; gap: 0.5rem; margin: 0 auto; text-decoration: none; }
      .mobile-top-brand img { height: 1.35rem; width: auto; }
      .mobile-top-brand span { font-family: var(--font-display); font-size: 0.95rem; font-weight: 650; color: var(--green-dark); }
      main.blog-main.is-article { padding: 1.5rem 1.1rem 3.5rem; }
      .blog-hero { padding: 1.5rem 1.1rem 1rem; }
      .blog-toolbar { padding-top: 0.25rem; }
      .blog-filters { gap: 0.35rem; }
      .blog-filter { padding: 0.35rem 0.7rem; font-size: 0.74rem; }
      .magazine-band { padding: 1.75rem 0 2rem; }
      .story-strip-wrap, .blog-toolbar, .masonry-band-inner, .magazine-band-inner, .blog-cta.band-cta { padding-left: 0; padding-right: 0; }
      .blog-toolbar, .magazine-band-inner, .masonry-band-inner, .blog-cta.band-cta { padding-left: 1.1rem; padding-right: 1.1rem; }
      .blog-crumb { margin-left: 1.1rem; margin-right: 1.1rem; }
      .newsletter-aside { display: none; }
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
        <div class="sidebar-legal">
          ${navLink('privacy', '/privacy', 'Privacy')}
          <span>&middot;</span>
          ${navLink('terms', '/terms', 'Terms')}
          <span>&middot;</span>
          ${navLink('sitemap', '/sitemap', 'Sitemap')}
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
      <main class="${mainClass}">
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
  </script>${swiperScript}
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
  // Date-only (YYYY-MM-DD) — cleaner XML and preferred by Google for sitemaps.
  return new Date(Math.max(...times)).toISOString().slice(0, 10);
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
    caption: `${SITE_IDENTITY.siteName} - ${SITE_IDENTITY.subCategory}`,
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
  // Keep image blocks lean: loc + title (+ caption when it differs).
  const lines = ['    <image:image>', `      <image:loc>${xmlEscape(img.loc)}</image:loc>`];
  if (img.title) lines.push(`      <image:title>${xmlEscape(img.title)}</image:title>`);
  if (img.caption && img.caption !== img.title) {
    lines.push(`      <image:caption>${xmlEscape(img.caption)}</image:caption>`);
  }
  lines.push('    </image:image>');
  return lines.join('\n');
}

function renderUrlEntry(entry) {
  const lines = [];
  if (entry.label) lines.push(`  <!-- ${entry.label} -->`);
  lines.push('  <url>', `    <loc>${xmlEscape(entry.loc)}</loc>`);
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

function writeHtmlSitemap(posts) {
  const corePages = [
    {
      href: '/',
      title: 'Home / Chat',
      blurb: 'Free AI chat for caregivers and families — mental health, addiction, and housing support. No account required.',
    },
    {
      href: '/blog',
      title: 'Blog',
      blurb: 'Practical articles on caregiver wellbeing, communication, grief, and next steps.',
    },
    {
      href: '/resources',
      title: 'Crisis & Support Resources',
      blurb: 'Verified crisis lines and Ontario local directories — Toronto shelter Central Intake, ConnexOntario detox referrals, 988, 211.',
    },
    {
      href: '/about',
      title: 'About Us',
      blurb: 'Who Liam\'s Call is, what we offer, and how the AI chat works.',
    },
    {
      href: '/privacy',
      title: 'Privacy Policy',
      blurb: 'How we handle chat data, approximate location, and third-party providers.',
    },
    {
      href: '/terms',
      title: 'Terms of Use',
      blurb: 'Rules for using Liam\'s Call AI support chat.',
    },
  ];

  const coreList = corePages
    .map(
      (p) => `
        <li class="sitemap-item">
          <a href="${escapeHtml(p.href)}"><strong>${escapeHtml(p.title)}</strong></a>
          <p>${escapeHtml(p.blurb)}</p>
        </li>`,
    )
    .join('\n');

  const postList = (posts || [])
    .map(
      (p) => `
        <li class="sitemap-item">
          <a href="/blog/${escapeHtml(p.slug)}"><strong>${escapeHtml(p.title)}</strong></a>
          <p>${escapeHtml(p.description || '')}${p.category ? ` · ${escapeHtml(p.category)}` : ''}${p.region ? ` · ${escapeHtml(p.region)}` : ''}</p>
        </li>`,
    )
    .join('\n');

  const bodyHtml = `
    <style>
      .sitemap-lead { margin: 0 0 1.5rem; color: #6b7280; font-size: 0.95rem; line-height: 1.6; }
      .sitemap-section { margin: 0 0 1.75rem; }
      .sitemap-section h2 {
        margin: 0 0 0.75rem; font-size: 1.05rem; color: var(--green-dark); letter-spacing: -0.02em;
      }
      .sitemap-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
      .sitemap-item {
        background: #fff; border: 1px solid #e5e7eb; border-radius: 0.85rem; padding: 0.9rem 1rem;
      }
      .sitemap-item a { text-decoration: none; color: var(--green-dark); }
      .sitemap-item a:hover { text-decoration: underline; text-underline-offset: 3px; }
      .sitemap-item p { margin: 0.35rem 0 0; color: #6b7280; font-size: 0.85rem; line-height: 1.5; }
      .sitemap-note {
        margin-top: 1.5rem; padding: 0.9rem 1rem; border-radius: 0.85rem;
        background: #fff; border: 1px dashed rgba(15,74,58,0.25); color: #6b7280; font-size: 0.82rem; line-height: 1.5;
      }
    </style>
    <h1>Sitemap</h1>
    <p class="sitemap-lead speakable-summary">
      ${escapeHtml(SITE_IDENTITY.shortDescription)}
    </p>
    <p class="sitemap-lead">
      Category: <strong>${escapeHtml(SITE_IDENTITY.category)}</strong>
      · Sub-category: <strong>${escapeHtml(SITE_IDENTITY.subCategory)}</strong>
      · Focus: Canada &amp; U.S., with Ontario local directories.
    </p>

    <section class="sitemap-section" aria-labelledby="sitemap-core">
      <h2 id="sitemap-core">Main pages</h2>
      <ul class="sitemap-list">${coreList}</ul>
    </section>

    <section class="sitemap-section" aria-labelledby="sitemap-blog">
      <h2 id="sitemap-blog">Blog articles</h2>
      <ul class="sitemap-list">${postList || '<li class="sitemap-item"><p>No posts published yet.</p></li>'}</ul>
    </section>

    <p class="sitemap-note">
      Looking for the machine-readable crawl file? Use
      <a href="/sitemap.xml">sitemap.xml</a> (for search engines).
      This page is the human-readable map of Liam's Call.
    </p>
  `;

  const html = blogShell({
    title: "Sitemap — Liam's Call",
    description:
      "Human-readable sitemap for Liam's Call — main pages, crisis resources, and blog articles for mental health, addiction, and housing support.",
    canonical: `${SITE}/sitemap`,
    active: 'sitemap',
    breadcrumb: '<span>Sitemap</span>',
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        organizationSchema(),
        {
          '@type': 'WebPage',
          '@id': `${SITE}/sitemap#page`,
          name: "Sitemap — Liam's Call",
          url: `${SITE}/sitemap`,
          description:
            "Human-readable site map of Liam's Call pages and blog articles.",
          isPartOf: { '@id': `${SITE}/#website` },
          speakable: speakableSpec(['h1', '.speakable-summary']),
        },
      ],
    },
    bodyHtml,
  });

  fs.writeFileSync(HTML_SITEMAP_PATH, html);
}

function writeSitemap(posts) {
  const publicDir = path.join(ROOT, 'public');
  const brandImage = defaultBrandImage();

  // Human-readable HTML sitemap first so it exists for the XML entry below.
  writeHtmlSitemap(posts);

  // Standalone content pages — keep in sync with server routes.
  // Brand images only on home; other URLs stay lean so the XML stays readable.
  const contentPages = [
    {
      route: '/',
      file: 'index.html',
      label: 'Home / Chat',
      priority: '1.0',
      changefreq: 'daily',
      images: [
        brandImage,
        {
          loc: `${SITE}/assets/logo-horizontal.svg`,
          title: `${SITE_IDENTITY.siteName} wordmark`,
          caption: 'Primary horizontal logo for Liam\'s Call',
        },
      ],
    },
    {
      route: '/blog',
      file: path.join('blog', 'index.html'),
      label: 'Blog index',
      priority: '0.9',
      changefreq: 'daily',
    },
    {
      route: '/resources',
      file: 'resources.html',
      label: 'Crisis & Support Resources',
      priority: '0.8',
      changefreq: 'weekly',
    },
    {
      route: '/about',
      file: 'about.html',
      label: 'About Us',
      priority: '0.7',
      changefreq: 'monthly',
    },
    {
      route: '/sitemap',
      file: 'sitemap.html',
      label: 'HTML sitemap (human-readable)',
      priority: '0.4',
      changefreq: 'weekly',
    },
    {
      route: '/privacy',
      file: 'privacy.html',
      label: 'Privacy Policy',
      priority: '0.5',
      changefreq: 'yearly',
    },
    {
      route: '/terms',
      file: 'terms.html',
      label: 'Terms of Use',
      priority: '0.5',
      changefreq: 'yearly',
    },
  ];

  const staticUrls = contentPages
    .filter((p) => fs.existsSync(path.join(publicDir, p.file)))
    .map((p) => {
      const loc = `${SITE}${p.route}`;
      return {
        label: p.label,
        loc,
        priority: p.priority,
        changefreq: p.changefreq,
        lastmod: bestLastmod(fileLastmod(path.join(publicDir, p.file))),
        hreflang: hreflangLinks(loc),
        images: p.images || [],
      };
    });

  const postUrls = posts.map((p) => {
    const loc = `${SITE}/blog/${p.slug}`;
    const htmlPath = path.join(PUBLIC_BLOG_DIR, p.slug, 'index.html');
    const mdPath = p.filePath || path.join(CONTENT_DIR, `${p.slug}.md`);
    const images = [];
    if (p.image) {
      images.push({
        loc: absoluteAssetUrl(p.image),
        title: p.title,
        caption: p.description || p.title,
      });
    }
    images.push(...extractBodyImages(p.body));

    return {
      label: p.title,
      loc,
      priority: '0.75',
      changefreq: 'weekly',
      lastmod: bestLastmod(toIsoDate(p.date), fileLastmod(mdPath), fileLastmod(htmlPath)),
      hreflang: hreflangLinks(loc),
      images,
    };
  });

  const coreBlock = staticUrls.map(renderUrlEntry).join('\n\n');
  const blogBlock = postUrls.map(renderUrlEntry).join('\n\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
${sitemapXmlComment()}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

  <!-- ========== Core pages ========== -->
${coreBlock}

  <!-- ========== Blog articles ========== -->
${blogBlock}

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
          html: `${SITE}/sitemap`,
          extensions: ['xhtml/hreflang', 'image'],
          notes:
            'XML sitemap is for crawlers. /sitemap is the human-readable HTML map. Video and Google News extensions omitted until live.',
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
