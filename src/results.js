import { safeMediaUrl } from "./media.js";
import "./seo-page.js";
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getFunctions, httpsCallable } from "firebase/functions";
import { publicSubset, reconcileBranchCart } from "./public-branch.js";

const config = globalThis.__FIREBASE_CONFIG__ || {};
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
let items = [];
let branch = localStorage.getItem("mz-branch") || "";
let catalog = null;
let search = "";
let visibleItems = [];
let viewerIndex = 0;

const branchLabel = item => item.branchIds?.length === 1 && item.branchIds[0] === "mashaya" ? "فرع المشاية" : item.branchIds?.length === 1 && item.branchIds[0] === "talkha" ? "فرع طلخا" : item.branchIds?.length > 1 ? "كل الفروع" : "يحتاج تحديد الفرع";

function render() {
  visibleItems = publicSubset(items, branch).filter(item => !search || `${item.titleAr || ""} ${item.titleEn || ""}`.toLowerCase().includes(search));
  document.querySelector("#resultsCount").textContent = visibleItems.length ? `${visibleItems.length} نتيجة` : "";
  document.querySelector("#allResultsGrid").innerHTML = visibleItems.map((item, index) => `<button class="result-card" type="button" data-result-index="${index}" aria-label="عرض ${escapeHtml(item.titleAr || "نتيجة من مزين مصر")}">${item.beforeImageUrl && item.afterImageUrl ? `<div class="result-pair"><img src="${escapeHtml(safeMediaUrl(item.beforeImageUrl))}" alt="قبل" loading="lazy" decoding="async" width="540" height="1080"><img src="${escapeHtml(safeMediaUrl(item.afterImageUrl))}" alt="بعد" loading="lazy" decoding="async" width="540" height="1080"></div>` : `<img src="${escapeHtml(safeMediaUrl(item.imageUrl))}" alt="${escapeHtml(item.titleAr || "نتيجة من مزين مصر")}" loading="lazy" decoding="async" width="1080" height="1080">`}<span>${escapeHtml(item.titleAr || "نتيجة من مزين مصر")}</span><small>${branchLabel(item)}</small></button>`).join("") || `<div class="results-empty">${branch ? "لا توجد نتائج مطابقة في هذا الفرع حاليًا." : "اختر الفرع لمشاهدة النتائج المناسبة له."}</div>`;
}

document.querySelector("#resultFilters").addEventListener("click", event => {
  const button = event.target.closest("[data-result-branch]"); if (!button) return;
  const next = button.dataset.resultBranch;
  if (next === "all") return;
  if (branch && branch !== next && catalog) {
    let cart = []; try { cart = JSON.parse(localStorage.getItem("mz-cart") || "[]"); } catch {}
    const { kept, removed } = reconcileBranchCart(cart, catalog, next);
    if (removed && !confirm(`تغيير الفرع سيحذف ${removed} عناصر غير متاحة من السلة. هل تريد المتابعة؟`)) return;
    if (removed) localStorage.setItem("mz-cart", JSON.stringify(kept));
  }
  branch = next;
  localStorage.setItem("mz-branch", branch);
  document.querySelectorAll("[data-result-branch]").forEach(item => item.classList.toggle("active", item === button));
  render();
});

document.querySelector("#resultsSearch").addEventListener("input", event => {
  search = event.target.value.trim().toLowerCase();
  render();
});

const viewer = document.querySelector("#resultViewer");
function showViewer(index) {
  const item = visibleItems[index]; if (!item) return;
  viewerIndex = index;
  document.querySelector("#resultViewerImage").src = safeMediaUrl(item.imageUrl);
  const before = document.querySelector("#resultViewerBefore");
  if (before) { before.hidden = !(item.beforeImageUrl && item.afterImageUrl); if (!before.hidden) before.src = safeMediaUrl(item.beforeImageUrl); else before.removeAttribute("src"); }
  document.querySelector("#resultViewerImage").alt = item.titleAr || "نتيجة من مزين مصر";
  document.querySelector("#resultViewerTitle").textContent = item.titleAr || "نتيجة من مزين مصر";
  document.querySelector("#resultViewerBranch").textContent = branchLabel(item);
  viewer.hidden = false;
  document.body.classList.add("viewer-open");
  viewer.querySelector(".result-viewer-close").focus();
}
function closeViewer() { viewer.hidden = true; document.body.classList.remove("viewer-open"); }
function moveViewer(step) { if (visibleItems.length) showViewer((viewerIndex + step + visibleItems.length) % visibleItems.length); }
document.querySelector("#allResultsGrid").addEventListener("click", event => { const card = event.target.closest("[data-result-index]"); if (card) showViewer(Number(card.dataset.resultIndex)); });
viewer.querySelector(".result-viewer-close").addEventListener("click", closeViewer);
viewer.querySelector(".result-viewer-prev").addEventListener("click", () => moveViewer(-1));
viewer.querySelector(".result-viewer-next").addEventListener("click", () => moveViewer(1));
viewer.addEventListener("click", event => { if (event.target === viewer) closeViewer(); });
document.addEventListener("keydown", event => { if (viewer.hidden) return; if (event.key === "Escape") closeViewer(); if (event.key === "ArrowRight") moveViewer(-1); if (event.key === "ArrowLeft") moveViewer(1); });

async function load() {
  if (!config.projectId || String(config.projectId).includes("YOUR_")) return render();
  const app = initializeApp(config);
  if (globalThis.__APP_CHECK_SITE_KEY__) {
    if (["localhost", "127.0.0.1"].includes(globalThis.location?.hostname)) globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(globalThis.__APP_CHECK_SITE_KEY__), isTokenAutoRefreshEnabled: true });
  }
  const response = await httpsCallable(getFunctions(app, "europe-west1"), "getCatalog", { timeout: 20000 })();
  catalog = response.data || {};
  items = (catalog.content || []).filter(item => item.type === "result" && item.imageUrl).map(item => ({ ...item, branchIds: Array.isArray(item.branchIds) ? item.branchIds.filter(value => ["talkha", "mashaya"].includes(value)) : [item.branchId].filter(value => ["talkha", "mashaya"].includes(value)) }));
  if (!catalog.branches?.some(item => item.id === branch && item.active !== false)) branch = "";
  document.querySelector('[data-result-branch="all"]').hidden = true;
  document.querySelectorAll('[data-result-branch]:not([data-result-branch="all"])').forEach(el => el.classList.toggle("active", el.dataset.resultBranch === branch));
  render();
}

load().catch(() => { document.querySelector("#allResultsGrid").innerHTML = '<div class="results-empty">تعذر تحميل النتائج الآن. حاول مرة أخرى.</div>'; });
