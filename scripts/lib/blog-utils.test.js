'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assertPostGuards,
  resolveSourceForTopic,
  sanitizeSourceUrl,
} = require('./blog-utils');

test('source URL exemptions are limited to verified hosts', () => {
  assert.equal(sanitizeSourceUrl('https://www.samhsa.gov/find-help'), 'https://www.samhsa.gov/find-help');
  assert.equal(sanitizeSourceUrl('https://example.com/phishing'), '');

  assert.throws(
    () =>
      assertPostGuards(
        {
          slug: 'unsafe-source',
          title: 'Unsafe source',
          body: 'Further reading: https://example.com/phishing',
          risk: 'safe',
        },
        { allowUrls: ['https://example.com/phishing'] },
      ),
    /Disallowed URL\(s\)/,
  );
});

test('topic source resolution rejects unverified source hosts', () => {
  assert.deepEqual(resolveSourceForTopic({ source_url: 'https://www.samhsa.gov/find-help' }), {
    source_url: 'https://www.samhsa.gov/find-help',
    source_name: '',
  });

  assert.throws(
    () => resolveSourceForTopic({ source_url: 'https://example.com/phishing' }),
    /Disallowed source_url host/,
  );
});
