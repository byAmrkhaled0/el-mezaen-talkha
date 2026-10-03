import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("cashier shell renders only five operational entries and moves the live bell", async () => {
  const [html, js] = await Promise.all([read("admin/index.html"), read("src/admin.js")]);
  assert.match(html, /id="cashierSidebarNav"[^>]*hidden><span[^>]*>القائمة<\/span><div class="sidebar-primary" id="cashierSidebarItems"/);
  assert.match(js, /const selectors = \['\[data-section="pos"\]', '\[data-section="calendar"\]', '\[data-section="bookings"\]', '\[data-go="cash"\]', '\[data-cashier-target\]'\]/);
  assert.match(js, /replaceChildren\(\.\.\.selectors\.map\(selector => primary\.querySelector\(selector\)\?\.cloneNode\(true\)\)/);
  assert.match(js, /\$\("#cashierHeaderBellSlot"\)\.append\(\$\("#pushButton"\)\)/);
  assert.match(js, /renderRoleShell\(\);\s*\$\("#authLoading"\)\.hidden/);
  assert.match(html, /id="cashierHeader"[^>]*hidden[\s\S]*?id="cashierPageTitle"[\s\S]*?id="cashierHeaderBellSlot"/);
});

test("cashier direct routes cannot open admin attendance, tasks, customers or workspace", async () => {
  const js = await read("src/admin.js");
  const gate = js.slice(js.indexOf("const cashierSections ="), js.indexOf("function sectionHub("));
  assert.match(gate, /new Set\(\["pos", "calendar", "bookings", "cash", "cashierGoals", "expenses"\]\)/);
  for (const id of ["attendance", "tasks", "customers", "users", "settings"]) assert.doesNotMatch(gate.slice(0, gate.indexOf("  if (id === \"workspaceHome\")")), new RegExp(`"${id}"`));
  assert.match(js, /if \(!canOpenSection\(id\)\) return toast\("لا تملك صلاحية هذا القسم"/);
  assert.match(js, /if \(section === "workspaceHome" \|\| !canOpenSection\(section\)\) return state\.role === "cashier" \? void showSection\("calendar"/);
  assert.match(js, /async function openCashierTargets\(\) \{ await showSection\("cashierGoals"\); \}/);
});

test("transactions default to compact seven KPI row, actions, filters, table and bounded pagination", async () => {
  const [html, css, js] = await Promise.all([read("admin/index.html"), read("src/admin.css"), read("src/admin.js")]);
  const pos = html.slice(html.indexOf('<section class="admin-section" id="pos"'), html.indexOf('<section class="admin-section" id="bookings"'));
  assert.match(js, /if \(id === "pos"\) setPosView\("receipts"\);/);
  const order = ["transaction-kpi-grid", "transaction-actions", "transaction-toolbar", "transaction-table", "cashierTransactionsCount", "pos-flow-heading", "pos-view-tabs", "pos-layout"].map(token => pos.indexOf(token));
  assert.ok(order.every((value, i) => value >= 0 && (i === 0 || value > order[i - 1])), String(order));
  assert.equal((pos.match(/class="transaction-kpi-icon"/g) || []).length, 7);
  assert.match(css, /\.transaction-kpi-grid\{display:grid;grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(css, /\.transaction-kpi-grid \.metric-card\{[^}]*height:77px;min-height:77px/);
  assert.match(js, /const pageSize = 10;/);
  assert.match(js, /data-open-receipt="\$\{escapeAttr\(item\.id\)\}"/);
});

test("POS creation and existing cash actions remain reachable from transaction dashboard", async () => {
  const [html, js, css] = await Promise.all([read("admin/index.html"), read("src/admin.js"), read("src/admin.css")]);
  for (const action of ["data-new-pos", "data-cashier-payments", 'data-cash-shortcut="CASH_IN"', 'data-cash-shortcut="CASH_OUT"', 'data-go="expenses"']) assert.ok(html.includes(action), action);
  assert.match(js, /async function openNewPosDraft\(\)[\s\S]*?await showSection\("pos"\);\s*setPosView\("new"\)/);
  assert.match(js, /const cashShortcut = event\.target\.closest\("\[data-cash-shortcut\]"\)/);
  assert.match(css, /#pos\[data-pos-view="receipts"\] \.pos-layout\{display:none\}/);
  assert.match(css, /#pos\[data-pos-view="new"\] \.cashier-transaction-overview/);
  assert.match(html, /id="posForm"/);
});

test("legacy selector inventory and admin sections survive the presentation change", async () => {
  const [html, fixture] = await Promise.all([read("admin/index.html"), read("tests/fixtures/admin-v3-bindings.json").then(JSON.parse)]);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  assert.equal(fixture.ids.length, 293);
  assert.equal(fixture.dataBindings.length, 102);
  for (const id of fixture.ids) assert.ok(ids.has(id), `missing ID ${id}`);
  for (const [attr, value] of fixture.dataBindings) assert.ok(html.includes(value === null ? ` ${attr}` : `${attr}="${value}"`), `missing binding ${attr}=${value}`);
  assert.equal([...html.matchAll(/class="admin-section" id="([^"]+)"/g)].filter(match => !["workspaceHome", "cashierGoals", "mobileContent"].includes(match[1])).length, 33);
});
