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
  const postUrl = `${SITE}/blog/${post.slug}`;
  const howto = HOWTO_BY_SLUG[post.slug];
  const howtoHtml = renderHowToBlock(howto);
  const bodyHtml = `
    <a class="blog-back" href="/blog">&larr; Back to blog</a>
    <p class="blog-meta"><span>${escapeHtml(post.category)}</span>${post.region ? ` · <span>${escapeHtml(post.region)}</span>` : ''} · <time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDateDisplay(post.date))}</time></p>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="speakable-summary">${escapeHtml(post.description)}</p>
    ${hero}
    <article class="blog-body">
      ${post.html}
    </article>
    ${howtoHtml}
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

  const graph = [
    organizationSchema(),
    blogPostingSchema({
      title: post.title,
      description: post.description,
      datePublished: post.date,
      dateModified: post.date,
      url: postUrl,
      category: post.category,
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
