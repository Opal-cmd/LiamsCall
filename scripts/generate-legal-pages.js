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
// structure (logo/home, New Chat, Resources, About, ad card, legal
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
  <meta property="og:image" content="https://liamscall.com/assets/logo-icon.png">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${ogTitle}">
  <meta name="twitter:description" content="${description}">
  <title>${title} — Liam's Call</title>
  <link rel="icon" href="/favicon.ico?v=2" sizes="any">
  <link rel="icon" type="image/png" href="/assets/favicon.png?v=2">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png?v=2">${schema}
  <link rel="stylesheet" href="/assets/site.css">
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <style>* { box-sizing: border-box; }</style>
</head>
<body class="page-shell-root">
  <div class="page-shell">
    <div id="sidebar-overlay"></div>
    <aside id="site-sidebar" class="site-sidebar">
      <a class="sidebar-home-btn" href="/">
        <img src="/assets/logo-icon.png" alt="">
        <span>Liam's Call</span>
      </a>
      <nav class="side-nav">
        ${navLink('chat', '/', 'New Chat')}
        ${navLink('resources', '/resources', 'Resources')}
        ${navLink('about', '/about', 'About')}
      </nav>
      <div class="sidebar-spacer">
        <a class="sidebar-cta" href="/resources">
          <div class="sidebar-cta-title">Resources</div>
          <div class="sidebar-cta-body">
            <p>Mental health, addiction and housing support for you and your loved ones.</p>
            <p>Explore guides, tips, and tools for caregivers and families.</p>
          </div>
        </a>
        <div class="sidebar-legal">
          ${navLink('privacy', '/privacy', 'Privacy')}
          <span>·</span>
          ${navLink('terms', '/terms', 'Terms')}
          <span>·</span>
          ${navLink('sitemap', '/sitemap', 'Sitemap')}
          <span>·</span>
          <a class="side-link" href="/.well-known/brand.json" title="Machine-readable brand identity for AI agents">Brand</a>
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
          <img src="/assets/logo-icon.png" alt="">
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
      "About Liam's Call (liamscall.com): mental health, addiction, and housing support for caregivers and families — free, no waitlist or co-pay.",
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
