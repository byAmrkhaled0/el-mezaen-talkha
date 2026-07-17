import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const required = ["index.html", "admin/index.html", "login/index.html", "services/index.html", "team/index.html", "manifest.webmanifest", "sw.js", "robots.txt", "sitemap.xml", "assets/el-mezaen-logo.jpeg", "assets/icon.svg", "assets/hero-barbershop-cyan.webp"];
for (const file of required) await access(join("dist", file));
await assert.rejects(() => access("dist/server"));

const index = await readFile("dist/index.html", "utf8");
const admin = await readFile("dist/admin/index.html", "utf8");
const login = await readFile("dist/login/index.html", "utf8");
const manifest = JSON.parse(await readFile("dist/manifest.webmanifest", "utf8"));
const robots = await readFile("dist/robots.txt", "utf8");
const sitemap = await readFile("dist/sitemap.xml", "utf8");
const sourceCss = await readFile("src/styles.css", "utf8");
const adminCss = await readFile("src/admin.css", "utf8");
const appSource = await readFile("src/app.js", "utf8");

assert.match(index, /width=device-width/);
assert.match(index, /application\/ld\+json/);
assert.match(index, /rel="canonical"/);
assert.match(index, /property="og:title"/);
assert.doesNotMatch(index, /href="\/login\//, "The public site must not expose an admin dashboard link");
assert.match(admin, /noindex,nofollow/);
assert.match(login, /noindex,nofollow/);
assert.match(robots, /Disallow: \/admin\//);
assert.match(sitemap, /<urlset/);
assert.equal(manifest.display, "standalone");
assert.ok(manifest.icons.some(icon => icon.purpose.includes("maskable")));
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
assert.match(appSource, /branchId:/);
assert.match(appSource, /data-select-branch/);
assert.match(appSource, /data-book-branch/);

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
console.log("Build verification passed: routes, local assets, PWA, SEO, noindex, responsive breakpoints and bundle budgets.");
