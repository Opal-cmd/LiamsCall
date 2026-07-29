'use strict';

/**
 * Blog hero images for Liam's Call.
 * Prefer a source page og:image when the host is allowlisted; otherwise
 * download a curated Unsplash stock photo matched to the post category.
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
 * Curated Unsplash photos (free license) keyed by theme.
 * Format: Unsplash photo path id used with images.unsplash.com
 */
const STOCK_BY_THEME = {
  calm: [
    'photo-1441974231531-c6227db76b6e',
    'photo-1506905925346-21bda4d32df4',
    'photo-1470071459604-3b5ec3a7fe05',
  ],
  care: [
    'photo-1573497019940-1cfe75a9f7f0',
    'photo-1576091160399-112ba8d25d1d',
    'photo-1559839734-2b71ea197ec2',
  ],
  home: [
    'photo-1480074568708-e7b720bb3f09',
    'photo-1505693416388-ac5ce068fe85',
    'photo-1493663284031-b7e3aefcae8e',
  ],
  pause: [
    'photo-1495474472287-4d71bcdd2085',
    'photo-1506126613408-eca07ce68773',
    'photo-1499209974431-9dddcece7f88',
  ],
  community: [
    'photo-1469571486292-0ba58a3f068b',
    'photo-1529156069898-49953e39b3ac',
    'photo-1511632765486-a01980e36a55',
  ],
  path: [
    'photo-1449824913935-59a10b8d2000',
    'photo-1476514525535-07fb3b4ae5f1',
    'photo-1469474968028-657f4adf7d1f',
  ],
};

function themeForCategory(category = '', title = '') {
  const hay = `${category} ${title}`.toLowerCase();
  if (/housing|homeless|shelter|home/.test(hay)) return 'home';
  if (/addiction|substance|detox|recovery/.test(hay)) return 'path';
  if (/grief|loss|bereave/.test(hay)) return 'calm';
  if (/crisis|988|help phone/.test(hay)) return 'care';
  if (/community|peer|group|family/.test(hay)) return 'community';
  if (/reset|break|burnout|rest|routine|tip|care.?giver|caregiving|practical/.test(hay)) return 'pause';
  if (/mental|anxiety|depress|wellbeing|well-being/.test(hay)) return 'calm';
  return 'care';
}

function stockUrl(photoId, width = 1600) {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&q=80`;
}

function pickStockPhoto({ category, title, slug }) {
  const theme = themeForCategory(category, title);
  const pool = STOCK_BY_THEME[theme] || STOCK_BY_THEME.care;
  const hash = [...String(slug || title || 'x')].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  return stockUrl(pool[hash % pool.length]);
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

async function tryOgImageFromSource(pageUrl) {
  if (!pageUrl) return '';
  let page;
  try {
    page = new URL(pageUrl);
  } catch {
    return '';
  }
  if (page.protocol !== 'https:' && page.protocol !== 'http:') return '';
  if (!isAllowedImageHost(page.hostname) && !SOURCE_IMAGE_HOSTS.has(page.hostname.replace(/^www\./, ''))) {
    // Still allow known org domains without www
    const bare = page.hostname.replace(/^www\./, '');
    const ok = [...SOURCE_IMAGE_HOSTS].some((h) => h === bare || h.endsWith(`.${bare}`) || bare.endsWith(h.replace(/^www\./, '')));
    if (!ok && !page.hostname.endsWith('.gov') && !page.hostname.endsWith('.ca') && !page.hostname.endsWith('.org')) {
      return '';
    }
  }

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
  // Prefer downloading only from allowlisted CDNs / same site
  if (!isAllowedImageHost(imgUrl.hostname) && imgUrl.hostname !== page.hostname) {
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
 * Ensure a local hero image exists for a post. Returns public path like /assets/blog/slug.jpg
 */
async function ensurePostImage({
  slug,
  category = '',
  title = '',
  sourceUrl = '',
  force = false,
} = {}) {
  const safeSlug = toSlug(slug || title);
  if (!safeSlug) throw new Error('slug required for blog image');
  const dest = diskPathForSlug(safeSlug);
  const pub = publicPathForSlug(safeSlug);

  if (!force && fs.existsSync(dest) && fs.statSync(dest).size > 2000) {
    return pub;
  }

  ensureDir(BLOG_ASSET_DIR);

  let downloaded = false;
  if (sourceUrl) {
    try {
      const og = await tryOgImageFromSource(sourceUrl);
      if (og) {
        await downloadToFile(og, dest);
        downloaded = true;
      }
    } catch {
      // fall through to stock
    }
  }

  if (!downloaded) {
    const stock = pickStockPhoto({ category, title, slug: safeSlug });
    await downloadToFile(stock, dest);
  }

  return pub;
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
  setFrontmatterImage,
  publicPathForSlug,
  themeForCategory,
  tryOgImageFromSource,
};
