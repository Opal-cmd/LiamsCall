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
      var cards = Array.prototype.slice.call(document.querySelectorAll('[data-category].post-card, [data-category].feature-hero, [data-category].select-card'));
      var meta = document.getElementById('filter-meta');
      var buttons = Array.prototype.slice.call(document.querySelectorAll('[data-filter-type]'));
      var state = { category: 'all' };

      function apply() {
        var shown = 0;
        var seen = {};
        cards.forEach(function (card) {
          var ok = state.category === 'all' || card.getAttribute('data-category') === state.category;
          card.classList.toggle('is-hidden', !ok);
          if (ok) {
            var href = card.getAttribute('href') || '';
            if (!seen[href]) {
              seen[href] = true;
              shown += 1;
            }
          }
        });
        document.querySelectorAll('[data-filter-band]').forEach(function (band) {
          var any = band.querySelectorAll('[data-category]:not(.is-hidden)').length > 0;
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

      var form = document.getElementById('blog-newsletter');
      if (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var note = document.getElementById('newsletter-note');
          if (note) {
            note.hidden = false;
            note.textContent = 'Thanks — we will keep this simple when the list opens.';
          }
          form.reset();
        });
      }

      function enableDragScroll(el) {
        if (!el) return;
        var down = false;
        var startX = 0;
        var startLeft = 0;
        var moved = false;
        el.addEventListener('pointerdown', function (e) {
          if (e.pointerType === 'touch') return;
          down = true;
          moved = false;
          startX = e.clientX;
          startLeft = el.scrollLeft;
          el.classList.add('is-dragging');
          try { el.setPointerCapture(e.pointerId); } catch (err) {}
        });
        el.addEventListener('pointermove', function (e) {
          if (!down) return;
          var dx = e.clientX - startX;
          if (Math.abs(dx) > 4) moved = true;
          el.scrollLeft = startLeft - dx;
        });
        function endDrag() {
          if (!down) return;
          down = false;
          el.classList.remove('is-dragging');
          if (moved) {
            el.dataset.dragBlock = '1';
            window.setTimeout(function () { delete el.dataset.dragBlock; }, 80);
          }
        }
        el.addEventListener('pointerup', endDrag);
        el.addEventListener('pointercancel', endDrag);
        el.addEventListener('click', function (e) {
          if (el.dataset.dragBlock === '1') {
            e.preventDefault();
            e.stopPropagation();
          }
        }, true);
      }

      enableDragScroll(document.querySelector('.selects-rail'));

      apply();
    })();
  </script>`;
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

const CARD_TONES = ['tone-paper', 'tone-sky', 'tone-mint', 'tone-rose'];

function normalizeCategory(category) {
  const raw = String(category || '').trim();
  if (!raw) return 'Care Giver Tips';
  const mapped = LEGACY_CATEGORY_MAP[raw.toLowerCase()];
  if (mapped) return mapped;
  const exact = BLOG_TOPICS.find((t) => t.toLowerCase() === raw.toLowerCase());
  return exact || 'Care Giver Tips';
}

function cardTone(idx) {
  return CARD_TONES[idx % CARD_TONES.length];
}

function mediaBlock(p, eager) {
  if (p.image) {
    return `<div class="card-media"><img src="${escapeHtml(p.image)}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async"><span class="card-media-veil" aria-hidden="true"></span></div>`;
  }
  return `<div class="card-media is-placeholder" aria-hidden="true"><span class="card-media-veil" aria-hidden="true"></span></div>`;
}

function renderPostCard(p, idx, sizeClass) {
  const category = normalizeCategory(p.category);
  return `
    <a class="post-card ${sizeClass} ${cardTone(idx)}" href="/blog/${escapeHtml(p.slug)}" data-category="${escapeHtml(category)}">
      ${mediaBlock(p, idx < 2)}
      <div class="card-copy">
        <span class="cat">${escapeHtml(category)}</span>
        <h2>${escapeHtml(p.title)}</h2>
        <p>${escapeHtml(p.description)}</p>
      </div>
    </a>`;
}

function renderFeatureHero(p) {
  if (!p) return '';
  const category = normalizeCategory(p.category);
  return `
    <a class="feature-hero" href="/blog/${escapeHtml(p.slug)}" data-category="${escapeHtml(category)}">
      <div class="feature-hero-media">
        ${mediaBlock(p, true)}
      </div>
      <div class="feature-hero-copy">
        <p class="blog-section-label">Featured story</p>
        <span class="cat">${escapeHtml(category)} · ${escapeHtml(formatDateDisplay(p.date))}</span>
        <h2>${escapeHtml(p.title)}</h2>
        <p>${escapeHtml(p.description)}</p>
        <span class="feature-hero-cta">Read story</span>
      </div>
    </a>`;
}

function renderSelectCard(p, idx) {
  const category = normalizeCategory(p.category);
  return `
    <a class="select-card ${cardTone(idx)}" href="/blog/${escapeHtml(p.slug)}" data-category="${escapeHtml(category)}">
      ${mediaBlock(p, false)}
      <div class="card-copy">
        <span class="cat">${escapeHtml(category)}</span>
        <h2>${escapeHtml(p.title)}</h2>
      </div>
    </a>`;
}

function renderEditorialRows(posts, startIdx) {
  if (!posts.length) return '';
  const rows = [];
  let i = 0;
  let pattern = 0;
  while (i < posts.length) {
    const abs = startIdx + i;
    if (pattern % 3 === 0 && posts[i + 1]) {
      rows.push(`
        <div class="editorial-row is-split-wide">
          ${renderPostCard(posts[i], abs, 'size-feature')}
          ${renderPostCard(posts[i + 1], abs + 1, 'size-portrait')}
        </div>`);
      i += 2;
    } else if (pattern % 3 === 1 && posts[i + 1]) {
      rows.push(`
        <div class="editorial-row is-split-narrow">
          ${renderPostCard(posts[i], abs, 'size-portrait')}
          ${renderPostCard(posts[i + 1], abs + 1, 'size-feature')}
        </div>`);
      i += 2;
    } else {
      const trio = posts.slice(i, i + 3);
      rows.push(`
        <div class="editorial-row is-trio">
          ${trio.map((p, n) => renderPostCard(p, abs + n, n === 1 ? 'size-tall' : 'size-std')).join('\n')}
        </div>`);
      i += trio.length;
    }
    pattern += 1;
  }
  return rows.join('\n');
}

function buildIndex(posts) {
  const catButtons = [
    '<button type="button" class="blog-filter is-active" data-filter-type="category" data-filter-value="all">All topics</button>',
    ...BLOG_TOPICS.map(
      (c) =>
        `<button type="button" class="blog-filter" data-filter-type="category" data-filter-value="${escapeHtml(c)}">${escapeHtml(c)}</button>`,
    ),
  ].join('\n');

  const stripSlides = posts
    .slice(0, Math.min(8, posts.length))
    .map((p, i) => {
      const category = normalizeCategory(p.category);
      const toneClass =
        cardTone(i) === 'tone-sky'
          ? 'is-sky'
          : cardTone(i) === 'tone-mint'
            ? 'is-mint'
            : cardTone(i) === 'tone-rose'
              ? 'is-rose'
              : 'is-paper';
      return `
      <div class="swiper-slide">
        <article class="zoom-card ${toneClass}">
          <span class="zoom-card-media">${
            p.image
              ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" loading="lazy" decoding="async">`
              : ''
          }</span>
          <div class="zoom-card-content">
            <a class="zoom-card-link" href="/blog/${escapeHtml(p.slug)}">
              <h3 class="zoom-card-title"><span class="t">${escapeHtml(p.title)}</span> — ${escapeHtml(category)}</h3>
            </a>
          </div>
        </article>
      </div>`;
    })
    .join('\n');

  const strip =
    stripSlides
      ? `<div class="story-strip-wrap">
      <div class="swiper story-carousel" id="story-carousel" aria-label="Recent stories">
        <div class="swiper-wrapper">
          ${stripSlides}
        </div>
      </div>
    </div>`
      : '';

  const featured = posts[0] || null;
  const latest = posts.slice(1, 5);
  const selects = posts.slice(0, 6);
  const more = posts.slice(5);

  const bodyHtml = `
    <header class="blog-hero">
      <p class="blog-kicker">Liam's Call</p>
      <h1>Stories for caregivers.</h1>
      <p class="blog-hero-lead">
        Grounded pieces on wellbeing, communication, and supporting someone through mental health, addiction, or housing challenges.
      </p>
    </header>
    ${strip}
    <div class="blog-toolbar">
      <div class="blog-filters" role="group" aria-label="Filter by topic">${catButtons}</div>
      <p id="filter-meta" class="blog-filter-meta">Showing all ${posts.length} posts</p>
    </div>

    <div id="post-list" class="magazine-feed">
      ${
        featured
          ? `<section class="magazine-band tone-sky" data-filter-band>
              <div class="magazine-band-inner">
                ${renderFeatureHero(featured)}
              </div>
            </section>`
          : ''
      }

      ${
        latest.length
          ? `<section class="magazine-band tone-paper" data-filter-band>
              <div class="magazine-band-inner">
                <p class="blog-section-label">Latest stories</p>
                <div class="editorial-grid">
                  ${renderEditorialRows(latest, 1)}
                </div>
              </div>
            </section>`
          : ''
      }

      ${
        selects.length
          ? `<section class="magazine-band tone-mint" data-filter-band>
              <div class="magazine-band-inner">
                <div class="selects-head">
                  <p class="blog-section-label">Featured selects</p>
                  <p class="selects-lead">A short row of pieces worth sitting with — practical, calm, and specific.</p>
                </div>
                <div class="selects-rail" aria-label="Featured selects">
                  ${selects.map((p, i) => renderSelectCard(p, i)).join('\n')}
                </div>
              </div>
            </section>`
          : ''
      }

      <section class="magazine-band tone-rose newsletter-band">
        <div class="magazine-band-inner newsletter-layout">
          <div class="newsletter-copy">
            <p class="blog-section-label">Join the list</p>
            <h2>Like these stories? Get the quiet ones in your inbox.</h2>
            <p>Occasional caregiver notes — no noise, no hard sell.</p>
            <form id="blog-newsletter" class="newsletter-form" action="#" method="post">
              <label class="sr-only" for="newsletter-email">Email</label>
              <input id="newsletter-email" name="email" type="email" required placeholder="you@example.com" autocomplete="email">
              <button type="submit" class="pill-dark">Join</button>
            </form>
            <p id="newsletter-note" class="newsletter-note" hidden></p>
          </div>
          <div class="newsletter-aside" aria-hidden="true"></div>
        </div>
      </section>

      ${
        more.length
          ? `<section class="magazine-band tone-paper" data-filter-band>
              <div class="magazine-band-inner">
                <p class="blog-section-label">More from the desk</p>
                <div class="editorial-grid">
                  ${renderEditorialRows(more, 5)}
                </div>
              </div>
            </section>`
          : ''
      }
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
