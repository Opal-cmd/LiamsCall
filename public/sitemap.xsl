<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet
  version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  exclude-result-prefixes="sitemap image">

  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>

  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <meta name="robots" content="noindex,follow"/>
        <title>XML Sitemap</title>
        <link rel="stylesheet" href="/assets/site.css"/>
        <style type="text/css">
          * { box-sizing: border-box; }
          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #545353;
            font-family: var(--font-sans);
            font-size: 13px;
            line-height: 1.45;
          }
          #content {
            width: 100%;
            max-width: 1000px;
            margin: 0 auto;
            padding: 24px 16px 48px;
          }
          h1 {
            margin: 0 0 8px;
            color: #333333;
            font-size: 24px;
            font-weight: 700;
          }
          .expl {
            margin: 18px 3px;
            line-height: 1.45em;
          }
          .table-wrap {
            width: 100%;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }
          table#sitemap {
            width: 100%;
            min-width: 520px;
            border: none;
            border-collapse: collapse;
          }
          #sitemap thead th {
            text-align: left;
            color: #333333;
            font-size: 11px;
            font-weight: 700;
            padding: 8px 30px 8px 3px;
            border-bottom: 1px solid #000000;
            white-space: nowrap;
          }
          #sitemap tbody td {
            font-size: 11px;
            padding: 7px 30px 7px 3px;
            vertical-align: top;
          }
          #sitemap tr:nth-child(odd) td {
            background-color: #eeeeee;
          }
          #sitemap tbody tr:hover td {
            background-color: #cccccc;
            color: #000000;
          }
          #sitemap tbody tr:hover td a {
            color: #000000;
          }
          #sitemap a {
            color: #1a73e8;
            text-decoration: none;
            word-break: break-all;
          }
          #sitemap a:visited { color: #551a8b; }
          #sitemap a:hover { text-decoration: underline; }
          #sitemap td.images,
          #sitemap td.lastmod {
            white-space: nowrap;
          }
          @media (max-width: 640px) {
            #content { padding: 16px 12px 32px; }
            h1 { font-size: 20px; }
            #sitemap thead th,
            #sitemap tbody td {
              padding-right: 16px;
            }
          }
        </style>
      </head>
      <body>
        <div id="content">
          <h1>XML Sitemap</h1>
          <p class="expl">
            This XML Sitemap contains
            <xsl:value-of select="count(sitemap:urlset/sitemap:url)"/>
            URLs.
          </p>
          <div class="table-wrap">
            <table id="sitemap" cellpadding="3">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>URL</th>
                  <th>Images</th>
                  <th>Last Modified</th>
                </tr>
              </thead>
              <tbody>
                <xsl:for-each select="sitemap:urlset/sitemap:url">
                  <tr>
                    <td>
                      <xsl:variable name="c" select="comment()[1]"/>
                      <xsl:choose>
                        <xsl:when test="contains($c, 'title:')">
                          <xsl:value-of select="normalize-space(substring-after($c, 'title:'))"/>
                        </xsl:when>
                        <xsl:otherwise>—</xsl:otherwise>
                      </xsl:choose>
                    </td>
                    <td>
                      <a href="{sitemap:loc}">
                        <xsl:value-of select="sitemap:loc"/>
                      </a>
                    </td>
                    <td class="images">
                      <xsl:value-of select="count(image:image)"/>
                    </td>
                    <td class="lastmod">
                      <xsl:value-of select="sitemap:lastmod"/>
                    </td>
                  </tr>
                </xsl:for-each>
              </tbody>
            </table>
          </div>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
