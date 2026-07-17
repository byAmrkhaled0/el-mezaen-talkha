import { initializeApp } from "firebase/app";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { seedCatalog } from "./seed-data.js";

const config = globalThis.__FIREBASE_CONFIG__ || {};
export const firebaseConfigured = Boolean(config.projectId && !String(config.projectId).includes("YOUR_"));
let functions;

if (firebaseConfigured) {
  const app = initializeApp(config);
  functions = getFunctions(app, "europe-west1");
  if (globalThis.__USE_EMULATORS__) connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

function localCatalog() {
  return structuredClone(seedCatalog);
}

export async function getCatalog() {
  if (!firebaseConfigured) return { ...localCatalog(), preview: true };
  try {
    const result = await httpsCallable(functions, "getCatalog")({});
    const remote = result.data || {};
    const fallback = localCatalog();
    return {
      ...remote,
      categories: remote.categories?.length ? remote.categories : fallback.categories,
      services: remote.services?.length ? remote.services : fallback.services,
      packages: remote.packages?.length ? remote.packages : fallback.packages,
      staff: remote.staff?.length ? remote.staff : fallback.staff,
      offers: Array.isArray(remote.offers) ? remote.offers : fallback.offers,
      content: remote.content?.length ? remote.content : fallback.content,
      translations: Array.isArray(remote.translations) ? remote.translations : [],
      settings: { ...fallback.settings, ...(remote.settings || {}) },
      preview: !remote.services?.length || !remote.packages?.length
    };
  } catch (error) {
    console.warn("Firebase catalog is not available yet; using the bundled catalog.", error?.code || error?.message || error);
    return { ...localCatalog(), preview: true };
  }
}

export async function validateCoupon(payload) {
  if (firebaseConfigured) {
    const result = await httpsCallable(functions, "validateCoupon")(payload);
    return result.data;
  }
  const coupon = seedCatalog.coupons.find(item => item.code.toUpperCase() === String(payload.code || "").trim().toUpperCase() && item.active);
  if (!coupon || Number(payload.subtotal || 0) < coupon.minSubtotal) return { valid: false, message: "invalid" };
  const raw = coupon.type === "percent" ? Number(payload.subtotal) * coupon.value / 100 : coupon.value;
  const discountAmount = Math.min(raw, coupon.maxDiscount || raw);
  return { valid: true, code: coupon.code, discountType: coupon.type, discountValue: coupon.value, discountAmount, discountPercent: Math.round(discountAmount / Number(payload.subtotal) * 10000) / 100 };
}

export async function createBooking(payload) {
  if (firebaseConfigured) {
    const result = await httpsCallable(functions, "createBooking")(payload);
    return result.data;
  }
  const catalog = localCatalog();
  const indexed = new Map([...catalog.services.map(item => [item.id, item]), ...catalog.packages.map(item => [item.id, item]), ...catalog.offers.map(item => [item.id, item])]);
  const items = payload.items.map(line => indexed.get(line.id)).filter(Boolean);
  const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const coupon = payload.couponCode ? await validateCoupon({ code: payload.couponCode, subtotal, phone: payload.customer.phone, itemIds: payload.items.map(item => item.id) }) : { valid: false, discountAmount: 0 };
  const total = Math.max(0, subtotal - Number(coupon.discountAmount || 0));
  const code = `MZ-PREVIEW-${Date.now().toString(36).toUpperCase()}`;
  const record = { ...payload, code, subtotal, discountAmount: coupon.discountAmount || 0, total, createdAt: new Date().toISOString() };
  const saved = JSON.parse(localStorage.getItem("mz-preview-bookings") || "[]");
  saved.unshift(record);
  localStorage.setItem("mz-preview-bookings", JSON.stringify(saved.slice(0, 50)));
  return { ok: true, bookingCode: code, subtotal, discountAmount: record.discountAmount, total, preview: true };
}

export async function submitReview(payload) {
  const review = { name: String(payload.name || "").trim(), bookingCode: String(payload.bookingCode || "").trim(), rating: Math.max(1, Math.min(5, Number(payload.rating || 5))), comment: String(payload.comment || "").trim() };
  if (!review.name || !review.comment) throw new Error("بيانات التقييم غير مكتملة");
  if (firebaseConfigured) return (await httpsCallable(functions, "submitReview")(review)).data;
  const saved = JSON.parse(localStorage.getItem("mz-preview-reviews") || "[]");
  saved.unshift({ ...review, status: "pending", createdAt: new Date().toISOString() });
  localStorage.setItem("mz-preview-reviews", JSON.stringify(saved.slice(0, 30)));
  return { ok: true, preview: true };
}
