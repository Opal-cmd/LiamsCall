'use strict';

/**
 * Pretty HTML view for /sitemap.xml in browsers (Chrome no longer runs XSLT).
 * Visual style matches the classic WordPress / Yoast "XML Sitemap" table.
 */

const fs = require('fs');
const path = require('path');

const ROUTE_TO_FILE = {
  '/': 'index.html',
  '/resources': 'resources.html',
  '/about': 'about.html',
  '/sitemap': 'sitemap.html',
  '/privacy': 'privacy.html',
  '/terms': 'terms.html',
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decodeEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(str) {
  return String(str || '').replace(/<[^>]+>/g, '');
}

function extractH1(html) {
  const matches = [...String(html || '').matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi)];
  if (!matches.length) return '';

  // Prefer the main page title over chrome/brand duplicates on the homepage.
  const preferred =
    matches.find((m) => {
      const attrs = m[1] || '';
      return !/\bstyle\s*=/.test(attrs) && !/font-serif-brand/.test(attrs);
    }) || matches[0];

  return decodeEntities(stripTags(preferred[2])).replace(/\s+/g, ' ').trim();
}

function fileForLoc(loc) {
  try {
    const pathname = new URL(loc).pathname.replace(/\/+$/, '') || '/';
    return ROUTE_TO_FILE[pathname] || null;
  } catch {
    return null;
  }
}

function h1ForLoc(loc, publicDir) {
  if (!publicDir) return '';
  const file = fileForLoc(loc);
  if (!file) return '';
  const abs = path.join(publicDir, file);
  try {
    return extractH1(fs.readFileSync(abs, 'utf8'));
  } catch {
    return '';
  }
}

function parseUrlEntries(xml, publicDir) {
  const urls = [];
  const blocks = String(xml || '').match(/<url>([\s\S]*?)<\/url>/g) || [];
  for (const block of blocks) {
    const loc = (block.match(/<loc>([^<]*)<\/loc>/) || [])[1];
    if (!loc) continue;
    const lastmod = (block.match(/<lastmod>([^<]*)<\/lastmod>/) || [])[1] || '';
    const images = (block.match(/<image:image\b/g) || []).length;
    const title =
      ((block.match(/<!--\s*title:\s*([\s\S]*?)\s*-->/i) || [])[1] || '').trim() ||
      h1ForLoc(loc, publicDir);
    urls.push({ loc, lastmod, images, title });
  }
  return urls;
}

function formatLastmod(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v} 00:00 +00:00`;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]} +00:00`;
  return v;
}

function buildBrowserHtml(xml, publicDir) {
  const urls = parseUrlEntries(xml, publicDir);
  const rows = urls
    .map(
      (u) => `				<tr>
					<td>${escapeHtml(u.title || '—')}</td>
					<td class="loc">
						<a href="${escapeHtml(u.loc)}">${escapeHtml(u.loc)}</a>
					</td>
					<td>${u.images}</td>
					<td>${escapeHtml(formatLastmod(u.lastmod))}</td>
				</tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta name="robots" content="noindex,follow">
	<title>XML Sitemap — Liam's Call</title>
	<style type="text/css">
		body {
			font-family: Helvetica, Arial, sans-serif;
			font-size: 13px;
			color: #545353;
			margin: 0;
			padding: 0;
			background: #fff;
		}
		#content {
			margin: 0 auto;
			width: min(1000px, 100%);
			padding: 24px 16px 48px;
			box-sizing: border-box;
		}
		h1 {
			font-size: 24px;
			font-weight: 700;
			color: #333;
			margin: 0 0 8px;
		}
		.expl {
			margin: 18px 3px;
			line-height: 1.45em;
		}
		a {
			color: #1a73e8;
			text-decoration: none;
		}
		a:visited { color: #551a8b; }
		a:hover { text-decoration: underline; }
		table {
			width: 100%;
			border: none;
			border-collapse: collapse;
		}
		#sitemap tr:nth-child(odd) td {
			background-color: #eee !important;
		}
		#sitemap tbody tr:hover td {
			background-color: #ccc !important;
		}
		#sitemap tbody tr:hover td,
		#sitemap tbody tr:hover td a {
			color: #000;
		}
		th {
			text-align: left;
			padding: 8px 30px 8px 3px;
			font-size: 11px;
			font-weight: 700;
			color: #333;
		}
		thead th { border-bottom: 1px solid #000; }
		td {
			font-size: 11px;
			padding: 7px 30px 7px 3px;
			vertical-align: top;
		}
		td.loc { word-break: break-all; }
	</style>
</head>
<body>
	<div id="content">
		<h1>XML Sitemap</h1>
		<p class="expl">This XML Sitemap contains ${urls.length} URLs.</p>
		<table id="sitemap" cellpadding="3">
			<thead>
				<tr>
					<th width="28%">Title</th>
					<th width="42%">URL</th>
					<th width="10%">Images</th>
					<th width="20%">Last Modified</th>
				</tr>
			</thead>
			<tbody>
${rows}
			</tbody>
		</table>
	</div>
</body>
</html>
`;
}

module.exports = {
  buildBrowserHtml,
  parseUrlEntries,
  formatLastmod,
  extractH1,
  h1ForLoc,
};
