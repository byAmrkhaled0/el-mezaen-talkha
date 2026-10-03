import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const attrValues = (html, attr) => [...html.matchAll(new RegExp(`\\b${attr}="([^"]*)"`, "g"))].map(match => match[1]);

test("admin v4 preserves every original ID, navigation target, and data binding", async () => {
  const [html, baseline] = await Promise.all([read("admin/index.html"), read("tests/fixtures/admin-v3-bindings.json").then(JSON.parse)]);
  const ids = attrValues(html, "id");
  assert.equal(ids.length, new Set(ids).size, "duplicate HTML id");
  for (const id of baseline.ids) assert.ok(ids.includes(id), `removed original ID ${id}`);
  for (const [attr, value] of baseline.dataBindings) {
    const escaped = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const values = [...html.matchAll(new RegExp(`\\b${escaped}(?:="([^"]*)")?`, "g"))].map(match => match[1] ?? null);
    assert.ok(values.includes(value), `removed original binding ${attr}=${value}`);
  }
});

test("admin shell keeps access gating and existing delegated actions", async () => {
  const [html, admin] = await Promise.all([read("admin/index.html"), read("src/admin.js")]);
  for (const target of ["sidebar", "adminMenu", "sidebarCollapse", "adminGlobalSearch", "adminTheme", "logoutButton", "workspaceHome", "dashboard"]) assert.ok(attrValues(html, "id").includes(target));
  for (const hub of ["management", "social"]) assert.match(html, new RegExp(`data-open-hub="${hub}"`));
  for (const selector of ["[data-section]", "[data-go]", "[data-open-hub]", "[data-new-pos]"]) assert.ok(admin.includes(selector));
  assert.match(admin, /if \(!canOpenSection\(id\)\)/);
  assert.match(admin, /availableHubSections\(button\.dataset\.openHub\)/);
  assert.match(admin, /sidebarCollapse.*addEventListener\("click"/);
  assert.match(admin, /adminMenu.*addEventListener\("click"/);
});

test("dashboard shows only existing server values and loaded bookings or attendance", async () => {
  const [html, admin, backend] = await Promise.all([read("admin/index.html"), read("src/admin.js"), read("functions/src/index.js")]);
  for (const id of ["statTodayBookings", "statCompletedToday", "statUpcomingBookings", "dashboardUpcomingList", "dashboardAttendanceSummary", "dashboardAlertsPreview"]) assert.ok(attrValues(html, "id").includes(id));
  for (const stat of ["todayBookings", "completedToday", "upcomingBookings"]) {
    assert.match(admin, new RegExp(`s\\.${stat}`));
    assert.match(backend, new RegExp(`${stat}:`));
  }
  assert.match(admin, /state\.dashboard\.bookings[^;]*\.filter\(item => item\.source !== "pos"/);
  assert.match(admin, /state\.loadedAt\.attendance/);
  assert.match(admin, /attendance\.dateKey !== cairoDateKey\(\)/);
  assert.match(admin, /renderDashboardAttendanceSummary\(\)/);
  assert.match(html, /data-dashboard-attendance/);
});

test("v4.1 forces the reference light shell and preserves responsive navigation", async () => {
  const [html, css, theme, admin] = await Promise.all([read("admin/index.html"), read("src/admin.css"), read("public/theme-init.js"), read("src/admin.js")]);
  assert.match(html, /data-theme="light"/);
  assert.match(theme, /const fallback = admin \? "light" : "dark"/);
  assert.match(theme, /admin \? "light" : saved/);
  assert.match(admin, /setTheme\("light"\)/);
  assert.match(admin, /setSidebarCollapsed\(false, \{ persist: false \}\)/);
  for (const token of ["--admin-bg", "--admin-primary", "--admin-surface", "--admin-border", "--admin-shadow"]) assert.ok(css.includes(token));
  assert.match(css, /--admin-bg:#f5f8fb/);
  assert.match(css, /html\[data-theme="dark"\]\{/);
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /\.sidebar\.open\{transform:none\}/);
});

test("v4.2 primary menu and footer retain existing section permissions and logout binding", async () => {
  const [html, admin] = await Promise.all([read("admin/index.html"), read("src/admin.js")]);
  const primary = html.match(/<div class="sidebar-primary">([\s\S]*?)<\/div>/)?.[1] || "";
  for (const id of ["dashboard", "pos", "calendar", "bookings", "attendance", "tasks", "customers"]) assert.match(primary, new RegExp(`data-section="${id}"`));
  for (const id of ["revenue", "payroll"]) assert.match(html, new RegExp(`class="sidebar-more"[\\s\\S]*?data-section="${id}"`));
  assert.match(html, /class="sidebar-more"/);
  assert.match(html, /class="sidebar-footer"[\s\S]*?data-go="cash"[\s\S]*?id="logoutButton"/);
  assert.equal((html.match(/id="logoutButton"/g) || []).length, 1);
  assert.match(admin, /shiftShortcut[\s\S]*?canOpenSection\("cash"\)[\s\S]*?showSection\("cash"\)/);
});
