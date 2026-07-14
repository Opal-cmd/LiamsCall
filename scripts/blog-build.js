#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  PUBLIC_BLOG_DIR,
  SITE,
  ensureDir,
  loadPublishedPosts,
  assertPostGuards,
  formatDateDisplay,
  blogShell,
  writeSitemap,
  escapeHtml,
} = require('./lib/blog-utils');

function buildIndex(posts) {
  const cards = posts
    .map(
      (p) => `
      <li>
        <a class="post-card" href="/blog/${escapeHtml(p.slug)}">
          <span class="cat">${escapeHtml(p.category)}</span>
          <h2>${escapeHtml(p.title)}</h2>
          <p>${escapeHtml(p.description)}</p>
          <span class="date">${escapeHtml(formatDateDisplay(p.date))}</span>
        </a>
      </li>`,
    )
    .join('\n');

  const bodyHtml = `
    <p class="blog-meta">Practical reads for caregivers and families</p>
    <h1>Blog</h1>
    <p style="margin:0 0 1.5rem;color:#6b7280;font-size:0.92rem;line-height:1.55;">
      Short, grounded articles on caregiver wellbeing, communication, and supporting a loved one through mental health, addiction, or housing challenges.
    </p>
    <ul class="post-list">${cards || '<li><p>No posts yet.</p></li>'}</ul>
    <div class="blog-cta">
      <p>Want to talk something through in the moment?</p>
      <a class="pill-dark" href="/">Open Liam's Call chat</a>
    </div>
  `;

  return blogShell({
    title: "Blog - Liam's Call",
    description:
      "Articles from Liam's Call for caregivers and families - burnout, asking for help, grief, routines, and practical support for mental health, addiction, and housing challenges.",
    canonical: `${SITE}/blog`,
    active: 'blog',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: "Liam's Call Blog",
      url: `${SITE}/blog`,
      description:
        'Practical caregiver and family support articles from Liam\'s Call.',
      publisher: { '@id': `${SITE}/#organization` },
    },
    breadcrumb: '<span>Blog</span>',
    bodyHtml,
  });
}

function buildPost(post) {
  assertPostGuards(post, { strictSafe: post.risk === 'safe' });
  const bodyHtml = `
    <a class="blog-back" href="/blog">&larr; Back to blog</a>
    <p class="blog-meta"><span>${escapeHtml(post.category)}</span> · <time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDateDisplay(post.date))}</time></p>
    <h1>${escapeHtml(post.title)}</h1>
    <article class="blog-body">
      ${post.html}
    </article>
    <p class="blog-back-wrap"><a class="blog-back" href="/blog">&larr; Back to blog</a></p>
    <div class="blog-cta">
      <p>If this resonates, you can keep going in a private chat - no account required.</p>
      <a class="pill-dark" href="/">Talk with Liam's Call AI</a>
      &nbsp;&nbsp;<a href="/resources" style="font-size:0.82rem;">Crisis resources</a>
    </div>
    <p class="blog-disclaimer">
      Liam's Call is an informational tool, not a medical professional or crisis service.
      In a crisis, call or text <a href="tel:988">9-8-8</a> (Canada &amp; U.S.) or call <a href="tel:911">9-1-1</a> for emergencies.
    </p>
  `;

  return blogShell({
    title: `${post.title} - Liam's Call`,
    description: post.description,
    canonical: `${SITE}/blog/${post.slug}`,
    active: 'blog',
    breadcrumb: `<a href="/blog">Blog</a> <span aria-hidden="true">/</span> <span>${escapeHtml(post.title)}</span>`,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.description,
      datePublished: post.date,
      dateModified: post.date,
      author: {
        '@type': 'Organization',
        name: "Liam's Call",
        url: SITE,
      },
      publisher: {
        '@type': 'Organization',
        name: "Liam's Call",
        url: SITE,
        logo: {
          '@type': 'ImageObject',
          url: `${SITE}/assets/logo-icon.svg`,
        },
      },
      mainEntityOfPage: `${SITE}/blog/${post.slug}`,
      articleSection: post.category,
    },
    bodyHtml,
  });
}

function cleanPublicBlog() {
  ensureDir(PUBLIC_BLOG_DIR);
  for (const name of fs.readdirSync(PUBLIC_BLOG_DIR)) {
    if (name === '.gitkeep') continue;
    fs.rmSync(path.join(PUBLIC_BLOG_DIR, name), { recursive: true, force: true });
  }
}

function main() {
  const posts = loadPublishedPosts();
  for (const post of posts) {
    assertPostGuards(post, { strictSafe: true });
  }

  cleanPublicBlog();
  fs.writeFileSync(path.join(PUBLIC_BLOG_DIR, 'index.html'), buildIndex(posts));

  for (const post of posts) {
    const dir = path.join(PUBLIC_BLOG_DIR, post.slug);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, 'index.html'), buildPost(post));
  }

  writeSitemap(posts);
  console.log(`Built ${posts.length} blog post(s) → public/blog/`);
}

main();
