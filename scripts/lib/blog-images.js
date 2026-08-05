'use strict';

/**
 * Blog hero images for Liam's Call.
 *
 * Priority order:
 *   1. Unsplash Search API using keywords built from the post's title / angle /
 *      description / category — best relevance, needs UNSPLASH_ACCESS_KEY.
 *   2. Curated per-theme stock pool (works with no API key).
 *   3. og:image from the inspiration source page (allowlisted hosts).
 *
 * Every choice is recorded in content/blog/image-manifest.json so a photo used by
 * one post is not reused by another.
 *
 * Images are saved under public/assets/blog/ and referenced as /assets/blog/{slug}.jpg
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, ensureDir, toSlug } = require('./blog-utils');

const BLOG_ASSET_DIR = path.join(ROOT, 'public', 'assets', 'blog');
const PUBLIC_PREFIX = '/assets/blog';
const MANIFEST_PATH = path.join(ROOT, 'content', 'blog', 'image-manifest.json');
const UNSPLASH_SEARCH_ENDPOINT = 'https://api.unsplash.com/search/photos';

/** Hosts we may copy og:image from (same allowlist spirit as blog links). */
const SOURCE_IMAGE_HOSTS = new Set([
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
  'toronto.ca',
  'www.toronto.ca',
  'samhsa.gov',
  'www.samhsa.gov',
  'kidshelpphone.ca',
  'www.kidshelpphone.ca',
  'mentalhealthcommission.ca',
  'www.mentalhealthcommission.ca',
  'images.unsplash.com',
  'plus.unsplash.com',
]);

/**
 * Keyword-matched stock themes. Each theme has:
 *   - keywords: scored against title (x3), angle (x2), description (x1)
 *   - queries: Unsplash Search API phrases, most specific first
 *   - photos: curated fallback photo ids used when no API key is configured
 *
 * Prefer concrete, human, calm scenes — avoid abstract blobs / logos.
 */
const THEME_RULES = [
  {
    theme: 'housing',
    keywords: [
      'housing', 'homeless', 'shelter', 'evict', 'unhoused', 'apartment',
      'rent', 'couch', 'sofa surfing', 'place to stay', 'roof',
    ],
    queries: [
      'apartment doorway home evening',
      'packed bag small room',
      'quiet home interior window light',
    ],
    photos: [
      'photo-1480074568708-e7b720bb3f09', // house at dusk
      'photo-1505693416388-ac5ce068fe85', // calm bedroom
      'photo-1493663284031-b7e3aefcae8e', // warm home interior
      'photo-1560448204-e02f11c3d0e2', // quiet living room
      'photo-1523217582562-09d0def993a6', // house exterior evening
      'photo-1502005229762-cf1b2da7c5d6', // apartment building
      'photo-1568605114967-8130f3a36994', // home at dusk
      'photo-1449844908441-8829872d2607', // suburban house
    ],
  },
  {
    theme: 'recovery',
    keywords: [
      'addiction', 'detox', 'substance', 'recovery', 'sober', 'treatment',
      'relapse', 'alcohol', 'drugs', 'using', 'rehab',
    ],
    queries: [
      'support group circle talking',
      'walking path morning light recovery',
      'hand on shoulder support',
    ],
    photos: [
      'photo-1476514525535-07fb3b4ae5f1', // road ahead / journey
      'photo-1449824913935-59a10b8d2000', // path forward
      'photo-1469571486292-0ba58a3f068b', // friends supporting each other
      'photo-1506126613408-eca07ce68773', // quiet stretch / grounding
      'photo-1516450360452-9312f5e86fc7', // open road
      'photo-1494548162494-384bba4ab999', // path through trees
      'photo-1524397057410-1e775ed476f3', // sunrise walk
      'photo-1523240795612-9a054b0db644', // group support table
    ],
  },
  {
    theme: 'grief',
    keywords: [
      'grief', 'loss', 'bereave', 'anticipatory', 'dying', 'mourning',
      'still here', 'farewell', 'goodbye', 'hospice', 'palliative',
    ],
    queries: [
      'empty chair window soft light',
      'holding hands hospital gentle',
      'misty quiet forest morning',
    ],
    photos: [
      'photo-1441974231531-c6227db76b6e', // quiet forest
      'photo-1499209974431-9dddcece7f88', // soft sunset
      'photo-1470071459604-3b5ec3a7fe05', // misty hills
      'photo-1518173946687-a4c8892bbd9f', // soft window light
      'photo-1447752875215-b2761acb3c5d', // forest path
      'photo-1502082553048-f009c37129b9', // sunlight through trees
      'photo-1518495973542-4542c06a5843', // sun through leaves
      'photo-1495653797063-114787b77b23', // rain on window
    ],
  },
  {
    theme: 'boundaries',
    keywords: [
      'boundary', 'boundaries', 'saying no', 'say no', 'no without',
      'limit', 'overcommitted', 'people-pleas', 'people pleas',
    ],
    queries: [
      'two people serious conversation table',
      'person alone calm doorway',
      'closed door quiet room',
    ],
    photos: [
      'photo-1529156069898-49953e39b3ac', // friends outdoors — space + connection
      'photo-1573497620053-ea5300f94f21', // measured conversation
      'photo-1495474472287-4d71bcdd2085', // solo coffee moment
      'photo-1488521787991-ed7bbaae773c', // two people talking
      'photo-1517048676732-d65bc937f952', // meeting conversation
      'photo-1522202176988-66273c2fd55f', // friends outdoors
      'photo-1521737604893-d14cc237f11d', // group talking
    ],
  },
  {
    theme: 'sleep',
    keywords: [
      'sleep', 'night', 'overnight', 'insomnia', 'night-shift', 'night shift',
      'broken sleep', 'awake', '3 a.m', '3am', 'bedside',
    ],
    queries: [
      'bedside lamp night quiet',
      'window at night city calm',
      'made bed morning light',
    ],
    photos: [
      'photo-1511295742362-92c96b1cf484', // quiet night window
      'photo-1505693416388-ac5ce068fe85', // soft bedroom
      'photo-1518173946687-a4c8892bbd9f', // lamp / soft indoor light
      'photo-1531353826977-0941b4779a1c', // night window
      'photo-1470252649378-9c29740c9fa8', // night sky
      'photo-1497294815431-9365093b7331', // bedroom morning
    ],
  },
  {
    theme: 'siblings-family',
    keywords: [
      'sibling', 'brother', 'sister', 'family meeting', 'sharing care',
      'relative', 'in-law', 'parent', 'parents', 'adult child',
    ],
    queries: [
      'family sitting around kitchen table talking',
      'adult siblings conversation home',
      'multigenerational family together',
    ],
    photos: [
      'photo-1511895426328-dc8714191300', // family around a table
      'photo-1600880292203-757bb62b4baf', // two people talking
      'photo-1469571486292-0ba58a3f068b', // supportive group
      'photo-1543269865-cbf427effbad', // people at a table
      'photo-1478476868527-002ae3f3e159', // family together
      'photo-1529156069898-49953e39b3ac', // family outdoors
    ],
  },
  {
    theme: 'identity',
    keywords: [
      'who am i', 'identity', 'besides a caregiver', 'myself',
      'hobby', 'hobbies', 'reclaim', 'own life',
    ],
    queries: [
      'person reading alone window peaceful',
      'walking alone outdoors morning',
      'hands hobby craft table',
    ],
    photos: [
      'photo-1506126613408-eca07ce68773', // person stretching outdoors
      'photo-1476514525535-07fb3b4ae5f1', // open road / journey
      'photo-1469474968028-56623f02e42e', // sunrise field
      'photo-1483721310020-03333e577078', // person reading
      'photo-1499996860823-5214fcc65f8f', // person outdoors
      'photo-1508672019048-805c876b67e2', // solo viewpoint
    ],
  },
  {
    theme: 'guilt-anger',
    keywords: [
      'guilt', 'angry', 'snap', 'resent', 'furious',
      'lost your temper', 'regret', 'ashamed', 'frustrat',
    ],
    queries: [
      'person sitting head in hands quiet',
      'rain on window reflective',
      'walking outside cooling off',
    ],
    photos: [
      'photo-1499209974431-9dddcece7f88', // soft sunset — cool-down
      'photo-1441974231531-c6227db76b6e', // quiet forest walk
      'photo-1495653797063-114787b77b23', // rain on window
      'photo-1502082553048-f009c37129b9', // sunlight through trees
      'photo-1447752875215-b2761acb3c5d', // forest path
      'photo-1470071459604-3b5ec3a7fe05', // misty hills
      'photo-1518173946687-a4c8892bbd9f', // soft window light
    ],
  },
  {
    theme: 'connection',
    keywords: [
      'ask for help', 'asking', 'conversation', 'talk', 'support network',
      'friend', 'friends', 'lonely', 'isolation', 'reach out', 'listening',
      'hard conversation', 'script',
    ],
    queries: [
      'two people talking coffee listening',
      'friend comforting another person',
      'phone call sitting at home',
    ],
    photos: [
      'photo-1600880292203-757bb62b4baf', // two people talking
      'photo-1529156069898-49953e39b3ac', // group of friends
      'photo-1521791136064-7986c2920216', // hands together, support
      'photo-1488521787991-ed7bbaae773c', // two people conversation
      'photo-1543269865-cbf427effbad', // people at a table
      'photo-1524504388940-b1c1722653e1', // two women talking
    ],
  },
  {
    theme: 'rest',
    keywords: [
      'reset', 'break', 'burnout', 'rest', 'empty cup', 'micro', 'pause',
      'exhaust', 'recharge', 'self-care', 'self care', 'breathe', 'breathing',
    ],
    queries: [
      'hands holding warm mug calm',
      'person breathing outdoors calm',
      'quiet corner chair tea',
    ],
    photos: [
      'photo-1495474472287-4d71bcdd2085', // warm coffee cup
      'photo-1506126613408-eca07ce68773', // quiet stretch / breathing
      'photo-1518173946687-a4c8892bbd9f', // soft indoor pause
      'photo-1499750310107-5fef28a66643', // coffee moment
      'photo-1517842645767-c639042777db', // notebook and tea
      'photo-1447452001602-7090c7ab2db3', // tea cup
    ],
  },
  {
    theme: 'routine',
    keywords: [
      'routine', 'schedule', 'checklist', 'plan', 'habit', 'appointment',
      'organize', 'calendar', 'go-bag', 'go bag', 'packing', 'prepare',
    ],
    queries: [
      'notebook checklist planning desk',
      'calendar planner week writing',
      'packing a bag organized',
    ],
    photos: [
      'photo-1450101499163-c8848c66ca85', // notebook / planning
      'photo-1506905925346-21bda4d32df4', // steady horizon
      'photo-1469474968028-56623f02e42e', // sunrise over a field
      'photo-1454165804606-c3d57bc86b40', // planning desk
      'photo-1434030216411-0b793f4b4173', // notebook writing
      'photo-1517842645767-c639042777db', // journal and tea
    ],
  },
  {
    theme: 'crisis-support',
    keywords: [
      'crisis', '988', 'helpline', 'help line', 'emergency', 'er visit',
      'hospital', '911', 'hotline', 'suicid',
    ],
    queries: [
      'hospital waiting room quiet hallway',
      'phone in hand calling for help',
      'nurse talking with patient calm',
    ],
    photos: [
      'photo-1576091160399-112ba8d25d1d', // healthcare context
      'photo-1559839734-2b71ea197ec2', // clinician listening
      'photo-1573496359142-b8d87734a5a2', // clinician with patient
      'photo-1519494026892-80bbd2d6fd0d', // hospital corridor
      'photo-1584515933487-779824d29309', // healthcare setting
      'photo-1631217868264-e5b90bb7e133', // clinical care
    ],
  },
  {
    theme: 'caregiving',
    keywords: [
      'caregiver', 'caregiving', 'caring for', 'looking after', 'loved one',
      'help them', 'supporting someone', 'beside',
    ],
    queries: [
      'caregiver holding hand older person',
      'person helping family member at home',
      'gentle hands support together',
    ],
    photos: [
      'photo-1505455184862-554165e5f6ba', // holding an older person's hands
      'photo-1521791136064-7986c2920216', // caring hands together
      'photo-1511895426328-dc8714191300', // family closeness
      'photo-1559839734-2b71ea197ec2', // attentive listening
      'photo-1516307365426-bea591f05011', // holding hands close
      'photo-1543269865-cbf427effbad', // family table
    ],
  },
];

/** Words that add nothing to an image search. */
const QUERY_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'for', 'to', 'of', 'in', 'on', 'at',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that',
  'with', 'without', 'your', 'you', 'their', 'them', 'they', 'when', 'what',
  'how', 'why', 'who', 'not', 'can', 'cant', 'do', 'does', 'dont', 'from',
  'about', 'into', 'after', 'before', 'while', 'still', 'here', 'there',
  'first', 'next', 'guide', 'tips', 'things', 'ways', 'help', 'need',
  'if', 'my', 'me', 'we', 'our', 'us', 'so', 'no', 'yes', 'get', 'got',
  'hour', 'hours', 'minute', 'minutes', 'day', 'days',
]);

/** Category fallback when no keyword rule matches. */
const CATEGORY_THEME = {
  homelessness: 'housing',
  housing: 'housing',
  addiction: 'recovery',
  'mental health': 'connection',
  'care giver tips': 'caregiving',
  caregiving: 'caregiving',
  'caregiver wellbeing': 'rest',
  communication: 'connection',
  'crisis resources': 'crisis-support',
  'practical tips': 'routine',
};

function scoreTheme(rule, { title = '', angle = '', description = '', category = '' }) {
  const titleHay = String(title).toLowerCase();
  const angleHay = String(angle).toLowerCase();
  const descHay = String(description).toLowerCase();
  const catHay = String(category).toLowerCase();
  let score = 0;
  for (const kw of rule.keywords) {
    const needle = kw.toLowerCase();
    if (titleHay.includes(needle)) score += 3;
    if (angleHay.includes(needle)) score += 2;
    if (descHay.includes(needle)) score += 1;
    if (catHay.includes(needle)) score += 1;
  }
  return score;
}

function pickTheme({ title = '', angle = '', description = '', category = '' }) {
  let best = null;
  let bestScore = 0;
  for (const rule of THEME_RULES) {
    const score = scoreTheme(rule, { title, angle, description, category });
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  if (best && bestScore > 0) return best;

  const byCat = CATEGORY_THEME[String(category).trim().toLowerCase()];
  return (
    THEME_RULES.find((r) => r.theme === byCat) ||
    THEME_RULES.find((r) => r.theme === 'caregiving')
  );
}

function stockUrl(photoId, width = 1600) {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&q=80`;
}

function slugHash(value) {
  return [...String(value || 'x')].reduce((n, ch) => n + ch.charCodeAt(0), 0);
}

function pickStockPhoto({ category, title, angle, description, slug, avoid, avoidIds }) {
  const rule = pickTheme({ title, angle, description, category });
  const hash = slugHash(slug || title);
  const n = rule.photos.length;
  for (let step = 0; step < n; step += 1) {
    const photoId = rule.photos[(hash + step) % n];
    const url = stockUrl(photoId);
    const usedUrl = avoid && avoid.has(url);
    const usedId = avoidIds && avoidIds.has(photoId);
    if (!usedUrl && !usedId) return { url, photoId, theme: rule.theme };
  }
  const fallbackId = rule.photos[hash % n];
  return { url: stockUrl(fallbackId), photoId: fallbackId, theme: rule.theme };
}

/** Ordered curated candidates for a theme, starting at the slug's offset. */
function stockCandidates({ category, title, angle, description, slug }) {
  const rule = pickTheme({ title, angle, description, category });
  const hash = slugHash(slug || title);
  const n = rule.photos.length;
  const out = [];
  for (let step = 0; step < n; step += 1) {
    const photoId = rule.photos[(hash + step) % n];
    out.push({ photoId, url: stockUrl(photoId), theme: rule.theme });
  }
  return { theme: rule.theme, candidates: out };
}

/* ─── Used-image manifest ──────────────────────────────────────────────────── */

function loadImageManifest() {
  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    if (parsed && typeof parsed === 'object' && parsed.posts) return parsed;
  } catch {
    /* first run / unreadable → start fresh */
  }
  return { posts: {} };
}

function saveImageManifest(manifest) {
  ensureDir(path.dirname(MANIFEST_PATH));
  const sorted = {};
  for (const key of Object.keys(manifest.posts || {}).sort()) {
    sorted[key] = manifest.posts[key];
  }
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify({ posts: sorted }, null, 2)}\n`);
}

/** Photo ids already used by other posts, so we never repeat one. */
function usedPhotoIds(excludeSlug = '') {
  const manifest = loadImageManifest();
  const skip = toSlug(excludeSlug);
  const ids = new Set();
  for (const [slug, entry] of Object.entries(manifest.posts || {})) {
    if (slug === skip) continue;
    if (entry && entry.photoId) ids.add(entry.photoId);
  }
  return ids;
}

function fileSha1(filePath) {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
  } catch {
    return '';
  }
}

/**
 * Image fingerprints already on disk. Catches duplicates even for older posts
 * whose photo id was never recorded, or the same photo served under two ids.
 */
function usedFileHashes(excludeSlug = '') {
  const manifest = loadImageManifest();
  const skip = toSlug(excludeSlug);
  const hashes = new Set();
  for (const [slug, entry] of Object.entries(manifest.posts || {})) {
    if (slug === skip) continue;
    if (entry && entry.fileHash) hashes.add(entry.fileHash);
  }
  return hashes;
}

/**
 * Record fingerprints for hero images already on disk but missing from the
 * manifest, so posts written before this manifest existed still block reuse.
 */
function seedManifestFromExistingFiles() {
  if (!fs.existsSync(BLOG_ASSET_DIR)) return;
  const manifest = loadImageManifest();
  let changed = false;
  for (const name of fs.readdirSync(BLOG_ASSET_DIR)) {
    if (!/\.(jpe?g|png|webp)$/i.test(name)) continue;
    const slug = toSlug(name.replace(/\.[^.]+$/, ''));
    if (!slug || manifest.posts[slug]) continue;
    const hash = fileSha1(path.join(BLOG_ASSET_DIR, name));
    if (!hash) continue;
    manifest.posts[slug] = { photoId: '', fileHash: hash, origin: 'legacy' };
    changed = true;
  }
  if (changed) saveImageManifest(manifest);
}

function recordImageChoice(slug, entry) {
  const manifest = loadImageManifest();
  manifest.posts[toSlug(slug)] = {
    ...entry,
    updated: new Date().toISOString().slice(0, 10),
  };
  saveImageManifest(manifest);
}

/* ─── Unsplash Search API ─────────────────────────────────────────────────── */

function unsplashKey() {
  return String(process.env.UNSPLASH_ACCESS_KEY || '').trim();
}

/** Salient words from the post title, for a title-derived search query. */
function titleQuery(title) {
  const words = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !QUERY_STOPWORDS.has(w));
  return words.slice(0, 4).join(' ');
}

/**
 * Search phrases for a post, most specific first: the post's own words, then the
 * theme's curated phrases.
 */
function buildImageQueries({ title, angle, description, category }) {
  const rule = pickTheme({ title, angle, description, category });
  const queries = [];
  const fromTitle = titleQuery(title);
  if (fromTitle) queries.push(fromTitle);
  for (const q of rule.queries || []) queries.push(q);
  return { theme: rule.theme, queries: [...new Set(queries)].filter(Boolean) };
}

async function searchUnsplash(query, { perPage = 24 } = {}) {
  const key = unsplashKey();
  if (!key) return [];
  const url = new URL(UNSPLASH_SEARCH_ENDPOINT);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('content_filter', 'high');

  const res = await fetch(url.href, {
    headers: {
      Authorization: `Client-ID ${key}`,
      'Accept-Version': 'v1',
      'User-Agent': "LiamsCallBlogBot/1.0 (+https://liamscall.com; hero image search)",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Unsplash search failed ${res.status} for "${query}"`);
  const data = await res.json();
  return (data.results || [])
    .filter((r) => r && r.id && r.urls && (r.urls.raw || r.urls.regular))
    .map((r) => ({
      photoId: r.id,
      url: r.urls.raw
        ? `${r.urls.raw}&auto=format&fit=crop&w=1600&q=80`
        : r.urls.regular,
      downloadLocation: r.links && r.links.download_location ? r.links.download_location : '',
      credit: {
        name: (r.user && r.user.name) || '',
        username: (r.user && r.user.username) || '',
        link: (r.user && r.user.links && r.user.links.html) || '',
      },
    }));
}

/** Unsplash API guideline: ping download_location when a photo is actually used. */
async function pingUnsplashDownload(downloadLocation) {
  const key = unsplashKey();
  if (!key || !downloadLocation) return;
  try {
    await fetch(downloadLocation, {
      headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* attribution ping is best-effort */
  }
}

function isAllowedImageHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (SOURCE_IMAGE_HOSTS.has(host)) return true;
  if (host.endsWith('.unsplash.com')) return true;
  if (host.endsWith('.samhsa.gov')) return true;
  return false;
}

async function downloadToFile(url, destPath) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': "LiamsCallBlogBot/1.0 (+https://liamscall.com; blog image attach)",
      Accept: 'image/*,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Image download failed ${res.status} for ${url}`);
  const type = String(res.headers.get('content-type') || '');
  if (type && !type.startsWith('image/')) {
    throw new Error(`Not an image content-type: ${type}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 2000) throw new Error('Image too small / empty');
  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, buf);
  return destPath;
}

function extractOgImage(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

/**
 * Fetch the source article page and return its og:image URL when safe.
 */
async function tryOgImageFromSource(pageUrl) {
  if (!pageUrl) return '';
  let page;
  try {
    page = new URL(pageUrl);
  } catch {
    return '';
  }
  if (page.protocol !== 'https:' && page.protocol !== 'http:') return '';

  const bare = page.hostname.replace(/^www\./, '');
  const hostOk =
    isAllowedImageHost(page.hostname) ||
    [...SOURCE_IMAGE_HOSTS].some((h) => {
      const b = h.replace(/^www\./, '');
      return b === bare || bare.endsWith(`.${b}`);
    }) ||
    bare.endsWith('.gov') ||
    bare.endsWith('.ca') ||
    bare.endsWith('.org');
  if (!hostOk) return '';

  const res = await fetch(page.href, {
    redirect: 'follow',
    headers: {
      'User-Agent': "LiamsCallBlogBot/1.0 (+https://liamscall.com; og:image discovery)",
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return '';
  const html = await res.text();
  const og = extractOgImage(html);
  if (!og) return '';
  let imgUrl;
  try {
    imgUrl = new URL(og, page.href);
  } catch {
    return '';
  }
  if (imgUrl.protocol !== 'https:' && imgUrl.protocol !== 'http:') return '';
  const imgBare = imgUrl.hostname.replace(/^www\./, '');
  if (
    !isAllowedImageHost(imgUrl.hostname) &&
    imgUrl.hostname !== page.hostname &&
    !imgBare.endsWith(bare.split('.').slice(-2).join('.'))
  ) {
    return '';
  }
  return imgUrl.href;
}

function publicPathForSlug(slug) {
  return `${PUBLIC_PREFIX}/${toSlug(slug)}.jpg`;
}

function diskPathForSlug(slug) {
  return path.join(BLOG_ASSET_DIR, `${toSlug(slug)}.jpg`);
}

/**
 * Ensure a local hero image exists for a post.
 *
 * Returns { path, origin, photoId?, credit? } where origin is
 * 'existing', 'search:<query>', 'stock:<theme>', or 'source'.
 */
async function ensurePostImage({
  slug,
  category = '',
  title = '',
  angle = '',
  description = '',
  sourceUrl = '',
  force = false,
  avoidStockUrls = null,
  preferSource = false,
} = {}) {
  const safeSlug = toSlug(slug || title);
  if (!safeSlug) throw new Error('slug required for blog image');
  const dest = diskPathForSlug(safeSlug);
  const pub = publicPathForSlug(safeSlug);

  if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 2000) {
    return { path: pub, origin: 'existing' };
  }

  ensureDir(BLOG_ASSET_DIR);

  // Never reuse a photo another post already owns.
  seedManifestFromExistingFiles();
  const takenIds = usedPhotoIds(safeSlug);
  const takenHashes = usedFileHashes(safeSlug);

  /**
   * Download a candidate and report whether its bytes are new. Returns the file
   * hash, or null when the image duplicates another post's hero.
   */
  const downloadUnique = async (candidate) => {
    await downloadToFile(candidate.url, dest);
    const hash = fileSha1(dest);
    return hash && takenHashes.has(hash) ? null : hash;
  };

  const trySource = async () => {
    if (!sourceUrl) return null;
    try {
      const og = await tryOgImageFromSource(sourceUrl);
      if (!og) return null;
      await downloadToFile(og, dest);
      recordImageChoice(safeSlug, {
        photoId: `source:${og}`,
        url: og,
        origin: 'source',
        fileHash: fileSha1(dest),
      });
      return { path: pub, origin: 'source', sourcePage: sourceUrl };
    } catch {
      return null;
    }
  };

  // 1. Unsplash search on the post's own keywords (best relevance).
  const trySearch = async () => {
    if (!unsplashKey()) return null;
    const { queries } = buildImageQueries({ title, angle, description, category });
    const offset = slugHash(safeSlug);
    for (const query of queries) {
      let results;
      try {
        results = await searchUnsplash(query);
      } catch (err) {
        console.warn(`Unsplash search error for "${query}": ${err.message || err}`);
        continue;
      }
      const fresh = results.filter(
        (r) => !takenIds.has(r.photoId) && !(avoidStockUrls && avoidStockUrls.has(r.url)),
      );
      if (!fresh.length) continue;
      // Rotate the starting point so similar posts don't all take the top hit.
      const ordered = fresh
        .slice(offset % fresh.length)
        .concat(fresh.slice(0, offset % fresh.length));
      for (const candidate of ordered.slice(0, 5)) {
        let hash;
        try {
          hash = await downloadUnique(candidate);
        } catch {
          continue;
        }
        if (!hash) continue;
        await pingUnsplashDownload(candidate.downloadLocation);
        if (avoidStockUrls) avoidStockUrls.add(candidate.url);
        recordImageChoice(safeSlug, {
          photoId: candidate.photoId,
          url: candidate.url,
          origin: `search:${query}`,
          credit: candidate.credit,
          fileHash: hash,
        });
        return {
          path: pub,
          origin: `search:${query}`,
          photoId: candidate.photoId,
          credit: candidate.credit,
        };
      }
    }
    return null;
  };

  // 2. Curated pool, skipping anything already used elsewhere.
  const tryStock = async () => {
    const { theme, candidates } = stockCandidates({
      category,
      title,
      angle,
      description,
      slug: safeSlug,
    });
    const fresh = candidates.filter(
      (c) => !takenIds.has(c.photoId) && !(avoidStockUrls && avoidStockUrls.has(c.url)),
    );
    let reusable = null;
    for (const candidate of fresh) {
      let hash;
      try {
        hash = await downloadUnique(candidate);
      } catch {
        continue;
      }
      if (!hash) {
        reusable = reusable || candidate;
        continue;
      }
      if (avoidStockUrls) avoidStockUrls.add(candidate.url);
      recordImageChoice(safeSlug, {
        photoId: candidate.photoId,
        url: candidate.url,
        origin: `stock:${theme}`,
        fileHash: hash,
      });
      return { path: pub, origin: `stock:${theme}`, photoId: candidate.photoId, stockUrl: candidate.url };
    }

    // Pool exhausted: reuse a themed photo rather than failing the build.
    for (const candidate of [reusable, ...candidates].filter(Boolean)) {
      try {
        await downloadToFile(candidate.url, dest);
      } catch {
        continue;
      }
      if (avoidStockUrls) avoidStockUrls.add(candidate.url);
      recordImageChoice(safeSlug, {
        photoId: candidate.photoId,
        url: candidate.url,
        origin: `stock:${theme}:reused`,
        fileHash: fileSha1(dest),
      });
      return { path: pub, origin: `stock:${theme}`, photoId: candidate.photoId, stockUrl: candidate.url };
    }
    throw new Error(`No downloadable stock photo for theme ${theme}`);
  };

  if (preferSource) {
    const fromSource = await trySource();
    if (fromSource) return fromSource;
  }

  const fromSearch = await trySearch();
  if (fromSearch) return fromSearch;

  try {
    return await tryStock();
  } catch (err) {
    console.warn(`Stock hero failed (${err.message || err}); trying source og:image`);
    const fromSource = await trySource();
    if (fromSource) return fromSource;
    throw err;
  }
}

function setFrontmatterImage(markdown, imagePath) {
  const text = String(markdown || '');
  if (!text.startsWith('---')) {
    return `---\nimage: ${JSON.stringify(imagePath)}\n---\n\n${text}`;
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) return text;
  let fm = text.slice(0, end + 4);
  const body = text.slice(end + 4).replace(/^\s*\n/, '');
  if (/^image:/m.test(fm)) {
    fm = fm.replace(/^image:\s*.*$/m, `image: ${JSON.stringify(imagePath)}`);
  } else {
    fm = fm.replace(/\n---\s*$/, `\nimage: ${JSON.stringify(imagePath)}\n---`);
  }
  return `${fm}\n${body.trim()}\n`;
}

module.exports = {
  BLOG_ASSET_DIR,
  MANIFEST_PATH,
  ensurePostImage,
  pickStockPhoto,
  stockCandidates,
  pickTheme,
  buildImageQueries,
  searchUnsplash,
  loadImageManifest,
  saveImageManifest,
  seedManifestFromExistingFiles,
  usedPhotoIds,
  usedFileHashes,
  setFrontmatterImage,
  publicPathForSlug,
  tryOgImageFromSource,
};
