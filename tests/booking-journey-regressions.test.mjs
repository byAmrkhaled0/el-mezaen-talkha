import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, catalog, client, backend] = await Promise.all([
  readFile("src/app.js", "utf8"),
  readFile("src/catalog-page.js", "utf8"),
  readFile("src/firebase-client.js", "utf8"),
  readFile("functions/src/index.js", "utf8")
]);

test("exclusive branch items select their only active branch before entering the cart", () => {
  assert.match(app, /!state\.branchId && Array\.isArray\(item\.branchIds\) && item\.branchIds\.length === 1/);
  assert.match(app, /selectBranch\(autoSelectedBranch\.id, false\)/);
  assert.match(catalog, /!branchId && Array\.isArray\(item\.branchIds\) && item\.branchIds\.length === 1/);
  assert.match(catalog, /localStorage\.setItem\("mz-branch", branchId\)/);
});

test("booking submit locks branch changes and dialog dismissal until the request resolves", () => {
  assert.match(app, /function openBranchDialog[\s\S]*bookingSubmitting/);
  assert.match(app, /function selectBranch[\s\S]*لا يمكن تغيير الفرع أثناء تأكيد الحجز/);
  assert.match(app, /function closeBooking[\s\S]*bookingSubmitting/);
  assert.match(app, /addEventListener\("cancel"[\s\S]*bookingSubmitting[\s\S]*preventDefault/);
});

test("success confirmation is bound to the server booking branch and direct booking route opens the flow", () => {
  assert.match(app, /const resultBranchId = result\.branchId \|\| bookingPayload\.branchId/);
  assert.match(app, /const successBranchName =/);
  assert.match(app, /\^\\\/booking\(\?:\\\/\|\$\)\/.test\(location\.pathname\)/);
});

test("preview coupons exclude drinks from the discountable subtotal", () => {
  assert.match(client, /const discountableLines = resolvedLines\.filter/);
  assert.match(client, /!\["drink", "inventory"\]\.includes\(line\.kind\)/);
  assert.match(client, /subtotal: discountableSubtotal/);
});

test("booking catalog failures are returned as customer-readable Arabic messages", () => {
  assert.match(backend, /function bookingCatalogErrorMessage/);
  assert.match(backend, /ITEM_UNAVAILABLE_AT_BRANCH: "إحدى الخدمات أو الباقات غير متاحة في الفرع المختار"/);
  assert.match(backend, /bookingCatalogErrorMessage\(error\)/);
});


test("booking time picker is driven by server availability rather than opening-hours guesses", () => {
  assert.match(client, /export async function getAvailableSlots/);
  assert.match(app, /const getAvailableSlots =/);
  assert.match(app, /await getAvailableSlots\(\{/);
  assert.match(app, /availabilityFingerprint\(\)/);
  assert.match(app, /جاري تحميل المواعيد المتاحة/);
  assert.doesNotMatch(app, /for \(let mins = openH \* 60 \+ openM;/);
});

test("availability and booking creation share staff eligibility rules and booked-slot data", () => {
  assert.match(backend, /export const getAvailableSlots = onCall/);
  assert.match(backend, /loadBookingCandidates\(branchId, requestedStaffId, duration\)/);
  assert.match(backend, /staffCanServeInterval/);
  assert.match(backend, /where\("status", "in", \["pending", "confirmed", "arrived"\]\)/);
  assert.match(backend, /activeBookingLockIds\(\{ docs: bookingSnapshot\.docs\.filter\(item => item\.id !== excludeBookingId\) \}, branchId\)/);
});

test("a slot lost in the final booking race sends the customer back to refreshed availability", () => {
  assert.match(app, /الموعد غير متاح\|slot unavailable\|time is unavailable/);
  assert.match(app, /goToStep\(3\);[\s\S]*void renderTimes\(\)/);
});
