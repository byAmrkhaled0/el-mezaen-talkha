import {getLang} from './i18n.js';
const branchText=(ar,en)=>getLang()==='en'?en:ar;
const branchField=(item,key)=>getLang()==='en'?item[key+'En']||item[key+'Ar']||'':item[key+'Ar']||'';
import {publicDataStatus,publicStatusText} from './public-status.js';
import { branchMedia,serviceMedia,packageMedia } from './premium-media.js';
import './global-navigation.js';
import { safeMediaUrl } from "./media.js";
import "./styles.css";
import "./premium-components.css";
import { getCatalog, trackEvent } from "./firebase-client.js";
import { bindSafeBack } from "./navigation.js";
import { activeBranch, publicSubset, reconcileBranchCart, packageEligible } from "./public-branch.js";

bindSafeBack();
const branchId = document.body.dataset.branchPage;
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const money = amount => new Intl.NumberFormat(getLang() === "en" ? "en-EG" : "ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(Number(amount || 0));
const phoneHref = number => `tel:+${String(number || "").replace(/\D/g, "").replace(/^0/, "20")}`;
let branchContextReady = false;

function setBranchContext(catalog) {
  if (!activeBranch(catalog, branchId) || catalog.cached || catalog.offline) return false;
  const prior = localStorage.getItem("mz-branch");
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem("mz-cart") || "[]"); } catch {}
  const { kept, removed } = reconcileBranchCart(cart, catalog, branchId);
  if (removed && !confirm(branchText(`اختيار هذا الفرع سيحذف ${removed} من عناصر السلة غير المتاحة فيه. هل تريد المتابعة؟`, `Switching branch will remove ${removed} unavailable cart items. Continue?`))) return false;
  if (prior !== branchId) { sessionStorage.removeItem("mz-staff-booking"); sessionStorage.removeItem("mz-entry-item"); }
  localStorage.setItem("mz-branch", branchId);
  if (removed) localStorage.setItem("mz-cart", JSON.stringify(kept)); window.dispatchEvent(new CustomEvent("mz:cart"));
  return true;
}

function renderCatalog(catalog) {
  const now = Date.now();
  const offers = publicSubset(catalog.offers, branchId, { now, dated: true });
  $("#branchOffers").innerHTML = offers.map(item => `<article class="offer-card"><div class="offer-media">${item.imageUrl ? `<img src="${escapeHtml(safeMediaUrl(item.imageUrl))}" alt="${escapeHtml(branchField(item,"name"))}" loading="lazy" decoding="async" width="800" height="600">` : '<span class="offer-media-placeholder" aria-hidden="true">✦</span>'}<span class="offer-ribbon">${branchText("عرض خاص","Special offer")}</span></div><div class="offer-body"><h3>${escapeHtml(branchField(item,"name"))}</h3><p>${escapeHtml(branchField(item,"description"))}</p><div class="price-row"><div>${Number(item.oldPrice) > Number(item.newPrice) ? `<del class="old-price">${money(item.oldPrice)}</del>` : ""}<strong class="price">${money(item.newPrice ?? item.price)}</strong></div></div><button class="btn btn-primary" type="button" data-book-item="${escapeHtml(item.id)}" data-kind="offer">${branchText("احجز العرض","Book offer")}</button></div></article>`).join("") || '<div class="empty-state">'+branchText("لا توجد عروض حالية في هذا الفرع.","No current offers at this branch.")+'</div>';
  const services = publicSubset(catalog.services, branchId);
  const packages = publicSubset(catalog.packages, branchId, { now, dated: true }).filter(item => packageEligible(item,catalog,branchId));
  $("#branchServices").innerHTML = [...services.map(item => ({ ...item, kind: item.type === "product" ? "product" : "service" })), ...packages.map(item => ({ ...item, kind: "package" }))].map(item => `<article class="branch-item-card"><img src="${escapeHtml(item.kind==='package'?packageMedia(item):serviceMedia(item))}" alt="${escapeHtml(branchField(item,"name"))}" loading="lazy" decoding="async" width="480" height="320"><small>${item.kind === "package" ? branchText("باقة","Package") : branchText("خدمة","Service")}</small><h3>${escapeHtml(branchField(item,"name"))}</h3><p>${escapeHtml(branchField(item,"description"))}</p><div><strong>${money(item.price)}</strong><button class="btn btn-ghost" type="button" data-book-item="${escapeHtml(item.id)}" data-kind="${item.kind}">${branchText("احجز الآن","Book now")}</button></div></article>`).join("") || '<div class="empty-state">'+branchText("لا توجد خدمات أو باقات متاحة حاليًا.","No services or packages are currently available.")+'</div>';
  $("#branchTeam").innerHTML = publicSubset(catalog.staff, branchId, { includeUnavailable: true }).map(item => `<article class="team-card">${item.imageUrl ? `<img class="team-photo" src="${escapeHtml(safeMediaUrl(item.imageUrl))}" alt="${escapeHtml(branchField(item,"name"))}" loading="lazy" decoding="async" width="220" height="220">` : ""}<h3>${escapeHtml(branchField(item,"name"))}</h3><p>${escapeHtml(branchField(item,"specialty"))}</p>${item.available === false ? '<span class="availability off">'+branchText("غير متاح","Unavailable")+'</span>' : `<button class="btn btn-ghost" type="button" data-book-staff="${escapeHtml(item.id)}">${branchText("احجز مع هذا المتخصص","Book this specialist")}</button>`}</article>`).join("") || '<div class="empty-state">'+branchText("فريق الفرع بيتحدث حاليًا. يمكنك متابعة اختيار الخدمة والحجز.","The branch team is being updated. You can still choose a service and book.")+'</div>';
}

document.addEventListener("click", event => {
  if (event.target.closest("[data-choose-branch]") && !branchContextReady) {
    event.preventDefault();
    return;
  }
  const item = event.target.closest("[data-book-item]");
  const staff = event.target.closest("[data-book-staff]");
  if (item && branchContextReady) {
    sessionStorage.setItem("mz-entry-item", JSON.stringify({ branchId, id: item.dataset.bookItem, kind: item.dataset.kind }));
    location.href = "/#services";
  }
  if (staff && branchContextReady) {
    sessionStorage.setItem("mz-staff-booking", JSON.stringify({ branchId, staffId: staff.dataset.bookStaff }));
    location.href = "/#services";
  }
  if (event.target.closest("[data-branch-retry]")) location.reload();
});

getCatalog().then(catalog => {
  const branch = activeBranch(catalog, branchId);
  if (!branch || catalog.cached || catalog.offline) throw Object.assign(new Error("branch-unavailable-or-stale"),{publicStatus:catalog.cached?"cached":catalog.offline?"connection-error":"no-active-branches"});
  if (!setBranchContext(catalog)) { location.href = "/#choose-branch"; return; }
  branchContextReady = true;
  window.dispatchEvent(new CustomEvent("mz:catalog", { detail: catalog }));
  const image=document.querySelector('.branch-landing-photo');if(image){if(safeMediaUrl(branch.imageUrl)){image.removeAttribute("srcset");image.src=branchMedia(branch);}image.alt=branch.imageUrl?branch.nameAr:`صورة تعبيرية • ${branch.nameAr}`;}
  const hours=document.querySelector('[data-branch-hours]');if(hours)hours.textContent=`${branch.openingTime||'—'} – ${branch.closingTime||'—'}`;
  document.querySelectorAll("[data-branch-address]").forEach(el => { el.textContent = branchField(branch,"address"); });
  document.querySelectorAll("[data-branch-phone]").forEach(el => { el.textContent = branch.phone; el.href = phoneHref(branch.phone); });
  const map = $("[data-branch-map]");
  if (map) map.href = safeMediaUrl(branch.mapsUrl) || "#";
  const whatsapp = $("[data-branch-whatsapp]");
  if (whatsapp) whatsapp.href = `https://wa.me/${String(branch.whatsapp || branch.phone).replace(/\D/g, "").replace(/^0/, "20")}`;
  renderCatalog(catalog);
}).catch(error => {
  console.debug("Branch catalog unavailable", error?.message || error);
  document.querySelectorAll("#branchOffers, #branchServices, #branchTeam").forEach(el => { const status=error.publicStatus||publicDataStatus(error);el.dataset.catalogState=status;el.innerHTML = `<div class="empty-state" role="status">${publicStatusText(status,getLang())} <button class="btn btn-ghost" type="button" data-branch-retry>${getLang()==='en'?'Retry':'إعادة المحاولة'}</button></div>`; });
});

$("[data-choose-branch]")?.addEventListener("click", () => trackEvent("branch_page_booking", { branch_id: branchId }));
