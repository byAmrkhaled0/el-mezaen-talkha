import test from "node:test";
import assert from "node:assert/strict";
import { branchAllowed, allResourceBranchesAllowed, effectivePermissions } from "../src/authorization.js";
import { priceItems } from "../src/core.js";

test("old cashier claims cannot elevate to customer, attendance, task, user or settings administration", () => {
  const permissions = effectivePermissions("cashier", ["pos", "bookings", "customers", "attendance", "tasks", "users", "settings", "revenue", "payroll"]);
  assert.deepEqual([...permissions], ["pos", "bookings", "teamOperations"]);
  assert.equal(permissions.has("customers"), false);
  assert.equal(permissions.has("attendance"), false);
  assert.equal(permissions.has("users"), false);
  assert.equal(effectivePermissions("manager", ["bookings", "expenses"]).has("expenses"), true);
  assert.equal(effectivePermissions("admin", []).has("users"), true);
});

test("refund authorization is an explicit cashier grant, with no management or finance escalation", () => {
  const defaults = effectivePermissions("cashier");
  assert.equal(defaults.has("refundTransactions"), false);
  assert.equal(defaults.has("revenue"), false);
  const granted = effectivePermissions("cashier", ["pos", "refundTransactions", "revenue", "customers"]);
  assert.equal(granted.has("refundTransactions"), true);
  assert.equal(granted.has("revenue"), false);
  assert.equal(granted.has("customers"), false);
  assert.equal(effectivePermissions("manager", ["refundTransactions"]).has("refundTransactions"), false);
  assert.equal(effectivePermissions("admin").has("refundTransactions"), true);
});

test("cashier and manager only access actual booking and financial resource branches", () => {
  for (const role of ["cashier", "manager"]) {
    assert.equal(branchAllowed(role, ["mashaya"], "mashaya"), true);
    for (const resource of ["booking", "cash", "expense", "revenue", "target", "notification"]) {
      assert.equal(branchAllowed(role, ["mashaya"], "talkha"), false, resource);
      assert.equal(branchAllowed(role, [], "mashaya"), false, resource);
    }
    assert.equal(allResourceBranchesAllowed(role, ["mashaya"], { branchId: "talkha" }), false);
    assert.equal(allResourceBranchesAllowed(role, ["mashaya"], { branchId: "mashaya" }), true);
    assert.equal(allResourceBranchesAllowed(role, ["mashaya"], { branchIds: ["mashaya", "talkha"] }), false);
    assert.equal(allResourceBranchesAllowed(role, ["mashaya"], { branchId: "mashaya", branchIds: ["talkha"] }), false);
    assert.equal(allResourceBranchesAllowed(role, ["mashaya"], {}), false);
  }
  assert.equal(branchAllowed("cashier", ["talkha"], "mashaya"), false);
  assert.equal(branchAllowed("admin", [], "talkha"), true);
  assert.equal(branchAllowed("admin", [], "mashaya"), true);
});

test("public booking price validation rejects wrong-branch or unscoped legacy products", () => {
  const records = new Map([
    ["talkha-service", { kind: "service", active: true, branchIds: ["talkha"], price: 100, duration: 30 }],
    ["shared-service", { kind: "service", active: true, branchIds: ["talkha", "mashaya"], price: 100, duration: 30 }],
    ["legacy-service", { kind: "service", active: true, price: 100, duration: 30 }],
    ["talkha-package", { kind: "package", active: true, branchIds: ["talkha"], price: 200, duration: 30 }],
    ["talkha-offer", { kind: "offer", active: true, branchIds: ["talkha"], price: 80, duration: 30 }]
  ]);
  for (const id of ["talkha-service", "talkha-package", "talkha-offer", "legacy-service"]) {
    const kind = records.get(id).kind;
    assert.throws(() => priceItems([{ id, kind }], records, new Date(), "mashaya"), /ITEM_UNAVAILABLE_AT_BRANCH/, id);
  }
  assert.equal(priceItems([{ id: "shared-service", kind: "service" }], records, new Date(), "mashaya").length, 1);
  assert.equal(priceItems([{ id: "talkha-service", kind: "service" }], records, new Date(), "talkha").length, 1);
});
