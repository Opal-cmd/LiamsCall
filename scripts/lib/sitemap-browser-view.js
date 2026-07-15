'use strict';

/**
 * Pretty HTML view for /sitemap.xml in browsers (Chrome no longer runs XSLT).
 * Visual style matches the classic WordPress / Yoast "XML Sitemap" table.
 */

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseUrlEntries(xml) {
  const urls = [];
  const blocks = String(xml || '').match(/<url>([\s\S]*?)<\/url>/g) || [];
  for (const block of blocks) {
    const loc = (block.match(/<loc>([^<]*)<\/loc>/) || [])[1];
    if (!loc) continue;
    const lastmod = (block.match(/<lastmod>([^<]*)<\/lastmod>/) || [])[1] || '';
    const images = (block.match(/<image:image\b/g) || []).length;
    urls.push({ loc, lastmod, images });
  }
  return urls;
}

function formatLastmod(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  // Date-only (YYYY-MM-DD) — show as midnight UTC, matching common sitemap UIs.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return `${v} 00:00 +00:00`;
  // Full ISO — trim to "YYYY-MM-DD HH:MM +00:00" when possible.
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]} +00:00`;
  return v;
}

function buildBrowserHtml(xml) {
  const urls = parseUrlEntries(xml);
  const rows = urls
    .map(
      (u) => `				<tr>
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
		.expl a {
			color: #0f4a3a;
			font-weight: 600;
		}
		.expl a:visited { color: #0f4a3a; }
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
		<p class="expl">
			This XML Sitemap is meant for consumption by search engines.<br>
			You can find more information about XML sitemaps on
			<a href="https://www.sitemaps.org/protocol.html" target="_blank" rel="noopener">sitemaps.org</a>.
		</p>
		<p class="expl">This XML Sitemap contains ${urls.length} URLs.</p>
		<table id="sitemap" cellpadding="3">
			<thead>
				<tr>
					<th width="65%">URL</th>
					<th width="10%">Images</th>
					<th width="25%">Last Modified</th>
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

module.exports = { buildBrowserHtml, parseUrlEntries, formatLastmod };
