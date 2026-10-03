import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { effectivePermissions, branchAllowed } from '../functions/src/authorization.js';
import { ownerRange } from '../functions/src/owner-mobile.js';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('optional cashier content claims are ceiling-bound and never default', () => {
  const ordinary = effectivePermissions('cashier');
  for (const key of ['gallery','results','hairMedia','celebrities','posts']) assert.equal(ordinary.has(key), false);
  const granted = effectivePermissions('cashier', ['pos','gallery','posts','settings']);
  assert.equal(granted.has('gallery'), true);
  assert.equal(granted.has('posts'), true);
  assert.equal(granted.has('settings'), false);
  assert.equal(branchAllowed('cashier', ['talkha'], 'mashaya'), false);
});

test('content mutation checks old type, new type, actual branch, media path and public active catalog', async () => {
  const backend = await read('functions/src/index.js');
  const upsert = backend.slice(backend.indexOf('export const adminUpsert ='), backend.indexOf('export const adminDelete ='));
  assert.match(upsert, /contentPermission\(raw\.type \|\| before\.data\(\)\?\.type\)/);
  assert.match(upsert, /await requireMarketingGrant\(request, contentPermission\(raw\.type \|\| before\.data\(\)\?\.type\)\)/);
  assert.match(upsert, /contentPermission\(before\.data\(\)\?\.type\)/);
  assert.match(upsert, /allResourceBranchesAllowed\(request\.auth\.token\.role, branchesFor\(request\), before\.data\(\)\)/);
  assert.match(upsert, /public\/content\/\$\{payload\.type\}\/\$\{id\}/);
  assert.match(backend, /db\.collection\(name\)\.where\("active", "==", true\)/);
  assert.match(upsert, /content-publish/);
  assert.match(upsert, /markCatalogChanged\(\)/);
  assert.match(backend, /if \(collection === "offers"\) await requireMarketingGrant/);
  assert.match(backend, /cashierContentGrants\.includes\(CONTENT_PERMISSIONS\[item\.type\]\)/);
});

test('Storage upload path requires branch and matching type grant; generic path excludes content', async () => {
  const rules = await read('storage.rules');
  assert.match(rules, /match \/public\/content\/\{type\}\/\{branchId\}\/\{fileName\}/);
  assert.match(rules, /request\.auth\.token\.branchIds\.hasAny\(\[branchId\]\)/);
  assert.match(rules, /folder != 'content'/);
  assert.match(rules, /isValidMedia\(\)/);
});

test('Cairo period keys handle day, last month and invalid ranges', () => {
  const now = new Date('2026-09-29T21:30:00Z'); // September 30 in Cairo.
  assert.deepEqual(ownerRange('today', now), { from: '2026-09-30', to: '2026-09-30' });
  assert.deepEqual(ownerRange('previousMonth', now), { from: '2026-08-01', to: '2026-08-31' });
  assert.deepEqual(ownerRange('week', now), { from: '2026-09-24', to: '2026-09-30' });
  assert.throws(() => ownerRange('range', now, '2026-10-01', '2026-09-30'));
});

test('owner mobile totals aggregate all filtered rows separately from bounded page', async () => {
  const backend = await read('functions/src/index.js');
  const endpoint = backend.slice(backend.indexOf('export const getOwnerMobileHistory ='), backend.indexOf('async function sumCashShifts'));
  assert.match(endpoint, /requireRole\(request, \["admin"\]\)/);
  assert.match(endpoint, /query\.limit\(21\)\.get\(\)/);
  assert.match(endpoint, /AggregateField\.count\(\), amount: AggregateField\.sum\("amount"\)/);
  assert.match(endpoint, /const items = pageRows\.map/);
  assert.match(endpoint, /categoryTotals = Object\.fromEntries/);
  assert.doesNotMatch(endpoint, /totals = items\.reduce/);
});

test('all emulator test entrypoints fail closed to demo projects and hosts', async () => {
  const [packageJson, rulesTest, gate] = await Promise.all([read('package.json'), read('tests/firebase-rules.emulator.mjs'), read('tests/v6-1-production-gate.emulator.mjs')]);
  assert.match(packageJson, /--project demo-el-mezaen-rules/);
  assert.match(packageJson, /--project demo-el-mezaen-gate/);
  assert.match(rulesTest, /PROJECT_ID\.startsWith\("demo-"\)/);
  assert.match(rulesTest, /FIRESTORE_EMULATOR_HOST/);
  assert.match(rulesTest, /FIREBASE_STORAGE_EMULATOR_HOST/);
  assert.match(gate, /FIREBASE_AUTH_EMULATOR_HOST/);
  assert.match(gate, /projectId\.startsWith\("demo-"\)/);
});
