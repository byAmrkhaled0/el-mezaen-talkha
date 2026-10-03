import { safeMediaUrl } from "./media.js";
import "./styles.css";
import { getLang } from "./i18n.js";
import { getCatalog } from "./firebase-client.js";
import { bindSafeBack } from "./navigation.js";
import { availableAtBranch as itemAvailableAtBranch, hasBranchScope } from "./branch-availability.js";
import { activeBranch, publicSubset, reconcileBranchCart } from "./public-branch.js";

const $ = selector => document.querySelector(selector);
const page = document.body.dataset.page;
let lang = getLang();
let catalog = { branches: [], services: [], packages: [], staff: [], categories: [] };
let category = "all";
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
  if (!item || item.active === false || item.catalogVisible === false || ["expired", "stopped"].includes(item.status) || (item.startAt && (Number.isNaN(Date.parse(item.startAt)) || new Date(item.startAt).getTime() > Date.now())) || (item.endAt && (Number.isNaN(Date.parse(item.endAt)) || new Date(item.endAt).getTime() < Date.now()))) return;
  let autoSelectedBranch = null;
  if (!branchId && Array.isArray(item.branchIds) && item.branchIds.length === 1) {
    autoSelectedBranch = (catalog.branches || []).find(branch => branch.id === item.branchIds[0] && branch.active !== false) || null;
    if (!autoSelectedBranch) {
      $("#pageToast").textContent = lang === "ar" ? "الفرع الخاص بهذا العنصر غير متاح حاليًا" : "The branch for this item is currently unavailable";
      $("#pageToast").classList.add("show"); setTimeout(() => $("#pageToast").classList.remove("show"), 1800);
      return;
    }
    branchId = autoSelectedBranch.id;
    localStorage.setItem("mz-branch", branchId);
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
  localStorage.setItem("mz-cart", JSON.stringify(cart));
    if (autoSelectedBranch) render();
  $("#pageToast").textContent = autoSelectedBranch ? (lang === "ar" ? `تم اختيار ${localized(autoSelectedBranch)} وإضافة العنصر للسلة` : `${localized(autoSelectedBranch)} selected and item added`) : (lang === "ar" ? "تمت الإضافة للسلة" : "Added to cart");
  $("#pageToast").classList.add("show"); setTimeout(() => $("#pageToast").classList.remove("show"), 1800);
}

function renderPackages() {
  const query = $("#catalogSearch").value.trim().toLowerCase();
  const items = publicSubset(catalog.packages, branchId, { dated: true }).filter(item => !query || `${item.nameAr || ""} ${item.nameEn || ""}`.toLowerCase().includes(query));
  $("#catalogFilters").innerHTML = "";
  $("#catalogGrid").innerHTML = items.map(item => {
    const oldPrice = Number(item.originalPrice || item.oldPrice || item.price || 0);
    const included = lang === "ar" ? item.includedItemsAr : item.includedItemsEn || item.includedItemsAr;
    const branch = (catalog.branches || []).find(value => item.branchIds?.length === 1 && value.id === item.branchIds[0]);
    return `<article class="package-card"><div class="package-cover">${item.imageUrl ? `<img src="${escapeHtml(safeMediaUrl(item.imageUrl))}" alt="${escapeHtml(localized(item))}" loading="lazy" decoding="async" width="640" height="640">` : `<div class="package-media-placeholder"><img src="/assets/el-mezaen-mark-v2.webp" alt="" loading="lazy" width="90" height="106"></div>`}<span>${lang === "ar" ? "باقة" : "Package"}</span></div>${branch ? `<span class="package-branch"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>${lang === "ar" ? "متاح في " : "Available at "}${escapeHtml(localized(branch))}</span>` : ""}<h3>${escapeHtml(localized(item))}</h3><p>${escapeHtml(localized(item, "description"))}</p><div class="price-row package-price"><div>${oldPrice > Number(item.price || 0) ? `<del class="old-price">${money(oldPrice)}</del>` : ""}<strong class="price">${money(item.price)}</strong></div></div><details class="package-inline-details"><summary>${lang === "ar" ? "تفاصيل الباقة" : "Package details"}</summary>${Array.isArray(included) && included.length ? `<ul class="package-services">${included.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>` : ""}${(item.choiceGroups || []).map(group => `<p class="package-choice-summary"><b>${escapeHtml(lang === "ar" ? group.labelAr : group.labelEn || group.labelAr)}:</b> ${(group.options || []).map(option => escapeHtml(lang === "ar" ? option.labelAr : option.labelEn || option.labelAr)).join(" / ")}</p>`).join("")}${localized(item, "terms") ? `<p class="package-terms">${escapeHtml(localized(item, "terms"))}</p>` : ""}</details><button class="btn btn-primary" type="button" data-add="${escapeHtml(item.id)}">${lang === "ar" ? "إضافة للسلة" : "Add to cart"}</button></article>`;
  }).join("") || `<div class="empty-state">${lang === "ar" ? "لا توجد باقات مطابقة" : "No matching packages"}</div>`;
  $("#resultCount").textContent = `${items.length} ${lang === "ar" ? "باقة" : "packages"}`;
}

function renderServices() {
  const query = $("#catalogSearch").value.trim().toLowerCase();
  const categories = new Map(catalog.categories.map(item => [item.id, localized(item)]));
  const branchItems = publicSubset(catalog.services, branchId);
  const items = dedupeCatalogCards(branchItems.filter(item => (category === "all" || item.categoryId === category) && (!query || `${item.nameAr} ${item.nameEn}`.toLowerCase().includes(query))));
  $("#catalogFilters").innerHTML = `<button class="filter-chip ${category === "all" ? "active" : ""}" data-category="all">${lang === "ar" ? "الكل" : "All"}</button>` + catalog.categories.filter(cat => cat.active !== false && branchItems.some(item => item.categoryId === cat.id)).map(cat => `<button class="filter-chip ${category === cat.id ? "active" : ""}" data-category="${escapeHtml(cat.id)}">${escapeHtml(localized(cat))}</button>`).join("");
  $("#catalogGrid").innerHTML = items.map(item => `<article class="service-card compact-service"><span class="service-icon" data-service-icon="${escapeHtml(item.categoryId || "hair")}">${serviceIconSvg(item.categoryId)}</span><div class="service-meta"><span>${escapeHtml(categories.get(item.categoryId) || "")}</span><span>${clockIcon} ${item.duration} ${lang === "ar" ? "دقيقة" : "min"}</span></div><h3>${escapeHtml(localized(item))}</h3><div class="price-row"><div>${item.startsFrom ? `<small>${lang === "ar" ? "يبدأ من" : "From"}</small>` : ""}<strong class="price">${money(item.price)}</strong></div></div><button class="btn btn-primary" data-add="${escapeHtml(item.id)}">${lang === "ar" ? "إضافة للسلة" : "Add to cart"}</button></article>`).join("") || `<div class="empty-state">${lang === "ar" ? "لا توجد نتائج" : "No results"}</div>`;
  $("#resultCount").textContent = `${items.length} ${lang === "ar" ? "خدمة ومنتج" : "services and products"}`;
}

function renderTeam() {
  const query = $("#catalogSearch").value.trim().toLowerCase();
  const items = publicSubset(catalog.staff, branchId).filter(item => (!query || `${item.nameAr} ${item.nameEn} ${item.specialtyAr} ${item.specialtyEn}`.toLowerCase().includes(query)));
  $("#catalogGrid").innerHTML = items.map(item => `<article class="team-card team-page-card">${item.imageUrl ? `<img class="team-photo" src="${escapeHtml(safeMediaUrl(item.imageUrl))}" alt="${escapeHtml(localized(item))}" loading="lazy" decoding="async" width="220" height="220">` : `<div class="team-photo team-photo-placeholder" role="img" aria-label="${lang === "ar" ? "لم تُضف صورة " : "No photo for "}${escapeHtml(localized(item))}"><img src="/assets/el-mezaen-mark-v2.webp" alt="" width="64" height="76" loading="lazy"><small>${lang === "ar" ? "تُضاف الصورة من الإدارة" : "Photo will be added by admin"}</small></div>`}<h3>${escapeHtml(localized(item))}</h3><p>${escapeHtml(localized(item, "specialty"))}</p><p class="team-bio">${escapeHtml(localized(item, "bio"))}</p><span class="availability ${item.available === false ? "off" : ""}">${item.available === false ? (lang === "ar" ? "غير متاح" : "Unavailable") : (lang === "ar" ? "متاح للحجز" : "Available")}</span>${item.available === false ? "" : `<button class="btn btn-ghost" type="button" data-book-staff="${escapeHtml(item.id)}">${lang === "ar" ? "احجز مع هذا العضو" : "Book this member"}</button>`}</article>`).join("") || `<div class="empty-state">${lang === "ar" ? "لا يوجد فريق متاح في هذا الفرع" : "No team available at this branch"}</div>`;
  $("#resultCount").textContent = `${items.length} ${lang === "ar" ? "عضو فريق" : "team members"}`;
}

function render() {
  document.querySelectorAll("[data-current-branch]").forEach(el => { el.textContent = localized(activeBranch(catalog, branchId)) || "اختر الفرع"; });
  if (!activeBranch(catalog, branchId)) {
    $("#catalogGrid").innerHTML = '<div class="empty-state"><strong>اختار فرعك لعرض المتاح ليك</strong><p>الخدمات والأسعار والفريق بتظهر حسب الفرع.</p><button class="btn btn-primary" type="button" data-open-catalog-branch>اختيار الفرع</button></div>';
    $("#catalogFilters")?.replaceChildren();
    $("#resultCount").textContent = "";
    return;
  }
  page === "services" ? renderServices() : page === "packages" ? renderPackages() : renderTeam();
}

const branchDialog = document.createElement("dialog");
branchDialog.id = "catalogBranchDialog";
branchDialog.className = "catalog-branch-dialog";
branchDialog.innerHTML = '<div class="catalog-branch-shell"><header><div><small>EL MEZAEN</small><h2>اختار فرعك</h2></div><button type="button" data-close-catalog-branch aria-label="إغلاق">×</button></header><p>هتشوف الخدمات والباقات والفريق المتاحين في الفرع اللي تختاره.</p><div class="catalog-branch-options"></div></div>';
document.body.append(branchDialog);
const headerBranch = document.createElement("button");
headerBranch.type = "button";
headerBranch.className = "branch-switch catalog-branch-switch";
headerBranch.dataset.openCatalogBranch = "";
headerBranch.innerHTML = '<span aria-hidden="true">⌖</span><b data-current-branch>اختر الفرع</b>';
$(".nav-actions").prepend(headerBranch);
const heroBranch = document.createElement("button");
heroBranch.type = "button";
heroBranch.className = "selected-branch-pill";
heroBranch.dataset.openCatalogBranch = "";
heroBranch.innerHTML = 'الفرع المختار: <strong data-current-branch>اختر الفرع</strong> <span aria-hidden="true">‹</span>';
$(".catalog-hero").insertBefore(heroBranch, $(".catalog-hero h1"));
const bookLink = document.createElement("a");
bookLink.className = "btn btn-primary catalog-book-link";
bookLink.href = "/#services";
bookLink.textContent = "احجز الآن";
$(".nav-actions").append(bookLink);
function openBranchDialog() {
  branchDialog.querySelector(".catalog-branch-options").innerHTML = catalog.branches.filter(item => item.active !== false).map(item => `<button type="button" data-set-branch="${escapeHtml(item.id)}"><strong>${escapeHtml(localized(item))}</strong><span>${escapeHtml(lang === "ar" ? item.addressAr : item.addressEn || item.addressAr)}</span><small>${escapeHtml(item.openingTime || "—")} – ${escapeHtml(item.closingTime || "—")} · ${escapeHtml(item.phone || "")}</small></button>`).join("") || '<p>تعذر تحميل الفروع. أعد المحاولة.</p>';
  if (!branchDialog.open) branchDialog.showModal();
}
function setBranch(id) {
  if (!activeBranch(catalog, id)) return;
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem("mz-cart") || "[]"); } catch {}
  const { kept, removed } = reconcileBranchCart(cart, catalog, id);
  if (branchId && branchId !== id && removed && !confirm(`تغيير الفرع سيحذف ${removed} من العناصر غير المتاحة هنا. هل تريد المتابعة؟`)) return;
  branchId = id;
  localStorage.setItem("mz-branch", id);
  if (removed) { localStorage.setItem("mz-cart", JSON.stringify(kept)); $("#pageToast").textContent = "تم حذف العناصر غير المتاحة في الفرع الجديد"; $("#pageToast").classList.add("show"); setTimeout(() => $("#pageToast").classList.remove("show"), 2500); }
  document.querySelector(".brand small").textContent = localized(activeBranch(catalog, id));
  category = "all";
  branchDialog.close();
  render();
}
document.addEventListener("click", event => {
  const filter = event.target.closest("[data-category]");
  if (filter) { category = filter.dataset.category; render(); }
  if (event.target.closest("[data-open-catalog-branch]")) openBranchDialog();
  if (event.target.closest("[data-close-catalog-branch]")) branchDialog.close();
  const branchButton = event.target.closest("[data-set-branch]");
  if (branchButton) setBranch(branchButton.dataset.setBranch);
  const staffButton = event.target.closest("[data-book-staff]");
  if (staffButton && activeBranch(catalog, branchId)) {
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
  const copy = page === "services" ? ["All your choices in one place", "Services & Prices", "Search or choose a category, then add your selections to the booking cart.", "Search by service name..."] : page === "packages" ? ["More value in every visit", "All packages", "Compare packages by branch, review their services and add the right one to your booking cart.", "Search packages..."] : ["Experience behind thousands of looks", "Meet Our Team", "Search by team member or specialty and choose the right professional for you.", "Search by name or specialty..."];
  $(".catalog-hero .section-kicker").textContent = copy[0]; $(".catalog-hero h1").textContent = copy[1]; $(".catalog-hero p").textContent = copy[2]; $("#catalogSearch").placeholder = copy[3];
  document.querySelector('.nav-actions a').textContent = "Back & Book";
}
try {
  catalog = await getCatalog();
  const selectedBranch = activeBranch(catalog, branchId);
  if (!selectedBranch) { branchId = ""; localStorage.removeItem("mz-branch"); }
  if (selectedBranch) document.querySelector(".brand small").textContent = localized(selectedBranch);
  render();
  if (!selectedBranch) openBranchDialog();
} catch (error) {
  console.debug("Catalog loading failed", error?.message || error);
  $("#catalogGrid").innerHTML = '<div class="empty-state"><strong>تعذر تحميل البيانات حاليًا</strong><p>تحقق من الاتصال ثم أعد المحاولة.</p><button class="btn btn-primary" type="button" data-retry-page>إعادة المحاولة</button></div>';
  document.addEventListener("click", event => { if (event.target.closest("[data-retry-page]")) location.reload(); }, { once: true });
}
