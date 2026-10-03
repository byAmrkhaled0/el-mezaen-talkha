import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("cashier report controls use read-only, branch-owned report calls and a bounded self shift list", async () => {
  const [ui, html, api, backend, indexes] = await Promise.all([
    read("src/admin.js"), read("admin/index.html"), read("src/admin-api.js"), read("functions/src/index.js"), read("firestore.indexes.json")
  ]);
  for (const type of ["shift", "daily", "weekly", "monthly"]) assert.match(html, new RegExp(`data-cashier-report-tab="${type}"`));
  assert.match(ui, /getBusinessReport\(\{ type, branchId: state\.branchIds\[0\], periodKey \}\)/);
  assert.match(ui, /getCashOperations\(branchId, \{ includeReports \}\)/);
  assert.match(api, /export const getCashOperations = \(branchId, options = \{\}\) => readCall\("getCashOperations"/);
  const list = backend.slice(backend.indexOf("export const getCashOperations"), backend.indexOf("export const getBookingCalendar"));
  assert.match(list, /requireBranchAccess\(request, branch\.id\)/);
  assert.match(list, /where\("cashierUid", "==", request\.auth\.uid\)/);
  assert.match(list, /limit\(20\)/);
  const report = backend.slice(backend.indexOf("export const getBusinessReport"), backend.indexOf("export const scheduledBusinessReports"));
  assert.match(report, /reportAccess\(request, snapshot\.data\(\)\.branchId, type\)/);
  assert.match(report, /snapshot\.data\(\)\.cashierUid !== request\.auth\.uid/);
  assert.match(report, /requireRole\(request, \["admin"\]\)/);
  assert.ok(indexes.includes('"fieldPath": "cashierUid"'));
});

test("receipt reprint is read-only and refund uses an explicit permission and server payment method", async () => {
  const [ui, backend, auth] = await Promise.all([read("src/admin.js"), read("functions/src/index.js"), read("functions/src/authorization.js")]);
  const print = ui.slice(ui.indexOf("async function printReceipt"), ui.indexOf("let scanStream"));
  assert.match(print, /createReceiptCanvas\(item\)/);
  assert.doesNotMatch(print, /createPosOrder|changeBooking|recordExpense|addCashMovement|createBooking/);
  assert.match(ui, /data-reprint-booking/);
  assert.match(ui, /\(\) => printReceipt\(reprintButton\.dataset\.reprintBooking\)/);
  assert.match(ui, /state\.permissions\.has\("refundTransactions"\)/);
  assert.match(ui, /function openRefundDialog/);
  assert.match(ui, /if \(!confirm\(`تأكيد استرداد/);
  const mutation = backend.slice(backend.indexOf("export const updateBooking"), backend.indexOf("function authenticatedCustomer"));
  assert.match(mutation, /hasPermission\(request, "refundTransactions"\)/);
  assert.match(mutation, /action === "refund" \? booking\.paymentMethod : request\.data\?\.paymentMethod/);
  assert.match(mutation, /transaction\.create\(ledgerRef/);
  assert.match(auth, /cashier: \[[^\]]*"refundTransactions"/);
  assert.doesNotMatch(auth.match(/cashier: \["dashboard", "pos", "bookings", "teamOperations"\]/)?.[0] || "", /refundTransactions/);
});

test("cashier account changes only its own Firebase Auth password and no secret is audited", async () => {
  const [ui, api, backend, html] = await Promise.all([read("src/admin.js"), read("src/admin-api.js"), read("functions/src/index.js"), read("admin/index.html")]);
  assert.match(html, /id="staffPasswordDialog"/);
  assert.match(ui, /\["admin", "manager", "cashier"\]\.includes\(state\.role\)/);
  assert.match(api, /reauthenticateWithCredential\(user, EmailAuthProvider\.credential\(user\.email, currentPassword\)\)/);
  assert.match(api, /updatePassword\(user, newPassword\)/);
  const audit = backend.slice(backend.indexOf("export const recordPasswordChange"), backend.indexOf("export const recordExpense"));
  assert.match(audit, /actorUid: request\.auth\.uid/);
  assert.match(audit, /entityId: request\.auth\.uid/);
  assert.doesNotMatch(audit, /request\.data|currentPassword|newPassword|credential|tokenValue/);
});

test("operational customer and optional marketing remain narrower than admin access", async () => {
  const [ui, backend, auth] = await Promise.all([read("src/admin.js"), read("functions/src/index.js"), read("functions/src/authorization.js")]);
  assert.match(ui, /findCustomerByPhone\(/);
  assert.match(ui, /scanCustomerCode\(/);
  const pos = backend.slice(backend.indexOf("export const createPosOrder"), backend.indexOf("export const updateBooking"));
  assert.match(pos, /requestedPoints>Number\(customerSnapshot\.data\(\)\?\.pointsBalance/);
  assert.match(pos, /requestedCashback>Number\(customerSnapshot\.data\(\)\?\.cashbackBalance/);
  assert.match(pos, /transaction\.create\(bookingRef, bookingRecord\)/);
  const marketing = backend.slice(backend.indexOf("async function requireMarketingGrant"), backend.indexOf("function itemInAllowedBranch"));
  assert.match(marketing, /account\.data\(\)\.permissions\.includes\(capability\)/);
  assert.match(marketing, /branchesFor\(request\)\.every/);
  assert.match(auth, /cashier: \["dashboard", "pos", "bookings", "teamOperations"\]/);
});
