import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { saveStaffTabPreference } from "../src/staff-tab-state.js";
const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("staff UI state is tab local while customer persistence and V8.1 App Check separation remain", async () => {
  const [admin, api, customer, session] = await Promise.all([source("src/admin.js"), source("src/admin-api.js"), source("src/account.js"), source("src/admin-session.js")]);
  assert.match(api, /initializeAuth\(app, \{ persistence: browserSessionPersistence \}\)/);
  assert.match(api, /setPersistence\(auth, browserSessionPersistence\)/);
  assert.match(api, /export async function logout\(\)[\s\S]*?await signOut\(auth\)/);
  assert.match(customer, /browserLocalPersistence/);
  assert.match(admin, /saveStaffTabPreference\("mz-admin-sidebar-collapsed"/);
  assert.match(admin, /saveStaffTabPreference\("mz-admin-theme"/);
  assert.doesNotMatch(admin, /localStorage\.(?:getItem|setItem)\("mz-admin-/);
  assert.match(api, /isAppCheckFailure/);
  assert.match(session, /retryAuthenticatedCall/);
});

test("staff tab preference simulation isolates three tabs across refresh and logout", () => {
  const makeTab = () => {
    const rows = new Map();
    return { setItem: (key, value) => rows.set(key, value), getItem: key => rows.get(key) ?? null };
  };
  const admin = makeTab(), talkha = makeTab(), mashaya = makeTab();
  saveStaffTabPreference("mz-admin-theme", "light", admin);
  saveStaffTabPreference("mz-admin-theme", "dark", talkha);
  saveStaffTabPreference("mz-admin-sidebar-collapsed", true, mashaya);
  assert.equal(admin.getItem("mz-admin-theme"), "light");
  assert.equal(talkha.getItem("mz-admin-theme"), "dark");
  assert.equal(mashaya.getItem("mz-admin-theme"), null);
  // A refresh uses the same tab storage; logging out elsewhere cannot alter it.
  assert.equal(admin.getItem("mz-admin-theme"), "light");
  assert.equal(mashaya.getItem("mz-admin-sidebar-collapsed"), "true");
});

test("shift figures use one server snapshot rather than bounded receipt pages", async () => {
  const [admin, backend, html] = await Promise.all([source("src/admin.js"), source("functions/src/index.js"), source("admin/index.html")]);
  const shift = backend.slice(backend.indexOf("async function summarizeShiftFinance"), backend.indexOf("export const closeCashShift"));
  assert.match(shift, /where\("shiftId", "==", shiftId\)/);
  assert.match(shift, /if \(entry\.shiftId\) continue/);
  assert.match(shift, /AggregateField\.sum\("amount"\)/);
  assert.match(backend, /export const getCashOperations[\s\S]*?snapshot, movements:/);
  assert.match(admin, /function renderShiftKpis\(\)[\s\S]*?current = state\.cash\.snapshot/);
  assert.match(admin, /renderShiftKpis\(\);\s*renderMonthlyRevenueTarget/);
  assert.match(admin, /cashShiftTransactions", "transactionsCount"/);
  assert.match(admin, /posTodayOrders: current\?\.transactionsCount/);
  for (const id of ["cashShiftNet", "cashShiftAverage", "cashShiftAdvances", "refreshShiftSnapshot", "posTodayRevenue", "posTodayOutgoings"]) assert.match(html, new RegExp(`id="${id}"`));
});

test("classified advance is one branch-owned movement and manual payroll reconciliation", async () => {
  const [admin, backend, reporting, html] = await Promise.all([source("src/admin.js"), source("functions/src/index.js"), source("functions/src/reporting.js"), source("admin/index.html")]);
  const movement = backend.slice(backend.indexOf("export const addCashMovement"), backend.indexOf("async function summarizeShiftFinance"));
  assert.match(movement, /requireBranchAccess\(request, branch\.id\)/);
  assert.match(movement, /staff\.data\(\)\.branchIds\.includes\(branch\.id\)/);
  assert.match(movement, /if \(existing\.exists\) return \{ ok: true, idempotent: true/);
  assert.match(movement, /transaction\.create\(movementRef/);
  assert.doesNotMatch(movement, /transaction\.create\(.*expenseRef/);
  assert.match(backend, /advances: advances\.amount/);
  assert.match(reporting, /"expenses", "advances", "cashIn", "cashOut"/);
  assert.match(admin, /تسوية الراتب تتم بواسطة الإدارة/);
  assert.match(html, /data-cash-shortcut="ADVANCE"/);
  assert.match(html, /id="advanceStaff"/);
});

test("transaction eye opens one detail drawer with state-gated actions", async () => {
  const admin = await source("src/admin.js");
  assert.match(admin, /class="transaction-view-button"[^`]+data-open-receipt=/);
  assert.match(admin, /function receiptDrawerOperations\(item\)/);
  assert.match(admin, /state\.permissions\.has\("revenue"\).*item\.paymentStatus === "paid"/);
  assert.match(admin, /const states = \{ pending:.*confirmed:.*arrived:/);
  assert.match(admin, /if \(\$\("#receiptDrawer"\)\?\.open\) openReceiptDrawer\(id\)/);
  assert.match(admin, /await refreshCashierOperations\(\)/);
});

test("goals retain their monthly service identity and the original cashier navigation", async () => {
  const [admin, html] = await Promise.all([source("src/admin.js"), source("admin/index.html")]);
  assert.match(admin, /sectionTitles\.cashierGoals = "أهداف الخدمات"/);
  assert.match(html, /data-cashier-target[^>]*>[^<]*<span[^>]*>◎<\/span>أهداف الخدمات/);
  assert.match(html, /id="cashierGoals"/);
  assert.doesNotMatch(html, /أهداف الشيفت/);
});
