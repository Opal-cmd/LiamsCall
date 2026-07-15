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
  renderAdSlot,
} = require('./lib/blog-utils');

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function buildFilterScript() {
  return `
  <script>
    (function () {
      var list = document.getElementById('post-list');
      if (!list) return;
      var cards = Array.prototype.slice.call(list.querySelectorAll('.post-card'));
      var meta = document.getElementById('filter-meta');
      var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-filter-type]'));
      var state = { category: 'all', region: 'all' };

      function apply() {
        var shown = 0;
        cards.forEach(function (card) {
          var catOk = state.category === 'all' || card.getAttribute('data-category') === state.category;
          var regionOk = state.region === 'all' || card.getAttribute('data-region') === state.region;
          var ok = catOk && regionOk;
          card.classList.toggle('is-hidden', !ok);
          if (ok) shown += 1;
        });
        if (meta) {
          var bits = [];
          if (state.category !== 'all') bits.push(state.category);
          if (state.region !== 'all') bits.push(state.region);
          meta.textContent = bits.length
            ? ('Showing ' + shown + ' post' + (shown === 1 ? '' : 's') + ' · ' + bits.join(' · '))
            : ('Showing all ' + shown + ' posts');
        }
      }

      buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var type = btn.getAttribute('data-filter-type');
          var value = btn.getAttribute('data-filter-value');
          state[type] = value;
          buttons
            .filter(function (b) { return b.getAttribute('data-filter-type') === type; })
            .forEach(function (b) {
              b.classList.toggle('is-active', b.getAttribute('data-filter-value') === value);
            });
          apply();
        });
      });
      apply();
    })();
  </script>`;
}

function buildIndex(posts) {
  const categories = uniqueSorted(posts.map((p) => p.category));
  const regions = uniqueSorted(posts.map((p) => p.region || 'Canada'));

  const catButtons = [
    '<button type="button" class="blog-filter is-active" data-filter-type="category" data-filter-value="all">All topics</button>',
    ...categories.map(
      (c) =>
        `<button type="button" class="blog-filter" data-filter-type="category" data-filter-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`,
    ),
  ].join('\n');

  const regionButtons = [
    '<button type="button" class="blog-filter is-active" data-filter-type="region" data-filter-value="all">All regions</button>',
    ...regions.map(
      (r) =>
        `<button type="button" class="blog-filter" data-filter-type="region" data-filter-value="${escapeHtml(r)}">${escapeHtml(r)}</button>`,
    ),
  ].join('\n');

  const cards = posts
    .map(
      (p) => `
      <li>
        <a class="post-card" href="/blog/${escapeHtml(p.slug)}" data-category="${escapeHtml(p.category)}" data-region="${escapeHtml(p.region || 'Canada')}">
          <span class="cat">${escapeHtml(p.category)}${p.region ? ` · ${escapeHtml(p.region)}` : ''}</span>
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
    <div class="blog-filters" role="group" aria-label="Filter by topic">${catButtons}</div>
    <div class="blog-filters" role="group" aria-label="Filter by region">${regionButtons}</div>
    <p id="filter-meta" class="blog-filter-meta">Showing all ${posts.length} posts</p>
    <ul id="post-list" class="post-list">${cards || '<li><p>No posts yet.</p></li>'}</ul>
    <div class="blog-cta">
      <p>Want to talk something through in the moment?</p>
      <a class="pill-dark" href="/">Open Liam's Call chat</a>
    </div>
    ${buildFilterScript()}
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
  const hero =
    post.image && post.image.startsWith('/')
      ? `<figure class="blog-figure"><img class="blog-img" src="${escapeHtml(post.image)}" alt=""></figure>`
      : '';
  const bodyHtml = `
    <a class="blog-back" href="/blog">&larr; Back to blog</a>
    <p class="blog-meta"><span>${escapeHtml(post.category)}</span>${post.region ? ` · <span>${escapeHtml(post.region)}</span>` : ''} · <time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDateDisplay(post.date))}</time></p>
    <h1>${escapeHtml(post.title)}</h1>
    ${hero}
    <article class="blog-body">
      ${post.html}
    </article>
    <div class="ad-slot-article">
      ${renderAdSlot('article', { label: 'In-article ad' })}
    </div>
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
      contentLocation: post.region || 'Canada',
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
