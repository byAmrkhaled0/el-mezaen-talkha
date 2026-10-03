import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cashVariance, closeShiftReasonMissing } from "../src/cashier-shift.js";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("staff authentication has tab scoped persistence and customer authentication retains local persistence", async () => {
  const [staff, customer] = await Promise.all([read("src/admin-api.js"), read("src/account.js")]);
  assert.match(staff, /initializeAuth\(app, \{ persistence: browserSessionPersistence \}\)/);
  assert.match(staff, /await setPersistence\(auth, browserSessionPersistence\)/);
  assert.doesNotMatch(staff, /browserLocalPersistence/);
  assert.match(customer, /setPersistence\(auth, browserLocalPersistence\)/);
  assert.match(staff, /await signOut\(auth\)/);
});

test("POS offer lookup is distinct from the management collection and is branch scoped on the server", async () => {
  const [front, backend] = await Promise.all([read("src/admin.js"), read("functions/src/index.js")]);
  const operational = backend.slice(backend.indexOf("export const getPosOffers ="), backend.indexOf("export const getAdminCollection ="));
  assert.match(operational, /requirePermission\(request, "pos"\)/);
  assert.match(operational, /requireBranchAccess\(request, branchId\)/);
  assert.match(operational, /where\("branchIds", "array-contains", branchId\)/);
  assert.match(operational, /where\("active", "==", true\)/);
  assert.match(operational, /offerAtBranch\(doc\.data\(\), branchId\)/);
  assert.doesNotMatch(operational, /requirePermission\(request, "offers"\)/);
  assert.match(front, /pos: \["categories", "services", "packages", "staff", "inventoryItems", "drinks"\]/);
  assert.match(front, /if \(id === "pos"\) tasks\.push\(loadPosOffers\(\)\)/);
  assert.match(front, /const offers = state\.posOffers\.filter/);
});

test("cashier financial snapshot derives the scoped daily amount from canonical ledger", async () => {
  const [front, backend] = await Promise.all([read("src/admin.js"), read("functions/src/index.js")]);
  const source = backend.slice(backend.indexOf("export const getCashierSnapshot ="), backend.indexOf("export const getPosOffers ="));
  assert.match(source, /if \(branchId !== "all"\) requireBranchAccess\(request, branchId\)/);
  assert.match(source, /aggregateScoped\("revenueLedger", allowedBranches, query => query\.where\("dateKey", "==", today\)/);
  assert.match(source, /todayRevenue: collectedToday\.amount/);
  assert.match(front, /const result = await getCashierSnapshot\(selectedBranch\)/);
  assert.match(front, /requestVersion !== cashierRequestVersion/);
});

test("cashier targets have an independently refreshable route with accurate monthly label", async () => {
  const [front, html] = await Promise.all([read("src/admin.js"), read("admin/index.html")]);
  assert.match(front, /async function openCashierTargets\(\) \{ await showSection\("cashierGoals"\); \}/);
  assert.match(front, /if \(id === "cashierGoals"\) await loadCashierGoals\(\)/);
  assert.match(front, /sectionPermission\(id\)[\s\S]*?cashierGoals: "dashboard"/);
  assert.match(html, /<section class="admin-section" id="cashierGoals">/);
  assert.match(html, /data-cashier-target[^>]*>[^<]*<span[^>]*>◎<\/span>أهداف الخدمات/);
  assert.doesNotMatch(html, /data-cashier-target[^>]*>[^<]*<span[^>]*>◎<\/span>أهداف الشيفت/);
});

test("shift close variance requires a reason and rounds cents", () => {
  assert.equal(cashVariance("101.27", 100), 1.27);
  assert.equal(cashVariance("99.99", 100), -0.01);
  assert.equal(cashVariance("", 100), null);
  assert.equal(closeShiftReasonMissing("100", 100, ""), false);
  assert.equal(closeShiftReasonMissing("99", 100, ""), true);
  assert.equal(closeShiftReasonMissing("99", 100, "ملاحظة"), false);
});

test("shift state changes the footer command and opens the existing report after close", async () => {
  const [front, html] = await Promise.all([read("src/admin.js"), read("admin/index.html")]);
  assert.match(front, /shiftShortcut\.textContent = isOpen \? "إنهاء الشيفت" : "بدء الشيفت"/);
  assert.match(front, /else \$\("#openShiftDialog"\)\.showModal\(\)/);
  assert.match(front, /openCashShift\(\{ \.\.\.data, openingCash: Number\(data\.openingCash\), idempotencyKey:/);
  assert.match(front, /closeCashShift\(\{ \.\.\.data, branchId: cashBranch\(\), actualCash: Number\(data\.actualCash\), idempotencyKey:/);
  assert.match(front, /if \(result\.report\) showShiftReport\(result\.report\)/);
  for (const id of ["openShiftDialog", "closeShiftDialog", "closeShiftExpected", "closeShiftVariance", "shiftReportPrint", "shiftReportLoad"]) assert.match(html, new RegExp(`id="${id}"`));
});

test("cashier branch input cannot change the POS or shift request branch", async () => {
  const front = await read("src/admin.js");
  assert.match(front, /\$\("#posBranch"\)\.value = state\.branchIds\[0\]/);
  assert.match(front, /\$\("#posBranch"\)\.disabled = true/);
  assert.match(front, /\$\("#openShiftForm \[name=branchId\]"\)\.disabled = true/);
  assert.match(front, /if \(state\.role === "cashier"\) data\.branchId = state\.branchIds\[0\]/);
  assert.match(front, /state\.role === "cashier" \? state\.branchIds\[0\] : \$\("#posBranch"\)\.value/);
});

test("POS customer lookup, booking checkout and refund use existing actions", async () => {
  const front = await read("src/admin.js");
  assert.match(front, /findCustomerByPhone\(phone\)/);
  assert.match(front, /scanCustomerCode\(raw\)/);
  assert.match(front, /state\.posBookingId[\s\S]*?changeBooking\(state\.posBookingId/);
  assert.match(front, /state\.bookingActionKeys\.get\(operationKey\) \|\| crypto\.randomUUID\(\)/);
  assert.match(front, /if \(idempotencyKey\) state\.bookingActionKeys\.delete/);
});

test("board quick actions follow active booking states", async () => {
  const front = await read("src/admin.js");
  const board = front.slice(front.indexOf("function renderCalendar()"), front.indexOf("function cashBranch()"));
  assert.match(board, /item\.status === "pending" \? action\("confirmed", "تأكيد"\)/);
  assert.match(board, /item\.status === "confirmed" \? action\("arrived", "وصل"\)/);
  assert.match(board, /item\.status === "arrived" \? action\(item\.paymentStatus === "paid" \? "completed" : "checkout"/);
  assert.match(board, /\["confirmed", "arrived"\]\.includes\(item\.status\) \? action\("no_show"/);
});

test("cashier booking assignment uses branch staff without granting attendance administration", async () => {
  const front = await read("src/admin.js");
  assert.match(front, /state\.role === "cashier" && \["bookings", "calendar"\]\.includes\(id\)\) tasks\.push\(loadCollection\("staff"\)\)/);
  assert.match(front, /state\.attendance\.dateKey === cairoDateKey\(\)/);
  assert.match(front, /worker\.status === "PRESENT"/);
  assert.match(front, /التواجد غير مؤكد/);
});
