import test from "node:test";
import assert from "node:assert/strict";
import { calculateCoupon, calculatePayroll, calculateRevenueBreakdown, createSlotKeys, isDrinkAvailableAtBranch, isRecentAuthentication, isValidDateKey, normalizeExpenseInput, normalizePhone, paymentTransition, priceItems, validateAppointment } from "../src/core.js";

test("normalizes Egyptian mobile numbers", () => {
  assert.equal(normalizePhone("+20 109 300 8896"), "01093008896");
  assert.throws(() => normalizePhone("123"), /INVALID_PHONE/);
});

test("requires a recent administrator authentication for destructive actions", () => {
  assert.equal(isRecentAuthentication(1_000, 1_299), true);
  assert.equal(isRecentAuthentication(1_000, 1_301), false);
  assert.equal(isRecentAuthentication(undefined, 1_100), false);
  assert.equal(isRecentAuthentication(1_200, 1_100), false);
});

test("validates and normalizes financial expense input", () => {
  const value = normalizeExpenseInput({ amount: "250.50", category: "inventory", description: "شراء أدوات", notes: "فاتورة 15", branchId: "TALKHA", dateKey: "2026-07-18", inventoryItemId: "comb-1", stockQuantity: "5", paymentMethod: "cash", idempotencyKey: "12345678-1234-1234-1234-123456789012" }, { categories: ["inventory", "electricity"] });
  assert.equal(value.amount, 250.5);
  assert.equal(value.kind, "purchase");
  assert.equal(value.branchId, "talkha");
  assert.equal(value.stockQuantity, 5);
  assert.equal(isValidDateKey("2026-02-29"), false);
  assert.throws(() => normalizeExpenseInput({ amount: 0, category: "electricity", description: "فاتورة", branchId: "talkha", dateKey: "2026-07-18" }, { categories: ["electricity"] }), /INVALID_EXPENSE_AMOUNT/);
  assert.throws(() => normalizeExpenseInput({ amount: 10, category: "electricity", description: "", branchId: "talkha", dateKey: "2026-07-18" }, { categories: ["electricity"] }), /INVALID_EXPENSE_DESCRIPTION/);
});

test("allows active global drinks at either branch", () => {
  assert.equal(isDrinkAvailableAtBranch({ active: true, branchId: "all" }, "talkha"), true);
  assert.equal(isDrinkAvailableAtBranch({ active: true, branchId: "talkha" }, "mashaya"), false);
  assert.equal(isDrinkAvailableAtBranch({ active: false, branchId: "all" }, "mashaya"), false);
});

test("calculates target bonus and final monthly salary", () => {
  assert.deepEqual(calculatePayroll({ baseSalary: 5000, monthlyTarget: 20000, targetBonusPercent: 10, revenue: 22000, adjustment: -250 }), {
    baseSalary: 5000,
    monthlyTarget: 20000,
    targetBonusPercent: 10,
    revenue: 22000,
    targetAchieved: true,
    progressPercent: 100,
    bonus: 500,
    adjustment: -250,
    netSalary: 5250
  });
  assert.equal(calculatePayroll({ baseSalary: 5000, monthlyTarget: 20000, targetBonusPercent: 10, revenue: 12000 }).bonus, 0);
});

test("separates service, product and drink income after discount", () => {
  const breakdown = calculateRevenueBreakdown([
    { kind: "service", lineTotal: 100 },
    { kind: "inventory", category: "product", lineTotal: 60 },
    { kind: "drink", category: "drink", lineTotal: 40 }
  ], 180);
  assert.deepEqual(breakdown, { services: 90, products: 54, drinks: 36 });
  assert.deepEqual(calculateRevenueBreakdown([{ kind: "drink", category: "drink", lineTotal: 40 }], -40), { services: 0, products: 0, drinks: -40 });
});

test("prices only from trusted server documents", () => {
  const docs = new Map([["hair-001", { kind: "service", active: true, nameAr: "قص شعر", nameEn: "Haircut", price: 100, duration: 30 }]]);
  const result = priceItems([{ id: "hair-001", kind: "service", price: 1 }], docs);
  assert.equal(result[0].unitPrice, 100);
  assert.equal(result[0].lineTotal, 100);
});

test("preserves product quantity and rejects duplicate lines", () => {
  const docs = new Map([["product-001", { kind: "product", type: "product", active: true, nameAr: "مشط", nameEn: "Comb", price: 5, duration: 0 }]]);
  assert.equal(priceItems([{ id: "product-001", kind: "product", qty: 3 }], docs)[0].lineTotal, 15);
  assert.throws(() => priceItems([{ id: "product-001", kind: "product" }, { id: "product-001", kind: "product" }], docs), /DUPLICATE/);
});

test("applies coupon limits and item scope", () => {
  const items = [{ id: "a", lineTotal: 100 }, { id: "b", lineTotal: 200 }];
  const result = calculateCoupon({ active: true, type: "percent", value: 50, maxDiscount: 60, minSubtotal: 100, applicableItemIds: ["a"], totalUsageLimit: 10, perPhoneLimit: 1 }, items);
  assert.equal(result.discountAmount, 50);
  assert.equal(result.total, 250);
  assert.equal(calculateCoupon({ active: true, type: "fixed", value: 100, perPhoneLimit: 1 }, items, { phoneUsageCount: 1 }).valid, false);
});

test("creates non-overlapping five-minute lock keys", () => {
  assert.deepEqual(createSlotKeys("staff-1", "2026-08-01", "11:00", 15), ["staff-1_2026-08-01_1100", "staff-1_2026-08-01_1105", "staff-1_2026-08-01_1110"]);
  assert.deepEqual(createSlotKeys("staff-1", "2026-08-01", "11:00", 10, 5, "talkha"), ["talkha_staff-1_2026-08-01_1100", "talkha_staff-1_2026-08-01_1105"]);
});

test("rejects an item that is unavailable at the selected branch", () => {
  const docs = new Map([["hair-001", { kind: "service", active: true, branchIds: ["talkha"], nameAr: "قص شعر", nameEn: "Haircut", price: 100, duration: 30 }]]);
  assert.throws(() => priceItems([{ id: "hair-001", kind: "service" }], docs, new Date(), "mashaya"), /ITEM_UNAVAILABLE_AT_BRANCH/);
});

test("validates future appointment and business hours", () => {
  assert.doesNotThrow(() => validateAppointment({ date: "2027-01-02", time: "11:00", duration: 60, openingTime: "11:00", closingTime: "23:00", now: new Date("2027-01-01T10:00:00") }));
  assert.throws(() => validateAppointment({ date: "2027-01-02", time: "22:30", duration: 60, openingTime: "11:00", closingTime: "23:00", now: new Date("2027-01-01T10:00:00") }), /OUTSIDE/);
});

test("payment is idempotent and refund is negative", () => {
  assert.equal(paymentTransition({ paymentStatus: "paid", total: 200 }, "markPaid").changed, false);
  assert.equal(paymentTransition({ paymentStatus: "unpaid", total: 200 }, "markPaid", "cash").ledgerAmount, 200);
  assert.equal(paymentTransition({ paymentStatus: "paid", total: 200 }, "refund", "instapay").ledgerAmount, -200);
});
