import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const required = ["hero-bootstrap.js", "hero-mount.js", "initial-locale.js", "about/index.html", "gallery/index.html", "news/index.html", "celebrities/index.html", "index.html", "worker/index.html", "booking/index.html", "admin/index.html", "login/index.html", "account/index.html", "services/index.html", "packages/index.html", "reviews/index.html", "hair-systems/index.html", "results/index.html", "team/index.html", "branches/talkha/index.html", "branches/mashaya/index.html", "manifest.webmanifest", "admin-manifest.webmanifest", "sw.js", "robots.txt", "sitemap.xml", "llms.txt", "favicon.ico", "assets/el-mezaen-logo.jpeg", "assets/el-mezaen-mark-v2.webp", "assets/icon.svg", "assets/icon-192.png", "assets/icon-512.png", "assets/icon-maskable-512.png", "assets/apple-touch-icon.png", "assets/hero-barbershop-cyan.webp"];
for (const file of required) await access(join("dist", file));
await assert.rejects(() => access("dist/server"));

const index = await readFile("dist/index.html", "utf8");
const admin = await readFile("dist/admin/index.html", "utf8");
const login = await readFile("dist/login/index.html", "utf8");
const manifest = JSON.parse(await readFile("dist/manifest.webmanifest", "utf8"));
const adminManifest = JSON.parse(await readFile("dist/admin-manifest.webmanifest", "utf8"));
const robots = await readFile("dist/robots.txt", "utf8");
const sitemap = await readFile("dist/sitemap.xml", "utf8");
const llms = await readFile("dist/llms.txt", "utf8");
const secondaryPages = await Promise.all(["services/index.html", "packages/index.html", "reviews/index.html", "hair-systems/index.html", "team/index.html", "branches/talkha/index.html", "branches/mashaya/index.html"].map(file => readFile(join("dist", file), "utf8")));
const worker = await readFile("dist/sw.js", "utf8");
const firebaseConfig = await readFile("dist/firebase-config.js", "utf8");
const sourceCss = await readFile("src/styles.css", "utf8");
const adminCss = await readFile("src/admin.css", "utf8");
const appSource = await readFile("src/app.js", "utf8");
const functionsSource = await readFile("functions/src/index.js", "utf8");

assert.match(index, /width=device-width/);
for (const script of index.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (!/application\/ld\+json/.test(script[1])) assert.match(script[1], /\bsrc=/, 'Homepage executable scripts must satisfy the published strict CSP');
}
assert.match(index, /application\/ld\+json/);
assert.match(index, /rel="canonical"/);
assert.match(index, /property="og:title"/);
assert.doesNotMatch(index.match(/<nav[^>]*class="nav-links"[\s\S]*?<\/nav>/)?.[0] || "", /href="\/login\//, "Public primary navigation stays customer-first; a subtle staff footer entry is allowed");
assert.match(admin, /noindex,nofollow/);
assert.match(admin, /admin-manifest\.webmanifest/);
assert.match(login, /noindex,nofollow/);
assert.match(robots, /Disallow: \/admin\//);
assert.match(robots, /Disallow: \/account\//);
assert.match(sitemap, /<urlset/);
assert.match(sitemap, /branches\/talkha/);
assert.match(sitemap, /branches\/mashaya/);
assert.match(sitemap, /hair-systems/);
assert.match(llms, /^# .+/);
assert.match(llms, /^> .+/m);
assert.match(llms, /- \[[^\]]+\]\(https:\/\/el-mezaen-talkha\.vercel\.app\/[^)]*\):/);
assert.match(llms, /- \[Facebook الرسمي\]\(https:\/\//);
assert.match(index, /google-site-verification/);
assert.match(index, /el-mezaen-talkha\.vercel\.app/);
for (const page of secondaryPages) {
  assert.match(page, /rel="canonical"/);
  assert.match(page, /el-mezaen-talkha\.vercel\.app/);
  assert.match(page, /application\/ld\+json/);
}
assert.equal(manifest.display, "standalone");
assert.equal(adminManifest.display, "standalone");
assert.equal(adminManifest.start_url, "/admin/?source=pwa");
assert.ok(manifest.icons.some(icon => icon.purpose.includes("maskable")));
assert.ok(manifest.icons.some(icon => icon.sizes === "192x192" && icon.type === "image/png"));
assert.ok(manifest.icons.some(icon => icon.sizes === "512x512" && icon.type === "image/png"));
assert.match(index, /apple-touch-icon\.png/);
assert.match(sourceCss, /@media \(max-width: 560px\)/);
assert.match(sourceCss, /@media \(max-width: 430px\)/);
assert.match(sourceCss, /@media \(max-width: 390px\)/);
assert.match(sourceCss, /@media \(max-width: 360px\)/);
assert.match(sourceCss, /@media \(max-width: 320px\)/);
assert.match(adminCss, /@media\(max-width:430px\)/);
assert.match(index, /id="branchDialog"/);
assert.match(index, /id="branchPicker"/);
assert.match(index, /id="branchFooterGrid"/);
assert.match(index, /id="summaryBranch"/);
assert.match(index, /id="drinkUpsell"/);
assert.match(admin, /id="posSectionFilter"/);
assert.match(admin, /id="posCategoryFilter"/);
assert.match(admin, /id="serviceCategoryFilter"/);
assert.match(admin, /id="drinks"/);
assert.match(admin, /data-collection="drinks"/);
assert.match(admin, /id="expenseSubmit"[^>]*type="submit"/);
assert.match(admin, /id="expenseCategoryFilter"/);
assert.match(appSource, /data-drink-option/);
assert.match(functionsSource, /calculateRevenueBreakdown/);
assert.match(functionsSource, /DRINK_OPTION/);
assert.match(functionsSource, /db\.collection\("drinks"\)/);
assert.match(functionsSource, /export const createAdminUser/);
assert.match(functionsSource, /concurrency:\s*80/);
assert.match(functionsSource, /review_v2/);
assert.match(worker, /addEventListener\("push"/);
assert.match(worker, /const VERSION = "offline-[a-f0-9]{16}"/);
const offlineCore=JSON.parse(worker.match(/const OFFLINE_CORE = (\[[^;]+\]);/)[1]);
assert.ok(offlineCore.includes('/admin/')&&offlineCore.includes('/firebase-config.js'));
for(const file of offlineCore)await access(join('dist',file==='/admin/'?'admin/index.html':file.slice(1)));
assert.ok([...admin.matchAll(/(?:src|href)="(\/assets\/[^"#]+\.(?:js|css))"/g)].every(match=>offlineCore.includes(match[1])),'Admin entry assets must be precached before offline sales are enabled');
const messagingWorker = await readFile(join("dist", "firebase-messaging-sw.js"), "utf8");
assert.match(messagingWorker, /importScripts\("\/sw\.js"\)/, "Firebase Messaging worker must reuse the app service worker");
assert.match(worker, /sensitiveNavigation/);
assert.match(index, /id="networkStatus"/);
assert.match(admin, /id="userAccountForm"/);
assert.match(admin, /id="accessDialog"/);
assert.match(admin, /id="sidebarCollapse"/);
assert.match(firebaseConfig, /window\.__VAPID_KEY__\s*=\s*"[A-Za-z0-9_-]{80,}"/);
assert.match(firebaseConfig, /window\.__APP_CHECK_SITE_KEY__\s*=\s*"[A-Za-z0-9_-]{20,}"/);
assert.match(appSource, /branchId:/);
assert.match(appSource, /data-select-branch/);
assert.match(appSource, /data-book-branch/);
assert.match(appSource, /data-video-src/);
assert.match(appSource, /getCustomerBooking/);
assert.match(appSource, /import\("\.\/firebase-client\.js"\)/);
assert.match(appSource, /requestIdleCallback/);
assert.match(appSource, /import\("jsbarcode"\)/);
assert.doesNotMatch(appSource, /import JsBarcode from "jsbarcode"/);

for (const html of [index, admin, login]) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "Duplicate element IDs found");
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>/g)) {
    const href = match[1];
    assert.ok(href && !href.startsWith("javascript:"), `Invalid link: ${href}`);
  }
  for (const match of html.matchAll(/<(?:input|select|textarea)\b([^>]*)>/g)) {
    assert.match(match[1], /\b(?:id|name)="[^"]+"/, `Form field has no id or name: ${match[0]}`);
  }
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) await access(join("dist", match[1]));
}

const mainScripts = [...index.matchAll(/src="(\/assets\/[^"?]+\.js)"/g)].map(match => match[1]);
for (const file of mainScripts) {
  const size = (await stat(join("dist", file))).size;
  assert.ok(size < 180 * 1024, `${file} is unexpectedly large: ${size}`);
}
assert.ok((await stat("dist/assets/el-mezaen-mark-v2.webp")).size < 40 * 1024, "Optimized logo is unexpectedly large");
console.log("Build verification passed: routes, local assets, PWA, SEO, noindex, responsive breakpoints and bundle budgets.");

// Every HTML entry must contain a real stylesheet, including about and auth pages.
for (const page of required.filter(file => file.endsWith('.html'))) {
  const html = await readFile(join('dist', page), 'utf8');
  if (page === '404.html') continue;
  const styles = [...html.matchAll(/<link\b[^>]*>/g)].filter(match => /rel="stylesheet"/.test(match[0])).map(match => match[0].match(/href="([^"?#]+)"/)?.[1]);
  assert.ok(styles.length, `${page} has no render-blocking stylesheet`);
  for (const file of styles) {
    assert.ok(file?.startsWith('/assets/') && file.endsWith('.css'), `${page} has an invalid stylesheet ${file}`);
    const css = await readFile(join('dist',file), 'utf8');
    assert.ok(css.length > 500 && !/^\s*<!doctype html/i.test(css), `${page} stylesheet is empty or HTML`);
    for (const url of css.matchAll(/url\((?:["'])?(\/assets\/[^)"']+)(?:["'])?\)/g)) await access(join('dist', url[1]));
  }
}
console.log('Stylesheet gate passed for every built HTML entry and its local CSS assets.');
