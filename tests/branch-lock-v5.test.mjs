import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { effectivePermissions, branchAllowed } from "../functions/src/authorization.js";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const endpoint = (source, name) => source.slice(source.indexOf(`export const ${name} =`), source.indexOf("export const ", source.indexOf(`export const ${name} =`) + 15) || undefined);

test("callable role ceiling overrides stale claims before permission checks", async () => {
  const backend = await read("functions/src/index.js");
  assert.match(backend, /return effectivePermissions\(role, request\.auth\?\.token\?\.permissions\)/);
  assert.equal(effectivePermissions("cashier", ["users", "customers", "attendance", "pos"]).has("customers"), false);
  assert.match(endpoint(backend, "getCustomer360"), /requirePermission\(request, "customers"\)/);
  assert.match(endpoint(backend, "getAttendanceDashboard"), /requirePermission\(request, "attendance"\)/);
  assert.equal(branchAllowed("cashier", ["mashaya"], "talkha"), false);
});

test("booking and cash resource IDs are checked against stored branch on the server", async () => {
  const backend = await read("functions/src/index.js");
  assert.match(endpoint(backend, "updateBooking"), /const booking = snapshot\.data\(\);\s*requireBranchAccess\(request, booking\.branchId\)/);
  assert.match(endpoint(backend, "getBookingCalendar"), /scopedQueries\("bookings", allowedBranches/);
  assert.match(endpoint(backend, "getCashierSnapshot"), /scopedQueries\("bookings", allowedBranches/);
  assert.match(endpoint(backend, "getCashOperations"), /requireBranchAccess\(request, branch\.id\)/);
  assert.match(endpoint(backend, "addCashMovement"), /requireBranchAccess\(request, branch\.id\)/);
  assert.match(endpoint(backend, "recordExpense"), /requireBranchAccess\(request, input\.branchId\)/);
  assert.match(endpoint(backend, "setBranchMonthlyTarget"), /requireRole\(request, \["admin"\]\)/);
  assert.match(endpoint(backend, "getAdminCollection"), /\.where\(field, field === "branchIds" \? "array-contains" : "==", branchId\)/);
});

test("website branch choices and bundled services are validated by canonical IDs", async () => {
  const [backend, site] = await Promise.all([read("functions/src/index.js"), read("src/app.js")]);
  assert.match(site, /state\.branchId \? itemAvailableAtBranch\(item, state\.branchId, allowGlobalDrink\) : hasBranchScope\(item, allowGlobalDrink\)/);
  assert.match(backend, /branchIds\.some\(branchId => !Array\.isArray\(snapshot\.data\(\)\?\.branchIds\)/);
  assert.match(backend, /!Array\.isArray\(serviceBranches\) \|\| !serviceBranches\.includes\(branchId\)/);
  assert.match(endpoint(backend, "createBooking"), /const bookingRef = db\.doc\(`bookings\/\$\{code\}`\)/);
});

test("direct Firestore reads remain denied for operational collections", async () => {
  const rules = await read("firestore.rules");
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false/);
  assert.match(rules, /match \/users\/\{uid\}/);
});
