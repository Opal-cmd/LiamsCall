'use strict';

/**
 * Blog hero images for Liam's Call.
 *
 * Priority order:
 *   1. og:image from the post's inspiration source article (source_url frontmatter),
 *      when the host is allowlisted or clearly the curated source's own domain.
 *   2. A keyword-matched stock photo (curated Unsplash pool) chosen from the post
 *      title + description — never a generic unrelated filler.
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
 * Keyword-matched stock themes. Order matters: the first rule whose keywords
 * hit the post title/description wins. IDs are Unsplash photo paths verified
 * to download. Each pool is visually specific to its theme.
 */
const THEME_RULES = [
  {
    theme: 'housing',
    test: /housing|homeless|shelter|evict|toronto shelter|unhoused/,
    photos: [
      'photo-1480074568708-e7b720bb3f09', // house at dusk
      'photo-1505693416388-ac5ce068fe85', // calm bedroom
      'photo-1493663284031-b7e3aefcae8e', // warm home interior
    ],
  },
  {
    theme: 'recovery',
    test: /addiction|detox|substance|recovery|sober|treatment|relapse/,
    photos: [
      'photo-1476514525535-07fb3b4ae5f1', // road ahead / journey
      'photo-1449824913935-59a10b8d2000', // path forward
      'photo-1469571486292-0ba58a3f068b', // friends supporting each other
    ],
  },
  {
    theme: 'grief',
    test: /grief|loss|bereave|anticipatory|dying|mourning/,
    photos: [
      'photo-1441974231531-c6227db76b6e', // quiet forest
      'photo-1499209974431-9dddcece7f88', // soft sunset
      'photo-1470071459604-3b5ec3a7fe05', // misty hills
    ],
  },
  {
    theme: 'connection',
    test: /ask for help|asking|conversation|talk|guilt|support network|friend|family meeting/,
    photos: [
      'photo-1573497019940-1cfe75a9f7f0', // two people talking
      'photo-1529156069898-49953e39b3ac', // group of friends
      'photo-1511632765486-a01980e36a55', // people holding hands
    ],
  },
  {
    theme: 'rest',
    test: /reset|break|burnout|rest|empty cup|micro|pause|exhaust|sleep|recharge/,
    photos: [
      'photo-1495474472287-4d71bcdd2085', // warm coffee cup
      'photo-1506126613408-eca07ce68773', // quiet stretch / breathing
      'photo-1499209974431-9dddcece7f88', // calm evening light
    ],
  },
  {
    theme: 'routine',
    test: /routine|schedule|checklist|plan|habit|appointment|organize/,
    photos: [
      'photo-1506905925346-21bda4d32df4', // steady horizon
      'photo-1469474968028-56623f02e42e', // sunrise over a field
      'photo-1470071459604-3b5ec3a7fe05', // morning mist path
    ],
  },
  {
    theme: 'crisis-support',
    test: /crisis|988|help ?line|emergency|er visit|hospital/,
    photos: [
      'photo-1573497019940-1cfe75a9f7f0', // supportive conversation
      'photo-1576091160399-112ba8d25d1d', // healthcare context
      'photo-1559839734-2b71ea197ec2', // clinician listening
    ],
  },
];

/** Category fallback when no keyword rule matches. */
const CATEGORY_THEME = {
  homelessness: 'housing',
  addiction: 'recovery',
  'mental health': 'grief',
  'care giver tips': 'rest',
};

function pickTheme({ title = '', description = '', category = '' }) {
  // Title keywords count double so the post's main subject outweighs
  // incidental words in the description.
  const titleHay = String(title).toLowerCase();
  const descHay = String(description).toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const rule of THEME_RULES) {
    const re = new RegExp(rule.test.source, 'g');
    const score =
      (titleHay.match(re) || []).length * 2 + (descHay.match(re) || []).length;
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  if (best) return best;
  const byCat = CATEGORY_THEME[String(category).trim().toLowerCase()];
  return THEME_RULES.find((r) => r.theme === byCat) || THEME_RULES.find((r) => r.theme === 'connection');
}

function stockUrl(photoId, width = 1600) {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&q=80`;
}

function pickStockPhoto({ category, title, description, slug, avoid }) {
  const rule = pickTheme({ title, description, category });
  const hash = [...String(slug || title || 'x')].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  const n = rule.photos.length;
  // Start at the slug's hash slot, then walk the pool to skip photos already
  // used by another post in this run (avoids duplicate heroes on the index).
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
 * The image may come from the article's own host (curated sources only reach
 * here) or an allowlisted CDN.
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
  // Only download from allowlisted CDNs, the article's own host, or its parent domain.
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
 * Returns { path, origin } where origin is 'source', 'stock', or 'existing'.
 */
async function ensurePostImage({
  slug,
  category = '',
  title = '',
  description = '',
  sourceUrl = '',
  force = false,
  avoidStockUrls = null,
} = {}) {
  const safeSlug = toSlug(slug || title);
  if (!safeSlug) throw new Error('slug required for blog image');
  const dest = diskPathForSlug(safeSlug);
  const pub = publicPathForSlug(safeSlug);

  if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 2000) {
    return { path: pub, origin: 'existing' };
  }

  ensureDir(BLOG_ASSET_DIR);

  if (sourceUrl) {
    try {
      const og = await tryOgImageFromSource(sourceUrl);
      if (og) {
        await downloadToFile(og, dest);
        return { path: pub, origin: 'source' };
      }
    } catch {
      // fall through to themed stock
    }
  }

  const stock = pickStockPhoto({ category, title, description, slug: safeSlug, avoid: avoidStockUrls });
  await downloadToFile(stock.url, dest);
  if (avoidStockUrls) avoidStockUrls.add(stock.url);
  return { path: pub, origin: `stock:${stock.theme}`, stockUrl: stock.url };
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
