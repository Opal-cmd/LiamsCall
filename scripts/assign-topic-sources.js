#!/usr/bin/env node
'use strict';

/**
 * Assign a distinct curated source_url to every topic.
 *   node scripts/assign-topic-sources.js
 */

const { loadTopics, saveTopics, loadSources } = require('./lib/blog-utils');

/** One distinct allowlisted URL per topic id. */
const TOPIC_SOURCES = {
  'saying-no-without-exploding': {
    url: 'https://ontariocaregiver.ca/get-support/',
    name: 'Ontario Caregiver Organization - get support',
  },
  'sleep-when-nights-are-broken': {
    url: 'https://ontariocaregiver.ca',
    name: 'Ontario Caregiver Organization - home',
  },
  'friends-who-dont-get-it': {
    url: 'https://www.nami.org/Your-Journey/Family-Members-and-Caregivers',
    name: 'NAMI family caregivers',
  },
  'caregiver-identity-loss': {
    url: 'https://www.nami.org/support-education/',
    name: 'NAMI find support',
  },
  'hard-conversations-with-siblings': {
    url: 'https://mentalhealthcommission.ca',
    name: 'Mental Health Commission of Canada',
  },
  'navigating-988-first-call': {
    url: 'https://988.ca',
    name: 'Canada 9-8-8',
  },
  'finding-shelters-without-guessing': {
    url: 'https://211.ca',
    name: '211 Canada',
  },
  'ontario-detox-near-me': {
    url: 'https://connexontario.ca',
    name: 'ConnexOntario',
  },
  'supporting-someone-refusing-treatment': {
    url: 'https://www.camh.ca/en/health-info',
    name: 'CAMH health info',
  },
  'guilt-after-getting-angry': {
    url: 'https://www.nami.org',
    name: 'NAMI home',
  },
  'packing-a-hospital-bag-for-them': {
    url: 'https://www.camh.ca',
    name: 'CAMH home',
  },
  'talking-to-kids-about-a-parents-illness': {
    url: 'https://kidshelpphone.ca',
    name: 'Kids Help Phone',
  },
  'when-caregiving-hurts-your-job': {
    url: 'https://www.canada.ca/en/public-health/services/mental-health-services.html',
    name: 'Canada.ca mental health',
  },
  'lonely-evenings-after-care-tasks': {
    url: 'https://www.wellnesstogether.ca',
    name: 'Wellness Together Canada',
  },
  'tracking-symptoms-without-obsessing': {
    url: 'https://www.camh.ca/en/camh-news-and-stories',
    name: 'CAMH getting help',
  },
  'caring-from-another-city': {
    url: 'https://www.211.org',
    name: '211 United States',
  },
  'when-they-minimize-the-problem': {
    url: 'https://www.samhsa.gov/find-help',
    name: 'SAMHSA behavioral health treatment services',
  },
  'caregiver-body-aches': {
    url: 'https://ontariocaregiver.ca/about/',
    name: 'Ontario Caregiver Organization - about',
  },
  'holidays-while-caregiving': {
    url: 'https://988lifeline.org',
    name: '988 Lifeline - home',
  },
  'money-stress-and-care': {
    url: 'https://211ontario.ca',
    name: '211 Ontario',
  },
  'supporting-a-partner-in-recovery': {
    url: 'https://www.samhsa.gov/find-help/national-helpline',
    name: 'SAMHSA National Helpline',
  },
  'after-a-psych-er-visit': {
    url: 'https://988lifeline.org/help-someone-else/',
    name: '988 Lifeline - help someone else',
  },
  'housing-first-in-plain-words': {
    url: 'https://www.samhsa.gov/homelessness-programs-resources',
    name: 'SAMHSA homelessness resources',
  },
  'respite-without-apology': {
    url: 'https://www.hopeforwellness.ca',
    name: 'Hope for Wellness (Indigenous)',
  },
  'when-friends-offer-vague-help': {
    url: 'https://988lifeline.org/talk-to-someone-now/',
    name: '988 Lifeline - talk to someone',
  },
  'documenting-for-appointments': {
    url: 'https://www.samhsa.gov/find-help/helplines',
    name: 'SAMHSA helplines',
  },
  'compassion-fatigue-vs-burnout': {
    url: 'https://www.samhsa.gov/find-help/find-treatment',
    name: 'SAMHSA find treatment',
  },
  'when-youre-both-unwell': {
    url: 'https://www.toronto.ca/community-people/housing-shelter/',
    name: 'Toronto community and housing supports',
  },
  'ending-a-care-day-ritual': {
    url: 'https://www.toronto.ca',
    name: 'City of Toronto',
  },
};


function main() {
  const seeds = loadSources().seeds || [];
  const seedUrls = new Set(seeds.map((s) => String(s.url || '').trim()));
  const topics = loadTopics();
  const used = new Set();

  const next = topics.map((t) => {
    const mapped = TOPIC_SOURCES[t.id];
    if (!mapped) {
      throw new Error(`No curated source mapping for topic: ${t.id}`);
    }
    if (used.has(mapped.url)) {
      throw new Error(`Duplicate source URL for ${t.id}: ${mapped.url}`);
    }
    used.add(mapped.url);
    if (!seedUrls.has(mapped.url)) {
      console.warn(`Warning: ${t.id} URL missing from seeds.yaml: ${mapped.url}`);
    }
    return {
      ...t,
      source_url: mapped.url,
      source_name: mapped.name,
    };
  });

  saveTopics(next);
  console.log(`Assigned ${next.length} distinct source URLs.`);
  next.forEach((t) => console.log(`  ${t.id} -> ${t.source_url}`));
}

main();
