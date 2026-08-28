import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("expense form has a real guarded submit path", async () => {
  const [html, admin] = await Promise.all([read("admin/index.html"), read("src/admin.js")]);

  assert.match(html, /id="expenseSubmit"[^>]*type="submit"/);
  assert.match(admin, /querySelector\('button\[type="submit"\], button:not\(\[type\]\)'\)/);
  assert.match(admin, /button\.disabled = true/);
  assert.match(admin, /idempotencyKey/);
  assert.match(admin, /await recordExpense/);
  assert.match(admin, /await updateExpense/);
});

test("drinks are branch-scoped server data and POS writes are idempotent", async () => {
  const functionsSource = await read("functions/src/index.js");

  assert.match(functionsSource, /collection\("drinks"\)/);
  assert.match(functionsSource, /isDrinkAvailableAtBranch\(source, branchId\)/);
  assert.match(functionsSource, /posOrderGuards/);
  assert.match(functionsSource, /idempotencyKey/);
  assert.match(functionsSource, /revenueBreakdown/);
});

test("sensitive pages are network-only and never cached by the service worker", async () => {
  const serviceWorker = await read("public/sw.js");

  assert.match(serviceWorker, /const sensitiveNavigation\s*=/);
  assert.match(serviceWorker, /cache:\s*"no-store"/);
  const core = serviceWorker.match(/const CORE\s*=\s*\[([\s\S]*?)\];/)?.[1] || "";
  assert.doesNotMatch(core, /\/admin\//);
  assert.doesNotMatch(core, /\/login/);
  assert.match(serviceWorker, /status:\s*503/);
  assert.match(serviceWorker, /statusText:\s*"Offline"/);
});

test("worker accounts have admin-only secure deletion", async () => {
  const [admin, functionsSource] = await Promise.all([read("src/admin.js"), read("functions/src/index.js")]);

  assert.match(admin, /data-secure-delete-user/);
  assert.match(admin, /openSecureDelete\("user"/);
  assert.match(functionsSource, /deleteUserAccountPermanently/);
  assert.match(functionsSource, /getAuth\(\)\.deleteUser\(uid\)/);
  assert.match(functionsSource, /secure-delete-user/);
  assert.match(functionsSource, /لا يمكنك حذف حساب الأدمن المستخدم حاليًا/);
});

test("CSP allows Firebase Authentication helper script and iframe", async () => {
  const [vercel, firebase] = await Promise.all([read("vercel.json"), read("firebase.json")]);

  for (const config of [vercel, firebase]) {
    assert.match(config, /script-src[^;]*https:\/\/apis\.google\.com/);
    assert.match(config, /frame-src[^;]*https:\/\/el-mezaen-talkha\.firebaseapp\.com/);
  }
});

test("public content rejects unsafe link protocols", async () => {
  const app = await read("src/app.js");
  assert.match(app, /const safeWebUrl/);
  assert.match(app, /\["http:", "https:"\]\.includes\(url\.protocol\)/);
  assert.match(app, /const link = safeWebUrl\(item\.linkUrl\)/);
});

test("package cards open complete details and add to cart before booking", async () => {
  const [app, html, css] = await Promise.all([read("src/app.js"), read("index.html"), read("src/styles.css")]);
  assert.match(html, /id="packageDetailsDialog"/);
  assert.match(app, /data-package-details/);
  assert.match(app, /data-add-id=.*data-kind="package"/);
  assert.match(app, /function openPackageDetails/);
  assert.match(app, /class="package-phone"/);
  assert.match(app, /متابعة الحجز/);
  assert.doesNotMatch(app, /احجز الباقة/);
  assert.match(html, /class="package-grid" id="packageGrid"/);
  assert.doesNotMatch(html, /class="package-grid horizontal-cards"/);
  assert.match(css, /\.package-card\{height:auto;align-self:start\}/);
});

test("role portals, worker attendance and worker commands are server-authorized", async () => {
  const [admin, html, api, backend, core] = await Promise.all([read("src/admin.js"), read("admin/index.html"), read("src/admin-api.js"), read("functions/src/index.js"), read("functions/src/core.js")]);
  assert.match(html, /id="workspaceHome"/);
  assert.match(html, /data-open-hub="management"/);
  assert.match(html, /data-open-hub="social"/);
  assert.match(html, /data-section="attendance"/);
  assert.match(html, /data-section="worker"/);
  for (const name of ["getAttendanceDashboard", "recordWorkerAttendance", "getWorkerWorkspace", "createWorkerTask", "updateWorkerTask", "notifyWorker", "updateWorkerProfilePhoto"]) {
    assert.match(api, new RegExp(`export const ${name}\\b`));
    assert.match(backend, new RegExp(`export const ${name}\\b`));
  }
  assert.match(core, /validateAttendanceLocation/);
  assert.match(backend, /requireRole\(request, \["worker"\]\)/);
  assert.match(backend, /role === "worker" \? \["attendance", "tasks"\] : ALL_PERMISSIONS/);
  assert.match(backend, /getAttendanceDashboard[\s\S]*?requireRole\(request, \["admin", "manager", "cashier"\]\)/);
  assert.match(admin, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(admin, /rescheduleBooking\(\{ id: item\.id, date: item\.bookingDate, time: item\.bookingTime, staffId/);
});

test("worker activation is linked to an existing staff record and account deletion unlinks it", async () => {
  const backend = await read("functions/src/index.js");
  assert.match(backend, /role === "worker"/);
  assert.match(backend, /activationLink/);
  assert.match(backend, /staffId/);
  assert.match(backend, /userUid: FieldValue\.delete\(\)/);
});

test("assigning a booking to a worker revalidates services, shifts and breaks server-side", async () => {
  const backend = await read("functions/src/index.js");
  assert.match(backend, /export const rescheduleBooking/);
  assert.match(backend, /item\.kind === "service" \? \[item\.id\] : \[\]/);
  assert.match(backend, /staff\.serviceIds\.includes\(serviceId\)/);
  assert.match(backend, /الموعد خارج شيفت العامل/);
  assert.match(backend, /الموعد يتعارض مع راحة العامل/);
  assert.match(backend, /bookingGuards/);
  assert.match(backend, /rescheduleGuards/);
});

test("dashboard keeps only the compact operational metrics and exposes accessible mobile actions", async () => {
  const [html, admin, css] = await Promise.all([read("admin/index.html"), read("src/admin.js"), read("src/admin.css")]);
  const summary = html.match(/class="metric-grid cashier-metrics dashboard-summary-metrics">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.equal((summary.match(/class="metric-card/g) || []).length, 7);
  for (const id of ["statTodayRevenue", "statTodayReceipts", "statTodayCash", "statUnpaid", "statAverageTicket", "statTodayExpenses", "statTodayNet"]) assert.match(summary, new RegExp(`id="${id}"`));
  assert.match(html, /id="dashboardMonthTargetProgress"/);
  assert.match(html, /class="mobile-admin-menu"/);
  assert.match(html, /data-open-receipts/);
  assert.match(html, /<svg viewBox="0 0 24 24"/);
  assert.match(admin, /dashboardOperationSearch/);
  assert.match(admin, /monthlyRevenueTarget/);
  assert.match(css, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css, /min-height:44px/);
});

test("mobile admin widgets stay mobile-only and use outlined SVG icons", async () => {
  const [html, admin, css] = await Promise.all([read("admin/index.html"), read("src/admin.js"), read("src/admin.css")]);
  assert.match(html, /workspace-gate-icon[\s\S]*?<svg viewBox="0 0 24 24"/);
  assert.match(html, /id="pushButton"[\s\S]*?<svg viewBox="0 0 24 24"/);
  assert.match(admin, /\$\("#adminTheme"\)\.innerHTML/);
  assert.match(admin, /matchMedia\("\(max-width: 720px\)"\)/);
  assert.match(admin, /function syncAdminMobileVisibility/);
  assert.match(admin, /function initializeLineIcons/);
  assert.match(admin, /svg\.setAttribute\("fill", "none"\)/);
  assert.match(css, /\[data-admin-mobile-only\],\.workspace-mobile-admin-links,\.mobile-admin-menu,\.mobile-quick-actions\{display:none!important\}/);
  assert.match(css, /fill:none!important;stroke:currentColor!important/);
});

test("admin can safely install only missing fixed-id packages and inspect full details", async () => {
  const [admin, css] = await Promise.all([read("src/admin.js"), read("src/admin.css")]);
  assert.match(admin, /import \{ newMashayaPackages \}/);
  assert.match(admin, /data-install-required-packages/);
  assert.match(admin, /const missing = newMashayaPackages\.filter\(item => !existingIds\.has\(item\.id\)\)/);
  assert.match(admin, /إجمالي الباقات:/);
  assert.match(admin, /موجودة.*ناقصة/);
  assert.match(admin, /Promise\.all\(missing\.map\(item => saveEntity\("packages", item\.id, item\)\)\)/);
  assert.match(admin, /includedItemsAr\.map/);
  assert.match(admin, /item\.choiceGroups/);
  assert.match(css, /\.required-packages-status/);
  assert.match(css, /\.admin-package-details/);
});

test("public service cards use real SVG icons and daylight-specific surfaces", async () => {
  const [app, catalog, css, accountCss, loginCss, themeInit] = await Promise.all([read("src/app.js"), read("src/catalog-page.js"), read("src/styles.css"), read("src/account.css"), read("src/login.css"), read("public/theme-init.js")]);
  assert.match(app, /function serviceIconSvg/);
  assert.match(app, /data-service-icon=/);
  assert.match(catalog, /const serviceIconSvg/);
  assert.doesNotMatch(catalog, /class="service-icon">✂/);
  assert.match(css, /html\[data-theme="light"\] body\{background:/);
  assert.match(css, /html\[data-theme="light"\] \.site-header/);
  assert.match(css, /\.service-icon svg\{display:block/);
  assert.match(accountCss, /html\[data-theme="light"\] \.account-card/);
  assert.match(loginCss, /html\[data-theme="light"\] \.login-card/);
  assert.match(themeInit, /const fallback = admin \? "light" : "dark"/);
});
