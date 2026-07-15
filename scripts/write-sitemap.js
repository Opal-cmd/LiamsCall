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
  sitemapXmlComment,
  organizationSchema,
  speakableSpec,
} = require('./lib/site-identity');

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

function hreflangLinks(loc) {
  return [
    { hreflang: 'en-CA', href: loc },
    { hreflang: 'en', href: loc },
    { hreflang: 'x-default', href: loc },
  ];
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
  if (img.caption && img.caption !== img.title) {
    lines.push(`      <image:caption>${xmlEscape(img.caption)}</image:caption>`);
  }
  lines.push('    </image:image>');
  return lines.join('\n');
}

function renderUrl(entry) {
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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="Human-readable sitemap for Liam's Call — main pages for mental health, addiction, and housing support.">
  <meta name="theme-color" content="#0f4a3a">
  <link rel="canonical" href="${SITE}/sitemap">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Liam's Call">
  <meta property="og:title" content="Sitemap — Liam's Call">
  <meta property="og:description" content="Human-readable sitemap for Liam's Call — main pages for mental health, addiction, and housing support.">
  <meta property="og:url" content="${SITE}/sitemap">
  <meta property="og:image" content="${SITE}/assets/logo-icon.svg">
  <title>Sitemap — Liam's Call</title>
  <link rel="icon" type="image/svg+xml" href="/assets/logo-icon.svg">
  <script type="application/ld+json">
${JSON.stringify(
  {
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
  null,
  4,
)}
  </script>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <style>
    :root { --green-dark: #0f4a3a; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; background: #f3f0ea; margin: 0; color: #1f2937; }
    a { color: var(--green-dark); }
    main { max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
    h1 { font-size: 1.75rem; font-weight: 700; color: var(--green-dark); letter-spacing: -0.02em; }
    .sitemap-lead { margin: 0 0 1.5rem; color: #6b7280; font-size: 0.95rem; line-height: 1.6; }
    .sitemap-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .sitemap-item { background: #fff; border: 1px solid #e5e7eb; border-radius: 0.85rem; padding: 0.9rem 1rem; }
    .sitemap-item a { text-decoration: none; font-weight: 600; }
    .sitemap-item a:hover { text-decoration: underline; text-underline-offset: 3px; }
    .sitemap-item p { margin: 0.35rem 0 0; color: #6b7280; font-size: 0.85rem; line-height: 1.5; }
    .sitemap-note { margin-top: 1.5rem; padding: 0.9rem 1rem; border-radius: 0.85rem; background: #fff; border: 1px dashed rgba(15,74,58,0.25); color: #6b7280; font-size: 0.82rem; line-height: 1.5; }
    .home-link { display: inline-block; margin-bottom: 1.25rem; font-size: 0.9rem; font-weight: 600; text-decoration: none; }
  </style>
</head>
<body>
  <main>
    <a class="home-link" href="/">&larr; Home</a>
    <h1>Sitemap</h1>
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
    </p>
  </main>
</body>
</html>
`;
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
        label: p.label,
        loc,
        lastmod: fileLastmod(filePath) || new Date().toISOString().slice(0, 10),
        changefreq: p.changefreq,
        priority: p.priority,
        hreflang: hreflangLinks(loc),
        images: p.images || [],
      };
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
${sitemapXmlComment()}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">

  <!-- ========== Core pages (production) ========== -->
${entries.map(renderUrl).join('\n\n')}

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
          extensions: ['xhtml/hreflang', 'image'],
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
