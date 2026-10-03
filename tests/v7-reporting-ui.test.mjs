import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("../admin/index.html", import.meta.url), "utf8");
const ui = readFileSync(new URL("../src/admin.js", import.meta.url), "utf8");
const api = readFileSync(new URL("../src/admin-api.js", import.meta.url), "utf8");
const backend = readFileSync(new URL("../functions/src/index.js", import.meta.url), "utf8");

test("reports and shift print controls are wired to server callables", () => {
  for (const id of ["reportBranch", "reportType", "reportDate", "reportMonth", "reportLoad", "reportPrint", "shiftReportId", "shiftReportPrint", "cashierReportType", "cashierReportLoad", "cashierReportPrint"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(ui, /getBusinessReport\(/);
  assert.match(ui, /showShiftReport\(result\.report\)/);
  assert.match(api, /readCall\("getBusinessReport"/);
  assert.match(backend, /requireBranchAccess\(request, branchId\)/);
});
test("Admin password change uses Firebase Auth reauthentication and update only", () => {
  assert.match(html, /id="adminPasswordForm"/);
  assert.match(api, /reauthenticateWithCredential\(user, EmailAuthProvider\.credential\(user\.email, currentPassword\)\)/);
  assert.match(api, /await updatePassword\(user, newPassword\)/);
  assert.doesNotMatch(api.slice(api.indexOf("export async function changeOwnPassword"), api.indexOf("async function optimizeImage")), /saveEntity|setDoc|addDoc|updateDoc/);
  assert.match(ui, /adminPasswordForm.*addEventListener\("submit", submitOwnPassword\)/);
});
test("audit filters and pagination are handled by an admin-only bounded callable", () => {
  for (const id of ["auditDate", "auditActor", "auditRole", "auditBranch", "auditAction", "auditEntity", "auditNext"]) assert.match(html, new RegExp(`id="${id}"`));
  const handler = backend.slice(backend.indexOf("export const getAuditEvents"), backend.indexOf("export const recordPasswordChange"));
  assert.match(handler, /requireRole\(request, \["admin"\]\)/);
  assert.match(handler, /Math\.min\(100/);
  assert.match(handler, /startAfter\(prior\)/);
});
