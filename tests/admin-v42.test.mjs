import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { branchMonthlyTargetSummary, sumBranchMonthlyTargets } from "../functions/src/core.js";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("monthly targets are independent by branch and all branches sum those targets", () => {
  const talkha = branchMonthlyTargetSummary({ monthlyRevenueTarget: 100, monthlyRevenueTargets: { "2026-09": { targetAmount: 250000 } } }, "2026-09", 175000);
  const mashaya = branchMonthlyTargetSummary({ monthlyRevenueTarget: 100, monthlyRevenueTargets: { "2026-09": { targetAmount: 400000 } } }, "2026-09", 300000);
  assert.deepEqual(talkha, { target: 250000, achieved: 175000, remaining: 75000, progressPercent: 70 });
  assert.equal(mashaya.target, 400000);
  assert.equal(sumBranchMonthlyTargets({ talkha, mashaya }, ["talkha", "mashaya"]), 650000);
  assert.equal(sumBranchMonthlyTargets({ talkha, mashaya }, ["talkha"]), 250000);
  assert.equal(branchMonthlyTargetSummary({ monthlyRevenueTarget: 100 }, "2026-08", 25).target, 100);
});

test("admin dashboard uses selected branch ID and discards stale responses", async () => {
  const [admin, backend] = await Promise.all([read("src/admin.js"), read("functions/src/index.js")]);
  assert.match(admin, /const branchId = \$\("#dashboardBranchFilter"\)\?\.value \|\| "all";[\s\S]*?getDashboard\(branchId\)/);
  assert.match(admin, /requestVersion !== dashboardRequestVersion \|\| branchId !== \$\("#dashboardBranchFilter"\)\?\.value/);
  assert.match(backend, /requestedBranch === "all" \? claimedBranches : \[requestedBranch\]/);
  assert.match(backend, /aggregateScoped\("revenueLedger", allowedBranches/);
  assert.match(backend, /monthlyTargetByBranch[\s\S]*?sumBranchMonthlyTargets/);
});

test("monthly target writes require admin on server, cashier has read only view", async () => {
  const [html, admin, backend, rules] = await Promise.all([read("admin/index.html"), read("src/admin.js"), read("functions/src/index.js"), read("firestore.rules")]);
  assert.match(backend, /setBranchMonthlyTarget = onCall\(adminOptions, async request => \{\s*requireRole\(request, \["admin"\]\)/);
  assert.match(backend, /getServiceTargetsDashboard = onCall[\s\S]*?hasPermission\(request, "dashboard"\)/);
  assert.match(admin, /editBranchTarget"\)\.hidden = state\.role !== "admin"/);
  assert.match(admin, /if \(state\.role !== "admin"\) return toast\("تعديل الهدف متاح للمدير فقط"/);
  assert.match(html, /id="cashierShiftTargets"[\s\S]*?id="branchTargetDialog"/);
  assert.match(rules, /match \/\{document=\*\*\}/);
});

test("cashier primary reference menu is ordered and admin sections remain gated", async () => {
  const [html, css, admin] = await Promise.all([read("admin/index.html"), read("src/admin.css"), read("src/admin.js")]);
  const primary = html.match(/<div class="sidebar-primary">([\s\S]*?)<\/div>/)?.[1] || "";
  const positions = ['data-section="pos"', 'data-section="calendar"', 'data-section="bookings"', 'data-go="cash"', 'data-cashier-target'].map(token => primary.indexOf(token));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])), `menu order ${positions}`);
  for (const restricted of ["users", "settings", "campaigns", "activity"]) assert.doesNotMatch(primary, new RegExp(`data-section="${restricted}"`));
  assert.match(css, /html\[data-admin-role="cashier"\] \.sidebar-workspaces\{display:none\}/);
  assert.match(admin, /button\.hidden = !canOpenSection\(id\)/);
});

test("booking notifications open a right drawer and link to the existing booking action", async () => {
  const [html, admin, css] = await Promise.all([read("admin/index.html"), read("src/admin.js"), read("src/admin.css")]);
  assert.match(html, /id="pushButton"[\s\S]*?id="adminAlertsCount"/);
  assert.match(html, /id="adminAlertsDialog"[\s\S]*?id="adminAlertsList"/);
  assert.match(admin, /pushButton"\)\.addEventListener\("click", event => handlePushButton/);
  assert.match(admin, /handlePushButton\(button\)[\s\S]*?adminAlertsDialog"\)\.showModal\(\)/);
  assert.match(admin, /data-calendar-booking="\$\{escapeAttr\(item\.id\)\}"/);
  assert.match(admin, /\[item\.id, item\.code, item\.customerName/);
  assert.match(css, /\.admin-alerts-shell>header\{background:#245b7b/);
});

test("original 293 IDs, 102 data bindings, and 33 sections remain alongside cashier goals", async () => {
  const [html, fixture] = await Promise.all([read("admin/index.html"), read("tests/fixtures/admin-v3-bindings.json").then(JSON.parse)]);
  assert.equal(fixture.ids.length, 293);
  assert.equal(fixture.dataBindings.length, 102);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  fixture.ids.forEach(id => assert.ok(ids.includes(id), id));
  fixture.dataBindings.forEach(([attr, value]) => assert.ok(html.includes(value === null ? ` ${attr}` : `${attr}="${value}"`), `${attr}=${value}`));
  const sections = [...html.matchAll(/<section class="admin-section(?: active)?[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(sections.filter(id => !["workspaceHome", "cashierGoals", "mobileContent"].includes(id)).length, 33);
  assert.ok(sections.includes("cashierGoals"));
});

test("public booking is one Firestore record shared by cashier, admin list and calendar", async () => {
  const [site, backend, admin] = await Promise.all([read("src/app.js"), read("functions/src/index.js"), read("src/admin.js")]);
  const publicCreate = backend.slice(backend.indexOf("export const createBooking ="), backend.indexOf("export const rescheduleBooking ="));
  const cashier = backend.slice(backend.indexOf("export const getCashierSnapshot ="), backend.indexOf("export const getAdminCollection ="));
  const calendar = backend.slice(backend.indexOf("export const getBookingCalendar ="), backend.indexOf("export const getCustomer360 ="));
  assert.match(site, /createBooking\(\{ \.\.\.bookingPayload, clientRequestId \}\)/);
  assert.match(publicCreate, /const bookingRef = db\.doc\(`bookings\/\$\{code\}`\)/);
  assert.match(publicCreate, /source: "website"/);
  assert.match(publicCreate, /transaction\.create\(bookingRef, record\)/);
  assert.match(cashier, /scopedQueries\("bookings", allowedBranches/);
  assert.match(backend, /recentScoped\("bookings", allowedBranches, 140\)/);
  assert.match(calendar, /scopedQueries\("bookings", allowedBranches/);
  assert.match(admin, /getBookingCalendar\(from, to, branchId\)/);
  assert.match(calendar, /requestedBranch === "all" \? claimedBranches : \[requestedBranch\]/);
  assert.match(admin, /state\.dashboard = \{ \.\.\.state\.dashboard, bookings: scopedBookings/);
  assert.match(admin, /state\.section === "calendar"\) loadCalendar\(true\)/);
  assert.match(admin, /id === "bookings" \|\| Date\.now\(\) - state\.loadedAt\.cashier/);
  assert.match(admin, /if \(event\.target\.id === "headerBranchFilter"\)[\s\S]*?dashboardBranchFilter"\)\.value = event\.target\.value[\s\S]*?calendarBranchFilter"\)\.value = event\.target\.value/);
  assert.match(backend, /getBookingCalendar = onCall[\s\S]*?requestedBranch === "all" \? claimedBranches : \[requestedBranch\]/);
});
