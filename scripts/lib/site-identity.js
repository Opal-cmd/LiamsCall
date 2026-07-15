'use strict';

/** Canonical site identity for sitemap, schema, meta, and directory listings. */
const SITE_IDENTITY = {
  siteName: "Liam's Call",
  domain: 'liamscall.com',
  url: 'https://liamscall.com',
  category: 'Health Sciences, Social/Civic Services',
  subCategory: 'Mental Health, Addiction, Homelessness',
  shortDescription:
    "Liam's Call (liamscall.com) exists for one reason: to make sure no caregiver or family member facing a mental health, addiction, or housing challenge has to face it alone. We believe that accessible, judgment-free support — available at any hour, without a waitlist or a co-pay — can make a real difference in people's lives.",
  /** One-line disambiguation for Google/AI Overview (not LimeCall / phone widgets). */
  disambiguatingDescription:
    "Liam's Call (liamscall.com) is a free AI web chat for caregivers and families in Canada and the United States facing mental health, addiction, and housing challenges — not LimeCall, not a click-to-call widget company, and not an AI phone receptionist or marketing platform.",
  fullDescription:
    "Liam's Call is a mental health technology project focused on caregiver and family wellbeing in Canada and the United States. We are a small team with a deep personal connection to the challenges of caregiving — many of us have navigated the mental and emotional weight of supporting a loved one through illness, aging, or crisis.\n\n" +
    "Liam's Call (liamscall.com) exists for one reason: to make sure no caregiver or family member facing a mental health, addiction, or housing challenge has to face it alone. We believe that accessible, judgment-free support — available at any hour, without a waitlist or a co-pay — can make a real difference in people's lives.",
  /**
   * Official profiles Google can treat as the same entity (schema.org sameAs).
   * Only real public URLs — add LinkedIn / Instagram / X when they exist.
   */
  sameAs: [
    'https://github.com/Opal-cmd/LiamsCall',
  ],
  keywords: [
    "Liam's Call",
    'liamscall',
    'liamscall.com',
    'Health Sciences',
    'Social Services',
    'Civic Services',
    'Mental Health',
    'Addiction',
    'Homelessness',
    'caregiver support',
    'Canada',
    'Ontario',
  ],
  knowsAbout: [
    'mental health',
    'addiction',
    'homelessness',
    'housing instability',
    'caregiving',
    'family support',
    'crisis resources',
    'Health Sciences',
    'Social/Civic Services',
    'Toronto shelter',
    'Ontario detox',
    'ConnexOntario',
    '211 Ontario',
  ],
};

function metaDescription() {
  // Search snippets prefer ~155–160 chars; keep mission lead without cutting mid-word awkwardly.
  const short = SITE_IDENTITY.shortDescription;
  if (short.length <= 300) return short;
  return `${short.slice(0, 297).replace(/\s+\S*$/, '')}…`;
}

function organizationSchema() {
  const org = {
    '@type': 'Organization',
    '@id': `${SITE_IDENTITY.url}/#organization`,
    name: SITE_IDENTITY.siteName,
    alternateName: ['Liams Call', 'liamscall.com', 'LiamsCall'],
    url: `${SITE_IDENTITY.url}/`,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_IDENTITY.url}/assets/logo-icon.svg`,
    },
    email: 'hello@liamscall.ca',
    description: SITE_IDENTITY.shortDescription,
    disambiguatingDescription: SITE_IDENTITY.disambiguatingDescription,
    areaServed: ['CA', 'US'],
    knowsAbout: SITE_IDENTITY.knowsAbout,
    category: SITE_IDENTITY.category,
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'hello@liamscall.ca',
        availableLanguage: ['en', 'en-CA'],
      },
    ],
    additionalType: ['https://schema.org/CivicStructure'],
  };
  if (SITE_IDENTITY.sameAs && SITE_IDENTITY.sameAs.length) {
    org.sameAs = SITE_IDENTITY.sameAs;
  }
  return org;
}

function websiteSchema() {
  return {
    '@type': 'WebSite',
    '@id': `${SITE_IDENTITY.url}/#website`,
    name: SITE_IDENTITY.siteName,
    url: `${SITE_IDENTITY.url}/`,
    description: SITE_IDENTITY.shortDescription,
    inLanguage: 'en',
    publisher: { '@id': `${SITE_IDENTITY.url}/#organization` },
    about: SITE_IDENTITY.subCategory.split(',').map((s) => s.trim()),
  };
}

/** Google/AI preferred voice & TTS cue (cssSelector must match crawlable nodes). */
function speakableSpec(cssSelectors = ['h1', '.speakable-summary']) {
  return {
    '@type': 'SpeakableSpecification',
    cssSelector: cssSelectors,
  };
}

/**
 * FAQPage JSON-LD. Each item: { question, answer } — answers must match visible FAQ copy.
 */
function faqPageSchema(faqs, pageUrl) {
  return {
    '@type': 'FAQPage',
    '@id': `${pageUrl}#faq`,
    mainEntity: (faqs || []).map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

function blogPostingSchema({
  title,
  description,
  datePublished,
  dateModified,
  url,
  category,
  region,
  image,
}) {
  const schema = {
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    headline: title,
    description,
    datePublished,
    dateModified: dateModified || datePublished,
    inLanguage: 'en-CA',
    isAccessibleForFree: true,
    author: {
      '@type': 'Organization',
      '@id': `${SITE_IDENTITY.url}/#organization`,
      name: SITE_IDENTITY.siteName,
      url: `${SITE_IDENTITY.url}/`,
    },
    publisher: {
      '@type': 'Organization',
      '@id': `${SITE_IDENTITY.url}/#organization`,
      name: SITE_IDENTITY.siteName,
      url: `${SITE_IDENTITY.url}/`,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_IDENTITY.url}/assets/logo-icon.svg`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    articleSection: category,
    contentLocation: region || 'Canada',
    speakable: speakableSpec(['h1', 'article.blog-body > p:first-of-type', '.speakable-summary']),
  };
  if (image) {
    schema.image = image.startsWith('http')
      ? image
      : `${SITE_IDENTITY.url}${image.startsWith('/') ? image : `/${image}`}`;
  } else {
    schema.image = `${SITE_IDENTITY.url}/assets/logo-icon.svg`;
  }
  return schema;
}

/**
 * HowTo JSON-LD. steps: [{ name, text }] — must match visible ordered steps on the page.
 */
function howToSchema({ name, description, steps, url }) {
  return {
    '@type': 'HowTo',
    '@id': `${url}#howto`,
    name,
    description,
    inLanguage: 'en-CA',
    step: (steps || []).map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

/** Shared FAQs for /resources (answers must stay in sync with page HTML). */
const RESOURCES_FAQS = [
  {
    question: 'How do I find a Toronto shelter tonight?',
    answer:
      "Call Toronto Shelter Central Intake at 416-338-4766 or 1-877-338-4766, or dial 311 in Toronto. You can also use 211 Ontario (211ontario.ca). Liam's Call does not list individual shelter phones because vacancies change constantly.",
  },
  {
    question: 'How do I find Ontario detox or addiction treatment near me?',
    answer:
      'Call ConnexOntario at 1-866-531-2600 or visit connexontario.ca. They match people to current withdrawal management and addiction treatment openings across Ontario.',
  },
  {
    question: 'How do I find mental health or addiction treatment in the United States?',
    answer:
      'Call the SAMHSA National Helpline at 1-800-662-HELP or use the official locator at findtreatment.gov. For local shelters and community services, dial 211 or visit 211.org.',
  },
  {
    question: "Is Liam's Call a crisis line or medical service?",
    answer:
      "No. Liam's Call is a free informational AI chat for caregivers and families. It is not a medical professional, therapist, or emergency service. In a crisis, call or text 9-8-8 (Canada or the U.S.), or call 9-1-1 for emergencies.",
  },
  {
    question: "Do I need an account to use Liam's Call?",
    answer: "No. Liam's Call is free and does not require an account or login.",
  },
];

const ABOUT_FAQS = [
  {
    question: "What is Liam's Call?",
    answer:
      "Liam's Call (liamscall.com) is a free AI web chat for caregivers and families in Canada and the United States facing mental health, addiction, and housing challenges. It is not a click-to-call product, phone receptionist service, or marketing platform.",
  },
  {
    question: "Who is Liam's Call for?",
    answer:
      'Caregivers, family members, and anyone seeking next steps around mental health, addiction, or housing support in Canada and the U.S.',
  },
  {
    question: "Is Liam's Call free?",
    answer: 'Yes. The chat is free to use with no account, waitlist, or co-pay.',
  },
];

function sitemapXmlComment() {
  return [
    '<!--',
    `  ${SITE_IDENTITY.siteName} | ${SITE_IDENTITY.domain}`,
    `  ${SITE_IDENTITY.category} / ${SITE_IDENTITY.subCategory}`,
    '  Machine-readable sitemap for search engines (see robots.txt).',
    '  Human-readable map: https://liamscall.com/sitemap',
    '-->',
  ].join('\n');
}

module.exports = {
  SITE_IDENTITY,
  metaDescription,
  organizationSchema,
  websiteSchema,
  speakableSpec,
  faqPageSchema,
  blogPostingSchema,
  howToSchema,
  RESOURCES_FAQS,
  ABOUT_FAQS,
  sitemapXmlComment,
};
