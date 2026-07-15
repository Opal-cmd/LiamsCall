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
  fullDescription:
    "Liam's Call is a Canadian mental health technology project focused on caregiver and family wellbeing. We are a small team with a deep personal connection to the challenges of caregiving — many of us have navigated the mental and emotional weight of supporting a loved one through illness, aging, or crisis.\n\n" +
    "Liam's Call (liamscall.com) exists for one reason: to make sure no caregiver or family member facing a mental health, addiction, or housing challenge has to face it alone. We believe that accessible, judgment-free support — available at any hour, without a waitlist or a co-pay — can make a real difference in people's lives.",
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
  ],
};

function metaDescription() {
  // Search snippets prefer ~155–160 chars; keep mission lead without cutting mid-word awkwardly.
  const short = SITE_IDENTITY.shortDescription;
  if (short.length <= 300) return short;
  return `${short.slice(0, 297).replace(/\s+\S*$/, '')}…`;
}

function organizationSchema() {
  return {
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
    disambiguatingDescription: SITE_IDENTITY.fullDescription.split('\n\n')[0],
    areaServed: ['CA', 'US'],
    knowsAbout: SITE_IDENTITY.knowsAbout,
    category: SITE_IDENTITY.category,
    additionalType: [
      'https://schema.org/HealthAndBeautyBusiness',
      'https://schema.org/CivicStructure',
    ],
  };
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

function sitemapXmlComment() {
  return [
    '<!--',
    `  Site Name: ${SITE_IDENTITY.siteName}`,
    `  Domain: ${SITE_IDENTITY.domain}`,
    `  Category: ${SITE_IDENTITY.category}`,
    `  Sub-Category: ${SITE_IDENTITY.subCategory}`,
    `  Short Description: ${SITE_IDENTITY.shortDescription}`,
    '  Extensions: lastmod (W3C datetime), changefreq, priority, xhtml hreflang (en-CA/en/x-default), image.',
    '  Omitted until content exists: video sitemap, Google News sitemap.',
    '  This file is for search-engine crawlers (referenced from /robots.txt).',
    '  It is not linked in the public navigation.',
    '-->',
  ].join('\n');
}

module.exports = {
  SITE_IDENTITY,
  metaDescription,
  organizationSchema,
  websiteSchema,
  sitemapXmlComment,
};
