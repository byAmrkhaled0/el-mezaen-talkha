import assert from "node:assert/strict";
import { initializeApp } from "firebase/app";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

const app = initializeApp({ apiKey: "demo-key", authDomain: "demo-el-mezaen.firebaseapp.com", projectId: "demo-el-mezaen", appId: "demo-app" });
const functions = getFunctions(app, "europe-west1");
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

const catalog = (await httpsCallable(functions, "getCatalog")({})).data;
assert.equal(catalog.services.length, 82);
assert.equal(catalog.packages.length, 6);
assert.equal(catalog.staff.length, 21);

const coupon = (await httpsCallable(functions, "validateCoupon")({ code: "WELCOME10", phone: "01012345678", itemIds: ["hair-001"] })).data;
assert.equal(coupon.valid, true);
assert.equal(coupon.discountAmount, 10);

const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const create = httpsCallable(functions, "createBooking");
const booking = (await create({
  branchId: "talkha",
  items: [{ id: "hair-001", kind: "service", qty: 1 }],
  staffId: "any",
  bookingDate: tomorrow,
  bookingTime: "11:00",
  customer: { firstName: "عميل", lastName: "اختبار", phone: "01012345678", note: "" },
  couponCode: "WELCOME10",
  locale: "ar",
  clientRequestId: crypto.randomUUID()
})).data;
assert.equal(booking.subtotal, 100);
assert.equal(booking.total, 90);
assert.ok(booking.bookingCode.startsWith("MZ-TK-"));

await assert.rejects(() => create({
  branchId: "talkha",
  items: [{ id: "hair-001", kind: "service", qty: 1 }],
  staffId: "any",
  bookingDate: tomorrow,
  bookingTime: "11:00",
  customer: { firstName: "عميل", lastName: "اختبار", phone: "01012345678", note: "" },
  locale: "ar",
  clientRequestId: crypto.randomUUID()
}));

const productBooking = (await create({
  branchId: "talkha",
  items: [{ id: "product-001", kind: "product", qty: 2 }],
  staffId: "any",
  bookingDate: null,
  bookingTime: null,
  customer: { firstName: "عميل", lastName: "منتجات", phone: "01098765432", note: "" },
  locale: "ar",
  clientRequestId: crypto.randomUUID()
})).data;
assert.equal(productBooking.subtotal, 10);
assert.equal(productBooking.total, 10);

console.log("Firebase emulator smoke test passed: catalog, coupon, secure pricing, booking conflict and product-only booking.");
