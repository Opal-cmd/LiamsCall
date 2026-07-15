#!/usr/bin/env node
'use strict';

/**
 * Production sitemap builder (main branch).
 * No /blog — the full blog lives on the staging branch only.
 */

const fs = require('fs');
const path = require('path');
const {
  SITE_IDENTITY,
  organizationSchema,
  speakableSpec,
} = require('./lib/site-identity');
const { shell } = require('./generate-legal-pages');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SITE = SITE_IDENTITY.url;

function fileLastmod(absPath) {
  try {
    return fs.statSync(absPath).mtime.toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

function xmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function brandImage() {
  return {
    loc: `${SITE}/assets/logo-icon.svg`,
    title: SITE_IDENTITY.siteName,
    caption: `${SITE_IDENTITY.siteName} - ${SITE_IDENTITY.subCategory}`,
  };
}

function renderImage(img) {
  const lines = ['    <image:image>', `      <image:loc>${xmlEscape(img.loc)}</image:loc>`];
  if (img.title) lines.push(`      <image:title>${xmlEscape(img.title)}</image:title>`);
  if (img.caption) lines.push(`      <image:caption>${xmlEscape(img.caption)}</image:caption>`);
  lines.push('    </image:image>');
  return lines.join('\n');
}

function renderUrl(entry) {
  const lines = ['  <url>', `    <loc>${xmlEscape(entry.loc)}</loc>`];
  if (entry.lastmod) lines.push(`    <lastmod>${xmlEscape(entry.lastmod)}</lastmod>`);
  if (entry.changefreq) lines.push(`    <changefreq>${xmlEscape(entry.changefreq)}</changefreq>`);
  if (entry.priority) lines.push(`    <priority>${xmlEscape(entry.priority)}</priority>`);
  for (const img of entry.images || []) lines.push(renderImage(img));
  lines.push('  </url>');
  return lines.join('\n');
}

function writeHtmlSitemap(pages) {
  const items = pages
    .map(
      (p) => `
        <li class="sitemap-item">
          <a href="${escapeHtml(p.route)}"><strong>${escapeHtml(p.label)}</strong></a>
          <p>${escapeHtml(p.blurb || '')}</p>
        </li>`,
    )
    .join('\n');

  const body = `
<style>
  .sitemap-lead { margin: 0 0 1.25rem; color: #6b7280; font-size: 0.95rem; line-height: 1.6; text-align: left; }
  .sitemap-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; text-align: left; }
  .sitemap-item { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.85rem; padding: 0.9rem 1rem; }
  .sitemap-item a { text-decoration: none; font-weight: 600; color: var(--green-dark); }
  .sitemap-item a:hover { text-decoration: underline; text-underline-offset: 3px; }
  .sitemap-item p { margin: 0.35rem 0 0; color: #6b7280; font-size: 0.85rem; line-height: 1.5; }
  .sitemap-note { margin-top: 1.5rem; padding: 0.9rem 1rem; border-radius: 0.85rem; background: #fff; border: 1px dashed rgba(15,74,58,0.25); color: #6b7280; font-size: 0.82rem; line-height: 1.5; text-align: left; }
</style>
<p class="sitemap-lead speakable-summary">${escapeHtml(SITE_IDENTITY.shortDescription)}</p>
<p class="sitemap-lead">
  Category: <strong>${escapeHtml(SITE_IDENTITY.category)}</strong>
  / Sub-category: <strong>${escapeHtml(SITE_IDENTITY.subCategory)}</strong>
</p>
<ul class="sitemap-list">${items}</ul>
<p class="sitemap-note">
  Machine-readable crawl file:
  <a href="/sitemap.xml">sitemap.xml</a>.
  The blog is in development on staging and is not listed here yet.
</p>`;

  const html = shell(
    'Sitemap',
    "Human-readable sitemap for Liam's Call — main pages for mental health, addiction, and housing support.",
    'sitemap',
    body,
    {
      crumb: 'Sitemap',
      canonical: `${SITE}/sitemap`,
      schema: {
        '@context': 'https://schema.org',
        '@graph': [
          organizationSchema(),
          {
            '@type': 'WebPage',
            '@id': `${SITE}/sitemap#page`,
            name: "Sitemap — Liam's Call",
            url: `${SITE}/sitemap`,
            description: "Human-readable site map of Liam's Call pages.",
            isPartOf: { '@id': `${SITE}/#website` },
            speakable: speakableSpec(['h1', '.speakable-summary']),
          },
        ],
      },
    },
  );
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.html'), html);
}

function main() {
  const logo = brandImage();
  const pages = [
    {
      route: '/',
      file: 'index.html',
      label: 'Home / Chat',
      blurb: 'Free AI chat for caregivers and families — mental health, addiction, and housing support. No account required.',
      priority: '1.0',
      changefreq: 'daily',
      images: [
        logo,
        {
          loc: `${SITE}/assets/logo-horizontal.svg`,
          title: `${SITE_IDENTITY.siteName} wordmark`,
          caption: 'Primary horizontal logo for Liam\'s Call',
        },
      ],
    },
    {
      route: '/resources',
      file: 'resources.html',
      label: 'Crisis & Support Resources',
      blurb: 'Verified crisis lines and Ontario local directories — Toronto shelter Central Intake, ConnexOntario, 988, 211.',
      priority: '0.8',
      changefreq: 'weekly',
    },
    {
      route: '/about',
      file: 'about.html',
      label: 'About Us',
      blurb: "Who Liam's Call is, what we offer, and how the AI chat works.",
      priority: '0.7',
      changefreq: 'monthly',
    },
    {
      route: '/sitemap',
      file: 'sitemap.html',
      label: 'Sitemap',
      blurb: 'Human-readable map of the live site pages.',
      priority: '0.4',
      changefreq: 'weekly',
    },
    {
      route: '/privacy',
      file: 'privacy.html',
      label: 'Privacy Policy',
      blurb: 'How we handle chat data, approximate location, and third-party providers.',
      priority: '0.5',
      changefreq: 'yearly',
    },
    {
      route: '/terms',
      file: 'terms.html',
      label: 'Terms of Use',
      blurb: "Rules for using Liam's Call AI support chat.",
      priority: '0.5',
      changefreq: 'yearly',
    },
  ];

  // Write HTML sitemap first so /sitemap exists for the XML entry.
  writeHtmlSitemap(pages.filter((p) => p.route !== '/sitemap').concat(pages.filter((p) => p.route === '/sitemap')));

  const entries = pages
    .filter((p) => fs.existsSync(path.join(PUBLIC_DIR, p.file)) || p.route === '/sitemap')
    .map((p) => {
      const loc = `${SITE}${p.route}`;
      const filePath = path.join(PUBLIC_DIR, p.file);
      return {
        loc,
        lastmod: fileLastmod(filePath) || new Date().toISOString().slice(0, 10),
        changefreq: p.changefreq,
        priority: p.priority,
        images: p.images || [],
      };
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.map(renderUrl).join('\n')}
</urlset>
`;
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), xml);

  fs.writeFileSync(
    path.join(PUBLIC_DIR, 'site-identity.json'),
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
          extensions: ['image'],
          notes: 'Production sitemap lists core site pages only. Blog remains on the staging branch.',
        },
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Wrote production sitemap (${entries.length} URLs) + HTML sitemap + site-identity.json`);
}

main();
