import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/admin.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/admin.css', import.meta.url), 'utf8');
const shell = source.slice(source.indexOf('function renderRoleShell()'), source.indexOf('const adminMobileViewport'));
function render(role) {
  const nodes = new Map();
  const element = () => ({ hidden: false, innerHTML: '', children: [], append() {}, replaceChildren(...items) { this.children = items; }, cloneNode() { return element(); }, querySelector() { return element(); } });
  const $ = key => { if (!nodes.has(key)) nodes.set(key, element()); return nodes.get(key); };
  vm.runInNewContext(shell + ';renderRoleShell();', { $, canOpenSection:()=>true, state: { role, permissions: new Set(['dashboard']) }, cashierHeaderHomes: { menu: element(), bell: element(), branch: element() } });
  return nodes;
}
test('actual role-shell function builds five cashier operational destinations and preserves shift More route', () => {
  const nodes = render('cashier');
  const html = nodes.get('.cashier-mobile-nav').innerHTML;
  assert.equal((html.match(/<button /g) || []).length, 5);
  for (const attribute of ['data-section="pos"', 'data-section="bookings"', 'data-cashier-jump="team"', 'data-cashier-jump="tasks"', 'data-cashier-more']) assert.ok(html.includes(attribute));
  assert.equal(nodes.get('#ownerMobileNav').hidden, true);
  assert.equal(nodes.get('#cashierHeader').hidden, false);
  assert.ok(source.includes('if (event.target.closest("[data-cashier-more]") && state.role === "cashier") { $("#cashierMoreSheet").showModal(); return; }'));
  const htmlSource = fs.readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
  const moreSheet = htmlSource.slice(htmlSource.indexOf('id="cashierMoreSheet"'));
  assert.match(moreSheet.slice(0, moreSheet.indexOf("</dialog>")), /data-go="cash"/);
  assert.ok(source.includes('data-go="cash"'));
});
test('manager runtime shell preserves five manager destinations without Admin owner bar', () => {
  const nodes = render('manager');
  const html = nodes.get('.cashier-mobile-nav').innerHTML;
  assert.equal((html.match(/<button /g) || []).length, 5);
  for (const id of ['dashboard', 'bookings', 'attendance', 'mobileContent']) assert.ok(html.includes(`data-section="${id}"`));
  assert.equal(nodes.get('#ownerMobileNav').hidden, true);
  assert.equal(nodes.get('#cashierHeader').hidden, true);
});
test('Admin owner bar remains selected and Worker owner bar remains hidden', () => {
  assert.equal(render('admin').get('#ownerMobileNav').hidden, false);
  assert.equal(render('worker').get('#ownerMobileNav').hidden, true);
  assert.match(css, /html\[data-admin-role="admin"\] \.cashier-mobile-nav\{display:none!important/);
  assert.match(css, /html\[data-admin-role="worker"\] \.cashier-mobile-nav\{display:none!important/);
  assert.doesNotMatch(css, /html\[data-admin-role="worker"\] \.cashier-mobile-nav[^{}]*\{display:grid!important/);
});
test('role display overrides explicitly exclude hidden navigation and controls', () => {
  for (const role of ['cashier', 'manager']) {
    assert.ok(css.includes(`html[data-admin-role="${role}"] .cashier-mobile-nav:not([hidden]){display:grid!important`));
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector, body]) => selector.includes(`html[data-admin-role="${role}"] .cashier-mobile-nav`) && /display:(grid|block)!important/.test(body));
    assert.ok(rules.length >= 2);
    for (const [, selector] of rules) assert.ok(selector.includes(':not([hidden])'), selector);
  }
});
test('mobile transaction hit targets are 44px with wrap and gaps while desktop declarations remain compact', () => {
  assert.match(css, /@media\(max-width:720px\)\{\.transaction-view-button\{width:44px;height:44px;min-height:44px;flex-shrink:0\}/);
  assert.match(css, /\.cashier-pagination-buttons button\{min-width:44px;min-height:44px\}/);
  assert.match(css, /\.cashier-pagination-buttons\{flex-wrap:wrap;gap:6px\}/);
  assert.match(css, /\.transaction-view-button\{width:24px;height:24px;min-height:24px/);
  assert.match(css, /\.cashier-pagination-buttons button\{min-height:24px/);
});
