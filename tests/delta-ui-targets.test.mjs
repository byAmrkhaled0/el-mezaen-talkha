import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("admin target stays above the workspace chooser and supports all branch scopes", async () => {
  const [html, admin, backend] = await Promise.all([read("admin/index.html"), read("src/admin.js"), read("functions/src/index.js")]);
  const targetAt = html.indexOf('class="mobile-monthly-target"');
  const chooserAt = html.indexOf('class="workspace-hero"');
  assert.ok(targetAt > -1 && targetAt < chooserAt);
  for (const value of ["all", "mashaya", "talkha"]) assert.match(html, new RegExp(`option value="${value}"`));
  assert.match(admin, /stats\.monthlyTargetByBranch/);
  assert.match(backend, /const monthlyTargetByBranch = Object\.fromEntries/);
  assert.match(backend, /Object\.values\(monthlyTargetByBranch\)\.reduce/);
});

test("homepage uses the requested bounded packages, services and reviews", async () => {
  const [app, html] = await Promise.all([read("src/app.js"), read("index.html")]);
  assert.match(app, /package-mashaya-friends-250[\s\S]*package-mashaya-silver-600[\s\S]*package-mashaya-450/);
  assert.match(app, /const visible =[\s\S]*\.slice\(0, 3\)/);
  assert.match(app, /function renderReviews\(\)[\s\S]*\.slice\(0, 3\)/);
  assert.match(html, /href="\/packages\/"[\s\S]*عرض كل الباقات/);
  assert.match(html, /href="\/services\/"[\s\S]*عرض كل الخدمات/);
  assert.match(html, /href="\/reviews\/"[\s\S]*عرض كل التقييمات/);
});

test("back controls remain inside their current product area on direct entry", async () => {
  const [navigation, admin, adminHtml] = await Promise.all([read("src/navigation.js"), read("src/admin.js"), read("admin/index.html")]);
  assert.match(navigation, /previous\.origin === location\.origin/);
  assert.match(navigation, /history\.back\(\)/);
  assert.match(navigation, /dataset\.backFallback/);
  assert.match(adminHtml, /data-admin-back/);
  assert.match(admin, /function goBackInAdmin/);
  assert.match(admin, /showWorkspaceHome\(\{ historyMode: "replace" \}\)/);
});

test("published reviews and notification workers are bounded and deployable", async () => {
  const [backend, api, indexes, messagingWorker, appWorker] = await Promise.all([read("functions/src/index.js"), read("src/admin-api.js"), read("firestore.indexes.json"), read("public/firebase-messaging-sw.js"), read("public/sw.js")]);
  assert.match(backend, /export const getPublishedReviews/);
  assert.match(backend, /limit\(pageSize \+ 1\)/);
  assert.match(backend, /export const unregisterPushToken/);
  assert.match(api, /call\("unregisterPushToken", \{ token \}\)/);
  assert.match(api, /deleteToken\(messaging\)/);
  assert.match(indexes, /"collectionGroup": "reviews"[\s\S]*"fieldPath": "createdAt"/);
  assert.match(messagingWorker, /importScripts\("\/sw\.js"\)/);
  assert.match(appWorker, /const VERSION = "v66"/);
});
