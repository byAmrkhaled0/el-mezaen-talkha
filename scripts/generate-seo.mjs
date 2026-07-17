import { readFile, writeFile } from "node:fs/promises";

const siteUrl = (process.env.SITE_URL || "https://muzain.com/مزينمصر/طلخا-6932").replace(/\/$/, "");
const escaped = siteUrl.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const origin = new URL(siteUrl).origin;

await writeFile("public/robots.txt", `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /login/\nSitemap: ${origin}/sitemap.xml\n`, "utf8");
await writeFile("public/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>${escaped}</loc>
    <xhtml:link rel="alternate" hreflang="ar-EG" href="${escaped}?lang=ar"/>
    <xhtml:link rel="alternate" hreflang="en" href="${escaped}?lang=en"/>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url><loc>${origin}/services/</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>${origin}/team/</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
</urlset>
`, "utf8");
const logo = await readFile("public/assets/el-mezaen-mark-v2.png");
const embeddedLogo = logo.toString("base64");
await writeFile("public/assets/icon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="180" fill="#071a2c"/><image href="data:image/png;base64,${embeddedLogo}" x="92" y="92" width="840" height="840" preserveAspectRatio="xMidYMid meet"/></svg>`, "utf8");
console.log(`SEO files generated for ${siteUrl}`);
