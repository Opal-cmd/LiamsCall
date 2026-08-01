'use strict';

/**
 * Blog hero images for Liam's Call.
 *
 * Priority order:
 *   1. Keyword-matched Unsplash stock chosen from title + angle + description
 *      + category — the image should feel related to the post's subject.
 *   2. og:image from the inspiration source page (allowlisted hosts), when stock
 *      download fails.
 *
 * Images are saved under public/assets/blog/ and referenced as /assets/blog/{slug}.jpg
 */

const fs = require('fs');
const path = require('path');
const { ROOT, ensureDir, toSlug } = require('./blog-utils');

const BLOG_ASSET_DIR = path.join(ROOT, 'public', 'assets', 'blog');
const PUBLIC_PREFIX = '/assets/blog';

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
 *   - photos: Unsplash photo path ids verified to download
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
    photos: [
      'photo-1480074568708-e7b720bb3f09', // house at dusk
      'photo-1505693416388-ac5ce068fe85', // calm bedroom
      'photo-1493663284031-b7e3aefcae8e', // warm home interior
      'photo-1560448204-e02f11c3d0e2', // quiet living room
    ],
  },
  {
    theme: 'recovery',
    keywords: [
      'addiction', 'detox', 'substance', 'recovery', 'sober', 'treatment',
      'relapse', 'alcohol', 'drugs', 'using', 'rehab',
    ],
    photos: [
      'photo-1476514525535-07fb3b4ae5f1', // road ahead / journey
      'photo-1449824913935-59a10b8d2000', // path forward
      'photo-1469571486292-0ba58a3f068b', // friends supporting each other
      'photo-1506126613408-eca07ce68773', // quiet stretch / grounding
    ],
  },
  {
    theme: 'grief',
    keywords: [
      'grief', 'loss', 'bereave', 'anticipatory', 'dying', 'mourning',
      'still here', 'farewell', 'goodbye', 'hospice', 'palliative',
    ],
    photos: [
      'photo-1441974231531-c6227db76b6e', // quiet forest
      'photo-1499209974431-9dddcece7f88', // soft sunset
      'photo-1470071459604-3b5ec3a7fe05', // misty hills
      'photo-1518173946687-a4c8892bbd9f', // soft window light
    ],
  },
  {
    theme: 'boundaries',
    keywords: [
      'boundary', 'boundaries', 'saying no', 'say no', 'no without',
      'limit', 'overcommitted', 'people-pleas', 'people pleas',
    ],
    photos: [
      'photo-1529156069898-49953e39b3ac', // friends outdoors — space + connection
      'photo-1511632765486-a01980e36a55', // holding hands with space
      'photo-1506126613408-eca07ce68773', // person claiming quiet space
      'photo-1495474472287-4d71bcdd2085', // solo coffee moment
    ],
  },
  {
    theme: 'sleep',
    keywords: [
      'sleep', 'night', 'overnight', 'insomnia', 'night-shift', 'night shift',
      'broken sleep', 'awake', '3 a.m', '3am', 'bedside',
    ],
    photos: [
      'photo-1511295742362-92c96b1cf484', // quiet night window
      'photo-1505693416388-ac5ce068fe85', // soft bedroom
      'photo-1499209974431-9dddcece7f88', // evening light
      'photo-1518173946687-a4c8892bbd9f', // lamp / soft indoor light
    ],
  },
  {
    theme: 'siblings-family',
    keywords: [
      'sibling', 'brother', 'sister', 'family meeting', 'sharing care',
      'relative', 'in-law', 'parent', 'parents', 'adult child',
    ],
    photos: [
      'photo-1511895426328-dc8714191300', // family around a table
      'photo-1529156069898-49953e39b3ac', // adult friends/family outdoors
      'photo-1573497019940-1cfe75a9f7f0', // two people talking
      'photo-1469571486292-0ba58a3f068b', // supportive group
    ],
  },
  {
    theme: 'identity',
    keywords: [
      'who am i', 'identity', 'besides a caregiver', 'myself', 'myselflessness',
      'myself', 'hobby', 'hobbies', 'reclaim', 'own life',
    ],
    photos: [
      'photo-1506126613408-eca07ce68773', // person stretching outdoors
      'photo-1476514525535-07fb3b4ae5f1', // open road / journey
      'photo-1469474968028-56623f02e42e', // sunrise field
      'photo-1495474472287-4d71bcdd2085', // quiet personal ritual
    ],
  },
  {
    theme: 'guilt-anger',
    keywords: [
      'guilt', 'angry', 'angryed', 'snap', 'angry', 'resent', 'furious',
      'lost your temper', 'regret', 'ashamed', 'frustrat',
    ],
    photos: [
      'photo-1499209974431-9dddcece7f88', // soft sunset — cool-down
      'photo-1441974231531-c6227db76b6e', // quiet forest walk
      'photo-1506126613408-eca07ce68773', // grounding stretch
      'photo-1511632765486-a01980e36a55', // reconnection / holding hands
    ],
  },
  {
    theme: 'connection',
    keywords: [
      'ask for help', 'asking', 'conversation', 'talk', 'support network',
      'friend', 'friends', 'lonely', 'isolation', 'reach out', 'listening',
      'hard conversation', 'script',
    ],
    photos: [
      'photo-1573497019940-1cfe75a9f7f0', // two people talking
      'photo-1529156069898-49953e39b3ac', // group of friends
      'photo-1511632765486-a01980e36a55', // people holding hands
      'photo-1511895426328-dc8714191300', // family / close people
    ],
  },
  {
    theme: 'rest',
    keywords: [
      'reset', 'break', 'burnout', 'rest', 'empty cup', 'micro', 'pause',
      'exhaust', 'recharge', 'self-care', 'self care', 'breathe', 'breathing',
    ],
    photos: [
      'photo-1495474472287-4d71bcdd2085', // warm coffee cup
      'photo-1506126613408-eca07ce68773', // quiet stretch / breathing
      'photo-1499209974431-9dddcece7f88', // calm evening light
      'photo-1518173946687-a4c8892bbd9f', // soft indoor pause
    ],
  },
  {
    theme: 'routine',
    keywords: [
      'routine', 'schedule', 'checklist', 'plan', 'habit', 'appointment',
      'organize', 'calendar', 'go-bag', 'go bag', 'packing', 'prepare',
    ],
    photos: [
      'photo-1506905925346-21bda4d32df4', // steady horizon
      'photo-1469474968028-56623f02e42e', // sunrise over a field
      'photo-1470071459604-3b5ec3a7fe05', // morning mist path
      'photo-1484480974693-6ca0a06fb55b', // notebook / planning
    ],
  },
  {
    theme: 'crisis-support',
    keywords: [
      'crisis', '988', 'helpline', 'help line', 'emergency', 'er visit',
      'hospital', '911', 'hotline', 'suicid',
    ],
    photos: [
      'photo-1573497019940-1cfe75a9f7f0', // supportive conversation
      'photo-1576091160399-112ba8d25d1d', // healthcare context
      'photo-1559839734-2b71ea197ec2', // clinician listening
      'photo-1511632765486-a01980e36a55', // human support
    ],
  },
  {
    theme: 'caregiving',
    keywords: [
      'caregiver', 'caregiving', 'caring for', 'looking after', 'loved one',
      'help them', 'supporting someone', 'beside',
    ],
    photos: [
      'photo-1573497019940-1cfe75a9f7f0', // caring conversation
      'photo-1511632765486-a01980e36a55', // holding hands
      'photo-1511895426328-dc8714191300', // family closeness
      'photo-1559839734-2b71ea197ec2', // attentive listening
    ],
  },
];

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

function pickStockPhoto({ category, title, angle, description, slug, avoid }) {
  const rule = pickTheme({ title, angle, description, category });
  const hash = [...String(slug || title || 'x')].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const n = rule.photos.length;
  for (let step = 0; step < n; step += 1) {
    const url = stockUrl(rule.photos[(hash + step) % n]);
    if (!avoid || !avoid.has(url)) return { url, theme: rule.theme };
  }
  return { url: stockUrl(rule.photos[hash % n]), theme: rule.theme };
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
 * Returns { path, origin } where origin is 'stock:<theme>', 'source', or 'existing'.
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

  const trySource = async () => {
    if (!sourceUrl) return null;
    try {
      const og = await tryOgImageFromSource(sourceUrl);
      if (!og) return null;
      await downloadToFile(og, dest);
      return { path: pub, origin: 'source' };
    } catch {
      return null;
    }
  };

  const tryStock = async () => {
    const stock = pickStockPhoto({
      category,
      title,
      angle,
      description,
      slug: safeSlug,
      avoid: avoidStockUrls,
    });
    await downloadToFile(stock.url, dest);
    if (avoidStockUrls) avoidStockUrls.add(stock.url);
    return { path: pub, origin: `stock:${stock.theme}`, stockUrl: stock.url };
  };

  // Default: topic-matched stock first (more relatable than org og:images).
  if (!preferSource) {
    try {
      return await tryStock();
    } catch (err) {
      console.warn(`Stock hero failed (${err.message || err}); trying source og:image`);
      const fromSource = await trySource();
      if (fromSource) return fromSource;
      throw err;
    }
  }

  const fromSource = await trySource();
  if (fromSource) return fromSource;
  return tryStock();
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
  ensurePostImage,
  pickStockPhoto,
  pickTheme,
  setFrontmatterImage,
  publicPathForSlug,
  tryOgImageFromSource,
};
