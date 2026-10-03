import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("cashier has exactly the five reference sidebar entries and no admin workspace", async () => {
  const [html, css] = await Promise.all([read("admin/index.html"), read("src/admin.css")]);
  const primary = html.match(/<div class="sidebar-primary">([\s\S]*?)<\/div>/)?.[1] || "";
  const cashierVisible = [...primary.matchAll(/<button[^>]*?(?:data-section="(pos|calendar|bookings)"|data-go="cash"|data-cashier-target)[^>]*>/g)].map(match => match[1] || (match[0].includes("data-go") ? "cash" : "targets"));
  assert.deepEqual(cashierVisible, ["pos", "calendar", "bookings", "cash", "targets"]);
  for (const item of [".sidebar-workspaces", ".sidebar-more", ".desktop-primary-nav", ".cashier-mobile-nav", ".admin-command-search", ".header-scope"]) assert.ok(css.includes(`html[data-admin-role="cashier"] ${item}`), item);
  assert.match(html, /class="sidebar-footer"[\s\S]*?إنهاء الشيفت[\s\S]*?id="logoutButton"/);
});

test("transactions retain real commands and a bounded table with filters", async () => {
  const [html, js] = await Promise.all([read("admin/index.html"), read("src/admin.js")]);
  for (const id of ["posTodayRevenue", "posTodayOrders", "posTodayCash", "posTodayCard", "posTodayTransfer", "posTodayWithdrawals", "cashierTransactionSearch", "cashierTransactionType", "cashierTransactionPayment", "cashierTransactionStaff", "cashierTransactionsTable"]) assert.ok(html.includes(`id="${id}"`), id);
  const kpis = html.match(/<div class="cashier-transaction-kpis transaction-kpi-grid">([\s\S]*?)<\/div>/)?.[1] || "";
  assert.equal((kpis.match(/class="metric-card/g) || []).length, 7);
  assert.match(kpis, /المصروفات والسلف/);
  for (const action of ['data-new-pos', 'data-cashier-payments', 'data-cash-shortcut="CASH_IN"', 'data-cash-shortcut="CASH_OUT"', 'data-go="expenses"']) assert.ok(html.includes(action), action);
  assert.match(js, /rows\.slice\(\(cashierTransactionsPage - 1\) \* pageSize, cashierTransactionsPage \* pageSize\)/);
  assert.match(js, /data-cash-movement="\$\{cashShortcut\.dataset\.cashShortcut\}"/);
});

test("booking views keep branch-scoped source and real statuses", async () => {
  const [html, js] = await Promise.all([read("admin/index.html"), read("src/admin.js")]);
  assert.match(html, /id="bookingListSummary"[\s\S]*?id="bookingDateFilter"[\s\S]*?id="bookingSearch"[\s\S]*?id="bookingPaymentFilter"[\s\S]*?id="bookingStatusFilter"/);
  assert.match(js, /\["confirmed", "arrived"\]/);
  assert.match(js, /\["cancelled", "rejected"\]/);
  assert.match(js, /const groups = \[\{ key: "pending"[\s\S]*?\{ key: "no_show"/);
  assert.match(js, /getBookingCalendar\(from, to, branchId\)/);
  assert.match(js, /getCashierSnapshot\(selectedBranch\)/);
  assert.match(html, /data-open-public-booking/);
});

test("notifications show active follow-up count without inventing unread state", async () => {
  const [html, js] = await Promise.all([read("admin/index.html"), read("src/admin.js")]);
  assert.match(html, /id="pushButton"[\s\S]*?id="adminAlertsDialog"[\s\S]*?id="adminAlertsList"/);
  assert.match(js, /\["pending", "confirmed"\]\.includes\(item\.status\)/);
  assert.match(js, /حجوزات للمتابعة/);
  assert.match(js, /pushButton"\)\.addEventListener\("click", event => handlePushButton/);
});

test("session persistence is awaited and callable auth is retried without signing out a valid user", async () => {
  const api = await read("src/admin-api.js");
  const session = await read("src/admin-session.js");
  assert.match(api, /await setPersistence\(auth, browserSessionPersistence\);\s*return signInWithEmailAndPassword/);
  assert.match(api, /retryAuthenticatedCall\(invoke, data, auth, signOut/);
  assert.match(session, /error\?\.code !== "functions\/unauthenticated"[\s\S]*?getIdToken\(true\)/);
  assert.match(session, /if \(isInvalidAuthSession\(refreshError\) && auth\.currentUser === user\) await signOutSession\(auth\)/);
  const admin = await read("src/admin.js");
  assert.match(admin, /retryAdminSession[\s\S]*?ensureAdminAppCheckReady\(true\); await bootstrapAdmin\(user\)/);
});
