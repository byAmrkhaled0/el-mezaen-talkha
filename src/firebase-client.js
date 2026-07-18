import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { seedCatalog } from "./seed-data.js";

const config = globalThis.__FIREBASE_CONFIG__ || {};
export const firebaseConfigured = Boolean(config.projectId && !String(config.projectId).includes("YOUR_"));
let functions;
let app;
let analyticsPromise;
const CATALOG_CACHE_KEY = "mz-public-catalog-v2";
const CATALOG_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

if (firebaseConfigured) {
  app = initializeApp(config);
  if (globalThis.__APP_CHECK_SITE_KEY__) {
    if (["localhost", "127.0.0.1"].includes(globalThis.location?.hostname)) globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(globalThis.__APP_CHECK_SITE_KEY__), isTokenAutoRefreshEnabled: true });
  }
  functions = getFunctions(app, "europe-west1");
  if (globalThis.__USE_EMULATORS__) connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

export async function trackEvent(name, params = {}) {
  if (!firebaseConfigured || !config.measurementId || navigator.doNotTrack === "1") return;
  try {
    analyticsPromise ||= import("firebase/analytics").then(async module => await module.isSupported() ? { module, analytics: module.getAnalytics(app) } : null);
    const client = await analyticsPromise;
    if (client) client.module.logEvent(client.analytics, name, params);
  } catch (error) { console.debug("Analytics is unavailable", error?.message || error); }
}

function localCatalog() {
  return structuredClone(seedCatalog);
}

function readCatalogCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || "null");
    if (!cached?.data || Date.now() - Number(cached.savedAt || 0) > CATALOG_CACHE_MAX_AGE) return null;
    return structuredClone(cached.data);
  } catch { return null; }
}

function saveCatalogCache(data) {
  try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data })); }
  catch (error) { console.debug("Catalog cache is unavailable", error?.message || error); }
}

async function callFunction(name, payload = {}, timeout = 30000) {
  try { return (await httpsCallable(functions, name, { timeout })(payload)).data; }
  catch (error) {
    const code = String(error?.code || "").replace(/^functions\//, "");
    const original = String(error?.message || "");
    if (/[\u0600-\u06ff]/.test(original) && !/^Firebase:/.test(original)) throw new Error(original, { cause: error });
    const messages = { unauthenticated: "انتهت الجلسة؛ حدّث الصفحة", "permission-denied": "تعذر التحقق من حماية الموقع؛ حدّث الصفحة ثم حاول مرة أخرى", "invalid-argument": "راجع البيانات المدخلة", "failed-precondition": "لا يمكن تنفيذ الطلب بهذه البيانات", "not-found": "لم يتم العثور على البيانات المطلوبة", "already-exists": "تم إرسال هذا الطلب من قبل", "resource-exhausted": "محاولات كثيرة؛ انتظر قليلًا ثم حاول مرة أخرى", unavailable: "الخدمة غير متاحة مؤقتًا", "deadline-exceeded": "الاتصال بطيء؛ تحقق من النتيجة قبل إعادة المحاولة", internal: "حدث خطأ في الخادم؛ حاول مرة أخرى لاحقًا" };
    throw new Error(messages[code] || "تعذر الاتصال بالخدمة الآن", { cause: error });
  }
}

export async function getCatalog() {
  if (!firebaseConfigured) return { ...localCatalog(), preview: true };
  const cached = readCatalogCache();
  if (navigator.onLine === false && cached) return { ...cached, offline: true, cached: true };
  try {
    const remote = await callFunction("getCatalog", {}, 15000) || {};
    const fallback = localCatalog();
    const catalog = {
      ...remote,
      branches: remote.branches?.length ? remote.branches : fallback.branches,
      categories: remote.categories?.length ? remote.categories : fallback.categories,
      services: remote.services?.length ? remote.services : fallback.services,
      packages: remote.packages?.length ? remote.packages : fallback.packages,
      staff: remote.staff?.length ? remote.staff : fallback.staff,
      offers: Array.isArray(remote.offers) ? remote.offers : fallback.offers,
      drinks: Array.isArray(remote.drinks) ? remote.drinks : [],
      content: remote.content?.length ? remote.content : fallback.content,
      reviews: Array.isArray(remote.reviews) ? remote.reviews : [],
      translations: Array.isArray(remote.translations) ? remote.translations : [],
      settings: { ...fallback.settings, ...(remote.settings || {}) },
      preview: !remote.services?.length || !remote.packages?.length
    };
    saveCatalogCache(catalog);
    return catalog;
  } catch (error) {
    if (cached) {
      console.debug("Using the last saved catalog until the connection returns.", error?.code || error?.message || error);
      return { ...cached, offline: true, cached: true };
    }
    console.debug("Firebase catalog is not available yet; using the bundled catalog.", error?.code || error?.message || error);
    return { ...localCatalog(), preview: true };
  }
}

export async function validateCoupon(payload) {
  if (firebaseConfigured) {
    return await callFunction("validateCoupon", payload, 15000);
  }
  const coupon = seedCatalog.coupons.find(item => item.code.toUpperCase() === String(payload.code || "").trim().toUpperCase() && item.active);
  if (!coupon || Number(payload.subtotal || 0) < coupon.minSubtotal || (coupon.branchIds?.length && !coupon.branchIds.includes(payload.branchId))) return { valid: false, message: "invalid" };
  const raw = coupon.type === "percent" ? Number(payload.subtotal) * coupon.value / 100 : coupon.value;
  const discountAmount = Math.min(raw, coupon.maxDiscount || raw);
  return { valid: true, code: coupon.code, discountType: coupon.type, discountValue: coupon.value, discountAmount, discountPercent: Math.round(discountAmount / Number(payload.subtotal) * 10000) / 100 };
}

export async function createBooking(payload) {
  if (navigator.onLine === false) throw new Error("أنت غير متصل بالإنترنت. بيانات الحجز محفوظة على جهازك؛ اتصل ثم اضغط تأكيد الحجز.");
  if (firebaseConfigured) {
    return await callFunction("createBooking", payload, 30000);
  }
  const catalog = localCatalog();
  const branch = catalog.branches.find(item => item.id === payload.branchId && item.active !== false);
  if (!branch) throw new Error("اختر الفرع أولًا");
  const indexed = new Map([...catalog.services.map(item => [item.id, item]), ...catalog.packages.map(item => [item.id, item]), ...catalog.offers.map(item => [item.id, item]), ...(catalog.drinks || []).map(item => [item.id, item])]);
  const items = payload.items.map(line => indexed.get(line.id)).filter(item => item && (!item.branchIds?.length || item.branchIds.includes(branch.id)));
  if (items.length !== payload.items.length) throw new Error("إحدى الخدمات غير متاحة في الفرع المختار");
  const subtotal = items.reduce((sum, item, index) => sum + Number(item.price || 0) * Math.max(1, Number(payload.items[index]?.qty || 1)), 0);
  const discountableIds = payload.items.filter(item => item.kind !== "drink").map(item => item.id);
  const coupon = payload.couponCode && discountableIds.length ? await validateCoupon({ code: payload.couponCode, branchId: branch.id, subtotal, phone: payload.customer.phone, itemIds: discountableIds }) : { valid: false, discountAmount: 0 };
  const total = Math.max(0, subtotal - Number(coupon.discountAmount || 0));
  const code = `MZ-${branch.code || "BR"}-PREVIEW-${Date.now().toString(36).toUpperCase()}`;
  const record = { ...payload, code, subtotal, discountAmount: coupon.discountAmount || 0, total, status: "pending", paymentStatus: "unpaid", branchNameAr: branch.nameAr, branchWhatsapp: branch.whatsapp, serviceNamesAr: items.map(item => item.nameAr), createdAt: new Date().toISOString() };
  const saved = JSON.parse(localStorage.getItem("mz-preview-bookings") || "[]");
  saved.unshift(record);
  localStorage.setItem("mz-preview-bookings", JSON.stringify(saved.slice(0, 50)));
  return { ok: true, bookingCode: code, subtotal, discountAmount: record.discountAmount, total, preview: true };
}

export async function getCustomerBooking(payload) {
  if (navigator.onLine === false) throw new Error("مراجعة الحجز تحتاج اتصالًا بالإنترنت");
  if (firebaseConfigured) return await callFunction("getCustomerBooking", payload, 15000);
  const saved = JSON.parse(localStorage.getItem("mz-preview-bookings") || "[]");
  const booking = saved.find(item => item.code === String(payload.code || "").trim().toUpperCase() && String(item.customer?.phone || "").replace(/\D/g, "") === String(payload.phone || "").replace(/\D/g, ""));
  if (!booking) throw new Error("لم نجد حجزًا مطابقًا للكود ورقم الهاتف");
  return { booking: { ...booking, canCancel: ["pending", "confirmed"].includes(booking.status) } };
}

export async function cancelCustomerBooking(payload) {
  if (navigator.onLine === false) throw new Error("إلغاء الحجز يحتاج اتصالًا بالإنترنت");
  if (firebaseConfigured) return await callFunction("cancelCustomerBooking", payload, 20000);
  const saved = JSON.parse(localStorage.getItem("mz-preview-bookings") || "[]");
  const index = saved.findIndex(item => item.code === String(payload.code || "").trim().toUpperCase() && String(item.customer?.phone || "").replace(/\D/g, "") === String(payload.phone || "").replace(/\D/g, ""));
  if (index < 0) throw new Error("لم نجد الحجز");
  saved[index].status = "cancelled";
  localStorage.setItem("mz-preview-bookings", JSON.stringify(saved));
  return { ok: true, preview: true };
}

export async function submitReview(payload) {
  const review = { name: String(payload.name || "").trim(), bookingCode: String(payload.bookingCode || "").trim(), rating: Math.max(1, Math.min(5, Number(payload.rating || 5))), comment: String(payload.comment || "").trim() };
  if (!review.name || !review.comment) throw new Error("بيانات التقييم غير مكتملة");
  if (navigator.onLine === false) throw new Error("إرسال التقييم يحتاج اتصالًا بالإنترنت");
  if (firebaseConfigured) return await callFunction("submitReview", review, 20000);
  const saved = JSON.parse(localStorage.getItem("mz-preview-reviews") || "[]");
  saved.unshift({ ...review, status: "pending", createdAt: new Date().toISOString() });
  localStorage.setItem("mz-preview-reviews", JSON.stringify(saved.slice(0, 30)));
  return { ok: true, preview: true };
}
