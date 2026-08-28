import test from "node:test";
import assert from "node:assert/strict";
import { calculateCoupon, calculateExpectedCash, calculatePayroll, calculateRevenueBreakdown, calculateRewards, calculateServiceTargetProgress, createSlotKeys, distanceMeters, isDrinkAvailableAtBranch, isRecentAuthentication, isValidDateKey, nextMonthKey, normalizeExpenseInput, normalizeLineWorkers, normalizePhone, paymentTransition, priceItems, serviceTargetDocumentId, serviceTargetEntries, validateAppointment, validateAttendanceLocation } from "../src/core.js";
import { newMashayaPackages } from "../../src/package-definitions.js";

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

test("calculates the next month without relying on server timezone", () => {
  assert.equal(nextMonthKey("2026-08"), "2026-09");
  assert.equal(nextMonthKey("2026-12"), "2027-01");
  assert.throws(() => nextMonthKey("2026-13"), /INVALID_MONTH/);
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

test("hidden legacy duplicate services cannot be booked again", () => {
  const docs = new Map([["hair-028", { kind: "service", active: true, catalogVisible: false, nameAr: "كيرلي كريم", price: 100, duration: 20 }]]);
  assert.throws(() => priceItems([{ id: "hair-028", kind: "service" }], docs), /ITEM_UNAVAILABLE/);
});

test("service targets count only sold service, package and offer lines", () => {
  assert.deepEqual(serviceTargetEntries([
    { id: "hair-001", kind: "service", nameAr: "قص شعر", qty: 1 },
    { id: "package-001", kind: "package", nameAr: "باقة", qty: 1 },
    { id: "water", kind: "drink", nameAr: "مياه", qty: 4 },
    { id: "hair-001", kind: "service", nameAr: "قص شعر", qty: 2 }
  ]), [
    { itemId: "hair-001", kind: "service", nameAr: "قص شعر", nameEn: "قص شعر", count: 3 },
    { itemId: "package-001", kind: "package", nameAr: "باقة", nameEn: "باقة", count: 1 }
  ]);
  assert.equal(serviceTargetDocumentId({ month: "2026-08", branchId: "mashaya", kind: "service", itemId: "hair-001" }), "2026-08_mashaya_service_hair-001");
  assert.throws(() => serviceTargetDocumentId({ month: "2026-13", branchId: "mashaya", kind: "service", itemId: "hair-001" }), /INVALID_SERVICE_TARGET_KEY/);
  assert.deepEqual(calculateServiceTargetProgress(10, 7), { targetCount: 10, achievedCount: 7, remainingCount: 3, progressPercent: 70 });
  assert.deepEqual(calculateServiceTargetProgress(10, 12), { targetCount: 10, achievedCount: 12, remainingCount: 0, progressPercent: 100 });
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

test("attendance geofence validates distance, accuracy and configurable radius", () => {
  assert.equal(Math.round(distanceMeters(31.0409, 31.3785, 31.0409, 31.3785)), 0);
  const accepted = validateAttendanceLocation({ branchLatitude: 31.0409, branchLongitude: 31.3785, latitude: 31.0411, longitude: 31.3785, accuracy: 12, radiusMeters: 100 });
  assert.ok(accepted.distanceMeters < 100);
  assert.throws(() => validateAttendanceLocation({ branchLatitude: 31.0409, branchLongitude: 31.3785, latitude: 31.05, longitude: 31.3785, accuracy: 10, radiusMeters: 100 }), /OUTSIDE_BRANCH_GEOFENCE/);
  assert.throws(() => validateAttendanceLocation({ branchLatitude: 31.0409, branchLongitude: 31.3785, latitude: 31.0409, longitude: 31.3785, accuracy: 300, radiusMeters: 100 }), /LOCATION_ACCURACY_TOO_LOW/);
});

test("new package price, branch and exclusive choices are enforced by the server", () => {
  const source = { ...newMashayaPackages[0], kind: "package" };
  const docs = new Map([[source.id, source]]);
  const choices = Object.fromEntries(source.choiceGroups.map(group => [group.id, group.options[0].id]));
  const priced = priceItems([{ id: source.id, kind: "package", price: 1, choices }], docs, new Date(), "mashaya");
  assert.equal(priced[0].unitPrice, 250);
  assert.deepEqual(priced[0].serviceIds, ["hair-001", "hair-011", "skin-002", "beard-care-004", "beard-001", "hair-006"]);
  assert.equal(priced[0].choices.length, 2);
  assert.throws(() => priceItems([{ id: source.id, kind: "package", choices }], docs, new Date(), "talkha"), /ITEM_UNAVAILABLE_AT_BRANCH/);
  assert.throws(() => priceItems([{ id: source.id, kind: "package", choices: {} }], docs, new Date(), "mashaya"), /PACKAGE_CHOICE_REQUIRED/);
  assert.throws(() => priceItems([{ id: source.id, kind: "package", choices: { ...choices, "beard-finish": "not-valid" } }], docs, new Date(), "mashaya"), /PACKAGE_CHOICE_REQUIRED/);
});

test("rejects an item that is unavailable at the selected branch", () => {
  const docs = new Map([["hair-001", { kind: "service", active: true, branchIds: ["talkha"], nameAr: "قص شعر", nameEn: "Haircut", price: 100, duration: 30 }]]);
  assert.throws(() => priceItems([{ id: "hair-001", kind: "service" }], docs, new Date(), "mashaya"), /ITEM_UNAVAILABLE_AT_BRANCH/);
});

test("validates future appointment and business hours", () => {
  assert.doesNotThrow(() => validateAppointment({ date: "2027-01-02", time: "11:00", duration: 60, openingTime: "11:00", closingTime: "23:00", now: new Date("2027-01-01T10:00:00") }));
  assert.throws(() => validateAppointment({ date: "2027-01-02", time: "22:30", duration: 60, openingTime: "11:00", closingTime: "23:00", now: new Date("2027-01-01T10:00:00") }), /OUTSIDE/);
});

test("same-day validation follows Cairo even when UTC is still on the prior evening", () => {
  assert.throws(() => validateAppointment({ date: "2026-08-26", time: "00:15", duration: 15, openingTime: "00:00", closingTime: "23:59", now: new Date("2026-08-25T21:30:00Z") }), /PAST_APPOINTMENT/);
});

test("payment is idempotent and refund is negative", () => {
  assert.equal(paymentTransition({ paymentStatus: "paid", total: 200 }, "markPaid").changed, false);
  assert.equal(paymentTransition({ paymentStatus: "unpaid", total: 200 }, "markPaid", "cash").ledgerAmount, 200);
  assert.equal(paymentTransition({ paymentStatus: "paid", total: 200 }, "refund", "instapay").ledgerAmount, -200);
});

test("rewards use server settings and minimum spend", () => {
  assert.deepEqual(calculateRewards(200, { loyaltyEnabled: true, pointsRate: .1, cashbackPercent: 5, rewardsMinimumSpend: 100 }), { points: 20, cashback: 10 });
  assert.deepEqual(calculateRewards(50, { loyaltyEnabled: true, pointsRate: 1, cashbackPercent: 10, rewardsMinimumSpend: 100 }), { points: 0, cashback: 0 });
  assert.deepEqual(calculateRewards(200, { pointsRate: 1, cashbackPercent: 10 }), { points: 0, cashback: 0 });
});

test("legacy receipt worker is adapted per service line", () => {
  assert.deepEqual(normalizeLineWorkers([{ id: "cut", staffRequired: true }, { id: "wax", staffRequired: false }], "ali").map(item => item.workerId), ["ali", "none"]);
});

test("cash drawer expected balance follows the financial formula", () => {
  assert.equal(calculateExpectedCash({ openingCash: 500, cashSales: 1200, cashIn: 100, cashOut: 250, cashRefunds: 50 }), 1500);
});
