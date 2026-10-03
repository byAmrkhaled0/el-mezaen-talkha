import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateCoupon } from '../functions/src/core.js';
import { effectivePermissions, branchAllowed } from '../functions/src/authorization.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('cashier team access remains distinct from attendance administration and coupon management', () => {
  const old = effectivePermissions('cashier', ['pos', 'bookings', 'attendance', 'tasks', 'coupons', 'customers', 'users']);
  assert.equal(old.has('teamOperations'), true);
  for (const key of ['attendance', 'tasks', 'coupons', 'customers', 'users']) assert.equal(old.has(key), false, key);
  assert.equal(branchAllowed('cashier', ['talkha'], 'mashaya'), false);
});

test('cashier team callables reuse scoped attendance, task and notification resources', async () => {
  const backend = await read('functions/src/index.js');
  const section = (a, b) => backend.slice(backend.indexOf(`export const ${a} =`), backend.indexOf(`export const ${b} =`));
  const attendance = section('getAttendanceDashboard', 'recordWorkerAttendance');
  assert.match(attendance, /requirePermission\(request, "teamOperations"\)/);
  assert.match(attendance, /requireBranchAccess\(request, requestedBranch\)/);
  assert.match(attendance, /dateKey !== businessDateParts\(\)\.dateKey/);
  const task = section('createWorkerTask', 'updateWorkerTask');
  assert.match(task, /requireBranchAccess\(request, branchId\)/);
  assert.match(task, /staffSnapshot\.data\(\)\.branchIds\.includes\(branchId\)/);
  assert.match(task, /workerNotifications\/task_/);
  const worker = section('recordWorkerAttendance', 'getWorkerWorkspace');
  assert.match(worker, /requireRole\(request, \["worker"\]\)/);
  assert.match(worker, /validateAttendanceLocation/);
});

test('POS coupon uses canonical priced lines, branch and transactional usage, with no coupon management grant', async () => {
  const backend = await read('functions/src/index.js');
  const pos = backend.slice(backend.indexOf('export const createPosOrder ='), backend.indexOf('export const updateBooking ='));
  assert.match(pos, /couponSnapshot\.data\(\)\.branchIds\.includes\(branch\.id\)/);
  assert.match(pos, /calculateCoupon\(coupon, items/);
  assert.match(pos, /transaction\.update\(couponRef, \{ usageCount: FieldValue\.increment\(1\)/);
  assert.match(pos, /transaction\.create\(bookingRef, bookingRecord\)/);
  const lines = [{ id: 'service-a', lineTotal: 100 }];
  assert.equal(calculateCoupon({ active: true, type: 'fixed', value: 25, minSubtotal: 120 }, lines).valid, false);
  assert.equal(calculateCoupon({ active: true, type: 'fixed', value: 25, totalUsageLimit: 1 }, lines, { usageCount: 1 }).valid, false);
});

test('owner mobile KPIs come from aggregate sources and branch responses cannot overwrite newer selection', async () => {
  const [backend, ui, html] = await Promise.all([read('functions/src/index.js'), read('src/admin.js'), read('admin/index.html')]);
  assert.match(backend, /ownerMonthTransactions: request\.auth\.token\.role === "admin" \? ownerMonthPayments\.count/);
  assert.match(backend, /ownerNewCustomers: request\.auth\.token\.role === "admin"/);
  assert.match(ui, /if \(requestVersion !== dashboardRequestVersion \|\| branchId !== \$\("#dashboardBranchFilter"\)\?\.value\) return/);
  assert.match(ui, /monthRevenue \|\| 0\) \/ s\.ownerMonthTransactions/);
  assert.match(html, /id="ownerBranchSheet"/);
  assert.match(html, /id="ownerMobileNav"/);
});

test('scanner lifecycle stops tracks, invalidates pending reads and dev SW cannot intercept admin localhost', async () => {
  const [ui, worker] = await Promise.all([read('src/admin.js'), read('public/sw.js')]);
  assert.match(ui, /if \(id !== state\.section\) closeScanner\(\)/);
  assert.match(ui, /generation !== scanGeneration/);
  assert.match(ui, /scanStream\?\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(ui, /scannerDialog"\)\.addEventListener\("close"/);
  assert.match(worker, /\["localhost", "127\.0\.0\.1"\]/);
});

test('cashier and worker mobile navigation reuse guarded sections and in-page panels', async () => {
  const [ui, css] = await Promise.all([read('src/admin.js'), read('src/admin.css')]);
  assert.match(ui, /data-cashier-jump="team"/);
  assert.match(ui, /data-cashier-jump="tasks"/);
  assert.match(ui, /data-worker-jump="attendance"/);
  assert.match(ui, /data-worker-jump="bookings"/);
  assert.match(ui, /data-worker-jump="tasks"/);
  assert.match(css, /html\[data-admin-role="cashier"\] \.cashier-mobile-nav,html\[data-admin-role="worker"\] \.cashier-mobile-nav\{display:grid!important/);
  assert.match(css, /#bookingsTable tr,#cashierTransactionsTable tr\{display:grid/);
});

test('task status is checked inside one transaction and legacy coupons fail closed without branch scope', async () => {
  const backend = await read('functions/src/index.js');
  const task = backend.slice(backend.indexOf('export const updateWorkerTask ='), backend.indexOf('export const notifyWorker ='));
  assert.match(task, /db\.runTransaction\(async transaction =>/);
  assert.match(task, /transaction\.get\(ref\)/);
  assert.match(task, /task\.assigneeStaffId !== staffId/);
  assert.match(task, /transitions\[task\.status \|\| "NEW"\]/);
  assert.match(backend, /couponData && Array\.isArray\(couponData\.branchIds\) && couponData\.branchIds\.includes\(branchId\)/);
});
