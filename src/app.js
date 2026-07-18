import "./styles.css";
import { applyStaticTranslations, getLang, t, translations } from "./i18n.js";
import JsBarcode from "jsbarcode";
import { cancelCustomerBooking, createBooking, firebaseConfigured, getCatalog, getCustomerBooking, submitReview, trackEvent, validateCoupon } from "./firebase-client.js";
import { isVideoContent, videoSource } from "./media.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = {
  lang: getLang(),
  theme: localStorage.getItem("mz-theme") === "light" ? "light" : "dark",
  catalog: { branches: [], categories: [], services: [], packages: [], staff: [], offers: [], drinks: [], content: [], translations: [], reviews: [], settings: {} },
  cart: JSON.parse(localStorage.getItem("mz-cart") || "[]"),
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

const money = value => new Intl.NumberFormat(state.lang === "ar" ? "ar-EG" : "en-US", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(value || 0));
const localized = (item, key = "name") => item?.[`${key}${state.lang === "ar" ? "Ar" : "En"}`] || item?.[`${key}Ar`] || "";
const needsAppointment = () => cartItems().some(item => !["product", "inventory", "drink"].includes(item.kind));
const settings = () => state.catalog.settings || {};
const currentBranch = () => state.catalog.branches.find(item => item.id === state.branchId && item.active !== false) || null;
const availableAtBranch = item => !state.branchId || !Array.isArray(item?.branchIds) || !item.branchIds.length || item.branchIds.includes(state.branchId);
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
const socialIcons = {
  Facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4h-3c-3 0-5 2-5 5v2H6v4h3v9h4v-9h3l1-4h-4V9c0-1 .3-1 1-1Z"/></svg>',
  Instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>',
  TikTok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v11a4 4 0 1 1-4-4v4a1 1 0 1 0 1 1V3h3c.4 2 2 3.6 4 4v3c-1.5 0-2.9-.5-4-1.3V3Z"/></svg>',
  WhatsApp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.8a8 8 0 0 1-11.9 7L4 20l1.2-4A8 8 0 1 1 20 11.8Z"/><path d="M9 8c.5 3 2 4.5 5 5l1-1 2 1c0 2-1 3-3 3-4 0-7-3-7-7 0-2 1-3 2-3l1 2-1 0Z"/></svg>',
  Phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-4-1-1.5 2a15 15 0 0 1-9.5-9.5L8 7 7 3Z"/></svg>',
  Map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>'
};

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
  return state.cart.map(line => ({ ...index.get(line.id), qty: line.qty || 1, option: line.option || "" })).filter(item => item.id && availableAtBranch(item));
}

function subtotal() { return cartItems().reduce((sum, item) => sum + Number(item.price || item.newPrice || 0) * item.qty, 0); }
function discountAmount() { return Math.min(subtotal(), Number(state.coupon?.discountAmount || 0)); }
function total() { return Math.max(0, subtotal() - discountAmount()); }

function saveCart() {
  localStorage.setItem("mz-cart", JSON.stringify(state.cart));
  $$('[data-cart-count]').forEach(el => { el.textContent = String(state.cart.length); });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
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
  $("#themeToggle").textContent = theme === "dark" ? "☀" : "☾";
}

function setLanguage(lang) {
  state.lang = lang;
  localStorage.setItem("mz-lang", lang);
  applyStaticTranslations(lang);
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
  const offers = state.catalog.offers.filter(offer => availableAtBranch(offer) && offer.active !== false && offer.status !== "stopped" && (!offer.startAt || new Date(offer.startAt).getTime() <= now) && (!offer.endAt || new Date(offer.endAt).getTime() >= now));
  $("#offersGrid").innerHTML = offers.length ? offers.map(offer => {
    const price = Number(offer.newPrice ?? offer.price ?? 0);
    const old = Number(offer.oldPrice ?? offer.originalPrice ?? price);
    const percent = old > 0 ? Math.round((old - price) / old * 100) : 0;
    return `<article class="offer-card reveal">
      ${offer.imageUrl ? `<img src="${escapeAttr(offer.imageUrl)}" alt="${escapeAttr(localized(offer))}" loading="lazy" decoding="async" sizes="(max-width:560px) 88vw, 32vw">` : ""}
      <div class="offer-body"><span class="discount-badge">-${percent}%</span><h3>${escapeHtml(localized(offer))}</h3><p>${escapeHtml(localized(offer, "description"))}</p>
      <div class="price-row"><div><span class="old-price">${money(old)}</span><div class="price">${money(price)}</div></div>${offer.endAt && offer.showCountdown ? `<time data-countdown="${escapeAttr(offer.endAt)}"></time>` : ""}</div>
      <button class="btn btn-primary" data-add-id="${escapeAttr(offer.id)}" data-kind="offer">${t("addCart", state.lang)}</button></div>
    </article>`;
  }).join("") : `<div class="empty-state">${t("noOffers", state.lang)}</div>`;
  updateCountdowns();
}

function renderPackages() {
  $("#packageGrid").innerHTML = state.catalog.packages.filter(item => availableAtBranch(item) && item.active !== false && item.status !== "expired").map(item => {
    const badge = item.badge === "popular" ? t("featured", state.lang) : item.badge === "special" ? t("special", state.lang) : t("package", state.lang);
    return `<article class="package-card ${item.badge ? "highlight" : ""} reveal">
      <div class="package-cover"><img src="${escapeAttr(item.imageUrl || "/assets/package-premium.webp")}" alt="${escapeAttr(localized(item))}" loading="lazy" decoding="async" sizes="(max-width:560px) 88vw, 33vw"><span>${badge}</span></div>
      <div class="card-top"><span class="card-tag">♛ ${badge}</span><span class="duration">◷ ${item.duration} ${t("minute", state.lang)}</span></div>
      <h3>${escapeHtml(localized(item))}</h3><p>${escapeHtml(localized(item, "description"))}</p>
      <div class="price-row"><strong class="price">${money(item.price)}</strong></div>
      <button class="btn btn-primary" data-add-id="${escapeAttr(item.id)}" data-kind="package">${t("addCart", state.lang)}</button>
    </article>`;
  }).join("");
}

function renderServices() {
  const active = state.catalog.services.filter(item => availableAtBranch(item) && item.active !== false);
  $("#categoryFilters").innerHTML = `<button class="filter-chip ${state.category === "all" ? "active" : ""}" type="button" data-category="all" role="tab">${t("all", state.lang)}</button>` + state.catalog.categories.filter(cat => cat.active !== false && cat.id !== "packages" && active.some(item => item.categoryId === cat.id)).map(cat => `<button class="filter-chip ${state.category === cat.id ? "active" : ""}" type="button" data-category="${escapeAttr(cat.id)}" role="tab">${escapeHtml(localized(cat))}</button>`).join("");
  const visible = (state.category === "all" ? active : active.filter(item => item.categoryId === state.category)).slice(0, 6);
  const icons = { hair: "✂", beard: "♢", skin: "✦", extras: "+", wax: "◈", "beard-care": "♢", "hair-care": "✧", service: "▦", installation: "⌁", products: "▣", "facial-cleaning": "✦" };
  $("#serviceGrid").innerHTML = visible.map(item => `<article class="service-card reveal">
    <span class="service-icon" aria-hidden="true">${icons[item.categoryId] || "✂"}</span>
    <div class="service-meta"><span>${escapeHtml(categoryName(item.categoryId))}</span><span>◷ ${item.duration} ${t("minute", state.lang)}</span></div>
    <h3>${escapeHtml(localized(item))}</h3>
    <div class="price-row"><div>${item.startsFrom ? `<small>${t("from", state.lang)}</small>` : ""}<strong class="price">${money(item.price)}</strong></div>${item.type === "product" ? `<span class="type-pill">${t("product", state.lang)}</span>` : ""}</div>
    <button class="btn btn-ghost" data-add-id="${escapeAttr(item.id)}" data-kind="${item.type === "product" ? "product" : "service"}">${t("addCart", state.lang)}</button>
  </article>`).join("");
  observeReveals();
}

function renderTeam() {
  $("#teamGrid").innerHTML = state.catalog.staff.filter(item => availableAtBranch(item) && item.active !== false).slice(0, 6).map(item => `<article class="team-card reveal">
    <img class="team-photo" src="${escapeAttr(item.imageUrl || "/assets/el-mezaen-logo.jpeg")}" alt="${escapeAttr(localized(item))} – ${escapeAttr(localized(item, "specialty"))}" loading="lazy" decoding="async" width="220" height="220">
    <h3>${escapeHtml(localized(item))}</h3><p>${escapeHtml(localized(item, "specialty"))}</p>
    <span class="availability ${item.available === false ? "off" : ""}">${item.available === false ? t("unavailable", state.lang) : t("available", state.lang)}</span>
  </article>`).join("");
}

function renderContent() {
  const celebrities = state.catalog.content.filter(item => availableAtBranch(item) && item.active !== false && item.type === "celebrity");
  $("#celebrityGrid").innerHTML = celebrities.map(item => `<article class="content-card reveal"><img src="${escapeAttr(item.imageUrl)}" alt="${escapeAttr(localized(item, "title"))}" loading="lazy" decoding="async" sizes="(max-width:560px) 88vw, 32vw" width="640" height="480"><h3>${escapeHtml(localized(item, "title"))}</h3></article>`).join("");
  const gallery = state.catalog.content.filter(item => availableAtBranch(item) && item.active !== false && item.type === "gallery");
  const galleryItems = gallery.length ? gallery : [
    { imageUrl: "/assets/hero-barbershop-cyan.webp", titleAr: "من أعمال مزين مصر", titleEn: "El Mezaen Egypt Work" },
    { imageUrl: "/assets/celebrity-1.webp", titleAr: "صورة من معرض مزين مصر", titleEn: "El Mezaen Egypt Gallery" },
    { imageUrl: "/assets/celebrity-2.webp", titleAr: "لحظة مميزة في مزين مصر", titleEn: "A Special El Mezaen Moment" }
  ];
  $("#galleryGrid").innerHTML = galleryItems.slice(0, 8).map(item => `<img src="${escapeAttr(item.imageUrl)}" alt="${escapeAttr(localized(item, "title"))}" loading="lazy" decoding="async" sizes="(max-width:560px) 100vw, 50vw" width="640" height="480">`).join("");
  const news = state.catalog.content.filter(item => availableAtBranch(item) && item.active !== false && item.type === "news");
  $("#newsSection").hidden = news.length === 0;
  $("#newsGrid").innerHTML = news.map(item => `<article class="content-card news-card reveal">${renderNewsMedia(item)}<div class="news-card-body"><span class="content-branch-badge">${escapeHtml(contentBranchLabel(item))}</span><h3>${escapeHtml(localized(item, "title"))}</h3><p>${escapeHtml(localized(item, "body"))}</p>${item.linkUrl ? `<a class="btn btn-ghost" href="${escapeAttr(item.linkUrl)}" target="_blank" rel="noopener">${state.lang === "ar" ? "اقرأ المزيد" : "Read more"}</a>` : ""}</div></article>`).join("");
}

function renderReviews() {
  const published = (state.catalog.reviews || []).filter(item => item.active !== false);
  const reviews = [...published].sort((a, b) => Number(b.featured || 0) - Number(a.featured || 0) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 9);
  const average = published.length ? published.reduce((sum, item) => sum + Number(item.rating || 0), 0) / published.length : 0;
  $("#reviewAverage").textContent = published.length ? average.toFixed(1) : "—";
  $("#reviewAverageStars").textContent = published.length ? `${"★".repeat(Math.round(average))}${"☆".repeat(5 - Math.round(average))}` : "☆☆☆☆☆";
  $("#reviewCount").textContent = published.length ? `${published.length} تقييم منشور` : "لا توجد تقييمات منشورة بعد";
  $("#publishedReviews").innerHTML = reviews.map(item => `<article class="published-review panel ${item.featured ? "featured" : ""}"><header><div class="review-avatar">${escapeHtml(String(item.name || "ع").trim().charAt(0) || "ع")}</div><div><h3>${escapeHtml(item.name || "عميل مزين مصر")}</h3><span>${"★".repeat(Math.max(1, Math.min(5, Number(item.rating || 5))))}${"☆".repeat(5 - Math.max(1, Math.min(5, Number(item.rating || 5))))}</span></div>${item.verified ? '<b class="verified-review">✓ حجز موثّق</b>' : ""}</header><p>${escapeHtml(item.comment || "")}</p>${item.adminReply ? `<div class="review-reply"><b>رد مزين مصر</b><span>${escapeHtml(item.adminReply)}</span></div>` : ""}</article>`).join("");
}

function contentBranchLabel(item) {
  if (!item.branchIds?.length || item.branchIds.length > 1) return state.lang === "ar" ? "كل الفروع" : "All branches";
  const branch = state.catalog.branches.find(value => value.id === item.branchIds[0]);
  return branch ? branchName(branch) : item.branchIds[0];
}

function renderNewsMedia(item) {
  if (!isVideoContent(item)) return item.imageUrl ? `<img class="news-media" src="${escapeAttr(item.imageUrl)}" alt="${escapeAttr(localized(item, "title"))}" loading="lazy" decoding="async" sizes="(max-width:560px) 100vw, 33vw" width="640" height="480">` : "";
  const source = videoSource(item.videoUrl);
  const label = state.lang === "ar" ? "تشغيل الفيديو" : "Play video";
  if (source.kind === "external") return `<a class="news-video-trigger external" href="${escapeAttr(source.url)}" target="_blank" rel="noopener" aria-label="${label}">${item.imageUrl ? `<img src="${escapeAttr(item.imageUrl)}" alt="" loading="lazy">` : ""}<span class="video-play">▶</span><b>${label} ↗</b></a>`;
  if (!source.url) return item.imageUrl ? `<img class="news-media" src="${escapeAttr(item.imageUrl)}" alt="${escapeAttr(localized(item, "title"))}" loading="lazy">` : "";
  return `<button class="news-video-trigger" type="button" data-video-kind="${escapeAttr(source.kind)}" data-video-src="${escapeAttr(source.url)}" data-video-poster="${escapeAttr(item.imageUrl || "")}" aria-label="${label}">${item.imageUrl ? `<img src="${escapeAttr(item.imageUrl)}" alt="" loading="lazy">` : ""}<span class="video-play">▶</span><b>${label}</b></button>`;
}

function playNewsVideo(button) {
  const kind = button.dataset.videoKind;
  const src = button.dataset.videoSrc;
  const poster = button.dataset.videoPoster;
  if (!src) return;
  button.outerHTML = kind === "direct"
    ? `<video class="news-video-player" src="${escapeAttr(src)}" poster="${escapeAttr(poster)}" controls autoplay playsinline preload="metadata"></video>`
    : `<iframe class="news-video-player" src="${escapeAttr(src)}" title="فيديو الخبر" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
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
  const socialSource = branch || s;
  const links = [[socialSource.facebook || s.facebook, "Facebook"], [socialSource.instagram || s.instagram, "Instagram"], [socialSource.tiktok || s.tiktok, "TikTok"]];
  $("#socialLinks").innerHTML = links.filter(([url]) => url).map(([url, name]) => `<a class="social-${name.toLowerCase()}" href="${escapeAttr(url)}" target="_blank" rel="noopener" aria-label="${name}">${socialIcons[name]}</a>`).join("");
  if (branch) {
    $("#mobileCall").href = phoneHref(branch.phone);
    $("#mobileWhatsapp").href = `https://wa.me/${whatsappNumber(branch.whatsapp || branch.phone)}`;
    $("#mobileMap").href = branch.mapsUrl;
    $("#mobileQuickActions").classList.add("ready");
  } else {
    $("#mobileCall").href = $("#mobileWhatsapp").href = $("#mobileMap").href = "#contact";
    $("#mobileQuickActions").classList.remove("ready");
  }
  renderBranchPicker();
  renderBranchFooter();
}

function renderBranchPicker() {
  const branches = state.catalog.branches.filter(item => item.active !== false);
  $("#branchPicker").innerHTML = branches.map(branch => `<article class="branch-choice ${branch.id === state.branchId ? "selected" : ""}">
    <div class="branch-choice-top"><span class="branch-marker">⌖</span><div><small>${state.lang === "ar" ? "مزين مصر" : "El Mezaen Egypt"}</small><h3>${escapeHtml(branchName(branch))}</h3></div>${branch.id === state.branchId ? `<b class="selected-check">✓</b>` : ""}</div>
    <p>${escapeHtml(branchAddress(branch))}</p>
    <div class="branch-quick-info"><span>◷ ${escapeHtml(branch.openingTime || "11:00")} – ${escapeHtml(branch.closingTime || "23:00")}</span><span>☎ ${escapeHtml(branch.phone)}</span></div>
    <button class="btn btn-primary" type="button" data-select-branch="${escapeAttr(branch.id)}">${t("bookBranch", state.lang)}</button>
  </article>`).join("") || `<div class="empty-state">${state.lang === "ar" ? "لا توجد فروع متاحة حاليًا" : "No branches are currently available"}</div>`;
}

function renderBranchFooter() {
  $("#branchFooterGrid").innerHTML = state.catalog.branches.filter(item => item.active !== false).map(branch => {
    const wa = whatsappNumber(branch.whatsapp || branch.phone);
    const socials = [[branch.facebook, "Facebook"], [branch.instagram, "Instagram"], [branch.tiktok, "TikTok"]].filter(([url]) => url);
    return `<article class="footer-branch-card ${branch.id === state.branchId ? "selected" : ""}">
      <header><span class="branch-marker">⌖</span><div><small>${state.lang === "ar" ? "مزين مصر" : "El Mezaen Egypt"}</small><h3>${escapeHtml(branchName(branch))}</h3></div></header>
      <p>${escapeHtml(branchAddress(branch))}</p>
      <div class="branch-contact-numbers"><a href="${phoneHref(branch.phone)}">${socialIcons.Phone}<span>${escapeHtml(branch.phone)}</span></a>${branch.secondaryPhone ? `<a href="${phoneHref(branch.secondaryPhone)}">${socialIcons.Phone}<span>${escapeHtml(branch.secondaryPhone)}</span></a>` : ""}</div>
      <div class="contact-actions three"><a class="contact-action call" href="${phoneHref(branch.phone)}" aria-label="${t("callNow", state.lang)} ${escapeAttr(branchName(branch))}">${socialIcons.Phone}<span>${t("callNow", state.lang)}</span></a><a class="contact-action whatsapp" href="https://wa.me/${wa}" target="_blank" rel="noopener" aria-label="WhatsApp ${escapeAttr(branchName(branch))}">${socialIcons.WhatsApp}<span>${t("whatsappBranch", state.lang)}</span></a><a class="contact-action maps" href="${escapeAttr(branch.mapsUrl)}" target="_blank" rel="noopener" aria-label="${t("directions", state.lang)} ${escapeAttr(branchName(branch))}">${socialIcons.Map}<span>${t("directions", state.lang)}</span></a></div>
      <div class="branch-card-bottom"><div class="contact-socials">${socials.map(([url, name]) => `<a class="social-${name.toLowerCase()}" href="${escapeAttr(url)}" target="_blank" rel="noopener" aria-label="${name}">${socialIcons[name]}</a>`).join("")}</div><button type="button" data-book-branch="${escapeAttr(branch.id)}">${t("bookBranch", state.lang)}</button></div>
    </article>`;
  }).join("");
}

function renderAll() {
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
}

function addToCart(id, option = "") {
  const item = itemIndex().get(id);
  if (!item) return;
  const existing = state.cart.find(line => line.id === id);
  if (!existing) state.cart.push({ id, qty: 1, option: item.kind === "drink" ? option || item.drinkOptions?.[0] || "" : "" });
  else if (item.kind === "drink") { existing.qty = Math.min(Number(item.maxQty || 20), Number(existing.qty || 1) + 1); existing.option = option || existing.option || item.drinkOptions?.[0] || ""; }
  saveCart();
  trackEvent("add_to_cart", { item_id: id, branch_id: state.branchId || "unselected" });
  state.coupon = null;
  renderCart();
  updateSummary();
  showToast(t("added", state.lang));
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
  const drinks = (state.catalog.drinks || []).filter(item => item.active !== false && availableAtBranch(item) && Number(item.maxQty || 0) > 0);
  wrapper.hidden = !drinks.length;
  if (!drinks.length) { menu.hidden = true; return; }
  $("#drinkOptions").innerHTML = drinks.map(item => {
    const qty = state.cart.find(line => line.id === item.id)?.qty || 0;
    const options = Array.isArray(item.drinkOptions) ? item.drinkOptions : [];
    return `<article class="drink-option"><span class="drink-cup" aria-hidden="true">☕</span><div><b>${escapeHtml(localized(item))}</b><small>${money(item.price)}${qty ? ` • في الحجز: ${qty}` : ""}</small></div>${options.length ? `<label><span>التحضير</span><select data-drink-option="${escapeAttr(item.id)}">${options.map(option => `<option value="${escapeAttr(option)}">${escapeHtml(option)}</option>`).join("")}</select></label>` : ""}<button type="button" data-add-drink="${escapeAttr(item.id)}" aria-label="إضافة ${escapeAttr(localized(item))}">＋ إضافة • ${money(item.price)}</button></article>`;
  }).join("");
}

function removeFromCart(id) {
  state.cart = state.cart.filter(line => line.id !== id);
  state.coupon = null;
  saveCart();
  renderCart();
  updateSummary();
}

function renderCart() {
  const items = cartItems();
  $("#cartLines").innerHTML = items.length ? items.map(item => `<div class="cart-line"><div><b>${escapeHtml(localized(item))}</b><small>${item.kind === "drink" ? `مشروب • ${item.qty}${item.option ? ` • ${escapeHtml(item.option)}` : ""}` : `${item.duration ?? 0} ${t("minute", state.lang)}`}</small></div>${item.kind === "drink" ? `<div class="cart-qty"><button type="button" data-cart-qty="-1" data-cart-id="${escapeAttr(item.id)}">−</button><b>${item.qty}</b><button type="button" data-cart-qty="1" data-cart-id="${escapeAttr(item.id)}">＋</button></div>` : ""}<strong class="line-price">${money(Number(item.price || item.newPrice) * item.qty)}</strong><button class="remove-line" type="button" data-remove-id="${escapeAttr(item.id)}" aria-label="${t("remove", state.lang)}">×</button></div>`).join("") : `<div class="empty-state"><strong>${t("emptyCart", state.lang)}</strong><p>${t("cartHint", state.lang)}</p></div>`;
  saveCart();
  renderDrinks();
  updateProductOnlyUi();
}

function renderStaffPicker() {
  const any = `<button class="staff-choice ${state.staffId === "any" ? "selected" : ""}" type="button" data-staff-id="any"><b>${t("anyStaff", state.lang)}</b><small>${state.lang === "ar" ? "أقرب متخصص متاح" : "Nearest available specialist"}</small></button>`;
  $("#staffPicker").innerHTML = any + state.catalog.staff.filter(item => availableAtBranch(item) && item.active !== false).map(item => `<button class="staff-choice ${state.staffId === item.id ? "selected" : ""}" type="button" data-staff-id="${escapeAttr(item.id)}" ${item.available === false ? "disabled" : ""}><b>${escapeHtml(localized(item))}</b><small>${escapeHtml(localized(item, "specialty"))}</small></button>`).join("");
}

function updateProductOnlyUi() {
  const onlyProducts = state.cart.length > 0 && !needsAppointment();
  $("#productOnlyStaff").classList.toggle("show", onlyProducts);
  $("#productOnlyDate").classList.toggle("show", onlyProducts);
  $("#staffPicker").hidden = onlyProducts;
  $("#appointmentFields").hidden = onlyProducts;
  if (onlyProducts) { state.staffId = "any"; state.date = ""; state.time = ""; }
}

function updateSummary() {
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

async function refreshCatalog(silent = true) {
  try {
    const catalog = await getCatalog();
    state.catalog = { ...state.catalog, ...catalog };
    if (state.branchId && !state.catalog.branches.some(item => item.id === state.branchId && item.active !== false)) {
      state.branchId = "";
      localStorage.removeItem("mz-branch");
    }
    for (const entry of state.catalog.translations || []) {
      if (entry.key && entry.ar) translations.ar[entry.key] = entry.ar;
      if (entry.key && entry.en) translations.en[entry.key] = entry.en;
    }
    applyStaticTranslations(state.lang);
    renderAll();
    return true;
  } catch (error) {
    if (!silent) showToast(t("loadError", state.lang));
    console.error("Catalog refresh failed", error);
    return false;
  }
}

async function openBooking() {
  trackEvent("booking_started", { branch_id: state.branchId || "unselected", cart_size: state.cart.length });
  if (firebaseConfigured) await refreshCatalog(true);
  openBranchDialog(true);
}

function openBranchDialog(continueToBooking = false) {
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
  if (state.step === 5) resetBooking();
  $("#bookingDialog").showModal();
  document.body.style.overflow = "hidden";
  goToStep(1);
}

function selectBranch(id, continueToBooking = false) {
  const branch = state.catalog.branches.find(item => item.id === id && item.active !== false);
  if (!branch) { showToast(state.lang === "ar" ? "هذا الفرع غير متاح حاليًا" : "This branch is currently unavailable"); return; }
  const previousCount = state.cart.length;
  state.branchId = branch.id;
  localStorage.setItem("mz-branch", branch.id);
  trackEvent("branch_selected", { branch_id: branch.id });
  const index = itemIndex();
  state.cart = state.cart.filter(line => {
    const item = index.get(line.id);
    return item && (!item.branchIds?.length || item.branchIds.includes(branch.id));
  });
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
}

function closeBooking() {
  $("#bookingDialog").close();
  document.body.style.overflow = "";
  if (state.step === 5) resetBooking();
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
  state.step = Math.max(1, Math.min(5, step));
  $$('.booking-step').forEach(section => section.classList.toggle("active", Number(section.dataset.step) === state.step));
  $$('#bookingProgress li').forEach((item, index) => {
    item.classList.toggle("active", index + 1 === state.step);
    item.classList.toggle("done", index + 1 < state.step);
  });
  $("#dialogActions").hidden = state.step === 5;
  $("#bookingSummary").hidden = state.step === 5;
  $("#prevStep").style.visibility = state.step === 1 ? "hidden" : "visible";
  $("#nextStep").textContent = state.step === 4 ? t("createBooking", state.lang) : t("next", state.lang);
  updateProductOnlyUi();
  updateSummary();
}

function canAdvance() {
  if (!state.branchId || !currentBranch()) { showToast(t("chooseBranch", state.lang)); return false; }
  if (state.step === 1 && !state.cart.length) { showToast(t("cartHint", state.lang)); return false; }
  if (state.step === 3 && needsAppointment() && (!state.date || !state.time)) { showToast(t("required", state.lang)); return false; }
  return true;
}

async function nextStep() {
  if (!canAdvance()) return;
  if (state.step < 4) { goToStep(state.step + 1); return; }
  if (state.step === 4) await submitBooking();
}

function setDateBounds() {
  const now = new Date();
  const max = new Date(now);
  max.setDate(max.getDate() + 60);
  const iso = date => date.toISOString().slice(0, 10);
  $("#bookingDate").min = iso(now);
  $("#bookingDate").max = iso(max);
}

function renderTimes() {
  const select = $("#bookingTime");
  const schedule = currentBranch() || settings();
  const [openH, openM] = String(schedule.openingTime || "11:00").split(":").map(Number);
  const [closeH, closeM] = String(schedule.closingTime || "23:00").split(":").map(Number);
  const step = Math.max(5, Number(schedule.slotMinutes || 15));
  const duration = Math.max(0, cartItems().filter(item => !["product", "inventory", "drink"].includes(item.kind)).reduce((sum, item) => sum + Number(item.duration || 0), 0));
  const selectedDate = $("#bookingDate").value;
  const now = new Date();
  const options = [];
  for (let mins = openH * 60 + openM; mins + duration <= closeH * 60 + closeM; mins += step) {
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    const value = `${h}:${m}`;
    const candidate = new Date(`${selectedDate}T${value}:00`);
    if (!selectedDate || candidate.getTime() <= now.getTime()) continue;
    options.push(`<option value="${value}">${new Intl.DateTimeFormat(state.lang === "ar" ? "ar-EG" : "en-US", { hour: "numeric", minute: "2-digit" }).format(candidate)}</option>`);
  }
  select.innerHTML = `<option value="">—</option>${options.join("")}`;
  state.time = "";
  updateSummary();
}

async function applyCouponCode() {
  const code = $("#couponCode").value.trim();
  if (!code) return;
  const button = $("#applyCoupon");
  button.disabled = true;
  button.textContent = t("applying", state.lang);
  try {
    const itemIds = cartItems().filter(item => !["inventory", "drink"].includes(item.kind)).map(item => item.id);
    if (!itemIds.length) throw new Error("no-discountable-items");
    const result = await validateCoupon({ code, branchId: state.branchId, subtotal: subtotal(), phone: $("#customerPhone").value.trim(), itemIds });
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

async function submitBooking() {
  if (navigator.onLine === false) { updateNetworkStatus(); showToast("اتصل بالإنترنت لتأكيد الحجز؛ اختياراتك محفوظة"); return; }
  const form = $("#customerForm");
  if (!form.reportValidity()) { showToast(t("required", state.lang)); return; }
  const button = $("#nextStep");
  button.disabled = true;
  button.textContent = t("creating", state.lang);
  const customer = {
    firstName: $("#firstName").value.trim(),
    lastName: $("#lastName").value.trim(),
    phone: $("#customerPhone").value.trim(),
    note: $("#customerNote").value.trim()
  };
  try {
    const result = await createBooking({
      branchId: state.branchId,
      items: cartItems().map(item => ({ id: item.id, kind: item.kind, qty: item.qty, option: item.option || "" })),
      staffId: state.staffId,
      bookingDate: state.date || null,
      bookingTime: state.time || null,
      customer,
      partySize: Number($("#partySize").value || 1),
      couponCode: state.coupon?.code || $("#couponCode").value.trim() || null,
      locale: state.lang,
      clientRequestId: sessionStorage.getItem("mz-booking-request-id") || (() => { const id = crypto.randomUUID(); sessionStorage.setItem("mz-booking-request-id", id); return id; })()
    });
    $("#successCode").textContent = result.bookingCode;
    JsBarcode("#successBarcode", result.bookingCode, { format: "CODE128", displayValue: false, height: 58, margin: 4, background: "transparent", lineColor: "#19d4e6" });
    state.completedPreview = Boolean(result.preview);
    $("#previewNotice").classList.toggle("show", state.completedPreview);
    const branch = currentBranch();
    $("#successBranch").textContent = branchName(branch);
    $("#successAppointment").textContent = state.date && state.time ? `${state.date} • ${state.time}` : (state.lang === "ar" ? "طلب منتجات" : "Product order");
    const phone = whatsappNumber(branch?.whatsapp || branch?.phone);
    const message = state.lang === "ar" ? `مرحبًا، أنشأت حجزًا لدى مزين مصر – ${branchName(branch)}. كود الحجز: ${result.bookingCode}` : `Hello, I created a booking at El Mezaen Egypt – ${branchName(branch)}. Booking code: ${result.bookingCode}`;
    $("#successWhatsapp").href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    trackEvent("booking_completed", { branch_id: state.branchId, value: Number(result.total || 0), currency: "EGP" });
    state.cart = [];
    sessionStorage.removeItem("mz-booking-request-id");
    saveCart();
    renderCart();
    goToStep(5);
  } catch (error) {
    console.error("Booking failed", error);
    showToast(error?.message || t("loadError", state.lang));
  } finally {
    button.disabled = false;
    button.textContent = t("createBooking", state.lang);
  }
}

$("#reviewForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await submitReview(Object.fromEntries(new FormData(event.currentTarget)));
    event.currentTarget.reset();
    showToast(state.lang === "ar" ? "شكرًا! تم إرسال تقييمك للمراجعة" : "Thank you! Your review was submitted");
  } catch (error) { showToast(error.message || "تعذر إرسال التقييم"); }
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

async function cancelManagedBooking() {
  if (!state.manageCredentials || !state.managedBooking?.canCancel || !confirm("هل تريد إلغاء الحجز؟")) return;
  try {
    await cancelCustomerBooking(state.manageCredentials);
    state.managedBooking = { ...state.managedBooking, status: "cancelled", canCancel: false };
    renderManagedBooking();
    showToast("تم إلغاء الحجز بنجاح");
    trackEvent("booking_cancelled", { branch_id: state.managedBooking.branchId || "unknown" });
  } catch (error) { showToast(error.message || "تعذر إلغاء الحجز"); }
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

let observer;
function observeReveals() {
  if (!('IntersectionObserver' in window)) { $$('.reveal').forEach(el => el.classList.add("visible")); return; }
  observer ||= new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add("visible"); observer.unobserve(entry.target); } }), { rootMargin: "0px 0px -8%", threshold: .08 });
  $$('.reveal:not(.visible)').forEach(el => observer.observe(el));
}

document.addEventListener("click", event => {
  const video = event.target.closest("[data-video-src]");
  if (video) playNewsVideo(video);
  if (event.target.closest("[data-cancel-customer-booking]")) cancelManagedBooking();
  const add = event.target.closest("[data-add-id]");
  if (add) addToCart(add.dataset.addId);
  const drink = event.target.closest("[data-add-drink]");
  if (drink) addToCart(drink.dataset.addDrink, document.querySelector(`[data-drink-option="${CSS.escape(drink.dataset.addDrink)}"]`)?.value || "");
  const remove = event.target.closest("[data-remove-id]");
  if (remove) removeFromCart(remove.dataset.removeId);
  const quantity = event.target.closest("[data-cart-qty]");
  if (quantity) changeCartQty(quantity.dataset.cartId, Number(quantity.dataset.cartQty || 0));
  const filter = event.target.closest("[data-category]");
  if (filter) { state.category = filter.dataset.category; renderServices(); }
  const staff = event.target.closest("[data-staff-id]");
  if (staff) { state.staffId = staff.dataset.staffId; renderStaffPicker(); updateSummary(); }
  const select = event.target.closest("[data-select-branch]");
  if (select) selectBranch(select.dataset.selectBranch, $("#branchDialog").dataset.continueBooking === "true");
  const directBranch = event.target.closest("[data-book-branch]");
  if (directBranch) selectBranch(directBranch.dataset.bookBranch, true);
  if (event.target.closest("[data-open-booking]")) openBooking();
  if (event.target.closest("[data-open-branch]")) openBranchDialog(false);
  if (event.target.closest("[data-change-branch]")) openBranchDialog(true);
  if (event.target.closest("[data-close-booking]")) closeBooking();
  if (event.target.closest("[data-close-branch]")) closeBranchDialog();
});

$("#langToggle").addEventListener("click", () => setLanguage(state.lang === "ar" ? "en" : "ar"));
$("#themeToggle").addEventListener("click", () => setTheme(state.theme === "dark" ? "light" : "dark"));
$("#menuToggle").addEventListener("click", () => {
  const open = $("#navLinks").classList.toggle("open");
  $("#menuToggle").setAttribute("aria-expanded", String(open));
});
$("#navLinks").addEventListener("click", () => { $("#navLinks").classList.remove("open"); $("#menuToggle").setAttribute("aria-expanded", "false"); });
$("#nextStep").addEventListener("click", nextStep);
$("#prevStep").addEventListener("click", () => goToStep(state.step - 1));
$("#applyCoupon").addEventListener("click", applyCouponCode);
$("#drinkUpsellToggle").addEventListener("click", () => {
  const menu = $("#drinkMenu");
  const open = menu.hidden;
  menu.hidden = !open;
  $("#drinkUpsellToggle").setAttribute("aria-expanded", String(open));
});
$("#bookingDate").addEventListener("change", event => { state.date = event.target.value; renderTimes(); updateSummary(); });
$("#bookingTime").addEventListener("change", event => { state.time = event.target.value; updateSummary(); });
$("#bookingDialog").addEventListener("click", event => { if (event.target === $("#bookingDialog")) closeBooking(); });
$("#bookingDialog").addEventListener("close", () => { document.body.style.overflow = ""; });
$("#branchDialog").addEventListener("click", event => { if (event.target === $("#branchDialog")) closeBranchDialog(); });
$("#branchDialog").addEventListener("close", () => { if (!$("#bookingDialog").open) document.body.style.overflow = ""; });

async function init() {
  setTheme(state.theme);
  applyStaticTranslations(state.lang);
  $("#langToggle").textContent = state.lang === "ar" ? "EN" : "ع";
  setDateBounds();
  const siteUrl = globalThis.__SITE_URL__ || $("#canonical").href || location.origin;
  $("#canonical").href = siteUrl;
  await refreshCatalog(false);
  updateNetworkStatus();
  saveCart();
  observeReveals();
  if ('serviceWorker' in navigator && location.protocol !== "http:") navigator.serviceWorker.register("/sw.js").catch(error => console.warn("Service worker registration failed", error));
  if (firebaseConfigured) {
    setInterval(() => { if (!document.hidden) refreshCatalog(true); }, 300000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshCatalog(true); });
  }
  if (!firebaseConfigured) document.documentElement.dataset.preview = "true";
}

window.addEventListener("offline", () => updateNetworkStatus());
window.addEventListener("online", () => updateNetworkStatus(true));

init();
