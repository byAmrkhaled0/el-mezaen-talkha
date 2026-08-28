import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { AggregateField, FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";
import { getFunctions as getAdminFunctions } from "firebase-admin/functions";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { defineSecret } from "firebase-functions/params";
import { calculateCoupon, calculateExpectedCash, calculatePayroll, calculateRevenueBreakdown, calculateRewards, calculateServiceTargetProgress, createSlotKeys, isDrinkAvailableAtBranch, isRecentAuthentication, minutes, nextMonthKey, normalizeExpenseInput, normalizeLineWorkers, normalizePhone, paymentTransition, priceItems, serviceTargetDocumentId, serviceTargetEntries, validateAppointment, validateAttendanceLocation } from "./core.js";

initializeApp();
const db = getFirestore();
const region = "europe-west1";
const API_VERSION = "2026-08-27";
const MIN_FRONTEND_VERSION = "2.0.0";
const whatsappAccessToken = defineSecret("WHATSAPP_ACCESS_TOKEN");
const whatsappPhoneNumberId = defineSecret("WHATSAPP_PHONE_NUMBER_ID");
const whatsappWebhookVerifyToken = defineSecret("WHATSAPP_WEBHOOK_VERIFY_TOKEN");
const whatsappAppSecret = defineSecret("WHATSAPP_APP_SECRET");
const runningInEmulator = process.env.FUNCTIONS_EMULATOR === "true" || Boolean(process.env.FIREBASE_EMULATOR_HUB);
// Production is secure by default. Local/emulator bypass is explicit and never inferred from missing config.
const enforcePublicAppCheck = process.env.ENFORCE_APP_CHECK == null ? !runningInEmulator : process.env.ENFORCE_APP_CHECK === "true";
const publicOptions = { region, cors: true, enforceAppCheck: enforcePublicAppCheck, memory: "512MiB", cpu: 1, concurrency: 80, maxInstances: 100, timeoutSeconds: 30 };
const catalogOptions = { ...publicOptions, minInstances: process.env.KEEP_CATALOG_WARM === "true" ? 1 : 0 };
const adminOptions = { region, cors: true, enforceAppCheck: enforcePublicAppCheck, memory: "512MiB", cpu: 1, concurrency: 40, maxInstances: 50, timeoutSeconds: 30 };
const whatsappOptions = { ...adminOptions, secrets: [whatsappAccessToken, whatsappPhoneNumberId] };
const whatsappWebhookOptions = { region, cors: false, memory: "256MiB", maxInstances: 20, timeoutSeconds: 15, secrets: [whatsappWebhookVerifyToken, whatsappAppSecret] };
const PUBLIC_COLLECTIONS = ["branches", "categories", "services", "packages", "staff", "offers", "content", "faqs", "translations", "reviews"];
const ADMIN_COLLECTIONS = ["branches", "categories", "services", "packages", "staff", "workerLeaves", "offers", "coupons", "content", "faqs", "holidays", "translations", "settings", "inventoryItems", "drinks", "reviews"];
const ADMIN_ROLES = ["admin", "manager", "cashier", "worker"];
const ALL_PERMISSIONS = ["dashboard", "pos", "bookings", "attendance", "tasks", "revenue", "expenses", "inventory", "drinks", "payroll", "services", "packages", "offers", "coupons", "staff", "customers", "rewards", "campaigns", "reviews", "schedule", "gallery", "results", "hairMedia", "celebrities", "posts", "faqs", "settings", "activity", "users"];
const ROLE_DEFAULT_PERMISSIONS = {
  manager: ALL_PERMISSIONS.filter(value => !["users", "activity"].includes(value)),
  cashier: ["dashboard", "pos", "bookings", "attendance", "tasks", "customers"],
  worker: ["attendance", "tasks"]
};
const COLLECTION_PERMISSIONS = { branches: "settings", categories: "services", services: "services", packages: "packages", staff: "staff", workerLeaves: "schedule", offers: "offers", coupons: "coupons", content: "posts", faqs: "faqs", holidays: "schedule", translations: "settings", settings: "settings", inventoryItems: "inventory", drinks: "drinks", reviews: "reviews", customers: "customers", walletTransactions: "rewards", campaigns: "campaigns", activityLogs: "activity", users: "users", revenueLedger: "revenue", expenses: "expenses", payrollPayments: "payroll", cashShifts: "pos", cashMovements: "pos", dailyClosings: "revenue" };
const EXPENSE_CATEGORIES = ["inventory", "electricity", "water", "rent", "salary", "maintenance", "tools", "marketing", "other"];
const INVENTORY_CATEGORIES = ["product", "supply"];
const DRINK_TYPES = ["hot", "cold", "soft-drink", "other"];
const PUBLIC_SETTING_KEYS = ["businessNameAr", "businessNameEn", "openingTime", "closingTime", "slotMinutes", "facebook", "instagram", "tiktok", "aboutAr", "aboutEn", "currency"];
const CATALOG_CACHE_MS = Math.max(15_000, Math.min(300_000, Number(process.env.CATALOG_CACHE_MS || 60_000)));
let catalogCache = null;
let catalogCacheExpiresAt = 0;
let catalogLoadPromise = null;
let catalogCacheRevision = "";

export const health = onRequest({ region, cors: false, memory: "256MiB", maxInstances: 10, timeoutSeconds: 10 }, async (_request, response) => {
  try { await db.doc("settings/public").get(); response.set("Cache-Control", "no-store").status(200).json({ ready: true, apiVersion: API_VERSION, minimumFrontendVersion: MIN_FRONTEND_VERSION, version: process.env.K_REVISION || "local", environment: process.env.GCLOUD_PROJECT ? "production" : "local", appCheckEnforced: enforcePublicAppCheck, firestore: "ready", requiredConfigReady: true }); }
  catch { response.set("Cache-Control", "no-store").status(503).json({ ready: false, apiVersion: API_VERSION, version: process.env.K_REVISION || "local", firestore: "unavailable", requiredConfigReady: false }); }
});

const cleanDoc = snapshot => ({ id: snapshot.id, ...snapshot.data(), startAt: toIso(snapshot.data().startAt), endAt: toIso(snapshot.data().endAt), createdAt: toIso(snapshot.data().createdAt), updatedAt: toIso(snapshot.data().updatedAt), firstVisitAt: toIso(snapshot.data().firstVisitAt), lastVisitAt: toIso(snapshot.data().lastVisitAt), lastBookingAt: toIso(snapshot.data().lastBookingAt), paidAt: toIso(snapshot.data().paidAt), refundedAt: toIso(snapshot.data().refundedAt), finalizedAt: toIso(snapshot.data().finalizedAt), voidedAt: toIso(snapshot.data().voidedAt), openedAt: toIso(snapshot.data().openedAt), closedAt: toIso(snapshot.data().closedAt), checkInAt: toIso(snapshot.data().checkInAt), checkOutAt: toIso(snapshot.data().checkOutAt), dueAt: toIso(snapshot.data().dueAt), readAt: toIso(snapshot.data().readAt), completedAt: toIso(snapshot.data().completedAt) });
const toIso = value => value?.toDate ? value.toDate().toISOString() : value || null;
const hash = value => createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
const bookingCode = branchCode => `MZ-${String(branchCode || "BR").replace(/[^A-Z0-9]/g, "").slice(0, 3) || "BR"}-${businessDateParts().dateKey.replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;
const structuredLog = (event, fields = {}) => console.info(JSON.stringify({ severity: "INFO", event, ...fields }));

function businessDateParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, month: `${parts.year}-${parts.month}` };
}

function businessDateExpiry(dateKey, daysAfter = 7) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + daysAfter);
  return Timestamp.fromDate(date);
}

function postWorkerMonthlyRevenue(transaction, { workerId, branchId, dateKey, amount, now }) {
  if (!workerId || workerId === "none" || !Number.isFinite(Number(amount)) || Number(amount) === 0) return;
  const month = String(dateKey || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  transaction.set(db.doc(`workerMonthlyTotals/${month}_${workerId}`), {
    month,
    staffId: workerId,
    branchIds: FieldValue.arrayUnion(branchId),
    revenue: FieldValue.increment(Number(amount)),
    updatedAt: now
  }, { merge: true });
}

function postServiceMonthlyTargets(transaction, { items, branchId, dateKey, direction = 1, now }) {
  const month = String(dateKey || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month) || !/^[a-z0-9-]{2,40}$/.test(String(branchId || ""))) return [];
  const entries = serviceTargetEntries(items);
  for (const entry of entries) {
    const id = serviceTargetDocumentId({ month, branchId, kind: entry.kind, itemId: entry.itemId });
    transaction.set(db.doc(`serviceTargets/${id}`), {
      month,
      branchId,
      itemId: entry.itemId,
      kind: entry.kind,
      nameAr: entry.nameAr,
      nameEn: entry.nameEn,
      achievedCount: FieldValue.increment(entry.count * (direction < 0 ? -1 : 1)),
      updatedAt: now
    }, { merge: true });
  }
  return entries;
}

function normalizeDrinkOptions(value) {
  const options = (Array.isArray(value) ? value : [value]).flatMap(item => String(item || "").split(/[،,]/));
  return [...new Set(options.map(item => sanitizeText(item, 40)).filter(Boolean))].slice(0, 12);
}

function normalizeChoiceGroups(value) {
  let groups = value;
  if (typeof groups === "string") {
    try { groups = JSON.parse(groups); }
    catch { throw new HttpsError("invalid-argument", "صيغة اختيارات الباقة غير صحيحة"); }
  }
  if (!Array.isArray(groups)) return [];
  const seenGroups = new Set();
  return groups.slice(0, 10).map(group => {
    const id = sanitizeText(group?.id, 40).toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(id) || seenGroups.has(id)) throw new HttpsError("invalid-argument", "معرّف اختيار الباقة مكرر أو غير صالح");
    seenGroups.add(id);
    const seenOptions = new Set();
    const options = (Array.isArray(group?.options) ? group.options : []).slice(0, 12).map(entry => {
      const optionId = sanitizeText(entry?.id, 40).toLowerCase();
      const labelAr = sanitizeText(entry?.labelAr, 80);
      const serviceId = sanitizeText(entry?.serviceId, 100);
      if (!/^[a-z0-9-]{1,40}$/.test(optionId) || seenOptions.has(optionId) || !labelAr || !serviceId) throw new HttpsError("invalid-argument", "أحد بدائل الباقة غير صالح");
      seenOptions.add(optionId);
      return { id: optionId, labelAr, labelEn: sanitizeText(entry?.labelEn || labelAr, 80), serviceId };
    });
    if (options.length < 2) throw new HttpsError("invalid-argument", "كل مجموعة بدائل يجب أن تحتوي اختيارين على الأقل");
    return { id, labelAr: sanitizeText(group?.labelAr || id, 80), labelEn: sanitizeText(group?.labelEn || group?.labelAr || id, 80), required: group?.required !== false, minSelections: 1, maxSelections: 1, options };
  });
}

async function validatePackageReferences(record) {
  const branchIds = Array.isArray(record.branchIds) ? record.branchIds : [];
  if (branchIds.some(id => !/^[a-z0-9-]{2,40}$/.test(String(id)))) throw new HttpsError("invalid-argument", "نطاق فروع الباقة غير صحيح");
  if (!sanitizeText(record.nameAr, 100) || !Number.isFinite(Number(record.price)) || Number(record.price) < 0 || !Number.isFinite(Number(record.duration)) || Number(record.duration) <= 0) throw new HttpsError("invalid-argument", "اسم وسعر ومدة الباقة بيانات مطلوبة");
  if (Number(record.originalPrice || record.price) < Number(record.price)) throw new HttpsError("invalid-argument", "السعر قبل الخصم يجب ألا يقل عن السعر الحالي");
  const ids = [...new Set([...(Array.isArray(record.includedServiceIds) ? record.includedServiceIds : []), ...(Array.isArray(record.choiceGroups) ? record.choiceGroups.flatMap(group => group.options || []).map(option => option.serviceId) : [])].map(value => sanitizeText(value, 100)).filter(Boolean))];
  if (!ids.length) return;
  const snapshots = await db.getAll(...ids.map(id => db.doc(`services/${id}`)));
  const missing = snapshots.filter(snapshot => !snapshot.exists || snapshot.data()?.active === false).map(snapshot => snapshot.id);
  if (missing.length) throw new HttpsError("failed-precondition", `خدمات الباقة غير متاحة: ${missing.join(", ")}`);
}

function requestFingerprint(request, extra = "") {
  const forwarded = request.rawRequest?.headers?.["x-forwarded-for"];
  const ip = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || request.rawRequest?.ip || "unknown").split(",")[0].trim();
  return hash(`${ip}|${extra}`);
}

async function enforceRateLimit(request, action, limit, windowMs, extra = "") {
  const bucket = Math.floor(Date.now() / windowMs);
  return consumeRateLimit(`${action}|${requestFingerprint(request, extra)}|${bucket}`, action, limit, windowMs, bucket);
}

async function consumeRateLimit(fingerprint, action, limit, windowMs, bucket = Math.floor(Date.now() / windowMs)) {
  const ref = db.doc(`rateLimits/${hash(fingerprint)}`);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const count = Number(snapshot.data()?.count || 0);
    if (count >= limit) throw new HttpsError("resource-exhausted", "محاولات كثيرة، حاول مرة أخرى لاحقًا");
    transaction.set(ref, { action, count: count + 1, expiresAt: Timestamp.fromMillis((bucket + 2) * windowMs), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

async function enforceBookingRateLimits(request, phone) {
  const windowMs = 15 * 60 * 1000;
  const bucket = Math.floor(Date.now() / windowMs);
  await consumeRateLimit(`booking_ip|${requestFingerprint(request)}|${bucket}`, "booking_ip", 20, windowMs, bucket);
  await consumeRateLimit(`booking_phone|${hash(phone)}|${bucket}`, "booking_phone", 8, windowMs, bucket);
  await consumeRateLimit(`booking_ip_phone|${requestFingerprint(request, phone)}|${bucket}`, "booking_ip_phone", 5, windowMs, bucket);
}

function requireRole(request, roles = ADMIN_ROLES) {
  const role = request.auth?.token?.role;
  if (!request.auth || !roles.includes(role)) throw new HttpsError("permission-denied", "غير مصرح بالدخول");
  return role;
}

function permissionsFor(request) {
  const role = requireRole(request);
  if (role === "admin") return new Set(ALL_PERMISSIONS);
  const claimed = Array.isArray(request.auth?.token?.permissions) ? request.auth.token.permissions : ROLE_DEFAULT_PERMISSIONS[role] || [];
  const permitted = role === "worker" ? ["attendance", "tasks"] : ALL_PERMISSIONS;
  return new Set(claimed.filter(value => permitted.includes(value)));
}

function hasPermission(request, permission) { return permissionsFor(request).has(permission); }
function contentPermission(type) { return type === "gallery" ? "gallery" : type === "result" ? "results" : type === "hair-system" ? "hairMedia" : type === "celebrity" ? "celebrities" : "posts"; }
function branchesFor(request) {
  const role = requireRole(request);
  if (role === "admin") return [];
  const branches = [...new Set((Array.isArray(request.auth?.token?.branchIds) ? request.auth.token.branchIds : []).map(value => sanitizeText(value, 40).toLowerCase()).filter(value => /^[a-z0-9-]{2,40}$/.test(value)))];
  if (!branches.length) throw new HttpsError("permission-denied", "هذا الحساب غير مرتبط بفرع؛ اطلب من الأدمن تحديث صلاحياته ثم سجّل الدخول من جديد");
  return branches;
}
function canAccessBranch(request, branchId) {
  if (request.auth?.token?.role === "admin") return true;
  const allowed = branchesFor(request);
  return Boolean(branchId && allowed.includes(String(branchId).toLowerCase()));
}
function requireBranchAccess(request, branchId) {
  if (!canAccessBranch(request, branchId)) throw new HttpsError("permission-denied", "هذا الحساب غير مصرح له بهذا الفرع");
}
function itemInAllowedBranch(item, allowedBranches) {
  if (!allowedBranches.length) return true;
  if (item.branchId) return item.branchId === "all" || allowedBranches.includes(String(item.branchId).toLowerCase());
  if (item.lastBranchId) return allowedBranches.includes(String(item.lastBranchId).toLowerCase());
  if (Array.isArray(item.branchIds) && item.branchIds.length) return item.branchIds.some(value => allowedBranches.includes(String(value).toLowerCase()));
  return false;
}

function invalidateCatalogCache() {
  catalogCache = null;
  catalogCacheExpiresAt = 0;
  catalogCacheRevision = "";
}

async function readCatalogRevision() {
  const snapshot = await db.doc("settings/catalogRevision").get();
  return snapshot.exists ? String(snapshot.data()?.version || snapshot.updateTime?.toMillis() || "") : "initial";
}

async function markCatalogChanged() {
  invalidateCatalogCache();
  await db.doc("settings/catalogRevision").set({ version: `${Date.now()}-${randomBytes(6).toString("hex")}`, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
function requirePermission(request, permission) {
  const role = requireRole(request);
  if (role !== "admin" && !permissionsFor(request).has(permission)) throw new HttpsError("permission-denied", "لا تملك صلاحية هذا القسم");
  return role;
}

function claimedStaffId(request) {
  return sanitizeText(request.auth?.token?.staffId, 100);
}

async function linkedStaffId(request) {
  const claimed = claimedStaffId(request);
  if (claimed) return claimed;
  const profile = await db.doc(`users/${request.auth.uid}`).get();
  return sanitizeText(profile.data()?.staffId, 100);
}

async function sendWorkerPush(staffId, { title, body, type, entityId }) {
  const users = await db.collection("users").where("staffId", "==", staffId).limit(5).get();
  const tokenSnapshots = await Promise.all(users.docs.map(user => db.collection("pushTokens").where("uid", "==", user.id).limit(20).get()));
  const tokens = [...new Set(tokenSnapshots.flatMap(snapshot => snapshot.docs.map(document => document.data()?.token).filter(Boolean)))];
  if (!tokens.length) return { attempted: 0, sent: 0 };
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: { fcmOptions: { link: "/admin/" }, notification: { icon: "/assets/el-mezaen-logo.jpeg", badge: "/assets/el-mezaen-logo.jpeg", tag: `${type}_${entityId}`, renotify: true } },
    data: { type, entityId: String(entityId || ""), staffId }
  });
  const deletes = [];
  response.responses.forEach((result, index) => {
    if (!result.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(result.error?.code)) deletes.push(db.doc(`pushTokens/${hash(tokens[index])}`).delete());
  });
  await Promise.all(deletes);
  return { attempted: tokens.length, sent: response.successCount };
}

function requireRecentAdmin(request) {
  requireRole(request, ["admin"]);
  if (!isRecentAuthentication(request.auth?.token?.auth_time)) throw new HttpsError("unauthenticated", "أعد إدخال باسورد الأدمن لتأكيد الحذف");
}

function sanitizeText(value, max = 200) { return String(value || "").trim().slice(0, max); }

function customerQrToken() { return `mzc_${randomBytes(24).toString("base64url")}`; }

async function applyRewards(transaction, { booking, customerRef, settings, now, reverse = false, redemption = null }) {
  if (!booking?.code || !customerRef) return;
  const guardRef = db.doc(`rewardGuards/${booking.code}`);
  const guard = await transaction.get(guardRef);
  const reward = guard.exists ? guard.data() : calculateRewards(booking.total, settings);
  if (!reverse && guard.exists) return;
  if (reverse && (!guard.exists || reward.reversed)) return;
  const points = Number(reward.points || 0);
  const cashback = Number(reward.cashback || 0);
  const redeemPoints = reverse ? -Math.max(0, Number(reward.redeemedPoints || 0)) : Math.max(0, Number(redemption?.points || 0)); const redeemCashback = reverse ? -Math.max(0, Number(reward.redeemedCashback || 0)) : Math.max(0, Number(redemption?.cashback || 0));
  if (!points && !cashback && !redeemPoints && !redeemCashback) {
    if (!reverse) transaction.create(guardRef, { bookingId: booking.code, customerId: customerRef.id, points: 0, cashback: 0, createdAt: now });
    return;
  }
  const factor = reverse ? -1 : 1;
  const transactionRef = db.doc(`walletTransactions/${booking.code}_${reverse ? "reversal" : "earned"}`);
  transaction.set(customerRef, { pointsBalance: FieldValue.increment(points * factor - redeemPoints), cashbackBalance: FieldValue.increment(cashback * factor - redeemCashback), walletUpdatedAt: now }, { merge: true });
  transaction.create(transactionRef, { customerId: customerRef.id, bookingId: booking.code, type: reverse ? "REFUND_REVERSAL" : "REWARDS_EARNED", points: points * factor, cashback: cashback * factor, createdAt: now });
  if (!reverse && (redeemPoints || redeemCashback)) transaction.create(db.doc(`walletTransactions/${booking.code}_redeemed`), { customerId: customerRef.id, bookingId: booking.code, type: "WALLET_REDEEMED", points: -redeemPoints, cashback: -redeemCashback, redemptionValue: Number(redemption.value || 0), createdAt: now });
  if (reverse) transaction.update(guardRef, { reversed: true, reversedAt: now });
  else transaction.create(guardRef, { bookingId: booking.code, customerId: customerRef.id, points, cashback, redeemedPoints: redeemPoints, redeemedCashback: redeemCashback, redemptionValue: Number(redemption?.value || 0), reversed: false, createdAt: now });
}

function validatePayloadSize(value, maxBytes = 32 * 1024) {
  let bytes = 0;
  try { bytes = Buffer.byteLength(JSON.stringify(value || {}), "utf8"); }
  catch { throw new HttpsError("invalid-argument", "بيانات الحفظ غير صالحة"); }
  if (bytes > maxBytes) throw new HttpsError("invalid-argument", "حجم البيانات أكبر من المسموح");
}

function managedStoragePath(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.hostname === "firebasestorage.googleapis.com") {
      const match = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
      if (!match || decodeURIComponent(match[1]) !== getStorage().bucket().name) return "";
      return decodeURIComponent(match[2]);
    }
    if (url.hostname === "storage.googleapis.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.shift() !== getStorage().bucket().name) return "";
      return decodeURIComponent(parts.join("/"));
    }
  } catch { return ""; }
  return "";
}

async function deleteManagedMedia(record, except = new Set()) {
  const paths = [...new Set([record?.imageUrl, record?.videoUrl].map(managedStoragePath).filter(path => path && !except.has(path)))];
  await Promise.all(paths.map(path => getStorage().bucket().file(path).delete({ ignoreNotFound: true }).catch(error => console.warn("Managed media cleanup failed", { path, code: error.code }))));
}

async function readSettings() {
  const snapshot = await db.doc("settings/public").get();
  return { openingTime: "11:00", closingTime: "23:00", slotMinutes: 15, loyaltyEnabled: false, walletRedemptionEnabled: false, whatsappCampaignsEnabled: false, whatsappReceiptsEnabled: false, cashDrawerEnabled: false, ...(snapshot.exists ? snapshot.data() : {}) };
}

async function readBranch(value) {
  const branchId = sanitizeText(value, 40).toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(branchId)) throw new HttpsError("invalid-argument", "اختر فرعًا صحيحًا");
  const snapshot = await db.doc(`branches/${branchId}`).get();
  if (!snapshot.exists || snapshot.data().active === false) throw new HttpsError("failed-precondition", "الفرع غير متاح للحجز حاليًا");
  return cleanDoc(snapshot);
}

async function loadCatalog() {
  const [results, drinksSnapshot, publicSettings] = await Promise.all([
    Promise.all(PUBLIC_COLLECTIONS.map(name => name === "reviews" ? db.collection(name).where("active", "==", true).orderBy("createdAt", "desc").limit(3).get() : db.collection(name).where("active", "==", true).limit(500).get())),
    db.collection("drinks").limit(200).get(),
    readSettings()
  ]);
  const payload = Object.fromEntries(PUBLIC_COLLECTIONS.map((name, index) => [name, results[index].docs.map(cleanDoc).filter(item => item.catalogVisible !== false).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))]));
  payload.reviews = (payload.reviews || []).map(item => ({ id: item.id, name: sanitizeText(item.name, 60), rating: Math.max(1, Math.min(5, Number(item.rating || 5))), comment: sanitizeText(item.comment, 500), featured: item.featured === true, verified: item.verified === true, adminReply: sanitizeText(item.adminReply, 500), createdAt: item.createdAt }));
  payload.drinks = drinksSnapshot.docs.flatMap(snapshot => {
    const item = snapshot.data();
    const price = Number(item.price || 0);
    if (item.active === false || !Number.isFinite(price) || price < 0 || !item.branchId) return [];
    const nameAr = sanitizeText(item.nameAr, 100);
    if (!nameAr) return [];
    const drinkBranch = sanitizeText(item.branchId, 40).toLowerCase();
    return [{ id: snapshot.id, nameAr, nameEn: sanitizeText(item.nameEn || item.nameAr, 100), type: DRINK_TYPES.includes(item.type) ? item.type : "other", price, drinkOptions: normalizeDrinkOptions(item.drinkOptions), branchId: drinkBranch, branchIds: drinkBranch === "all" ? [] : [drinkBranch], maxQty: 20, active: true, sortOrder: Number(item.sortOrder || 0) }];
  }).sort((a, b) => a.sortOrder - b.sortOrder);
  payload.settings = Object.fromEntries(PUBLIC_SETTING_KEYS.filter(key => publicSettings[key] != null).map(key => [key, publicSettings[key]]));
  payload._meta = { apiVersion: API_VERSION, minimumFrontendVersion: MIN_FRONTEND_VERSION };
  return payload;
}

export const getCatalog = onCall(catalogOptions, async () => {
  const revision = await readCatalogRevision();
  if (catalogCache && catalogCacheRevision === revision && Date.now() < catalogCacheExpiresAt) return catalogCache;
  catalogLoadPromise ||= loadCatalog().then(payload => {
    catalogCache = payload;
    catalogCacheRevision = revision;
    catalogCacheExpiresAt = Date.now() + CATALOG_CACHE_MS;
    return payload;
  }).finally(() => { catalogLoadPromise = null; });
  return await catalogLoadPromise;
});

export const getPublishedReviews = onCall(publicOptions, async request => {
  await enforceRateLimit(request, "published-reviews", 120, 10 * 60 * 1000);
  const pageSize = Math.max(6, Math.min(24, Math.floor(Number(request.data?.pageSize || 12))));
  const cursorId = sanitizeText(request.data?.cursor || "", 100);
  if (cursorId && !/^[A-Za-z0-9_-]{1,100}$/.test(cursorId)) throw new HttpsError("invalid-argument", "مؤشر الصفحة غير صحيح");
  let query = db.collection("reviews").where("active", "==", true).orderBy("createdAt", "desc");
  if (cursorId) {
    const cursor = await db.doc(`reviews/${cursorId}`).get();
    if (!cursor.exists || cursor.data()?.active !== true) throw new HttpsError("invalid-argument", "مؤشر الصفحة غير صحيح");
    query = query.startAfter(cursor);
  }
  const snapshot = await query.limit(pageSize + 1).get();
  const documents = snapshot.docs.slice(0, pageSize);
  const items = documents.map(cleanDoc).map(item => ({ id: item.id, name: sanitizeText(item.name, 60), rating: Math.max(1, Math.min(5, Number(item.rating || 5))), comment: sanitizeText(item.comment, 500), featured: item.featured === true, verified: item.verified === true, adminReply: sanitizeText(item.adminReply, 500), createdAt: item.createdAt }));
  return { items, nextCursor: snapshot.size > pageSize ? documents.at(-1)?.id || null : null, _meta: { apiVersion: API_VERSION, minimumFrontendVersion: MIN_FRONTEND_VERSION } };
});

async function fetchPricedItems(lines, branchId = "") {
  const refs = lines.map(line => {
    const collection = line.kind === "package" ? "packages" : line.kind === "offer" ? "offers" : "services";
    return db.collection(collection).doc(String(line.id));
  });
  const snapshots = await db.getAll(...refs);
  const map = new Map(snapshots.flatMap((item, index) => {
    if (!item.exists) return [];
    const requestedKind = lines[index].kind;
    const data = item.data();
    return [[item.id, { ...data, id: item.id, kind: requestedKind === "product" ? "product" : requestedKind }]];
  }));
  const priced = priceItems(lines, map, new Date(), branchId);
  const linkedServiceIds = [...new Set(priced.filter(item => ["package", "offer"].includes(item.kind)).flatMap(item => item.serviceIds || []))];
  if (linkedServiceIds.length > 120) throw new Error("TOO_MANY_LINKED_SERVICES");
  const linkedSnapshots = [];
  for (let index = 0; index < linkedServiceIds.length; index += 100) {
    const chunk = linkedServiceIds.slice(index, index + 100);
    linkedSnapshots.push(...await db.getAll(...chunk.map(id => db.doc(`services/${id}`))));
  }
  const unavailable = linkedSnapshots.filter(snapshot => {
    if (!snapshot.exists || snapshot.data()?.active === false || snapshot.data()?.catalogVisible === false) return true;
    const serviceBranches = snapshot.data()?.branchIds;
    return Boolean(branchId && Array.isArray(serviceBranches) && serviceBranches.length && !serviceBranches.includes(branchId));
  }).map(snapshot => snapshot.id);
  if (unavailable.length) throw new Error(`PACKAGE_SERVICE_UNAVAILABLE:${unavailable.join(",")}`);
  return priced;
}

function priceDrinkSnapshots(snapshots, lines, branchId) {
  return snapshots.map((snapshot, index) => {
    const source = snapshot.data() || {};
    const line = lines[index];
    if (!snapshot.exists || !isDrinkAvailableAtBranch(source, branchId)) throw new Error("DRINK_UNAVAILABLE");
    const nameAr = sanitizeText(source.nameAr, 100);
    if (!nameAr) throw new Error("DRINK_UNAVAILABLE");
    const unitPrice = Number(source.price || 0);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("DRINK_PRICE");
    const drinkOptions = normalizeDrinkOptions(source.drinkOptions);
    const option = line.option || drinkOptions[0] || "";
    if (drinkOptions.length && !drinkOptions.includes(option)) throw new Error("DRINK_OPTION");
    const qty = Math.max(1, Math.min(20, Math.floor(Number(line.qty || 1))));
    return { id: snapshot.id, kind: "drink", category: "drink", type: DRINK_TYPES.includes(source.type) ? source.type : "other", nameAr, nameEn: sanitizeText(source.nameEn || nameAr, 100), option: option || null, qty, unitPrice, lineTotal: unitPrice * qty, duration: 0, staffRequired: false, ref: snapshot.ref };
  });
}

export const validateCoupon = onCall(publicOptions, async request => {
  await enforceRateLimit(request, "coupon", 30, 10 * 60 * 1000);
  const code = sanitizeText(request.data?.code, 30).toUpperCase();
  const phone = request.data?.phone ? normalizePhone(request.data.phone) : "01000000000";
  const itemIds = Array.isArray(request.data?.itemIds) ? request.data.itemIds.map(String).slice(0, 30) : [];
  if (!code || !itemIds.length) return { valid: false };
  const branchId = sanitizeText(request.data?.branchId, 40).toLowerCase();
  const [couponSnap, usageSnap] = await Promise.all([db.doc(`coupons/${code}`).get(), db.doc(`couponUsage/${code}_${hash(phone)}`).get()]);
  if (!couponSnap.exists) return { valid: false };
  const coupon = couponSnap.data();
  if (branchId && Array.isArray(coupon.branchIds) && coupon.branchIds.length && !coupon.branchIds.includes(branchId)) return { valid: false };
  const prices = await fetchPricedItems(itemIds.map(id => {
    const prefix = id.split("-")[0];
    return { id, kind: prefix === "package" ? "package" : prefix === "offer" ? "offer" : prefix === "product" ? "product" : "service", qty: 1 };
  }), branchId);
  const result = calculateCoupon(coupon, prices, { usageCount: Number(coupon.usageCount || 0), phoneUsageCount: Number(usageSnap.data()?.count || 0) });
  return result.valid ? { valid: true, code, discountType: coupon.type, discountValue: coupon.value, discountAmount: result.discountAmount, discountPercent: result.discountPercent } : { valid: false };
});

export const createBooking = onCall({ ...publicOptions, timeoutSeconds: 30 }, async request => {
  const data = request.data || {};
  const branch = await readBranch(data.branchId);
  const branchId = branch.id;
  const customer = {
    firstName: sanitizeText(data.customer?.firstName, 50),
    lastName: sanitizeText(data.customer?.lastName, 50),
    phone: normalizePhone(data.customer?.phone),
    note: sanitizeText(data.customer?.note, 500)
  };
  await enforceBookingRateLimits(request, customer.phone);
  if (!customer.firstName || !customer.lastName) throw new HttpsError("invalid-argument", "بيانات العميل غير مكتملة");
  const clientRequestId = sanitizeText(data.clientRequestId, 80);
  if (!clientRequestId) throw new HttpsError("invalid-argument", "معرف الطلب مفقود");
  const rawLines = Array.isArray(data.items) ? data.items.slice(0, 30).map(line => ({
    id: sanitizeText(line?.id, 100),
    kind: sanitizeText(line?.kind, 20),
    qty: Math.max(1, Math.min(20, Math.floor(Number(line?.qty || 1)))),
    option: sanitizeText(line?.option, 40),
    choices: line?.choices && typeof line.choices === "object" && !Array.isArray(line.choices) ? Object.fromEntries(Object.entries(line.choices).slice(0, 10).map(([key, value]) => [sanitizeText(key, 40).toLowerCase(), sanitizeText(value, 40).toLowerCase()])) : {}
  })) : [];
  if (!rawLines.length || rawLines.some(line => !line.id || !["service", "package", "offer", "product", "inventory", "drink"].includes(line.kind))) throw new HttpsError("invalid-argument", "عناصر الحجز غير صحيحة");
  if (new Set(rawLines.map(line => `${line.kind}:${line.id}`)).size !== rawLines.length) throw new HttpsError("invalid-argument", "لا تكرر نفس العنصر في الحجز");
  const catalogLines = rawLines.filter(line => !["inventory", "drink"].includes(line.kind));
  const inventoryLines = rawLines.filter(line => line.kind === "inventory");
  const drinkLines = rawLines.filter(line => line.kind === "drink");
  let pricedItems = [];
  if (catalogLines.length) {
    try { pricedItems = await fetchPricedItems(catalogLines, branchId); }
    catch (error) { throw new HttpsError("failed-precondition", error.message); }
  }
  const appointmentItems = pricedItems.filter(item => item.staffRequired);
  const duration = appointmentItems.reduce((sum, item) => sum + item.duration, 0);
  const productOnly = appointmentItems.length === 0;
  const settings = { ...await readSettings(), ...branch };
  if (!productOnly) {
    try { validateAppointment({ date: data.bookingDate, time: data.bookingTime, duration, openingTime: settings.openingTime, closingTime: settings.closingTime }); }
    catch (error) { throw new HttpsError("failed-precondition", error.message); }
    const [branchHoliday, globalHoliday] = await Promise.all([db.doc(`holidays/${branchId}_${data.bookingDate}`).get(), db.doc(`holidays/${data.bookingDate}`).get()]);
    if ([branchHoliday, globalHoliday].some(item => item.exists && item.data()?.closed !== false)) throw new HttpsError("failed-precondition", "الفرع مغلق في هذا اليوم");
  }
  const requestedStaffId = productOnly ? "none" : sanitizeText(data.staffId || "any", 80);
  let candidates = [];
  if (!productOnly) {
    if (requestedStaffId === "any") {
      const maxCandidates = Math.max(1, Math.min(21, Math.floor(450 / Math.ceil(Math.max(5, duration) / 5))));
      const snapshot = await db.collection("staff").where("active", "==", true).limit(50).get();
      candidates = snapshot.docs.map(cleanDoc).filter(member => member.available !== false && Array.isArray(member.branchIds) && member.branchIds.includes(branchId)).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)).slice(0, maxCandidates);
    } else {
      const snapshot = await db.doc(`staff/${requestedStaffId}`).get();
      if (snapshot.exists && snapshot.data().active !== false && snapshot.data().available !== false) candidates = [cleanDoc(snapshot)].filter(member => Array.isArray(member.branchIds) && member.branchIds.includes(branchId));
    }
    const leaveSnapshot = await db.collection("workerLeaves").where("dateKey", "==", data.bookingDate).where("active", "==", true).limit(100).get();
    const leaves = leaveSnapshot.docs.map(cleanDoc).filter(item => !item.branchId || item.branchId === "all" || item.branchId === branchId);
    const day = new Date(`${data.bookingDate}T12:00:00Z`).getUTCDay();
    const appointmentStart = minutes(data.bookingTime);
    const appointmentEnd = appointmentStart + duration;
    const requestedServiceIds = [...new Set(appointmentItems.flatMap(item => Array.isArray(item.serviceIds) ? item.serviceIds : item.kind === "service" ? [item.id] : []))];
    candidates = candidates.filter(member => {
      if (Array.isArray(member.workDays) && !member.workDays.map(Number).includes(day)) return false;
      if (Array.isArray(member.serviceIds) && member.serviceIds.length && !requestedServiceIds.every(id => member.serviceIds.includes(id))) return false;
      if (appointmentStart < minutes(member.shiftStart || settings.openingTime) || appointmentEnd > minutes(member.shiftEnd || settings.closingTime)) return false;
      if (leaves.some(leave => leave.staffId === member.id && appointmentStart < minutes(leave.endTime || "23:59") && appointmentEnd > minutes(leave.startTime || "00:00"))) return false;
      return !(member.breaks || []).some(value => {
        const [from, to] = String(value).split("-");
        if (!from || !to) return false;
        return appointmentStart < minutes(to) && appointmentEnd > minutes(from);
      });
    });
    if (!candidates.length) throw new HttpsError("failed-precondition", "لا يوجد عضو فريق متاح");
  }
  const code = bookingCode(branch.code);
  const bookingRef = db.doc(`bookings/${code}`);
  const requestGuardRef = db.doc(`requestGuards/${hash(`${customer.phone}|${clientRequestId}`)}`);
  const duplicateRef = db.doc(`bookingGuards/${hash(`${branchId}|${customer.phone}|${data.bookingDate || "product"}|${data.bookingTime || clientRequestId}`)}`);
  const customerRef = db.doc(`customers/${hash(customer.phone)}`);
  const couponCode = sanitizeText(data.couponCode, 30).toUpperCase();
  const couponRef = couponCode ? db.doc(`coupons/${couponCode}`) : null;
  const couponUsageRef = couponCode ? db.doc(`couponUsage/${couponCode}_${hash(customer.phone)}`) : null;
  const inventoryRefs = inventoryLines.map(line => db.doc(`inventoryItems/${line.id}`));
  const drinkRefs = drinkLines.map(line => db.doc(`drinks/${line.id}`));

  try {
    return await db.runTransaction(async transaction => {
      const baseReads = await Promise.all([transaction.get(requestGuardRef), transaction.get(duplicateRef), couponRef ? transaction.get(couponRef) : null, couponUsageRef ? transaction.get(couponUsageRef) : null, transaction.get(customerRef)]);
      if (baseReads[0].exists) {
        const existingId = sanitizeText(baseReads[0].data()?.bookingId, 100);
        const existing = existingId ? await transaction.get(db.doc(`bookings/${existingId}`)) : null;
        if (existing?.exists) {
          const value = existing.data();
          return { ok: true, idempotent: true, bookingId: existing.id, bookingCode: value.code || existing.id, branchId: value.branchId, branchNameAr: value.branchNameAr, total: Number(value.total || 0), date: value.bookingDate || null, time: value.bookingTime || null, workerId: value.staffId || null, workerNameAr: value.staffNameAr || null, status: value.status };
        }
        throw new Error("DUPLICATE_REQUEST");
      }
      if (baseReads[1].exists) {
        const existingId = sanitizeText(baseReads[1].data()?.bookingId, 100);
        const existing = existingId ? await transaction.get(db.doc(`bookings/${existingId}`)) : null;
        if (existing?.exists) {
          const value = existing.data();
          return { ok: true, existing: true, errorCode: "BOOKING_ALREADY_EXISTS", bookingId: existing.id, bookingCode: value.code || existing.id, branchId: value.branchId, branchNameAr: value.branchNameAr, total: Number(value.total || 0), date: value.bookingDate || null, time: value.bookingTime || null, workerId: value.staffId || null, workerNameAr: value.staffNameAr || null, status: value.status };
        }
        throw new HttpsError("already-exists", "أنت حجزت بالفعل في هذا الموعد", { code: "BOOKING_ALREADY_EXISTS", bookingId: existingId || null });
      }
      let assigned = null;
      let assignedLockRefs = [];
      if (!productOnly) {
        for (const member of candidates) {
          const keys = createSlotKeys(member.id, data.bookingDate, data.bookingTime, duration, 5, branchId);
          const refs = keys.map(key => db.doc(`appointmentLocks/${key}`));
          const locks = [];
          for (const ref of refs) locks.push(await transaction.get(ref));
          if (locks.every(lock => !lock.exists)) { assigned = member; assignedLockRefs = refs; break; }
        }
        if (!assigned) throw new Error("SLOT_UNAVAILABLE");
      }
      const inventorySnapshots = inventoryRefs.length ? await transaction.getAll(...inventoryRefs) : [];
      const inventoryItems = inventorySnapshots.map((snapshot, index) => {
        const source = snapshot.data() || {};
        const line = inventoryLines[index];
        if (!snapshot.exists || source.active === false || source.category !== "drink" || source.branchId !== branchId) throw new Error("DRINK_UNAVAILABLE");
        if (Number(source.stockQty || 0) < line.qty) throw new Error("DRINK_STOCK");
        const unitPrice = Number(source.sellingPrice || 0);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("DRINK_PRICE");
        const drinkOptions = normalizeDrinkOptions(source.drinkOptions);
        const option = line.option || drinkOptions[0] || "";
        if (drinkOptions.length && !drinkOptions.includes(option)) throw new Error("DRINK_OPTION");
        return { id: snapshot.id, kind: "inventory", category: "drink", nameAr: sanitizeText(source.nameAr, 100), nameEn: sanitizeText(source.nameEn || source.nameAr, 100), option: option || null, qty: line.qty, unitPrice, lineTotal: unitPrice * line.qty, duration: 0, staffRequired: false, ref: snapshot.ref };
      });
      const drinkSnapshots = drinkRefs.length ? await transaction.getAll(...drinkRefs) : [];
      const drinkItems = priceDrinkSnapshots(drinkSnapshots, drinkLines, branchId);
      const allPricedItems = [...pricedItems, ...inventoryItems, ...drinkItems];
      const couponData = baseReads[2]?.exists ? baseReads[2].data() : null;
      const coupon = couponData && (!Array.isArray(couponData.branchIds) || !couponData.branchIds.length || couponData.branchIds.includes(branchId)) ? couponData : null;
      const couponResult = calculateCoupon(coupon, pricedItems, { usageCount: Number(coupon?.usageCount || 0), phoneUsageCount: Number(baseReads[3]?.data()?.count || 0) });
      const subtotal = allPricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
      const discount = couponResult.valid ? couponResult.discountAmount : 0;
      const total = Math.max(0, subtotal - discount);
      const now = FieldValue.serverTimestamp();
      const publicItems = allPricedItems.map(({ ref, ...item }) => item);
      const record = {
        code,
        branchId,
        branchNameAr: branch.nameAr,
        branchNameEn: branch.nameEn,
        branchPhone: branch.phone,
        branchWhatsapp: branch.whatsapp,
        customer,
        customerName: `${customer.firstName} ${customer.lastName}`,
        partySize: Math.max(1, Math.min(10, Number(data.partySize || 1))),
        phone: customer.phone,
        phoneHash: hash(customer.phone),
        items: publicItems,
        itemIds: publicItems.map(item => item.id),
        serviceNamesAr: publicItems.map(item => `${item.nameAr}${item.option ? ` (${item.option})` : ""}`),
        staffId: assigned?.id || "none",
        staffNameAr: assigned?.nameAr || "لا يحتاج عضو فريق",
        staffNameEn: assigned?.nameEn || "No staff required",
        bookingDate: productOnly ? null : data.bookingDate,
        bookingTime: productOnly ? null : data.bookingTime,
        duration,
        productOnly,
        subtotal,
        couponCode: couponResult.valid ? couponCode : null,
        discountPercent: couponResult.valid ? couponResult.discountPercent : 0,
        discountAmount: discount,
        total,
        status: "pending",
        paymentStatus: "unpaid",
        paymentMethod: null,
        source: "website",
        locale: data.locale === "en" ? "en" : "ar",
        duplicateGuardId: duplicateRef.id,
        lockIds: assignedLockRefs.map(ref => ref.id),
        createdAt: now,
        updatedAt: now
      };
      transaction.create(bookingRef, record);
      transaction.create(requestGuardRef, { bookingId: code, createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000) });
      transaction.create(duplicateRef, { bookingId: code, createdAt: now, expiresAt: productOnly ? Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000) : businessDateExpiry(data.bookingDate, 2) });
      transaction.set(customerRef, { firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone, qrToken: baseReads[4].data()?.qrToken || customerQrToken(), lastBranchId: branchId, lastBookingAt: now, bookingCount: FieldValue.increment(1), ...(baseReads[4].exists ? {} : { firstVisitAt: now, firstVisitDateKey: businessDateParts().dateKey, createdAt: now }) }, { merge: true });
      if (assigned?.id) transaction.update(db.doc(`staff/${assigned.id}`), { bookingCount: FieldValue.increment(1), updatedAt: now });
      assignedLockRefs.forEach(ref => transaction.create(ref, { bookingId: code, branchId, staffId: assigned.id, date: data.bookingDate, time: data.bookingTime, createdAt: now, expiresAt: businessDateExpiry(data.bookingDate, 7) }));
      inventoryItems.forEach(item => {
        transaction.update(item.ref, { stockQty: FieldValue.increment(-item.qty), updatedAt: now });
        transaction.create(db.doc(`stockMovements/${code}_${item.id}`), { inventoryItemId: item.id, branchId, bookingId: code, quantity: -item.qty, type: "booking-sale", dateKey: businessDateParts().dateKey, createdAt: now, source: "website" });
      });
      if (couponResult.valid) {
        transaction.update(couponRef, { usageCount: FieldValue.increment(1), discountTotal: FieldValue.increment(discount), updatedAt: now });
        transaction.set(couponUsageRef, { code: couponCode, phoneHash: hash(customer.phone), count: FieldValue.increment(1), discountTotal: FieldValue.increment(discount), updatedAt: now }, { merge: true });
      }
      return { ok: true, bookingId: code, bookingCode: code, branchId, branchNameAr: branch.nameAr, subtotal, discountAmount: discount, discountPercent: couponResult.discountPercent || 0, total, date: record.bookingDate, time: record.bookingTime, staffId: assigned?.id || null, workerId: assigned?.id || null, staffNameAr: assigned?.nameAr || null, workerNameAr: assigned?.nameAr || null, status: record.status };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    const messages = { DUPLICATE_REQUEST: "تم إرسال هذا الطلب من قبل", DUPLICATE_BOOKING: "يوجد حجز مطابق لهذا الرقم والموعد", SLOT_UNAVAILABLE: "الموعد غير متاح، اختر وقتًا آخر", DRINK_UNAVAILABLE: "أحد المشروبات غير متاح في هذا الفرع", DRINK_STOCK: "الكمية المطلوبة من أحد المشروبات غير متاحة", DRINK_PRICE: "سعر أحد المشروبات غير صحيح", DRINK_OPTION: "اختيار تحضير المشروب غير صحيح" };
    const code = ["DUPLICATE_REQUEST", "DUPLICATE_BOOKING"].includes(error.message) ? "already-exists" : "failed-precondition";
    throw new HttpsError(code, messages[error.message] || "تعذر إنشاء الحجز");
  }
});

export const rescheduleBooking = onCall(adminOptions, async request => {
  requirePermission(request, "bookings");
  const id = sanitizeText(request.data?.id, 100);
  const date = sanitizeText(request.data?.date, 10);
  const time = sanitizeText(request.data?.time, 5);
  const staffId = sanitizeText(request.data?.staffId, 100);
  const requestId = sanitizeText(request.data?.requestId, 100);
  if (!id || !staffId || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw new HttpsError("invalid-argument", "بيانات إعادة الجدولة غير مكتملة");
  const bookingRef = db.doc(`bookings/${id}`);
  const bookingSnapshot = await bookingRef.get();
  if (!bookingSnapshot.exists) throw new HttpsError("not-found", "الحجز غير موجود");
  const current = bookingSnapshot.data();
  requireBranchAccess(request, current.branchId);
  if (!['pending', 'confirmed'].includes(current.status) || current.productOnly) throw new HttpsError("failed-precondition", "هذا الحجز لا يقبل إعادة الجدولة");
  const [branch, staffSnapshot, settings, leaveSnapshot, branchHoliday, globalHoliday] = await Promise.all([
    readBranch(current.branchId),
    db.doc(`staff/${staffId}`).get(),
    readSettings(),
    db.collection("workerLeaves").where("dateKey", "==", date).where("active", "==", true).limit(100).get(),
    db.doc(`holidays/${current.branchId}_${date}`).get(),
    db.doc(`holidays/${date}`).get()
  ]);
  if (!staffSnapshot.exists || staffSnapshot.data().active === false || staffSnapshot.data().available === false) throw new HttpsError("failed-precondition", "العامل غير متاح");
  const staff = cleanDoc(staffSnapshot);
  if (!Array.isArray(staff.branchIds) || !staff.branchIds.includes(current.branchId)) throw new HttpsError("failed-precondition", "العامل غير متاح في هذا الفرع أو يحتاج تحديد فرعه من الإدارة");
  if ([branchHoliday, globalHoliday].some(item => item.exists && item.data()?.closed !== false)) throw new HttpsError("failed-precondition", "الفرع مغلق في اليوم المختار");
  const duration = Math.max(5, Number(current.duration || (current.items || []).reduce((sum, item) => sum + Number(item.duration || 0), 0)));
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const start = minutes(time);
  const end = start + duration;
  const combinedSettings = { ...settings, ...branch };
  try { validateAppointment({ date, time, duration, openingTime: combinedSettings.openingTime, closingTime: combinedSettings.closingTime }); }
  catch (error) { throw new HttpsError("failed-precondition", error.message); }
  if (Array.isArray(staff.workDays) && !staff.workDays.map(Number).includes(day)) throw new HttpsError("failed-precondition", "العامل خارج أيام عمله");
  const requestedServiceIds = [...new Set((current.items || []).filter(item => item.staffRequired !== false).flatMap(item => Array.isArray(item.serviceIds) ? item.serviceIds : item.kind === "service" && item.id ? [item.id] : []))];
  if (Array.isArray(staff.serviceIds) && staff.serviceIds.length && !requestedServiceIds.every(serviceId => staff.serviceIds.includes(serviceId))) throw new HttpsError("failed-precondition", "العامل غير مخصص لكل خدمات هذا الحجز");
  if (start < minutes(staff.shiftStart || combinedSettings.openingTime) || end > minutes(staff.shiftEnd || combinedSettings.closingTime)) throw new HttpsError("failed-precondition", "الموعد خارج شيفت العامل");
  const onLeave = leaveSnapshot.docs.map(cleanDoc).some(leave => leave.staffId === staffId && (!leave.branchId || leave.branchId === "all" || leave.branchId === current.branchId) && start < minutes(leave.endTime || "23:59") && end > minutes(leave.startTime || "00:00"));
  if (onLeave) throw new HttpsError("failed-precondition", "العامل في إجازة أو غير متاح في هذا الوقت");
  if ((staff.breaks || []).some(value => { const [from, to] = String(value).split("-"); return from && to && start < minutes(to) && end > minutes(from); })) throw new HttpsError("failed-precondition", "الموعد يتعارض مع راحة العامل");
  const newKeys = createSlotKeys(staffId, date, time, duration, 5, current.branchId);
  const oldKeys = current.lockIds || [];
  const guardRef = db.doc(`rescheduleGuards/${hash(`${request.auth.uid}|${id}|${requestId}`)}`);
  const duplicateRef = db.doc(`bookingGuards/${hash(`${current.branchId}|${current.phone}|${date}|${time}`)}`);
  return db.runTransaction(async transaction => {
    const [guard, latest, duplicate] = await transaction.getAll(guardRef, bookingRef, duplicateRef);
    if (guard.exists) return { ok: true, idempotent: true, bookingId: id, bookingCode: latest.data()?.code || id, date: latest.data()?.bookingDate, time: latest.data()?.bookingTime, workerId: latest.data()?.staffId, workerNameAr: latest.data()?.staffNameAr };
    if (!latest.exists || !['pending', 'confirmed'].includes(latest.data().status)) throw new HttpsError("failed-precondition", "تغيرت حالة الحجز؛ حدّث الصفحة");
    if (duplicate.exists && duplicate.data()?.bookingId !== id) throw new HttpsError("already-exists", "أنت حجزت بالفعل في هذا الموعد", { code: "BOOKING_ALREADY_EXISTS", bookingId: duplicate.data()?.bookingId });
    const lockRefs = newKeys.map(key => db.doc(`appointmentLocks/${key}`));
    const locks = lockRefs.length ? await transaction.getAll(...lockRefs) : [];
    if (locks.some(lock => lock.exists && lock.data()?.bookingId !== id)) throw new HttpsError("failed-precondition", "الموعد غير متاح", { code: "SLOT_UNAVAILABLE" });
    const now = FieldValue.serverTimestamp();
    lockRefs.forEach((lockRef, index) => { if (!locks[index].exists) transaction.create(lockRef, { bookingId: id, branchId: current.branchId, staffId, date, time, createdAt: now, expiresAt: businessDateExpiry(date, 7) }); });
    oldKeys.filter(key => !newKeys.includes(key)).forEach(key => transaction.delete(db.doc(`appointmentLocks/${key}`)));
    if (current.duplicateGuardId && current.duplicateGuardId !== duplicateRef.id) transaction.delete(db.doc(`bookingGuards/${current.duplicateGuardId}`));
    transaction.set(duplicateRef, { bookingId: id, createdAt: now, expiresAt: businessDateExpiry(date, 2) });
    transaction.update(bookingRef, { bookingDate: date, bookingTime: time, staffId, staffNameAr: staff.nameAr || staffId, staffNameEn: staff.nameEn || staff.nameAr || staffId, lockIds: newKeys, duplicateGuardId: duplicateRef.id, rescheduledAt: now, rescheduledBy: request.auth.uid, updatedAt: now });
    transaction.create(guardRef, { bookingId: id, date, time, staffId, createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000) });
    transaction.set(db.collection("activityLogs").doc(), { action: "reschedule-booking", targetType: "booking", targetId: id, branchId: current.branchId, before: { date: current.bookingDate, time: current.bookingTime, staffId: current.staffId }, after: { date, time, staffId }, actorUid: request.auth.uid, requestId, createdAt: now });
    return { ok: true, bookingId: id, bookingCode: current.code || id, date, time, workerId: staffId, workerNameAr: staff.nameAr || staffId };
  });
});

export const submitReview = onCall(publicOptions, async request => {
  const name = sanitizeText(request.data?.name, 60);
  const comment = sanitizeText(request.data?.comment, 500);
  const bookingCodeValue = sanitizeText(request.data?.bookingCode, 40).toUpperCase();
  const rating = Math.max(1, Math.min(5, Math.round(Number(request.data?.rating || 5))));
  if (!name || !comment) throw new HttpsError("invalid-argument", "اكتب الاسم والتقييم قبل الإرسال");
  if (comment.length < 3) throw new HttpsError("invalid-argument", "اكتب تعليقًا أوضح من فضلك");
  let verifiedBooking = null;
  if (bookingCodeValue) {
    const booking = await db.doc(`bookings/${bookingCodeValue}`).get();
    if (!booking.exists) throw new HttpsError("not-found", "كود الحجز غير صحيح");
    verifiedBooking = booking.data();
  }
  await enforceRateLimit(request, "review_v2", 10, 60 * 60 * 1000, bookingCodeValue || name.toLowerCase());
  const ref = db.collection("reviews").doc();
  await ref.set({ name, comment, rating, bookingCode: bookingCodeValue || null, verified: Boolean(verifiedBooking), branchId: verifiedBooking?.branchId || null, status: "pending", active: false, createdAt: FieldValue.serverTimestamp() });
  return { ok: true, id: ref.id };
});

export const getCustomerBooking = onCall(publicOptions, async request => {
  const code = sanitizeText(request.data?.code, 40).toUpperCase();
  let phone;
  try { phone = normalizePhone(request.data?.phone); }
  catch { throw new HttpsError("invalid-argument", "رقم الهاتف غير صحيح"); }
  await enforceRateLimit(request, "booking_lookup", 10, 15 * 60 * 1000, phone);
  if (!/^MZ-[A-Z0-9-]{6,36}$/.test(code)) throw new HttpsError("invalid-argument", "كود الحجز غير صحيح");
  const snapshot = await db.doc(`bookings/${code}`).get();
  if (!snapshot.exists || snapshot.data().phoneHash !== hash(phone)) throw new HttpsError("not-found", "لم نجد حجزًا مطابقًا للكود ورقم الهاتف");
  const booking = cleanDoc(snapshot);
  return { booking: { code: booking.code, branchId: booking.branchId, branchNameAr: booking.branchNameAr, branchWhatsapp: booking.branchWhatsapp, serviceNamesAr: booking.serviceNamesAr || [], staffNameAr: booking.staffNameAr, bookingDate: booking.bookingDate, bookingTime: booking.bookingTime, total: booking.total, status: booking.status, paymentStatus: booking.paymentStatus, canCancel: ["pending", "confirmed"].includes(booking.status) } };
});

export const cancelCustomerBooking = onCall(publicOptions, async request => {
  const code = sanitizeText(request.data?.code, 40).toUpperCase();
  let phone;
  try { phone = normalizePhone(request.data?.phone); }
  catch { throw new HttpsError("invalid-argument", "رقم الهاتف غير صحيح"); }
  await enforceRateLimit(request, "booking_cancel", 5, 60 * 60 * 1000, phone);
  const ref = db.doc(`bookings/${code}`);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.data().phoneHash !== hash(phone)) throw new HttpsError("not-found", "لم نجد حجزًا مطابقًا للكود ورقم الهاتف");
    const booking = snapshot.data();
    if (booking.status === "cancelled" && booking.cancellationSource === "customer") return;
    if (!["pending", "confirmed"].includes(booking.status)) throw new HttpsError("failed-precondition", "لا يمكن إلغاء هذا الحجز من الموقع");
    const soldInventory = booking.inventoryReleased ? [] : (booking.items || []).filter(item => item.kind === "inventory" && item.id);
    const inventoryRefs = soldInventory.map(item => db.doc(`inventoryItems/${item.id}`));
    const inventorySnapshots = inventoryRefs.length ? await transaction.getAll(...inventoryRefs) : [];
    for (const lockId of booking.lockIds || []) transaction.delete(db.doc(`appointmentLocks/${lockId}`));
    if (booking.duplicateGuardId) transaction.delete(db.doc(`bookingGuards/${booking.duplicateGuardId}`));
    inventorySnapshots.forEach((inventory, index) => {
      if (inventory.exists) transaction.update(inventory.ref, { stockQty: FieldValue.increment(Math.max(1, Number(soldInventory[index].qty || 1))), updatedAt: FieldValue.serverTimestamp() });
      transaction.delete(db.doc(`stockMovements/${code}_${soldInventory[index].id}`));
    });
    transaction.update(ref, { status: "cancelled", cancellationSource: "customer", inventoryReleased: soldInventory.length ? true : Boolean(booking.inventoryReleased), updatedAt: FieldValue.serverTimestamp() });
    if (booking.phoneHash) transaction.set(db.doc(`customers/${booking.phoneHash}`), { cancellationCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(db.collection("activityLogs").doc(), { action: "customer-cancel-booking", targetType: "booking", targetId: code, branchId: booking.branchId, actorUid: request.auth?.uid || null, requestId: sanitizeText(request.data?.requestId, 100) || null, createdAt: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

function scopedQueries(collection, allowedBranches, configure = query => query) {
  return (allowedBranches.length ? allowedBranches : [null]).map(branchId => {
    let query = db.collection(collection);
    if (branchId) query = query.where("branchId", "==", branchId);
    return configure(query);
  });
}

async function aggregateScoped(collection, allowedBranches, configure = query => query, fields = {}, includeCount = true) {
  const aggregations = includeCount ? { count: AggregateField.count(), ...fields } : fields;
  const results = await Promise.all(scopedQueries(collection, allowedBranches, configure).map(query => query.aggregate(aggregations).get()));
  return results.reduce((total, snapshot) => {
    const data = snapshot.data();
    if (includeCount) total.count += Number(data.count || 0);
    Object.keys(fields).forEach(key => { total[key] = Number(total[key] || 0) + Number(data[key] || 0); });
    return total;
  }, includeCount ? { count: 0 } : {});
}

async function sumCashShifts(allowedBranches, businessDate) {
  const snapshots = await Promise.all(scopedQueries("cashShifts", allowedBranches, query => query.where("businessDate", "==", businessDate)).map(query => query.get()));
  const shifts = new Map();
  snapshots.forEach(snapshot => snapshot.docs.forEach(document => shifts.set(document.id, document.data())));
  return [...shifts.values()].reduce((totals, shift) => {
    for (const field of ["openingCash", "cashSales", "cashIn", "cashOut", "cashRefunds"]) totals[field] += Number(shift[field] || 0);
    return totals;
  }, { openingCash: 0, cashSales: 0, cashIn: 0, cashOut: 0, cashRefunds: 0 });
}

async function countNewCustomers(allowedBranches, dateKey) {
  const snapshots = await Promise.all((allowedBranches.length ? allowedBranches : [null]).map(branchId => {
    let query = db.collection("customers").where("firstVisitDateKey", "==", dateKey);
    if (branchId) query = query.where("lastBranchId", "==", branchId);
    return query.count().get();
  }));
  return snapshots.reduce((sum, snapshot) => sum + Number(snapshot.data().count || 0), 0);
}

async function recentScoped(collection, allowedBranches, pageSize) {
  const snapshots = await Promise.all(scopedQueries(collection, allowedBranches, query => query.orderBy("createdAt", "desc").limit(pageSize)).map(query => query.get()));
  const unique = new Map();
  snapshots.forEach(snapshot => snapshot.docs.forEach(document => unique.set(document.id, cleanDoc(document))));
  return [...unique.values()].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, pageSize);
}

export const getAdminDashboard = onCall(adminOptions, async request => {
  const access = permissionsFor(request);
  if (!["dashboard", "bookings", "revenue", "expenses", "pos"].some(value => access.has(value))) throw new HttpsError("permission-denied", "لا تملك صلاحية لوحة المتابعة");
  const canBookings = access.has("dashboard") || access.has("bookings") || access.has("pos");
  const canDailyRevenue = access.has("dashboard") || access.has("revenue") || access.has("pos");
  const canRevenue = access.has("revenue");
  const canExpenses = access.has("expenses");
  const claimedBranches = branchesFor(request);
  const requestedBranch = sanitizeText(request.data?.branchId || "all", 40).toLowerCase();
  if (requestedBranch !== "all" && !["talkha", "mashaya"].includes(requestedBranch)) throw new HttpsError("invalid-argument", "اختر نطاق فرع صحيحًا");
  if (requestedBranch !== "all" && claimedBranches.length && !claimedBranches.includes(requestedBranch)) throw new HttpsError("permission-denied", "هذا الحساب غير مصرح له بهذا الفرع");
  const allowedBranches = requestedBranch === "all" ? claimedBranches : [requestedBranch];
  const dashboardBranchIds = allowedBranches.length ? allowedBranches : ["talkha", "mashaya"];
  const today = businessDateParts().dateKey;
  const month = today.slice(0, 7);
  const nextMonth = nextMonthKey(month);
  const zero = Promise.resolve({ count: 0, amount: 0 });
  const [bookings, ledger, expenses, allBookings, todayAll, todayPos, unpaid, paid, completed, cancelled, noShow, upcoming, revenueToday, revenueMonth, revenueTotal, expenseToday, expenseMonth, expenseTotal] = await Promise.all([
    canBookings ? recentScoped("bookings", allowedBranches, 140) : [],
    canRevenue ? recentScoped("revenueLedger", allowedBranches, 80) : [],
    canExpenses ? recentScoped("expenses", allowedBranches, 80) : [],
    canBookings ? aggregateScoped("bookings", allowedBranches) : zero,
    canBookings ? aggregateScoped("bookings", allowedBranches, query => query.where("bookingDate", "==", today)) : zero,
    canBookings ? aggregateScoped("bookings", allowedBranches, query => query.where("bookingDate", "==", today).where("source", "==", "pos")) : zero,
    canBookings ? aggregateScoped("bookings", allowedBranches, query => query.where("paymentStatus", "==", "unpaid")) : zero,
    canBookings ? aggregateScoped("bookings", allowedBranches, query => query.where("paymentStatus", "==", "paid")) : zero,
    canBookings ? aggregateScoped("bookings", allowedBranches, query => query.where("bookingDate", "==", today).where("status", "==", "completed")) : zero,
    canBookings ? aggregateScoped("bookings", allowedBranches, query => query.where("bookingDate", "==", today).where("status", "==", "cancelled")) : zero,
    canBookings ? aggregateScoped("bookings", allowedBranches, query => query.where("bookingDate", "==", today).where("status", "==", "no_show")) : zero,
    canBookings ? aggregateScoped("bookings", allowedBranches, query => query.where("status", "in", ["pending", "confirmed", "arrived"]).where("bookingDate", ">=", today)) : zero,
    canDailyRevenue ? aggregateScoped("revenueLedger", allowedBranches, query => query.where("dateKey", "==", today), { amount: AggregateField.sum("amount") }) : zero,
    canRevenue ? aggregateScoped("revenueLedger", allowedBranches, query => query.where("dateKey", ">=", `${month}-01`).where("dateKey", "<", `${nextMonth}-01`), { amount: AggregateField.sum("amount") }) : zero,
    canRevenue ? aggregateScoped("revenueLedger", allowedBranches, query => query, { amount: AggregateField.sum("amount") }) : zero,
    canExpenses ? aggregateScoped("expenses", allowedBranches, query => query.where("dateKey", "==", today), { amount: AggregateField.sum("amount") }) : zero,
    canExpenses ? aggregateScoped("expenses", allowedBranches, query => query.where("dateKey", ">=", `${month}-01`).where("dateKey", "<", `${nextMonth}-01`), { amount: AggregateField.sum("amount") }) : zero,
    canExpenses ? aggregateScoped("expenses", allowedBranches, query => query, { amount: AggregateField.sum("amount") }) : zero
  ]);
  const [cashToday, openShifts, cashTotals, inventorySnapshots, newCustomersToday, branchSnapshots, branchMonthRevenue] = await Promise.all([
    canDailyRevenue ? aggregateScoped("revenueLedger", allowedBranches, query => query.where("dateKey", "==", today).where("paymentMethod", "==", "cash"), { amount: AggregateField.sum("amount") }) : zero,
    hasPermission(request, "pos") ? aggregateScoped("cashShifts", allowedBranches, query => query.where("status", "==", "OPEN")) : zero,
    hasPermission(request, "pos") ? sumCashShifts(allowedBranches, today) : zero,
    hasPermission(request, "inventory") ? Promise.all(scopedQueries("inventoryItems", allowedBranches, query => query.limit(500)).map(query => query.get())) : [],
    canBookings ? countNewCustomers(allowedBranches, today) : 0,
    canRevenue ? Promise.all(dashboardBranchIds.map(branchId => db.doc(`branches/${branchId}`).get())) : [],
    canRevenue ? Promise.all(dashboardBranchIds.map(branchId => aggregateScoped("revenueLedger", [branchId], query => query.where("dateKey", ">=", `${month}-01`).where("dateKey", "<", `${nextMonth}-01`), { amount: AggregateField.sum("amount") }))) : []
  ]);
  const monthlyTargetByBranch = Object.fromEntries(branchSnapshots.flatMap((snapshot, index) => {
    if (!snapshot.exists || snapshot.data().active === false) return [];
    const target = Math.max(0, Number(snapshot.data().monthlyRevenueTarget || 0));
    const achieved = Math.max(0, Number(branchMonthRevenue[index]?.amount || 0));
    return [[dashboardBranchIds[index], { target, achieved, remaining: Math.max(0, target - achieved), progressPercent: target ? Math.min(100, Math.round(achieved / target * 100)) : 0 }]];
  }));
  const monthlyRevenueTarget = Object.values(monthlyTargetByBranch).reduce((sum, item) => sum + item.target, 0);
  const inventoryItems = inventorySnapshots.flatMap(snapshot => snapshot.docs.map(cleanDoc));
  const lowStockCount = inventoryItems.filter(item => item.active !== false && Number(item.stockQty || 0) <= Number(item.minStock || 0)).length;
  return {
    _meta: { apiVersion: API_VERSION, minimumFrontendVersion: MIN_FRONTEND_VERSION },
    bookings,
    ledger,
    expenses,
    stats: {
      bookingCount: allBookings.count,
      todayBookings: Math.max(0, todayAll.count - todayPos.count),
      ordersToday: todayPos.count,
      walkInsToday: todayPos.count,
      completedToday: completed.count,
      cancelledToday: cancelled.count,
      noShowToday: noShow.count,
      upcomingBookings: upcoming.count,
      openOrders: unpaid.count,
      openShifts: openShifts.count,
      lowStockCount,
      newCustomersToday,
      unpaidCount: unpaid.count,
      paidCount: paid.count,
      todayRevenue: revenueToday.amount,
      cashSalesToday: cashToday.amount,
      otherPaymentsToday: revenueToday.amount - cashToday.amount,
      expectedCash: calculateExpectedCash(cashTotals),
      monthRevenue: revenueMonth.amount,
      monthlyRevenueTarget,
      monthlyTargetByBranch,
      totalRevenue: revenueTotal.amount,
      todayExpenses: expenseToday.amount,
      monthExpenses: expenseMonth.amount,
      totalExpenses: expenseTotal.amount,
      monthNetProfit: revenueMonth.amount - expenseMonth.amount,
      totalNetProfit: revenueTotal.amount - expenseTotal.amount,
      lastCollected: ledger.find(item => item.type === "payment")?.amount || 0
    }
  };
});

export const getCashierSnapshot = onCall(adminOptions, async request => {
  const access = permissionsFor(request);
  if (!["dashboard", "bookings", "pos"].some(value => access.has(value))) throw new HttpsError("permission-denied", "لا تملك صلاحية شاشة الكاشير");
  const today = businessDateParts().dateKey;
  const allowedBranches = branchesFor(request);
  const activeQueries = scopedQueries("bookings", allowedBranches, query => query.where("status", "in", ["pending", "confirmed", "arrived"]).orderBy("createdAt", "desc").limit(120));
  const todayQueries = scopedQueries("bookings", allowedBranches, query => query.where("bookingDate", "==", today).orderBy("bookingTime", "desc").limit(160));
  const recentQueries = scopedQueries("bookings", allowedBranches, query => query.orderBy("createdAt", "desc").limit(180));
  const snapshots = await Promise.all([...activeQueries, ...todayQueries, ...recentQueries].map(query => query.get()));
  const unique = new Map();
  snapshots.forEach(snapshot => snapshot.docs.forEach(document => unique.set(document.id, cleanDoc(document))));
  const rows = [...unique.values()].filter(item => itemInAllowedBranch(item, allowedBranches));
  const active = rows.filter(item => item.source !== "pos" && ["pending", "confirmed", "arrived"].includes(item.status)).sort((a, b) => String(a.bookingDate || "").localeCompare(String(b.bookingDate || "")) || String(a.bookingTime || "").localeCompare(String(b.bookingTime || ""))).slice(0, 120);
  const recent = [...rows].sort((a, b) => String(b.createdAt || `${b.bookingDate || ""}T${b.bookingTime || ""}`).localeCompare(String(a.createdAt || `${a.bookingDate || ""}T${a.bookingTime || ""}`)));
  const recentReceipts = recent.filter(item => item.source === "pos").slice(0, 60);
  const recentBookings = recent.filter(item => item.source !== "pos").slice(0, 100);
  const bookings = [...new Map([...recentReceipts, ...active, ...recentBookings].map(item => [item.id, item])).values()];
  const todayItems = rows.filter(item => item.bookingDate === today);
  const paidToday = todayItems.filter(item => item.paymentStatus === "paid");
  return {
    _meta: { apiVersion: API_VERSION, minimumFrontendVersion: MIN_FRONTEND_VERSION },
    bookings,
    stats: {
      bookingCount: bookings.length,
      todayBookings: todayItems.filter(item => item.source !== "pos").length,
      unpaidCount: bookings.filter(item => item.paymentStatus === "unpaid").length,
      paidCount: paidToday.length,
      todayRevenue: paidToday.reduce((sum, item) => sum + Number(item.total || 0), 0),
      lastCollected: paidToday.sort((a, b) => String(b.paidAt || b.createdAt || "").localeCompare(String(a.paidAt || a.createdAt || "")))[0]?.total || 0
    }
  };
});

export const getAdminCollection = onCall(adminOptions, async request => {
  const role = requireRole(request);
  const collection = sanitizeText(request.data?.collection, 40);
  const allowed = [...ADMIN_COLLECTIONS, "customers", "walletTransactions", "campaigns", "activityLogs", "users", "revenueLedger", "expenses", "payrollPayments"];
  if (!allowed.includes(collection)) throw new HttpsError("invalid-argument", "قسم غير صالح");
  const permission = COLLECTION_PERMISSIONS[collection];
  const posReadable = hasPermission(request, "pos") && ["categories", "services", "packages", "staff", "customers", "drinks", "inventoryItems"].includes(collection);
  const operationsReadable = (hasPermission(request, "revenue") || hasPermission(request, "payroll")) && ["services", "staff"].includes(collection);
  const scheduleReadable = hasPermission(request, "schedule") && collection === "settings";
  const contentReadable = collection === "content" && ["gallery", "results", "hairMedia", "celebrities", "posts"].some(value => hasPermission(request, value));
  if (role !== "admin" && permission && !hasPermission(request, permission) && !posReadable && !operationsReadable && !scheduleReadable && !contentReadable) throw new HttpsError("permission-denied", "لا تملك صلاحية هذا القسم");
  if (collection === "settings") {
    const snapshot = await db.doc("settings/public").get();
    return { items: snapshot.exists ? [cleanDoc(snapshot)] : [] };
  }
  const pageSize = Math.max(1, Math.min(200, Number(request.data?.limit || 100)));
  const cursor = sanitizeText(request.data?.cursor, 200);
  let collectionQuery = db.collection(collection).orderBy("__name__").limit(pageSize);
  if (cursor) collectionQuery = collectionQuery.startAfter(cursor);
  const snapshot = await collectionQuery.get();
  let items = snapshot.docs.map(cleanDoc);
  const allowedBranches = branchesFor(request);
  if (role !== "admin" && collection !== "users") items = items.filter(item => itemInAllowedBranch(item, allowedBranches));
  if (role !== "admin" && collection === "users") items = [];
  if ((posReadable || operationsReadable) && !hasPermission(request, permission)) {
    if (collection === "staff") items = items.map(({ baseSalary, monthlyTarget, targetBonusPercent, revenueTotal, ...item }) => item);
    if (collection === "inventoryItems") items = items.map(({ costPrice, minStock, ...item }) => item);
  }
  if (role !== "admin" && collection === "content") items = items.filter(item => hasPermission(request, contentPermission(item.type)));
  return { items, nextCursor: snapshot.size === pageSize ? snapshot.docs.at(-1)?.id || null : null };
});

function normalizeAdminPayload(collection, raw) {
  const payload = { ...raw };
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;
  ["price", "originalPrice", "oldPrice", "newPrice", "duration", "sortOrder", "slotMinutes", "value", "maxDiscount", "minSubtotal", "totalUsageLimit", "perPhoneLimit", "baseSalary", "monthlyTarget", "monthlyRevenueTarget", "targetBonusPercent", "costPrice", "sellingPrice", "stockQty", "minStock", "rating", "pointsRate", "cashbackPercent", "rewardsMinimumSpend", "minimumRedemption", "maximumRedemptionPercent", "latitude", "longitude", "attendanceRadiusMeters"].forEach(key => { if (key in payload) payload[key] = Number(payload[key] || 0); });
  ["active", "available", "showCountdown", "startsFrom", "closed", "featured", "loyaltyEnabled", "walletRedemptionEnabled", "customerQrEnabled", "cashDrawerEnabled", "whatsappReceiptsEnabled", "whatsappCampaignsEnabled"].forEach(key => { if (key in payload) payload[key] = payload[key] === true || payload[key] === "true" || payload[key] === 1 || payload[key] === "1"; });
  ["branchIds", "serviceIds", "includedServiceIds", "applicableItemIds", "workDays", "breaks", "whatsappTestCustomerIds", "includedItemsAr", "includedItemsEn", "actions", "keywords"].forEach(key => { if (typeof payload[key] === "string") payload[key] = payload[key].split(/[\n،,]/).map(item => item.trim()).filter(Boolean); });
  if (["services", "packages", "offers", "staff", "content", "faqs"].includes(collection)) {
    payload.branchIds = [...new Set((Array.isArray(payload.branchIds) ? payload.branchIds : []).map(value => sanitizeText(value, 40).toLowerCase()).filter(value => ["talkha", "mashaya"].includes(value)))];
    if (!payload.branchIds.length) throw new HttpsError("invalid-argument", "حدد فرعًا واحدًا على الأقل لهذا السجل");
  }
  if ("choiceGroups" in payload) payload.choiceGroups = normalizeChoiceGroups(payload.choiceGroups);
  if (Array.isArray(payload.workDays)) payload.workDays = payload.workDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
  ["startAt", "endAt"].forEach(key => { if (payload[key]) payload[key] = Timestamp.fromDate(new Date(payload[key])); else if (key in payload) payload[key] = null; });
  if (collection === "coupons") payload.code = sanitizeText(payload.code || raw.id, 30).toUpperCase();
  if (collection === "branches") {
    payload.code = sanitizeText(payload.code, 3).toUpperCase();
    if (("latitude" in payload && (!Number.isFinite(payload.latitude) || payload.latitude < -90 || payload.latitude > 90)) || ("longitude" in payload && (!Number.isFinite(payload.longitude) || payload.longitude < -180 || payload.longitude > 180))) throw new HttpsError("invalid-argument", "إحداثيات الفرع غير صحيحة");
    if ("attendanceRadiusMeters" in payload && (payload.attendanceRadiusMeters < 25 || payload.attendanceRadiusMeters > 1000)) throw new HttpsError("invalid-argument", "نطاق الحضور يجب أن يكون بين 25 و1000 متر");
    if ("monthlyRevenueTarget" in payload && payload.monthlyRevenueTarget < 0) throw new HttpsError("invalid-argument", "هدف مبيعات الفرع لا يمكن أن يكون سالبًا");
  }
  if (collection === "inventoryItems") {
    if ("category" in payload) payload.category = INVENTORY_CATEGORIES.includes(payload.category) ? payload.category : "product";
    if ("branchId" in payload) payload.branchId = sanitizeText(payload.branchId || "talkha", 40).toLowerCase();
    if ("nameAr" in payload) payload.nameAr = sanitizeText(payload.nameAr, 100);
    if ("unit" in payload) payload.unit = sanitizeText(payload.unit || "قطعة", 30);
    if (("nameAr" in payload && !payload.nameAr) || ("sellingPrice" in payload && payload.sellingPrice < 0) || ("costPrice" in payload && payload.costPrice < 0) || ("stockQty" in payload && payload.stockQty < 0)) throw new HttpsError("invalid-argument", "بيانات الصنف غير صحيحة");
  }
  if (collection === "drinks") {
    if ("nameAr" in payload) payload.nameAr = sanitizeText(payload.nameAr, 100);
    if ("nameEn" in payload) payload.nameEn = sanitizeText(payload.nameEn || payload.nameAr, 100);
    if ("type" in payload) payload.type = DRINK_TYPES.includes(payload.type) ? payload.type : "other";
    if ("branchId" in payload) payload.branchId = sanitizeText(payload.branchId || "talkha", 40).toLowerCase();
    if ("drinkOptions" in payload) payload.drinkOptions = normalizeDrinkOptions(payload.drinkOptions);
    if (("nameAr" in payload && !payload.nameAr) || ("price" in payload && payload.price < 0) || ("branchId" in payload && !/^[a-z0-9-]{2,40}$/.test(payload.branchId))) throw new HttpsError("invalid-argument", "بيانات المشروب غير صحيحة");
  }
  if (collection === "reviews") {
    if ("name" in payload) payload.name = sanitizeText(payload.name, 60);
    if ("comment" in payload) payload.comment = sanitizeText(payload.comment, 500);
    if ("adminReply" in payload) payload.adminReply = sanitizeText(payload.adminReply, 500);
    if ("rating" in payload) payload.rating = Math.max(1, Math.min(5, Math.round(Number(payload.rating || 5))));
    if ("status" in payload) {
      payload.status = ["pending", "published", "rejected"].includes(payload.status) ? payload.status : "pending";
      payload.active = payload.status === "published";
    } else if ("active" in payload) payload.status = payload.active ? "published" : "pending";
  }
  if (collection === "faqs") {
    payload.questionAr = sanitizeText(payload.questionAr, 180);
    payload.questionEn = sanitizeText(payload.questionEn || payload.questionAr, 180);
    payload.answerAr = sanitizeText(payload.answerAr, 1000);
    payload.answerEn = sanitizeText(payload.answerEn || payload.answerAr, 1000);
    payload.actions = (Array.isArray(payload.actions) ? payload.actions : []).map(value => sanitizeText(value, 20)).filter(value => ["book", "services", "hair", "branch", "whatsapp", "manage"].includes(value));
    payload.keywords = (Array.isArray(payload.keywords) ? payload.keywords : []).map(value => sanitizeText(value, 40)).filter(Boolean).slice(0, 20);
    if (!payload.questionAr || !payload.answerAr) throw new HttpsError("invalid-argument", "السؤال والإجابة مطلوبان");
  }
  if (collection === "workerLeaves") {
    payload.staffId = sanitizeText(payload.staffId, 100);
    payload.branchId = sanitizeText(payload.branchId || "all", 40).toLowerCase();
    payload.dateKey = sanitizeText(payload.dateKey, 10);
    payload.startTime = sanitizeText(payload.startTime || "00:00", 5);
    payload.endTime = sanitizeText(payload.endTime || "23:59", 5);
    payload.reason = sanitizeText(payload.reason, 200);
    try {
      if (!payload.staffId || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dateKey) || minutes(payload.startTime) >= minutes(payload.endTime)) throw new Error("INVALID_WORKER_LEAVE");
    } catch { throw new HttpsError("invalid-argument", "بيانات إجازة العامل أو الوقت غير صحيحة"); }
  }
  return payload;
}

export const adminUpsert = onCall(adminOptions, async request => {
  const collection = sanitizeText(request.data?.collection, 40);
  if (collection === "branches") requireRole(request, ["admin"]);
  const raw = request.data?.data || {};
  validatePayloadSize(raw);
  requirePermission(request, collection === "content" ? contentPermission(raw.type) : COLLECTION_PERMISSIONS[collection] || "settings");
  if (!ADMIN_COLLECTIONS.includes(collection)) throw new HttpsError("invalid-argument", "قسم غير صالح");
  if (request.auth.token.role !== "admin") {
    const allowedBranches = branchesFor(request);
    if (raw.branchId) requireBranchAccess(request, raw.branchId);
    if (typeof raw.branchIds === "string") raw.branchIds = raw.branchIds.split(",").map(value => value.trim()).filter(Boolean);
    if (Array.isArray(raw.branchIds)) raw.branchIds = raw.branchIds.filter(value => allowedBranches.includes(String(value).toLowerCase()));
    if (Array.isArray(raw.branchIds) && !raw.branchIds.length && ["services", "packages", "offers", "staff", "content"].includes(collection)) raw.branchIds = allowedBranches;
  }
  let id = sanitizeText(request.data?.id || raw.id, 100);
  if (collection === "settings") id = "public";
  if (collection === "coupons") id = sanitizeText(raw.code || id, 30).toUpperCase();
  if (collection === "branches") id = sanitizeText(raw.id || id, 40).toLowerCase();
  if (collection === "branches" && !/^[a-z0-9-]{2,40}$/.test(id)) throw new HttpsError("invalid-argument", "معرّف الفرع غير صالح");
  if (collection === "holidays") {
    const holidayBranch = sanitizeText(raw.branchId, 40).toLowerCase();
    const holidayDate = sanitizeText(raw.date, 10);
    if (!/^[a-z0-9-]{2,40}$/.test(holidayBranch) || !/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) throw new HttpsError("invalid-argument", "بيانات إجازة الفرع غير صحيحة");
    id = `${holidayBranch}_${holidayDate}`;
  }
  if (collection === "workerLeaves" && !id) id = `${sanitizeText(raw.staffId, 100)}_${sanitizeText(raw.dateKey, 10)}_${sanitizeText(raw.startTime || "00:00", 5).replace(":", "")}`;
  if (!id) id = db.collection(collection).doc().id;
  const ref = db.collection(collection).doc(id);
  const before = await ref.get();
  if (request.auth.token.role !== "admin" && before.exists && !itemInAllowedBranch(before.data(), branchesFor(request))) throw new HttpsError("permission-denied", "هذا السجل تابع لفرع آخر");
  const payload = normalizeAdminPayload(collection, raw);
  if (collection === "packages") await validatePackageReferences({ ...(before.exists ? before.data() : {}), ...payload });
  await ref.set({ ...payload, updatedAt: FieldValue.serverTimestamp(), ...(before.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
  await db.collection("activityLogs").add({ action: before.exists ? "update" : "create", collection, entityId: id, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
  if ([...PUBLIC_COLLECTIONS, "drinks"].includes(collection)) await markCatalogChanged();
  if (before.exists && ["content", "staff", "packages", "offers"].includes(collection)) {
    const keep = new Set([payload.imageUrl, payload.videoUrl].map(managedStoragePath).filter(Boolean));
    await deleteManagedMedia(before.data(), keep);
  }
  return { ok: true, id };
});

export const adminDelete = onCall(adminOptions, async request => {
  const role = requireRole(request);
  const collection = sanitizeText(request.data?.collection, 40);
  const id = sanitizeText(request.data?.id, 100);
  if (!ADMIN_COLLECTIONS.includes(collection) || ["settings", "branches"].includes(collection) || !id) throw new HttpsError("invalid-argument", "طلب حذف غير صالح");
  const target = await db.collection(collection).doc(id).get();
  if (role !== "admin" && target.exists && !itemInAllowedBranch(target.data(), branchesFor(request))) throw new HttpsError("permission-denied", "هذا السجل تابع لفرع آخر");
  if (collection === "content") {
    requirePermission(request, contentPermission(target.data()?.type));
  } else requirePermission(request, COLLECTION_PERMISSIONS[collection] || "settings");
  await db.collection(collection).doc(id).delete();
  await db.collection("activityLogs").add({ action: "delete", collection, entityId: id, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
  if ([...PUBLIC_COLLECTIONS, "drinks"].includes(collection)) await markCatalogChanged();
  if (target.exists && ["content", "staff", "packages", "offers"].includes(collection)) await deleteManagedMedia(target.data());
  return { ok: true };
});

export const getBusinessDashboard = onCall(adminOptions, async request => {
  const access = permissionsFor(request);
  if (!["pos", "expenses", "inventory", "drinks", "payroll", "reviews"].some(value => access.has(value))) throw new HttpsError("permission-denied", "لا تملك صلاحية بيانات التشغيل");
  const currentMonth = businessDateParts().month;
  const month = sanitizeText(request.data?.month || currentMonth, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "الشهر غير صحيح");
  const nextMonth = nextMonthKey(month);
  const [staffSnapshot, ledgerSnapshot, expensesSnapshot, inventorySnapshot, drinksSnapshot, payrollSnapshot, reviewsSnapshot] = await Promise.all([
    db.collection("staff").limit(200).get(),
    db.collection("revenueLedger").where("dateKey", ">=", `${month}-01`).where("dateKey", "<", `${nextMonth}-01`).limit(2000).get(),
    db.collection("expenses").where("dateKey", ">=", `${month}-01`).where("dateKey", "<", `${nextMonth}-01`).limit(2000).get(),
    db.collection("inventoryItems").limit(500).get(),
    db.collection("drinks").limit(300).get(),
    db.collection("payrollPayments").where("month", "==", month).limit(300).get(),
    db.collection("reviews").limit(500).get()
  ]);
  const allowedBranches = branchesFor(request);
  const [monthRevenueAggregate, monthExpenseAggregate, productPurchaseAggregate, drinkRevenueAggregate] = await Promise.all([
    aggregateScoped("revenueLedger", allowedBranches, query => query.where("dateKey", ">=", `${month}-01`).where("dateKey", "<", `${nextMonth}-01`), { amount: AggregateField.sum("amount") }),
    aggregateScoped("expenses", allowedBranches, query => query.where("dateKey", ">=", `${month}-01`).where("dateKey", "<", `${nextMonth}-01`), { amount: AggregateField.sum("amount") }),
    aggregateScoped("expenses", allowedBranches, query => query.where("category", "==", "inventory").where("dateKey", ">=", `${month}-01`).where("dateKey", "<", `${nextMonth}-01`), { amount: AggregateField.sum("amount") }),
    aggregateScoped("revenueLedger", allowedBranches, query => query.where("dateKey", ">=", `${month}-01`).where("dateKey", "<", `${nextMonth}-01`), { amount: AggregateField.sum("revenueBreakdown.drinks") })
  ]);
  const rawLedger = ledgerSnapshot.docs.map(cleanDoc).filter(item => itemInAllowedBranch(item, allowedBranches));
  const legacyBookingIds = [...new Set(rawLedger.filter(item => !item.revenueBreakdown).map(item => item.bookingId || item.bookingCode).filter(Boolean))].slice(0, 300);
  const legacyBookingSnapshots = legacyBookingIds.length ? await db.getAll(...legacyBookingIds.map(id => db.doc(`bookings/${id}`))) : [];
  const bookings = new Map(legacyBookingSnapshots.filter(snapshot => snapshot.exists).map(snapshot => [snapshot.id, cleanDoc(snapshot)]).filter(([, item]) => itemInAllowedBranch(item, allowedBranches)));
  const ledger = rawLedger.map(item => {
    const booking = bookings.get(item.bookingId || item.bookingCode);
    const breakdown = item.revenueBreakdown || calculateRevenueBreakdown(booking?.items || [], item.amount);
    return { ...item, revenueBreakdown: breakdown };
  });
  const inventory = inventorySnapshot.docs.map(cleanDoc).filter(item => item.category !== "drink" && itemInAllowedBranch(item, allowedBranches)).sort((a, b) => String(a.nameAr || "").localeCompare(String(b.nameAr || ""), "ar"));
  const drinks = drinksSnapshot.docs.map(cleanDoc).filter(item => itemInAllowedBranch(item, allowedBranches)).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.nameAr || "").localeCompare(String(b.nameAr || ""), "ar"));
  const inventoryById = new Map(inventory.map(item => [item.id, item]));
  const expenses = expensesSnapshot.docs.map(cleanDoc).filter(item => itemInAllowedBranch(item, allowedBranches) && String(item.dateKey || "").startsWith(month)).map(item => ({ ...item, inventoryCategory: item.inventoryCategory || inventoryById.get(item.inventoryItemId)?.category || null })).sort((a, b) => String(b.dateKey || "").localeCompare(String(a.dateKey || "")));
  const payrollPayments = new Map(payrollSnapshot.docs.map(snapshot => [snapshot.data().staffId, cleanDoc(snapshot)]));
  const payroll = staffSnapshot.docs.map(snapshot => cleanDoc(snapshot)).filter(item => itemInAllowedBranch(item, allowedBranches)).map(staff => {
    const revenue = ledger.reduce((sum, item) => sum + Number(item.workerBreakdown?.[staff.id] ?? (item.staffId === staff.id ? item.revenueBreakdown?.services || item.amount || 0 : 0)), 0);
    return { ...staff, ...calculatePayroll({ ...staff, revenue }), payment: payrollPayments.get(staff.id) || null };
  }).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const grossRevenue = monthRevenueAggregate.amount;
  const totalExpenses = monthExpenseAggregate.amount;
  const reviews = reviewsSnapshot.docs.map(cleanDoc).filter(item => itemInAllowedBranch(item, allowedBranches)).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const productPurchaseCost = productPurchaseAggregate.amount;
  const drinkRevenue = drinkRevenueAggregate.amount;
  const posOnly = access.has("pos") && !access.has("inventory");
  return {
    month,
    payroll: access.has("payroll") ? payroll : [],
    expenses: access.has("expenses") ? expenses : [],
    inventory: access.has("inventory") ? inventory : posOnly ? inventory.map(({ costPrice, minStock, ...item }) => item) : [],
    drinks: access.has("drinks") || access.has("pos") ? drinks : [],
    reviews: access.has("reviews") ? reviews : [],
    stats: {
      grossRevenue: access.has("expenses") || access.has("payroll") ? grossRevenue : 0,
      totalExpenses: access.has("expenses") || access.has("payroll") ? totalExpenses : 0,
      netProfit: access.has("expenses") ? grossRevenue - totalExpenses : 0,
      inventoryValue: access.has("inventory") ? inventory.reduce((sum, item) => sum + Number(item.costPrice || 0) * Number(item.stockQty || 0), 0) : 0,
      productPurchaseCost: access.has("inventory") || access.has("expenses") ? productPurchaseCost : 0,
      drinkRevenue: access.has("drinks") ? drinkRevenue : 0,
      drinkCount: drinks.filter(item => item.active !== false).length,
      productStockValue: access.has("inventory") ? inventory.reduce((sum, item) => sum + Number(item.costPrice || 0) * Number(item.stockQty || 0), 0) : 0,
      productLowStock: access.has("inventory") ? inventory.filter(item => item.active !== false && Number(item.stockQty || 0) <= Number(item.minStock || 0)).length : 0,
      lowStockCount: access.has("inventory") ? inventory.filter(item => item.active !== false && Number(item.stockQty || 0) <= Number(item.minStock || 0)).length : 0,
      pendingReviews: access.has("reviews") ? reviews.filter(item => item.active !== true).length : 0
    }
  };
});

export const getServiceTargetsDashboard = onCall(adminOptions, async request => {
  requirePermission(request, "payroll");
  const month = sanitizeText(request.data?.month || businessDateParts().month, 7);
  const branchId = sanitizeText(request.data?.branchId || "all", 40).toLowerCase();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || (branchId !== "all" && !/^[a-z0-9-]{2,40}$/.test(branchId))) throw new HttpsError("invalid-argument", "الشهر أو الفرع غير صحيح");
  if (branchId !== "all") requireBranchAccess(request, branchId);
  const allowedBranches = branchesFor(request);
  const snapshot = await db.collection("serviceTargets").where("month", "==", month).limit(500).get();
  const targets = snapshot.docs.map(cleanDoc)
    .filter(item => (branchId === "all" || item.branchId === branchId) && itemInAllowedBranch(item, allowedBranches) && Number(item.targetCount || 0) > 0)
    .map(item => ({ ...item, ...calculateServiceTargetProgress(item.targetCount, item.achievedCount) }))
    .sort((a, b) => String(a.branchId || "").localeCompare(String(b.branchId || "")) || String(a.nameAr || "").localeCompare(String(b.nameAr || ""), "ar"));
  return { month, branchId, targets, _meta: { apiVersion: API_VERSION, minimumFrontendVersion: MIN_FRONTEND_VERSION } };
});

export const upsertServiceTarget = onCall(adminOptions, async request => {
  requireRole(request, ["admin"]);
  const month = sanitizeText(request.data?.month, 7);
  const branchId = sanitizeText(request.data?.branchId, 40).toLowerCase();
  const kind = sanitizeText(request.data?.kind, 20).toLowerCase();
  const itemId = sanitizeText(request.data?.itemId, 100);
  const targetCount = Math.floor(Number(request.data?.targetCount));
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !/^[a-z0-9-]{2,40}$/.test(branchId) || !["service", "package", "offer"].includes(kind) || !/^[A-Za-z0-9_-]{1,100}$/.test(itemId) || !Number.isInteger(targetCount) || targetCount < 0 || targetCount > 1_000_000) throw new HttpsError("invalid-argument", "بيانات تارجت الخدمة غير صحيحة");
  const collection = kind === "package" ? "packages" : kind === "offer" ? "offers" : "services";
  const [branch, itemSnapshot] = await Promise.all([readBranch(branchId), db.doc(`${collection}/${itemId}`).get()]);
  if (!itemSnapshot.exists || itemSnapshot.data()?.active === false) throw new HttpsError("not-found", "الخدمة أو الباقة غير موجودة");
  const item = itemSnapshot.data();
  if (Array.isArray(item.branchIds) && item.branchIds.length && !item.branchIds.includes(branch.id)) throw new HttpsError("failed-precondition", "العنصر غير متاح في هذا الفرع");
  const id = serviceTargetDocumentId({ month, branchId, kind, itemId });
  const ref = db.doc(`serviceTargets/${id}`);
  const now = FieldValue.serverTimestamp();
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    transaction.set(ref, {
      month,
      branchId,
      itemId,
      kind,
      nameAr: sanitizeText(item.nameAr, 120),
      nameEn: sanitizeText(item.nameEn || item.nameAr, 120),
      targetCount,
      achievedCount: Math.max(0, Number(existing.data()?.achievedCount || 0)),
      active: targetCount > 0,
      createdAt: existing.data()?.createdAt || now,
      updatedAt: now,
      updatedBy: request.auth.uid
    }, { merge: true });
    transaction.set(db.collection("activityLogs").doc(), { action: "upsert-service-target", targetType: "serviceTarget", targetId: id, branchId, month, itemId, kind, targetCount, actorUid: request.auth.uid, createdAt: now });
  });
  return { ok: true, id, ...calculateServiceTargetProgress(targetCount, 0) };
});

export const getAttendanceDashboard = onCall(adminOptions, async request => {
  requireRole(request, ["admin", "manager", "cashier"]);
  requirePermission(request, "attendance");
  const dateKey = sanitizeText(request.data?.dateKey || businessDateParts().dateKey, 10);
  const requestedBranch = sanitizeText(request.data?.branchId || "all", 40).toLowerCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || (requestedBranch !== "all" && !/^[a-z0-9-]{2,40}$/.test(requestedBranch))) throw new HttpsError("invalid-argument", "التاريخ أو الفرع غير صحيح");
  if (requestedBranch !== "all") requireBranchAccess(request, requestedBranch);
  const allowedBranches = branchesFor(request);
  const branchIds = requestedBranch !== "all" ? [requestedBranch] : allowedBranches.length ? allowedBranches : ["talkha", "mashaya"];
  const [attendanceSnapshots, taskSnapshots, staffSnapshot] = await Promise.all([
    Promise.all(branchIds.map(branchId => db.collection("attendanceDays").where("branchId", "==", branchId).where("dateKey", "==", dateKey).limit(300).get())),
    Promise.all(branchIds.map(branchId => db.collection("workerTasks").where("branchId", "==", branchId).limit(250).get())),
    db.collection("staff").where("active", "==", true).limit(500).get()
  ]);
  const attendance = new Map(attendanceSnapshots.flatMap(snapshot => snapshot.docs).map(document => [document.id, cleanDoc(document)]));
  const staff = staffSnapshot.docs.map(cleanDoc).filter(member => member.available !== false && Array.isArray(member.branchIds) && member.branchIds.some(id => branchIds.includes(id)));
  const rows = staff.map(member => {
    const record = attendance.get(`${dateKey}_${member.id}`);
    return { staffId: member.id, nameAr: member.nameAr || member.id, imageUrl: member.imageUrl || "", branchIds: member.branchIds, status: record?.status || "ABSENT", attendance: record || null };
  }).sort((a, b) => Number(Boolean(b.attendance)) - Number(Boolean(a.attendance)) || String(a.nameAr).localeCompare(String(b.nameAr), "ar"));
  const tasks = taskSnapshots.flatMap(snapshot => snapshot.docs.map(cleanDoc)).filter(item => !["DONE", "CANCELLED"].includes(item.status)).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 200);
  return { dateKey, branchId: requestedBranch, rows, tasks, presentCount: rows.filter(item => item.status === "PRESENT").length, _meta: { apiVersion: API_VERSION, minimumFrontendVersion: MIN_FRONTEND_VERSION } };
});

export const recordWorkerAttendance = onCall(adminOptions, async request => {
  requireRole(request, ["worker"]);
  requirePermission(request, "attendance");
  await enforceRateLimit(request, "worker_attendance", 20, 15 * 60 * 1000, request.auth.uid);
  const action = sanitizeText(request.data?.action || "checkIn", 20);
  const branchId = sanitizeText(request.data?.branchId, 40).toLowerCase();
  if (!["checkIn", "checkOut"].includes(action) || !/^[a-z0-9-]{2,40}$/.test(branchId)) throw new HttpsError("invalid-argument", "طلب الحضور غير صالح");
  requireBranchAccess(request, branchId);
  const staffId = await linkedStaffId(request);
  if (!staffId) throw new HttpsError("failed-precondition", "حساب العامل غير مرتبط بسجل فريق العمل");
  const [staffSnapshot, branchSnapshot] = await Promise.all([db.doc(`staff/${staffId}`).get(), db.doc(`branches/${branchId}`).get()]);
  if (!staffSnapshot.exists || staffSnapshot.data()?.active === false || !Array.isArray(staffSnapshot.data()?.branchIds) || !staffSnapshot.data().branchIds.includes(branchId)) throw new HttpsError("permission-denied", "العامل غير تابع لهذا الفرع");
  if (!branchSnapshot.exists || branchSnapshot.data()?.active === false) throw new HttpsError("failed-precondition", "الفرع غير متاح");
  const branch = branchSnapshot.data();
  let evidence;
  try {
    evidence = validateAttendanceLocation({
      branchLatitude: branch.latitude,
      branchLongitude: branch.longitude,
      latitude: request.data?.latitude,
      longitude: request.data?.longitude,
      accuracy: request.data?.accuracy,
      radiusMeters: branch.attendanceRadiusMeters || 100
    });
  } catch (error) {
    const messages = { INVALID_COORDINATES: "إحداثيات الموقع غير صحيحة", LOCATION_ACCURACY_TOO_LOW: "دقة GPS غير كافية؛ افتح الموقع وحاول في مكان مكشوف", INVALID_ATTENDANCE_RADIUS: "نطاق حضور الفرع غير مضبوط", OUTSIDE_BRANCH_GEOFENCE: "أنت خارج نطاق الفرع" };
    throw new HttpsError("failed-precondition", messages[error.message] || "تعذر التحقق من موقع الحضور");
  }
  const { dateKey, time } = businessDateParts();
  const ref = db.doc(`attendanceDays/${dateKey}_${staffId}`);
  const now = FieldValue.serverTimestamp();
  const result = await db.runTransaction(async transaction => {
    const current = await transaction.get(ref);
    if (action === "checkIn") {
      if (current.exists) {
        if (current.data()?.branchId !== branchId) throw new HttpsError("failed-precondition", "تم تسجيل حضورك اليوم في فرع آخر");
        return { idempotent: true, status: current.data()?.status || "PRESENT" };
      }
      transaction.create(ref, {
        staffId, staffNameAr: sanitizeText(staffSnapshot.data()?.nameAr, 100), userId: request.auth.uid, branchId, dateKey, checkInTime: time, checkInAt: now, status: "PRESENT",
        locationEvidence: { ...evidence, latitude: Number(Number(request.data?.latitude).toFixed(5)), longitude: Number(Number(request.data?.longitude).toFixed(5)) },
        createdAt: now, updatedAt: now
      });
      transaction.set(db.collection("activityLogs").doc(), { action: "worker-check-in", collection: "attendanceDays", entityId: ref.id, staffId, branchId, userId: request.auth.uid, distanceMeters: evidence.distanceMeters, createdAt: now });
      return { idempotent: false, status: "PRESENT" };
    }
    if (!current.exists) throw new HttpsError("failed-precondition", "سجل الحضور غير موجود");
    if (current.data()?.branchId !== branchId) throw new HttpsError("failed-precondition", "فرع الانصراف لا يطابق فرع الحضور");
    if (current.data()?.status === "CHECKED_OUT") return { idempotent: true, status: "CHECKED_OUT" };
    transaction.update(ref, { status: "CHECKED_OUT", checkOutTime: time, checkOutAt: now, checkOutEvidence: evidence, updatedAt: now });
    transaction.set(db.collection("activityLogs").doc(), { action: "worker-check-out", collection: "attendanceDays", entityId: ref.id, staffId, branchId, userId: request.auth.uid, createdAt: now });
    return { idempotent: false, status: "CHECKED_OUT" };
  });
  return { ok: true, dateKey, branchId, ...evidence, ...result };
});

export const getWorkerWorkspace = onCall(adminOptions, async request => {
  requireRole(request, ["worker"]);
  const staffId = await linkedStaffId(request);
  if (!staffId) throw new HttpsError("failed-precondition", "حساب العامل غير مرتبط بسجل فريق العمل");
  const { dateKey, month } = businessDateParts();
  const [staffSnapshot, attendanceSnapshot, totalSnapshot, bookingsSnapshot, tasksSnapshot, notificationsSnapshot] = await Promise.all([
    db.doc(`staff/${staffId}`).get(),
    db.doc(`attendanceDays/${dateKey}_${staffId}`).get(),
    db.doc(`workerMonthlyTotals/${month}_${staffId}`).get(),
    db.collection("bookings").where("staffId", "==", staffId).where("bookingDate", ">=", dateKey).orderBy("bookingDate").limit(60).get(),
    db.collection("workerTasks").where("assigneeStaffId", "==", staffId).orderBy("createdAt", "desc").limit(80).get(),
    db.collection("workerNotifications").where("staffId", "==", staffId).orderBy("createdAt", "desc").limit(30).get()
  ]);
  if (!staffSnapshot.exists || staffSnapshot.data()?.active === false) throw new HttpsError("permission-denied", "حساب العامل غير فعال");
  const staff = cleanDoc(staffSnapshot);
  const allowedBranches = branchesFor(request);
  if (!Array.isArray(staff.branchIds) || !staff.branchIds.some(id => allowedBranches.includes(id))) throw new HttpsError("permission-denied", "فروع الحساب لا تطابق سجل العامل");
  const revenue = Number(totalSnapshot.data()?.revenue || 0);
  const target = Math.max(0, Number(staff.monthlyTarget || 0));
  return {
    staff,
    attendance: attendanceSnapshot.exists ? cleanDoc(attendanceSnapshot) : null,
    bookings: bookingsSnapshot.docs.map(cleanDoc).filter(item => itemInAllowedBranch(item, allowedBranches) && !["cancelled", "rejected"].includes(item.status)),
    tasks: tasksSnapshot.docs.map(cleanDoc).filter(item => itemInAllowedBranch(item, allowedBranches)),
    notifications: notificationsSnapshot.docs.map(cleanDoc).filter(item => itemInAllowedBranch(item, allowedBranches)),
    target: { month, target, achieved: revenue, remaining: Math.max(0, target - revenue), progressPercent: target ? Math.min(100, Math.round(revenue / target * 100)) : 0 },
    dateKey,
    _meta: { apiVersion: API_VERSION, minimumFrontendVersion: MIN_FRONTEND_VERSION }
  };
});

export const updateWorkerProfilePhoto = onCall(adminOptions, async request => {
  requireRole(request, ["worker"]);
  const staffId = await linkedStaffId(request);
  const imageUrl = sanitizeText(request.data?.imageUrl, 1200);
  if (!staffId || !imageUrl) throw new HttpsError("invalid-argument", "صورة العامل غير صحيحة");
  let decoded = "";
  try { decoded = decodeURIComponent(new URL(imageUrl).pathname); } catch { throw new HttpsError("invalid-argument", "رابط الصورة غير صحيح"); }
  if (!decoded.includes(`/public/staff/${staffId}/`) && !decoded.includes(`/o/public/staff/${staffId}/`)) throw new HttpsError("permission-denied", "الصورة ليست ضمن مجلد العامل");
  const ref = db.doc(`staff/${staffId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data()?.active === false) throw new HttpsError("not-found", "العامل غير موجود");
  await ref.set({ imageUrl, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
  await markCatalogChanged();
  return { ok: true, imageUrl };
});

export const createWorkerTask = onCall(adminOptions, async request => {
  requirePermission(request, "tasks");
  requireRole(request, ["admin", "manager", "cashier"]);
  await enforceRateLimit(request, "create_worker_task", 100, 15 * 60 * 1000, request.auth.uid);
  const branchId = sanitizeText(request.data?.branchId, 40).toLowerCase();
  const assigneeStaffId = sanitizeText(request.data?.staffId, 100);
  const title = sanitizeText(request.data?.title, 120);
  const details = sanitizeText(request.data?.details, 600);
  const priority = sanitizeText(request.data?.priority || "normal", 20).toLowerCase();
  const bookingId = sanitizeText(request.data?.bookingId, 100);
  const idempotencyKey = sanitizeText(request.data?.idempotencyKey, 100);
  if (!branchId || !assigneeStaffId || !title || !["low", "normal", "high", "urgent"].includes(priority) || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new HttpsError("invalid-argument", "بيانات المهمة غير مكتملة");
  requireBranchAccess(request, branchId);
  const dueDate = request.data?.dueAt ? new Date(request.data.dueAt) : null;
  if (dueDate && !Number.isFinite(dueDate.getTime())) throw new HttpsError("invalid-argument", "موعد المهمة غير صحيح");
  const [staffSnapshot, bookingSnapshot] = await Promise.all([db.doc(`staff/${assigneeStaffId}`).get(), bookingId ? db.doc(`bookings/${bookingId}`).get() : Promise.resolve(null)]);
  if (!staffSnapshot.exists || staffSnapshot.data()?.active === false || !Array.isArray(staffSnapshot.data()?.branchIds) || !staffSnapshot.data().branchIds.includes(branchId)) throw new HttpsError("failed-precondition", "العامل غير متاح في هذا الفرع");
  if (bookingId && (!bookingSnapshot?.exists || bookingSnapshot.data()?.branchId !== branchId)) throw new HttpsError("failed-precondition", "الحجز غير موجود في هذا الفرع");
  const taskId = hash(`${request.auth.uid}|${idempotencyKey}`);
  const ref = db.doc(`workerTasks/${taskId}`);
  const now = FieldValue.serverTimestamp();
  let created = false;
  await db.runTransaction(async transaction => {
    const current = await transaction.get(ref);
    if (current.exists) return;
    created = true;
    transaction.create(ref, { branchId, assigneeStaffId, assigneeNameAr: sanitizeText(staffSnapshot.data()?.nameAr, 100), title, details, priority, bookingId: bookingId || null, dueAt: dueDate ? Timestamp.fromDate(dueDate) : null, status: "NEW", createdBy: request.auth.uid, createdByName: sanitizeText(request.auth.token.name || request.auth.token.email, 100), createdAt: now, updatedAt: now });
    transaction.set(db.collection("activityLogs").doc(), { action: "create-worker-task", collection: "workerTasks", entityId: taskId, staffId: assigneeStaffId, branchId, bookingId: bookingId || null, userId: request.auth.uid, createdAt: now });
  });
  if (created) {
    await db.doc(`workerNotifications/task_${taskId}`).set({ staffId: assigneeStaffId, branchId, type: "task", entityId: taskId, title: "مهمة جديدة", body: title, read: false, createdAt: FieldValue.serverTimestamp() });
    await sendWorkerPush(assigneeStaffId, { title: "مهمة جديدة من مزين مصر", body: title, type: "worker_task", entityId: taskId });
  }
  return { ok: true, taskId, idempotent: !created };
});

export const updateWorkerTask = onCall(adminOptions, async request => {
  const role = requireRole(request);
  const taskId = sanitizeText(request.data?.taskId, 100);
  const status = sanitizeText(request.data?.status, 30).toUpperCase();
  if (!taskId || !["SEEN", "IN_PROGRESS", "DONE", "CANCELLED"].includes(status)) throw new HttpsError("invalid-argument", "حالة المهمة غير صحيحة");
  const ref = db.doc(`workerTasks/${taskId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "المهمة غير موجودة");
  const task = snapshot.data();
  requireBranchAccess(request, task.branchId);
  if (role === "worker") {
    const staffId = await linkedStaffId(request);
    if (!staffId || task.assigneeStaffId !== staffId || status === "CANCELLED") throw new HttpsError("permission-denied", "لا يمكنك تعديل هذه المهمة");
  } else requirePermission(request, "tasks");
  if (task.status === status) return { ok: true, idempotent: true, status };
  const now = FieldValue.serverTimestamp();
  await ref.set({ status, ...(status === "SEEN" ? { readAt: now } : {}), ...(status === "DONE" ? { completedAt: now } : {}), updatedAt: now, updatedBy: request.auth.uid }, { merge: true });
  await db.collection("activityLogs").add({ action: "update-worker-task", collection: "workerTasks", entityId: taskId, staffId: task.assigneeStaffId, branchId: task.branchId, status, userId: request.auth.uid, createdAt: now });
  return { ok: true, idempotent: false, status };
});

export const notifyWorker = onCall(adminOptions, async request => {
  requireRole(request, ["admin", "manager", "cashier"]);
  if (!hasPermission(request, "tasks") && !hasPermission(request, "bookings")) throw new HttpsError("permission-denied", "لا تملك صلاحية تنبيه العامل");
  await enforceRateLimit(request, "notify_worker", 120, 15 * 60 * 1000, request.auth.uid);
  const staffId = sanitizeText(request.data?.staffId, 100);
  const branchId = sanitizeText(request.data?.branchId, 40).toLowerCase();
  const bookingId = sanitizeText(request.data?.bookingId, 100);
  const message = sanitizeText(request.data?.message || "عندك ميعاد الآن", 240);
  const idempotencyKey = sanitizeText(request.data?.idempotencyKey, 100);
  if (!staffId || !branchId || !message || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new HttpsError("invalid-argument", "طلب التنبيه غير صحيح");
  requireBranchAccess(request, branchId);
  const [staffSnapshot, bookingSnapshot] = await Promise.all([db.doc(`staff/${staffId}`).get(), bookingId ? db.doc(`bookings/${bookingId}`).get() : Promise.resolve(null)]);
  if (!staffSnapshot.exists || staffSnapshot.data()?.active === false || !Array.isArray(staffSnapshot.data()?.branchIds) || !staffSnapshot.data().branchIds.includes(branchId)) throw new HttpsError("failed-precondition", "العامل غير متاح في هذا الفرع");
  if (bookingId && (!bookingSnapshot?.exists || bookingSnapshot.data()?.branchId !== branchId || bookingSnapshot.data()?.staffId !== staffId)) throw new HttpsError("failed-precondition", "الحجز غير مرتبط بهذا العامل");
  const notificationId = hash(`${request.auth.uid}|${idempotencyKey}`);
  const ref = db.doc(`workerNotifications/${notificationId}`);
  let created = false;
  await db.runTransaction(async transaction => {
    const current = await transaction.get(ref);
    if (current.exists) return;
    created = true;
    const now = FieldValue.serverTimestamp();
    transaction.create(ref, { staffId, staffNameAr: sanitizeText(staffSnapshot.data()?.nameAr, 100), branchId, bookingId: bookingId || null, type: "alert", entityId: bookingId || notificationId, title: `تنبيه ${sanitizeText(staffSnapshot.data()?.nameAr, 80)}`, body: message, read: false, createdBy: request.auth.uid, createdAt: now });
    transaction.set(db.collection("activityLogs").doc(), { action: "notify-worker", collection: "workerNotifications", entityId: notificationId, staffId, branchId, bookingId: bookingId || null, userId: request.auth.uid, createdAt: now });
  });
  const delivery = created ? await sendWorkerPush(staffId, { title: `تنبيه ${sanitizeText(staffSnapshot.data()?.nameAr, 80)}`, body: message, type: "worker_alert", entityId: bookingId || notificationId }) : { attempted: 0, sent: 0 };
  return { ok: true, notificationId, idempotent: !created, delivery };
});

function cashAmount(value, label = "المبلغ") {
  const amount = Math.round(Number(value || 0) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) throw new HttpsError("invalid-argument", `${label} غير صحيح`);
  return amount;
}

function requireCashPermission(request, type = "read") {
  requireRole(request);
  if (!hasPermission(request, "pos") && !hasPermission(request, "revenue") && !(type === "out" && hasPermission(request, "expenses"))) throw new HttpsError("permission-denied", "لا تملك صلاحية درج الكاش");
}

export const openCashShift = onCall(adminOptions, async request => {
  requireCashPermission(request);
  const branch = await readBranch(request.data?.branchId);
  requireBranchAccess(request, branch.id);
  const openingCash = cashAmount(request.data?.openingCash, "رصيد البداية");
  const idempotencyKey = sanitizeText(request.data?.idempotencyKey, 100);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new HttpsError("invalid-argument", "تعذر تأمين فتح الوردية");
  const { dateKey } = businessDateParts();
  const shiftRef = db.doc(`cashShifts/shift_${hash(`${branch.id}|${request.auth.uid}|${idempotencyKey}`)}`);
  const stateRef = db.doc(`cashShiftState/${branch.id}`);
  return db.runTransaction(async transaction => {
    const [state, existing, closing] = await transaction.getAll(stateRef, shiftRef, db.doc(`dailyClosings/${branch.id}_${dateKey}`));
    if (existing.exists) return { ok: true, idempotent: true, shift: cleanDoc(existing) };
    if (state.data()?.openShiftId) throw new HttpsError("already-exists", "توجد وردية مفتوحة بالفعل لهذا الفرع");
    if (closing.exists) throw new HttpsError("failed-precondition", "تم إغلاق يوم الفرع");
    const now = FieldValue.serverTimestamp();
    const record = { branchId: branch.id, businessDate: dateKey, cashierUid: request.auth.uid, cashierName: request.auth.token.name || request.auth.token.email || request.auth.uid, openingCash, cashSales: 0, cashIn: 0, cashOut: 0, cashRefunds: 0, expectedCash: openingCash, status: "OPEN", openedAt: now, openedBy: request.auth.uid, createdAt: now, updatedAt: now };
    transaction.create(shiftRef, record);
    transaction.set(stateRef, { branchId: branch.id, openShiftId: shiftRef.id, businessDate: dateKey, status: "OPEN", updatedAt: now });
    transaction.set(db.collection("activityLogs").doc(), { action: "open-cash-shift", targetType: "cashShift", targetId: shiftRef.id, branchId: branch.id, amount: openingCash, actorUid: request.auth.uid, requestId: idempotencyKey, createdAt: now });
    return { ok: true, shiftId: shiftRef.id, shift: { id: shiftRef.id, ...record, openedAt: new Date().toISOString(), createdAt: new Date().toISOString() } };
  });
});

export const addCashMovement = onCall(adminOptions, async request => {
  const type = sanitizeText(request.data?.type, 20).toUpperCase();
  if (!['CASH_IN', 'CASH_OUT'].includes(type)) throw new HttpsError("invalid-argument", "نوع حركة الدرج غير صحيح");
  requireCashPermission(request, type === "CASH_OUT" ? "out" : "in");
  const branch = await readBranch(request.data?.branchId);
  requireBranchAccess(request, branch.id);
  const amount = cashAmount(request.data?.amount);
  const reason = sanitizeText(request.data?.reason, 200);
  const category = sanitizeText(request.data?.category, 60);
  const note = sanitizeText(request.data?.note, 300);
  const idempotencyKey = sanitizeText(request.data?.idempotencyKey, 100);
  if (!amount || !reason || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new HttpsError("invalid-argument", "المبلغ والسبب مطلوبان");
  const stateRef = db.doc(`cashShiftState/${branch.id}`);
  const movementRef = db.doc(`cashMovements/movement_${hash(`${request.auth.uid}|${idempotencyKey}`)}`);
  const { dateKey } = businessDateParts();
  return db.runTransaction(async transaction => {
    const [state, existing, closing] = await transaction.getAll(stateRef, movementRef, db.doc(`dailyClosings/${branch.id}_${dateKey}`));
    if (existing.exists) return { ok: true, idempotent: true, movementId: movementRef.id };
    const shiftId = sanitizeText(state.data()?.openShiftId, 100);
    if (!shiftId || state.data()?.status !== "OPEN") throw new HttpsError("failed-precondition", "لا توجد وردية كاش مفتوحة");
    if (closing.exists) throw new HttpsError("failed-precondition", "تم إغلاق يوم الفرع");
    const shiftRef = db.doc(`cashShifts/${shiftId}`);
    const shift = await transaction.get(shiftRef);
    if (!shift.exists || shift.data().status !== "OPEN") throw new HttpsError("failed-precondition", "وردية الكاش غير مفتوحة");
    const now = FieldValue.serverTimestamp();
    const incrementField = type === "CASH_IN" ? "cashIn" : "cashOut";
    const next = { ...shift.data(), [incrementField]: Number(shift.data()[incrementField] || 0) + amount };
    transaction.create(movementRef, { type, amount, reason, category: type === "CASH_OUT" ? category || "other" : null, note, branchId: branch.id, shiftId, businessDate: dateKey, actorUid: request.auth.uid, actorName: request.auth.token.name || request.auth.token.email || request.auth.uid, createdAt: now });
    transaction.update(shiftRef, { [incrementField]: FieldValue.increment(amount), expectedCash: calculateExpectedCash(next), updatedAt: now });
    transaction.set(db.collection("activityLogs").doc(), { action: type === "CASH_IN" ? "cash-in" : "cash-out", targetType: "cashMovement", targetId: movementRef.id, branchId: branch.id, amount, reason, actorUid: request.auth.uid, requestId: idempotencyKey, createdAt: now });
    return { ok: true, movementId: movementRef.id, expectedCash: calculateExpectedCash(next) };
  });
});

export const closeCashShift = onCall(adminOptions, async request => {
  requireCashPermission(request);
  const branch = await readBranch(request.data?.branchId);
  requireBranchAccess(request, branch.id);
  const actualCash = cashAmount(request.data?.actualCash, "الرصيد الفعلي");
  const reason = sanitizeText(request.data?.reason, 300);
  const idempotencyKey = sanitizeText(request.data?.idempotencyKey, 100);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new HttpsError("invalid-argument", "تعذر تأمين إغلاق الوردية");
  const stateRef = db.doc(`cashShiftState/${branch.id}`);
  return db.runTransaction(async transaction => {
    const state = await transaction.get(stateRef);
    const shiftId = sanitizeText(state.data()?.openShiftId, 100);
    if (!shiftId) {
      if (state.data()?.lastCloseRequestId === idempotencyKey) return { ok: true, idempotent: true, shiftId: state.data()?.lastClosedShiftId };
      throw new HttpsError("failed-precondition", "لا توجد وردية مفتوحة");
    }
    const shiftRef = db.doc(`cashShifts/${shiftId}`);
    const shift = await transaction.get(shiftRef);
    if (!shift.exists || shift.data().status !== "OPEN") throw new HttpsError("failed-precondition", "الوردية مغلقة بالفعل");
    const expectedCash = calculateExpectedCash(shift.data());
    const variance = Math.round((actualCash - expectedCash) * 100) / 100;
    if (variance !== 0 && !reason) throw new HttpsError("invalid-argument", "سبب العجز أو الزيادة مطلوب");
    const now = FieldValue.serverTimestamp();
    transaction.update(shiftRef, { status: "CLOSED", expectedCash, actualCash, variance, closeReason: reason || null, closedAt: now, closedBy: request.auth.uid, updatedAt: now });
    transaction.set(stateRef, { branchId: branch.id, openShiftId: null, status: "CLOSED", lastClosedShiftId: shiftId, lastCloseRequestId: idempotencyKey, updatedAt: now });
    transaction.set(db.collection("activityLogs").doc(), { action: "close-cash-shift", targetType: "cashShift", targetId: shiftId, branchId: branch.id, expectedCash, actualCash, variance, reason: reason || null, actorUid: request.auth.uid, requestId: idempotencyKey, createdAt: now });
    return { ok: true, shiftId, expectedCash, actualCash, variance };
  });
});

export const getCashOperations = onCall(adminOptions, async request => {
  requireCashPermission(request);
  const branch = await readBranch(request.data?.branchId);
  requireBranchAccess(request, branch.id);
  const state = await db.doc(`cashShiftState/${branch.id}`).get();
  const shiftId = sanitizeText(state.data()?.openShiftId || state.data()?.lastClosedShiftId, 100);
  const [shift, movements] = await Promise.all([
    shiftId ? db.doc(`cashShifts/${shiftId}`).get() : null,
    db.collection("cashMovements").where("branchId", "==", branch.id).orderBy("createdAt", "desc").limit(50).get()
  ]);
  return { state: state.exists ? cleanDoc(state) : null, shift: shift?.exists ? cleanDoc(shift) : null, movements: movements.docs.map(cleanDoc) };
});

export const getBookingCalendar = onCall(adminOptions, async request => {
  if (!hasPermission(request, "bookings") && !hasPermission(request, "schedule")) throw new HttpsError("permission-denied", "لا تملك صلاحية تقويم الحجوزات");
  const from = sanitizeText(request.data?.from || businessDateParts().dateKey, 10);
  const to = sanitizeText(request.data?.to || from, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpsError("invalid-argument", "نطاق التقويم غير صحيح");
  const span = (new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000;
  if (span < 0 || span > 7) throw new HttpsError("invalid-argument", "حمّل يومًا أو أسبوعًا واحدًا فقط");
  const allowedBranches = branchesFor(request);
  const snapshots = await Promise.all(scopedQueries("bookings", allowedBranches, query => query.where("bookingDate", ">=", from).where("bookingDate", "<=", to).orderBy("bookingDate", "asc").orderBy("bookingTime", "asc").limit(500)).map(query => query.get()));
  const unique = new Map();
  snapshots.forEach(snapshot => snapshot.docs.forEach(document => unique.set(document.id, cleanDoc(document))));
  const bookings = [...unique.values()].filter(item => item.source !== "pos");
  const staffIds = [...new Set(bookings.map(item => item.staffId).filter(id => id && id !== "none"))];
  const staffSnapshots = staffIds.length ? await db.getAll(...staffIds.map(id => db.doc(`staff/${id}`))) : [];
  return { from, to, bookings, staff: staffSnapshots.filter(item => item.exists).map(cleanDoc) };
});

export const getCustomer360 = onCall(adminOptions, async request => {
  if (!hasPermission(request, "customers") && !hasPermission(request, "pos")) throw new HttpsError("permission-denied", "لا تملك صلاحية ملف العميل");
  const customerId = sanitizeText(request.data?.customerId, 100);
  const customerSnapshot = await db.doc(`customers/${customerId}`).get();
  if (!customerSnapshot.exists) throw new HttpsError("not-found", "العميل غير موجود");
  const customer = cleanDoc(customerSnapshot);
  if (!itemInAllowedBranch(customer, branchesFor(request))) throw new HttpsError("permission-denied", "العميل تابع لفرع غير مسموح");
  const [bookingsSnapshot, walletSnapshot] = await Promise.all([
    db.collection("bookings").where("phoneHash", "==", customerId).orderBy("createdAt", "desc").limit(30).get(),
    hasPermission(request, "rewards") ? db.collection("walletTransactions").where("customerId", "==", customerId).orderBy("createdAt", "desc").limit(12).get() : { docs: [] }
  ]);
  const bookings = bookingsSnapshot.docs.map(cleanDoc).filter(item => itemInAllowedBranch(item, branchesFor(request)));
  const completed = bookings.filter(item => item.status === "completed");
  return {
    customer,
    overview: {
      totalVisits: Number(customer.bookingCount || bookings.length),
      completedVisits: Number(customer.completedVisits || completed.length),
      cancellations: Number(customer.cancellationCount || bookings.filter(item => item.status === "cancelled").length),
      noShows: Number(customer.noShowCount || bookings.filter(item => item.status === "no_show").length),
      totalSpent: Number(customer.totalSpent || 0),
      averageTicket: Number(customer.completedVisits || completed.length) ? Number(customer.totalSpent || 0) / Number(customer.completedVisits || completed.length) : 0,
      favoriteWorkerId: customer.favoriteStaffId || customer.favoriteWorkerId || null,
      preferredBranch: customer.lastBranchId || null
    },
    upcoming: bookings.filter(item => ["pending", "confirmed", "arrived"].includes(item.status)).slice(0, 10),
    bookingHistory: bookings.filter(item => item.source !== "pos").slice(0, 12),
    orders: bookings.filter(item => item.source === "pos").slice(0, 12),
    wallet: walletSnapshot.docs.map(cleanDoc)
  };
});

export const closeBusinessDay = onCall(adminOptions, async request => {
  const access = permissionsFor(request);
  if (request.auth.token.role !== "admin" && !(access.has("revenue") && access.has("expenses"))) throw new HttpsError("permission-denied", "إغلاق اليوم يحتاج صلاحية الإيرادات والمصروفات");
  const branch = await readBranch(request.data?.branchId);
  requireBranchAccess(request, branch.id);
  const businessDate = sanitizeText(request.data?.businessDate || businessDateParts().dateKey, 10);
  const actualCash = cashAmount(request.data?.actualCash, "الرصيد الفعلي");
  const reason = sanitizeText(request.data?.reason, 300);
  const idempotencyKey = sanitizeText(request.data?.idempotencyKey, 100);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(businessDate) || businessDate > businessDateParts().dateKey || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new HttpsError("invalid-argument", "بيانات إغلاق اليوم غير صحيحة");
  const scoped = [branch.id];
  const [gross, net, refunds, cashNet, expenses, shifts, orderCount, refundCount] = await Promise.all([
    aggregateScoped("revenueLedger", scoped, query => query.where("dateKey", "==", businessDate).where("type", "==", "payment"), { amount: AggregateField.sum("amount") }),
    aggregateScoped("revenueLedger", scoped, query => query.where("dateKey", "==", businessDate), { amount: AggregateField.sum("amount") }),
    aggregateScoped("revenueLedger", scoped, query => query.where("dateKey", "==", businessDate).where("type", "==", "refund"), { amount: AggregateField.sum("amount") }),
    aggregateScoped("revenueLedger", scoped, query => query.where("dateKey", "==", businessDate).where("paymentMethod", "==", "cash"), { amount: AggregateField.sum("amount") }),
    aggregateScoped("expenses", scoped, query => query.where("dateKey", "==", businessDate), { amount: AggregateField.sum("amount") }),
    sumCashShifts(scoped, businessDate),
    aggregateScoped("bookings", scoped, query => query.where("bookingDate", "==", businessDate).where("source", "==", "pos")),
    aggregateScoped("revenueLedger", scoped, query => query.where("dateKey", "==", businessDate).where("type", "==", "refund"))
  ]);
  const expectedCash = calculateExpectedCash(shifts);
  const variance = Math.round((actualCash - expectedCash) * 100) / 100;
  if (variance !== 0 && !reason) throw new HttpsError("invalid-argument", "سبب فرق الدرج مطلوب");
  const closingRef = db.doc(`dailyClosings/${branch.id}_${businessDate}`);
  const stateRef = db.doc(`cashShiftState/${branch.id}`);
  return db.runTransaction(async transaction => {
    const [existing, state] = await transaction.getAll(closingRef, stateRef);
    if (existing.exists) return { ok: true, idempotent: true, closing: cleanDoc(existing) };
    if (state.data()?.openShiftId) throw new HttpsError("failed-precondition", "أغلق وردية الكاش أولًا");
    const now = FieldValue.serverTimestamp();
    const record = { branchId: branch.id, businessDate, grossSales: gross.amount, netSales: net.amount, cashSales: cashNet.amount, otherPayments: net.amount - cashNet.amount, expenses: expenses.amount, refunds: Math.abs(refunds.amount), cashIn: shifts.cashIn || 0, cashOut: shifts.cashOut || 0, expectedCash, actualCash, variance, ordersCount: orderCount.count, refundCount: refundCount.count, reason: reason || null, status: "CLOSED", closedBy: request.auth.uid, closedByName: request.auth.token.name || request.auth.token.email || request.auth.uid, closedAt: now, createdAt: now };
    transaction.create(closingRef, record);
    transaction.set(db.collection("activityLogs").doc(), { action: "close-business-day", targetType: "dailyClosing", targetId: closingRef.id, branchId: branch.id, businessDate, expectedCash, actualCash, variance, reason: reason || null, actorUid: request.auth.uid, requestId: idempotencyKey, createdAt: now });
    return { ok: true, closingId: closingRef.id, closing: { id: closingRef.id, ...record, closedAt: new Date().toISOString() } };
  });
});

export const recordExpense = onCall(adminOptions, async request => {
  requirePermission(request, "expenses");
  let input;
  try { input = normalizeExpenseInput(request.data, { defaultDate: businessDateParts().dateKey, categories: EXPENSE_CATEGORIES }); }
  catch (error) {
    const messages = { INVALID_EXPENSE_AMOUNT: "قيمة المصروف يجب أن تكون أكبر من صفر", INVALID_EXPENSE_CATEGORY: "اختر تصنيفًا صحيحًا", INVALID_EXPENSE_DESCRIPTION: "اكتب بيان المصروف", INVALID_EXPENSE_BRANCH: "اختر فرعًا صحيحًا", INVALID_EXPENSE_DATE: "تاريخ المصروف غير صحيح", INVALID_STOCK_QUANTITY: "كمية المخزون غير صحيحة", INVALID_PAYMENT_METHOD: "طريقة الدفع غير صحيحة", INVALID_IDEMPOTENCY_KEY: "تعذر تأمين العملية؛ حدّث الصفحة وحاول مرة أخرى" };
    throw new HttpsError("invalid-argument", messages[error.message] || "بيانات المصروف غير صحيحة");
  }
  requireBranchAccess(request, input.branchId);
  if (input.dateKey > businessDateParts().dateKey) throw new HttpsError("invalid-argument", "لا يمكن تسجيل مصروف بتاريخ مستقبلي");
  const expenseRef = input.idempotencyKey ? db.doc(`expenses/expense_${hash(`${request.auth.uid}|${input.idempotencyKey}`)}`) : db.collection("expenses").doc();
  const inventoryRef = input.inventoryItemId ? db.doc(`inventoryItems/${input.inventoryItemId}`) : null;
  const activityRef = db.collection("activityLogs").doc();
  const settings = await readSettings();
  return db.runTransaction(async transaction => {
    const existingExpense = await transaction.get(expenseRef);
    if (existingExpense.exists) {
      if (existingExpense.data().createdBy !== request.auth.uid) throw new HttpsError("already-exists", "تعذر تأمين العملية؛ استخدم محاولة جديدة");
      return { ok: true, id: expenseRef.id, idempotent: true };
    }
    const inventorySnapshot = inventoryRef ? await transaction.get(inventoryRef) : null;
    if (inventoryRef && !inventorySnapshot.exists) throw new HttpsError("not-found", "صنف المخزون غير موجود");
    if (inventorySnapshot?.exists && inventorySnapshot.data().branchId !== input.branchId) throw new HttpsError("failed-precondition", "صنف المخزون تابع لفرع آخر");
    const closing = await transaction.get(db.doc(`dailyClosings/${input.branchId}_${input.dateKey}`));
    if (closing.exists) throw new HttpsError("failed-precondition", "تم إغلاق يوم الفرع؛ لا يمكن تسجيل مصروف عليه");
    let cashShiftRef = null;
    let cashShift = null;
    if (input.paymentMethod === "cash" && settings.cashDrawerEnabled === true) {
      const cashState = await transaction.get(db.doc(`cashShiftState/${input.branchId}`));
      const shiftId = sanitizeText(cashState.data()?.openShiftId, 100);
      if (!shiftId || cashState.data()?.status !== "OPEN") throw new HttpsError("failed-precondition", "افتح وردية الكاش قبل تسجيل مصروف نقدي");
      cashShiftRef = db.doc(`cashShifts/${shiftId}`);
      cashShift = await transaction.get(cashShiftRef);
      if (!cashShift.exists || cashShift.data().status !== "OPEN") throw new HttpsError("failed-precondition", "وردية الكاش غير مفتوحة");
    }
    const now = FieldValue.serverTimestamp();
    transaction.create(expenseRef, { ...input, idempotencyKey: null, inventoryItemId: inventoryRef ? input.inventoryItemId : null, inventoryCategory: inventorySnapshot?.data()?.category || null, stockQuantity: inventoryRef ? input.stockQuantity : 0, cashMovementId: cashShiftRef ? `expense_${expenseRef.id}` : null, createdAt: now, createdBy: request.auth.uid, createdByEmail: request.auth.token.email || "", createdByName: request.auth.token.name || request.auth.token.email || request.auth.uid });
    if (inventorySnapshot?.exists && input.stockQuantity > 0) {
      const oldQuantity = Math.max(0, Number(inventorySnapshot.data().stockQty || 0));
      const oldCost = Math.max(0, Number(inventorySnapshot.data().costPrice || 0));
      const weightedCost = (oldQuantity * oldCost + input.amount) / (oldQuantity + input.stockQuantity);
      transaction.update(inventoryRef, { stockQty: FieldValue.increment(input.stockQuantity), costPrice: Math.round(weightedCost * 100) / 100, updatedAt: now });
      transaction.create(db.doc(`stockMovements/purchase_${expenseRef.id}`), { inventoryItemId: input.inventoryItemId, branchId: input.branchId, expenseId: expenseRef.id, quantity: input.stockQuantity, amount: input.amount, type: "purchase", dateKey: input.dateKey, createdAt: now, createdBy: request.auth.uid });
    }
    if (cashShiftRef && cashShift) {
      const nextShift = { ...cashShift.data(), cashOut: Number(cashShift.data().cashOut || 0) + input.amount };
      transaction.update(cashShiftRef, { cashOut: FieldValue.increment(input.amount), expectedCash: calculateExpectedCash(nextShift), updatedAt: now });
      transaction.create(db.doc(`cashMovements/expense_${expenseRef.id}`), { type: "CASH_OUT", amount: input.amount, reason: input.description, category: input.category, expenseId: expenseRef.id, branchId: input.branchId, shiftId: cashShiftRef.id, businessDate: input.dateKey, actorUid: request.auth.uid, createdAt: now });
    }
    transaction.set(activityRef, { action: input.kind === "purchase" ? "record-purchase" : "record-expense", collection: "expenses", entityId: expenseRef.id, branchId: input.branchId, amount: input.amount, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: now });
    return { ok: true, id: expenseRef.id };
  });
});

export const updateExpense = onCall(adminOptions, async request => {
  requirePermission(request, "expenses");
  const id = sanitizeText(request.data?.id, 100);
  if (!id) throw new HttpsError("invalid-argument", "المصروف المطلوب تعديله غير محدد");
  let input;
  try { input = normalizeExpenseInput(request.data, { defaultDate: businessDateParts().dateKey, categories: EXPENSE_CATEGORIES }); }
  catch { throw new HttpsError("invalid-argument", "راجع قيمة المصروف والبيان والتاريخ والفرع وطريقة الدفع"); }
  requireBranchAccess(request, input.branchId);
  if (input.dateKey > businessDateParts().dateKey) throw new HttpsError("invalid-argument", "لا يمكن تسجيل مصروف بتاريخ مستقبلي");
  const expenseRef = db.doc(`expenses/${id}`);
  const activityRef = db.collection("activityLogs").doc();
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(expenseRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "المصروف غير موجود");
    const before = snapshot.data();
    requireBranchAccess(request, before.branchId);
    if (before.payrollPaymentId) throw new HttpsError("failed-precondition", "مصروف الراتب يُعدّل من عملية صرف الراتب المرتبطة به");
    if (before.cashMovementId) throw new HttpsError("failed-precondition", "المصروف مرتبط بدرج الكاش؛ سجّل حركة عكسية ثم مصروفًا جديدًا بدل التعديل");
    const closingRefs = [...new Set([`${before.branchId}_${before.dateKey}`, `${input.branchId}_${input.dateKey}`])].map(key => db.doc(`dailyClosings/${key}`));
    const closingSnapshots = await transaction.getAll(...closingRefs);
    if (closingSnapshots.some(item => item.exists)) throw new HttpsError("failed-precondition", "لا يمكن تعديل مصروف في يوم مالي مغلق");
    const oldRef = before.inventoryItemId ? db.doc(`inventoryItems/${before.inventoryItemId}`) : null;
    const newRef = input.inventoryItemId ? db.doc(`inventoryItems/${input.inventoryItemId}`) : null;
    const refs = [...new Map([oldRef, newRef].filter(Boolean).map(ref => [ref.path, ref])).values()];
    const inventorySnapshots = refs.length ? await transaction.getAll(...refs) : [];
    const inventoryByPath = new Map(inventorySnapshots.map(item => [item.ref.path, item]));
    if (newRef && !inventoryByPath.get(newRef.path)?.exists) throw new HttpsError("not-found", "صنف المخزون غير موجود");
    if (newRef && inventoryByPath.get(newRef.path).data().branchId !== input.branchId) throw new HttpsError("failed-precondition", "صنف المخزون تابع لفرع آخر");
    const now = FieldValue.serverTimestamp();
    for (const ref of refs) {
      const item = inventoryByPath.get(ref.path);
      if (!item?.exists) continue;
      const oldQty = oldRef?.path === ref.path ? Math.max(0, Number(before.stockQuantity || 0)) : 0;
      const newQty = newRef?.path === ref.path ? input.stockQuantity : 0;
      const currentQty = Math.max(0, Number(item.data().stockQty || 0));
      const nextQty = currentQty - oldQty + newQty;
      if (nextQty < 0) throw new HttpsError("failed-precondition", "لا يمكن تعديل الكمية بعد بيع جزء من المخزون؛ احذف العملية وأعد تسجيلها بعد مراجعة الرصيد");
      const currentAsset = currentQty * Math.max(0, Number(item.data().costPrice || 0));
      const nextAsset = Math.max(0, currentAsset - (oldQty ? Number(before.amount || 0) : 0) + (newQty ? input.amount : 0));
      transaction.update(ref, { stockQty: nextQty, ...(nextQty > 0 ? { costPrice: Math.round(nextAsset / nextQty * 100) / 100 } : {}), updatedAt: now });
    }
    transaction.set(expenseRef, { ...input, idempotencyKey: null, inventoryItemId: newRef ? input.inventoryItemId : null, inventoryCategory: newRef ? inventoryByPath.get(newRef.path).data().category || null : null, stockQuantity: newRef ? input.stockQuantity : 0, updatedAt: now, updatedBy: request.auth.uid, updatedByEmail: request.auth.token.email || "" }, { merge: true });
    transaction.delete(db.doc(`stockMovements/purchase_${id}`));
    if (newRef && input.stockQuantity > 0) transaction.set(db.doc(`stockMovements/purchase_${id}`), { inventoryItemId: input.inventoryItemId, branchId: input.branchId, expenseId: id, quantity: input.stockQuantity, amount: input.amount, type: "purchase", dateKey: input.dateKey, updatedAt: now, createdBy: before.createdBy || request.auth.uid });
    transaction.set(activityRef, { action: "update-expense", collection: "expenses", entityId: id, branchId: input.branchId, before: { amount: before.amount || 0, category: before.category || "other", branchId: before.branchId || "" }, after: { amount: input.amount, category: input.category, branchId: input.branchId }, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: now });
    return { ok: true, id };
  });
});

export const createPosOrder = onCall(adminOptions, async request => {
  requirePermission(request, "pos");
  const operationStarted = Date.now();
  await enforceRateLimit(request, "pos_finalize", 120, 15 * 60 * 1000, request.auth.uid);
  const idempotencyKey = sanitizeText(request.data?.idempotencyKey, 100);
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new HttpsError("invalid-argument", "تعذر تأمين الطلب؛ حدّث الصفحة وحاول مرة أخرى");
  const branch = await readBranch(request.data?.branchId);
  requireBranchAccess(request, branch.id);
  const customer = {
    firstName: sanitizeText(request.data?.customer?.firstName, 50),
    lastName: sanitizeText(request.data?.customer?.lastName, 50),
    phone: ""
  };
  try { customer.phone = normalizePhone(request.data?.customer?.phone); }
  catch { throw new HttpsError("invalid-argument", "رقم هاتف العميل غير صحيح"); }
  if (!customer.firstName) throw new HttpsError("invalid-argument", "اكتب اسم العميل");
  const rawLines = Array.isArray(request.data?.items) ? request.data.items.slice(0, 40) : [];
  if (!rawLines.length || rawLines.some(line => !sanitizeText(line?.id, 100) || !["service", "package", "offer", "product", "inventory", "drink"].includes(sanitizeText(line?.kind, 20)))) throw new HttpsError("invalid-argument", "عناصر الشيك غير صحيحة");
  const catalogLines = rawLines.filter(line => !["inventory", "drink"].includes(line.kind));
  const inventoryLines = rawLines.filter(line => line.kind === "inventory");
  const drinkLines = rawLines.filter(line => line.kind === "drink");
  if (new Set(inventoryLines.map(line => sanitizeText(line.id, 100))).size !== inventoryLines.length) throw new HttpsError("invalid-argument", "لا تكرر نفس صنف المخزون في الطلب");
  if (new Set(drinkLines.map(line => sanitizeText(line.id, 100))).size !== drinkLines.length) throw new HttpsError("invalid-argument", "لا تكرر نفس المشروب في الطلب");
  let catalogItems = [];
  if (catalogLines.length) {
    try { catalogItems = await fetchPricedItems(catalogLines, branch.id); }
    catch (error) { throw new HttpsError("failed-precondition", error.message); }
  }
  const legacyStaffId = sanitizeText(request.data?.staffId || "none", 100);
  const requestedWorkerIds = [...new Set(rawLines.map(line => sanitizeText(line.workerId || legacyStaffId, 100)).filter(id => id && id !== "none"))];
  const staffSnapshots = requestedWorkerIds.length ? await db.getAll(...requestedWorkerIds.map(id => db.doc(`staff/${id}`))) : [];
  const workers = new Map(staffSnapshots.map(snapshot => [snapshot.id, cleanDoc(snapshot)]));
  for (const workerId of requestedWorkerIds) {
    const worker = workers.get(workerId);
    if (!worker || worker.active === false || !Array.isArray(worker.branchIds) || !worker.branchIds.includes(branch.id)) throw new HttpsError("failed-precondition", "أحد العمال غير متاح في الفرع المختار أو يحتاج تحديد فرعه من الإدارة");
  }
  const method = sanitizeText(request.data?.paymentMethod || "cash", 30);
  if (!["cash", "vodafone_cash", "instapay", "other"].includes(method)) throw new HttpsError("invalid-argument", "طريقة الدفع غير صحيحة");
  const paid = request.data?.paid !== false;
  const code = bookingCode(branch.code);
  const bookingRef = db.doc(`bookings/${code}`);
  const customerRef = db.doc(`customers/${hash(customer.phone)}`);
  const ledgerRef = db.doc(`revenueLedger/payment_${code}`);
  const inventoryRefs = inventoryLines.map(line => db.doc(`inventoryItems/${sanitizeText(line.id, 100)}`));
  const drinkRefs = drinkLines.map(line => db.doc(`drinks/${sanitizeText(line.id, 100)}`));
  const activityRef = db.collection("activityLogs").doc();
  const idempotencyRef = db.doc(`posOrderGuards/${hash(`${request.auth.uid}|${idempotencyKey}`)}`);
  const { dateKey, time } = businessDateParts();
  const settings = await readSettings();
  return db.runTransaction(async transaction => {
    const existingGuard = await transaction.get(idempotencyRef);
    if (existingGuard.exists) {
      const existingCode = sanitizeText(existingGuard.data().bookingCode, 100);
      const existingReceipt = existingCode ? await transaction.get(db.doc(`bookings/${existingCode}`)) : null;
      return { ok: true, bookingCode: existingCode, total: existingGuard.data().total, paymentStatus: existingGuard.data().paymentStatus, idempotent: true, receipt: existingReceipt?.exists ? cleanDoc(existingReceipt) : null };
    }
    const inventorySnapshots = inventoryRefs.length ? await transaction.getAll(...inventoryRefs) : [];
    const inventoryItems = inventorySnapshots.map((snapshot, index) => {
      if (!snapshot.exists || snapshot.data().active === false || snapshot.data().category === "supply") throw new HttpsError("failed-precondition", "أحد أصناف البضاعة غير متاح للبيع");
      const source = snapshot.data();
      const qty = Math.max(1, Math.min(100, Math.floor(Number(inventoryLines[index].qty || 1))));
      if (Number(source.stockQty || 0) < qty) throw new HttpsError("failed-precondition", `الكمية غير كافية من ${source.nameAr || "الصنف"}`);
      const unitPrice = Number(source.sellingPrice || 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new HttpsError("failed-precondition", "سعر الصنف غير صحيح");
      return { id: snapshot.id, kind: "inventory", category: source.category, nameAr: source.nameAr, nameEn: source.nameEn || source.nameAr, option: null, qty, unitPrice, lineTotal: unitPrice * qty, duration: 0, staffRequired: false, ref: snapshot.ref };
    });
    const drinkSnapshots = drinkRefs.length ? await transaction.getAll(...drinkRefs) : [];
    let drinkItems;
    try { drinkItems = priceDrinkSnapshots(drinkSnapshots, drinkLines, branch.id); }
    catch (error) {
      const messages = { DRINK_UNAVAILABLE: "أحد المشروبات غير متاح في هذا الفرع", DRINK_PRICE: "سعر أحد المشروبات غير صحيح", DRINK_OPTION: "اختيار تحضير المشروب غير صحيح" };
      throw new HttpsError("failed-precondition", messages[error.message] || "بيانات المشروب غير صحيحة");
    }
    const workerByLine = new Map(rawLines.map(line => [`${line.kind}:${line.id}`, sanitizeText(line.workerId || legacyStaffId, 100) || "none"]));
    const items = normalizeLineWorkers([...catalogItems, ...inventoryItems, ...drinkItems].map(item => {
      const workerId = item.staffRequired ? (workerByLine.get(`${item.kind}:${item.id}`) || legacyStaffId) : "none";
      const worker = workers.get(workerId);
      return { ...item, workerId, workerNameAr: worker?.nameAr || "بدون عامل", workerNameEn: worker?.nameEn || "No staff" };
    }), legacyStaffId);
    const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
    const discountAmount = Math.max(0, Math.min(subtotal, Number(request.data?.discountAmount || 0)));
    const beforeWalletTotal = subtotal - discountAmount;
    const now = FieldValue.serverTimestamp();
    const publicItems = items.map(({ ref, ...item }) => item);
    const primaryWorkerId = publicItems.find(item => item.workerId && item.workerId !== "none")?.workerId || "none";
    const primaryWorker = workers.get(primaryWorkerId);
    const customerSnapshot = await transaction.get(customerRef);
    const closingSnapshot = await transaction.get(db.doc(`dailyClosings/${branch.id}_${dateKey}`));
    if (closingSnapshot.exists) throw new HttpsError("failed-precondition", "تم إغلاق يوم الفرع؛ لا يمكن إضافة شيك مالي لهذا التاريخ");
    let cashShiftRef = null;
    let cashShift = null;
    if (paid && method === "cash" && settings.cashDrawerEnabled === true) {
      const cashState = await transaction.get(db.doc(`cashShiftState/${branch.id}`));
      const shiftId = sanitizeText(cashState.data()?.openShiftId, 100);
      if (!shiftId || cashState.data()?.status !== "OPEN") throw new HttpsError("failed-precondition", "افتح وردية الكاش قبل تحصيل شيك نقدي");
      cashShiftRef = db.doc(`cashShifts/${shiftId}`);
      cashShift = await transaction.get(cashShiftRef);
      if (!cashShift.exists || cashShift.data().status !== "OPEN") throw new HttpsError("failed-precondition", "وردية الكاش غير مفتوحة");
    }
    const requestedPoints=Math.max(0,Math.floor(Number(request.data?.redeemPoints||0)));const requestedCashback=Math.max(0,Math.round(Number(request.data?.redeemCashback||0)*100)/100);const pointValue=Math.max(0,Number(settings.pointValue||0.1));const redemptionValue=requestedPoints*pointValue+requestedCashback;const maxRedemption=beforeWalletTotal*Math.max(0,Math.min(100,Number(settings.maximumRedemptionPercent||0)))/100;
    if((requestedPoints||requestedCashback)&&(!paid||settings.walletRedemptionEnabled!==true))throw new HttpsError("failed-precondition","استبدال المحفظة يحتاج شيكًا مدفوعًا وتفعيل الميزة");
    if(requestedPoints>Number(customerSnapshot.data()?.pointsBalance||0)||requestedCashback>Number(customerSnapshot.data()?.cashbackBalance||0)||redemptionValue>maxRedemption||redemptionValue<Math.max(0,Number(settings.minimumRedemption||0)))throw new HttpsError("failed-precondition","قيمة استبدال المحفظة غير مسموحة");
    const total=Math.max(0,beforeWalletTotal-redemptionValue);const revenueBreakdown=calculateRevenueBreakdown(publicItems,total);
    const redemption=(requestedPoints||requestedCashback)?{points:requestedPoints,cashback:requestedCashback,value:redemptionValue}:null;
    const targetEntries = serviceTargetEntries(publicItems);
    const bookingRecord = { code, receiptNumber: code, branchId: branch.id, branchNameAr: branch.nameAr, branchNameEn: branch.nameEn, branchPhone: branch.phone, branchWhatsapp: branch.whatsapp, customer, customerName: `${customer.firstName} ${customer.lastName}`.trim(), phone: customer.phone, phoneHash: hash(customer.phone), items: publicItems, itemIds: publicItems.map(item => item.id), serviceNamesAr: publicItems.map(item => `${item.nameAr}${item.option ? ` (${item.option})` : ""}`), staffId: primaryWorkerId, staffNameAr: primaryWorker?.nameAr || "عدة عمال / بدون عامل", staffNameEn: primaryWorker?.nameEn || "Multiple / no staff", bookingDate: dateKey, bookingTime: time, duration: catalogItems.reduce((sum, item) => sum + Number(item.duration || 0), 0), productOnly: catalogItems.every(item => !item.staffRequired), subtotal, discountAmount, walletRedemptionAmount:redemptionValue, discountPercent: subtotal ? Math.round((discountAmount+redemptionValue) / subtotal * 10000) / 100 : 0, total, finalTotal: total, status: "completed", orderState: paid ? "PAID" : "UNPAID", paymentStatus: paid ? "paid" : "unpaid", paymentMethod: paid ? method : null, source: "pos", financialPosted: paid, stockPosted: inventoryItems.length > 0, rewardPosted: paid, cashPosted: Boolean(cashShiftRef), serviceTargetsPosted: paid && targetEntries.length > 0, serviceTargetsDateKey: paid && targetEntries.length ? dateKey : null, finalizedAt: now, finalizedBy: request.auth.uid, createdAt: now, updatedAt: now, paidAt: paid ? now : null };
    if (paid) await applyRewards(transaction, { booking: bookingRecord, customerRef, settings, now, redemption });
    transaction.create(bookingRef, bookingRecord);
    transaction.set(customerRef, { firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone, qrToken: customerSnapshot.data()?.qrToken || customerQrToken(), lastBranchId: branch.id, lastBookingAt: now, lastVisitAt: now, bookingCount: FieldValue.increment(1), completedVisits: FieldValue.increment(1), ...(customerSnapshot.exists ? {} : { firstVisitAt: now, firstVisitDateKey: dateKey, createdAt: now }), ...(paid ? { totalSpent: FieldValue.increment(total) } : {}) }, { merge: true });
    const workerRevenue = new Map();
    const workerItems=publicItems.filter(item=>item.workerId&&item.workerId!=="none");const workerSubtotal=workerItems.reduce((sum,item)=>sum+Number(item.lineTotal||0),0);workerItems.forEach(item=>workerRevenue.set(item.workerId,(workerRevenue.get(item.workerId)||0)+(paid&&workerSubtotal?Number(item.lineTotal||0)/workerSubtotal*Number(revenueBreakdown.services||0):0)));
    workerRevenue.forEach((amount, workerId) => transaction.update(db.doc(`staff/${workerId}`), { bookingCount: FieldValue.increment(1), ...(paid ? { revenueTotal: FieldValue.increment(amount) } : {}), updatedAt: now }));
    if (paid) workerRevenue.forEach((amount, workerId) => postWorkerMonthlyRevenue(transaction, { workerId, branchId: branch.id, dateKey, amount, now }));
    if (paid && targetEntries.length) postServiceMonthlyTargets(transaction, { items: publicItems, branchId: branch.id, dateKey, now });
    if (paid) transaction.create(ledgerRef, { bookingId: code, bookingCode: code, branchId: branch.id, amount: total, revenueBreakdown, workerBreakdown: Object.fromEntries(workerRevenue), type: "payment", paymentMethod: method, staffId: primaryWorkerId, itemIds: publicItems.map(item => item.id), dateKey, source: "pos", createdAt: now, createdBy: request.auth.uid });
    if (cashShiftRef && cashShift) {
      const nextShift = { ...cashShift.data(), cashSales: Number(cashShift.data().cashSales || 0) + total };
      transaction.update(cashShiftRef, { cashSales: FieldValue.increment(total), expectedCash: calculateExpectedCash(nextShift), updatedAt: now });
      transaction.create(db.doc(`cashMovements/sale_${code}`), { type: "CASH_SALE", amount: total, bookingId: code, receiptNumber: code, branchId: branch.id, shiftId: cashShiftRef.id, businessDate: dateKey, actorUid: request.auth.uid, createdAt: now });
    }
    inventoryItems.forEach(item => {
      transaction.update(item.ref, { stockQty: FieldValue.increment(-item.qty), updatedAt: now });
      transaction.create(db.doc(`stockMovements/${code}_${item.id}`), { inventoryItemId: item.id, branchId: branch.id, bookingId: code, quantity: -item.qty, type: "sale", dateKey, createdAt: now, createdBy: request.auth.uid });
    });
    transaction.create(idempotencyRef, { bookingCode: code, total, paymentStatus: paid ? "paid" : "unpaid", branchId: branch.id, createdBy: request.auth.uid, createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000) });
    transaction.set(activityRef, { action: "create-pos-order", collection: "bookings", entityId: code, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: now });
    const clientTimestamp = new Date().toISOString();
    return { ok: true, bookingCode: code, total, paymentStatus: paid ? "paid" : "unpaid", receipt: { id: code, ...bookingRecord, createdAt: clientTimestamp, updatedAt: clientTimestamp, paidAt: paid ? clientTimestamp : null } };
  }).then(result => {
    structuredLog("pos_finalize", { ok: true, durationMs: Date.now() - operationStarted, branchId: branch.id, idempotent: Boolean(result.idempotent) });
    return result;
  }).catch(error => {
    console.error(JSON.stringify({ severity: "ERROR", event: "pos_finalize", ok: false, durationMs: Date.now() - operationStarted, branchId: branch.id, code: error.code || "internal" }));
    throw error;
  });
});

export const recordPayrollPayment = onCall(adminOptions, async request => {
  requirePermission(request, "payroll");
  const month = sanitizeText(request.data?.month, 7);
  const staffId = sanitizeText(request.data?.staffId, 100);
  const adjustment = Number(request.data?.adjustment || 0);
  if (!/^\d{4}-\d{2}$/.test(month) || !staffId || !Number.isFinite(adjustment) || Math.abs(adjustment) > 1000000) throw new HttpsError("invalid-argument", "بيانات صرف الراتب غير صحيحة");
  const nextMonth = nextMonthKey(month);
  const [staffSnapshot, monthlyTotalSnapshot, ledgerSnapshot] = await Promise.all([db.doc(`staff/${staffId}`).get(), db.doc(`workerMonthlyTotals/${month}_${staffId}`).get(), db.collection("revenueLedger").where("staffId", "==", staffId).where("dateKey", ">=", `${month}-01`).where("dateKey", "<", `${nextMonth}-01`).limit(2000).get()]);
  if (!staffSnapshot.exists) throw new HttpsError("not-found", "العامل غير موجود");
  const staff = staffSnapshot.data();
  if (!itemInAllowedBranch(staff, branchesFor(request))) throw new HttpsError("permission-denied", "العامل تابع لفرع آخر");
  const revenue = monthlyTotalSnapshot.exists ? Number(monthlyTotalSnapshot.data()?.revenue || 0) : ledgerSnapshot.docs.reduce((sum, snapshot) => sum + Number(snapshot.data().workerBreakdown?.[staffId] ?? snapshot.data().amount ?? 0), 0);
  const calculated = calculatePayroll({ ...staff, revenue, adjustment });
  if (calculated.netSalary <= 0) throw new HttpsError("failed-precondition", "حدد الراتب الأساسي للعامل من قسم فريق العمل أولًا");
  const payrollRef = db.doc(`payrollPayments/${month}_${staffId}`);
  const expenseRef = db.doc(`expenses/salary_${month}_${staffId}`);
  const activityRef = db.collection("activityLogs").doc();
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(payrollRef);
    if (existing.exists) throw new HttpsError("already-exists", "تم تسجيل صرف راتب هذا العامل لهذا الشهر");
    const now = FieldValue.serverTimestamp();
    transaction.create(payrollRef, { month, staffId, staffNameAr: staff.nameAr || staffId, ...calculated, status: "paid", paidAt: now, createdBy: request.auth.uid });
    transaction.create(expenseRef, { amount: calculated.netSalary, category: "salary", description: `راتب ${staff.nameAr || staffId} عن ${month}`, branchId: Array.isArray(staff.branchIds) && staff.branchIds.length === 1 ? staff.branchIds[0] : "all", dateKey: businessDateParts().dateKey, payrollPaymentId: payrollRef.id, staffId, month, paymentMethod: sanitizeText(request.data?.paymentMethod || "cash", 30), createdAt: now, createdBy: request.auth.uid });
    transaction.set(activityRef, { action: "pay-salary", collection: "payrollPayments", entityId: payrollRef.id, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: now });
  });
  return { ok: true, payroll: calculated };
});

async function deleteBookingPermanently(id, request, reason) {
  const bookingRef = db.doc(`bookings/${id}`);
  const paymentRef = db.doc(`revenueLedger/payment_${id}`);
  const refundRef = db.doc(`revenueLedger/refund_${id}`);
  const activityRef = db.collection("activityLogs").doc();
  return db.runTransaction(async transaction => {
    const [bookingSnapshot, paymentSnapshot, refundSnapshot] = await transaction.getAll(bookingRef, paymentRef, refundRef);
    if (!bookingSnapshot.exists) throw new HttpsError("not-found", "الحجز غير موجود");
    const booking = bookingSnapshot.data();
    const ledgerSnapshots = [paymentSnapshot, refundSnapshot].filter(snapshot => snapshot.exists);
    const netRevenue = ledgerSnapshots.reduce((sum, snapshot) => sum + Number(snapshot.data().amount || 0), 0);
    const netStaffRevenue = ledgerSnapshots.reduce((sum, snapshot) => sum + Number(snapshot.data().revenueBreakdown?.services ?? snapshot.data().amount ?? 0), 0);
    const staffRef = booking.staffId && booking.staffId !== "none" ? db.doc(`staff/${booking.staffId}`) : null;
    const customerRef = booking.phoneHash ? db.doc(`customers/${booking.phoneHash}`) : null;
    const couponRef = booking.couponCode ? db.doc(`coupons/${booking.couponCode}`) : null;
    const couponUsageRef = booking.couponCode && booking.phoneHash ? db.doc(`couponUsage/${booking.couponCode}_${booking.phoneHash}`) : null;
    const soldInventory = (booking.items || []).filter(item => item.kind === "inventory" && item.id);
    const inventoryRefs = soldInventory.map(item => db.doc(`inventoryItems/${item.id}`));
    const relatedRefs = [staffRef, customerRef, couponRef, couponUsageRef, ...inventoryRefs].filter(Boolean);
    const relatedSnapshots = relatedRefs.length ? await transaction.getAll(...relatedRefs) : [];
    const related = new Map(relatedSnapshots.map(snapshot => [snapshot.ref.path, snapshot]));
    const customerBookings = customerRef ? await transaction.get(db.collection("bookings").where("phoneHash", "==", booking.phoneHash).orderBy("createdAt", "desc").limit(2)) : null;
    const previousBooking = customerBookings?.docs.find(snapshot => snapshot.id !== id)?.data();

    ledgerSnapshots.forEach(snapshot => transaction.delete(snapshot.ref));
    (booking.lockIds || []).forEach(lockId => transaction.delete(db.doc(`appointmentLocks/${lockId}`)));
    if (booking.duplicateGuardId) transaction.delete(db.doc(`bookingGuards/${booking.duplicateGuardId}`));
    soldInventory.forEach(item => {
      const inventoryRef = db.doc(`inventoryItems/${item.id}`);
      if (!booking.inventoryReleased && related.get(inventoryRef.path)?.exists) transaction.update(inventoryRef, { stockQty: FieldValue.increment(Math.max(1, Number(item.qty || 1))), updatedAt: FieldValue.serverTimestamp() });
      transaction.delete(db.doc(`stockMovements/${id}_${item.id}`));
    });
    transaction.delete(bookingRef);

    const staffSnapshot = staffRef ? related.get(staffRef.path) : null;
    if (staffSnapshot?.exists) {
      const staff = staffSnapshot.data();
      transaction.update(staffRef, {
        bookingCount: Math.max(0, Number(staff.bookingCount || 0) - 1),
        revenueTotal: Math.max(0, Number(staff.revenueTotal || 0) - netStaffRevenue),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    const customerSnapshot = customerRef ? related.get(customerRef.path) : null;
    if (customerSnapshot?.exists) {
      const customer = customerSnapshot.data();
      const bookingCount = Math.max(0, Number(customer.bookingCount || 0) - 1);
      transaction.update(customerRef, {
        bookingCount,
        totalSpent: Math.max(0, Number(customer.totalSpent || 0) - netRevenue),
        lastBookingAt: previousBooking?.createdAt || null,
        lastBranchId: previousBooking?.branchId || null,
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    const couponSnapshot = couponRef ? related.get(couponRef.path) : null;
    if (couponSnapshot?.exists) {
      const coupon = couponSnapshot.data();
      transaction.update(couponRef, {
        usageCount: Math.max(0, Number(coupon.usageCount || 0) - 1),
        discountTotal: Math.max(0, Number(coupon.discountTotal || 0) - Number(booking.discountAmount || 0)),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    const couponUsageSnapshot = couponUsageRef ? related.get(couponUsageRef.path) : null;
    if (couponUsageSnapshot?.exists) {
      const usage = couponUsageSnapshot.data();
      transaction.update(couponUsageRef, {
        count: Math.max(0, Number(usage.count || 0) - 1),
        discountTotal: Math.max(0, Number(usage.discountTotal || 0) - Number(booking.discountAmount || 0)),
        updatedAt: FieldValue.serverTimestamp()
      });
    }
    transaction.set(activityRef, { action: "secure-delete-booking", collection: "bookings", entityId: id, reason, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
    return { ok: true };
  });
}

async function deleteRevenuePermanently(id, request) {
  const ledgerRef = db.doc(`revenueLedger/${id}`);
  const activityRef = db.collection("activityLogs").doc();
  return db.runTransaction(async transaction => {
    const ledgerSnapshot = await transaction.get(ledgerRef);
    if (!ledgerSnapshot.exists) throw new HttpsError("not-found", "عملية الإيراد غير موجودة");
    const ledger = ledgerSnapshot.data();
    const bookingId = sanitizeText(ledger.bookingId, 100);
    const bookingRef = bookingId ? db.doc(`bookings/${bookingId}`) : null;
    const refundRef = ledger.type === "payment" && bookingId ? db.doc(`revenueLedger/refund_${bookingId}`) : null;
    const firstRefs = [bookingRef, refundRef].filter(Boolean);
    const firstSnapshots = firstRefs.length ? await transaction.getAll(...firstRefs) : [];
    const first = new Map(firstSnapshots.map(snapshot => [snapshot.ref.path, snapshot]));
    if (refundRef && first.get(refundRef.path)?.exists) throw new HttpsError("failed-precondition", "احذف عملية الاسترداد أولًا ثم احذف عملية الدفع");
    const bookingSnapshot = bookingRef ? first.get(bookingRef.path) : null;
    const booking = bookingSnapshot?.exists ? bookingSnapshot.data() : null;
    const staffId = sanitizeText(ledger.staffId || booking?.staffId, 100);
    const staffRef = staffId && staffId !== "none" ? db.doc(`staff/${staffId}`) : null;
    const customerRef = booking?.phoneHash ? db.doc(`customers/${booking.phoneHash}`) : null;
    const relatedRefs = [staffRef, customerRef].filter(Boolean);
    const relatedSnapshots = relatedRefs.length ? await transaction.getAll(...relatedRefs) : [];
    const related = new Map(relatedSnapshots.map(snapshot => [snapshot.ref.path, snapshot]));
    const amount = Number(ledger.amount || 0);
    const staffAmount = Number(ledger.revenueBreakdown?.services ?? amount);

    const staffSnapshot = staffRef ? related.get(staffRef.path) : null;
    if (staffSnapshot?.exists) transaction.update(staffRef, { revenueTotal: Math.max(0, Number(staffSnapshot.data().revenueTotal || 0) - staffAmount), updatedAt: FieldValue.serverTimestamp() });
    const customerSnapshot = customerRef ? related.get(customerRef.path) : null;
    if (customerSnapshot?.exists) transaction.update(customerRef, { totalSpent: Math.max(0, Number(customerSnapshot.data().totalSpent || 0) - amount), updatedAt: FieldValue.serverTimestamp() });
    if (bookingSnapshot?.exists) {
      transaction.update(bookingRef, ledger.type === "refund"
        ? { paymentStatus: "paid", refundedAt: null, updatedAt: FieldValue.serverTimestamp() }
        : { paymentStatus: "unpaid", paymentMethod: null, paidAt: null, updatedAt: FieldValue.serverTimestamp() });
    }
    transaction.delete(ledgerRef);
    transaction.set(activityRef, { action: "secure-delete-revenue", collection: "revenueLedger", entityId: id, bookingId, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
    return { ok: true };
  });
}

async function deleteExpensePermanently(id, request, reason) {
  const expenseRef = db.doc(`expenses/${id}`);
  const activityRef = db.collection("activityLogs").doc();
  return db.runTransaction(async transaction => {
    const expenseSnapshot = await transaction.get(expenseRef);
    if (!expenseSnapshot.exists) throw new HttpsError("not-found", "المصروف غير موجود");
    const expense = expenseSnapshot.data();
    if (expense.cashMovementId) throw new HttpsError("failed-precondition", "المصروف مرتبط بدرج الكاش؛ استخدم حركة تصحيح موثقة بدل الحذف");
    const inventoryRef = expense.inventoryItemId ? db.doc(`inventoryItems/${expense.inventoryItemId}`) : null;
    const payrollRef = expense.payrollPaymentId ? db.doc(`payrollPayments/${expense.payrollPaymentId}`) : null;
    const closingRef = expense.branchId && expense.dateKey ? db.doc(`dailyClosings/${expense.branchId}_${expense.dateKey}`) : null;
    const relatedRefs = [inventoryRef, payrollRef, closingRef].filter(Boolean);
    const relatedSnapshots = relatedRefs.length ? await transaction.getAll(...relatedRefs) : [];
    const related = new Map(relatedSnapshots.map(snapshot => [snapshot.ref.path, snapshot]));
    if (closingRef && related.get(closingRef.path)?.exists) throw new HttpsError("failed-precondition", "تم إغلاق هذا اليوم؛ استخدم تسوية أو حركة عكسية موثقة");
    if (inventoryRef && related.get(inventoryRef.path)?.exists && Number(expense.stockQuantity || 0) > 0) {
      const item = related.get(inventoryRef.path).data();
      const currentQty = Math.max(0, Number(item.stockQty || 0));
      const removedQty = Number(expense.stockQuantity || 0);
      if (currentQty < removedQty) throw new HttpsError("failed-precondition", "لا يمكن حذف الشراء بعد بيع جزء من كميته؛ راجع رصيد الصنف أولًا");
      const nextQty = currentQty - removedQty;
      const nextAsset = Math.max(0, currentQty * Math.max(0, Number(item.costPrice || 0)) - Number(expense.amount || 0));
      transaction.update(inventoryRef, { stockQty: nextQty, ...(nextQty > 0 ? { costPrice: Math.round(nextAsset / nextQty * 100) / 100 } : {}), updatedAt: FieldValue.serverTimestamp() });
      transaction.delete(db.doc(`stockMovements/purchase_${id}`));
    }
    if (payrollRef && related.get(payrollRef.path)?.exists) transaction.delete(payrollRef);
    transaction.delete(expenseRef);
    transaction.set(activityRef, { action: "secure-delete-expense", collection: "expenses", entityId: id, branchId: expense.branchId || "", amount: expense.amount || 0, category: expense.category || "other", reason, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
    return { ok: true };
  });
}

async function deleteUserAccountPermanently(uid, request) {
  if (uid === request.auth.uid) throw new HttpsError("failed-precondition", "لا يمكنك حذف حساب الأدمن المستخدم حاليًا");
  const userRef = db.doc(`users/${uid}`);
  const userSnapshot = await userRef.get();
  if (!userSnapshot.exists) throw new HttpsError("not-found", "حساب العامل غير موجود");
  const user = userSnapshot.data() || {};
  if (user.role === "admin") throw new HttpsError("permission-denied", "لا يمكن حذف حساب أدمن من شاشة العاملين");
  const { getAuth } = await import("firebase-admin/auth");
  try { await getAuth().deleteUser(uid); }
  catch (error) { if (error.code !== "auth/user-not-found") throw new HttpsError("internal", "تعذر حذف الحساب من Firebase Authentication"); }
  const tokenSnapshots = await db.collection("pushTokens").where("uid", "==", uid).limit(500).get();
  const batch = db.batch();
  batch.delete(userRef);
  if (user.staffId) batch.set(db.doc(`staff/${sanitizeText(user.staffId, 100)}`), { userUid: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  tokenSnapshots.docs.forEach(snapshot => batch.delete(snapshot.ref));
  batch.set(db.collection("activityLogs").doc(), { action: "secure-delete-user", collection: "users", entityId: uid, deletedUserEmail: sanitizeText(user.email, 200), deletedUserName: sanitizeText(user.name, 80), deletedUserRole: sanitizeText(user.role, 30), userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { ok: true };
}

export const adminSecureDelete = onCall(adminOptions, async request => {
  requireRecentAdmin(request);
  const kind = sanitizeText(request.data?.kind, 30);
  const id = sanitizeText(request.data?.id, 100);
  const reason = sanitizeText(request.data?.reason, 300);
  if (!id || !["booking", "revenue", "expense", "user"].includes(kind)) throw new HttpsError("invalid-argument", "طلب الحذف غير صالح");
  if (["booking", "expense"].includes(kind) && !reason) throw new HttpsError("invalid-argument", "سبب الحذف مطلوب لتسجيل العملية");
  if (kind === "booking") {
    const booking = await db.doc(`bookings/${id}`).get();
    if (booking.exists && (booking.data().source === "pos" || booking.data().paymentStatus === "paid" || booking.data().status === "completed")) throw new HttpsError("failed-precondition", "الشيك المالي لا يُحذف؛ استخدم الاسترداد أو الإلغاء مع سبب مسجل");
    return deleteBookingPermanently(id, request, reason);
  }
  if (kind === "revenue") throw new HttpsError("failed-precondition", "لا يمكن حذف حركة مالية؛ استخدم استردادًا أو حركة عكسية");
  if (kind === "user") return deleteUserAccountPermanently(id, request);
  return deleteExpensePermanently(id, request, reason);
});

export const updateBooking = onCall(adminOptions, async request => {
  requireRole(request);
  const id = sanitizeText(request.data?.id, 100);
  const action = sanitizeText(request.data?.action, 30);
  await enforceRateLimit(request, `booking_mutation_${action || "unknown"}`, 120, 15 * 60 * 1000, request.auth.uid);
  const reason = sanitizeText(request.data?.reason, 300);
  const idempotencyKey = sanitizeText(request.data?.idempotencyKey, 100);
  if (["refund", "void"].includes(action) && (!reason || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey))) throw new HttpsError("invalid-argument", "اكتب سبب العملية ثم أعد المحاولة");
  const ref = db.doc(`bookings/${id}`);
  const settings = await readSettings();
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "الحجز غير موجود");
    const booking = snapshot.data();
    requireBranchAccess(request, booking.branchId);
    const now = FieldValue.serverTimestamp();
    if (action === "checkout") {
      requirePermission(request, "bookings");
      if (!hasPermission(request, "pos") && !hasPermission(request, "revenue")) throw new HttpsError("permission-denied", "لا تملك صلاحية تحصيل الحجز");
      if (["rejected", "cancelled"].includes(booking.status)) throw new HttpsError("failed-precondition", "لا يمكن تحصيل حجز ملغي أو مرفوض");
      const alreadyPaid = booking.paymentStatus === "paid";
      let transition = null;
      if (!alreadyPaid) {
        try { transition = paymentTransition(booking, "markPaid", request.data?.paymentMethod || "cash"); }
        catch (error) { throw new HttpsError("failed-precondition", error.message); }
      }
      const ledgerRef = transition ? db.doc(`revenueLedger/payment_${id}`) : null;
      const ledgerSnapshot = ledgerRef ? await transaction.get(ledgerRef) : null;
      const createsPayment = Boolean(transition?.changed && !ledgerSnapshot?.exists);
      const revenueBreakdown = createsPayment ? calculateRevenueBreakdown(booking.items || [], transition.ledgerAmount) : null;
      const dateKey = businessDateParts().dateKey;
      let cashShiftRef = null;
      let cashShift = null;
      if (createsPayment) {
        const closing = await transaction.get(db.doc(`dailyClosings/${booking.branchId || "talkha"}_${dateKey}`));
        if (closing.exists) throw new HttpsError("failed-precondition", "تم إغلاق يوم الفرع؛ لا يمكن تحصيل شيك جديد");
        if (transition.method === "cash" && settings.cashDrawerEnabled === true) {
          const cashState = await transaction.get(db.doc(`cashShiftState/${booking.branchId || "talkha"}`));
          const shiftId = sanitizeText(cashState.data()?.openShiftId, 100);
          if (!shiftId || cashState.data()?.status !== "OPEN") throw new HttpsError("failed-precondition", "افتح وردية الكاش قبل التحصيل النقدي");
          cashShiftRef = db.doc(`cashShifts/${shiftId}`);
          cashShift = await transaction.get(cashShiftRef);
          if (!cashShift.exists || cashShift.data().status !== "OPEN") throw new HttpsError("failed-precondition", "وردية الكاش غير مفتوحة");
        }
      }
      if (booking.phoneHash) await applyRewards(transaction, { booking: { ...booking, status: "completed", paymentStatus: "paid", code: booking.code || id }, customerRef: db.doc(`customers/${booking.phoneHash}`), settings, now });
      if (createsPayment) {
        const workerBreakdown = new Map();
        const attributedItems = normalizeLineWorkers(booking.items || [], booking.staffId).filter(item => item.workerId && item.workerId !== "none");
        const attributedSubtotal = attributedItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
        attributedItems.forEach(item => workerBreakdown.set(item.workerId, (workerBreakdown.get(item.workerId) || 0) + (attributedSubtotal ? Number(item.lineTotal || 0) / attributedSubtotal * Number(revenueBreakdown.services || 0) : 0)));
        transaction.create(ledgerRef, { bookingId: id, bookingCode: booking.code, branchId: booking.branchId || "talkha", amount: transition.ledgerAmount, revenueBreakdown, workerBreakdown: Object.fromEntries(workerBreakdown), type: "payment", paymentMethod: transition.method, staffId: booking.staffId, itemIds: booking.itemIds || [], dateKey, createdAt: now, createdBy: request.auth.uid });
        workerBreakdown.forEach((amount, workerId) => transaction.update(db.doc(`staff/${workerId}`), { revenueTotal: FieldValue.increment(amount), updatedAt: now }));
        workerBreakdown.forEach((amount, workerId) => postWorkerMonthlyRevenue(transaction, { workerId, branchId: booking.branchId || "talkha", dateKey, amount, now }));
        if (booking.phoneHash) transaction.update(db.doc(`customers/${booking.phoneHash}`), { totalSpent: FieldValue.increment(transition.ledgerAmount), updatedAt: now });
        if (cashShiftRef && cashShift) {
          const nextShift = { ...cashShift.data(), cashSales: Number(cashShift.data().cashSales || 0) + transition.ledgerAmount };
          transaction.update(cashShiftRef, { cashSales: FieldValue.increment(transition.ledgerAmount), expectedCash: calculateExpectedCash(nextShift), updatedAt: now });
          transaction.create(db.doc(`cashMovements/sale_${id}`), { type: "CASH_SALE", amount: transition.ledgerAmount, bookingId: id, receiptNumber: booking.receiptNumber || booking.code || id, branchId: booking.branchId || "talkha", shiftId: cashShiftRef.id, businessDate: dateKey, actorUid: request.auth.uid, createdAt: now });
        }
      }
      const targetEntries = !booking.serviceTargetsPosted ? serviceTargetEntries(booking.items || []) : [];
      if (targetEntries.length) postServiceMonthlyTargets(transaction, { items: booking.items || [], branchId: booking.branchId || "talkha", dateKey, now });
      (booking.lockIds || []).forEach(lockId => transaction.delete(db.doc(`appointmentLocks/${lockId}`)));
      if (booking.duplicateGuardId) transaction.delete(db.doc(`bookingGuards/${booking.duplicateGuardId}`));
      transaction.update(ref, { status: "completed", orderState: "PAID", paymentStatus: "paid", paymentMethod: transition?.method || booking.paymentMethod || "cash", financialPosted: true, rewardPosted: true, cashPosted: Boolean(cashShiftRef) || Boolean(booking.cashPosted), serviceTargetsPosted: Boolean(booking.serviceTargetsPosted) || targetEntries.length > 0, serviceTargetsDateKey: targetEntries.length ? dateKey : booking.serviceTargetsDateKey || null, finalizedAt: booking.finalizedAt || now, finalizedBy: booking.finalizedBy || request.auth.uid, paidAt: booking.paidAt || now, updatedAt: now });
      if (booking.phoneHash && booking.status !== "completed") transaction.update(db.doc(`customers/${booking.phoneHash}`), { completedVisits: FieldValue.increment(1), lastVisitAt: now, updatedAt: now });
      transaction.set(db.collection("activityLogs").doc(), { action: "checkout-booking", collection: "bookings", entityId: id, branchId: booking.branchId || "talkha", userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: now });
      return { ok: true, status: "completed", paymentStatus: "paid", idempotent: alreadyPaid || ledgerSnapshot?.exists || false };
    }
    if (action === "void") {
      requirePermission(request, "revenue");
      if (booking.paymentStatus === "paid" || booking.paymentStatus === "refunded") throw new HttpsError("failed-precondition", "الشيك المدفوع يُسترد ولا يُلغى");
      if (booking.orderState === "VOIDED") return { ok: true, idempotent: true, status: "cancelled", orderState: "VOIDED" };
      const guardRef = db.doc(`voidGuards/${hash(`${request.auth.uid}|${idempotencyKey}`)}`);
      const guard = await transaction.get(guardRef);
      if (guard.exists) return { ok: true, idempotent: true, status: "cancelled", orderState: "VOIDED" };
      const soldInventory = booking.inventoryReleased ? [] : (booking.items || []).filter(item => item.kind === "inventory" && item.id);
      const inventoryRefs = soldInventory.map(item => db.doc(`inventoryItems/${item.id}`));
      const inventorySnapshots = inventoryRefs.length ? await transaction.getAll(...inventoryRefs) : [];
      inventorySnapshots.forEach((inventory, index) => {
        if (inventory.exists) transaction.update(inventory.ref, { stockQty: FieldValue.increment(Math.max(1, Number(soldInventory[index].qty || 1))), updatedAt: now });
        transaction.create(db.doc(`stockMovements/${id}_${soldInventory[index].id}_void`), { inventoryItemId: soldInventory[index].id, branchId: booking.branchId, bookingId: id, quantity: Math.max(1, Number(soldInventory[index].qty || 1)), type: "void-reversal", dateKey: businessDateParts().dateKey, reason, createdAt: now, createdBy: request.auth.uid });
      });
      (booking.lockIds || []).forEach(lockId => transaction.delete(db.doc(`appointmentLocks/${lockId}`)));
      if (booking.duplicateGuardId) transaction.delete(db.doc(`bookingGuards/${booking.duplicateGuardId}`));
      transaction.update(ref, { status: "cancelled", orderState: "VOIDED", voidReason: reason, voidedAt: now, voidedBy: request.auth.uid, inventoryReleased: soldInventory.length ? true : Boolean(booking.inventoryReleased), updatedAt: now });
      transaction.create(guardRef, { bookingId: id, reason, actorUid: request.auth.uid, createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000) });
      transaction.set(db.collection("activityLogs").doc(), { action: "void-order", collection: "bookings", entityId: id, branchId: booking.branchId, reason, userId: request.auth.uid, requestId: idempotencyKey, createdAt: now });
      return { ok: true, status: "cancelled", orderState: "VOIDED" };
    }
    if (["pending", "confirmed", "arrived", "no_show", "rejected", "cancelled", "completed"].includes(action)) {
      requirePermission(request, "bookings");
      if (booking.status === action) return { ok: true, idempotent: true, status: action };
      if (["rejected", "cancelled", "completed", "no_show"].includes(booking.status)) throw new HttpsError("failed-precondition", "لا يمكن إعادة فتح حجز منتهٍ؛ أنشئ حجزًا جديدًا أو استخدم إجراء التصحيح المالي المناسب");
      const soldInventory = booking.inventoryReleased ? [] : (booking.items || []).filter(item => item.kind === "inventory" && item.id);
      if (!["rejected", "cancelled"].includes(action) && booking.inventoryReleased && (booking.items || []).some(item => item.kind === "inventory")) throw new HttpsError("failed-precondition", "لا يمكن إعادة فتح الحجز بعد رجوع المشروبات للمخزون؛ أنشئ طلبًا جديدًا");
      if (["rejected", "cancelled", "no_show"].includes(action)) {
        const inventoryRefs = soldInventory.map(item => db.doc(`inventoryItems/${item.id}`));
        const inventorySnapshots = inventoryRefs.length ? await transaction.getAll(...inventoryRefs) : [];
        inventorySnapshots.forEach((inventory, index) => {
          if (inventory.exists) transaction.update(inventory.ref, { stockQty: FieldValue.increment(Math.max(1, Number(soldInventory[index].qty || 1))), updatedAt: now });
          transaction.delete(db.doc(`stockMovements/${id}_${soldInventory[index].id}`));
        });
      }
      if (["rejected", "cancelled", "completed", "no_show"].includes(action)) {
        (booking.lockIds || []).forEach(lockId => transaction.delete(db.doc(`appointmentLocks/${lockId}`)));
        if (booking.duplicateGuardId) transaction.delete(db.doc(`bookingGuards/${booking.duplicateGuardId}`));
      }
      if (action === "completed" && booking.paymentStatus === "paid" && booking.phoneHash) {
        await applyRewards(transaction, { booking: { ...booking, code: booking.code || id }, customerRef: db.doc(`customers/${booking.phoneHash}`), settings, now });
      }
      const targetEntries = action === "completed" && booking.paymentStatus === "paid" && !booking.serviceTargetsPosted ? serviceTargetEntries(booking.items || []) : [];
      const targetDateKey = businessDateParts().dateKey;
      if (targetEntries.length) postServiceMonthlyTargets(transaction, { items: booking.items || [], branchId: booking.branchId || "talkha", dateKey: targetDateKey, now });
      transaction.update(ref, { status: action, ...(["rejected", "cancelled", "no_show"].includes(action) && soldInventory.length ? { inventoryReleased: true } : {}), ...(targetEntries.length ? { serviceTargetsPosted: true, serviceTargetsDateKey: targetDateKey } : {}), updatedAt: now });
      if (booking.phoneHash) transaction.set(db.doc(`customers/${booking.phoneHash}`), {
        ...(action === "completed" ? { completedVisits: FieldValue.increment(1), lastVisitAt: now } : {}),
        ...(action === "cancelled" ? { cancellationCount: FieldValue.increment(1) } : {}),
        ...(action === "no_show" ? { noShowCount: FieldValue.increment(1) } : {}),
        updatedAt: now
      }, { merge: true });
      transaction.set(db.collection("activityLogs").doc(), { action: `booking-${action}`, collection: "bookings", entityId: id, branchId: booking.branchId, userId: request.auth.uid, createdAt: now });
      return { ok: true, status: action };
    }
    let transition;
    requirePermission(request, "revenue");
    try { transition = paymentTransition(booking, action, request.data?.paymentMethod || booking.paymentMethod || "cash"); }
    catch (error) { throw new HttpsError("failed-precondition", error.message); }
    if (!transition.changed) return { ok: true, idempotent: true, paymentStatus: transition.status };
    const ledgerId = `${transition.ledgerType}_${id}`;
    const ledgerRef = db.doc(`revenueLedger/${ledgerId}`);
    const ledger = await transaction.get(ledgerRef);
    if (ledger.exists) return { ok: true, idempotent: true, paymentStatus: transition.status };
    const dateKey = businessDateParts().dateKey;
    const operationGuardRef = action === "refund" ? db.doc(`refundGuards/${hash(`${request.auth.uid}|${idempotencyKey}`)}`) : null;
    const operationGuard = operationGuardRef ? await transaction.get(operationGuardRef) : null;
    if (operationGuard?.exists) return { ok: true, idempotent: true, paymentStatus: "refunded" };
    const closing = await transaction.get(db.doc(`dailyClosings/${booking.branchId || "talkha"}_${dateKey}`));
    if (closing.exists) throw new HttpsError("failed-precondition", "تم إغلاق يوم الفرع؛ يلزم إجراء تسوية بصلاحية مدير");
    let refundShiftRef = null;
    let refundShift = null;
    if (action === "refund" && transition.method === "cash" && settings.cashDrawerEnabled === true) {
      const cashState = await transaction.get(db.doc(`cashShiftState/${booking.branchId || "talkha"}`));
      const shiftId = sanitizeText(cashState.data()?.openShiftId, 100);
      if (!shiftId || cashState.data()?.status !== "OPEN") throw new HttpsError("failed-precondition", "افتح وردية الكاش قبل تنفيذ استرداد نقدي");
      refundShiftRef = db.doc(`cashShifts/${shiftId}`);
      refundShift = await transaction.get(refundShiftRef);
      if (!refundShift.exists || refundShift.data().status !== "OPEN") throw new HttpsError("failed-precondition", "وردية الكاش غير مفتوحة");
    }
    const refundableInventory = action === "refund" && !booking.inventoryReleased ? (booking.items || []).filter(item => item.kind === "inventory" && item.id) : [];
    const refundableSnapshots = refundableInventory.length ? await transaction.getAll(...refundableInventory.map(item => db.doc(`inventoryItems/${item.id}`))) : [];
    const revenueBreakdown = calculateRevenueBreakdown(booking.items || [], transition.ledgerAmount);
    const workerBreakdown = new Map();
    const attributedItems=normalizeLineWorkers(booking.items||[],booking.staffId).filter(item=>item.workerId&&item.workerId!=="none");const attributedSubtotal=attributedItems.reduce((sum,item)=>sum+Number(item.lineTotal||0),0);attributedItems.forEach(item=>workerBreakdown.set(item.workerId,(workerBreakdown.get(item.workerId)||0)+(attributedSubtotal?Number(item.lineTotal||0)/attributedSubtotal*Number(revenueBreakdown.services||0):0)));
    if (booking.phoneHash && ((action === "markPaid" && booking.status === "completed") || action === "refund")) {
      await applyRewards(transaction, { booking: { ...booking, code: booking.code || id }, customerRef: db.doc(`customers/${booking.phoneHash}`), settings, now, reverse: action === "refund" });
    }
    const targetDateKey = action === "refund" ? sanitizeText(booking.serviceTargetsDateKey || booking.bookingDate || dateKey, 10) : dateKey;
    const targetEntries = action === "markPaid" && booking.status === "completed" && !booking.serviceTargetsPosted
      ? serviceTargetEntries(booking.items || [])
      : action === "refund" && booking.serviceTargetsPosted
        ? serviceTargetEntries(booking.items || [])
        : [];
    if (targetEntries.length) postServiceMonthlyTargets(transaction, { items: booking.items || [], branchId: booking.branchId || "talkha", dateKey: targetDateKey, direction: action === "refund" ? -1 : 1, now });
    transaction.create(ledgerRef, { bookingId: id, bookingCode: booking.code, branchId: booking.branchId || "talkha", amount: transition.ledgerAmount, revenueBreakdown, workerBreakdown: Object.fromEntries(workerBreakdown), type: transition.ledgerType, paymentMethod: transition.method, staffId: booking.staffId, itemIds: booking.itemIds || [], dateKey, reason: action === "refund" ? reason : null, requestId: action === "refund" ? idempotencyKey : null, createdAt: now, createdBy: request.auth.uid });
    transaction.update(ref, { paymentStatus: transition.status, orderState: action === "refund" ? "REFUNDED" : "PAID", financialPosted: action !== "refund", paymentMethod: transition.method, paidAt: action === "markPaid" ? now : booking.paidAt || null, refundedAt: action === "refund" ? now : null, refundReason: action === "refund" ? reason : null, refundedBy: action === "refund" ? request.auth.uid : null, serviceTargetsPosted: action === "refund" ? false : Boolean(booking.serviceTargetsPosted) || targetEntries.length > 0, serviceTargetsDateKey: action === "refund" ? booking.serviceTargetsDateKey || null : targetEntries.length ? targetDateKey : booking.serviceTargetsDateKey || null, inventoryReleased: refundableInventory.length ? true : Boolean(booking.inventoryReleased), updatedAt: now });
    refundableSnapshots.forEach((inventory, index) => {
      if (inventory.exists) transaction.update(inventory.ref, { stockQty: FieldValue.increment(Math.max(1, Number(refundableInventory[index].qty || 1))), updatedAt: now });
      transaction.create(db.doc(`stockMovements/${id}_${refundableInventory[index].id}_refund`), { inventoryItemId: refundableInventory[index].id, branchId: booking.branchId, bookingId: id, quantity: Math.max(1, Number(refundableInventory[index].qty || 1)), type: "refund-reversal", dateKey, reason, createdAt: now, createdBy: request.auth.uid });
    });
    if (operationGuardRef) transaction.create(operationGuardRef, { bookingId: id, reason, actorUid: request.auth.uid, createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000) });
    if (refundShiftRef && refundShift) {
      const refundAmount = Math.abs(transition.ledgerAmount);
      const nextShift = { ...refundShift.data(), cashRefunds: Number(refundShift.data().cashRefunds || 0) + refundAmount };
      transaction.update(refundShiftRef, { cashRefunds: FieldValue.increment(refundAmount), expectedCash: calculateExpectedCash(nextShift), updatedAt: now });
      transaction.create(db.doc(`cashMovements/refund_${id}`), { type: "CASH_REFUND", amount: refundAmount, bookingId: id, receiptNumber: booking.receiptNumber || booking.code || id, branchId: booking.branchId || "talkha", shiftId: refundShiftRef.id, businessDate: dateKey, reason, actorUid: request.auth.uid, createdAt: now });
    }
    workerBreakdown.forEach((amount, workerId) => transaction.update(db.doc(`staff/${workerId}`), { revenueTotal: FieldValue.increment(amount), updatedAt: now }));
    workerBreakdown.forEach((amount, workerId) => postWorkerMonthlyRevenue(transaction, { workerId, branchId: booking.branchId || "talkha", dateKey, amount, now }));
    if (booking.phoneHash) transaction.update(db.doc(`customers/${booking.phoneHash}`), { totalSpent: FieldValue.increment(transition.ledgerAmount), updatedAt: now });
    transaction.set(db.collection("activityLogs").doc(), { action: action === "refund" ? "refund-order" : "mark-paid", collection: "bookings", entityId: id, branchId: booking.branchId, amount: transition.ledgerAmount, reason: action === "refund" ? reason : null, userId: request.auth.uid, requestId: action === "refund" ? idempotencyKey : null, createdAt: now });
    return { ok: true, paymentStatus: transition.status };
  });
});

function authenticatedCustomer(request) {
  if (!request.auth || request.auth.token.role) throw new HttpsError("unauthenticated", "سجّل دخول العميل أولًا");
  let phone;
  try { phone = normalizePhone(request.auth.token.phone_number); }
  catch { throw new HttpsError("failed-precondition", "حساب العميل غير مرتبط برقم هاتف صحيح"); }
  return { uid: request.auth.uid, phone, customerId: hash(phone) };
}

export const getCustomerPortal = onCall(publicOptions, async request => {
  const identity = authenticatedCustomer(request);
  await enforceRateLimit(request, "customer_portal", 60, 15 * 60 * 1000, identity.uid);
  const customerRef = db.doc(`customers/${identity.customerId}`);
  const [customerSnapshot, bookingsSnapshot, walletSnapshot, offersSnapshot] = await Promise.all([
    customerRef.get(),
    db.collection("bookings").where("phoneHash", "==", identity.customerId).orderBy("createdAt", "desc").limit(30).get(),
    db.collection("walletTransactions").where("customerId", "==", identity.customerId).orderBy("createdAt", "desc").limit(30).get(),
    db.collection("offers").where("active", "==", true).limit(20).get()
  ]);
  if (!customerSnapshot.exists) throw new HttpsError("not-found", "لا يوجد ملف عميل لهذا الرقم بعد؛ نفّذ أول حجز ثم حاول مرة أخرى");
  const customer = customerSnapshot.data();
  const qrToken = customer.qrToken || customerQrToken();
  if (!customer.qrToken) await customerRef.set({ qrToken, authUid: identity.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  else if (customer.authUid !== identity.uid) await customerRef.set({ authUid: identity.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const bookings = bookingsSnapshot.docs.map(cleanDoc);
  return {
    customer: { firstName: customer.firstName || "", lastName: customer.lastName || "", qrToken, bookingCount: Number(customer.bookingCount || 0), completedVisits: Number(customer.completedVisits || 0), noShowCount: Number(customer.noShowCount || 0), lastBranchId: customer.lastBranchId || null, pointsBalance: Number(customer.pointsBalance || 0), cashbackBalance: Number(customer.cashbackBalance || 0), favoriteStaffId: customer.favoriteStaffId || null },
    upcomingBookings: bookings.filter(item => ["pending", "confirmed", "arrived"].includes(item.status)).slice(0, 10),
    bookingHistory: bookings.slice(0, 20),
    lastBooking: bookings.find(item => !["cancelled", "rejected"].includes(item.status)) || null,
    walletActivity: walletSnapshot.docs.map(cleanDoc),
    offers: offersSnapshot.docs.map(cleanDoc)
  };
});

export const saveFavoriteBarber = onCall(publicOptions, async request => {
  const identity = authenticatedCustomer(request);
  const staffId = sanitizeText(request.data?.staffId, 100);
  const customerRef = db.doc(`customers/${identity.customerId}`);
  const staffRef = db.doc(`staff/${staffId}`);
  const [customer, staff] = await Promise.all([customerRef.get(), staffRef.get()]);
  if (!customer.exists) throw new HttpsError("not-found", "العميل غير موجود");
  if (!staff.exists || staff.data().active === false) throw new HttpsError("failed-precondition", "الحلاق غير متاح");
  await customerRef.update({ favoriteStaffId: staffId, favoriteStaffNameAr: sanitizeText(staff.data().nameAr, 100), authUid: identity.uid, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true, staffId };
});

export const rotateCustomerQr = onCall(adminOptions, async request => {
  requirePermission(request, "customers");
  const customerId = sanitizeText(request.data?.customerId, 100);
  const reason = sanitizeText(request.data?.reason, 300);
  const requestId = sanitizeText(request.data?.requestId, 100);
  if (!customerId || !reason || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) throw new HttpsError("invalid-argument", "بيانات تجديد QR غير صحيحة");
  const customerRef = db.doc(`customers/${customerId}`);
  const guardRef = db.doc(`qrRotationGuards/${hash(`${request.auth.uid}|${requestId}`)}`);
  return db.runTransaction(async transaction => {
    const [customer, guard] = await transaction.getAll(customerRef, guardRef);
    if (!customer.exists) throw new HttpsError("not-found", "العميل غير موجود");
    if (!itemInAllowedBranch(customer.data(), branchesFor(request))) throw new HttpsError("permission-denied", "العميل تابع لفرع غير مسموح");
    if (guard.exists) return { ok: true, idempotent: true };
    const previousToken = sanitizeText(customer.data()?.qrToken, 200);
    const qrToken = customerQrToken();
    const now = FieldValue.serverTimestamp();
    if (previousToken) transaction.create(db.doc(`revokedQrTokens/${hash(previousToken)}`), { customerId, reason, revokedBy: request.auth.uid, revokedAt: now });
    transaction.update(customerRef, { qrToken, qrRotatedAt: now, updatedAt: now });
    transaction.create(guardRef, { customerId, createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000) });
    transaction.set(db.collection("activityLogs").doc(), { action: "rotate-customer-qr", targetType: "customer", targetId: customerId, branchId: customer.data()?.lastBranchId || null, reason, actorUid: request.auth.uid, requestId, createdAt: now });
    return { ok: true, qrToken };
  });
});

export const scanCustomerCode = onCall(adminOptions, async request => {
  requirePermission(request, hasPermission(request, "customers") ? "customers" : "pos");
  const code = sanitizeText(request.data?.code, 200);
  await enforceRateLimit(request, "customer_scan", 120, 15 * 60 * 1000, request.auth.uid);
  if (!/^mzc_[A-Za-z0-9_-]{20,100}$/.test(code)) throw new HttpsError("invalid-argument", "كود العميل غير صحيح");
  if ((await db.doc(`revokedQrTokens/${hash(code)}`).get()).exists) throw new HttpsError("failed-precondition", "تم إلغاء هذا الكود؛ استخدم QR الأحدث للعميل", { code: "QR_REVOKED" });
  const snapshot = await db.collection("customers").where("qrToken", "==", code).limit(1).get();
  if (snapshot.empty) throw new HttpsError("not-found", "العميل غير موجود أو تم إلغاء الكود");
  const customer = cleanDoc(snapshot.docs[0]);
  if (!itemInAllowedBranch(customer, branchesFor(request))) throw new HttpsError("permission-denied", "العميل تابع لفرع غير مسموح");
  const bookings = await db.collection("bookings").where("phoneHash", "==", customer.id).orderBy("createdAt", "desc").limit(5).get();
  return { customer: { id: customer.id, firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone, pointsBalance: Number(customer.pointsBalance || 0), cashbackBalance: Number(customer.cashbackBalance || 0), favoriteStaffId: customer.favoriteStaffId || null }, bookings: bookings.docs.map(cleanDoc) };
});

export const findCustomerByPhone = onCall(adminOptions, async request => {
  if (!hasPermission(request, "customers") && !hasPermission(request, "pos")) throw new HttpsError("permission-denied", "لا تملك صلاحية البحث عن العملاء");
  let phone; try { phone=normalizePhone(request.data?.phone); } catch { throw new HttpsError("invalid-argument", "رقم الهاتف غير صحيح"); }
  await enforceRateLimit(request,"customer_phone_lookup",120,15*60*1000,request.auth.uid);
  const snapshot=await db.doc(`customers/${hash(phone)}`).get();if(!snapshot.exists)return {customer:null};const customer=cleanDoc(snapshot);if(!itemInAllowedBranch(customer,branchesFor(request)))throw new HttpsError("permission-denied","العميل تابع لفرع غير مسموح");return {customer};
});

export const adjustCustomerWallet = onCall(adminOptions, async request => {
  requirePermission(request, "rewards");
  const customerId = sanitizeText(request.data?.customerId, 100);
  const idempotencyKey = sanitizeText(request.data?.idempotencyKey, 100);
  const reason = sanitizeText(request.data?.reason, 300);
  const points = Math.trunc(Number(request.data?.points || 0));
  const cashback = Math.round(Number(request.data?.cashback || 0) * 100) / 100;
  if (!customerId || !reason || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey) || !Number.isFinite(points) || !Number.isFinite(cashback) || (!points && !cashback)) throw new HttpsError("invalid-argument", "بيانات تعديل المحفظة غير صحيحة");
  const customerRef = db.doc(`customers/${customerId}`);
  const txRef = db.doc(`walletTransactions/adjust_${hash(`${request.auth.uid}|${idempotencyKey}`)}`);
  await db.runTransaction(async transaction => {
    const [customer, existing] = await transaction.getAll(customerRef, txRef);
    if (!customer.exists) throw new HttpsError("not-found", "العميل غير موجود");
    if (existing.exists) return;
    const nextPoints = Number(customer.data().pointsBalance || 0) + points;
    const nextCashback = Number(customer.data().cashbackBalance || 0) + cashback;
    if (nextPoints < 0 || nextCashback < 0) throw new HttpsError("failed-precondition", "الرصيد لا يسمح بهذا الخصم");
    const now = FieldValue.serverTimestamp();
    transaction.update(customerRef, { pointsBalance: FieldValue.increment(points), cashbackBalance: FieldValue.increment(cashback), walletUpdatedAt: now });
    transaction.create(txRef, { customerId, type: "ADMIN_ADJUSTMENT", points, cashback, reason, createdBy: request.auth.uid, createdAt: now });
    transaction.set(db.collection("activityLogs").doc(), { action: "wallet-adjustment", collection: "customers", entityId: customerId, points, cashback, reason, userId: request.auth.uid, createdAt: now });
  });
  return { ok: true };
});

export const updateWhatsappConsent = onCall(adminOptions, async request => {
  requirePermission(request, "customers");
  const customerId = sanitizeText(request.data?.customerId, 100); const optedIn = request.data?.optedIn === true; const source = sanitizeText(request.data?.source || "in_branch", 60);
  const customerRef = db.doc(`customers/${customerId}`); const historyRef = db.collection("whatsappConsentHistory").doc();
  await db.runTransaction(async transaction => { const customer = await transaction.get(customerRef); if (!customer.exists) throw new HttpsError("not-found", "العميل غير موجود"); const now=FieldValue.serverTimestamp();transaction.update(customerRef,{whatsappOptIn:optedIn,whatsappConsentUpdatedAt:now,updatedAt:now});transaction.create(historyRef,{customerId,optedIn,source,updatedBy:request.auth.uid,createdAt:now}) });
  return { ok: true, optedIn };
});

export const previewWhatsappCampaign = onCall(whatsappOptions, async request => {
  requirePermission(request, "campaigns");
  const templateName = sanitizeText(request.data?.templateName, 120);
  const branchId = sanitizeText(request.data?.branchId || "all", 40).toLowerCase();
  if (!/^[a-z0-9_]{1,120}$/.test(templateName) || !/^(all|[a-z0-9-]{2,40})$/.test(branchId)) throw new HttpsError("invalid-argument", "القالب أو الفرع غير صحيح");
  if (branchId !== "all") requireBranchAccess(request, branchId);
  let query = db.collection("customers").where("whatsappOptIn", "==", true);
  if (branchId !== "all") query = query.where("lastBranchId", "==", branchId);
  const [count, settings] = await Promise.all([query.count().get(), readSettings()]);
  return { templateName, branchId, eligibleCount: Number(count.data().count || 0), killSwitchEnabled: settings.whatsappCampaignsEnabled === true, metaConfigured: Boolean(whatsappAccessToken.value() && whatsappPhoneNumberId.value()), variables: [], testModeRecommended: true };
});

export const createWhatsappCampaign = onCall(adminOptions, async request => {
  requirePermission(request, "campaigns");
  const name = sanitizeText(request.data?.name, 120);
  const templateName = sanitizeText(request.data?.templateName, 120);
  const branchId = sanitizeText(request.data?.branchId || "all", 40).toLowerCase();
  const recipientCap = Math.max(1, Math.min(1000000, Math.floor(Number(request.data?.recipientCap || 100))));
  const idempotencyKey = sanitizeText(request.data?.idempotencyKey, 100);
  if (!name || !/^[a-z0-9_]{1,120}$/.test(templateName) || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) throw new HttpsError("invalid-argument", "اسم الحملة أو القالب غير صحيح");
  if (branchId !== "all") requireBranchAccess(request, branchId);
  const settings = await readSettings();
  if (settings.whatsappCampaignsEnabled !== true) throw new HttpsError("failed-precondition", "إرسال الحملات متوقف من إعدادات النظام");
  const campaignRef = db.collection("campaigns").doc();
  const guardRef = db.doc(`campaignGuards/${hash(`${request.auth.uid}|${idempotencyKey}`)}`);
  const created = await db.runTransaction(async transaction => {
    const guard = await transaction.get(guardRef);
    if (guard.exists) return { campaignId: guard.data().campaignId, idempotent: true };
    const now = FieldValue.serverTimestamp();
    transaction.create(campaignRef, { name, templateName, languageCode: sanitizeText(request.data?.languageCode || "ar", 10), branchId, state: "QUEUED", testMode: request.data?.testMode !== false, recipientCap, eligibleCount: Number(request.data?.eligibleCount || 0), sentCount: 0, failedCount: 0, lastCustomerId: null, createdBy: request.auth.uid, requestId: idempotencyKey, createdAt: now, updatedAt: now });
    transaction.create(guardRef, { campaignId: campaignRef.id, createdBy: request.auth.uid, createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000) });
    transaction.set(db.collection("activityLogs").doc(), { action: "queue-whatsapp-campaign", targetType: "campaign", targetId: campaignRef.id, branchId, actorUid: request.auth.uid, requestId: idempotencyKey, createdAt: now });
    return { campaignId: campaignRef.id, idempotent: false };
  });
  if (created.idempotent) return { ok: true, campaignId: created.campaignId, state: "QUEUED", idempotent: true };
  await getAdminFunctions().taskQueue("processCampaignBatch").enqueue({ campaignId: campaignRef.id });
  return { ok: true, campaignId: campaignRef.id, state: "QUEUED" };
});

export const sendWhatsappReceipt = onCall(whatsappOptions, async request => {
  requirePermission(request, "pos");
  await enforceRateLimit(request, "whatsapp_receipt", 60, 15 * 60 * 1000, request.auth.uid);
  const bookingId = sanitizeText(request.data?.bookingId, 100);
  const bookingSnapshot = await db.doc(`bookings/${bookingId}`).get();
  if (!bookingSnapshot.exists) throw new HttpsError("not-found", "الشيك غير موجود");
  const booking = bookingSnapshot.data(); requireBranchAccess(request, booking.branchId);
  const settings = await readSettings();
  if (settings.whatsappReceiptsEnabled !== true) throw new HttpsError("failed-precondition", "إرسال الشيكات عبر واتساب متوقف");
  const accessToken = whatsappAccessToken.value(); const phoneNumberId = whatsappPhoneNumberId.value();
  if (!accessToken || !phoneNumberId) throw new HttpsError("failed-precondition", "إعداد Meta غير مكتمل");
  const templateName = sanitizeText(settings.whatsappReceiptTemplate, 120);
  if (!/^[a-z0-9_]{1,120}$/.test(templateName)) throw new HttpsError("failed-precondition", "قالب شيك واتساب غير مضبوط");
  const guardRef = db.doc(`whatsappOperations/receipt_${bookingId}`);
  const claim = await db.runTransaction(async transaction => {
    const guard = await transaction.get(guardRef);
    if (guard.data()?.status === "SENT") return "SENT";
    if (guard.data()?.status === "SENDING" && Number(guard.data()?.leaseUntil?.toMillis?.() || 0) > Date.now()) return "BUSY";
    transaction.set(guardRef, { bookingId, status: "SENDING", leaseUntil: Timestamp.fromMillis(Date.now() + 2 * 60 * 1000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return "CLAIMED";
  });
  if (claim === "SENT") return { ok: true, idempotent: true };
  if (claim === "BUSY") throw new HttpsError("already-exists", "إرسال الشيك جارٍ بالفعل");
  const phone = normalizePhone(booking.phone).replace(/^0/, "20");
  const itemText = (booking.items || []).map(item => `${item.nameAr}: ${item.workerNameAr || booking.staffNameAr || "—"}`).join("، ").slice(0, 900);
  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: templateName, language: { code: "ar" }, components: [{ type: "body", parameters: [booking.branchNameAr || booking.branchId, booking.code || bookingId, itemText, String(booking.total || 0), booking.paymentStatus || "unpaid"].map(text => ({ type: "text", text: String(text) })) }] } }) });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) { await guardRef.set({ bookingId, status: "FAILED", statusCode: response.status, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); throw new HttpsError("unavailable", "تعذر إرسال الشيك عبر Meta حاليًا"); }
  const metaMessageId = sanitizeText(responseBody?.messages?.[0]?.id, 200) || null;
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(guardRef, { bookingId, customerId: booking.phoneHash || null, status: "SENT", deliveryStatus: "sent", metaMessageId, leaseUntil: null, sentBy: request.auth.uid, sentAt: now }, { merge: true });
  batch.set(db.collection("activityLogs").doc(), { action: "send-whatsapp-receipt", targetType: "booking", targetId: bookingId, branchId: booking.branchId, actorUid: request.auth.uid, createdAt: now });
  await batch.commit();
  return { ok: true };
});

export const updateWhatsappCampaignState = onCall(adminOptions, async request => {
  requirePermission(request, "campaigns");
  const campaignId = sanitizeText(request.data?.campaignId, 100);
  const action = sanitizeText(request.data?.action, 20).toUpperCase();
  const states = { PAUSE: "PAUSED", RESUME: "QUEUED", CANCEL: "CANCELLED" };
  if (!campaignId || !states[action]) throw new HttpsError("invalid-argument", "طلب الحملة غير صحيح");
  const ref = db.doc(`campaigns/${campaignId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "الحملة غير موجودة");
  if (["COMPLETED", "CANCELLED"].includes(snapshot.data().state)) throw new HttpsError("failed-precondition", "الحملة منتهية");
  await ref.update({ state: states[action], updatedAt: FieldValue.serverTimestamp() });
  if (action === "RESUME") await getAdminFunctions().taskQueue("processCampaignBatch").enqueue({ campaignId });
  return { ok: true, state: states[action] };
});

export const processCampaignBatch = onTaskDispatched({ region, secrets: [whatsappAccessToken, whatsappPhoneNumberId], retryConfig: { maxAttempts: 5, minBackoffSeconds: 30 }, rateLimits: { maxConcurrentDispatches: 2 } }, async request => {
  const campaignId = sanitizeText(request.data?.campaignId, 100);
  const ref = db.doc(`campaigns/${campaignId}`);
  const snapshot = await ref.get();
  if (!snapshot.exists || !["QUEUED", "SENDING"].includes(snapshot.data().state)) return;
  const campaign = snapshot.data();
  const settings = await readSettings();
  if (settings.whatsappCampaignsEnabled !== true) { await ref.update({ state: "PAUSED", lastError: "FEATURE_DISABLED", updatedAt: FieldValue.serverTimestamp() }); return; }
  const accessToken = whatsappAccessToken.value(); const phoneNumberId = whatsappPhoneNumberId.value();
  if (!accessToken || !phoneNumberId) { await ref.update({ state: "PAUSED", lastError: "META_NOT_CONFIGURED", updatedAt: FieldValue.serverTimestamp() }); return; }
  const remaining = Number(campaign.recipientCap || 100) - Number(campaign.sentCount || 0);
  if (remaining <= 0) { await ref.update({ state: "COMPLETED", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); return; }
  let query = db.collection("customers").where("whatsappOptIn", "==", true);
  if (campaign.branchId && campaign.branchId !== "all") query = query.where("lastBranchId", "==", campaign.branchId);
  query = query.orderBy("__name__").limit(Math.min(100, remaining));
  if (campaign.lastCustomerId) query = query.startAfter(campaign.lastCustomerId);
  const customers = await query.get();
  if (customers.empty) { await ref.update({ state: "COMPLETED", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }); return; }
  await ref.update({ state: "SENDING", updatedAt: FieldValue.serverTimestamp() });
  let sent = 0; let failed = 0;
  for (const customerSnapshot of customers.docs) {
    const customer = customerSnapshot.data();
    const recipientRef = db.doc(`campaignRecipients/${campaignId}_${customerSnapshot.id}`);
    const allowed = !campaign.testMode || (Array.isArray(settings.whatsappTestCustomerIds) && settings.whatsappTestCustomerIds.includes(customerSnapshot.id));
    const claim = await db.runTransaction(async transaction => {
      const existing = await transaction.get(recipientRef);
      const value = existing.data() || {};
      if (["SENT", "SKIPPED_TEST_MODE"].includes(value.status)) return false;
      if (value.status === "SENDING" && Number(value.leaseUntil?.toMillis?.() || 0) > Date.now()) return false;
      transaction.set(recipientRef, { campaignId, customerId: customerSnapshot.id, status: allowed ? "SENDING" : "SKIPPED_TEST_MODE", attempts: FieldValue.increment(allowed ? 1 : 0), leaseUntil: allowed ? Timestamp.fromMillis(Date.now() + 2 * 60 * 1000) : null, updatedAt: FieldValue.serverTimestamp(), ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
      return allowed;
    });
    if (!claim) continue;
    try {
      const phone = normalizePhone(customer.phone).replace(/^0/, "20");
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "template", template: { name: campaign.templateName, language: { code: campaign.languageCode || "ar" } } }) });
        if (response.ok || (response.status < 500 && response.status !== 429)) break;
      }
      const responseBody = await response?.json().catch(() => ({}));
      if (!response?.ok) throw new Error(`META_${response?.status || "NETWORK"}`);
      const metaMessageId = sanitizeText(responseBody?.messages?.[0]?.id, 200) || null;
      await recipientRef.set({ status: "SENT", deliveryStatus: "sent", metaMessageId, leaseUntil: null, sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); sent++;
    } catch (error) { await recipientRef.set({ status: "FAILED", leaseUntil: null, error: sanitizeText(error.message, 100), updatedAt: FieldValue.serverTimestamp() }, { merge: true }); failed++; }
  }
  const lastCustomerId = customers.docs.at(-1).id;
  const nextSent = Number(campaign.sentCount || 0) + sent;
  const complete = customers.size < 100 || nextSent >= Number(campaign.recipientCap || 100);
  await ref.update({ state: complete ? (failed ? "PARTIAL" : "COMPLETED") : "QUEUED", sentCount: FieldValue.increment(sent), failedCount: FieldValue.increment(failed), lastCustomerId, updatedAt: FieldValue.serverTimestamp(), ...(complete ? { completedAt: FieldValue.serverTimestamp() } : {}) });
  if (!complete) await getAdminFunctions().taskQueue("processCampaignBatch").enqueue({ campaignId }, { scheduleDelaySeconds: 2 });
});

function validMetaSignature(request) {
  const signature = String(request.get("x-hub-signature-256") || "");
  if (!/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = `sha256=${createHmac("sha256", whatsappAppSecret.value()).update(request.rawBody || Buffer.from("")).digest("hex")}`;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export const whatsappWebhook = onRequest(whatsappWebhookOptions, async (request, response) => {
  response.set("Cache-Control", "no-store");
  if (request.method === "GET") {
    const mode = String(request.query["hub.mode"] || "");
    const token = String(request.query["hub.verify_token"] || "");
    const challenge = String(request.query["hub.challenge"] || "");
    if (mode !== "subscribe" || !challenge || token !== whatsappWebhookVerifyToken.value()) return response.status(403).send("verification failed");
    return response.status(200).send(challenge);
  }
  if (request.method !== "POST") return response.status(405).send("method not allowed");
  if (!validMetaSignature(request)) return response.status(401).send("invalid signature");
  const statuses = (Array.isArray(request.body?.entry) ? request.body.entry : [])
    .flatMap(entry => Array.isArray(entry?.changes) ? entry.changes : [])
    .flatMap(change => Array.isArray(change?.value?.statuses) ? change.value.statuses : [])
    .slice(0, 100);
  for (const item of statuses) {
    const metaMessageId = sanitizeText(item?.id, 200);
    const deliveryStatus = sanitizeText(item?.status, 30).toLowerCase();
    if (!metaMessageId || !["sent", "delivered", "read", "failed"].includes(deliveryStatus)) continue;
    const [receipts, recipients] = await Promise.all([
      db.collection("whatsappOperations").where("metaMessageId", "==", metaMessageId).limit(1).get(),
      db.collection("campaignRecipients").where("metaMessageId", "==", metaMessageId).limit(1).get()
    ]);
    const batch = db.batch();
    const deliveryPatch = { deliveryStatus, deliveryUpdatedAt: FieldValue.serverTimestamp(), ...(deliveryStatus === "failed" ? { deliveryErrorCode: sanitizeText(item?.errors?.[0]?.code, 40) || "META_FAILED" } : {}) };
    for (const snapshot of [...receipts.docs, ...recipients.docs]) batch.set(snapshot.ref, deliveryPatch, { merge: true });
    if (receipts.size || recipients.size) await batch.commit();
  }
  structuredLog("whatsapp_webhook", { statuses: statuses.length });
  return response.status(200).send("ok");
});

export const registerPushToken = onCall(adminOptions, async request => {
  requireRole(request);
  const token = sanitizeText(request.data?.token, 4096);
  if (!token) throw new HttpsError("invalid-argument", "Token required");
  await db.doc(`pushTokens/${hash(token)}`).set({ token, uid: request.auth.uid, role: request.auth.token.role, staffId: claimedStaffId(request) || null, branchIds: branchesFor(request), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

export const unregisterPushToken = onCall(adminOptions, async request => {
  requireRole(request);
  const token = sanitizeText(request.data?.token, 4096);
  if (!token) throw new HttpsError("invalid-argument", "Token required");
  const ref = db.doc(`pushTokens/${hash(token)}`);
  const snapshot = await ref.get();
  if (snapshot.exists && snapshot.data()?.uid === request.auth.uid) await ref.delete();
  return { ok: true };
});

export const setUserRole = onCall(adminOptions, async request => {
  requireRole(request, ["admin"]);
  const uid = sanitizeText(request.data?.uid, 128);
  const role = sanitizeText(request.data?.role, 30);
  const staffId = sanitizeText(request.data?.staffId, 100);
  const branchIds = [...new Set((Array.isArray(request.data?.branchIds) ? request.data.branchIds : []).map(value => sanitizeText(value, 40).toLowerCase()).filter(value => /^[a-z0-9-]{2,40}$/.test(value)))].slice(0, 10);
  const rolePermissionValues = role === "worker" ? ROLE_DEFAULT_PERMISSIONS.worker : ALL_PERMISSIONS;
  const permissions = [...new Set((Array.isArray(request.data?.permissions) ? request.data.permissions : ROLE_DEFAULT_PERMISSIONS[role] || []).map(value => sanitizeText(value, 30)).filter(value => rolePermissionValues.includes(value) && value !== "users"))];
  if (!uid || !["manager", "cashier", "worker"].includes(role)) throw new HttpsError("invalid-argument", "نوع الحساب غير صالح");
  if (uid === request.auth.uid) throw new HttpsError("failed-precondition", "لا يمكنك تعديل صلاحيات حسابك الحالي");
  if (!branchIds.length) throw new HttpsError("invalid-argument", "حدد فرعًا واحدًا على الأقل لهذا الحساب");
  const userRef = db.doc(`users/${uid}`);
  const beforeSnapshot = await userRef.get();
  if (!beforeSnapshot.exists || beforeSnapshot.data()?.role === "admin") throw new HttpsError("failed-precondition", "لا يمكن تعديل حساب الأدمن من هذه الشاشة");
  const before = beforeSnapshot.data();
  if (role === "worker") {
    if (!staffId) throw new HttpsError("invalid-argument", "اربط حساب العامل بعضو فريق");
    const [staffSnapshot, linkedUsers] = await Promise.all([db.doc(`staff/${staffId}`).get(), db.collection("users").where("staffId", "==", staffId).limit(3).get()]);
    if (!staffSnapshot.exists || staffSnapshot.data()?.active === false || !Array.isArray(staffSnapshot.data()?.branchIds) || !branchIds.every(id => staffSnapshot.data().branchIds.includes(id))) throw new HttpsError("failed-precondition", "العامل غير موجود أو فروعه لا تطابق صلاحيات الحساب");
    if (linkedUsers.docs.some(document => document.id !== uid)) throw new HttpsError("already-exists", "هذا العامل مرتبط بحساب آخر بالفعل");
  }
  const { getAuth } = await import("firebase-admin/auth");
  await getAuth().setCustomUserClaims(uid, { role, permissions, branchIds, ...(role === "worker" ? { staffId } : {}) });
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(userRef, { role, permissions, branchIds, staffId: role === "worker" ? staffId : FieldValue.delete(), email: sanitizeText(request.data?.email, 200) || before.email || "", updatedAt: now }, { merge: true });
  if (role === "worker") batch.set(db.doc(`staff/${staffId}`), { userUid: uid, updatedAt: now }, { merge: true });
  if (before.staffId && before.staffId !== staffId) batch.set(db.doc(`staff/${before.staffId}`), { userUid: FieldValue.delete(), updatedAt: now }, { merge: true });
  batch.set(db.collection("activityLogs").doc(), {
    action: "set-user-role", collection: "users", entityId: uid,
    targetUserId: uid, targetUserName: sanitizeText(before.name, 80), targetUserEmail: sanitizeText(before.email || request.data?.email, 200),
    beforeRole: sanitizeText(before.role, 30), afterRole: role,
    permissionsAdded: permissions.filter(value => !(before.permissions || []).includes(value)),
    permissionsRemoved: (before.permissions || []).filter(value => !permissions.includes(value)),
    branchIds, userId: request.auth.uid, userName: sanitizeText(request.auth.token.name, 80), userEmail: sanitizeText(request.auth.token.email, 200), createdAt: now
  });
  await batch.commit();
  return { ok: true };
});

export const createAdminUser = onCall({ ...adminOptions, memory: "256MiB", concurrency: 10, maxInstances: 10 }, async request => {
  requireRole(request, ["admin"]);
  const name = sanitizeText(request.data?.name, 80);
  const email = sanitizeText(request.data?.email, 200).toLowerCase();
  const password = String(request.data?.password || "");
  const role = sanitizeText(request.data?.role, 30);
  const staffId = sanitizeText(request.data?.staffId, 100);
  const branchIds = [...new Set((Array.isArray(request.data?.branchIds) ? request.data.branchIds : []).map(value => sanitizeText(value, 40).toLowerCase()).filter(value => /^[a-z0-9-]{2,40}$/.test(value)))].slice(0, 10);
  const rolePermissionValues = role === "worker" ? ROLE_DEFAULT_PERMISSIONS.worker : ALL_PERMISSIONS;
  const permissions = [...new Set((Array.isArray(request.data?.permissions) ? request.data.permissions : ROLE_DEFAULT_PERMISSIONS[role] || []).map(value => sanitizeText(value, 30)).filter(value => rolePermissionValues.includes(value) && value !== "users"))];
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !branchIds.length || !["manager", "cashier", "worker"].includes(role) || (role === "worker" && !staffId)) throw new HttpsError("invalid-argument", "اكتب البيانات وحدد الفرع والعامل وباسورد 8 أحرف على الأقل");
  let staffSnapshot = null;
  if (role === "worker") {
    const [candidate, linkedUsers] = await Promise.all([db.doc(`staff/${staffId}`).get(), db.collection("users").where("staffId", "==", staffId).limit(1).get()]);
    if (!candidate.exists || candidate.data()?.active === false || !Array.isArray(candidate.data()?.branchIds) || !branchIds.every(id => candidate.data().branchIds.includes(id))) throw new HttpsError("failed-precondition", "العامل غير موجود أو فروعه لا تطابق الحساب");
    if (!linkedUsers.empty) throw new HttpsError("already-exists", "هذا العامل مرتبط بحساب آخر بالفعل");
    staffSnapshot = candidate;
  }
  const { getAuth } = await import("firebase-admin/auth");
  let user;
  try { user = await getAuth().createUser({ email, password, displayName: name, disabled: false }); }
  catch (error) {
    const messages = { "auth/email-already-exists": "البريد مستخدم بالفعل؛ راجع الحسابات الحالية في Firebase Authentication", "auth/invalid-email": "البريد الإلكتروني غير صحيح", "auth/invalid-password": "الباسورد غير صالح؛ استخدم 8 أحرف وأرقام على الأقل", "auth/operation-not-allowed": "فعّل تسجيل الدخول بالبريد والباسورد من Firebase Authentication", "auth/too-many-requests": "محاولات كثيرة؛ انتظر قليلًا ثم أعد المحاولة" };
    console.error("createAdminUser createUser failed", { code: error.code, message: error.message });
    throw new HttpsError(error.code === "auth/email-already-exists" ? "already-exists" : "failed-precondition", messages[error.code] || "تعذر إنشاء الحساب داخل Firebase Authentication");
  }
  try {
    await getAuth().setCustomUserClaims(user.uid, { role, permissions, branchIds, ...(role === "worker" ? { staffId } : {}) });
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    batch.set(db.doc(`users/${user.uid}`), { name, email, role, permissions, branchIds, staffId: role === "worker" ? staffId : null, active: true, mustChangePassword: true, createdBy: request.auth.uid, createdAt: now, updatedAt: now });
    if (role === "worker" && staffSnapshot) batch.set(staffSnapshot.ref, { userUid: user.uid, updatedAt: now }, { merge: true });
    batch.set(db.collection("activityLogs").doc(), { action: "create-user-account", collection: "users", entityId: user.uid, targetUserName: name, targetUserEmail: email, afterRole: role, staffId: role === "worker" ? staffId : null, branchIds, userId: request.auth.uid, createdAt: now });
    await batch.commit();
  } catch (error) {
    await getAuth().deleteUser(user.uid).catch(() => {});
    console.error("createAdminUser permissions failed", { code: error.code, message: error.message });
    throw new HttpsError("internal", "تعذر حفظ صلاحيات الحساب؛ لم يتم إنشاء الحساب");
  }
  let activationLink = "";
  try { activationLink = await getAuth().generatePasswordResetLink(email); } catch {}
  return { ok: true, uid: user.uid, activationLink };
});

export const notifyAdminsOnBooking = onDocumentCreated({ region, document: "bookings/{bookingId}" }, async event => {
  const booking = event.data?.data();
  if (!booking) return;
  const snapshot = await db.collection("pushTokens").limit(500).get();
  const tokens = snapshot.docs.map(doc => doc.data()).filter(item => item.token && (item.role === "admin" || (Array.isArray(item.branchIds) && item.branchIds.includes(booking.branchId)))).map(item => item.token);
  if (!tokens.length) return;
  const response = await getMessaging().sendEachForMulticast({
    tokens,
    notification: { title: `حجز جديد • ${booking.branchNameAr || "مزين مصر"}`, body: `${booking.customerName} • ${booking.bookingDate || "طلب منتجات"} ${booking.bookingTime || ""}`.trim() },
    webpush: { fcmOptions: { link: "/admin/" }, notification: { icon: "/assets/el-mezaen-logo.jpeg", badge: "/assets/el-mezaen-logo.jpeg", requireInteraction: true, tag: booking.code } },
    data: { bookingId: event.params.bookingId, type: "new_booking" }
  });
  const deletes = [];
  response.responses.forEach((result, index) => { if (!result.success && ["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(result.error?.code)) deletes.push(db.doc(`pushTokens/${hash(tokens[index])}`).delete()); });
  await Promise.all(deletes);
});
