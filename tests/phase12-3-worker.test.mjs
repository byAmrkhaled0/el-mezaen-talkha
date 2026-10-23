import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { workerContext } from '../functions/src/worker-context.js';
import { isOwnManagedStaffPhoto } from '../functions/src/managed-media.js';
import { latestWorkerContext, workerPhotoSave } from '../src/worker-self-service.js';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backend = read('functions/src/index.js');
function handler(name, next, dependencies) {
  const source = backend.slice(backend.indexOf(`export const ${name} =`), backend.indexOf(`export const ${next} =`)).replace('export const', 'const');
  return vm.runInNewContext(`${source}\n${name}`, {
    onCall: (_, callback) => callback, adminOptions: {},
    HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
    ...dependencies
  });
}
const request = (activeBranchId = '', extra = {}) => ({ auth: { uid: 'worker-a', token: { role: 'worker' } }, data: { activeBranchId, ...extra } });
function workspaceFixture({ staffBranches = ['talkha', 'mashaya'], claims = ['talkha', 'mashaya'], userUid = 'worker-a', attendance = null } = {}) {
  const scopes = [];
  const snapshot = { exists: true, id: 'staff-a', data: () => ({ branchIds: staffBranches, active: true, userUid }) };
  const callable = handler('getWorkerWorkspace', 'updateWorkerProfilePhoto', {
    attendanceEngine: {settle: async () => attendance, project: row => row},
    requireRole: r => { if (r.auth.token.role !== 'worker') throw Error('role'); },
    linkedStaffId: async () => 'staff-a', businessDateParts: () => ({ dateKey: '2026-10-09', month: '2026-10' }),
    db: { doc: path => ({ get: async () => path.startsWith('staff/') ? snapshot : { exists: false } }) },
    cleanDoc: s => ({ id: s.id, ...s.data() }), branchesFor: () => claims, workerContext,
    scopedQueries: (collection, scope) => { scopes.push([collection, [...scope]]); return []; },
    scopedRows: async () => [], monthlyAttributedLedger: async scope => { scopes.push(['ledger', [...scope]]); return []; },
    attributedWorkerRevenue: () => 0, itemInAllowedBranch: () => true, API_VERSION: 'fixture', MIN_FRONTEND_VERSION: 'fixture'
  });
  return { callable, scopes };
}

test('branch context requires the intersection of claims and canonical staff assignments', () => {
  assert.deepEqual(workerContext(['talkha', 'mashaya', 'all', 'talkha'], ['talkha']), { authorizedBranchIds: ['talkha'], activeBranchId: 'talkha' });
  for (const requested of ['mashaya', 'all', 'other', null, {}, ['talkha']]) assert.throws(() => workerContext(['talkha'], ['talkha'], requested));
  assert.throws(() => workerContext(['mashaya'], ['talkha']));
  assert.throws(() => workerContext([], ['talkha']));
});

test('actual workspace handler scopes all operational reads to the selected authorized branch', async () => {
  const f = workspaceFixture();
  const result = await f.callable(request('mashaya', { staffId: 'staff-b' }));
  assert.equal(result.staff.id, 'staff-a');
  assert.equal(result.activeBranchId, 'mashaya');
  assert.deepEqual([...result.authorizedBranchIds], ['talkha', 'mashaya']);
  for (const [, scope] of f.scopes) assert.deepEqual(scope, ['mashaya']);
  assert.equal(f.scopes.length, 4);
});

test('workspace includes the active attendance session from the previous calendar day', async () => {
  const attendance={id:'previous-day',dateKey:'2026-10-08',branchId:'talkha',status:'PRESENT'};
  const result=await workspaceFixture({attendance}).callable(request('talkha'));
  assert.equal(result.attendance.id,'previous-day');
  assert.equal(result.attendance.status,'PRESENT');
});

test('workspace rejects unauthorized contexts or a mismatched canonical UID before operational reads', async () => {
  const f = workspaceFixture({ staffBranches: ['talkha'] });
  await assert.rejects(f.callable(request('mashaya')), { code: 'permission-denied' });
  assert.equal(f.scopes.length, 0);
  await assert.rejects(workspaceFixture({ userUid: 'worker-b' }).callable(request()), { code: 'permission-denied' });
});

test('latest branch response wins and an obsolete failure cannot overwrite current UI', async () => {
  let oldResolve, oldReject;
  const values = [];
  const load = latestWorkerContext(id => id === 'talkha' ? new Promise((resolve, reject) => { oldResolve = resolve; oldReject = reject; }) : Promise.resolve({ branch: id }), value => values.push(value));
  const old = load('talkha'); await load('mashaya'); oldResolve({ branch: 'talkha' });
  assert.equal(await old, false); assert.deepEqual(values, [{ branch: 'mashaya' }]);
  const failing = load('talkha'); await load('mashaya'); oldReject(Error('old network failure'));
  assert.equal(await failing, false); assert.equal(values.length, 2);
});

test('photo validation blocks invalid, empty and oversized files before uploading', async () => {
  let uploads = 0;
  const save = workerPhotoSave(async () => { uploads++; }, async () => {});
  for (const file of [null, { type: 'image/svg+xml', size: 10 }, { type: 'image/png', size: 0 }, { type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 }]) await assert.rejects(save(file, 'staff-a'));
  assert.equal(uploads, 0);
});

test('photo retry reuses the authorized upload, reports progress, and links the same URL', async () => {
  const uploads = [], links = [], progress = []; let fail = true;
  const save = workerPhotoSave(async (file, folder, update) => { uploads.push(folder); update(50); update(100); return 'authorized-url'; }, async url => { links.push(url); if (fail) { fail = false; throw Error('retry'); } });
  const file = { type: 'image/webp', size: 1024 };
  await assert.rejects(save(file, 'staff-a', percent => progress.push(percent)));
  assert.equal(await save(file, 'staff-a', () => {}), 'authorized-url');
  assert.deepEqual(uploads, ['staff/staff-a']); assert.deepEqual(links, ['authorized-url', 'authorized-url']); assert.deepEqual(progress, [50, 100]);
  await save(file, 'staff-b', () => {}); assert.equal(uploads.length, 2);
});

test('in-flight duplicate photo submissions do not upload twice', async () => {
  let finish, uploads = 0;
  const save = workerPhotoSave(() => { uploads++; return new Promise(resolve => finish = resolve); }, async () => {});
  const file = { type: 'image/png', size: 512 };
  const pending = save(file, 'staff-a'); await assert.rejects(save(file, 'staff-a'));
  finish('url'); await pending; assert.equal(uploads, 1);
});

test('actual profile-photo handler enforces canonical ownership and preserves catalog invalidation', async () => {
  let writes = 0, invalidations = 0, owner = 'worker-a';
  const callable = handler('updateWorkerProfilePhoto', 'createWorkerTask', {
    requireRole: () => {}, linkedStaffId: async () => 'staff-a', sanitizeText: x => x,
    isOwnManagedStaffPhoto, getStorage: () => ({ bucket: () => ({ name: 'fixture-bucket' }) }),
    db: { doc: () => ({}), runTransaction: async callback => callback({ get: async () => ({ exists: true, data: () => ({ active: true, userUid: owner, branchIds: ['talkha'] }) }), set: () => { writes++; } }) },
    branchesFor: () => ['talkha'], FieldValue: { serverTimestamp: () => 'server-time' }, markCatalogChanged: async () => { invalidations++; }
  });
  const url = id => `https://firebasestorage.googleapis.com/v0/b/fixture-bucket/o/${encodeURIComponent(`public/staff/${id}/photo.webp`)}`;
  await assert.rejects(callable({ ...request(), data: { imageUrl: url('staff-b') } }), { code: 'permission-denied' });
  owner = 'worker-b'; await assert.rejects(callable({ ...request(), data: { imageUrl: url('staff-a') } }), { code: 'permission-denied' });
  assert.equal(writes, 0); owner = 'worker-a';
  await callable({ ...request(), data: { imageUrl: url('staff-a') } });
  assert.equal(writes, 1); assert.equal(invalidations, 1);
});

test('theme action uses moon for dark and sun for light, with accessible state', () => {
  let click; const attributes = {}; const button = { setAttribute: (key, value) => attributes[key] = value, addEventListener: (_, fn) => click = fn };
  vm.runInNewContext(read('src/worker-theme.js'), {
    document: { documentElement: { dataset: { theme: 'dark' } }, getElementById: () => button, querySelector: () => null },
    matchMedia: () => ({ matches: true, addEventListener() {} }), localStorage: { getItem: () => null, setItem() {} }
  });
  assert.match(button.innerHTML, /20\.5 13/); assert.match(attributes['aria-label'], /الوضع الداكن/);
  click(); assert.match(button.innerHTML, /<circle/); assert.equal(attributes['aria-pressed'], 'true'); assert.match(attributes['aria-label'], /الوضع الفاتح/);
});

test('portal preview works with existing CSP, preserves hidden context, and uses bounded existing summaries', () => {
  const worker = read('src/worker.js'), html = read('worker/index.html'), css = read('src/worker.css');
  assert.match(worker, /reader\.readAsDataURL\(file\)/); assert.match(read('vercel.json'), /img-src 'self' data:/);
  assert.match(css, /\.worker-layout\[hidden\]\{display:none\}/);
  assert.match(worker, /ids\.length<2/); assert.match(worker, /a\.branchId!==activeBranchId/);
  assert.match(worker, /const attendanceBranch=activeBranchId/);
  assert.match(html, /id="photoProgress"[^>]+aria-label=/); assert.match(worker, /renderWorkerProfile\(s,w,a,user\)/);
  assert.doesNotMatch(worker, /getDocs|onSnapshot|collection\(/);
  assert.match(read('src/app.js'), /safeMediaUrl\(item\.imageUrl\).*class="team-photo"/);
});

async function portalFixture(branches, services = {}) {
  const nodes = new Map(); let authCallback;
  const element = () => ({ textContent: '', value: '', hidden: false, disabled: false, dataset: {}, children: [],
    setAttribute() {}, removeAttribute(name) { delete this[name]; }, append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; }, click() {}, scrollIntoView() {} });
  const $ = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const workspace = { staff: { id: 'staff-a', nameAr: 'عامل تجريبي', branchIds: branches }, activeBranchId: branches[0], authorizedBranchIds: branches,
    bookings: [], tasks: [], notifications: [], dateKey: '2026-10-09', target: {} };
  const source = read('src/worker.js').split('\n').filter(line => !line.startsWith('import ')).join('\n');
  vm.runInNewContext(source, {
    document: { querySelector: $, querySelectorAll: () => [], createElement: () => element() },
    watchAuth: callback => authCallback = callback, currentAccess: async () => ({ role: 'worker', staffId: 'staff-a', branchIds: branches }),
    getWorkerWorkspace: async () => workspace, staffRouteGuard: () => '', safeMediaUrl: value => value,
    createWorkerRequestCenter: () => ({ load() {}, contextChanged() {} }), getWorkerRequests() {}, submitWorkerRequest() {}, updateWorkerRequest() {},
    renderWorkerProfile(staff){$('#profileDetails').textContent='الاسم: '+(staff.nameAr||'غير مسجل')}, mountMonthlyTargetPanel() {}, latestWorkerContext, validateWorkerPhoto: file => { if (!file) throw Error('file'); }, workerPhotoSave,
    uploadImage: async () => 'image-url', updateWorkerProfilePhoto: async () => {},
    recordWorkerAttendance() {}, updateWorkerTask() {}, markWorkerNotificationRead() {}, enablePush() {},
    watchWorkerPush: async () => () => {}, logout() {},
    location: { search: '', hash: '', replace() {} }, history: { replaceState() {} }, navigator: {},
    URLSearchParams, setInterval: () => 0, clearInterval() {}, window: { addEventListener() {} },
    FileReader: class { readAsDataURL() { this.result = 'data:image/png;base64,fixture'; this.onload(); } },
    ...services
  });
  await authCallback({ email: 'synthetic@example.invalid', providerData: [] });
  return { $, workspace };
}

test('actual portal DOM fixture hides a single-branch selector and keeps attendance in its recorded branch', async () => {
  const f = await portalFixture(['talkha']);
  assert.equal(f.$('#workingBranchControl').hidden, true);
  assert.equal(f.$('#workingBranch').value, 'talkha');
  assert.equal(f.$('#attendanceBranch').hidden, true);
  assert.match(f.$('#profileDetails').textContent, /عامل تجريبي/);
  const w = { staff: { id: 'staff-a', branchIds: ['talkha', 'mashaya'] }, activeBranchId: 'mashaya', authorizedBranchIds: ['talkha', 'mashaya'],
    attendance: { status: 'PRESENT', branchId: 'talkha' }, bookings: [], tasks: [], notifications: [] };
  const g = await portalFixture(['talkha', 'mashaya'], { getWorkerWorkspace: async () => w });
  assert.equal(g.$('#workingBranchControl').hidden, false); assert.equal(g.$('#checkIn').disabled, true);
  assert.equal(g.$('#checkOut').disabled, true); assert.match(g.$('#attendanceState').textContent, /طلخا/);
});

test('actual portal photo fixture previews before saving and updates both canonical photo displays', async () => {
  const uploads = [], links = [];
  const f = await portalFixture(['talkha'], {
    uploadImage: async (file, folder, progress) => { uploads.push(folder); progress(100); return 'https://fixture.invalid/own-photo.webp'; },
    updateWorkerProfilePhoto: async url => links.push(url)
  });
  f.$('#photo').files = [{ type: 'image/png', size: 500 }]; f.$('#photo').onchange();
  assert.equal(uploads.length, 0); assert.equal(f.$('#photoPreview').hidden, false); assert.equal(f.$('#savePhoto').disabled, false);
  await f.$('#savePhoto').onclick();
  assert.deepEqual(uploads, ['staff/staff-a']); assert.equal(links.length, 1);
  assert.equal(f.$('#avatar').src, links[0]); assert.equal(f.$('#profileAvatar').src, links[0]);
  assert.equal(f.$('#photoPreview').hidden, true); assert.match(f.$('#photoStatus').textContent, /تم حفظ صورتك/);
});
