import {BOOKING_BARCODE_OPTIONS} from './booking-barcode.js';
import {cairoAppointmentMillis} from '../functions/src/cairo-time.js';
import {createSelectionCatalogWindow} from './selection-catalog-window.js';
import {mountPublicBookingCatalog} from './public-booking-catalog.js';
import {bookingWorkerCandidates} from './booking-worker.js';
import {sharedEditorial,editorialOrigin} from './public-editorial.js';
import {updatePublicFooter} from './public-navigation.js';
import {deferredVideoMarkup,mountDeferredVideos} from './deferred-video.js';
import {syncHomePresentation} from './homepage-presentation.js';
import {applySiteMedia} from './site-media.js';
import { bindSafeBack } from './navigation.js';
import './global-navigation.js';
import { branchMedia } from './premium-media.js';
import {bookingFaqKnowledge} from "./faq-knowledge.js";
import { serviceMedia, packageMedia } from "./premium-media.js";
import "./styles.css";
import "./premium-components.css";
import { applyStaticTranslations, getLang, t, translations } from "./i18n.js";
import { isApprovedVideoEmbed, isVideoContent, safeMediaUrl, videoSource } from "./media.js";
import { seedCatalog } from "./seed-data.js";
import {createLocalDemoCatalog} from "./local-demo-catalog.js";
import { availableAtBranch as itemAvailableAtBranch, hasBranchScope } from "./branch-availability.js";
import { activeBranch, publicSubset, reconcileBranchCart, packageEligible } from "./public-branch.js";

const firebaseConfigured = !globalThis.__OFFLINE_DEMO__ && Boolean(globalThis.__FIREBASE_CONFIG__?.projectId && !String(globalThis.__FIREBASE_CONFIG__.projectId).includes("YOUR_"));
let firebaseClientPromise;
const firebaseClient = () => firebaseClientPromise ||= import("./firebase-client.js");
const getCatalog = (...args) => firebaseClient().then(module => module.getCatalog(...args));
const validateCoupon = (...args) => firebaseClient().then(module => module.validateCoupon(...args));
const getAvailableSlots = (...args) => firebaseClient().then(module => module.getAvailableSlots(...args));
const createBooking = (...args) => firebaseClient().then(module => module.createBooking(...args));
const getCustomerBooking = (...args) => firebaseClient().then(module => module.getCustomerBooking(...args));
const cancelCustomerBooking = (...args) => firebaseClient().then(module => module.cancelCustomerBooking(...args));
const submitReview = (...args) => firebaseClient().then(module => module.submitReview(...args));
const trackEvent = (...args) => {
  if (!firebaseConfigured) return;
  void firebaseClient().then(module => module.trackEvent(...args)).catch(error => console.debug("Analytics is unavailable", error?.message || error));
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const cairoParts = (date = new Date()) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
const cairoDateKey = () => { const part = cairoParts(); return `${part.year}-${part.month}-${part.day}`; };
const addDays = (dateKey, days) => { const date = new Date(`${dateKey}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const readJson = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key) || "null"); return value ?? fallback; } catch { return fallback; } };
const readArray = key => { const value = readJson(key, []); return Array.isArray(value) ? value : []; };
const state = {
  lang: getLang(),
  theme: localStorage.getItem("mz-theme") === "light" ? "light" : "dark",
  catalog: firebaseConfigured ? { ...structuredClone(seedCatalog), branches: [], services: [], packages: [], offers: [], staff: [], drinks: [] } : createLocalDemoCatalog(),
  cart: readArray("mz-cart"),
  category: "all",
  step: 1,
  staffId: "any",
  date: "",
  time: "",
  coupon: null,
  branchId: localStorage.getItem("mz-branch") || "",
  completedPreview: false,
  managedBooking: null,
  manageCredentials: null
};
let catalogReady = !firebaseConfigured;
let bookingCatalogPicker=null;
const bookingCatalogWindow=createSelectionCatalogWindow(state.catalog);

const money = value => new Intl.NumberFormat(state.lang === "ar" ? "ar-EG" : "en-US", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(value || 0));
const localized = (item, key = "name") => item?.[`${key}${state.lang === "ar" ? "Ar" : "En"}`] || item?.[`${key}Ar`] || "";
const needsAppointment = () => cartItems().some(item => !["product", "inventory", "drink"].includes(item.kind));
const settings = () => state.catalog.settings || {};
const currentBranch = () => activeBranch(state.catalog, state.branchId);
const availableAtBranch = (item, allowGlobalDrink = item?.kind === "drink") => state.branchId ? itemAvailableAtBranch(item, state.branchId, allowGlobalDrink) : false;
const explicitlyAvailableAtBranch = item => Boolean(state.branchId && Array.isArray(item?.branchIds) && item.branchIds.includes(state.branchId));
const branchName = branch => localized(branch) || (state.lang === "ar" ? branch?.nameAr : branch?.nameEn) || "";
const branchAddress = branch => state.lang === "ar" ? branch?.addressAr : branch?.addressEn || branch?.addressAr;
const phoneHref = value => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("0") ? `tel:+2${digits}` : `tel:+${digits}`;
};
const whatsappNumber = value => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.startsWith("0") ? `2${digits}` : digits;
};
const safeWebUrl = value => {
  try {
    const url = new URL(String(value || "").trim(), location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
};
const lineIconPaths = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/>',
  moon: '<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  map: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  sparkles: '<path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
  phone: '<path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-4-1-1.5 2a15 15 0 0 1-9.5-9.5L8 7 7 3Z"/>',
  cart: '<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M3 4h2l2.5 11h10l3-8H7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cup: '<path d="M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8Z"/><path d="M16 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/>'
};
const lineIcon = (name, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${lineIconPaths[name] || lineIconPaths.sparkles}</svg>`;


function itemIndex() {
  return new Map([
    ...state.catalog.services.map(item => [item.id, { ...item, kind: item.type === "product" ? "product" : "service" }]),
    ...state.catalog.packages.map(item => [item.id, { ...item, kind: "package" }]),
    ...state.catalog.offers.map(item => [item.id, { ...item, kind: "offer" }]),
    ...(state.catalog.drinks || []).map(item => [item.id, { ...item, kind: "drink" }])
  ]);
}

function cartItems() {
  const index = itemIndex();
  const valid = new Set(reconcileBranchCart(state.cart, state.catalog, state.branchId).kept.map(line => line.id));
  return state.cart.filter(line => valid.has(line.id)).map(line => ({ ...index.get(line.id), qty: line.qty || 1, option: line.option || "", choices: line.choices && typeof line.choices === "object" ? line.choices : {} })).filter(item => item.id && item.active !== false && item.catalogVisible !== false && item.status !== "expired" && item.status !== "stopped" && (!item.startAt || new Date(item.startAt).getTime() <= Date.now()) && (!item.endAt || new Date(item.endAt).getTime() >= Date.now()) && availableAtBranch(item));
}

function dedupeCatalogCards(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = [String(item.nameAr || "").trim().replace(/^ال/, ""), item.categoryId || "", Number(item.price || 0), Number(item.duration || 0), ...(item.branchIds || []).slice().sort()].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function packageChoiceMissing(item) {
  return (item.choiceGroups || []).find(group => group.required !== false && !(group.options || []).some(option => option.id === item.choices?.[group.id]));
}

function subtotal() { return cartItems().reduce((sum, item) => sum + Number(item.newPrice ?? item.price ?? 0) * item.qty, 0); }
function discountAmount() { return Math.min(subtotal(), Number(state.coupon?.discountAmount || 0)); }
function total() { return Math.max(0, subtotal() - discountAmount()); }

function saveCart() {
  localStorage.setItem("mz-cart", JSON.stringify(state.cart));
  window.dispatchEvent(new CustomEvent("mz:cart"));
  $$('[data-cart-count]').forEach(el => { el.textContent = String(state.cart.length); });
}

const publicEnglishMessages={"تعذر تحميل بيانات الحساب؛ تأكد من رقم هاتف الحجز قبل المتابعة": "Could not load account details; check your booking phone number before continuing", "تم إلغاء الحجز بنجاح": "Booking cancelled", "تم اختيار الحلاق المفضل؛ اختر الخدمة ثم التاريخ والموعد المتاح": "Preferred specialist selected; choose services, date and an available time", "تم اختيار المتخصص؛ اختر الخدمة ووقت الزيارة": "Specialist selected; choose services and a visit time", "تمت إضافة اختيارك من صفحة الفرع؛ أكمل الحجز": "Your branch-page selection was added; continue booking", "جاري تحميل بيانات الفروع؛ انتظر لحظة": "Loading branch data; please wait", "الموعد غير متاح، اختر وقتًا آخر": "This time is unavailable; choose another", "تعذر إنشاء الحجز": "Could not create booking", "يوجد حجز مطابق لهذا الرقم والموعد": "A matching booking already exists for this phone and appointment", "تم إرسال هذا الطلب من قبل": "This request was already submitted"};
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = state.lang==='en'?(publicEnglishMessages[message]||message):message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2300);
}

function updateNetworkStatus(announce = false) {
  const banner = $("#networkStatus");
  const online = navigator.onLine !== false;
  banner.hidden = online && !announce;
  banner.classList.toggle("online", online);
  banner.textContent = online ? "عاد الاتصال بالإنترنت" : "أنت أوفلاين: يمكنك تصفح البيانات المحفوظة، والتأكيد النهائي للحجز يحتاج إنترنت";
  if (online && announce) setTimeout(() => { banner.hidden = true; }, 2500);
  if (online && announce && firebaseConfigured) refreshCatalog(true);
}

function setTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("mz-theme", theme);
  $("#themeToggle").innerHTML = lineIcon(theme === "dark" ? "sun" : "moon", 22);
}

function setLanguage(lang) {
  state.lang = lang;
  localStorage.setItem("mz-lang", lang);
  applyStaticTranslations(lang);
  window.dispatchEvent(new CustomEvent("mz:language",{detail:lang}));
  $("#langToggle").textContent = lang === "ar" ? "EN" : "ع";
  const branch = currentBranch();
  const selectedName = branch ? branchName(branch) : (lang === "ar" ? "فرعي طلخا والمشاية" : "Talkha & El Mashaya branches");
  const title = lang === "ar" ? `مزين مصر – ${selectedName} | حجز حلاقة وعناية رجالية` : `El Mezaen Egypt – ${selectedName} | Barber Booking`;
  const description = lang === "ar" ? "اختر فرع طلخا أو المشاية واحجز خدمات الحلاقة والعناية الرجالية بأسعار ومواعيد واضحة." : "Choose Talkha or El Mashaya and book professional barber and men's grooming services with clear prices and times.";
  document.title = title;
  $('meta[name="description"]').content = description;
  $('meta[property="og:title"]').content = title;
  $('meta[property="og:description"]').content = description;
  renderAll();
}

function categoryName(id) {
  const category = state.catalog.categories.find(item => item.id === id);
  return localized(category);
}

function renderOffers() {
  const now = Date.now();
  const offers = publicSubset(state.catalog.offers, state.branchId, { now, dated: true });
  $("#offers").hidden = false;
  $("#offersGrid").classList.toggle("is-empty", offers.length === 0);
  $("#offersGrid").innerHTML = offers.length ? offers.map(offer => {
    const price = Number(offer.newPrice ?? offer.price ?? 0);
    const old = Number(offer.oldPrice ?? offer.originalPrice ?? price);
    const percent = old > 0 ? Math.round((old - price) / old * 100) : 0;
    const exclusiveBranch = Array.isArray(offer.branchIds) && offer.branchIds.length === 1 ? state.catalog.branches.find(branch => branch.id === offer.branchIds[0] && branch.active !== false) : null;
    return `<article class="offer-card reveal">
      <div class="offer-media">${safeMediaUrl(offer.imageUrl) ? `<img src="${escapeAttr(safeMediaUrl(offer.imageUrl))}" alt="${escapeAttr(localized(offer))}" loading="lazy" decoding="async" width="800" height="600" sizes="(max-width:560px) 88vw, (max-width:900px) 46vw, 30vw">` : `<span class="offer-media-placeholder" aria-hidden="true">${lineIcon("sparkles", 54)}</span>`}<span class="offer-ribbon">${state.lang === "ar" ? "عرض خاص" : "Special offer"}</span></div>
      <div class="offer-body">${exclusiveBranch ? `<span class="package-branch">${lineIcon("map", 17)} ${escapeHtml(branchName(exclusiveBranch))}</span>` : ""}<h3>${escapeHtml(localized(offer))}</h3><p>${escapeHtml(localized(offer, "description"))}</p>
      <div class="price-row"><div>${old > price ? `<del class="old-price">${money(old)}</del>` : ""}<div class="price">${money(price)}</div></div>${old > price ? `<strong class="offer-saving">${state.lang === "ar" ? "وفر" : "Save"} ${money(old - price)}${percent ? ` · ${percent}%` : ""}</strong>` : ""}</div>
      ${offer.endAt && offer.showCountdown ? `<time class="offer-countdown" data-countdown="${escapeAttr(offer.endAt)}"></time>` : ""}
      <button class="btn btn-primary" type="button" data-add-id="${escapeAttr(offer.id)}" data-kind="offer">${state.lang === "ar" ? "احجز العرض" : "Book offer"}</button></div>
    </article>`;
  }).join("") : `<div class="empty-state">${currentBranch() ? `<strong>${state.lang === "ar" ? "لا توجد عروض حالية في هذا الفرع" : "No current offers at this branch"}</strong><p>${state.lang === "ar" ? "يمكنك استكشاف الخدمات والحجز مباشرة." : "Explore services and book directly."}</p><a class="btn btn-ghost" href="#services">${state.lang === "ar" ? "شاهد الخدمات" : "See services"}</a>` : `<strong>${state.lang === "ar" ? "اختر فرعًا لعرض العروض الحالية" : "Choose a branch to see current offers"}</strong><p>${state.lang === "ar" ? "ستظهر العروض المتاحة في الفرع الذي تختاره." : "Offers at your selected branch will appear here."}</p><button class="btn btn-ghost" type="button" data-open-branch>${state.lang === "ar" ? "اختر الفرع" : "Choose branch"}</button>`}</div>`;
  updateCountdowns();
}

function renderPackages() {
  const now = Date.now();
  const packages = publicSubset(state.catalog.packages, state.branchId, { now, dated: true }).sort((a, b) => Number(b.sortOrder || 0) - Number(a.sortOrder || 0)).slice(0, 3);
  $("#packageGrid").innerHTML = packages.map(item => {
    const badge = item.badge === "popular" ? t("featured", state.lang) : item.badge === "special" ? t("special", state.lang) : t("package", state.lang);
    const included = state.lang === "ar" ? item.includedItemsAr : item.includedItemsEn || item.includedItemsAr;
    const oldPrice = Number(item.originalPrice || item.price || 0);
    const exclusiveBranch = Array.isArray(item.branchIds) && item.branchIds.length === 1 ? state.catalog.branches.find(branch => branch.id === item.branchIds[0]) : null;
    const branchOnly = exclusiveBranch ? branchName(exclusiveBranch) : "";
    return `<article class="package-card ${item.badge ? "highlight" : ""} reveal">
      <div class="package-cover">${packageMedia(item) ? `<img src="${escapeAttr(packageMedia(item))}" alt="${escapeAttr(localized(item))}" loading="lazy" decoding="async" width="640" height="427" sizes="(max-width:560px) 88vw, 33vw">` : `<div class="package-media-placeholder"><img src="/assets/el-mezaen-mark-v2.webp" alt="" loading="lazy" width="90" height="106"></div>`}<span>${badge}</span></div>
      <div class="package-copy"><div class="card-top"><span class="card-tag">${lineIcon("sparkles", 18)} ${badge}</span>${Number(item.duration) > 0 ? `<span class="duration">${lineIcon("clock", 17)} ${item.duration} ${t("minute", state.lang)}</span>` : ""}</div>
      ${branchOnly ? `<span class="package-branch">${lineIcon("map", 17)} ${escapeHtml(branchOnly)}</span>` : ""}
      <h3>${escapeHtml(localized(item))}</h3><details class="package-summary"><summary>${state.lang === "ar" ? "عن الباقة" : "About package"}</summary><p>${escapeHtml(localized(item, "description"))}</p></details>
      ${Array.isArray(included) && included.length ? `<ul class="package-services package-services-preview">${included.slice(0, 3).map(value => `<li>${escapeHtml(value)}</li>`).join("")}${included.length > 3 ? `<li class="more-services">+${included.length - 3} ${state.lang === "ar" ? "خدمات أخرى" : "more services"}</li>` : ""}</ul>` : ""}
      <div class="price-row package-price"><div>${oldPrice > Number(item.newPrice ?? item.price ?? 0) ? `<span class="old-price">${money(oldPrice)}</span>` : ""}<strong class="price">${money(item.newPrice ?? item.price)}</strong></div>${oldPrice > Number(item.newPrice ?? item.price ?? 0) ? `<span class="package-saving">وفر ${money(oldPrice - Number(item.newPrice ?? item.price ?? 0))} • ${Math.round((oldPrice - Number(item.newPrice ?? item.price ?? 0)) / oldPrice * 100)}%</span>` : ""}</div><small class="package-duration">${Number(item.duration || 0)} ${t("minute", state.lang)}</small>
      <div class="package-card-actions"><button class="btn btn-ghost" type="button" data-package-details="${escapeAttr(item.id)}">${state.lang === "ar" ? "تفاصيل الباقة" : "Package details"}</button><button class="btn btn-primary" type="button" data-add-id="${escapeAttr(item.id)}" data-kind="package" ${(!packageEligible(item,state.catalog,state.branchId) || state.catalog.cached || state.catalog.offline)?'disabled aria-disabled="true"':''}>${(!packageEligible(item,state.catalog,state.branchId) || state.catalog.cached || state.catalog.offline)?(state.lang==='ar'?'غير متاحة حاليًا':'Currently unavailable'):state.lang === "ar" ? "احجز الباقة" : "Book package"}</button></div></div>
    </article>`;
  }).join("") || `<div class="empty-state">${state.lang === "ar" ? "لا توجد باقات متاحة في هذا الفرع الآن" : "No packages available at this branch"}</div>`;
}

function openPackageDetails(id) {
  const item = publicSubset(state.catalog.packages, state.branchId, { dated: true }).find(value => value.id === id);
  if (!item) return;
  const included = state.lang === "ar" ? item.includedItemsAr : item.includedItemsEn || item.includedItemsAr;
  const oldPrice = Number(item.originalPrice || item.price || 0);
  const packageBranches = state.catalog.branches.filter(value => (item.branchIds || []).includes(value.id) && value.active !== false).map(branchName);
  $("#packageDetailsTitle").textContent = localized(item);
  $("#packageDetailsBody").innerHTML = `
    ${safeMediaUrl(item.imageUrl) ? `<img class="package-details-image" src="${escapeAttr(safeMediaUrl(item.imageUrl))}" alt="${escapeAttr(localized(item))}" loading="lazy" decoding="async" width="640" height="640">` : `<div class="package-details-image package-media-placeholder"><img src="/assets/el-mezaen-mark-v2.webp" alt="" loading="lazy" width="90" height="106"></div>`}
    <div class="package-details-copy">
      ${packageBranches.length ? `<span class="package-branch">${lineIcon("map", 17)} ${escapeHtml(packageBranches.join("، "))}</span>` : ""}
      ${localized(item, "description") ? `<p>${escapeHtml(localized(item, "description"))}</p>` : ""}
      <div class="package-details-price">${oldPrice > Number(item.newPrice ?? item.price ?? 0) ? `<span class="old-price">${money(oldPrice)}</span>` : ""}<strong class="price">${money(item.newPrice ?? item.price)}</strong></div>
      ${Array.isArray(included) && included.length ? `<h3>${state.lang === "ar" ? "الخدمات داخل الباقة" : "Included services"}</h3><ul class="package-services">${included.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : ""}
      ${(item.choiceGroups || []).length ? `<h3>${state.lang === "ar" ? "اختر خدمة واحدة من كل مجموعة" : "Choose one from each group"}</h3><div class="package-alternatives">${item.choiceGroups.map(group => `<span><b>${escapeHtml(state.lang === "ar" ? group.labelAr : group.labelEn || group.labelAr)}:</b> ${(group.options || []).map(value => escapeHtml(state.lang === "ar" ? value.labelAr : value.labelEn || value.labelAr)).join(" / ")}</span>`).join("")}</div>` : ""}
      ${localized(item, "terms") ? `<p class="package-terms"><b>${state.lang === "ar" ? "الشروط:" : "Terms:"}</b> ${escapeHtml(localized(item, "terms"))}</p>` : ""}
      ${item.phone ? `<a class="package-phone" href="${escapeAttr(phoneHref(item.phone))}" aria-label="${state.lang === "ar" ? "اتصل بالفرع على" : "Call the branch at"} ${escapeAttr(item.phone)}">${lineIcon("phone", 18)} <span>${escapeHtml(item.phone)}</span></a>` : ""}
    </div>`;
  $("#packageDetailsAdd").dataset.addPackageId = item.id;
  $("#packageDetailsAdd").textContent = t("addCart", state.lang);
  $("#packageDetailsAdd").disabled = !packageEligible(item,state.catalog,state.branchId) || state.catalog.cached || state.catalog.offline;
  const dialog = $("#packageDetailsDialog");
  if (!dialog.open) dialog.showModal();
  document.body.style.overflow = "hidden";
}

function closePackageDetails() {
  const dialog = $("#packageDetailsDialog");
  if (dialog.open) dialog.close();
  document.body.style.overflow = "";
}

function serviceIconSvg(categoryId) {
  const icons = {
    hair: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.5 8.5 11-5M8.5 15.5l11 5M10 12h10"/>',
    beard: '<path d="M7 4c1.5-1.3 8.5-1.3 10 0v6c0 5-2.2 9-5 10-2.8-1-5-5-5-10V4Z"/><path d="M9 9h.01M15 9h.01M9 14c2 1.5 4 1.5 6 0"/>',
    skin: '<path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
    wax: '<path d="M12 3S6 10 6 15a6 6 0 0 0 12 0c0-5-6-12-6-12Z"/><path d="M9 16a3 3 0 0 0 3 3"/>',
    "hair-care": '<path d="M4 5h16v5H4zM6 10v8M9 10v6M12 10v8M15 10v6M18 10v8"/>',
    service: '<path d="M14 6a4 4 0 0 0-5 5L3 17l4 4 6-6a4 4 0 0 0 5-5l-3 3-3-3 3-3Z"/>',
    installation: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/>',
    products: '<path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    extras: '<path d="M12 4v16M4 12h16"/>'
  };
  const aliases = { "beard-care": "beard", "facial-cleaning": "skin" };
  const icon = icons[categoryId] || icons[aliases[categoryId]] || icons.hair;
  return `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
}

function renderServices() {
  applySiteMedia(state.catalog.settings);
  const active = dedupeCatalogCards(publicSubset(state.catalog.services, state.branchId)).sort((a, b) => Number(b.featured === true) - Number(a.featured === true) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  if (state.category !== "all" && !active.some(item => item.categoryId === state.category)) state.category = "all";
  $("#categoryFilters").innerHTML = `<button class="filter-chip ${state.category === "all" ? "active" : ""}" type="button" data-category="all" role="tab">${t("all", state.lang)}</button>` + state.catalog.categories.filter(cat => cat.active !== false && cat.id !== "packages" && active.some(item => item.categoryId === cat.id)).map(cat => `<button class="filter-chip ${state.category === cat.id ? "active" : ""}" type="button" data-category="${escapeAttr(cat.id)}" role="tab">${escapeHtml(localized(cat))}</button>`).join("");
  const visible = (state.category === "all" ? active : active.filter(item => item.categoryId === state.category)).slice(0, 6);
  $("#serviceGrid").innerHTML = visible.map(item => `<article class="service-card reveal"><figure class="service-cover">
    <img class="service-image" src="${escapeAttr(serviceMedia(item))}" alt="${escapeAttr(localized(item))}" width="300" height="240" loading="lazy">
    </figure><div class="service-copy"><div class="service-meta"><span>${escapeHtml(categoryName(item.categoryId))}</span><span>${lineIcon("clock", 16)} ${item.duration} ${t("minute", state.lang)}</span></div>
    <h3>${escapeHtml(localized(item))}</h3>${localized(item, "description") ? `<details class="service-description"><summary>${state.lang==='ar'?'تفاصيل الخدمة':'Service details'}</summary><p>${escapeHtml(localized(item, "description"))}</p></details>` : ""}
    <div class="service-purchase"><div class="price-row"><div>${item.startsFrom ? `<small>${t("from", state.lang)}</small>` : ""}<strong class="price">${money(item.newPrice ?? item.price)}</strong></div>${item.type === "product" ? `<span class="type-pill">${t("product", state.lang)}</span>` : ""}</div>
    <button class="btn btn-ghost" data-add-id="${escapeAttr(item.id)}" data-kind="${item.type === "product" ? "product" : "service"}">${t("addCart", state.lang)}</button></div></div>
  </article>`).join("") || `<div class="empty-state">${currentBranch() ? (state.lang === "ar" ? "لا توجد خدمات متاحة حاليًا في هذا الفرع" : "No services currently available at this branch") : (state.lang === "ar" ? "اختر فرعًا لعرض الخدمات المتاحة" : "Choose a branch to see services")}</div>`;
  observeReveals();
}

function renderTeam() {
  $("#teamGrid").innerHTML = publicSubset(state.catalog.staff, state.branchId).filter(item=>item.available !== false).slice(0, 4).map(item => `<article class="team-card reveal"><div class="team-portrait">
    ${safeMediaUrl(item.imageUrl) ? `<img class="team-photo" src="${escapeAttr(safeMediaUrl(item.imageUrl))}" alt="${escapeAttr(localized(item))} – ${escapeAttr(localized(item, "specialty"))}" loading="lazy" decoding="async" width="220" height="220">` : `<div class="team-photo team-photo-placeholder" role="img" aria-label="${state.lang === "ar" ? "لم تُضف صورة " : "No photo for "}${escapeAttr(localized(item))}"><img src="/assets/el-mezaen-mark-v2.webp" alt="" width="64" height="76" loading="lazy"><small>${state.lang === "ar" ? "تُضاف الصورة من الإدارة" : "Photo will be added by admin"}</small></div>`}
    </div><div class="team-copy"><h3>${escapeHtml(localized(item))}</h3><p>${escapeHtml(localized(item, "specialty"))}</p><small class="team-branch">${escapeHtml(currentBranch()?branchName(currentBranch()):'')}</small>
    </div><div class="team-action"><span class="availability ${item.available === false ? "off" : ""}">${item.available === false ? t("unavailable", state.lang) : (state.lang === "ar" ? "المواعيد حسب الحضور" : "Times depend on attendance")}</span>
    ${item.available === false ? "" : `<button class="btn btn-ghost" type="button" data-book-staff="${escapeAttr(item.id)}" aria-label="${state.lang==='ar'?'احجز مع ':'Book with '}${escapeAttr(localized(item))}">${state.lang === "ar" ? "احجز" : "Book"}</button>`}
  </div></article>`).join("") || `<div class="empty-state">${currentBranch() ? (state.lang === "ar" ? "لا يوجد فريق متاح للحجز في هذا الفرع حاليًا" : "No team members currently available at this branch") : (state.lang === "ar" ? "اختر فرعًا لعرض الفريق" : "Choose a branch to see the team")}</div>`;
}

function renderContent() {
  const results = sharedEditorial(state.catalog.content,"result",state.branchId).filter(item => item.type === "result" && (item.imageUrl || (item.beforeImageUrl && item.afterImageUrl)));
  $("#results").hidden = false;
  $("#resultsGrid").innerHTML = results.slice(0, 3).map(item => `<a class="result-card reveal" href="/results/">${item.beforeImageUrl && item.afterImageUrl ? `<div class="result-pair"><span class="result-label before">${state.lang==='ar'?'قبل':'Before'}</span><span class="result-label after">${state.lang==='ar'?'بعد':'After'}</span><img src="${escapeAttr(safeMediaUrl(item.beforeImageUrl))}" alt="${state.lang==='ar'?'قبل':'Before'}: ${escapeAttr(localized(item, "title"))}" loading="lazy" decoding="async" width="540" height="1080"><img src="${escapeAttr(safeMediaUrl(item.afterImageUrl))}" alt="${state.lang==='ar'?'بعد':'After'}: ${escapeAttr(localized(item, "title"))}" loading="lazy" decoding="async" width="540" height="1080"></div>` : `<img src="${escapeAttr(safeMediaUrl(item.imageUrl))}" alt="${escapeAttr(localized(item, "title"))}" loading="lazy" decoding="async" width="1080" height="1080">`}<span>${escapeHtml(localized(item, "title"))}</span><small>${escapeHtml(contentBranchLabel(item))}</small></a>`).join("");
  const hairVideos=publicSubset(state.catalog.content,state.branchId).filter(item=>item.type==='hair-system'&&item.videoUrl).slice(0,3);
  const hairGrid=$('#homeHairVideos');
  hairGrid.hidden=false;
  hairGrid.innerHTML=hairVideos.map(item=>{const source=videoSource(item.videoUrl);return `<article class="hair-media-card">${source.kind==='direct'?deferredVideoMarkup(item):`<a class="btn btn-ghost" href="${escapeAttr(source.url)}" target="_blank" rel="noopener">${state.lang==='ar'?'مشاهدة الفيديو':'Watch video'}</a>`}<div><h3>${escapeHtml(localized(item,'title'))}</h3><p>${escapeHtml(localized(item,'body'))}</p><small>${escapeHtml(contentBranchLabel(item))}</small></div></article>`;}).join('');
  mountDeferredVideos(hairGrid);
  const celebrities = sharedEditorial(state.catalog.content,"celebrity",state.branchId).filter(item => item.type === "celebrity" && item.imageUrl).sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  $("#celebrityGrid").innerHTML = celebrities.slice(0, 3).map(item => `<article class="content-card reveal"><img src="${escapeAttr(safeMediaUrl(item.imageUrl))}" alt="${escapeAttr(localized(item, "title"))}" loading="lazy" decoding="async" sizes="(max-width:560px) 88vw, 32vw" width="640" height="480"><h3>${escapeHtml(localized(item, "title"))}</h3></article>`).join("");
  const gallery = sharedEditorial(state.catalog.content,"gallery",state.branchId).filter(item => item.type === "gallery").sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  $("#galleryGrid").innerHTML = gallery.slice(0, 4).map(renderGalleryMedia).join("");
  $("#galleryGrid").hidden = false;
  mountDeferredVideos($("#galleryGrid"));
  $("#about .about-grid").classList.toggle("without-gallery", gallery.length === 0);
  $(".celebrity-section").hidden = false;
  const news = publicSubset(state.catalog.content, state.branchId).filter(item => item.type === "news").sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  $("#newsSection").hidden = false;
  $("#newsGrid").innerHTML = news.slice(0, 3).map(item => { const link = safeWebUrl(item.linkUrl); return `<article class="content-card news-card reveal">${renderNewsMedia(item)}<div class="news-card-body"><span class="content-branch-badge">${escapeHtml(contentBranchLabel(item))}</span><h3>${escapeHtml(localized(item, "title"))}</h3><p>${escapeHtml(localized(item, "body"))}</p>${link ? `<a class="btn btn-ghost" href="${escapeAttr(link)}" target="_blank" rel="noopener">${state.lang === "ar" ? "اقرأ المزيد" : "Read more"}</a>` : ""}</div></article>`; }).join("");
}

function renderGalleryMedia(item) {
  const label = escapeAttr(localized(item, "title"));
  if (!isVideoContent(item)) return `<img src="${escapeAttr(safeMediaUrl(item.imageUrl))}" alt="${label}" loading="lazy" decoding="async" sizes="(max-width:560px) 100vw, 50vw" width="640" height="480">`;
  const source = videoSource(item.videoUrl);
  if (source.kind === "direct") return deferredVideoMarkup(item);
  if (source.url) return `<a class="gallery-video-link" href="${escapeAttr(source.url)}" target="_blank" rel="noopener" aria-label="${label}"><span class="video-play">▶</span><b>${label}</b></a>`;
  return "";
}

function renderReviews() {
  const published = (state.catalog.reviews || []).filter(item => item.active !== false && (!item.branchId || item.branchId === "all" || item.branchId === state.branchId) && (!item.branchIds?.length || item.branchIds.includes(state.branchId)));
  const reviews = [...published].sort((a, b) => Number(b.featured || 0) - Number(a.featured || 0) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 3);
  const average = published.length ? published.reduce((sum, item) => sum + Number(item.rating || 0), 0) / published.length : 0;
  $("#reviewAverage").textContent = published.length ? average.toFixed(1) : "—";
  $("#reviewAverageStars").textContent = published.length ? `${"★".repeat(Math.round(average))}${"☆".repeat(5 - Math.round(average))}` : "☆☆☆☆☆";
  $("#reviewCount").textContent = published.length ? `${published.length} تقييم منشور` : "لا توجد تقييمات منشورة بعد";
  $("#publishedReviews").innerHTML = reviews.map(item => `<article class="published-review panel ${item.featured ? "featured" : ""}"><header><div class="review-avatar">${escapeHtml(String(item.name || "ع").trim().charAt(0) || "ع")}</div><div><h3>${escapeHtml(item.name || (state.lang === "ar" ? "عميل مزين مصر" : "El Mezaen customer"))}</h3><span>${"★".repeat(Math.max(1, Math.min(5, Number(item.rating || 5))))}${"☆".repeat(5 - Math.max(1, Math.min(5, Number(item.rating || 5))))}</span></div>${item.verified ? `<b class="verified-review">✓ ${state.lang === 'ar' ? 'حجز موثّق' : 'Verified booking'}</b>` : ""}</header><p>${escapeHtml(item.comment || "")}</p>${item.createdAt ? `<time datetime="${escapeAttr(item.createdAt)}">${escapeHtml(new Date(item.createdAt).toLocaleDateString(state.lang === "ar" ? "ar-EG" : "en-GB"))}</time>` : ""}${item.adminReply ? `<div class="review-reply"><b>${state.lang === "ar" ? "رد مزين مصر" : "El Mezaen reply"}</b><span>${escapeHtml(item.adminReply)}</span></div>` : ""}</article>`).join("");
}

function contentBranchLabel(item) {
  if (["result","gallery","celebrity"].includes(item.type)) return editorialOrigin(item,state.lang);
  if (!item.branchIds?.length || item.branchIds.length > 1) return state.lang === "ar" ? "كل الفروع" : "All branches";
  const branch = state.catalog.branches.find(value => value.id === item.branchIds[0]);
  return branch ? branchName(branch) : item.branchIds[0];
}

function renderNewsMedia(item) {
  if (!isVideoContent(item)) return item.imageUrl ? `<img class="news-media" src="${escapeAttr(safeMediaUrl(item.imageUrl))}" alt="${escapeAttr(localized(item, "title"))}" loading="lazy" decoding="async" sizes="(max-width:560px) 100vw, 33vw" width="640" height="480">` : "";
  const source = videoSource(item.videoUrl);
  const label = state.lang === "ar" ? "تشغيل الفيديو" : "Play video";
  if (source.kind === "external") return `<a class="news-video-trigger external" href="${escapeAttr(source.url)}" target="_blank" rel="noopener" aria-label="${label}">${item.imageUrl ? `<img src="${escapeAttr(safeMediaUrl(item.imageUrl))}" alt="" loading="lazy">` : ""}<span class="video-play">▶</span><b>${label} ↗</b></a>`;
  if (!source.url) return item.imageUrl ? `<img class="news-media" src="${escapeAttr(safeMediaUrl(item.imageUrl))}" alt="${escapeAttr(localized(item, "title"))}" loading="lazy">` : "";
  return `<button class="news-video-trigger" type="button" data-video-kind="${escapeAttr(source.kind)}" data-video-src="${escapeAttr(source.url)}" data-video-poster="${escapeAttr(safeMediaUrl(item.imageUrl))}" aria-label="${label}">${item.imageUrl ? `<img src="${escapeAttr(safeMediaUrl(item.imageUrl))}" alt="" loading="lazy">` : ""}<span class="video-play">▶</span><b>${label}</b></button>`;
}

function playNewsVideo(button) {
  const kind = button.dataset.videoKind;
  const src = button.dataset.videoSrc;
  const poster = button.dataset.videoPoster;
  if (!src) return;
  const verified = videoSource(src);
  if (kind === "direct" && verified.kind === "direct") button.outerHTML = `<video class="news-video-player" src="${escapeAttr(verified.url)}" poster="${escapeAttr(safeMediaUrl(poster))}" controls autoplay playsinline preload="metadata"></video>`;
  else if (kind === "embed" && isApprovedVideoEmbed(src)) button.outerHTML = `<iframe class="news-video-player" src="${escapeAttr(src)}" title="فيديو الخبر" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
}

function renderSettings() {
  const s = settings();
  const branch = currentBranch();
  const business = state.lang === "ar" ? s.businessNameAr : s.businessNameEn;
  $$('[data-business-name]').forEach(el => { el.textContent = business || (state.lang === "ar" ? "مزين مصر" : "El Mezaen Egypt"); });
  $("#aboutText").textContent = state.lang === "ar" ? (s.aboutAr || t("aboutText", state.lang)) : (s.aboutEn || t("aboutText", state.lang));
  const genericBranchLabel = t("branch", state.lang);
  const selectedLabel = branch ? branchName(branch) : genericBranchLabel;
  $$('[data-branch-label]').forEach(el => { el.textContent = selectedLabel; });
  $$('[data-branch-switch-text], [data-branch-pill-text]').forEach(el => { el.textContent = branch ? branchName(branch) : t("chooseBranch", state.lang); });
  $("#bookingBranchName").textContent = branch ? branchName(branch) : "—";
  $("#bookingBranchAddress").textContent = branch ? branchAddress(branch) : "—";
  $("#summaryBranch").textContent = branch ? branchName(branch) : t("chooseBranch", state.lang);
  if (branch) {
    $("#mobileCall").href = phoneHref(branch.phone);
    $("#mobileWhatsapp").href = `https://wa.me/${whatsappNumber(branch.whatsapp || branch.phone)}`;
    $("#mobileMap").href = safeWebUrl(branch.mapsUrl) || "#contact";
    $("#mobileQuickActions").classList.add("ready");
  } else {
    $("#mobileCall").href = $("#mobileWhatsapp").href = $("#mobileMap").href = "#contact";
    $("#mobileQuickActions").classList.remove("ready");
  }
  renderBranchPicker();
  const selected = Boolean(currentBranch());
  $("#fullBranchChoice").hidden = selected;
  $("#selectedBranchCompact").hidden = !selected;
  $("#choose-branch").classList.toggle("has-selected-branch", selected);
  renderBranchFooter();
}

function renderBranchPicker() {
  const branches = state.catalog.branches.filter(item => item.active !== false);
  $("#branchPicker").innerHTML = branches.map(branch => `<article class="branch-choice ${branch.id === state.branchId ? "selected" : ""}">
    <div class="branch-choice-top"><figure class="branch-generic-media"><img src="${escapeAttr(branchMedia(branch))}" alt="${escapeAttr(safeMediaUrl(branch.imageUrl)?branchName(branch):(state.lang==='ar'?'صورة تعبيرية لأجواء صالون حلاقة':'Illustrative barbershop image'))}" width="160" height="160" loading="lazy">${safeMediaUrl(branch.imageUrl)?'':`<figcaption>${state.lang==='ar'?'صورة تعبيرية':'Illustration'}</figcaption>`}</figure><div><small>${state.lang === "ar" ? "مزين مصر" : "El Mezaen Egypt"}</small><h3>${escapeHtml(branchName(branch))}</h3></div>${branch.id === state.branchId ? `<b class="selected-check">✓</b>` : ""}</div>
    <p>${escapeHtml(branchAddress(branch))}</p>
    <div class="branch-quick-info"><span>${lineIcon("clock", 16)} ${escapeHtml(branch.openingTime || "—")} – ${escapeHtml(branch.closingTime || "—")}</span><span>${lineIcon("phone", 16)} ${escapeHtml(branch.phone)}</span></div>
    <button class="btn btn-primary" type="button" data-select-branch="${escapeAttr(branch.id)}">${t("bookBranch", state.lang)}</button>
  </article>`).join("") || `<div class="empty-state">${state.lang === "ar" ? "لا توجد فروع متاحة حاليًا" : "No branches are currently available"}</div>`;
  $("#branchQuickGrid").innerHTML = branches.map(branch => `<article class="branch-quick-card ${branch.id === state.branchId ? "selected" : ""}"><div class="branch-card-main"><figure class="branch-thumb"><img class="branch-quick-photo" src="${escapeAttr(branchMedia(branch))}" alt="${escapeAttr(safeMediaUrl(branch.imageUrl)?branchName(branch):(state.lang==='ar'?'صورة تعبيرية':'Illustrative image'))}" width="160" height="110" loading="lazy" decoding="async">${safeMediaUrl(branch.imageUrl)?'':`<figcaption>${state.lang==='ar'?'تعبيرية':'Illustration'}</figcaption>`}</figure><div class="branch-quick-copy"><h3>${escapeHtml(branchName(branch))}</h3><p>${escapeHtml(branchAddress(branch))}</p></div><button class="branch-select-icon" type="button" data-choose-inline-branch="${escapeAttr(branch.id)}" aria-label="${escapeAttr((state.lang==='ar'?'اختيار ':'Choose ')+branchName(branch))}">${lineIcon('map',20)}</button></div><details class="branch-card-details"><summary>${state.lang==='ar'?'المواعيد والتواصل':'Hours and contact'}</summary><div class="branch-quick-info">${lineIcon('clock',16)}<bdi>${escapeHtml(branch.openingTime||'—')} – ${escapeHtml(branch.closingTime||'—')}</bdi></div><div class="branch-quick-actions"><button class="btn btn-primary" type="button" data-book-branch="${escapeAttr(branch.id)}">${t('bookBranch',state.lang)}</button>${branch.phone?`<a class="btn btn-ghost" href="${escapeAttr(phoneHref(branch.phone))}">${state.lang==='ar'?'اتصل بالفرع':'Call branch'}</a>`:''}</div></details></article>`).join("");
}

// A valid media URL may still point to a missing file. Keep the branch card intact.
$("#branchQuickGrid").addEventListener("error", event => {
  if (!event.target.matches("img.branch-quick-photo")) return;
  const fallback = document.createElement("span");
  fallback.className = "branch-marker";
  fallback.setAttribute("aria-hidden", "true");
  fallback.innerHTML = lineIcon("map", 22);
  event.target.replaceWith(fallback);
}, true);

function renderBranchFooter() {
 updatePublicFooter(state.catalog,state.lang);
}

function renderAll() {
  document.documentElement.dataset.catalogState = catalogReady ? "ready" : "loading";
  document.body.classList.toggle("needs-branch", catalogReady && !currentBranch());
  $("#catalogStatus").hidden = catalogReady;
  renderOffers();
  renderPackages();
  renderServices();
  renderTeam();
  renderContent();
  renderReviews();
  renderSettings();
  renderCart();
  renderDrinks();
  renderStaffPicker();
  updateSummary();
  observeReveals();
  syncHomePresentation(document,{phase:catalogReady?(state.catalog.cached?'cached':'ready'):'loading',hasBranch:Boolean(currentBranch()),lang:state.lang,cachedAt:state.catalog.cachedAt});
}

function addToCart(id, option = "") {
  if (state.catalog.cached || state.catalog.offline) { showToast(state.lang === "ar" ? "حدّث البيانات قبل اختيار خدمات للحجز" : "Refresh the catalog before booking"); return false; }
  const item = itemIndex().get(id);
  if (!item || item.active === false || item.catalogVisible === false || item.available === false || item.published === false || ["draft", "unpublished", "expired", "stopped"].includes(item.status) || (item.startAt && (Number.isNaN(Date.parse(item.startAt)) || new Date(item.startAt).getTime() > Date.now())) || (item.endAt && (Number.isNaN(Date.parse(item.endAt)) || new Date(item.endAt).getTime() < Date.now()))) { showToast(state.lang === "ar" ? "العنصر غير متاح حاليًا" : "This item is unavailable"); return false; }
  let autoSelectedBranch = null;
  if (!state.branchId && Array.isArray(item.branchIds) && item.branchIds.length === 1) {
    autoSelectedBranch = state.catalog.branches.find(branch => branch.id === item.branchIds[0] && branch.active !== false) || null;
    if (!autoSelectedBranch) { showToast(state.lang === "ar" ? "الفرع الخاص بهذا العنصر غير متاح حاليًا" : "The branch for this item is currently unavailable"); return false; }
    if (!selectBranch(autoSelectedBranch.id, false)) return false;
  }
  if (!hasBranchScope(item, item.kind === "drink") || (state.branchId && !itemAvailableAtBranch(item, state.branchId, item.kind === "drink"))) {
    showToast(state.lang === "ar" ? "هذا العنصر غير متاح في الفرع المختار؛ غيّر الفرع أولًا" : "This item is unavailable at this branch; choose another branch");
    return false;
  }
  if (item.kind === "package" && !packageEligible(item, state.catalog, state.branchId)) return false;
  const existing = state.cart.find(line => line.id === id);
  if (!existing) state.cart.push({ id, qty: 1, option: item.kind === "drink" ? option || item.drinkOptions?.[0] || "" : "", choices: {} });
  else if (item.kind === "drink") { existing.qty = Math.min(Number(item.maxQty || 20), Number(existing.qty || 1) + 1); existing.option = option || existing.option || item.drinkOptions?.[0] || ""; }
  saveCart();
  trackEvent("add_to_cart", { item_id: id, branch_id: state.branchId || "unselected" });
  state.coupon = null;
  renderCart();
  updateSummary();
  if (state.date && needsAppointment() && item.kind !== "drink") void renderTimes();
  showToast(autoSelectedBranch ? (state.lang === "ar" ? `تم اختيار ${branchName(autoSelectedBranch)} وإضافة العنصر` : `${branchName(autoSelectedBranch)} selected and item added`) : t("added", state.lang));
  return true;
}

function changeCartQty(id, delta) {
  const item = itemIndex().get(id);
  const line = state.cart.find(value => value.id === id);
  if (!item || !line || item.kind !== "drink") return;
  line.qty = Math.max(1, Math.min(Number(item.maxQty || 20), Number(line.qty || 1) + delta));
  state.coupon = null;
  saveCart();
  renderCart();
  updateSummary();
}

function renderDrinks() {
  const wrapper = $("#drinkUpsell");
  const menu = $("#drinkMenu");
  const drinks = (state.catalog.drinks || []).filter(item => item.active !== false && availableAtBranch(item, true) && Number(item.maxQty || 0) > 0);
  wrapper.hidden = !drinks.length;
  if (!drinks.length) { menu.hidden = true; return; }
  $("#drinkOptions").innerHTML = drinks.map(item => {
    const qty = state.cart.find(line => line.id === item.id)?.qty || 0;
    const options = Array.isArray(item.drinkOptions) ? item.drinkOptions : [];
    return `<article class="drink-option"><span class="drink-cup" aria-hidden="true">${lineIcon("cup", 24)}</span><div><b>${escapeHtml(localized(item))}</b><small>${money(item.newPrice ?? item.price)}${qty ? ` • في الحجز: ${qty}` : ""}</small></div>${options.length ? `<label><span>التحضير</span><select data-drink-option="${escapeAttr(item.id)}">${options.map(option => `<option value="${escapeAttr(option)}">${escapeHtml(option)}</option>`).join("")}</select></label>` : ""}<button type="button" data-add-drink="${escapeAttr(item.id)}" aria-label="إضافة ${escapeAttr(localized(item))}">${lineIcon("plus", 20)} إضافة • ${money(item.newPrice ?? item.price)}</button></article>`;
  }).join("");
}

function removeFromCart(id) {
  state.cart = state.cart.filter(line => line.id !== id);
  state.coupon = null;
  saveCart();
  renderCart();
  updateSummary();
  if (state.date && needsAppointment()) void renderTimes();
  else if (!needsAppointment()) { state.time = ""; $("#bookingTime").innerHTML = '<option value="">—</option>'; }
}

function renderCart() {
  const items = cartItems();
  if(typeof bookingCatalogPicker!=='undefined')bookingCatalogPicker?.refreshContext();
  $("#cartLines").innerHTML = items.length ? items.map(item => `<div class="cart-line ${item.kind === "package" ? "package-cart-line" : ""}"><div><b>${escapeHtml(localized(item))}</b><small>${item.kind === "drink" ? `${state.lang==='ar'?'مشروب':'Drink'} • ${item.qty}${item.option ? ` • ${escapeHtml(item.option)}` : ""}` : `${item.duration ?? 0} ${t("minute", state.lang)}`}</small></div>${item.kind === "drink" ? `<div class="cart-qty"><button type="button" data-cart-qty="-1" data-cart-id="${escapeAttr(item.id)}">−</button><b>${item.qty}</b><button type="button" data-cart-qty="1" data-cart-id="${escapeAttr(item.id)}">＋</button></div>` : ""}<strong class="line-price">${money(Number(item.newPrice ?? item.price ?? 0) * item.qty)}</strong><button class="remove-line" type="button" data-remove-id="${escapeAttr(item.id)}" aria-label="${t("remove", state.lang)}">×</button>${item.kind === "package" && (item.choiceGroups || []).length ? `<div class="package-choice-fields">${item.choiceGroups.map(group => `<label><span>${escapeHtml(state.lang === "ar" ? group.labelAr : group.labelEn || group.labelAr)} <b aria-hidden="true">*</b></span><select data-package-choice="${escapeAttr(item.id)}" data-choice-group="${escapeAttr(group.id)}" required><option value="">${state.lang === "ar" ? "اختر واحدًا" : "Choose one"}</option>${(group.options || []).map(option => `<option value="${escapeAttr(option.id)}" ${item.choices?.[group.id] === option.id ? "selected" : ""}>${escapeHtml(state.lang === "ar" ? option.labelAr : option.labelEn || option.labelAr)}</option>`).join("")}</select></label>`).join("")}</div>` : ""}</div>`).join("") : `<div class="empty-state"><strong>${t("emptyCart", state.lang)}</strong><p>${t("cartHint", state.lang)}</p></div>`;
  saveCart();
  renderDrinks();
  renderStaffPicker();
  updateProductOnlyUi();
}

function renderStaffPicker() {
  const candidates=bookingWorkerCandidates(state.catalog,state.branchId,cartItems());
  if(state.staffId!=="any"&&!candidates.some(worker=>worker.id===state.staffId))state.staffId="any";
  const any = `<button class="staff-choice ${state.staffId === "any" ? "selected" : ""}" type="button" data-staff-id="any"><b>${t("anyStaff", state.lang)}</b><small>${state.lang === "ar" ? "أقرب متخصص متاح" : "Nearest available specialist"}</small></button>`;
  $("#staffPicker").innerHTML = any + candidates.map(item => `<button class="staff-choice ${state.staffId === item.id ? "selected" : ""}" type="button" data-staff-id="${escapeAttr(item.id)}" ${item.available === false ? "disabled" : ""}><img src="${escapeAttr(safeMediaUrl(item.imageUrl) || "/assets/el-mezaen-mark-v2.webp")}" alt="" width="56" height="56" loading="lazy"><b>${escapeHtml(localized(item))}</b><small>${escapeHtml(localized(item, "specialty"))}</small></button>`).join("");
}

function updateProductOnlyUi() {
  const onlyProducts = cartItems().length > 0 && !needsAppointment();
  $("#productOnlyStaff").classList.toggle("show", onlyProducts);
  $("#productOnlyDate").classList.toggle("show", onlyProducts);
  $("#staffPicker").hidden = onlyProducts;
  $("#appointmentFields").hidden = onlyProducts;
  $("#appointmentTimeFields").hidden = onlyProducts;
  $("#productOnlyTime").hidden = !onlyProducts;
  if (onlyProducts) { state.staffId = "any"; state.date = ""; state.time = ""; }
}

function updateSummary() {
  $("#mobileBookingTotal").textContent = money(total());
  const items = cartItems();
  const branch = currentBranch();
  $("#summaryBranch").textContent = branch ? branchName(branch) : t("chooseBranch", state.lang);
  $("#summaryItems").textContent = items.length ? items.map(item => localized(item)).join("، ") : (state.lang === "ar" ? "من فضلك اختر خدمة" : "Please choose a service");
  $("#summaryDate").textContent = state.date && state.time ? `${state.date} • ${state.time}` : (needsAppointment() ? (state.lang === "ar" ? "من فضلك اختر التاريخ والوقت" : "Please choose date and time") : (state.lang === "ar" ? "لا يحتاج موعد" : "No appointment required"));
  const selected = state.catalog.staff.find(item => item.id === state.staffId);
  $("#summaryStaff").textContent = selected ? localized(selected) : t("anyStaff", state.lang);
  $("#summarySubtotal").textContent = money(subtotal());
  $("#summaryDiscount").textContent = money(discountAmount());
  $("#discountPercent").textContent = `(${Number(state.coupon?.discountPercent || 0)}%)`;
  $("#summaryTotal").textContent = money(total());
}

let catalogRefreshPromise;
function refreshCatalog(silent = true) {
  if(!catalogReady)syncHomePresentation(document,{phase:'loading',lang:state.lang});
  if (!catalogRefreshPromise) catalogRefreshPromise = loadFreshCatalog(silent).finally(() => { catalogRefreshPromise = null; });
  return catalogRefreshPromise;
}
async function loadFreshCatalog(silent = true) {
  try {
    const catalog = await getCatalog();
    if (!catalog.branches?.some(branch => activeBranch(catalog, branch.id))) throw Object.assign(new Error("No active branches in catalog"), { code: "NO_ACTIVE_BRANCHES" });
    state.catalog = { ...state.catalog, offline: false, cached: false, ...catalog };
    if(typeof bookingCatalogWindow!=='undefined')bookingCatalogWindow.reset(state.catalog);
    if(typeof bookingCatalogPicker!=='undefined')bookingCatalogPicker?.refresh();
    catalogReady = true;
    if (state.branchId && !state.catalog.branches.some(item => item.id === state.branchId && item.active !== false)) {
      state.branchId = "";
      localStorage.removeItem("mz-branch");
    }
    for (const entry of state.catalog.translations || []) {
      if (entry.key && entry.ar) translations.ar[entry.key] = entry.ar;
      if (entry.key && entry.en) translations.en[entry.key] = entry.en;
    }
    applyStaticTranslations(state.lang);
    const requestedBranch = sessionStorage.getItem("mz-requested-branch");
    if (requestedBranch) {
      sessionStorage.removeItem("mz-requested-branch");
      if (activeBranch(state.catalog, requestedBranch)) selectBranch(requestedBranch, false);
    }
    let repeat = null;
    try { repeat = JSON.parse(sessionStorage.getItem("mz-repeat-booking") || "null"); } catch {}
    if (repeat) {
      state.branchId = state.catalog.branches.some(item => item.id === repeat.branchId && item.active !== false) ? repeat.branchId : "";
      state.staffId = state.catalog.staff.some(item => item.id === repeat.staffId && item.active !== false && explicitlyAvailableAtBranch(item)) ? repeat.staffId : "any";
      const index = itemIndex();
      state.cart = (repeat.items || []).filter(line => { const item = index.get(line.id); return item && item.active !== false && !["stopped", "expired"].includes(item.status) && (!item.startAt || new Date(item.startAt).getTime() <= Date.now()) && (!item.endAt || new Date(item.endAt).getTime() >= Date.now()) && availableAtBranch(item); }).map(line => ({ id: line.id, qty: Math.max(1, Number(line.qty || 1)), option: line.option || "", choices: line.choices || {} }));
      state.date = ""; state.time = "";
      sessionStorage.removeItem("mz-repeat-booking");
      if (state.branchId) localStorage.setItem("mz-branch", state.branchId);
      saveCart();
      const notice = sessionStorage.getItem("mz-repeat-notice"); sessionStorage.removeItem("mz-repeat-notice");
      showToast(notice || (state.cart.length < (repeat.items || []).length ? "بعض الخدمات لم تعد متاحة في الفرع؛ اختر بدائل وموعدًا جديدًا" : "تم تجهيز آخر حجز؛ اختر التاريخ والموعد بعد مراجعة الأسعار الحالية"));
    }
    let favorite = null;
    try { favorite = JSON.parse(sessionStorage.getItem("mz-favorite-booking") || "null"); } catch {}
    if (favorite) {
      state.branchId = state.catalog.branches.some(item => item.id === favorite.branchId && item.active !== false) ? favorite.branchId : "";
      state.staffId = state.catalog.staff.some(item => item.id === favorite.staffId && item.active !== false && explicitlyAvailableAtBranch(item)) ? favorite.staffId : "any";
      if (state.branchId) localStorage.setItem("mz-branch", state.branchId);
      sessionStorage.removeItem("mz-favorite-booking");
      showToast("تم اختيار الحلاق المفضل؛ اختر الخدمة ثم التاريخ والموعد المتاح");
    }
    let chosenStaff = null;
    try { chosenStaff = JSON.parse(sessionStorage.getItem("mz-staff-booking") || "null"); } catch {}
    if (chosenStaff) {
      sessionStorage.removeItem("mz-staff-booking");
      if (chosenStaff.branchId === state.branchId && state.catalog.staff.some(item => item.id === chosenStaff.staffId && item.active !== false && item.available !== false && explicitlyAvailableAtBranch(item))) {
        state.staffId = chosenStaff.staffId;
        showToast("تم اختيار المتخصص؛ اختر الخدمة ووقت الزيارة");
      }
    }
    let entryItem = null;
    let openEntryBooking = false;
    try { entryItem = JSON.parse(sessionStorage.getItem("mz-entry-item") || "null"); } catch {}
    if (entryItem) {
      sessionStorage.removeItem("mz-entry-item");
      const entry = itemIndex().get(entryItem.id);
      if (entryItem.branchId === state.branchId && entry?.kind === entryItem.kind && publicSubset([entry], state.branchId, { dated: true }).length) {
        openEntryBooking = addToCart(entry.id);
        if (openEntryBooking) showToast("تمت إضافة اختيارك من صفحة الفرع؛ أكمل الحجز");
      }
    }
    if (state.branchId) {
      const reconciled = reconcileBranchCart(state.cart, state.catalog, state.branchId);
      if (reconciled.removed) { showToast(state.lang === "ar" ? "في السلة عناصر غير متاحة؛ راجع اختيارك قبل الحجز" : "Some cart items are unavailable; review before booking"); }
    }
    renderAll();
    if (openEntryBooking && !$("#bookingDialog").open) showBookingDialog();
    // Branch choice lives in the Hero; booking actions still enforce branch selection.
    return true;
  } catch (error) {
    catalogReady = false;
    state.catalog = { ...state.catalog, offline: true };
    if (!catalogReady) {
      syncHomePresentation(document,{phase:'error',lang:state.lang,errorCode:error?.code||(error?.message==='No active branches in catalog'?'NO_ACTIVE_BRANCHES':'CATALOG_UNAVAILABLE')});
    }
    if (!silent) showToast(t("loadError", state.lang));
    console.debug("Catalog refresh failed", error?.message || error);
    return false;
  }
}

let bookingOpening = false;
async function prefillCustomer() {
  if (!firebaseConfigured) return;
  const wasLocked = $("#customerPhone").readOnly;
  $("#customerPhone").readOnly = false;
  try {
    const customer = await firebaseClient().then(module => module.signedInCustomer());
    if (!customer) { if (wasLocked) $("#customerPhone").value = ""; return; }
    if (!$("#firstName").value) $("#firstName").value = customer.firstName || "";
    if (!$("#lastName").value) $("#lastName").value = customer.lastName || "";
    $("#customerPhone").value = customer.phone;
    $("#customerPhone").readOnly = true;
  } catch (error) { console.debug("Customer prefill unavailable", error); if (wasLocked) $("#customerPhone").value = ""; showToast("تعذر تحميل بيانات الحساب؛ تأكد من رقم هاتف الحجز قبل المتابعة"); }
}
async function openBooking(button) {
  if (state.catalog.cached || state.catalog.offline) { if (!await refreshCatalog(false) || state.catalog.cached || state.catalog.offline) { showToast(state.lang === "ar" ? "الحجز محتاج بيانات حديثة؛ أعد المحاولة" : "Booking needs a fresh catalog; retry"); return; } }
  if (bookingOpening || $("#bookingDialog").open) return;
  bookingOpening = true;
  if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); }
  try {
    trackEvent("booking_started", { branch_id: state.branchId || "unselected", cart_size: state.cart.length });
    // Paint a valid loaded branch shell before any network work.
    const hadLoadedCatalog=catalogReady;
    if (catalogReady && currentBranch()) showBookingDialog();
    else if (catalogReady) openBranchDialog(true);
    const dialog = $("#bookingDialog");
    dialog.setAttribute("aria-busy", "true");
    const results = await Promise.allSettled(firebaseConfigured ? [refreshCatalog(true), prefillCustomer()] : []);
    dialog.removeAttribute("aria-busy");
    if (results.some(item => item.status === "rejected")) showToast(t("loadError", state.lang));
    if (!currentBranch()) { if (dialog.open) dialog.close(); openBranchDialog(true); }
    else if (!hadLoadedCatalog && !dialog.open && !$("#branchDialog").open) showBookingDialog();
  } catch (error) {
    console.debug("Booking dialog unavailable", error?.message || error);
    showToast(t("loadError", state.lang));
  } finally {
    $("#bookingDialog").removeAttribute("aria-busy");
    bookingOpening = false;
    if (button) { button.disabled = false; button.removeAttribute("aria-busy"); }
  }
}

function openBranchDialog(continueToBooking = false) {
  if (!catalogReady) { showToast("جاري تحميل بيانات الفروع؛ انتظر لحظة"); return; }
  if (bookingSubmitting) { showToast(state.lang === "ar" ? "انتظر حتى يتم تأكيد الحجز الحالي" : "Wait until the current booking is confirmed"); return; }
  if ($("#bookingDialog").open) $("#bookingDialog").close();
  $("#branchDialog").dataset.continueBooking = continueToBooking ? "true" : "false";
  renderBranchPicker();
  if (!$("#branchDialog").open) $("#branchDialog").showModal();
  document.body.style.overflow = "hidden";
}

function closeBranchDialog() {
  if ($("#branchDialog").open) $("#branchDialog").close();
  document.body.style.overflow = "";
}

function showBookingDialog() {
  if (!currentBranch()) { openBranchDialog(true); return; }
  if (state.step === 7) resetBooking();
  $("#bookingDialog").showModal();
  document.body.style.overflow = "hidden";
  goToStep(1);
}

function selectBranch(id, continueToBooking = false) {
  if (bookingSubmitting) { showToast(state.lang === "ar" ? "لا يمكن تغيير الفرع أثناء تأكيد الحجز" : "The branch cannot be changed while confirming the booking"); return false; }
  const branch = state.catalog.branches.find(item => item.id === id && item.active !== false);
  if (!branch) { showToast(state.lang === "ar" ? "هذا الفرع غير متاح حاليًا" : "This branch is currently unavailable"); return; }
  if (state.branchId !== id) {
    const removed = reconcileBranchCart(state.cart, state.catalog, id).removed;
    if (removed && !confirm(state.lang === "ar" ? `تغيير الفرع سيحذف ${removed} من العناصر غير المتاحة في ${branchName(branch)}. هل تريد المتابعة؟` : `Changing branch removes ${removed} incompatible cart items. Continue?`)) return false;
  }
  const previousCount = state.cart.length;
  state.branchId = branch.id;
  state.category = "all";
  localStorage.setItem("mz-branch", branch.id);
  trackEvent("branch_selected", { branch_id: branch.id });
  state.cart = reconcileBranchCart(state.cart, state.catalog, branch.id).kept;
  availabilityRequestId++;
  state.staffId = "any";
  state.date = "";
  state.time = "";
  state.coupon = null;
  $("#bookingDate").value = "";
  $("#bookingTime").innerHTML = '<option value="">—</option>';
  saveCart();
  closeBranchDialog();
  setLanguage(state.lang);
  if (previousCount !== state.cart.length) showToast(state.lang === "ar" ? "تم حذف عناصر غير متاحة في هذا الفرع" : "Unavailable items were removed from the cart");
  if (continueToBooking) showBookingDialog();
  return true;
}

function closeBooking() {
  if (bookingSubmitting) { showToast(state.lang === "ar" ? "انتظر حتى يتم تأكيد الحجز الحالي" : "Wait until the current booking is confirmed"); return; }
  $("#bookingDialog").close();
  document.body.style.overflow = "";
  if (state.step === 7) resetBooking();
}

function resetBooking() {
  state.step = 1;
  state.staffId = "any";
  state.date = "";
  state.time = "";
  state.coupon = null;
  state.completedPreview = false;
  $("#customerForm").reset();
  $("#bookingDate").value = "";
  $("#bookingTime").innerHTML = '<option value="">—</option>';
  $("#previewNotice").classList.remove("show");
  goToStep(1);
}

function goToStep(step) {
  $("#bookingDialog .booking-body")?.scrollTo({top:0});
  state.step = Math.max(1, Math.min(7, step));
  $$('.booking-step').forEach(section => section.classList.toggle("active", Number(section.dataset.step) === state.step));
  $$('#bookingProgress li').forEach((item, index) => {
    item.classList.toggle("active", index + 1 === state.step);
    item.classList.toggle("done", index + 1 < state.step);
  });
  $("#dialogActions").hidden = state.step === 7;
  $("#bookingSummary").hidden = state.step === 7;
  $("#prevStep").style.visibility = state.step === 1 ? "hidden" : "visible";
  $("#nextStep").textContent = state.step === 6 ? t("createBooking", state.lang) : state.step === 1 ? (state.lang === "ar" ? "متابعة الحجز" : "Continue booking") : t("next", state.lang);
  updateProductOnlyUi();
  updateSummary();
}

function canAdvance() {
  if (!state.branchId || !currentBranch()) { showToast(t("chooseBranch", state.lang)); return false; }
  if (state.step === 1 && (!cartItems().length || cartItems().length !== state.cart.length)) { showToast(state.lang === "ar" ? "بعض العناصر لم تعد متاحة؛ راجع السلة" : "Some items are unavailable; review your cart"); return false; }
  if (state.step === 1) {
    const missing = cartItems().map(item => ({ item, group: packageChoiceMissing(item) })).find(value => value.group);
    if (missing) { showToast(`${state.lang === "ar" ? "اختر" : "Choose"} ${state.lang === "ar" ? missing.group.labelAr : missing.group.labelEn || missing.group.labelAr}`); document.querySelector(`[data-package-choice="${CSS.escape(missing.item.id)}"][data-choice-group="${CSS.escape(missing.group.id)}"]`)?.focus(); return false; }
  }
  if (state.step === 4 && needsAppointment() && availabilityLoading) { showToast(state.lang === "ar" ? "جاري تحميل المواعيد المتاحة" : "Available times are still loading"); return false; }
  if (state.step === 4 && needsAppointment() && (!state.date || !state.time)) { showToast(t("required", state.lang)); return false; }
  if (state.step === 3 && needsAppointment() && !state.date) { showToast(t("required", state.lang)); return false; }
  return true;
}

function renderFinalBookingReview() {
  const review = $("#finalBookingReview"); review.replaceChildren();
  const labels=state.lang==="ar"?["الفرع","الخدمات","العامل","الموعد","العميل","قبل الخصم","الخصم","الإجمالي"]:["Branch","Services","Specialist","Appointment","Customer","Subtotal","Discount","Total"];
  const data = [ [labels[0], currentBranch() ? branchName(currentBranch()) : "—"], [labels[1], cartItems().map(item => localized(item)).join(" + ")], [labels[2], $("#summaryStaff").textContent], [labels[3], $("#summaryDate").textContent], [labels[4], `${$("#firstName").value} ${$("#lastName").value}`], [labels[5], money(subtotal())], [labels[6], money(discountAmount())], [labels[7], money(total())] ];
  for (const [label, value] of data) { const row = document.createElement("p"); row.textContent = `${label}: ${value}`; review.append(row); }
}

async function nextStep() {
  if (bookingSubmitting) return;
  if (!canAdvance()) return;
  if (state.step === 5 && !$("#customerForm").reportValidity()) return;
  if (state.step < 6) { if (state.step === 5) renderFinalBookingReview(); goToStep(state.step + 1); return; }
  if (state.step === 6) await submitBooking();
}

function setDateBounds() {
  const today = cairoDateKey();
  $("#bookingDate").min = today;
  $("#bookingDate").max = addDays(today, 60);
}

let availabilityRequestId = 0;
let bookingAvailabilityRefresh;
let availabilityLoading = false;

function availabilityFingerprint() {
  return JSON.stringify({
    branchId: state.branchId,
    staffId: state.staffId,
    bookingDate: state.date,
    items: cartItems().filter(item => !["inventory", "drink"].includes(item.kind)).map(item => ({ id: item.id, kind: item.kind, qty: item.qty, choices: item.choices || {} }))
  });
}

function slotLabel(value) {
  const candidate = new Date(`2000-01-01T${value}:00Z`);
  return new Intl.DateTimeFormat(state.lang === "ar" ? "ar-EG" : "en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(candidate);
}

function renderBookingAvailability(result,select){
 clearTimeout(bookingAvailabilityRefresh);
 let notice=document.querySelector('#bookingAvailabilityNotice');
 if(!notice){notice=document.createElement('aside');notice.id='bookingAvailabilityNotice';notice.className='booking-availability-notice';notice.setAttribute('aria-live','polite');select.closest('label').after(notice);}
 notice.replaceChildren();notice.hidden=true;
 if(!result)return;
 const ar=state.lang==='ar',info=result.availability;
 if(info?.state==='busy'&&info.nextTime&&result.serverNowMs){const date=document.querySelector('#bookingDate').value,delay=cairoAppointmentMillis(date,info.nextTime)-result.serverNowMs;if(delay>0&&delay<86400000)bookingAvailabilityRefresh=setTimeout(()=>{if(!document.hidden&&document.querySelector('#bookingDate').value===date)void renderTimes();},delay+1000);}
 if(result.reason==='staff_not_present'){notice.hidden=false;notice.textContent=ar?'العامل لم يسجل حضوره في الفرع اليوم، أو انتهت وردية حضوره. جرّب عامل تاني أو يوم تاني.':'This barber has not checked in at this branch today, or their attendance shift has ended. Try another barber or date.';return;}
 if(info?.state==='busy'&&!info.nextTime){notice.hidden=false;notice.textContent=ar?'العامل مشغول أو غير متاح حاليًا، ومفيش موعد متاح بعده في اليوم ده. جرّب يوم تاني أو عامل تاني.':'This barber is busy or unavailable, with no remaining slot today. Try another date or barber.';return;}
 if(!info?.nextTime)return;
 notice.hidden=false;
 const title=document.createElement('strong');title.textContent=info.state==='busy'?(ar?'العامل مشغول حاليًا':'The barber is busy now'):(ar?'أقرب موعد متاح':'Next available appointment');
 const copy=document.createElement('p');copy.textContent=(ar?'أقرب حجز: ':'Next appointment: ')+slotLabel(info.nextTime)+(info.state==='busy'&&Number.isFinite(info.waitMinutes)?(ar?`، بعد حوالي ${info.waitMinutes} دقيقة.`:` — in about ${info.waitMinutes} minutes.`):'');
 const button=document.createElement('button');button.type='button';button.className='btn btn-primary';button.textContent=ar?'تحب تحجز الموعد ده؟':'Book this time?';button.onclick=()=>{if(![...select.options].some(option=>option.value===info.nextTime))return;select.value=info.nextTime;select.dispatchEvent(new Event('change',{bubbles:true}));};
 const help=document.createElement('small');help.textContent=ar?'الموعد تقديري وبيتراجع وقت الحفظ. الحجز يتأكد بعد موافقة مسؤول الفرع، وبعدها يوصل للعامل المحدد.':'The time is estimated and checked again on submission. The branch operator must approve the request before it reaches the assigned barber.';notice.append(title,copy,button,help);
}

async function renderTimes() {
  const select = $("#bookingTime");
  const selectedDate = $("#bookingDate").value;
  renderBookingAvailability(null,select);
  state.date = selectedDate;
  state.time = "";
  updateSummary();
  const requestId = ++availabilityRequestId;
  if (!selectedDate || !needsAppointment()) {
    availabilityLoading = false;
    select.disabled = !selectedDate;
    select.innerHTML = '<option value="">—</option>';
    return;
  }

  const fingerprint = availabilityFingerprint();
  availabilityLoading = true;
  select.disabled = true;
  select.innerHTML = `<option value="">${state.lang === "ar" ? "جاري تحميل المواعيد المتاحة..." : "Loading available times..."}</option>`;
  try {
    const result = await getAvailableSlots({
      branchId: state.branchId,
      staffId: state.staffId,
      bookingDate: selectedDate,
      items: cartItems().filter(item => !["inventory", "drink"].includes(item.kind)).map(item => ({ id: item.id, kind: item.kind, qty: item.qty, choices: item.choices || {} }))
    });
    if (requestId !== availabilityRequestId || fingerprint !== availabilityFingerprint()) return;
    const slots = Array.isArray(result?.slots) ? result.slots : [];
    renderBookingAvailability(result,select);
    const emptyMessage = result?.reason === "branch_closed"
      ? (state.lang === "ar" ? "الفرع مغلق في هذا اليوم" : "The branch is closed on this day")
      : result?.reason === "staff_unavailable"
        ? (state.lang === "ar" ? "الحلاق المختار غير متاح في هذا اليوم" : "The selected barber is unavailable on this day")
        : (state.lang === "ar" ? "لا توجد مواعيد متاحة في هذا اليوم" : "No available times on this day");
    select.innerHTML = slots.length
      ? `<option value="">${state.lang === "ar" ? "اختر الموعد المتاح" : "Choose an available time"}</option>${slots.map(value => `<option value="${escapeAttr(value)}">${escapeHtml(slotLabel(value))}</option>`).join("")}`
      : `<option value="">${emptyMessage}</option>`;
  } catch (error) {
    if (requestId !== availabilityRequestId) return;
    console.debug("Availability loading failed", error?.message || error);
    select.innerHTML = `<option value="">${state.lang === "ar" ? "تعذر تحميل المواعيد — غيّر التاريخ وحاول مرة أخرى" : "Could not load times — change the date and try again"}</option>`;
    showToast(error?.message || (state.lang === "ar" ? "تعذر تحميل المواعيد المتاحة" : "Could not load available times"));
  } finally {
    if (requestId === availabilityRequestId) {
      availabilityLoading = false;
      select.disabled = false;
    }
  }
}

async function applyCouponCode() {
  const code = $("#couponCode").value.trim();
  if (!code) return;
  const button = $("#applyCoupon");
  button.disabled = true;
  button.textContent = t("applying", state.lang);
  try {
    const items = cartItems().filter(item => !["inventory", "drink"].includes(item.kind)).map(item => ({ id: item.id, kind: item.kind, qty: item.qty, choices: item.choices }));
    if (!items.length) throw new Error("no-discountable-items");
    const phone = $("#customerPhone").value.trim();
    const branchId = state.branchId;
    const cartSnapshot = JSON.stringify(state.cart);
    const result = await validateCoupon({ code, branchId, subtotal: subtotal(), phone, items });
    if (branchId !== state.branchId || phone !== $("#customerPhone").value.trim() || cartSnapshot !== JSON.stringify(state.cart) || code !== $("#couponCode").value.trim()) return;
    if (!result.valid) throw new Error(result.message || "invalid");
    state.coupon = result;
    updateSummary();
    showToast(state.lang === "ar" ? "تم تطبيق الخصم" : "Discount applied");
  } catch {
    state.coupon = null;
    updateSummary();
    showToast(t("couponInvalid", state.lang));
  } finally {
    button.disabled = false;
    button.textContent = t("apply", state.lang);
  }
}

let bookingSubmitting = false;
async function submitBooking() {
  if (bookingSubmitting) return;
  if (navigator.onLine === false) { updateNetworkStatus(); showToast(state.lang==="ar"?"اتصل بالإنترنت لتأكيد الحجز؛ اختياراتك محفوظة":"Connect to the internet to confirm; your selections are saved"); return; }
  const form = $("#customerForm");
  if (!form.reportValidity()) { showToast(t("required", state.lang)); return; }
  const button = $("#nextStep");
  bookingSubmitting = true;
  button.disabled = true;
  button.textContent = t("creating", state.lang);
  const customer = {
    firstName: $("#firstName").value.trim(),
    lastName: $("#lastName").value.trim(),
    phone: $("#customerPhone").value.trim(),
    note: $("#customerNote").value.trim()
  };
  try {
    const bookingPayload = {
      branchId: state.branchId,
      items: cartItems().map(item => ({ id: item.id, kind: item.kind, qty: item.qty, option: item.option || "", choices: item.choices || {} })),
      staffId: state.staffId,
      bookingDate: state.date || null,
      bookingTime: state.time || null,
      customer,
      partySize: Number($("#partySize").value || 1),
      couponCode: state.coupon?.code || null,
      locale: state.lang
    };
    const fingerprint = JSON.stringify(bookingPayload);
    let clientRequestId = sessionStorage.getItem("mz-booking-request-id");
    if (!clientRequestId || sessionStorage.getItem("mz-booking-request-fingerprint") !== fingerprint) {
      clientRequestId = crypto.randomUUID();
      sessionStorage.setItem("mz-booking-request-id", clientRequestId);
      sessionStorage.setItem("mz-booking-request-fingerprint", fingerprint);
    }
    const result = await createBooking({ ...bookingPayload, clientRequestId });
    if (result.existing) showToast(state.lang === "ar" ? "أنت حجزت بالفعل — تم فتح نفس الحجز" : "You already booked — the existing booking is shown");
    $("#successCode").textContent = result.bookingCode;
    try {
      const { default: JsBarcode } = await import("jsbarcode");
      JsBarcode("#successBarcode", result.bookingCode, {...BOOKING_BARCODE_OPTIONS});
    } catch (error) {
      console.debug("Booking barcode is unavailable", error?.message || error);
    }
    state.completedPreview = Boolean(result.preview);
    $("#successTotal").textContent = money(result.total);
    $("#previewNotice").classList.toggle("show", state.completedPreview);
    const resultBranchId = result.branchId || bookingPayload.branchId;
    const branch = state.catalog.branches.find(item => item.id === resultBranchId) || currentBranch();
    const successBranchName = branch ? branchName(branch) : (result.branchNameAr || resultBranchId || (state.lang === "ar" ? "مزين مصر" : "El Mezaen Egypt"));
    $("#successBranch").textContent = successBranchName;
    $("#successServices").textContent = cartItems().map(item => localized(item)).join("، ") || "—";
    const selectedStaff = state.catalog.staff.find(item => item.id === (result.workerId || result.staffId || state.staffId));
    $("#successStaff").textContent = result.workerNameAr || (selectedStaff ? localized(selectedStaff) : t("anyStaff", state.lang));
    $("#successAppointment").textContent = (result.date || state.date) && (result.time || state.time) ? `${result.date || state.date} • ${result.time || state.time}` : (state.lang === "ar" ? "طلب منتجات" : "Product order");
    const phone = whatsappNumber(branch?.whatsapp || branch?.phone);
    const message = state.lang === "ar" ? `مرحبًا، أنشأت حجزًا لدى مزين مصر – ${successBranchName}. كود الحجز: ${result.bookingCode}` : `Hello, I created a booking at El Mezaen Egypt – ${successBranchName}. Booking code: ${result.bookingCode}`;
    $("#successWhatsapp").href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    trackEvent("booking_completed", { branch_id: state.branchId, value: Number(result.total || 0), currency: "EGP" });
    state.cart = [];
    sessionStorage.removeItem("mz-booking-request-id");
    sessionStorage.removeItem("mz-booking-request-fingerprint");
    saveCart();
    renderCart();
    goToStep(7);
  } catch (error) {
    console.debug("Booking failed", error?.message || error);
    const message = error?.message || t("loadError", state.lang);
    showToast(message);
    if (/الموعد غير متاح|slot unavailable|time is unavailable/i.test(message)) {
      state.time = "";
      goToStep(3);
      void renderTimes();
    }
  } finally {
    bookingSubmitting = false;
    button.disabled = false;
    button.textContent = t("createBooking", state.lang);
  }
}

$("#reviewForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(form));
  button.disabled = true;
  try {
    await submitReview(payload);
    form.reset();
    const fiveStars = form.querySelector('input[name="rating"][value="5"]');
    if (fiveStars) fiveStars.checked = true;
    showToast(state.lang === "ar" ? "شكرًا! تم إرسال تقييمك للمراجعة" : "Thank you! Your review was submitted");
  } catch (error) { console.debug("Review submission failed", error?.message || error); showToast(error?.message || "تعذر إرسال التقييم"); }
  finally { button.disabled = false; }
});

$("#manageBookingForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const credentials = Object.fromEntries(new FormData(event.currentTarget));
  button.disabled = true;
  try {
    const result = await getCustomerBooking(credentials);
    state.managedBooking = result.booking;
    state.manageCredentials = credentials;
    renderManagedBooking();
    trackEvent("booking_lookup", { branch_id: result.booking.branchId || "unknown" });
  } catch (error) { showToast(error.message || "تعذر العثور على الحجز"); }
  finally { button.disabled = false; }
});

function renderManagedBooking() {
  const item = state.managedBooking;
  const target = $("#manageBookingResult");
  if (!item) { target.hidden = true; return; }
  const wa = whatsappNumber(item.branchWhatsapp || currentBranch()?.whatsapp || currentBranch()?.phone);
  const message = `مرحبًا، أريد تعديل الحجز رقم ${item.code} في ${item.branchNameAr || "مزين مصر"}.`;
  target.hidden = false;
  target.innerHTML = `<div class="manage-booking-head"><div><small>كود الحجز</small><strong>${escapeHtml(item.code)}</strong></div><span class="status-pill">${bookingStatusLabel(item.status)}</span></div><dl><div><dt>الفرع</dt><dd>${escapeHtml(item.branchNameAr || item.branchId)}</dd></div><div><dt>الخدمات</dt><dd>${escapeHtml((item.serviceNamesAr || []).join(" + "))}</dd></div><div><dt>الموعد</dt><dd>${escapeHtml(item.bookingDate || "طلب منتجات")} ${escapeHtml(item.bookingTime || "")}</dd></div><div><dt>المتخصص</dt><dd>${escapeHtml(item.staffNameAr || "أي عضو")}</dd></div><div><dt>الإجمالي</dt><dd>${money(item.total)}</dd></div></dl><div class="manage-booking-actions"><a class="btn btn-ghost" href="https://wa.me/${wa}?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">طلب تعديل عبر واتساب</a>${item.canCancel ? '<button class="btn btn-danger" type="button" data-cancel-customer-booking>إلغاء الحجز</button>' : ""}</div>`;
}

function bookingStatusLabel(value) { return ({ pending: "جديد", confirmed: "مؤكد", rejected: "مرفوض", cancelled: "ملغي", completed: "مكتمل" })[value] || value || "—"; }

async function cancelManagedBooking(button) {
  if (!state.manageCredentials || !state.managedBooking?.canCancel || !confirm("هل تريد إلغاء الحجز؟")) return;
  const label = button?.textContent || "";
  if (button) { button.disabled = true; button.textContent = "جاري الإلغاء…"; }
  try {
    await cancelCustomerBooking(state.manageCredentials);
    state.managedBooking = { ...state.managedBooking, status: "cancelled", canCancel: false };
    renderManagedBooking();
    showToast("تم إلغاء الحجز بنجاح");
    trackEvent("booking_cancelled", { branch_id: state.managedBooking.branchId || "unknown" });
  } catch (error) { showToast(error.message || "تعذر إلغاء الحجز"); }
  finally { if (button?.isConnected) { button.disabled = false; button.textContent = label; } }
}

function updateCountdowns() {
  $$('[data-countdown]').forEach(el => {
    const diff = new Date(el.dataset.countdown).getTime() - Date.now();
    if (diff <= 0) { el.textContent = state.lang === "ar" ? "انتهى" : "Ended"; return; }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor(diff % 86400000 / 3600000);
    el.textContent = state.lang === "ar" ? `${days} يوم • ${hours} ساعة` : `${days}d • ${hours}h`;
  });
}

function escapeHtml(value) {
  const node = document.createElement("div");
  node.textContent = value ?? "";
  return node.innerHTML;
}
function escapeAttr(value) { return escapeHtml(String(value ?? "")).replaceAll('"', "&quot;"); }

bindSafeBack(".booking-back");
let observer;
function observeReveals() {
  if (!('IntersectionObserver' in window)) { $$('.reveal').forEach(el => el.classList.add("visible")); return; }
  observer ||= new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("visible"); observer.unobserve(entry.target); } }), { rootMargin: "0px 0px -8%", threshold: .08 });
  $$('.reveal:not(.visible)').forEach(el => observer.observe(el));
}

async function openPersonalAssistant(button = document.activeElement) {
  button?.setAttribute("aria-busy", "true");
  try {
    {
      if(!catalogReady)await refreshCatalog(true);
      const ai = await import('./ai-chat.js');
      ai.openAiChat({ faqs: [...(state.catalog.faqs || []).filter(item => availableAtBranch(item) && item.active !== false), ...bookingFaqKnowledge], lang: state.lang, branch: currentBranch(), catalog: state.catalog }, button);
      return;
    }
  } finally { button?.removeAttribute("aria-busy"); }
}

document.addEventListener("click", event => {
  const video = event.target.closest("[data-video-src]");
  if (video) playNewsVideo(video);
  const cancelBooking = event.target.closest("[data-cancel-customer-booking]");
  if (cancelBooking && !cancelBooking.disabled) cancelManagedBooking(cancelBooking);
  const add = event.target.closest("[data-add-id]");
  if(add && state.catalog.packages.some(item=>item.id===add.dataset.addId&&!packageEligible(item,state.catalog,state.branchId))){showToast(state.lang==='ar'?'الباقة غير متاحة في الفرع المختار':'Package unavailable at this branch');return;}
  if (add) {
    const added = addToCart(add.dataset.addId);
    if (added && ["offer", "package"].includes(add.dataset.kind)) void openBooking(add);
    if (added && add.dataset.kind === "offer") trackEvent("offer_clicked", { offer_id: add.dataset.addId, branch_id: state.branchId });
  }
  const bookStaff = event.target.closest("[data-book-staff]");
  if (bookStaff && currentBranch()) { state.staffId = bookStaff.dataset.bookStaff; renderStaffPicker(); void openBooking(bookStaff); }
  const retry = event.target.closest("[data-retry-catalog]");
  if (retry) { retry.disabled = true; void refreshCatalog(false).finally(() => { if (retry.isConnected) retry.disabled = false; }); }
  const packageDetails = event.target.closest("[data-package-details]");
  if (packageDetails) openPackageDetails(packageDetails.dataset.packageDetails);
  if (event.target.closest("[data-close-package-details]")) closePackageDetails();
  const drink = event.target.closest("[data-add-drink]");
  if (drink) addToCart(drink.dataset.addDrink, document.querySelector(`[data-drink-option="${CSS.escape(drink.dataset.addDrink)}"]`)?.value || "");
  const remove = event.target.closest("[data-remove-id]");
  if (remove) removeFromCart(remove.dataset.removeId);
  const quantity = event.target.closest("[data-cart-qty]");
  if (quantity) changeCartQty(quantity.dataset.cartId, Number(quantity.dataset.cartQty || 0));
  if (event.target.closest("[data-open-faq-chat]")) openPersonalAssistant(event.target.closest("[data-open-faq-chat]"));
  const filter = event.target.closest("[data-category]");
  if (filter) { state.category = filter.dataset.category; renderServices(); }
  const staff = event.target.closest("[data-staff-id]");
  if (staff) { state.staffId = staff.dataset.staffId; state.time = ""; renderStaffPicker(); updateSummary(); if (state.date && needsAppointment()) void renderTimes(); }
  const select = event.target.closest("[data-select-branch]");
  if (select) selectBranch(select.dataset.selectBranch, $("#branchDialog").dataset.continueBooking === "true");
  const inlineBranch = event.target.closest("[data-choose-inline-branch]");
  if (inlineBranch) selectBranch(inlineBranch.dataset.chooseInlineBranch, false);
  const directBranch = event.target.closest("[data-book-branch]");
  if (directBranch) selectBranch(directBranch.dataset.bookBranch, true);
  const openBookingButton = event.target.closest("[data-open-booking]");
  if (openBookingButton) void openBooking(openBookingButton);
  if (event.target.closest("[data-open-branch]")) openBranchDialog(false);
  if (event.target.closest("[data-change-branch]")) openBranchDialog(true);
  if (event.target.closest("[data-close-booking]")) closeBooking();
  if (event.target.closest("[data-close-branch]")) closeBranchDialog();
});

$("#packageDetailsAdd").addEventListener("click", event => {
  const id = event.currentTarget.dataset.addPackageId;
  if (id) addToCart(id);
  closePackageDetails();
});

document.querySelector(".public-header").addEventListener("click",e=>{if(e.target.closest("[data-open-booking],[data-open-branch]"))e.preventDefault();});
$("#langToggle").addEventListener("click", () => setLanguage(state.lang === "ar" ? "en" : "ar"));
$("#themeToggle").addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
const scrollTopButton = $("#scrollTop");
let scrollFrame = 0;
function syncScrollControls() {
  scrollFrame = 0;
  const scrolled = window.scrollY > 520;
  scrollTopButton.hidden = !scrolled;
  document.querySelector(".site-header")?.classList.toggle("scrolled", window.scrollY > 24);
}
window.addEventListener("scroll", () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(syncScrollControls); }, { passive: true });
scrollTopButton.addEventListener("click", () => window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
syncScrollControls();
$("#nextStep").addEventListener("click", nextStep);
$("#prevStep").addEventListener("click", () => goToStep(state.step - 1));
$("#applyCoupon").addEventListener("click", applyCouponCode);
$("#couponCode").addEventListener("input", () => { state.coupon = null; updateSummary(); });
$("#customerPhone").addEventListener("input", () => { state.coupon = null; updateSummary(); });
$("#drinkUpsellToggle").addEventListener("click", () => {
  const menu = $("#drinkMenu");
  const open = menu.hidden;
  menu.hidden = !open;
  $("#drinkUpsellToggle").setAttribute("aria-expanded", String(open));
});
$("#bookingDate").addEventListener("change", event => { state.date = event.target.value; void renderTimes(); });
$("#bookingTime").addEventListener("change", event => { state.time = event.target.value; updateSummary(); });
$("#cartLines").addEventListener("change", event => {
  const select = event.target.closest("[data-package-choice]");
  if (!select) return;
  const line = state.cart.find(item => item.id === select.dataset.packageChoice);
  if (!line) return;
  line.choices ||= {};
  if (select.value) line.choices[select.dataset.choiceGroup] = select.value;
  else delete line.choices[select.dataset.choiceGroup];
  state.coupon = null;
  saveCart();
  updateSummary();
  if (state.date && needsAppointment()) void renderTimes();
});
$("#bookingDialog").addEventListener("click", event => { if (event.target === $("#bookingDialog")) closeBooking(); });
$("#bookingDialog").addEventListener("cancel", event => { if (bookingSubmitting) { event.preventDefault(); showToast(state.lang === "ar" ? "انتظر حتى يتم تأكيد الحجز الحالي" : "Wait until the current booking is confirmed"); } });
$("#bookingDialog").addEventListener("close", () => { document.body.style.overflow = ""; });
$("#branchDialog").addEventListener("click", event => { if (event.target === $("#branchDialog")) closeBranchDialog(); });
$("#branchDialog").addEventListener("close", () => { if (!$("#bookingDialog").open) document.body.style.overflow = ""; });
$("#packageDetailsDialog").addEventListener("click", event => { if (event.target === $("#packageDetailsDialog")) closePackageDetails(); });
$("#packageDetailsDialog").addEventListener("close", () => { document.body.style.overflow = ""; });

async function init() {
  syncHomePresentation(document,{phase:catalogReady?'ready':'loading',hasBranch:Boolean(currentBranch()),lang:state.lang,cachedAt:state.catalog.cachedAt});
  setTheme(state.theme);
  applyStaticTranslations(state.lang);
  $("#langToggle").textContent = state.lang === "ar" ? "EN" : "ع";
  setDateBounds();
  const siteUrl = globalThis.__SITE_URL__ || $("#canonical").href || location.origin;
  $("#canonical").href = siteUrl;
  if (catalogReady) { renderAll(); }
  updateNetworkStatus();
  saveCart();
  observeReveals();
  if ('serviceWorker' in navigator && location.protocol !== "http:") navigator.serviceWorker.register("/sw.js").catch(error => console.debug("Service worker registration failed", error?.message || error));
  if (firebaseConfigured) {
    const refreshRemoteCatalog = () => { if(!catalogReady)void refreshCatalog(true); };
    if ("requestIdleCallback" in window) window.requestIdleCallback(refreshRemoteCatalog, { timeout: 2500 });
    else setTimeout(refreshRemoteCatalog, 800);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshCatalog(true); });
  }
  if (!firebaseConfigured) document.documentElement.dataset.preview = "true";
  if (/^\/booking(?:\/|$)/.test(location.pathname) || new URLSearchParams(location.search).get("book") === "1") setTimeout(() => { void openBooking(); }, 0);
}

window.addEventListener("offline", () => updateNetworkStatus());
window.addEventListener("online", () => updateNetworkStatus(true));

bookingCatalogPicker=mountPublicBookingCatalog({target:$('#bookingServiceChoices'),getContext:()=>({branchId:state.branchId,lang:state.lang}),getPage:options=>firebaseClient().then(module=>module.getCatalogPage(options)),onPage:(collection,page)=>{Object.assign(state.catalog,bookingCatalogWindow.page(collection,page,state.cart.map(x=>x.id)));},markup:(item,collection,page)=>`<button class="booking-service-choice" type="button" data-add-id="${escapeAttr(item.id)}" data-kind="${collection==='packages'?'package':collection==='offers'?'offer':item.type==='product'?'product':'service'}" ${page.offline||page.cached?'disabled':''}><img src="${escapeAttr(collection==='packages'?packageMedia(item):serviceMedia(item))}" alt="" width="56" height="56" loading="lazy"><span>${escapeHtml(localized(item))}<small>${money(item.newPrice??item.price)} • ${Number(item.duration)||0} ${t('minute',state.lang)}</small></span><b>＋</b></button>`});
init();

$("#mobileQuickActions").addEventListener("click",event=>{if(!currentBranch() && event.target.closest("a")){event.preventDefault();openBranchDialog(false);}});

for(const [id,target] of [['bookingAddService','services'],['bookingAddPackage','packages']])document.getElementById(id)?.addEventListener('click',()=>{if(bookingSubmitting)return;closeBooking();document.getElementById(target)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});const title=document.querySelector('#'+target+' h2');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}});
