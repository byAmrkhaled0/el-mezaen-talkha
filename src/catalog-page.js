import {publicTeamCard,mountTeamPhotoFallback} from './public-team-card.js';
import {mountEditorialViewer} from './editorial-viewer.js';
import {sharedEditorial,editorialOrigin} from './public-editorial.js';
import {publicDataStatus,publicStatusText} from './public-status.js';
import './global-navigation.js';
import {controlIcon} from './public-controls.js';
import {serviceMedia, packageMedia, packageResponsiveMedia} from "./premium-media.js";
import { safeMediaUrl, videoSource } from "./media.js";
import { deferredVideoMarkup, mountDeferredVideos } from "./deferred-video.js";
import "./styles.css";
import "./premium-components.css";
import { getLang } from "./i18n.js";
import { getCatalog } from "./firebase-client.js";
import { bindSafeBack } from "./navigation.js";
import { availableAtBranch as itemAvailableAtBranch, hasBranchScope } from "./branch-availability.js";
import { activeBranch, publicSubset, reconcileBranchCart, packageEligible } from "./public-branch.js";

const $ = selector => document.querySelector(selector);
const page = document.body.dataset.page;
let lang = getLang();
let catalog = { branches: [], services: [], packages: [], staff: [], categories: [] };
let category = "all";
let catalogError = null;
let catalogLoading = false;
let branchId = localStorage.getItem("mz-branch") || "";
const localized = (item, key = "name") => item?.[`${key}${lang === "ar" ? "Ar" : "En"}`] || item?.[`${key}Ar`] || "";
const escapeHtml = value => { const node = document.createElement("div"); node.textContent = value ?? ""; return node.innerHTML.replaceAll('"', "&quot;").replaceAll("'", "&#39;"); };
const money = value => new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(value || 0));
const availableAtBranch = item => itemAvailableAtBranch(item, branchId);
const staffAvailableAtBranch = item => Boolean(branchId && Array.isArray(item.branchIds) && item.branchIds.includes(branchId));
const dedupeCatalogCards = items => {
  const seen = new Set();
  return items.filter(item => {
    const key = [String(item.nameAr || "").trim().replace(/^ال/, ""), item.categoryId || "", Number(item.price || 0), Number(item.duration || 0), ...(item.branchIds || []).slice().sort()].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const serviceIconSvg = categoryId => {
  const icons = {
    hair: '<circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="m8.5 8.5 11-5M8.5 15.5l11 5M10 12h10"/>',
    beard: '<path d="M7 4c1.5-1.3 8.5-1.3 10 0v6c0 5-2.2 9-5 10-2.8-1-5-5-5-10V4Z"/><path d="M9 9h.01M15 9h.01M9 14c2 1.5 4 1.5 6 0"/>',
    skin: '<path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/>',
    wax: '<path d="M12 3S6 10 6 15a6 6 0 0 0 12 0c0-5-6-12-6-12Z"/><path d="M9 16a3 3 0 0 0 3 3"/>',
    products: '<path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'
  };
  const aliases = { "beard-care": "beard", "facial-cleaning": "skin" };
  return `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[categoryId] || icons[aliases[categoryId]] || icons.hair}</svg>`;
};
const clockIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const themeIcon = theme => theme === "dark"
  ? '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"/></svg>'
  : '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.7 6.7 0 0 0 21 12.8Z"/></svg>';
bindSafeBack();

function addCart(id) {
  const item = [...(catalog.services || []), ...(catalog.packages || [])].find(value => value.id === id);
  if (catalog.cached || catalog.offline) return;
  if (catalog.packages.some(row => row.id === id) && !packageEligible(item, catalog, branchId)) return;
  if (!item || item.active === false || item.catalogVisible === false || item.available === false || item.published === false || ["draft", "unpublished", "expired", "stopped"].includes(item.status) || (item.startAt && (Number.isNaN(Date.parse(item.startAt)) || new Date(item.startAt).getTime() > Date.now())) || (item.endAt && (Number.isNaN(Date.parse(item.endAt)) || new Date(item.endAt).getTime() < Date.now()))) return;
  let autoSelectedBranch = null;
  if (!branchId && Array.isArray(item.branchIds) && item.branchIds.length === 1) {
    autoSelectedBranch = (catalog.branches || []).find(branch => branch.id === item.branchIds[0] && branch.active !== false) || null;
    if (!autoSelectedBranch) {
      $("#pageToast").textContent = lang === "ar" ? "الفرع الخاص بهذا العنصر غير متاح حاليًا" : "The branch for this item is currently unavailable";
      $("#pageToast").classList.add("show"); setTimeout(() => $("#pageToast").classList.remove("show"), 1800);
      return;
    }
    let priorCart = []; try { priorCart = JSON.parse(localStorage.getItem('mz-cart') || '[]'); } catch {}
    const correction = reconcileBranchCart(priorCart, catalog, autoSelectedBranch.id);
    if (correction.removed && !confirm(lang === 'ar' ? `اختيار الفرع سيحذف ${correction.removed} عناصر غير متاحة. نكمل؟` : `Selecting this branch removes ${correction.removed} incompatible items. Continue?`)) return;
    if (correction.removed) localStorage.setItem('mz-cart', JSON.stringify(correction.kept)); window.dispatchEvent(new CustomEvent("mz:cart"));
    branchId = autoSelectedBranch.id;
    localStorage.setItem("mz-branch", branchId);window.dispatchEvent(new CustomEvent("mz:branch"));
    document.querySelector(".brand small").textContent = localized(autoSelectedBranch);
  }
  if (!hasBranchScope(item) || (branchId && !itemAvailableAtBranch(item, branchId))) {
    $("#pageToast").textContent = lang === "ar" ? "العنصر غير متاح في الفرع المختار" : "Unavailable at this branch";
    $("#pageToast").classList.add("show"); setTimeout(() => $("#pageToast").classList.remove("show"), 1800);
    return;
  }
  let cart;
  try { const saved = JSON.parse(localStorage.getItem("mz-cart") || "[]"); cart = Array.isArray(saved) ? saved : []; }
  catch { cart = []; }
  if (autoSelectedBranch) {
    const index = new Map([...catalog.services, ...catalog.packages, ...(catalog.drinks || []).map(value => ({ ...value, kind: "drink" }))].map(value => [value.id, value]));
    cart = cart.filter(line => { const existing = index.get(line.id); return itemAvailableAtBranch(existing, branchId, existing?.kind === "drink"); });
  }
  if (!cart.some(line => line.id === id)) cart.push({ id, qty: 1 });
  localStorage.setItem("mz-cart", JSON.stringify(cart)); window.dispatchEvent(new CustomEvent("mz:cart"));
  if (["packages", "services"].includes(page)) { location.href = "/?book=1"; return; }
    if (autoSelectedBranch) render();
  $("#pageToast").textContent = autoSelectedBranch ? (lang === "ar" ? `تم اختيار ${localized(autoSelectedBranch)} وإضافة العنصر للسلة` : `${localized(autoSelectedBranch)} selected and item added`) : (lang === "ar" ? "تمت الإضافة للسلة" : "Added to cart");
  $("#pageToast").classList.add("show"); setTimeout(() => $("#pageToast").classList.remove("show"), 1800);
}

function renderPackages() {
  const query = $("#catalogSearch").value.trim().toLowerCase();
  const items = publicSubset(catalog.packages, branchId, { dated: true }).filter(item => !query || `${item.nameAr || ""} ${item.nameEn || ""}`.toLowerCase().includes(query));
  $("#catalogFilters").innerHTML = "";
  $("#catalogGrid").innerHTML = items.map((item, index) => {
    const media = packageResponsiveMedia(item);
    const oldPrice = Number(item.originalPrice || item.oldPrice || item.price || 0);
    const included = lang === "ar" ? item.includedItemsAr : item.includedItemsEn || item.includedItemsAr;
    const branch = (catalog.branches || []).find(value => item.branchIds?.length === 1 && value.id === item.branchIds[0]);
    return `<article class="package-card"><div class="package-cover">${media.src ? `<img src="${escapeHtml(media.src)}" ${media.srcset ? `srcset="${escapeHtml(media.srcset)}" sizes="(max-width:560px) calc(100vw - 60px), (max-width:1000px) 45vw, 23vw"` : ""} alt="${escapeHtml(localized(item))}" loading="${index===0?'eager':'lazy'}" fetchpriority="${index===0?'high':'low'}" decoding="async" width="640" height="427">` : `<div class="package-media-placeholder"><img src="/assets/el-mezaen-mark-v2.webp" alt="" loading="lazy" width="90" height="106"></div>`}<span>${lang === "ar" ? "باقة" : "Package"}</span></div>${branch ? `<span class="package-branch"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>${lang === "ar" ? "متاح في " : "Available at "}${escapeHtml(localized(branch))}</span>` : ""}<h3>${escapeHtml(localized(item))}</h3><p>${escapeHtml(localized(item, "description"))}</p><div class="price-row package-price"><div>${oldPrice > Number(item.newPrice ?? item.price ?? 0) ? `<del class="old-price">${money(oldPrice)}</del>` : ""}<strong class="price">${money(item.newPrice ?? item.price)}</strong></div>${oldPrice > Number(item.newPrice ?? item.price ?? 0) ? `<span class="package-saving">${lang === "ar" ? "وفر" : "Save"} ${money(oldPrice - Number(item.newPrice ?? item.price ?? 0))} • ${Math.round((oldPrice - Number(item.newPrice ?? item.price ?? 0)) / oldPrice * 100)}%</span>` : ""}</div><small>${Number(item.duration || 0)} ${lang === "ar" ? "دقيقة" : "min"}</small><details class="package-inline-details"><summary>${lang === "ar" ? "تفاصيل الباقة" : "Package details"}</summary>${Array.isArray(included) && included.length ? `<ul class="package-services">${included.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : ""}${(item.choiceGroups || []).map(group => `<p class="package-choice-summary"><b>${escapeHtml(lang === "ar" ? group.labelAr : group.labelEn || group.labelAr)}:</b> ${(group.options || []).map(option => escapeHtml(lang === "ar" ? option.labelAr : option.labelEn || option.labelAr)).join(" / ")}</p>`).join("")}${localized(item, "terms") ? `<p class="package-terms">${escapeHtml(localized(item, "terms"))}</p>` : ""}</details><button class="btn btn-primary" type="button" data-add="${escapeHtml(item.id)}" ${(!packageEligible(item,catalog,branchId) || catalog.cached || catalog.offline)?'disabled aria-disabled="true"':''}>${(!packageEligible(item,catalog,branchId) || catalog.cached || catalog.offline)?(lang==='ar'?'غير متاحة حاليًا':'Currently unavailable'):lang === "ar" ? "احجز الباقة" : "Book package"}</button></article>`;
  }).join("") || `<div class="empty-state">${lang === "ar" ? "لا توجد باقات مطابقة" : "No matching packages"}</div>`;
  $("#resultCount").textContent = `${items.length} ${lang === "ar" ? "باقة" : "packages"}`;
}

function renderServices() {
  const query = $("#catalogSearch").value.trim().toLowerCase();
  const categories = new Map(catalog.categories.map(item => [item.id, localized(item)]));
  const branchItems = publicSubset(catalog.services, branchId);
  const items = dedupeCatalogCards(branchItems.filter(item => (category === "all" || item.categoryId === category) && (!query || `${item.nameAr} ${item.nameEn}`.toLowerCase().includes(query))));
  $("#catalogFilters").innerHTML = `<button class="filter-chip ${category === "all" ? "active" : ""}" data-category="all">${lang === "ar" ? "الكل" : "All"}</button>` + catalog.categories.filter(cat => cat.active !== false && branchItems.some(item => item.categoryId === cat.id)).map(cat => `<button class="filter-chip ${category === cat.id ? "active" : ""}" data-category="${escapeHtml(cat.id)}">${escapeHtml(localized(cat))}</button>`).join("");
  $("#catalogGrid").innerHTML = items.map(item => `<article class="service-card compact-service"><img class="service-image" src="${escapeHtml(serviceMedia(item))}" alt="${escapeHtml(localized(item))}" width="300" height="240" loading="lazy" decoding="async"><div class="service-meta"><span>${escapeHtml(categories.get(item.categoryId) || "")}</span>${Number(item.duration)>0?`<span>${clockIcon} ${Number(item.duration)} ${lang === "ar" ? "دقيقة" : "min"}</span>`:""}</div><h3>${escapeHtml(localized(item))}</h3><div class="price-row"><div>${item.startsFrom ? `<small>${lang === "ar" ? "يبدأ من" : "From"}</small>` : ""}<strong class="price">${money(item.newPrice ?? item.price)}</strong></div></div>${localized(item,"description")?`<p class="service-description">${escapeHtml(localized(item,"description"))}</p>`:""}<button class="btn btn-primary" data-add="${escapeHtml(item.id)}" ${(catalog.cached || catalog.offline)?'disabled aria-disabled="true"':''}>${lang === "ar" ? "احجز الآن" : "Book now"}</button></article>`).join("") || `<div class="empty-state">${lang === "ar" ? "لا توجد نتائج" : "No results"}</div>`;
  $("#resultCount").textContent = `${items.length} ${lang === "ar" ? "خدمة ومنتج" : "services and products"}`;
}

function renderTeam() {
  const query = $("#catalogSearch").value.trim().toLowerCase();
  const items = publicSubset(catalog.staff, branchId, { includeUnavailable: true }).filter(item => (!query || `${item.nameAr} ${item.nameEn} ${item.specialtyAr} ${item.specialtyEn}`.toLowerCase().includes(query)));
  $("#catalogGrid").innerHTML = items.map(item=>publicTeamCard(item,{lang,canBook:!catalog.cached&&!catalog.offline})).join("") || `<div class="empty-state" role="status"><strong>${query?(lang==='ar'?'مفيش نتيجة مطابقة للبحث':'No team members match your search'):(lang==='ar'?'لا يوجد فريق منشور في الفرع حاليًا':'No published team at this branch yet')}</strong>${query?`<p>${lang==='ar'?'جرّب اسمًا أو تخصصًا مختلفًا.':'Try another name or specialty.'}</p><button class="btn btn-ghost" type="button" data-clear-catalog-search>${lang==='ar'?'عرض كل الفريق':'Show the whole team'}</button>`:''}</div>`;
  mountTeamPhotoFallback($("#catalogGrid"),lang);
  $("#resultCount").textContent = `${items.length} ${lang === "ar" ? "عضو فريق" : "team members"}`;
}

function renderEditorial() {
  const type = { gallery: "gallery", news: "news", celebrities: "celebrity" }[page];
  const query = $("#catalogSearch").value.trim().toLowerCase();
  const items = (["gallery","celebrities"].includes(page)?sharedEditorial(catalog.content,type,branchId):publicSubset(catalog.content, branchId))
    .filter(item => item.type === type && (!item.status || item.status === "published"))
    .filter(item => !query || `${localized(item, "title")} ${localized(item, "body")}`.toLowerCase().includes(query))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
  $("#catalogFilters")?.replaceChildren();
  $("#catalogGrid").innerHTML = items.map(item => {
    const title = escapeHtml(localized(item, "title"));
    const src = safeMediaUrl(item.imageUrl);
    const video = videoSource(item.videoUrl);
    const media = video.kind === "direct" ? deferredVideoMarkup(item)
      : video.url ? `<a class="gallery-video-link" href="${escapeHtml(safeMediaUrl(item.videoUrl))}" target="_blank" rel="noopener noreferrer">${src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" width="640" height="480">` : ""}<span>${lang === "ar" ? "مشاهدة الفيديو" : "Watch video"}: ${title}</span></a>`
      : src ? `<a href="${escapeHtml(src)}" target="_blank" rel="noopener noreferrer" data-editorial-image aria-label="${lang === "ar" ? "فتح صورة: " : "Open image: "}${title}"><img src="${escapeHtml(src)}" alt="${title}" loading="lazy" decoding="async" width="640" height="480"></a>` : "";
    const link = safeMediaUrl(item.linkUrl);
    return `<article class="content-card news-card">${media}<div class="news-card-body"><small>${escapeHtml(editorialOrigin(item,lang))}</small><h2>${title}</h2><p>${escapeHtml(localized(item, "body"))}</p>${link ? `<a class="btn btn-ghost" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${lang === "ar" ? "اقرأ المزيد" : "Read more"}</a>` : ""}</div></article>`;
  }).join("") || `<p class="empty-state" role="status">${catalog.cached || catalog.offline ? (lang === "ar" ? "لا توجد وسائط مطابقة في النسخة المحفوظة. أعد الاتصال للتحقق من المحتوى الحالي." : "No matching media in the saved copy. Reconnect to check current content.") : query ? (lang === "ar" ? "لا توجد نتائج مطابقة للبحث." : "No results match your search.") : (lang === "ar" ? "لا يوجد محتوى منشور مطابق حاليًا." : "No published content matches this view yet.")}</p>`;
  $("#resultCount").textContent = `${items.length} ${lang === "ar" ? "منشور" : "posts"}`;
  mountDeferredVideos($("#catalogGrid"));
  mountEditorialViewer($("#catalogGrid"),lang);
}

function renderCacheNotice() {
  let notice = document.querySelector("#catalogCacheNotice");
  if (!notice) {
    notice = document.createElement("p");
    notice.id = "catalogCacheNotice";
    notice.className = "catalog-cache-notice";
    notice.setAttribute("role", "status");
    $("#catalogGrid").before(notice);
  }
  notice.hidden = !catalog.cached;
  notice.textContent = (catalog.cachedAt ? `${Math.max(0, Math.floor((Date.now()-catalog.cachedAt)/60000))} ${lang === "ar" ? "دقيقة منذ الحفظ — " : "minutes since saved — "}` : "") + (lang === "ar" ? "نعرض آخر نسخة محفوظة؛ يتأكد التوفر والسعر عند الحجز." : "Showing the last saved catalog; availability and price are checked at booking.");
}

function render() {
  if (catalogLoading || catalogError) return;
  renderCacheNotice();
  headerBranch.setAttribute("aria-label", `${lang === "ar" ? "تغيير الفرع" : "Change branch"}: ${localized(activeBranch(catalog,branchId)) || (lang === "ar" ? "اختر الفرع" : "Choose branch")}`);
  document.querySelectorAll("[data-current-branch]").forEach(el => { el.textContent = localized(activeBranch(catalog, branchId)) || (lang === "ar" ? "اختر الفرع" : "Choose branch"); });
  if (!["gallery","celebrities"].includes(page) && !activeBranch(catalog, branchId)) {
    $("#catalogGrid").innerHTML = `<div class="empty-state"><strong>${lang === 'ar' ? 'اختار فرعك لعرض المتاح ليك' : 'Choose a branch to see available items'}</strong><p>${lang === 'ar' ? 'الخدمات والأسعار والفريق بتظهر حسب الفرع.' : 'Services, prices and team depend on your branch.'}</p></div>`;
    $("#catalogFilters")?.replaceChildren();
    $("#resultCount").textContent = "";
    return;
  }
  page === "services" ? renderServices() : page === "packages" ? renderPackages() : page === "team" ? renderTeam() : renderEditorial();
}

const branchDialog = document.createElement("dialog");
branchDialog.id = "catalogBranchDialog";
branchDialog.className = "catalog-branch-dialog";
branchDialog.innerHTML = `<div class="catalog-branch-shell"><header><div><small>EL MEZAEN</small><h2>${lang === "ar" ? "اختار فرعك" : "Choose your branch"}</h2></div><button type="button" data-close-catalog-branch aria-label="${lang === "ar" ? "إغلاق" : "Close"}">${controlIcon('close')}</button></header><p>${lang === "ar" ? "هتشوف الخدمات والباقات والفريق المتاحين في الفرع اللي تختاره." : "Explore services, packages and the team available at your chosen branch."}</p><div class="catalog-branch-options"></div></div>`;
document.body.append(branchDialog);
const headerBranch = document.createElement("button");
headerBranch.type = "button";
headerBranch.className = "branch-switch catalog-branch-switch";
headerBranch.dataset.openCatalogBranch = "";
headerBranch.innerHTML = controlIcon('map') + `<b data-current-branch>${lang === 'ar' ? 'اختر الفرع' : 'Choose branch'}</b>`;
document.querySelector("#branchSwitch").replaceWith(headerBranch);headerBranch.id="branchSwitch";
function openBranchDialog() {
  if (!catalog.branches.some(item => activeBranch(catalog,item.id))) { void loadCatalogPage(); return; }
  branchDialog.querySelector(".catalog-branch-options").innerHTML = catalog.branches.filter(item => activeBranch(catalog,item.id)).map(item => `<button type="button" data-set-branch="${escapeHtml(item.id)}"><strong>${escapeHtml(localized(item))}</strong><span>${escapeHtml(lang === "ar" ? item.addressAr : item.addressEn || item.addressAr)}</span><small>${escapeHtml(item.openingTime || "—")} – ${escapeHtml(item.closingTime || "—")} · ${escapeHtml(item.phone || "")}</small></button>`).join("") || `<p>${lang === 'ar' ? 'تعذر تحميل الفروع. أعد المحاولة.' : 'Unable to load branches. Please retry.'}</p>`;
  if (!branchDialog.open) branchDialog.showModal();
}
function setBranch(id) {
  if (!activeBranch(catalog, id)) return;
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem("mz-cart") || "[]"); } catch {}
  const { kept, removed } = reconcileBranchCart(cart, catalog, id);
  if (branchId !== id && removed && !confirm(lang === "ar" ? `تغيير الفرع سيحذف ${removed} من العناصر غير المتاحة هنا. هل تريد المتابعة؟` : `Changing branch removes ${removed} incompatible cart items. Continue?`)) return;
  sessionStorage.removeItem("mz-staff-booking");
  sessionStorage.removeItem("mz-entry-item");
  branchId = id;
  localStorage.setItem("mz-branch", id); window.dispatchEvent(new CustomEvent("mz:branch"));
  if (removed) { localStorage.setItem("mz-cart", JSON.stringify(kept)); window.dispatchEvent(new CustomEvent("mz:cart")); $("#pageToast").textContent = lang === "ar" ? "تم حذف العناصر غير المتاحة في الفرع الجديد" : "Incompatible items removed from the cart"; $("#pageToast").classList.add("show"); setTimeout(() => $("#pageToast").classList.remove("show"), 2500); }
  document.querySelector(".brand small").textContent = localized(activeBranch(catalog, id));
  category = "all";
  branchDialog.close();
  render();
}
document.addEventListener("click", event => {
  if (event.target.closest("[data-retry-page]")) { void loadCatalogPage(); return; }
  if(event.target.closest("[data-clear-catalog-search]")){ $("#catalogSearch").value=""; render(); $("#catalogSearch").focus(); return; }
  const filter = event.target.closest("[data-category]");
  if (filter) { category = filter.dataset.category; render(); }
  if (event.target.closest("[data-open-catalog-branch]")) openBranchDialog();
  if (event.target.closest("[data-close-catalog-branch]")) branchDialog.close();
  const branchButton = event.target.closest("[data-set-branch]");
  if (branchButton) setBranch(branchButton.dataset.setBranch);
  const staffButton = event.target.closest("[data-book-staff]");
  if (staffButton && !catalog.cached && !catalog.offline && activeBranch(catalog, branchId)) {
    sessionStorage.setItem("mz-staff-booking", JSON.stringify({ branchId, staffId: staffButton.dataset.bookStaff }));
    location.href = "/#services";
  }
  const add = event.target.closest("[data-add]");
  if (add) addCart(add.dataset.add);
});
$("#catalogSearch").addEventListener("input", render);
$("#themeToggle").addEventListener("click", () => { const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = theme; localStorage.setItem("mz-theme", theme); $("#themeToggle").innerHTML = themeIcon(theme); });
$("#langToggle").addEventListener("click", () => { lang = lang === "ar" ? "en" : "ar"; localStorage.setItem("mz-lang", lang); document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"; location.reload(); });
document.documentElement.dataset.theme = localStorage.getItem("mz-theme") === "light" ? "light" : "dark";
$("#themeToggle").innerHTML = themeIcon(document.documentElement.dataset.theme);
document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
$("#langToggle").textContent = lang === "ar" ? "EN" : "ع";
if (lang === "en") {
  const editorialCopy = {gallery:["Branch photos and videos", "Gallery", "Published photos and videos from El Mezaen, for your selected branch.", "Search gallery…"],news:["Updates from El Mezaen", "News", "Published branch news and updates.", "Search news…"],celebrities:["Guests of El Mezaen", "Our guests", "Published guest photos from El Mezaen, for your selected branch.", "Search guests…"]}[page];
  const copy = editorialCopy || (page === "services" ? ["All your choices in one place", "Services & Prices", "Search or choose a category, then add your selections to the booking cart.", "Search by service name..."] : page === "packages" ? ["More value in every visit", "All packages", "Compare packages by branch, review their services and add the right one to your booking cart.", "Search packages..."] : ["Choose your specialist", "Meet Our Team", "Search by team member or specialty and choose the right professional for you.", "Search by name or specialty..."]);
  $(".catalog-hero .section-kicker").textContent = copy[0]; $(".catalog-hero h1").textContent = copy[1]; $(".catalog-hero p").textContent = copy[2]; $("#catalogSearch").placeholder = copy[3];
  const backLabel = document.querySelector('[data-safe-back] span');
  if (backLabel) backLabel.textContent = "Back";
}
let catalogLoadPromise;
async function loadCatalogPage() {
  if (catalogLoadPromise) return catalogLoadPromise;
  catalogLoadPromise = (async () => {
    catalogLoading = true;
    catalogError = null;
    const grid = $("#catalogGrid");
    const oldNotice = document.querySelector("#catalogCacheNotice");
    if (oldNotice) oldNotice.hidden = true;
    grid.setAttribute("aria-busy", "true");
    grid.setAttribute("data-catalog-state", "loading");
    grid.innerHTML = `<p role="status">${lang === "ar" ? "جاري تحميل بيانات الفروع…" : "Loading branch data…"}</p>`;
    $("#catalogFilters")?.replaceChildren();
    $("#resultCount").textContent = "";
    let rendering=false;
    try {
      catalog = await getCatalog();
      if (catalog.offline && !catalog.cached) throw new Error("CATALOG_UNAVAILABLE");
      if (["gallery","celebrities"].includes(page) && !Array.isArray(catalog.content)) throw Object.assign(new Error("Missing content contract"),{publicStatus:"contract-error"});
      if (!catalog.branches?.some(branch => activeBranch(catalog,branch.id))) {
        const error = new Error(catalog.offline ? "CATALOG_UNAVAILABLE" : "NO_ACTIVE_BRANCHES");
        error.emptyCatalog = !catalog.offline && !catalog.cached;
        throw error;
      }
      catalogLoading = false;
      const selectedBranch = activeBranch(catalog, branchId);
      if (!selectedBranch) { branchId = ""; localStorage.removeItem("mz-branch"); }
      if (selectedBranch) document.querySelector(".brand small").textContent = localized(selectedBranch);
      grid.setAttribute("data-catalog-state", catalog.cached ? "cached" : "ready");
      rendering=true;render();
      if (!selectedBranch) openBranchDialog();
    } catch (error) {
      if(rendering)error.publicStatus="rendering-error";
      catalogError = error;
      catalogLoading = false;
      console.debug("Catalog loading failed", error?.message || error);
      const code=String(error?.code||".").replace(/^functions\//, "");
      grid.setAttribute("data-catalog-state", error.publicStatus || publicDataStatus(error));
      const title = error.publicStatus ? publicStatusText(error.publicStatus,lang) : code.startsWith("appCheck/") || code.startsWith("app-check/") ? publicStatusText("app-check-error",lang) : ["unauthenticated", "permission-denied"].includes(code) ? (lang === "ar" ? "تعذر التحقق من صلاحية الطلب وحماية الموقع" : "Authorization or App Check verification failed") : error.emptyCatalog
        ? (lang === "ar" ? "لا توجد فروع متاحة حاليًا" : "No branches are currently available")
        : (lang === "ar" ? "تعذر تحميل البيانات حاليًا" : "Catalog is currently unavailable");
      grid.innerHTML = `<div class="empty-state" role="status"><strong>${title}</strong><p>${lang === "ar" ? "أعد المحاولة لعرض الفروع والخدمات المتاحة." : "Retry to load available branches and services."}</p><button class="btn btn-primary" type="button" data-retry-page>${lang === "ar" ? "إعادة المحاولة" : "Retry"}</button></div>`;
    } finally {
      catalogLoading = false;
      grid.setAttribute("aria-busy", "false");
    }
  })();
  try { await catalogLoadPromise; } finally { catalogLoadPromise = null; }
}
await loadCatalogPage();
