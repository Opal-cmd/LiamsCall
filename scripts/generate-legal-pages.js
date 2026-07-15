const fs = require('fs');
const path = require('path');
const {
  organizationSchema,
  faqPageSchema,
  speakableSpec,
  RESOURCES_FAQS,
  ABOUT_FAQS,
} = require('./lib/site-identity');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

function extractPage(key) {
  const start = html.indexOf(`${key}: { title:`);
  if (start < 0) throw new Error(`missing ${key}`);
  const titleMatch = html.slice(start).match(new RegExp(`${key}:\\s*\\{\\s*title:\\s*'([^']+)'`));
  if (!titleMatch) throw new Error(`missing title for ${key}`);
  const bodyStart = html.indexOf('body: `', start) + 'body: `'.length;
  let i = bodyStart;
  while (i < html.length) {
    if (html[i] === '`' && html[i - 1] !== '\\') break;
    i += 1;
  }
  return { title: titleMatch[1], body: html.slice(bodyStart, i).trim() };
}

// Every standalone page shares this sidebar-driven shell — the same nav
// structure (logo/home, New Chat, Resources, About Us, ad card, legal
// links) as the in-app chat sidebar, so leaving the SPA to visit a real
// URL never feels like a different site.
function shell(title, description, active, body, extras = {}) {
  const navLink = (key, href, label) =>
    `<a class="side-link${active === key ? ' active' : ''}" href="${href}">${label}</a>`;
  const canonical = extras.canonical || `https://liamscall.com/${active === 'home' ? '' : active}`;
  const ogTitle = extras.ogTitle || `${title} — Liam's Call`;
  const crumbLabel = extras.crumb || title;
  const schema = extras.schema
    ? `\n  <script type="application/ld+json">\n${JSON.stringify(extras.schema, null, 4)}\n  </script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#0f4a3a">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Liam's Call">
  <meta property="og:title" content="${ogTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="https://liamscall.com/assets/logo-icon.svg">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${ogTitle}">
  <meta name="twitter:description" content="${description}">
  <title>${title} — Liam's Call</title>
  <link rel="icon" type="image/svg+xml" href="/assets/logo-icon.svg">${schema}
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <style>
    :root { --green-dark: #0f4a3a; --beige-main: #e8dfd3; --sidebar-w: 16rem; }
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f3f0ea; margin: 0; color: #1f2937; }
    a { color: var(--green-dark); }
    .pill-dark { background: var(--green-dark); color: #fff; border-radius: 9999px; }

    .page-shell { display: flex; min-height: 100vh; align-items: stretch; }

    /* Sidebar — mirrors the in-app chat sidebar's nav, ad card, and legal links */
    .site-sidebar {
      width: var(--sidebar-w);
      min-width: var(--sidebar-w);
      flex-shrink: 0;
      background: #fff;
      border-right: 1px solid #f3f4f6;
      padding: 1.75rem 1.5rem;
      display: flex;
      flex-direction: column;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
    }
    .sidebar-home-btn {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      margin-bottom: 1.75rem;
      text-decoration: none;
      flex-shrink: 0;
    }
    .sidebar-home-btn img {
      height: 1.75rem;
      width: auto;
      filter: invert(18%) sepia(60%) saturate(800%) hue-rotate(120deg) brightness(70%) contrast(120%);
    }
    .sidebar-home-btn span {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--green-dark);
      letter-spacing: -0.02em;
    }
    .side-nav { display: flex; flex-direction: column; gap: 1.15rem; font-size: 0.9rem; color: #111827; flex-shrink: 0; }
    .side-link { color: inherit; text-decoration: none; cursor: pointer; }
    .side-link:hover { opacity: 0.75; }
    .side-link.active { font-weight: 600; text-decoration: underline; text-underline-offset: 4px; color: var(--green-dark); }
    .sidebar-spacer { margin-top: auto; padding-top: 1.5rem; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .sidebar-cta {
      display: block; border-radius: 0.75rem; overflow: hidden; border: 1px solid #e5e7eb;
      background: #1a2d5a; color: #fff; font-size: 10px; line-height: 1.35; text-decoration: none;
    }
    .sidebar-cta-title { padding: 0.5rem 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.1); font-weight: 600; color: #fff; }
    .sidebar-cta-body { padding: 0.7rem 0.75rem; }
    .sidebar-cta-body p { margin: 0 0 0.5rem; color: #fff; }
    .sidebar-cta-body p:last-child { margin-bottom: 0; color: rgba(255,255,255,0.7); }
    .ad-slot {
      border-radius: 0.75rem; overflow: hidden; border: 1px dashed rgba(15,74,58,0.28);
      background: #fafaf8; font-size: 10px; line-height: 1.35; min-height: 5.5rem;
    }
    .ad-slot-label {
      padding: 0.4rem 0.65rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
      border-bottom: 1px solid #ece7df; color: #9a6700; font-size: 0.65rem;
    }
    .ad-slot-body { padding: 0.65rem 0.75rem; color: #6b7280; }
    .ad-slot-body p { margin: 0 0 0.35rem; }
    .ad-slot-body p:last-child { margin-bottom: 0; color: #9ca3af; }
    .sidebar-legal { display: flex; align-items: center; gap: 0.55rem; margin-top: 0.25rem; padding-top: 0.75rem; border-top: 1px solid #f3f4f6; }
    .sidebar-legal a,
    .sidebar-legal a.side-link {
      font-size: 10px !important;
      line-height: 1.3;
      font-weight: 400 !important;
      color: #d1d5db !important;
      text-decoration: none !important;
    }
    .sidebar-legal a:hover,
    .sidebar-legal a.side-link:hover { color: #6b7280 !important; }
    .sidebar-legal a.side-link.active {
      color: #9ca3af !important;
      font-weight: 500 !important;
      text-decoration: underline !important;
      text-underline-offset: 2px;
    }
    .sidebar-legal span { font-size: 10px; color: #e5e7eb; line-height: 1; }

    .blog-crumb {
      margin: 0 0 0.85rem;
      font-size: 0.82rem;
      line-height: 1.35;
      color: #9ca3af;
    }
    .blog-crumb a {
      color: #60a5fa;
      text-decoration: none;
    }
    .blog-crumb a:hover { text-decoration: underline; text-underline-offset: 2px; }
    .blog-crumb span[aria-hidden="true"] { margin: 0 0.35rem; color: #d1d5db; }

    /* Mobile top bar + drawer */
    .mobile-topbar { display: none; }
    #sidebar-overlay { display: none; }

    .site-main { flex: 1; min-width: 0; }
    main { max-width: 42rem; margin: 0 auto; padding: 2.5rem 1.5rem 4rem; }
    h1 { font-size: clamp(1.45rem, 3vw, 1.85rem); font-weight: 700; color: var(--green-dark); letter-spacing: -0.02em; margin: 0 0 1.25rem; text-align: center; }

    @media (max-width: 767px) {
      .site-sidebar {
        position: fixed;
        top: 0;
        left: 0;
        height: 100%;
        width: 15.5rem;
        min-width: 15.5rem;
        transform: translateX(-100%);
        transition: transform 260ms ease;
        z-index: 60;
        box-shadow: 0 12px 32px rgba(15, 74, 58, 0.2);
      }
      .site-sidebar.is-open { transform: translateX(0); }

      #sidebar-overlay.is-open {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.35);
        z-index: 50;
      }

      .mobile-topbar {
        display: flex;
        align-items: center;
        position: relative;
        height: 3.25rem;
        padding: 0 1rem;
        border-bottom: 1px solid rgba(15, 74, 58, 0.08);
        background: rgba(243, 240, 234, 0.92);
        backdrop-filter: blur(10px);
        position: sticky;
        top: 0;
        z-index: 30;
      }
      .mobile-menu-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.15rem;
        height: 2.15rem;
        border-radius: 0.65rem;
        border: none;
        background: var(--green-dark);
        color: #fff;
        cursor: pointer;
        flex-shrink: 0;
      }
      .mobile-menu-toggle svg { width: 1.05rem; height: 1.05rem; stroke: currentColor; }
      .mobile-top-brand { display: flex; align-items: center; gap: 0.5rem; margin: 0 auto; text-decoration: none; }
      .mobile-top-brand img { height: 1.35rem; width: auto; }
      .mobile-top-brand span { font-size: 0.92rem; font-weight: 700; color: var(--green-dark); letter-spacing: -0.02em; }

      main { padding: 1.75rem 1.1rem 3rem; }
    }
  </style>
</head>
<body>
  <div class="page-shell">
    <div id="sidebar-overlay"></div>
    <aside id="site-sidebar" class="site-sidebar">
      <a class="sidebar-home-btn" href="/">
        <img src="/assets/logo-icon.svg" alt="">
        <span>Liam's Call</span>
      </a>
      <nav class="side-nav">
        ${navLink('chat', '/', 'New Chat')}
        ${navLink('resources', '/resources', 'Resources')}
        ${navLink('about', '/about', 'About Us')}
      </nav>
      <div class="sidebar-spacer">
        <a class="sidebar-cta" href="/resources">
          <div class="sidebar-cta-title">Resources</div>
          <div class="sidebar-cta-body">
            <p>Mental health, addiction and housing support for you and your loved ones.</p>
            <p>Explore guides, tips, and tools for caregivers and families.</p>
          </div>
        </a>
        <div class="ad-slot ad-slot--placeholder" data-ad-slot="sidebar" aria-label="Sidebar ad">
          <div class="ad-slot-label">Sponsored</div>
          <div class="ad-slot-body">
            <p>Sidebar ad</p>
            <p>Standard insertion area — Google Ads appear here after publisher approval.</p>
          </div>
        </div>
        <div class="sidebar-legal">
          ${navLink('privacy', '/privacy', 'Privacy')}
          <span>·</span>
          ${navLink('terms', '/terms', 'Terms')}
          <span>·</span>
          ${navLink('sitemap', '/sitemap', 'Sitemap')}
        </div>
      </div>
    </aside>

    <div class="site-main">
      <div class="mobile-topbar">
        <button id="mobile-menu-toggle" type="button" class="mobile-menu-toggle" aria-label="Toggle navigation menu" aria-expanded="false" aria-controls="site-sidebar">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <a class="mobile-top-brand" href="/">
          <img src="/assets/logo-icon.svg" alt="">
          <span>Liam's Call</span>
        </a>
      </div>
      <main>
        <nav class="blog-crumb" aria-label="Breadcrumb">
          <a href="/">Home</a>
          <span aria-hidden="true">/</span>
          <span>${crumbLabel}</span>
        </nav>
        <h1>${title}</h1>
        ${body}
      </main>
    </div>
  </div>

  <script>
    (function () {
      var sidebar = document.getElementById('site-sidebar');
      var overlay = document.getElementById('sidebar-overlay');
      var toggle = document.getElementById('mobile-menu-toggle');
      function closeMenu() {
        sidebar.classList.remove('is-open');
        overlay.classList.remove('is-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');
      }
      function openMenu() {
        sidebar.classList.add('is-open');
        overlay.classList.add('is-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'true');
      }
      if (toggle) {
        toggle.addEventListener('click', function () {
          if (sidebar.classList.contains('is-open')) closeMenu();
          else openMenu();
        });
      }
      overlay.addEventListener('click', closeMenu);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMenu();
      });
    })();
  </script>
</body>
</html>
`;
}

const pages = [
  {
    key: 'about',
    file: 'public/about.html',
    description:
      "About Liam's Call (liamscall.com): a Canadian mental health technology project for caregivers and families — Mental Health, Addiction, Homelessness support without a waitlist or co-pay.",
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        organizationSchema(),
        {
          '@type': 'AboutPage',
          '@id': 'https://liamscall.com/about#page',
          name: "About Liam's Call",
          url: 'https://liamscall.com/about',
          description:
            "Liam's Call (liamscall.com) exists for one reason: to make sure no caregiver or family member facing a mental health, addiction, or housing challenge has to face it alone.",
          isPartOf: { '@id': 'https://liamscall.com/#website' },
          about: { '@id': 'https://liamscall.com/#organization' },
          speakable: speakableSpec(['h1', '#faq h4', '#faq p']),
        },
        faqPageSchema(ABOUT_FAQS, 'https://liamscall.com/about'),
      ],
    },
  },
  {
    key: 'privacy',
    file: 'public/privacy.html',
    description: "Privacy Policy for Liam's Call — how we handle chat data, approximate location, and third-party providers.",
  },
  {
    key: 'terms',
    file: 'public/terms.html',
    description: 'Terms of Use for Liamscall.com — rules for using Liam\'s Call AI support chat.',
  },
  {
    key: 'resources',
    file: 'public/resources.html',
    description:
      "Crisis and support resources from Liam's Call for Canada and the United States — 988, 911, 211, SAMHSA, ConnexOntario, FindTreatment.gov, Kids Help Phone, and caregiver supports.",
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        organizationSchema(),
        {
          '@type': 'WebPage',
          '@id': 'https://liamscall.com/resources#page',
          name: "Crisis & Support Resources — Liam's Call",
          url: 'https://liamscall.com/resources',
          description:
            'Verified crisis lines and directories for Canada and the United States — mental health, addiction, housing, and caregiver support.',
          isPartOf: { '@id': 'https://liamscall.com/#website' },
          speakable: speakableSpec(['h1', '#faq h4', '#faq p']),
        },
        faqPageSchema(RESOURCES_FAQS, 'https://liamscall.com/resources'),
      ],
    },
  },
];

function writeLegalPages() {
  for (const p of pages) {
    let { title, body } = extractPage(p.key);
    body = body
      .replace(
        /<button type="button" class="underline text-\[var\(--green-dark\)\] font-medium" data-nav="resources">Resources page<\/button>/g,
        '<a href="/resources" class="underline text-[var(--green-dark)] font-medium">Resources page</a>',
      )
      .replace(
        /\(see Privacy Policy\)/g,
        '(see <a href="/privacy" class="underline text-[var(--green-dark)]">Privacy Policy</a>)',
      )
      .replace(
        /See our Privacy Policy for more detail\./g,
        'See our <a href="/privacy" class="underline text-[var(--green-dark)]">Privacy Policy</a> for more detail.',
      );
    const crumbByKey = {
      about: 'About',
      resources: 'Resources',
      privacy: 'Privacy',
      terms: 'Terms',
      sitemap: 'Sitemap',
    };
    const out = path.join(root, p.file);
    fs.writeFileSync(
      out,
      shell(title, p.description, p.key, body, {
        schema: p.schema,
        crumb: p.crumb || crumbByKey[p.key] || title,
      }),
    );
    console.log('wrote', p.file, fs.statSync(out).size);
  }
}

module.exports = { shell, writeLegalPages };

if (require.main === module) {
  writeLegalPages();
}
