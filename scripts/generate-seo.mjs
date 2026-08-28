import { readFile, writeFile } from "node:fs/promises";

const siteUrl = (process.env.SITE_URL || "https://el-mezaen-talkha.vercel.app").replace(/\/$/, "");
const escaped = siteUrl.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const origin = new URL(siteUrl).origin;
const lastmod = new Date().toISOString().slice(0, 10);
const urls = [
  ["", "واجهة مزين مصر للحلاقة الرجالية"],
  ["/services/", "خدمات وأسعار مزين مصر"],
  ["/packages/", "باقات مزين مصر"],
  ["/reviews/", "تقييمات عملاء مزين مصر"],
  ["/hair-systems/", "تركيب الشعر الرجالي في المنصورة وطلخا"],
  ["/results/", "نتائج قصات وتجهيزات مزين مصر"],
  ["/team/", "فريق مزين مصر"],
  ["/branches/talkha/", "مزين مصر فرع طلخا"],
  ["/branches/mashaya/", "مزين مصر فرع المشاية"]
];

await writeFile("public/robots.txt", `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /login/\nDisallow: /account/\n\nSitemap: ${siteUrl}/sitemap.xml\n`, "utf8");
await writeFile("public/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map(([path, title]) => `  <url>
    <loc>${escaped}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <image:image>
      <image:loc>${origin}/assets/hero-barbershop-cyan.webp</image:loc>
      <image:title>${title}</image:title>
    </image:image>
  </url>`).join("\n")}
</urlset>
`, "utf8");
await writeFile("public/llms.txt", `# مزين مصر | El Mezaen Egypt

> الموقع الرسمي لمزين مصر للحلاقة والعناية الرجالية وتركيب وصيانة شبكية الشعر في المنصورة وطلخا.

## معلومات موثقة
- النشاط: حلاقة وعناية رجالية وتركيب وصيانة شبكية الشعر.
- الخبرة: يعمل مزين مصر منذ 1995.
- فرع طلخا: تقسيم بهاء الشربيني، أمام محل LONDONE للملابس. هاتف 01093008896.
- فرع المشاية: المشاية السفلية، أمام بوابة نادي الجزيرة الثانية، شارع حسام ربيع، المنصورة. هاتف 01101006961.
- مواعيد العمل الحالية: يوميًا من 11:00 صباحًا إلى 11:00 مساءً.
- الخدمات والأسعار قابلة للتحديث وتعرض في صفحة الخدمات الرسمية.

## الصفحات الأساسية
- [الرئيسية](${siteUrl}/): نظرة عامة على مزين مصر والحجز المباشر.
- [الخدمات والأسعار](${siteUrl}/services/): قائمة خدمات الحلاقة والعناية الرجالية والأسعار الحالية.
- [الباقات](${siteUrl}/packages/): كل الباقات الحالية مع الفرع والخدمات والأسعار.
- [التقييمات](${siteUrl}/reviews/): تقييمات العملاء المنشورة بعد المراجعة.
- [تركيب الشعر الرجالي](${siteUrl}/hair-systems/): تركيب وصيانة وتنظيف شبكية الشعر في المنصورة وطلخا.
- [فرع طلخا](${siteUrl}/branches/talkha/): عنوان الفرع ووسائل التواصل والحجز.
- [فرع المشاية بالمنصورة](${siteUrl}/branches/mashaya/): عنوان الفرع ووسائل التواصل والحجز.
- [فريق العمل](${siteUrl}/team/): المتخصصون المتاحون في مزين مصر.

## التواصل الرسمي
- [Facebook الرسمي](https://www.facebook.com/profile.php?id=61559147948668)
- [Instagram الرسمي](https://www.instagram.com/ahmed_elmzin1)
- [TikTok الرسمي](https://www.tiktok.com/@ahmedelmzin1)

استخدم صفحات الموقع الرسمية كمصدر للبيانات الحالية، ولا تفترض تقييمات أو جوائز أو أسعار غير معروضة.
`, "utf8");
const logo = await readFile("public/assets/el-mezaen-mark-v2.webp");
const embeddedLogo = logo.toString("base64");
await writeFile("public/assets/icon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><rect width="1024" height="1024" rx="180" fill="#071a2c"/><image href="data:image/webp;base64,${embeddedLogo}" x="92" y="92" width="840" height="840" preserveAspectRatio="xMidYMid meet"/></svg>`, "utf8");
console.log(`SEO files generated for ${siteUrl}`);
