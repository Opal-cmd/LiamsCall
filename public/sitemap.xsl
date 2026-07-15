<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html>
      <head>
        <title>XML Sitemap — Liam's Call</title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
        <meta name="robots" content="noindex,follow"/>
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
            width: 1000px;
            max-width: 100%;
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
        </style>
      </head>
      <body>
        <div id="content">
          <h1>XML Sitemap</h1>
          <p class="expl">
            This XML Sitemap is meant for consumption by search engines.<br/>
            You can find more information about XML sitemaps on
            <a href="https://www.sitemaps.org/protocol.html" target="_blank" rel="noopener">sitemaps.org</a>.
          </p>
          <xsl:if test="count(sitemap:urlset/sitemap:url) &gt; 0">
            <p class="expl">
              This XML Sitemap contains
              <xsl:value-of select="count(sitemap:urlset/sitemap:url)"/>
              URLs.
            </p>
            <table id="sitemap" cellpadding="3">
              <thead>
                <tr>
                  <th width="65%">URL</th>
                  <th width="10%">Images</th>
                  <th width="25%">Last Modified</th>
                </tr>
              </thead>
              <tbody>
                <xsl:for-each select="sitemap:urlset/sitemap:url">
                  <tr>
                    <td>
                      <xsl:variable name="itemURL">
                        <xsl:value-of select="sitemap:loc"/>
                      </xsl:variable>
                      <a href="{$itemURL}">
                        <xsl:value-of select="sitemap:loc"/>
                      </a>
                    </td>
                    <td>
                      <xsl:value-of select="count(image:image)"/>
                    </td>
                    <td>
                      <xsl:value-of select="sitemap:lastmod"/>
                    </td>
                  </tr>
                </xsl:for-each>
              </tbody>
            </table>
          </xsl:if>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
