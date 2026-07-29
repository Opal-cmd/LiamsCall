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
const {
  blogPostingSchema,
  howToSchema,
  organizationSchema,
} = require('./lib/site-identity');

/** Procedural posts get HowTo schema + a matching visible ordered list. */
const HOWTO_BY_SLUG = {
  'the-5-minute-reset': {
    name: 'Do a 5-minute caregiver reset',
    steps: [
      { name: 'Try 4-6 breathing', text: 'Breathe in for four counts and out for six, for about two minutes.' },
      { name: 'Use sensory grounding', text: 'Name five things you can see, four you can touch, and three you can hear.' },
      { name: 'Take a brief outdoor walk', text: 'Walk to the end of the driveway and back if you can — light and movement help.' },
      { name: 'Hold one warm drink slowly', text: 'Use both hands and skip the screen for a few minutes.' },
      { name: 'Release neck and shoulder tension', text: 'Gently stretch for about thirty seconds.' },
    ],
  },
  'finding-toronto-shelter-help': {
    name: 'Find Toronto shelter help without guessing phone numbers',
    steps: [
      { name: 'Call Toronto Shelter Central Intake', text: 'Call 416-338-4766 or toll-free 1-877-338-4766 for shelter system access.' },
      { name: 'Use Toronto 311 if you are in the city', text: 'Dial 311 for City of Toronto shelter and housing information.' },
      { name: 'Try 211 Ontario for local services', text: 'Dial 2-1-1 or visit 211ontario.ca for housing and social supports.' },
      { name: 'Use emergency lines when needed', text: 'Call 911 for immediate danger, or call or text 988 for suicidal crisis or severe distress.' },
    ],
  },
  'ontario-detox-near-me': {
    name: 'Find Ontario detox or addiction treatment that is actually open',
    steps: [
      { name: 'Call ConnexOntario', text: 'Call 1-866-531-2600 or visit connexontario.ca for live addiction and detox referrals.' },
      { name: 'Share practical details on the call', text: 'Note age, city or region, substances of concern, and whether housing is also unstable.' },
      { name: 'Use Health 811 for non-emergency health questions', text: 'Dial 811 to speak with a registered nurse in Ontario.' },
      { name: 'Escalate in a true emergency', text: 'Call 911 for immediate danger, or call or text 988 for crisis support.' },
    ],
  },
  'how-to-ask-for-help-without-feeling-guilty': {
    name: 'Ask for caregiver help without drowning in guilt',
    steps: [
      { name: 'Name the guilt loop', text: 'Notice when needing help turns into talking yourself out of asking.' },
      { name: 'Reframe the ask around care quality', text: 'Remind yourself that rested caregivers are more patient and effective.' },
      { name: 'Make the request specific and time-bounded', text: 'Ask for a concrete block of help instead of vague support.' },
      { name: 'Look beyond family if needed', text: 'Contact the Ontario Caregiver Organization, your doctor, or local relief programs.' },
    ],
  },
};

function renderHowToBlock(howto) {
  if (!howto || !howto.steps?.length) return '';
  const items = howto.steps
    .map((step) => `<li><strong>${escapeHtml(step.name)}</strong> — ${escapeHtml(step.text)}</li>`)
    .join('\n');
  return `
    <section class="howto-block" aria-label="Step-by-step guide">
      <h2>Quick steps</h2>
      <ol class="howto-steps">
        ${items}
      </ol>
    </section>`;
}

function buildFilterScript() {
  return `
  <script>
    (function () {
      var cards = Array.prototype.slice.call(document.querySelectorAll('.post-card'));
      var meta = document.getElementById('filter-meta');
      var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-filter-type]'));
      var state = { category: 'all' };

      function apply() {
        var shown = 0;
        cards.forEach(function (card) {
          var ok = state.category === 'all' || card.getAttribute('data-category') === state.category;
          card.classList.toggle('is-hidden', !ok);
          if (ok) shown += 1;
        });
        document.querySelectorAll('.masonry-band').forEach(function (band) {
          var any = band.querySelectorAll('.post-card:not(.is-hidden)').length > 0;
          band.classList.toggle('is-empty', !any);
        });
        if (meta) {
          meta.textContent = state.category === 'all'
            ? ('Showing all ' + shown + ' posts')
            : ('Showing ' + shown + ' post' + (shown === 1 ? '' : 's') + ' · ' + state.category);
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

/** Vary card footprint for a WePresent-like masonry feel. */
function cardSizeClass(idx) {
  const pattern = ['size-wide', 'size-tall', 'size-std', 'size-std', 'size-wide', 'size-std', 'size-tall'];
  return pattern[idx % pattern.length];
}

/** Canonical blog topics — keep in sync with public/admin/blog.html category select. */
const BLOG_TOPICS = ['Mental health', 'Addiction', 'Homelessness', 'Care Giver Tips'];

const LEGACY_CATEGORY_MAP = {
  'mental health': 'Mental health',
  addiction: 'Addiction',
  homelessness: 'Homelessness',
  'care giver tips': 'Care Giver Tips',
  caregiving: 'Care Giver Tips',
  'caregiver wellbeing': 'Care Giver Tips',
  'practical tips': 'Care Giver Tips',
  routines: 'Care Giver Tips',
  communication: 'Care Giver Tips',
  housing: 'Homelessness',
};

function normalizeCategory(category) {
  const raw = String(category || '').trim();
  if (!raw) return 'Care Giver Tips';
  const mapped = LEGACY_CATEGORY_MAP[raw.toLowerCase()];
  if (mapped) return mapped;
  const exact = BLOG_TOPICS.find((t) => t.toLowerCase() === raw.toLowerCase());
  return exact || 'Care Giver Tips';
}

function renderPostCard(p, idx) {
  const category = normalizeCategory(p.category);
  const img = p.image
    ? `<div class="card-media"><img src="${escapeHtml(p.image)}" alt="" loading="${idx < 3 ? 'eager' : 'lazy'}" decoding="async"></div>`
    : `<div class="card-media is-placeholder" aria-hidden="true"></div>`;
  return `
    <a class="post-card ${cardSizeClass(idx)}" href="/blog/${escapeHtml(p.slug)}" data-category="${escapeHtml(category)}">
      ${img}
      <div class="card-copy">
        <span class="cat">${escapeHtml(category)} · ${escapeHtml(formatDateDisplay(p.date))}</span>
        <h2>${escapeHtml(p.title)}</h2>
        <p>${escapeHtml(p.description)}</p>
      </div>
    </a>`;
}

function buildIndex(posts) {
  const catButtons = [
    '<button type="button" class="blog-filter is-active" data-filter-type="category" data-filter-value="all">All topics</button>',
    ...BLOG_TOPICS.map(
      (c) =>
        `<button type="button" class="blog-filter" data-filter-type="category" data-filter-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`,
    ),
  ].join('\n');

  const strip = posts
    .slice(0, 8)
    .map(
      (p) => `
      <a class="story-chip" href="/blog/${escapeHtml(p.slug)}">
        <span class="story-chip-thumb">${
          p.image
            ? `<img src="${escapeHtml(p.image)}" alt="" loading="lazy" decoding="async">`
            : ''
        }</span>
        <span class="story-chip-label">${escapeHtml(p.title)}</span>
      </a>`,
    )
    .join('\n');

  const bands = [
    { tone: 'paper', label: 'Latest stories', start: 0, end: 3 },
    { tone: 'sky', label: 'Worth sitting with', start: 3, end: 5 },
    { tone: 'mint', label: 'Practical support', start: 5, end: 7 },
    { tone: 'rose', label: 'More from the desk', start: 7, end: posts.length },
  ];

  const bandHtml = bands
    .map((band) => {
      const slice = posts.slice(band.start, band.end);
      if (!slice.length) return '';
      const cards = slice.map((p, i) => renderPostCard(p, band.start + i)).join('\n');
      return `
      <section class="masonry-band tone-${band.tone}">
        <div class="masonry-band-inner">
          <p class="blog-section-label">${escapeHtml(band.label)}</p>
          <div class="masonry-grid">${cards}</div>
        </div>
      </section>`;
    })
    .join('\n');

  const bodyHtml = `
    <header class="blog-hero">
      <p class="blog-kicker">Liam's Call</p>
      <h1>Stories for caregivers.</h1>
      <p class="blog-hero-lead">
        Grounded pieces on wellbeing, communication, and supporting someone through mental health, addiction, or housing challenges.
      </p>
    </header>
    ${
      strip
        ? `<div class="story-strip" aria-label="Recent stories">${strip}</div>`
        : ''
    }
    <div class="blog-toolbar">
      <div class="blog-filters" role="group" aria-label="Filter by topic">${catButtons}</div>
      <p id="filter-meta" class="blog-filter-meta">Showing all ${posts.length} posts</p>
    </div>
    <div id="post-list" class="masonry-feed">
      ${bandHtml || '<p class="empty-feed">No posts yet.</p>'}
    </div>
    <div class="blog-cta band-cta">
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
    variant: 'index',
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
  const postUrl = `${SITE}/blog/${post.slug}`;
  const howto = HOWTO_BY_SLUG[post.slug];
  const howtoHtml = renderHowToBlock(howto);
  const bodyHtml = `
    <a class="blog-back" href="/blog">&larr; Back to stories</a>
    <p class="blog-meta"><span>${escapeHtml(normalizeCategory(post.category))}</span> · <time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDateDisplay(post.date))}</time></p>
    <h1 class="article-title">${escapeHtml(post.title)}</h1>
    <p class="speakable-summary">${escapeHtml(post.description)}</p>
    ${hero}
    <article class="blog-body">
      ${post.html}
    </article>
    ${howtoHtml}
    <p class="blog-back-wrap"><a class="blog-back" href="/blog">&larr; Back to stories</a></p>
    <div class="blog-cta">
      <p>If this resonates, you can keep going in a private chat. No account required.</p>
      <a class="pill-dark" href="/">Talk with Liam's Call AI</a>
      &nbsp;&nbsp;<a href="/resources" style="font-size:0.85rem;font-weight:600;">Crisis resources</a>
    </div>
    <p class="blog-disclaimer">
      Liam's Call is an informational tool, not a medical professional or crisis service.
      In a crisis, call or text <a href="tel:988">9-8-8</a> (Canada &amp; U.S.) or call <a href="tel:911">9-1-1</a> for emergencies.
    </p>
  `;

  const graph = [
    organizationSchema(),
    blogPostingSchema({
      title: post.title,
      description: post.description,
      datePublished: post.date,
      dateModified: post.date,
      url: postUrl,
      category: normalizeCategory(post.category),
      region: post.region,
      image: post.image,
    }),
  ];
  if (howto) {
    graph.push(
      howToSchema({
        name: howto.name,
        description: post.description,
        steps: howto.steps,
        url: postUrl,
      }),
    );
  }

  return blogShell({
    title: `${post.title} - Liam's Call`,
    description: post.description,
    canonical: postUrl,
    active: 'blog',
    variant: 'article',
    ogImage: post.image || '',
    breadcrumb: `<a href="/blog">Blog</a> <span aria-hidden="true">/</span> <span>${escapeHtml(post.title)}</span>`,
    schema: {
      '@context': 'https://schema.org',
      '@graph': graph,
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
