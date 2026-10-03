import { safeMediaUrl } from "./media.js";
import "./styles.css";
import { getCatalog, trackEvent } from "./firebase-client.js";
import { bindSafeBack } from "./navigation.js";
import { activeBranch, publicSubset, reconcileBranchCart } from "./public-branch.js";

bindSafeBack();
const branchId = document.body.dataset.branchPage;
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const money = amount => new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(amount || 0));
const phoneHref = number => `tel:+${String(number || "").replace(/\D/g, "").replace(/^0/, "20")}`;
let branchContextReady = false;

function setBranchContext(catalog) {
  const prior = localStorage.getItem("mz-branch");
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem("mz-cart") || "[]"); } catch {}
  const { kept, removed } = reconcileBranchCart(cart, catalog, branchId);
  if (removed && !confirm(`اختيار هذا الفرع سيحذف ${removed} من عناصر السلة غير المتاحة فيه. هل تريد المتابعة؟`)) return false;
  localStorage.setItem("mz-branch", branchId);
  if (removed) localStorage.setItem("mz-cart", JSON.stringify(kept));
  return true;
}

function renderCatalog(catalog) {
  const now = Date.now();
  const offers = publicSubset(catalog.offers, branchId, { now, dated: true });
  $("#branchOffers").innerHTML = offers.map(item => `<article class="offer-card"><div class="offer-media">${item.imageUrl ? `<img src="${escapeHtml(safeMediaUrl(item.imageUrl))}" alt="${escapeHtml(item.nameAr)}" loading="lazy" decoding="async" width="800" height="600">` : '<span class="offer-media-placeholder" aria-hidden="true">✦</span>'}<span class="offer-ribbon">عرض خاص</span></div><div class="offer-body"><h3>${escapeHtml(item.nameAr)}</h3><p>${escapeHtml(item.descriptionAr || "")}</p><div class="price-row"><div>${Number(item.oldPrice) > Number(item.newPrice) ? `<del class="old-price">${money(item.oldPrice)}</del>` : ""}<strong class="price">${money(item.newPrice ?? item.price)}</strong></div></div><button class="btn btn-primary" type="button" data-book-item="${escapeHtml(item.id)}" data-kind="offer">احجز العرض</button></div></article>`).join("") || '<div class="empty-state">لا توجد عروض حالية في هذا الفرع.</div>';
  const services = publicSubset(catalog.services, branchId).slice(0, 4);
  const packages = publicSubset(catalog.packages, branchId, { now, dated: true }).slice(0, 2);
  $("#branchServices").innerHTML = [...services.map(item => ({ ...item, kind: item.type === "product" ? "product" : "service" })), ...packages.map(item => ({ ...item, kind: "package" }))].map(item => `<article class="branch-item-card">${item.imageUrl ? `<img src="${escapeHtml(safeMediaUrl(item.imageUrl))}" alt="${escapeHtml(item.nameAr)}" loading="lazy" decoding="async" width="480" height="320">` : ""}<small>${item.kind === "package" ? "باقة" : "خدمة"}</small><h3>${escapeHtml(item.nameAr)}</h3><p>${escapeHtml(item.descriptionAr || "")}</p><div><strong>${money(item.price)}</strong><button class="btn btn-ghost" type="button" data-book-item="${escapeHtml(item.id)}" data-kind="${item.kind}">احجز الآن</button></div></article>`).join("") || '<div class="empty-state">لا توجد خدمات أو باقات متاحة حاليًا.</div>';
  $("#branchTeam").innerHTML = publicSubset(catalog.staff, branchId).slice(0, 4).map(item => `<article class="team-card">${item.imageUrl ? `<img class="team-photo" src="${escapeHtml(safeMediaUrl(item.imageUrl))}" alt="${escapeHtml(item.nameAr)}" loading="lazy" decoding="async" width="220" height="220">` : ""}<h3>${escapeHtml(item.nameAr)}</h3><p>${escapeHtml(item.specialtyAr || "")}</p>${item.available === false ? '<span class="availability off">غير متاح</span>' : `<button class="btn btn-ghost" type="button" data-book-staff="${escapeHtml(item.id)}">احجز مع هذا المتخصص</button>`}</article>`).join("") || '<div class="empty-state">لا يوجد فريق ظاهر في هذا الفرع.</div>';
}

document.addEventListener("click", event => {
  if (event.target.closest("[data-choose-branch]") && !branchContextReady) {
    event.preventDefault();
    return;
  }
  const item = event.target.closest("[data-book-item]");
  const staff = event.target.closest("[data-book-staff]");
  if (item) {
    sessionStorage.setItem("mz-entry-item", JSON.stringify({ branchId, id: item.dataset.bookItem, kind: item.dataset.kind }));
    location.href = "/#services";
  }
  if (staff) {
    sessionStorage.setItem("mz-staff-booking", JSON.stringify({ branchId, staffId: staff.dataset.bookStaff }));
    location.href = "/#services";
  }
  if (event.target.closest("[data-branch-retry]")) location.reload();
});

getCatalog().then(catalog => {
  const branch = activeBranch(catalog, branchId);
  if (!branch) throw new Error("branch-unavailable");
  if (!setBranchContext(catalog)) { location.href = "/#choose-branch"; return; }
  branchContextReady = true;
  document.querySelectorAll("[data-branch-address]").forEach(el => { el.textContent = branch.addressAr; });
  document.querySelectorAll("[data-branch-phone]").forEach(el => { el.textContent = branch.phone; el.href = phoneHref(branch.phone); });
  const map = $("[data-branch-map]");
  if (map) map.href = branch.mapsUrl;
  const whatsapp = $("[data-branch-whatsapp]");
  if (whatsapp) whatsapp.href = `https://wa.me/${String(branch.whatsapp || branch.phone).replace(/\D/g, "").replace(/^0/, "2")}`;
  renderCatalog(catalog);
}).catch(error => {
  console.debug("Branch catalog unavailable", error?.message || error);
  document.querySelectorAll("#branchOffers, #branchServices, #branchTeam").forEach(el => { el.innerHTML = '<div class="empty-state">تعذر تحميل بيانات هذا الفرع الآن. <button class="btn btn-ghost" type="button" data-branch-retry>إعادة المحاولة</button></div>'; });
});

$("[data-choose-branch]")?.addEventListener("click", () => trackEvent("branch_page_booking", { branch_id: branchId }));
