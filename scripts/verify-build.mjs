import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const required = ["index.html", "admin/index.html", "login/index.html", "services/index.html", "team/index.html", "branches/talkha/index.html", "branches/mashaya/index.html", "manifest.webmanifest", "admin-manifest.webmanifest", "sw.js", "robots.txt", "sitemap.xml", "assets/el-mezaen-logo.jpeg", "assets/el-mezaen-mark-v2.webp", "assets/icon.svg", "assets/icon-192.png", "assets/icon-512.png", "assets/icon-maskable-512.png", "assets/apple-touch-icon.png", "assets/hero-barbershop-cyan.webp"];
for (const file of required) await access(join("dist", file));
await assert.rejects(() => access("dist/server"));

const index = await readFile("dist/index.html", "utf8");
const admin = await readFile("dist/admin/index.html", "utf8");
const login = await readFile("dist/login/index.html", "utf8");
const manifest = JSON.parse(await readFile("dist/manifest.webmanifest", "utf8"));
const adminManifest = JSON.parse(await readFile("dist/admin-manifest.webmanifest", "utf8"));
const robots = await readFile("dist/robots.txt", "utf8");
const sitemap = await readFile("dist/sitemap.xml", "utf8");
const secondaryPages = await Promise.all(["services/index.html", "team/index.html", "branches/talkha/index.html", "branches/mashaya/index.html"].map(file => readFile(join("dist", file), "utf8")));
const worker = await readFile("dist/sw.js", "utf8");
const firebaseConfig = await readFile("dist/firebase-config.js", "utf8");
const sourceCss = await readFile("src/styles.css", "utf8");
const adminCss = await readFile("src/admin.css", "utf8");
const appSource = await readFile("src/app.js", "utf8");
const functionsSource = await readFile("functions/src/index.js", "utf8");

assert.match(index, /width=device-width/);
assert.match(index, /application\/ld\+json/);
assert.match(index, /rel="canonical"/);
assert.match(index, /property="og:title"/);
assert.doesNotMatch(index, /href="\/login\//, "The public site must not expose an admin dashboard link");
assert.match(admin, /noindex,nofollow/);
assert.match(admin, /admin-manifest\.webmanifest/);
assert.match(login, /noindex,nofollow/);
assert.match(robots, /Disallow: \/admin\//);
assert.match(sitemap, /<urlset/);
assert.match(sitemap, /branches\/talkha/);
assert.match(sitemap, /branches\/mashaya/);
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
assert.match(worker, /const VERSION = "v56"/);
assert.match(worker, /sensitiveNavigation/);
assert.match(index, /id="networkStatus"/);
assert.match(admin, /id="userAccountForm"/);
assert.match(firebaseConfig, /window\.__VAPID_KEY__\s*=\s*"[A-Za-z0-9_-]{80,}"/);
assert.match(firebaseConfig, /window\.__APP_CHECK_SITE_KEY__\s*=\s*"[A-Za-z0-9_-]{20,}"/);
assert.match(appSource, /branchId:/);
assert.match(appSource, /data-select-branch/);
assert.match(appSource, /data-book-branch/);
assert.match(appSource, /data-video-src/);
assert.match(appSource, /getCustomerBooking/);

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
