import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [backend, core, admin, api, app, html, indexes, vercel, robots] = await Promise.all([
  readFile("functions/src/index.js", "utf8"),
  readFile("functions/src/core.js", "utf8"),
  readFile("src/admin.js", "utf8"),
  readFile("src/admin-api.js", "utf8"),
  readFile("src/app.js", "utf8"),
  readFile("admin/index.html", "utf8"),
  readFile("firestore.indexes.json", "utf8"),
  readFile("vercel.json", "utf8"),
  readFile("public/robots.txt", "utf8")
]);

test("production App Check is secure by default and rate limits avoid raw PII keys", () => {
  assert.match(backend, /enforcePublicAppCheck = process\.env\.ENFORCE_APP_CHECK == null \? !runningInEmulator/);
  assert.match(backend, /enforceBookingRateLimits/);
  assert.match(backend, /consumeRateLimit/);
  assert.match(backend, /rateLimits\/\$\{hash\(fingerprint\)\}/);
  assert.match(backend, /PUBLIC_SETTING_KEYS/);
});

test("booking creation and reschedule use request guards and transactional slot locks", () => {
  assert.match(backend, /requestGuards/);
  assert.match(backend, /BOOKING_ALREADY_EXISTS/);
  assert.match(backend, /export const rescheduleBooking/);
  assert.match(backend, /rescheduleGuards/);
  assert.match(backend, /appointmentLocks/);
  assert.match(backend, /SLOT_UNAVAILABLE/);
  assert.match(backend, /workerLeaves/);
});

test("all business date decisions use the Cairo clock", () => {
  assert.match(core, /timeZone: "Africa\/Cairo"/);
  assert.match(backend, /function businessDateParts/);
  assert.match(app, /const cairoDateKey/);
  assert.doesNotMatch(backend, /toISOString\(\)\.slice\(0, ?10\)/);
});

test("POS finalization is idempotent and separates read-only printing", () => {
  assert.match(backend, /posOrderGuards/);
  assert.match(backend, /financialPosted/);
  assert.match(backend, /stockPosted/);
  assert.match(backend, /cashPosted/);
  assert.match(backend, /rewardPosted/);
  assert.match(backend, /receiptNumber: code/);
  assert.match(admin, /طباعة \/ نسخة/);
  assert.match(admin, /resetPosDraft\(\)/);
});

test("refund, void, stock reversal and financial delete controls are server-side", () => {
  assert.match(backend, /refundGuards/);
  assert.match(backend, /voidGuards/);
  assert.match(backend, /refund-reversal/);
  assert.match(backend, /void-reversal/);
  assert.match(backend, /الشيك المالي لا يُحذف/);
  assert.match(backend, /لا يمكن حذف حركة مالية/);
});

test("cash shifts, daily closing and expense links use atomic server operations", () => {
  for (const name of ["openCashShift", "addCashMovement", "closeCashShift", "getCashOperations", "closeBusinessDay"]) assert.match(backend, new RegExp(`export const ${name}\\b`));
  assert.match(backend, /calculateExpectedCash/);
  assert.match(backend, /cashMovementId/);
  assert.match(backend, /DAY_ALREADY_CLOSED|تم إغلاق يوم الفرع/);
  assert.match(api, /closeBusinessDay/);
  assert.match(html, /id="dailyClosing"/);
});

test("cash totals avoid fragile multi-field Firestore aggregate indexes", () => {
  assert.match(backend, /includeCount = true/);
  assert.match(backend, /async function sumCashShifts/);
  assert.match(backend, /sumCashShifts\(allowedBranches, today\)/);
  assert.match(backend, /sumCashShifts\(scoped, businessDate\)/);
  assert.doesNotMatch(backend, /aggregateScoped\("cashShifts"[^\n]+cashRefunds: AggregateField\.sum/);
});

test("cashier snapshot includes bounded recent booking and receipt history", () => {
  assert.match(backend, /const recentQueries = scopedQueries\("bookings"/);
  assert.match(backend, /recentReceipts = recent\.filter\(item => item\.source === "pos"\)\.slice\(0, 60\)/);
  assert.match(backend, /recentBookings = recent\.filter\(item => item\.source !== "pos"\)\.slice\(0, 100\)/);
});

test("multi-worker receipts post per-line revenue and scalable monthly totals", () => {
  assert.match(backend, /workerBreakdown/);
  assert.match(backend, /postWorkerMonthlyRevenue/);
  assert.match(backend, /workerMonthlyTotals/);
  assert.match(admin, /data-pos-worker/);
});

test("daily dashboard, range calendar, leave, no-show, low-stock and Customer 360 are wired", () => {
  assert.match(backend, /AggregateField\.sum/);
  assert.match(backend, /export const getBookingCalendar/);
  assert.match(backend, /export const getCustomer360/);
  assert.match(backend, /noShowCount/);
  assert.match(admin, /customer-warning/);
  assert.match(admin, /lowStockCount/);
  assert.match(html, /id="bookingCalendar"/);
  assert.match(html, /data-new="workerLeaves"/);
});

test("WhatsApp campaigns, signed webhook and controls use idempotency and a kill switch", () => {
  assert.match(backend, /export const previewWhatsappCampaign/);
  assert.match(backend, /whatsappCampaignsEnabled/);
  assert.match(backend, /campaignGuards/);
  assert.match(backend, /campaignRecipients/);
  assert.match(backend, /leaseUntil/);
  assert.match(backend, /PAUSED/);
  assert.match(backend, /CANCELLED/);
  assert.match(backend, /export const whatsappWebhook/);
  assert.match(backend, /x-hub-signature-256/);
  assert.match(backend, /timingSafeEqual/);
  assert.match(backend, /metaMessageId/);
});

test("customer QR can be rotated safely and old opaque tokens are rejected", () => {
  assert.match(backend, /export const rotateCustomerQr/);
  assert.match(backend, /revokedQrTokens/);
  assert.match(backend, /QR_REVOKED/);
  assert.match(admin, /data-rotate-customer-qr/);
});

test("admin pagination, timer cleanup, version guard and private-route SEO stay enforced", () => {
  assert.match(backend, /nextCursor/);
  assert.match(admin, /loadMoreCollection/);
  assert.match(admin, /clearInterval\(dashboardRefreshTimer\)/);
  assert.match(api, /minimumFrontendVersion/);
  assert.match(vercel, /\/booking\/\:path\*/);
  assert.match(robots, /Disallow: \/account\//);
  assert.doesNotThrow(() => JSON.parse(indexes));
});
