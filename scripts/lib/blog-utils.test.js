'use strict';

const assert = require('assert');
const { blogShell, jsonForHtmlScript } = require('./blog-utils');

const breakout = '</script><script>alert("jsonld")</script>&\u2028\u2029';

const safeJson = jsonForHtmlScript({ headline: breakout });
assert(!safeJson.includes('</script>'), 'JSON-LD serialization must not contain a raw closing script tag');
assert(!safeJson.includes('<script>'), 'JSON-LD serialization must not contain a raw opening script tag');
assert(safeJson.includes('\\u003c/script\\u003e'), 'closing script delimiter should be unicode escaped');
assert(safeJson.includes('\\u0026'), 'ampersands should be escaped for HTML script safety');
assert(safeJson.includes('\\u2028'), 'line separator should be escaped for script safety');
assert(safeJson.includes('\\u2029'), 'paragraph separator should be escaped for script safety');

const html = blogShell({
  title: 'Test',
  description: 'Test',
  canonical: 'https://liamscall.com/blog/test',
  active: 'blog',
  variant: 'article',
  bodyHtml: '',
  schema: { headline: breakout },
});
const schemaStart = html.indexOf('<script type="application/ld+json">');
assert(schemaStart >= 0, 'expected a JSON-LD script block');
const schemaEnd = html.indexOf('</script>', schemaStart);
assert(schemaEnd > schemaStart, 'expected the JSON-LD script block to close');
const schemaBody = html.slice(schemaStart, schemaEnd);
assert(!schemaBody.includes('</script>'), 'schema body must not contain a raw closing script tag');
assert(!schemaBody.includes('<script>'), 'schema body must not contain injected script tags');

console.log('blog-utils tests passed');
