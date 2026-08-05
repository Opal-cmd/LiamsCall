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
  escapeHtml,
  renderAdSlot,
  splitArticleSegments,
} = require('./lib/blog-utils');
const { execFileSync } = require('child_process');
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
      // Carousel slides stay unfiltered (like WePresent's ticker) — hiding
      // slides breaks Swiper's centering math.
      var cards = Array.prototype.slice.call(document.querySelectorAll('.polaroid[data-category]:not(.is-slide)'));
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
        document.querySelectorAll('.polaroid-row').forEach(function (row) {
          var any = row.querySelectorAll('.polaroid:not(.is-hidden)').length > 0;
          row.classList.toggle('is-empty', !any);
        });
        document.querySelectorAll('[data-filter-band]').forEach(function (band) {
          var any = band.querySelectorAll('[data-category]:not(.is-hidden)').length > 0;
          band.classList.toggle('is-empty', !any);
        });
        if (meta) {
          meta.textContent = state.category === 'all'
            ? ('Showing ' + shown + ' stor' + (shown === 1 ? 'y' : 'ies'))
            : ('Showing ' + shown + ' stor' + (shown === 1 ? 'y' : 'ies') + ' · ' + state.category);
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
          try {
            var url = new URL(window.location.href);
            if (state.category && state.category !== 'all') url.searchParams.set('category', state.category);
            else url.searchParams.delete('category');
            window.history.replaceState({}, '', url.pathname + url.search + url.hash);
          } catch (err) {}
          apply();
        });
      });

      try {
        var initial = new URLSearchParams(window.location.search).get('category');
        if (initial) {
          var match = buttons.find(function (b) {
            return b.getAttribute('data-filter-type') === 'category' &&
              b.getAttribute('data-filter-value') === initial;
          });
          if (match) {
            state.category = initial;
            buttons
              .filter(function (b) { return b.getAttribute('data-filter-type') === 'category'; })
              .forEach(function (b) {
                b.classList.toggle('is-active', b.getAttribute('data-filter-value') === initial);
              });
          }
        }
      } catch (err) {}
      apply();

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

/** Polaroid frame tones (Liam's Call brand tints), rotated per card. */
const POLAROID_TONES = ['pl-sage', 'pl-sand', 'pl-mint', 'pl-cream', 'pl-moss', 'pl-clay'];

function normalizeCategory(category) {
  const raw = String(category || '').trim();
  if (!raw) return 'Care Giver Tips';
  const mapped = LEGACY_CATEGORY_MAP[raw.toLowerCase()];
  if (mapped) return mapped;
  const exact = BLOG_TOPICS.find((t) => t.toLowerCase() === raw.toLowerCase());
  return exact || 'Care Giver Tips';
}

function polaroidTone(idx) {
  return POLAROID_TONES[idx % POLAROID_TONES.length];
}

function polaroidMedia(p, eager) {
  if (p.image) {
    return `<span class="polaroid-media"><img src="${escapeHtml(p.image)}" alt="" loading="${eager ? 'eager' : 'lazy'}" decoding="async"></span>`;
  }
  return `<span class="polaroid-media is-placeholder" aria-hidden="true"></span>`;
}

/**
 * WePresent card: pastel frame, inset image, centered caption inside the frame.
 * Caption = serif title + em dash + sans description.
 */
function renderPolaroid(p, idx, sizeClass = '', { eager = false } = {}) {
  const category = normalizeCategory(p.category);
  return `
    <a class="polaroid ${polaroidTone(idx)} ${sizeClass}" href="/blog/${escapeHtml(p.slug)}" data-category="${escapeHtml(category)}">
      ${polaroidMedia(p, eager)}
      <span class="polaroid-caption"><span class="t">${escapeHtml(p.title)}</span> — ${escapeHtml(p.description)}</span>
    </a>`;
}

/** Alternating asymmetric two-up rows (wide/narrow, then narrow/wide). */
function renderPolaroidRows(posts, startIdx) {
  if (!posts.length) return '';
  const rows = [];
  let i = 0;
  let row = 0;
  while (i < posts.length) {
    const abs = startIdx + i;
    if (posts[i + 1]) {
      const flip = row % 2 === 1;
      rows.push(`
        <div class="polaroid-row ${flip ? 'is-narrow-wide' : 'is-wide-narrow'}">
          ${renderPolaroid(posts[i], abs, flip ? 'is-narrow' : 'is-wide', { eager: abs < 2 })}
          ${renderPolaroid(posts[i + 1], abs + 1, flip ? 'is-wide' : 'is-narrow', { eager: abs + 1 < 2 })}
        </div>`);
      i += 2;
    } else {
      rows.push(`
        <div class="polaroid-row is-solo">
          ${renderPolaroid(posts[i], abs, 'is-wide')}
        </div>`);
      i += 1;
    }
    row += 1;
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
    .map(
      (p, i) => `
      <div class="swiper-slide">
        ${renderPolaroid(p, i, 'is-slide')}
      </div>`,
    )
    .join('\n');

  const strip =
    stripSlides
      ? `<div class="story-strip-wrap">
      <div class="swiper story-carousel" id="story-carousel" aria-label="Recent stories">
        <div class="swiper-wrapper">
          ${stripSlides}
        </div>
      </div>
      <button type="button" class="strip-nav strip-prev" aria-label="Previous story">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <button type="button" class="strip-nav strip-next" aria-label="Next story">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>
      </button>
    </div>`
      : '';

  // Featured story is always the latest post; "Latest stories" shows the newest 4.
  const featured = posts[0] || null;
  const latest = posts.slice(0, 4);
  // Quiet selects: 3 random caregiver pieces, reshuffled on every build.
  const selects = posts
    .filter((p) => normalizeCategory(p.category) === 'Care Giver Tips')
    .map((p) => ({ p, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, 3)
    .map((x) => x.p);

  const bodyHtml = `
    <header class="blog-hero">
      <p class="blog-kicker">Liam's Call</p>
      <h1>Stories for<br>caregivers</h1>
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
        latest.length
          ? `<section class="section-card" data-filter-band>
              <h2 class="section-title">Latest stories</h2>
              <div class="polaroid-grid">
                ${renderPolaroidRows(latest, 1)}
              </div>
            </section>`
          : ''
      }

      ${
        featured
          ? `<section class="feature-band tone-periwinkle" data-filter-band>
              <h2 class="section-title">Featured story</h2>
              <div class="feature-band-inner">
                ${renderPolaroid(featured, 4, 'is-hero', { eager: true })}
              </div>
            </section>`
          : ''
      }

      ${
        selects.length
          ? `<section class="section-card" data-filter-band>
              <h2 class="section-title">The quiet selects</h2>
              <p class="section-lead">A few caregiver favorites — practical, calm, and specific pieces worth sitting with.</p>
              <div class="selects-rail" aria-label="Featured selects">
                ${selects.map((p, i) => renderPolaroid(p, i + 3, 'is-select')).join('\n')}
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

/** Page tint per category — brand-kit tints, the whole story page wears this color. */
const STORY_TONES = {
  'Mental health': 'story-tone-sage',
  Addiction: 'story-tone-moss',
  Homelessness: 'story-tone-sand',
  'Care Giver Tips': 'story-tone-cream',
};

function shareIconSvg() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>`;
}

function renderStoryMeta({ date, shareUrl, shareTitle }) {
  return `
        <aside class="story-meta">
          <div class="story-meta-row">
            <p class="story-meta-label">Published</p>
            <p class="story-meta-value"><time datetime="${escapeHtml(date)}">${escapeHtml(formatDateDisplay(date))}</time></p>
          </div>
          <ul class="story-actions">
            <li>
              <button type="button" class="story-share" data-share-url="${escapeHtml(shareUrl)}" data-share-title="${escapeHtml(shareTitle)}" aria-label="Share this story">
                ${shareIconSvg()}
              </button>
            </li>
          </ul>
          <a class="story-back" href="/blog">&larr; All stories</a>
        </aside>`;
}

function renderArticleSections(post, { howtoHtml, category }) {
  const segments = splitArticleSegments(post.html);
  const shareUrl = `${SITE}/blog/${post.slug}`;
  const shareTitle = post.title;
  const meta = renderStoryMeta({ date: post.date, shareUrl, shareTitle });
  const tags = `
          <div class="story-tags">
            <span>Read more about</span>
            <a class="story-tag" href="/blog?category=${encodeURIComponent(category)}">${escapeHtml(category)}</a>
          </div>`;
  const footerBits = `
          ${howtoHtml}
          <div class="blog-cta">
            <p>If this resonates, you can keep going in a private chat. No account required.</p>
            <a class="pill-dark" href="/">Talk with Liam's Call AI</a>
            &nbsp;&nbsp;<a href="/resources" class="cta-alt-link">Crisis resources</a>
          </div>
          ${tags}
          <p class="blog-disclaimer">
            Liam's Call is an informational tool, not a medical professional or crisis service.
            In a crisis, call or text <a href="tel:988">9-8-8</a> (Canada &amp; U.S.) or call <a href="tel:911">9-1-1</a> for emergencies.
          </p>`;

  if (!segments.length) {
    return `
    <div class="story-card">
      <div class="story-grid">
        ${meta}
        <div class="story-body-col">
          <article class="blog-body"></article>
          ${footerBits}
        </div>
      </div>
    </div>`;
  }

  const parts = [];
  let proseIndex = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg.type === 'quote') {
      parts.push(`
    <section class="story-quote-band" aria-label="Pull quote">
      ${seg.html}
    </section>`);
      continue;
    }
    const isFirst = proseIndex === 0;
    const isLast = !segments.slice(i + 1).some((s) => s.type === 'prose');
    proseIndex += 1;
    if (isFirst) {
      parts.push(`
    <div class="story-card">
      <div class="story-grid">
        ${meta}
        <div class="story-body-col">
          <article class="blog-body">
            ${seg.html}
          </article>
          ${isLast ? footerBits : ''}
        </div>
      </div>
    </div>`);
    } else {
      parts.push(`
    <div class="story-card is-continuation">
      <div class="story-grid is-body-only">
        <div class="story-body-col">
          <article class="blog-body">
            ${seg.html}
          </article>
          ${isLast ? footerBits : ''}
        </div>
      </div>
    </div>`);
    }
  }

  // If the article ended on a quote, append footer in a closing card.
  const last = segments[segments.length - 1];
  if (last && last.type === 'quote') {
    parts.push(`
    <div class="story-card is-continuation">
      <div class="story-grid is-body-only">
        <div class="story-body-col">
          ${footerBits}
        </div>
      </div>
    </div>`);
  }

  return parts.join('\n');
}

function buildPost(post, allPosts = []) {
  assertPostGuards(post, { strictSafe: post.risk === 'safe' });
  const category = normalizeCategory(post.category);
  const tone = STORY_TONES[category] || 'story-tone-cream';
  const hero =
    post.image && post.image.startsWith('/')
      ? `<figure class="story-hero-media"><img src="${escapeHtml(post.image)}" alt="" fetchpriority="high"></figure>`
      : '';
  const postUrl = `${SITE}/blog/${post.slug}`;
  const howto = HOWTO_BY_SLUG[post.slug];
  const howtoHtml = renderHowToBlock(howto);

  // Related stories: same category first, then most recent others.
  const others = allPosts.filter((p) => p.slug !== post.slug);
  const related = [
    ...others.filter((p) => normalizeCategory(p.category) === category),
    ...others.filter((p) => normalizeCategory(p.category) !== category),
  ].slice(0, 4);

  const relatedHtml = related.length
    ? `
    <section class="story-related" aria-label="More stories">
      <h2 class="section-title">More stories</h2>
      <div class="polaroid-grid">
        ${renderPolaroidRows(related, 1)}
      </div>
    </section>`
    : '';

  const bodyHtml = `
    <header class="story-head">
      <p class="story-kicker">${escapeHtml(category)}</p>
      <h1 class="story-title">${escapeHtml(post.title)}</h1>
      <p class="story-dek speakable-summary">${escapeHtml(post.description)}</p>
    </header>
    ${hero}
    ${renderArticleSections(post, { howtoHtml, category })}
    <button type="button" class="story-share-float" data-share-url="${escapeHtml(postUrl)}" data-share-title="${escapeHtml(post.title)}" aria-label="Share this story">
      ${shareIconSvg()}
    </button>
    ${relatedHtml}
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
    articleTone: tone,
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
    fs.writeFileSync(path.join(dir, 'index.html'), buildPost(post, posts));
  }

  writeSitemapViaMain();
  verifyGeneratedMetadata(posts);
  console.log(`Built ${posts.length} blog post(s) → public/blog/`);
}

function writeSitemapViaMain() {
  // Keep the production sitemap HTML/XSL design from scripts/write-sitemap.js
  // instead of the staging blog-utils writer.
  execFileSync(process.execPath, [path.join(__dirname, 'write-sitemap.js')], {
    stdio: 'inherit',
  });
}

function verifyGeneratedMetadata(posts) {
  const root = path.join(__dirname, '..');
  const sitemapXml = fs.readFileSync(path.join(root, 'public', 'sitemap.xml'), 'utf8');
  const sitemapHtml = fs.readFileSync(path.join(root, 'public', 'sitemap.html'), 'utf8');
  const requiredFiles = [
    path.join(root, 'public', 'site-identity.json'),
    path.join(root, 'public', '.well-known', 'brand.json'),
  ];

  for (const filePath of requiredFiles) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Metadata build failed: missing ${path.relative(root, filePath)}`);
    }
  }

  for (const post of posts) {
    const route = `/blog/${post.slug}`;
    const pagePath = path.join(PUBLIC_BLOG_DIR, post.slug, 'index.html');
    const page = fs.readFileSync(pagePath, 'utf8');
    if (!page.includes('"@type": "BlogPosting"')) {
      throw new Error(`Metadata build failed: BlogPosting schema missing for ${post.slug}`);
    }
    if (!sitemapXml.includes(`<loc>${SITE}${route}</loc>`)) {
      throw new Error(`Metadata build failed: sitemap.xml is missing ${route}`);
    }
    if (!sitemapHtml.includes(`href="${route}"`)) {
      throw new Error(`Metadata build failed: sitemap.html is missing ${route}`);
    }
  }
}

main();
