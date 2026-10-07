import { configureLocalAppCheck } from './local-environment.js';
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { getAuth } from "firebase/auth";
import { normalizePhone } from "../functions/src/core.js";
import { seedCatalog } from "./seed-data.js";
import { availableAtBranch } from "./branch-availability.js";

const config = globalThis.__FIREBASE_CONFIG__ || {};
export const firebaseConfigured = Boolean(config.projectId && !String(config.projectId).includes("YOUR_"));
let functions;
let app;
let analyticsPromise;
const CATALOG_CACHE_KEY = "mz-public-catalog-v4";
const CATALOG_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const FRONTEND_VERSION = "2.0.0";

function assertBackendCompatibility(data) {
  const minimum = String(data?._meta?.minimumFrontendVersion || "0.0.0");
  const current = FRONTEND_VERSION.split(".").map(Number);
  const required = minimum.split(".").map(Number);
  const outdated = [0, 1, 2].some(index => (current[index] || 0) !== (required[index] || 0) && (current[index] || 0) < (required[index] || 0) && current.slice(0, index).every((value, prefix) => value === (required[prefix] || 0)));
  if (outdated) { const error = new Error("نسخة الموقع قديمة؛ حدّث الصفحة للحصول على النسخة الآمنة الجديدة"); error.code = "BACKEND_VERSION_MISMATCH"; throw error; }
}

if (firebaseConfigured) {
  app = initializeApp(config);
  if (globalThis.__APP_CHECK_SITE_KEY__) {
    configureLocalAppCheck();
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
  try { const data = (await httpsCallable(functions, name, { timeout })(payload)).data; assertBackendCompatibility(data); return data; }
  catch (error) {
    if (error?.code === "BACKEND_VERSION_MISMATCH") throw error;
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
    const fallbackStaff = new Map(fallback.staff.map(item => [item.id, item]));
    const fallbackContent = new Map(fallback.content.map(item => [item.id, item]));
    const catalog = {
      ...remote,
      branches: Array.isArray(remote.branches) ? remote.branches : [],
      categories: remote.categories?.length ? remote.categories : fallback.categories,
      services: Array.isArray(remote.services) ? remote.services : [],
      packages: Array.isArray(remote.packages) ? remote.packages : [],
      staff: Array.isArray(remote.staff) ? remote.staff.map(item => ({ ...item, imageUrl: item.imageUrl || fallbackStaff.get(item.id)?.imageUrl || "" })) : [],
      offers: Array.isArray(remote.offers) ? remote.offers : fallback.offers,
      drinks: Array.isArray(remote.drinks) ? remote.drinks : [],
      content: remote.content?.length ? remote.content.map(item => ({ ...item, imageUrl: item.imageUrl || fallbackContent.get(item.id)?.imageUrl || "" })) : fallback.content,
      faqs: remote.faqs?.length ? remote.faqs : fallback.faqs,
      reviews: Array.isArray(remote.reviews) ? remote.reviews : [],
      translations: Array.isArray(remote.translations) ? remote.translations : [],
      settings: { ...fallback.settings, ...(remote.settings || {}) },
      preview: false
    };
    saveCatalogCache(catalog);
    return catalog;
  } catch (error) {
    if (error?.code === "BACKEND_VERSION_MISMATCH") throw error;
    if (cached) {
      console.debug("Using the last saved catalog until the connection returns.", error?.code || error?.message || error);
      return { ...cached, offline: true, cached: true };
    }
    console.debug("Firebase catalog is not available yet.", error?.code || error?.message || error);
    return { ...localCatalog(), branches: [], services: [], packages: [], offers: [], staff: [], drinks: [], offline: true };
  }
}

export async function getPublishedReviews(pageSize = 12, cursor = "") {
  if (firebaseConfigured) return await callFunction("getPublishedReviews", { pageSize, cursor }, 15000);
  const items = (localCatalog().reviews || []).filter(item => item.active !== false).slice(0, pageSize);
  return { items, nextCursor: null, preview: true };
}

export async function getAvailableSlots(payload) {
  if (navigator.onLine === false) throw new Error("تحميل المواعيد المتاحة يحتاج اتصالًا بالإنترنت");
  if (firebaseConfigured) return await callFunction("getAvailableSlots", payload, 20000);

  const catalog = localCatalog();
  const branch = catalog.branches.find(item => item.id === payload.branchId && item.active !== false);
  if (!branch) throw new Error("اختر الفرع أولًا");
  const indexed = new Map([...catalog.services.map(item => [item.id, { ...item, kind: item.type === "product" ? "product" : "service" }]), ...catalog.packages.map(item => [item.id, { ...item, kind: "package" }]), ...catalog.offers.map(item => [item.id, { ...item, kind: "offer" }])]);
  const items = (payload.items || []).map(line => ({ line, item: indexed.get(line.id) }));
  if (items.some(({ item }) => !availableAtBranch(item, branch.id))) throw new Error("إحدى الخدمات غير متاحة في الفرع المختار");
  const appointments = items.filter(({ item }) => item.kind !== "product");
  if (!appointments.length) return { slots: [], productOnly: true, duration: 0, preview: true };
  const duration = Math.max(5, appointments.reduce((sum, { item }) => sum + Number(item.duration || 0), 0));
  const requestedServiceIds = [...new Set(appointments.flatMap(({ line, item }) => {
    if (item.kind === "service") return [item.id];
    const choiceIds = (item.choiceGroups || []).flatMap(group => {
      const selected = (group.options || []).find(option => option.id === line.choices?.[group.id]);
      return selected?.serviceId ? [selected.serviceId] : [];
    });
    return [...(item.includedServiceIds || []), ...choiceIds];
  }))];
  const day = new Date(`${payload.bookingDate}T12:00:00Z`).getUTCDay();
  const schedule = { ...catalog.settings, ...branch };
  const candidates = catalog.staff.filter(member => member.active !== false && member.available !== false && Array.isArray(member.branchIds) && member.branchIds.includes(branch.id) && (payload.staffId === "any" || !payload.staffId || member.id === payload.staffId) && (!Array.isArray(member.workDays) || member.workDays.map(Number).includes(day)) && (!Array.isArray(member.serviceIds) || !member.serviceIds.length || requestedServiceIds.every(id => member.serviceIds.includes(id))));
  const activeBookings = JSON.parse(localStorage.getItem("mz-preview-bookings") || "[]").filter(item => item.branchId === branch.id && item.bookingDate === payload.bookingDate && ["pending", "confirmed", "arrived"].includes(item.status));
  const nowParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const today = `${nowParts.year}-${nowParts.month}-${nowParts.day}`;
  const nowMinutes = Number(nowParts.hour) * 60 + Number(nowParts.minute);
  const toMinutes = value => { const [hour, minute] = String(value || "").split(":").map(Number); return hour * 60 + minute; };
  const opening = toMinutes(schedule.openingTime || "11:00");
  const closing = toMinutes(schedule.closingTime || "23:00");
  const step = Math.max(5, Number(schedule.slotMinutes || 15));
  const slots = [];
  for (let start = opening; start + duration <= closing; start += step) {
    if (payload.bookingDate < today || (payload.bookingDate === today && start <= nowMinutes)) continue;
    const end = start + duration;
    const available = candidates.some(member => {
      const shiftStart = toMinutes(member.shiftStart || schedule.openingTime || "11:00");
      const shiftEnd = toMinutes(member.shiftEnd || schedule.closingTime || "23:00");
      if (start < shiftStart || end > shiftEnd) return false;
      if ((member.breaks || []).some(value => { const [from, to] = String(value).split("-"); return from && to && start < toMinutes(to) && end > toMinutes(from); })) return false;
      return !activeBookings.some(booking => booking.staffId === member.id && start < toMinutes(booking.bookingTime) + Math.max(5, Number(booking.duration || 0)) && end > toMinutes(booking.bookingTime));
    });
    if (available) slots.push(`${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`);
  }
  return { slots, reason: slots.length ? null : (candidates.length ? "no_slots" : "staff_unavailable"), productOnly: false, duration, candidateCount: candidates.length, preview: true };
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
  const indexed = new Map([...catalog.services.map(item => [item.id, item]), ...catalog.packages.map(item => [item.id, item]), ...catalog.offers.map(item => [item.id, item]), ...(catalog.drinks || []).map(item => [item.id, { ...item, kind: "drink" }])]);
  const resolvedLines = payload.items.map(line => ({ line, item: indexed.get(line.id) }));
  if (resolvedLines.some(({ item }) => !availableAtBranch(item, branch.id, item?.kind === "drink"))) throw new Error("إحدى الخدمات غير متاحة في الفرع المختار");
  const subtotal = resolvedLines.reduce((sum, { line, item }) => sum + Number(item.newPrice ?? item.price ?? 0) * Math.max(1, Number(line.qty || 1)), 0);
  const discountableLines = resolvedLines.filter(({ line }) => !["drink", "inventory"].includes(line.kind));
  const discountableSubtotal = discountableLines.reduce((sum, { line, item }) => sum + Number(item.newPrice ?? item.price ?? 0) * Math.max(1, Number(line.qty || 1)), 0);
  const discountableIds = discountableLines.map(({ line }) => line.id);
  const coupon = payload.couponCode && discountableIds.length ? await validateCoupon({ code: payload.couponCode, branchId: branch.id, subtotal: discountableSubtotal, phone: payload.customer.phone, itemIds: discountableIds }) : { valid: false, discountAmount: 0 };
  const total = Math.max(0, subtotal - Number(coupon.discountAmount || 0));
  const items = resolvedLines.map(({ item }) => item);
  const code = `MZ-${branch.code || "BR"}-PREVIEW-${Date.now().toString(36).toUpperCase()}`;
  const record = { ...payload, code, subtotal, discountAmount: coupon.discountAmount || 0, total, status: "pending", paymentStatus: "unpaid", branchNameAr: branch.nameAr, branchWhatsapp: branch.whatsapp, serviceNamesAr: items.map(item => item.nameAr), createdAt: new Date().toISOString() };
  const saved = JSON.parse(localStorage.getItem("mz-preview-bookings") || "[]");
  saved.unshift(record);
  localStorage.setItem("mz-preview-bookings", JSON.stringify(saved.slice(0, 50)));
  return { ok: true, bookingCode: code, subtotal, discountAmount: record.discountAmount, total, preview: true };
}

export async function signedInCustomer() {
  if (!firebaseConfigured) return null;
  const auth = getAuth(app);
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user?.phoneNumber) return null;
  const portal = await callFunction("getCustomerPortal", { profileOnly: true }, 20000);
  return portal.customer;
}

export async function getCustomerBooking(payload) {
  if (navigator.onLine === false) throw new Error("مراجعة الحجز تحتاج اتصالًا بالإنترنت");
  if (firebaseConfigured) return await callFunction("getCustomerBooking", payload, 15000);
  const saved = JSON.parse(localStorage.getItem("mz-preview-bookings") || "[]");
  let phone; try { phone = normalizePhone(payload.phone); } catch { throw new Error("اكتب رقم موبايل مصري صحيح"); }
  const booking = saved.find(item => { try { return item.code === String(payload.code || "").trim().toUpperCase() && normalizePhone(item.customer?.phone) === phone; } catch { return false; } });
  if (!booking) throw new Error("لم نجد حجزًا مطابقًا للكود ورقم الهاتف");
  return { booking: { ...booking, canCancel: ["pending", "confirmed"].includes(booking.status) } };
}

export async function cancelCustomerBooking(payload) {
  if (navigator.onLine === false) throw new Error("إلغاء الحجز يحتاج اتصالًا بالإنترنت");
  if (firebaseConfigured) return await callFunction("cancelCustomerBooking", payload, 20000);
  const saved = JSON.parse(localStorage.getItem("mz-preview-bookings") || "[]");
  let phone; try { phone = normalizePhone(payload.phone); } catch { throw new Error("اكتب رقم موبايل مصري صحيح"); }
  const index = saved.findIndex(item => { try { return item.code === String(payload.code || "").trim().toUpperCase() && normalizePhone(item.customer?.phone) === phone; } catch { return false; } });
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

export const askCustomerAgent = payload => firebaseConfigured ? callFunction('customerAiAgent', payload, 30000) : Promise.resolve({ fallback: true });
export const confirmCustomerAgent = payload => callFunction('confirmAiAction', payload, 30000);
