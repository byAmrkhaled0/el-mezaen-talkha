import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { availableAtBranch, hasBranchScope } from "../src/branch-availability.js";
import { publicSubset, reconcileBranchCart } from "../src/public-branch.js";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("branchless legacy items fail closed in customer repeat, public cart, catalog and POS", async () => {
  const talkha = { branchIds: ["talkha"] };
  const mashaya = { branchIds: ["mashaya"] };
  const shared = { branchIds: ["talkha", "mashaya"] };
  const drink = { branchId: "all" };
  for (const item of [null, {}, { branchIds: [] }]) {
    assert.equal(hasBranchScope(item), false);
    assert.equal(availableAtBranch(item, "talkha"), false);
    assert.equal(availableAtBranch(item, "mashaya"), false);
  }
  assert.equal(availableAtBranch(talkha, "talkha"), true);
  assert.equal(availableAtBranch(talkha, "mashaya"), false);
  assert.equal(availableAtBranch(mashaya, "talkha"), false);
  assert.equal(availableAtBranch(mashaya, "mashaya"), true);
  assert.equal(availableAtBranch(shared, "talkha"), true);
  assert.equal(availableAtBranch(shared, "mashaya"), true);
  assert.equal(hasBranchScope(drink), false);
  assert.equal(availableAtBranch(drink, "talkha"), false);
  assert.equal(availableAtBranch(drink, "mashaya"), false);
  assert.equal(hasBranchScope(drink, true), true);
  assert.equal(availableAtBranch(drink, "talkha", true), true);
  assert.equal(availableAtBranch(drink, "mashaya", true), true);
  assert.equal(availableAtBranch(shared, ""), false);

  const [account, app, catalog, admin, preview] = await Promise.all([
    read("src/account.js"), read("src/app.js"), read("src/catalog-page.js"), read("src/admin.js"), read("src/firebase-client.js")
  ]);
  assert.match(account, /availableAtBranch\(entry, branch\.id, entry\.kind === "drink"\)/);
  assert.deepEqual(publicSubset([talkha, mashaya, shared, {}], "talkha"), [talkha, shared]);
  assert.deepEqual(reconcileBranchCart([{ id: "missing" }], { services: [], packages: [], offers: [], drinks: [] }, "talkha"), { kept: [], removed: 1 });
  assert.match(app, /!hasBranchScope\(item, item\.kind === "drink"\) \|\| \(state\.branchId && !itemAvailableAtBranch\(item, state\.branchId, item\.kind === "drink"\)\)/);
  assert.match(catalog, /publicSubset\(catalog\.packages, branchId, \{ dated: true \}\)/);
  assert.match(admin, /function posCatalogItems\([\s\S]*?availableAtBranch\(item, branchId\)/);
  assert.match(admin, /function renderPos\([\s\S]*?availableAtBranch\(item, branchId\)/);
  assert.match(preview, /resolvedLines\.some\(\(\{ item \}\) => !availableAtBranch\(item, branch\.id, item\?\.kind === "drink"\)\)/);
});

test("calendar and dashboard discard stale requests after branch/date/view changes", async () => {
  const admin = await read("src/admin.js");
  const calendar = admin.slice(admin.indexOf("async function loadCalendar("), admin.indexOf("function renderCalendar("));
  const dashboard = admin.slice(admin.indexOf("async function loadDashboard("), admin.indexOf("async function loadDashboardAttendance("));
  assert.match(calendar, /const requestVersion = \+\+calendarRequestVersion/);
  assert.match(calendar, /requestVersion !== calendarRequestVersion \|\| branchId !== .*calendarBranchFilter.* \|\| from !== .*calendarDate.* \|\| view !== .*calendarView/);
  assert.match(dashboard, /requestVersion !== dashboardRequestVersion \|\| branchId !== .*dashboardBranchFilter/);
  assert.match(dashboard, /finally \{ if \(requestVersion === dashboardRequestVersion\)/);
});

test("admin direct hash survives refresh only for a real authorized section", async () => {
  const admin = await read("src/admin.js");
  const permission = admin.slice(admin.indexOf("function canOpenSection("), admin.indexOf("function sectionHub("));
  const bootstrap = admin.slice(admin.indexOf("async function bootstrapAdmin(user)"));
  assert.match(permission, /document\.getElementById\(id\)\?\.classList\.contains\("admin-section"\)/);
  assert.match(bootstrap, /new URLSearchParams\(location\.hash\.slice\(1\)\)\.get\("admin"\)/);
  assert.match(bootstrap, /requestedSection && canOpenSection\(requestedSection\) \? requestedSection : desktopInitialSection/);
  assert.match(bootstrap, /showSection\(initialSection, \{ historyMode: "replace" \}\)/);
});

test("unrecognized roles and branchless non-admin accounts leave the protected shell", async () => {
  const [admin, login] = await Promise.all([read("src/admin.js"), read("src/login.js")]);
  const bootstrap = admin.slice(admin.indexOf("async function bootstrapAdmin(user)"));
  assert.match(bootstrap, /!\["admin", "manager", "cashier", "worker"\]\.includes\(access\.role\) \|\| \(access\.role !== "admin" && !access\.branchIds\?\.length\)/);
  assert.match(bootstrap, /await logout\(\);\s*location\.replace\("\/login\/\?reason=access"\);\s*return;/);
  assert.match(login, /reason"\) === "access"[\s\S]*غير مرتبط بفرع/);
});
