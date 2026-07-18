import { createHash, randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { calculateCoupon, calculatePayroll, calculateRevenueBreakdown, createSlotKeys, isDrinkAvailableAtBranch, isRecentAuthentication, minutes, normalizeExpenseInput, normalizePhone, paymentTransition, priceItems, validateAppointment } from "./core.js";

initializeApp();
const db = getFirestore();
const region = "europe-west1";
const enforcePublicAppCheck = process.env.ENFORCE_APP_CHECK === "true";
const publicOptions = { region, cors: true, enforceAppCheck: enforcePublicAppCheck, memory: "512MiB", cpu: 1, concurrency: 80, maxInstances: 100, timeoutSeconds: 30 };
const catalogOptions = { ...publicOptions, minInstances: process.env.KEEP_CATALOG_WARM === "true" ? 1 : 0 };
const adminOptions = { region, cors: true, enforceAppCheck: enforcePublicAppCheck, memory: "512MiB", cpu: 1, concurrency: 40, maxInstances: 50, timeoutSeconds: 30 };
const PUBLIC_COLLECTIONS = ["branches", "categories", "services", "packages", "staff", "offers", "content", "translations", "reviews"];
const ADMIN_COLLECTIONS = ["branches", "categories", "services", "packages", "staff", "offers", "coupons", "content", "holidays", "translations", "settings", "inventoryItems", "drinks", "reviews"];
// Keep "worker" only as a legacy cashier role so previously-created accounts still work.
const ADMIN_ROLES = ["admin", "manager", "cashier", "worker"];
const ALL_PERMISSIONS = ["dashboard", "pos", "bookings", "revenue", "expenses", "inventory", "drinks", "payroll", "services", "packages", "offers", "coupons", "staff", "customers", "reviews", "schedule", "gallery", "celebrities", "posts", "settings", "activity", "users"];
const ROLE_DEFAULT_PERMISSIONS = {
  manager: ALL_PERMISSIONS.filter(value => !["users", "activity"].includes(value)),
  cashier: ["dashboard", "pos", "bookings", "customers"],
  worker: ["dashboard", "pos", "bookings", "customers"]
};
const COLLECTION_PERMISSIONS = { branches: "settings", categories: "services", services: "services", packages: "packages", staff: "staff", offers: "offers", coupons: "coupons", content: "posts", holidays: "schedule", translations: "settings", settings: "settings", inventoryItems: "inventory", drinks: "drinks", reviews: "reviews", customers: "customers", activityLogs: "activity", users: "users", revenueLedger: "revenue", expenses: "expenses", payrollPayments: "payroll" };
const EXPENSE_CATEGORIES = ["inventory", "electricity", "water", "rent", "salary", "maintenance", "tools", "marketing", "other"];
const INVENTORY_CATEGORIES = ["product", "supply"];
const DRINK_TYPES = ["hot", "cold", "soft-drink", "other"];
const CATALOG_CACHE_MS = Math.max(15_000, Math.min(300_000, Number(process.env.CATALOG_CACHE_MS || 60_000)));
let catalogCache = null;
let catalogCacheExpiresAt = 0;
let catalogLoadPromise = null;

const cleanDoc = snapshot => ({ id: snapshot.id, ...snapshot.data(), startAt: toIso(snapshot.data().startAt), endAt: toIso(snapshot.data().endAt), createdAt: toIso(snapshot.data().createdAt), updatedAt: toIso(snapshot.data().updatedAt), lastBookingAt: toIso(snapshot.data().lastBookingAt), paidAt: toIso(snapshot.data().paidAt), refundedAt: toIso(snapshot.data().refundedAt) });
const toIso = value => value?.toDate ? value.toDate().toISOString() : value || null;
const hash = value => createHash("sha256").update(String(value)).digest("hex").slice(0, 32);
const bookingCode = branchCode => `MZ-${String(branchCode || "BR").replace(/[^A-Z0-9]/g, "").slice(0, 3) || "BR"}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomBytes(3).toString("hex").toUpperCase()}`;

function businessDateParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, month: `${parts.year}-${parts.month}` };
}

function normalizeDrinkOptions(value) {
  const options = (Array.isArray(value) ? value : [value]).flatMap(item => String(item || "").split(/[،,]/));
  return [...new Set(options.map(item => sanitizeText(item, 40)).filter(Boolean))].slice(0, 12);
}

function requestFingerprint(request, extra = "") {
  const forwarded = request.rawRequest?.headers?.["x-forwarded-for"];
  const ip = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || request.rawRequest?.ip || "unknown").split(",")[0].trim();
  return hash(`${ip}|${extra}`);
}

async function enforceRateLimit(request, action, limit, windowMs, extra = "") {
  const bucket = Math.floor(Date.now() / windowMs);
  const ref = db.doc(`rateLimits/${hash(`${action}|${requestFingerprint(request, extra)}|${bucket}`)}`);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const count = Number(snapshot.data()?.count || 0);
    if (count >= limit) throw new HttpsError("resource-exhausted", "محاولات كثيرة، حاول مرة أخرى لاحقًا");
    transaction.set(ref, { action, count: count + 1, expiresAt: Timestamp.fromMillis((bucket + 2) * windowMs), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
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
  return new Set(claimed.filter(value => ALL_PERMISSIONS.includes(value)));
}

function hasPermission(request, permission) { return permissionsFor(request).has(permission); }
function contentPermission(type) { return type === "gallery" ? "gallery" : type === "celebrity" ? "celebrities" : "posts"; }
function branchesFor(request) {
  const role = requireRole(request);
  if (role === "admin") return [];
  return [...new Set((Array.isArray(request.auth?.token?.branchIds) ? request.auth.token.branchIds : []).map(value => sanitizeText(value, 40).toLowerCase()).filter(value => /^[a-z0-9-]{2,40}$/.test(value)))];
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
  return true;
}

function invalidateCatalogCache() {
  catalogCache = null;
  catalogCacheExpiresAt = 0;
}
function requirePermission(request, permission) {
  const role = requireRole(request);
  if (role !== "admin" && !permissionsFor(request).has(permission)) throw new HttpsError("permission-denied", "لا تملك صلاحية هذا القسم");
  return role;
}

function requireRecentAdmin(request) {
  requireRole(request, ["admin"]);
  if (!isRecentAuthentication(request.auth?.token?.auth_time)) throw new HttpsError("unauthenticated", "أعد إدخال باسورد الأدمن لتأكيد الحذف");
}

function sanitizeText(value, max = 200) { return String(value || "").trim().slice(0, max); }

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
  return snapshot.exists ? snapshot.data() : { openingTime: "11:00", closingTime: "23:00", slotMinutes: 15 };
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
    Promise.all(PUBLIC_COLLECTIONS.map(name => db.collection(name).where("active", "==", true).limit(500).get())),
    db.collection("drinks").limit(200).get(),
    readSettings()
  ]);
  const payload = Object.fromEntries(PUBLIC_COLLECTIONS.map((name, index) => [name, results[index].docs.map(cleanDoc).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))]));
  payload.drinks = drinksSnapshot.docs.flatMap(snapshot => {
    const item = snapshot.data();
    const price = Number(item.price || 0);
    if (item.active === false || !Number.isFinite(price) || price < 0 || !item.branchId) return [];
    const nameAr = sanitizeText(item.nameAr, 100);
    if (!nameAr) return [];
    const drinkBranch = sanitizeText(item.branchId, 40).toLowerCase();
    return [{ id: snapshot.id, nameAr, nameEn: sanitizeText(item.nameEn || item.nameAr, 100), type: DRINK_TYPES.includes(item.type) ? item.type : "other", price, drinkOptions: normalizeDrinkOptions(item.drinkOptions), branchId: drinkBranch, branchIds: drinkBranch === "all" ? [] : [drinkBranch], maxQty: 20, active: true, sortOrder: Number(item.sortOrder || 0) }];
  }).sort((a, b) => a.sortOrder - b.sortOrder);
  payload.settings = publicSettings;
  return payload;
}

export const getCatalog = onCall(catalogOptions, async () => {
  if (catalogCache && Date.now() < catalogCacheExpiresAt) return catalogCache;
  catalogLoadPromise ||= loadCatalog().then(payload => {
    catalogCache = payload;
    catalogCacheExpiresAt = Date.now() + CATALOG_CACHE_MS;
    return payload;
  }).finally(() => { catalogLoadPromise = null; });
  return await catalogLoadPromise;
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
  return priceItems(lines, map, new Date(), branchId);
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
  await enforceRateLimit(request, "booking", 5, 15 * 60 * 1000, customer.phone);
  if (!customer.firstName || !customer.lastName) throw new HttpsError("invalid-argument", "بيانات العميل غير مكتملة");
  const clientRequestId = sanitizeText(data.clientRequestId, 80);
  if (!clientRequestId) throw new HttpsError("invalid-argument", "معرف الطلب مفقود");
  const rawLines = Array.isArray(data.items) ? data.items.slice(0, 30).map(line => ({ id: sanitizeText(line?.id, 100), kind: sanitizeText(line?.kind, 20), qty: Math.max(1, Math.min(20, Math.floor(Number(line?.qty || 1)))), option: sanitizeText(line?.option, 40) })) : [];
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
      candidates = snapshot.docs.map(cleanDoc).filter(member => member.available !== false && (!Array.isArray(member.branchIds) || !member.branchIds.length || member.branchIds.includes(branchId))).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0)).slice(0, maxCandidates);
    } else {
      const snapshot = await db.doc(`staff/${requestedStaffId}`).get();
      if (snapshot.exists && snapshot.data().active !== false && snapshot.data().available !== false) candidates = [cleanDoc(snapshot)].filter(member => !Array.isArray(member.branchIds) || !member.branchIds.length || member.branchIds.includes(branchId));
    }
    const day = new Date(`${data.bookingDate}T12:00:00`).getDay();
    const appointmentStart = minutes(data.bookingTime);
    const appointmentEnd = appointmentStart + duration;
    const requestedServiceIds = appointmentItems.map(item => item.id);
    candidates = candidates.filter(member => {
      if (Array.isArray(member.workDays) && !member.workDays.map(Number).includes(day)) return false;
      if (Array.isArray(member.serviceIds) && member.serviceIds.length && !requestedServiceIds.every(id => member.serviceIds.includes(id))) return false;
      if (appointmentStart < minutes(member.shiftStart || settings.openingTime) || appointmentEnd > minutes(member.shiftEnd || settings.closingTime)) return false;
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
  const requestGuardRef = db.doc(`requestGuards/${hash(clientRequestId)}`);
  const duplicateRef = db.doc(`bookingGuards/${hash(`${branchId}|${customer.phone}|${data.bookingDate || "product"}|${data.bookingTime || clientRequestId}`)}`);
  const customerRef = db.doc(`customers/${hash(customer.phone)}`);
  const couponCode = sanitizeText(data.couponCode, 30).toUpperCase();
  const couponRef = couponCode ? db.doc(`coupons/${couponCode}`) : null;
  const couponUsageRef = couponCode ? db.doc(`couponUsage/${couponCode}_${hash(customer.phone)}`) : null;
  const inventoryRefs = inventoryLines.map(line => db.doc(`inventoryItems/${line.id}`));
  const drinkRefs = drinkLines.map(line => db.doc(`drinks/${line.id}`));

  try {
    return await db.runTransaction(async transaction => {
      const baseReads = await Promise.all([transaction.get(requestGuardRef), transaction.get(duplicateRef), couponRef ? transaction.get(couponRef) : null, couponUsageRef ? transaction.get(couponUsageRef) : null]);
      if (baseReads[0].exists) throw new Error("DUPLICATE_REQUEST");
      if (baseReads[1].exists) throw new Error("DUPLICATE_BOOKING");
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
      transaction.create(duplicateRef, { bookingId: code, createdAt: now });
      transaction.set(customerRef, { firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone, lastBranchId: branchId, lastBookingAt: now, bookingCount: FieldValue.increment(1) }, { merge: true });
      if (assigned?.id) transaction.update(db.doc(`staff/${assigned.id}`), { bookingCount: FieldValue.increment(1), updatedAt: now });
      assignedLockRefs.forEach(ref => transaction.create(ref, { bookingId: code, branchId, staffId: assigned.id, date: data.bookingDate, time: data.bookingTime, createdAt: now }));
      inventoryItems.forEach(item => {
        transaction.update(item.ref, { stockQty: FieldValue.increment(-item.qty), updatedAt: now });
        transaction.create(db.doc(`stockMovements/${code}_${item.id}`), { inventoryItemId: item.id, branchId, bookingId: code, quantity: -item.qty, type: "booking-sale", dateKey: businessDateParts().dateKey, createdAt: now, source: "website" });
      });
      if (couponResult.valid) {
        transaction.update(couponRef, { usageCount: FieldValue.increment(1), discountTotal: FieldValue.increment(discount), updatedAt: now });
        transaction.set(couponUsageRef, { code: couponCode, phoneHash: hash(customer.phone), count: FieldValue.increment(1), discountTotal: FieldValue.increment(discount), updatedAt: now }, { merge: true });
      }
      return { ok: true, bookingCode: code, branchId, branchNameAr: branch.nameAr, subtotal, discountAmount: discount, discountPercent: couponResult.discountPercent || 0, total, staffId: assigned?.id || null, staffNameAr: assigned?.nameAr || null };
    });
  } catch (error) {
    const messages = { DUPLICATE_REQUEST: "تم إرسال هذا الطلب من قبل", DUPLICATE_BOOKING: "يوجد حجز مطابق لهذا الرقم والموعد", SLOT_UNAVAILABLE: "الموعد غير متاح، اختر وقتًا آخر", DRINK_UNAVAILABLE: "أحد المشروبات غير متاح في هذا الفرع", DRINK_STOCK: "الكمية المطلوبة من أحد المشروبات غير متاحة", DRINK_PRICE: "سعر أحد المشروبات غير صحيح", DRINK_OPTION: "اختيار تحضير المشروب غير صحيح" };
    const code = ["DUPLICATE_REQUEST", "DUPLICATE_BOOKING"].includes(error.message) ? "already-exists" : "failed-precondition";
    throw new HttpsError(code, messages[error.message] || "تعذر إنشاء الحجز");
  }
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
  });
  return { ok: true };
});

export const getAdminDashboard = onCall(adminOptions, async request => {
  const access = permissionsFor(request);
  if (!["dashboard", "bookings", "revenue", "expenses", "pos"].some(value => access.has(value))) throw new HttpsError("permission-denied", "لا تملك صلاحية لوحة المتابعة");
  const canBookings = access.has("dashboard") || access.has("bookings") || access.has("pos");
  const canRevenue = access.has("dashboard") || access.has("revenue");
  const canExpenses = access.has("dashboard") || access.has("expenses");
  const [bookingsSnap, ledgerSnap, expensesSnap] = await Promise.all([
    canBookings ? db.collection("bookings").orderBy("createdAt", "desc").limit(500).get() : { docs: [] },
    canRevenue ? db.collection("revenueLedger").orderBy("createdAt", "desc").limit(1000).get() : { docs: [] },
    canExpenses ? db.collection("expenses").orderBy("createdAt", "desc").limit(1000).get() : { docs: [] }
  ]);
  const allowedBranches = branchesFor(request);
  const bookings = bookingsSnap.docs.map(cleanDoc).filter(item => itemInAllowedBranch(item, allowedBranches));
  const ledger = ledgerSnap.docs.map(cleanDoc).filter(item => itemInAllowedBranch(item, allowedBranches));
  const expenses = expensesSnap.docs.map(cleanDoc).filter(item => itemInAllowedBranch(item, allowedBranches));
  const today = businessDateParts().dateKey;
  const month = today.slice(0, 7);
  const revenue = period => ledger.filter(item => !period || String(item.dateKey || "").startsWith(period)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenseTotal = period => expenses.filter(item => !period || String(item.dateKey || "").startsWith(period)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return {
    bookings,
    ledger,
    expenses,
    stats: {
      bookingCount: bookings.length,
      todayBookings: bookings.filter(item => item.bookingDate === today).length,
      unpaidCount: bookings.filter(item => item.paymentStatus === "unpaid").length,
      paidCount: bookings.filter(item => item.paymentStatus === "paid").length,
      todayRevenue: revenue(today),
      monthRevenue: revenue(month),
      totalRevenue: revenue(),
      todayExpenses: expenseTotal(today),
      monthExpenses: expenseTotal(month),
      totalExpenses: expenseTotal(),
      monthNetProfit: revenue(month) - expenseTotal(month),
      totalNetProfit: revenue() - expenseTotal(),
      lastCollected: ledger.find(item => item.type === "payment")?.amount || 0
    }
  };
});

export const getAdminCollection = onCall(adminOptions, async request => {
  const role = requireRole(request);
  const collection = sanitizeText(request.data?.collection, 40);
  const allowed = [...ADMIN_COLLECTIONS, "customers", "activityLogs", "users", "revenueLedger", "expenses", "payrollPayments"];
  if (!allowed.includes(collection)) throw new HttpsError("invalid-argument", "قسم غير صالح");
  const permission = COLLECTION_PERMISSIONS[collection];
  const posReadable = hasPermission(request, "pos") && ["categories", "services", "packages", "staff", "customers", "drinks", "inventoryItems"].includes(collection);
  const operationsReadable = (hasPermission(request, "revenue") || hasPermission(request, "payroll")) && ["services", "staff"].includes(collection);
  const scheduleReadable = hasPermission(request, "schedule") && collection === "settings";
  const contentReadable = collection === "content" && ["gallery", "celebrities", "posts"].some(value => hasPermission(request, value));
  if (role !== "admin" && permission && !hasPermission(request, permission) && !posReadable && !operationsReadable && !scheduleReadable && !contentReadable) throw new HttpsError("permission-denied", "لا تملك صلاحية هذا القسم");
  if (collection === "settings") {
    const snapshot = await db.doc("settings/public").get();
    return { items: snapshot.exists ? [cleanDoc(snapshot)] : [] };
  }
  const snapshot = await db.collection(collection).limit(Math.min(500, Number(request.data?.limit || 200))).get();
  let items = snapshot.docs.map(cleanDoc);
  const allowedBranches = branchesFor(request);
  if (role !== "admin" && collection !== "users") items = items.filter(item => itemInAllowedBranch(item, allowedBranches));
  if (role !== "admin" && collection === "users") items = [];
  if ((posReadable || operationsReadable) && !hasPermission(request, permission)) {
    if (collection === "staff") items = items.map(({ baseSalary, monthlyTarget, targetBonusPercent, revenueTotal, ...item }) => item);
    if (collection === "inventoryItems") items = items.map(({ costPrice, minStock, ...item }) => item);
  }
  if (role !== "admin" && collection === "content") items = items.filter(item => hasPermission(request, contentPermission(item.type)));
  return { items };
});

function normalizeAdminPayload(collection, raw) {
  const payload = { ...raw };
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;
  ["price", "originalPrice", "oldPrice", "newPrice", "duration", "sortOrder", "slotMinutes", "value", "maxDiscount", "minSubtotal", "totalUsageLimit", "perPhoneLimit", "baseSalary", "monthlyTarget", "targetBonusPercent", "costPrice", "sellingPrice", "stockQty", "minStock", "rating"].forEach(key => { if (key in payload) payload[key] = Number(payload[key] || 0); });
  ["active", "available", "showCountdown", "startsFrom", "closed", "featured"].forEach(key => { if (key in payload) payload[key] = payload[key] === true || payload[key] === "true" || payload[key] === 1 || payload[key] === "1"; });
  ["branchIds", "serviceIds", "includedServiceIds", "applicableItemIds", "workDays", "breaks"].forEach(key => { if (typeof payload[key] === "string") payload[key] = payload[key].split(",").map(item => item.trim()).filter(Boolean); });
  if (Array.isArray(payload.workDays)) payload.workDays = payload.workDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
  ["startAt", "endAt"].forEach(key => { if (payload[key]) payload[key] = Timestamp.fromDate(new Date(payload[key])); else if (key in payload) payload[key] = null; });
  if (collection === "coupons") payload.code = sanitizeText(payload.code || raw.id, 30).toUpperCase();
  if (collection === "branches") {
    payload.code = sanitizeText(payload.code, 3).toUpperCase();
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
  return payload;
}

export const adminUpsert = onCall(adminOptions, async request => {
  const collection = sanitizeText(request.data?.collection, 40);
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
  if (!id) id = db.collection(collection).doc().id;
  const ref = db.collection(collection).doc(id);
  const before = await ref.get();
  if (request.auth.token.role !== "admin" && before.exists && !itemInAllowedBranch(before.data(), branchesFor(request))) throw new HttpsError("permission-denied", "هذا السجل تابع لفرع آخر");
  const payload = normalizeAdminPayload(collection, raw);
  await ref.set({ ...payload, updatedAt: FieldValue.serverTimestamp(), ...(before.exists ? {} : { createdAt: FieldValue.serverTimestamp() }) }, { merge: true });
  await db.collection("activityLogs").add({ action: before.exists ? "update" : "create", collection, entityId: id, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
  if ([...PUBLIC_COLLECTIONS, "drinks"].includes(collection)) invalidateCatalogCache();
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
  if (!ADMIN_COLLECTIONS.includes(collection) || collection === "settings" || !id) throw new HttpsError("invalid-argument", "طلب حذف غير صالح");
  const target = await db.collection(collection).doc(id).get();
  if (role !== "admin" && target.exists && !itemInAllowedBranch(target.data(), branchesFor(request))) throw new HttpsError("permission-denied", "هذا السجل تابع لفرع آخر");
  if (collection === "content") {
    requirePermission(request, contentPermission(target.data()?.type));
  } else requirePermission(request, COLLECTION_PERMISSIONS[collection] || "settings");
  await db.collection(collection).doc(id).delete();
  await db.collection("activityLogs").add({ action: "delete", collection, entityId: id, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
  if ([...PUBLIC_COLLECTIONS, "drinks"].includes(collection)) invalidateCatalogCache();
  if (target.exists && ["content", "staff", "packages", "offers"].includes(collection)) await deleteManagedMedia(target.data());
  return { ok: true };
});

export const getBusinessDashboard = onCall(adminOptions, async request => {
  const access = permissionsFor(request);
  if (!["pos", "expenses", "inventory", "drinks", "payroll", "reviews"].some(value => access.has(value))) throw new HttpsError("permission-denied", "لا تملك صلاحية بيانات التشغيل");
  const currentMonth = businessDateParts().month;
  const month = sanitizeText(request.data?.month || currentMonth, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpsError("invalid-argument", "الشهر غير صحيح");
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonthDate = new Date(Date.UTC(year, monthNumber, 1));
  const nextMonth = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
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
    const revenue = ledger.filter(item => item.staffId === staff.id).reduce((sum, item) => sum + Number(item.revenueBreakdown?.services || 0), 0);
    return { ...staff, ...calculatePayroll({ ...staff, revenue }), payment: payrollPayments.get(staff.id) || null };
  }).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  const grossRevenue = ledger.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalExpenses = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const reviews = reviewsSnapshot.docs.map(cleanDoc).filter(item => itemInAllowedBranch(item, allowedBranches)).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const productPurchaseCost = expenses.filter(item => item.category === "inventory" && item.inventoryCategory !== "drink").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const drinkRevenue = ledger.reduce((sum, item) => sum + Number(item.revenueBreakdown?.drinks || 0), 0);
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
  return db.runTransaction(async transaction => {
    const existingExpense = await transaction.get(expenseRef);
    if (existingExpense.exists) {
      if (existingExpense.data().createdBy !== request.auth.uid) throw new HttpsError("already-exists", "تعذر تأمين العملية؛ استخدم محاولة جديدة");
      return { ok: true, id: expenseRef.id, idempotent: true };
    }
    const inventorySnapshot = inventoryRef ? await transaction.get(inventoryRef) : null;
    if (inventoryRef && !inventorySnapshot.exists) throw new HttpsError("not-found", "صنف المخزون غير موجود");
    if (inventorySnapshot?.exists && inventorySnapshot.data().branchId !== input.branchId) throw new HttpsError("failed-precondition", "صنف المخزون تابع لفرع آخر");
    const now = FieldValue.serverTimestamp();
    transaction.create(expenseRef, { ...input, idempotencyKey: null, inventoryItemId: inventoryRef ? input.inventoryItemId : null, inventoryCategory: inventorySnapshot?.data()?.category || null, stockQuantity: inventoryRef ? input.stockQuantity : 0, createdAt: now, createdBy: request.auth.uid, createdByEmail: request.auth.token.email || "", createdByName: request.auth.token.name || request.auth.token.email || request.auth.uid });
    if (inventorySnapshot?.exists && input.stockQuantity > 0) {
      const oldQuantity = Math.max(0, Number(inventorySnapshot.data().stockQty || 0));
      const oldCost = Math.max(0, Number(inventorySnapshot.data().costPrice || 0));
      const weightedCost = (oldQuantity * oldCost + input.amount) / (oldQuantity + input.stockQuantity);
      transaction.update(inventoryRef, { stockQty: FieldValue.increment(input.stockQuantity), costPrice: Math.round(weightedCost * 100) / 100, updatedAt: now });
      transaction.create(db.doc(`stockMovements/purchase_${expenseRef.id}`), { inventoryItemId: input.inventoryItemId, branchId: input.branchId, expenseId: expenseRef.id, quantity: input.stockQuantity, amount: input.amount, type: "purchase", dateKey: input.dateKey, createdAt: now, createdBy: request.auth.uid });
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
  const staffId = sanitizeText(request.data?.staffId || "none", 100);
  let staff = null;
  if (staffId !== "none") {
    const staffSnapshot = await db.doc(`staff/${staffId}`).get();
    if (!staffSnapshot.exists || staffSnapshot.data().active === false) throw new HttpsError("failed-precondition", "العامل غير متاح");
    staff = cleanDoc(staffSnapshot);
    if (Array.isArray(staff.branchIds) && staff.branchIds.length && !staff.branchIds.includes(branch.id)) throw new HttpsError("failed-precondition", "العامل غير متاح في الفرع المختار");
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
  return db.runTransaction(async transaction => {
    const existingGuard = await transaction.get(idempotencyRef);
    if (existingGuard.exists) return { ok: true, bookingCode: existingGuard.data().bookingCode, total: existingGuard.data().total, paymentStatus: existingGuard.data().paymentStatus, idempotent: true };
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
    const items = [...catalogItems, ...inventoryItems, ...drinkItems];
    const subtotal = items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
    const discountAmount = Math.max(0, Math.min(subtotal, Number(request.data?.discountAmount || 0)));
    const total = subtotal - discountAmount;
    const now = FieldValue.serverTimestamp();
    const publicItems = items.map(({ ref, ...item }) => item);
    const revenueBreakdown = calculateRevenueBreakdown(publicItems, total);
    transaction.create(bookingRef, { code, branchId: branch.id, branchNameAr: branch.nameAr, branchNameEn: branch.nameEn, branchPhone: branch.phone, branchWhatsapp: branch.whatsapp, customer, customerName: `${customer.firstName} ${customer.lastName}`.trim(), phone: customer.phone, phoneHash: hash(customer.phone), items: publicItems, itemIds: publicItems.map(item => item.id), serviceNamesAr: publicItems.map(item => `${item.nameAr}${item.option ? ` (${item.option})` : ""}`), staffId: staff?.id || "none", staffNameAr: staff?.nameAr || "بدون عامل", staffNameEn: staff?.nameEn || "No staff", bookingDate: dateKey, bookingTime: time, duration: catalogItems.reduce((sum, item) => sum + Number(item.duration || 0), 0), productOnly: catalogItems.every(item => !item.staffRequired), subtotal, discountAmount, discountPercent: subtotal ? Math.round(discountAmount / subtotal * 10000) / 100 : 0, total, status: "completed", paymentStatus: paid ? "paid" : "unpaid", paymentMethod: paid ? method : null, source: "pos", createdAt: now, updatedAt: now, paidAt: paid ? now : null });
    transaction.set(customerRef, { firstName: customer.firstName, lastName: customer.lastName, phone: customer.phone, lastBranchId: branch.id, lastBookingAt: now, bookingCount: FieldValue.increment(1), ...(paid ? { totalSpent: FieldValue.increment(total) } : {}) }, { merge: true });
    if (staff) transaction.update(db.doc(`staff/${staff.id}`), { bookingCount: FieldValue.increment(1), ...(paid ? { revenueTotal: FieldValue.increment(revenueBreakdown.services) } : {}), updatedAt: now });
    if (paid) transaction.create(ledgerRef, { bookingId: code, bookingCode: code, branchId: branch.id, amount: total, revenueBreakdown, type: "payment", paymentMethod: method, staffId: staff?.id || "none", itemIds: publicItems.map(item => item.id), dateKey, source: "pos", createdAt: now, createdBy: request.auth.uid });
    inventoryItems.forEach(item => {
      transaction.update(item.ref, { stockQty: FieldValue.increment(-item.qty), updatedAt: now });
      transaction.create(db.doc(`stockMovements/${code}_${item.id}`), { inventoryItemId: item.id, branchId: branch.id, bookingId: code, quantity: -item.qty, type: "sale", dateKey, createdAt: now, createdBy: request.auth.uid });
    });
    transaction.create(idempotencyRef, { bookingCode: code, total, paymentStatus: paid ? "paid" : "unpaid", branchId: branch.id, createdBy: request.auth.uid, createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000) });
    transaction.set(activityRef, { action: "create-pos-order", collection: "bookings", entityId: code, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: now });
    return { ok: true, bookingCode: code, total, paymentStatus: paid ? "paid" : "unpaid" };
  });
});

export const recordPayrollPayment = onCall(adminOptions, async request => {
  requirePermission(request, "payroll");
  const month = sanitizeText(request.data?.month, 7);
  const staffId = sanitizeText(request.data?.staffId, 100);
  const adjustment = Number(request.data?.adjustment || 0);
  if (!/^\d{4}-\d{2}$/.test(month) || !staffId || !Number.isFinite(adjustment) || Math.abs(adjustment) > 1000000) throw new HttpsError("invalid-argument", "بيانات صرف الراتب غير صحيحة");
  const [staffSnapshot, ledgerSnapshot] = await Promise.all([db.doc(`staff/${staffId}`).get(), db.collection("revenueLedger").limit(5000).get()]);
  if (!staffSnapshot.exists) throw new HttpsError("not-found", "العامل غير موجود");
  const staff = staffSnapshot.data();
  if (!itemInAllowedBranch(staff, branchesFor(request))) throw new HttpsError("permission-denied", "العامل تابع لفرع آخر");
  const revenue = ledgerSnapshot.docs.map(snapshot => snapshot.data()).filter(item => item.staffId === staffId && String(item.dateKey || "").startsWith(month)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
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

async function deleteBookingPermanently(id, request) {
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
    const customerBookings = customerRef ? await transaction.get(db.collection("bookings").where("phoneHash", "==", booking.phoneHash).limit(500)) : null;
    const previousBooking = customerBookings?.docs.filter(snapshot => snapshot.id !== id).sort((a, b) => Number(b.data().createdAt?.toMillis?.() || 0) - Number(a.data().createdAt?.toMillis?.() || 0))[0]?.data();

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
    transaction.set(activityRef, { action: "secure-delete-booking", collection: "bookings", entityId: id, userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
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

async function deleteExpensePermanently(id, request) {
  const expenseRef = db.doc(`expenses/${id}`);
  const activityRef = db.collection("activityLogs").doc();
  return db.runTransaction(async transaction => {
    const expenseSnapshot = await transaction.get(expenseRef);
    if (!expenseSnapshot.exists) throw new HttpsError("not-found", "المصروف غير موجود");
    const expense = expenseSnapshot.data();
    const inventoryRef = expense.inventoryItemId ? db.doc(`inventoryItems/${expense.inventoryItemId}`) : null;
    const payrollRef = expense.payrollPaymentId ? db.doc(`payrollPayments/${expense.payrollPaymentId}`) : null;
    const relatedRefs = [inventoryRef, payrollRef].filter(Boolean);
    const relatedSnapshots = relatedRefs.length ? await transaction.getAll(...relatedRefs) : [];
    const related = new Map(relatedSnapshots.map(snapshot => [snapshot.ref.path, snapshot]));
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
    transaction.set(activityRef, { action: "secure-delete-expense", collection: "expenses", entityId: id, branchId: expense.branchId || "", amount: expense.amount || 0, category: expense.category || "other", userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
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
  tokenSnapshots.docs.forEach(snapshot => batch.delete(snapshot.ref));
  batch.set(db.collection("activityLogs").doc(), { action: "secure-delete-user", collection: "users", entityId: uid, deletedUserEmail: sanitizeText(user.email, 200), deletedUserName: sanitizeText(user.name, 80), deletedUserRole: sanitizeText(user.role, 30), userId: request.auth.uid, userEmail: request.auth.token.email || "", createdAt: FieldValue.serverTimestamp() });
  await batch.commit();
  return { ok: true };
}

export const adminSecureDelete = onCall(adminOptions, async request => {
  requireRecentAdmin(request);
  const kind = sanitizeText(request.data?.kind, 30);
  const id = sanitizeText(request.data?.id, 100);
  if (!id || !["booking", "revenue", "expense", "user"].includes(kind)) throw new HttpsError("invalid-argument", "طلب الحذف غير صالح");
  if (kind === "booking") return deleteBookingPermanently(id, request);
  if (kind === "revenue") return deleteRevenuePermanently(id, request);
  if (kind === "user") return deleteUserAccountPermanently(id, request);
  return deleteExpensePermanently(id, request);
});

export const updateBooking = onCall(adminOptions, async request => {
  const role = requireRole(request);
  const id = sanitizeText(request.data?.id, 100);
  const action = sanitizeText(request.data?.action, 30);
  const ref = db.doc(`bookings/${id}`);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "الحجز غير موجود");
    const booking = snapshot.data();
    requireBranchAccess(request, booking.branchId);
    const now = FieldValue.serverTimestamp();
    if (["pending", "confirmed", "rejected", "cancelled", "completed"].includes(action)) {
      requirePermission(request, "bookings");
      const soldInventory = booking.inventoryReleased ? [] : (booking.items || []).filter(item => item.kind === "inventory" && item.id);
      if (!["rejected", "cancelled"].includes(action) && booking.inventoryReleased && (booking.items || []).some(item => item.kind === "inventory")) throw new HttpsError("failed-precondition", "لا يمكن إعادة فتح الحجز بعد رجوع المشروبات للمخزون؛ أنشئ طلبًا جديدًا");
      if (["rejected", "cancelled"].includes(action)) {
        const inventoryRefs = soldInventory.map(item => db.doc(`inventoryItems/${item.id}`));
        const inventorySnapshots = inventoryRefs.length ? await transaction.getAll(...inventoryRefs) : [];
        inventorySnapshots.forEach((inventory, index) => {
          if (inventory.exists) transaction.update(inventory.ref, { stockQty: FieldValue.increment(Math.max(1, Number(soldInventory[index].qty || 1))), updatedAt: now });
          transaction.delete(db.doc(`stockMovements/${id}_${soldInventory[index].id}`));
        });
        (booking.lockIds || []).forEach(lockId => transaction.delete(db.doc(`appointmentLocks/${lockId}`)));
        if (booking.duplicateGuardId) transaction.delete(db.doc(`bookingGuards/${booking.duplicateGuardId}`));
      }
      transaction.update(ref, { status: action, ...(["rejected", "cancelled"].includes(action) && soldInventory.length ? { inventoryReleased: true } : {}), updatedAt: now });
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
    const dateKey = new Date().toISOString().slice(0, 10);
    const revenueBreakdown = calculateRevenueBreakdown(booking.items || [], transition.ledgerAmount);
    transaction.create(ledgerRef, { bookingId: id, bookingCode: booking.code, branchId: booking.branchId || "talkha", amount: transition.ledgerAmount, revenueBreakdown, type: transition.ledgerType, paymentMethod: transition.method, staffId: booking.staffId, itemIds: booking.itemIds || [], dateKey, createdAt: now, createdBy: request.auth.uid });
    transaction.update(ref, { paymentStatus: transition.status, paymentMethod: transition.method, paidAt: action === "markPaid" ? now : booking.paidAt || null, refundedAt: action === "refund" ? now : null, updatedAt: now });
    if (booking.staffId && booking.staffId !== "none") transaction.update(db.doc(`staff/${booking.staffId}`), { revenueTotal: FieldValue.increment(revenueBreakdown.services), updatedAt: now });
    if (booking.phoneHash) transaction.update(db.doc(`customers/${booking.phoneHash}`), { totalSpent: FieldValue.increment(transition.ledgerAmount), updatedAt: now });
    return { ok: true, paymentStatus: transition.status };
  });
});

export const registerPushToken = onCall(adminOptions, async request => {
  requireRole(request);
  const token = sanitizeText(request.data?.token, 4096);
  if (!token) throw new HttpsError("invalid-argument", "Token required");
  await db.doc(`pushTokens/${hash(token)}`).set({ token, uid: request.auth.uid, role: request.auth.token.role, branchIds: branchesFor(request), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

export const setUserRole = onCall(adminOptions, async request => {
  requireRole(request, ["admin"]);
  const uid = sanitizeText(request.data?.uid, 128);
  const role = sanitizeText(request.data?.role, 30);
  const branchIds = [...new Set((Array.isArray(request.data?.branchIds) ? request.data.branchIds : []).map(value => sanitizeText(value, 40).toLowerCase()).filter(value => /^[a-z0-9-]{2,40}$/.test(value)))].slice(0, 10);
  const permissions = [...new Set((Array.isArray(request.data?.permissions) ? request.data.permissions : ROLE_DEFAULT_PERMISSIONS[role] || []).map(value => sanitizeText(value, 30)).filter(value => ALL_PERMISSIONS.includes(value) && value !== "users"))];
  if (!uid || !ADMIN_ROLES.includes(role)) throw new HttpsError("invalid-argument", "بيانات الصلاحية غير صحيحة");
  if (role !== "admin" && !branchIds.length) throw new HttpsError("invalid-argument", "حدد فرعًا واحدًا على الأقل لهذا الحساب");
  const { getAuth } = await import("firebase-admin/auth");
  await getAuth().setCustomUserClaims(uid, { role, permissions, branchIds });
  await db.doc(`users/${uid}`).set({ role, permissions, branchIds, email: sanitizeText(request.data?.email, 200), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true };
});

export const createAdminUser = onCall({ ...adminOptions, memory: "256MiB", concurrency: 10, maxInstances: 10 }, async request => {
  requireRole(request, ["admin"]);
  const name = sanitizeText(request.data?.name, 80);
  const email = sanitizeText(request.data?.email, 200).toLowerCase();
  const password = String(request.data?.password || "");
  const role = sanitizeText(request.data?.role, 30);
  const branchIds = [...new Set((Array.isArray(request.data?.branchIds) ? request.data.branchIds : []).map(value => sanitizeText(value, 40).toLowerCase()).filter(value => /^[a-z0-9-]{2,40}$/.test(value)))].slice(0, 10);
  const permissions = [...new Set((Array.isArray(request.data?.permissions) ? request.data.permissions : ROLE_DEFAULT_PERMISSIONS[role] || []).map(value => sanitizeText(value, 30)).filter(value => ALL_PERMISSIONS.includes(value) && value !== "users"))];
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || !branchIds.length || !["manager", "cashier"].includes(role)) throw new HttpsError("invalid-argument", "اكتب البيانات وحدد فرعًا واحدًا على الأقل وباسورد 8 أحرف على الأقل");
  const { getAuth } = await import("firebase-admin/auth");
  let user;
  try { user = await getAuth().createUser({ email, password, displayName: name, disabled: false }); }
  catch (error) {
    const messages = { "auth/email-already-exists": "البريد مستخدم بالفعل؛ راجع الحسابات الحالية في Firebase Authentication", "auth/invalid-email": "البريد الإلكتروني غير صحيح", "auth/invalid-password": "الباسورد غير صالح؛ استخدم 8 أحرف وأرقام على الأقل", "auth/operation-not-allowed": "فعّل تسجيل الدخول بالبريد والباسورد من Firebase Authentication", "auth/too-many-requests": "محاولات كثيرة؛ انتظر قليلًا ثم أعد المحاولة" };
    console.error("createAdminUser createUser failed", { code: error.code, message: error.message });
    throw new HttpsError(error.code === "auth/email-already-exists" ? "already-exists" : "failed-precondition", messages[error.code] || "تعذر إنشاء الحساب داخل Firebase Authentication");
  }
  try {
    await getAuth().setCustomUserClaims(user.uid, { role, permissions, branchIds });
    await db.doc(`users/${user.uid}`).set({ name, email, role, permissions, branchIds, active: true, createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  } catch (error) {
    await getAuth().deleteUser(user.uid).catch(() => {});
    console.error("createAdminUser permissions failed", { code: error.code, message: error.message });
    throw new HttpsError("internal", "تعذر حفظ صلاحيات الحساب؛ لم يتم إنشاء الحساب");
  }
  return { ok: true, uid: user.uid };
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
