import "./seo-page.js";
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getFunctions, httpsCallable } from "firebase/functions";

const config = globalThis.__FIREBASE_CONFIG__ || {};
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
let items = [];
let branch = "all";
let search = "";
let visibleItems = [];
let viewerIndex = 0;

const branchLabel = item => item.branchId === "mashaya" ? "فرع المشاية" : item.branchId === "talkha" ? "فرع طلخا" : "كل الفروع";

function render() {
  visibleItems = items.filter(item => (branch === "all" || item.branchId === branch || item.branchId === "all") && (!search || `${item.titleAr || ""} ${item.titleEn || ""}`.toLowerCase().includes(search)));
  document.querySelector("#resultsCount").textContent = visibleItems.length ? `${visibleItems.length} نتيجة` : "";
  document.querySelector("#allResultsGrid").innerHTML = visibleItems.map((item, index) => `<button class="result-card" type="button" data-result-index="${index}" aria-label="عرض ${escapeHtml(item.titleAr || "نتيجة من مزين مصر")}"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.titleAr || "نتيجة من مزين مصر")}" loading="lazy" decoding="async" width="1080" height="1080"><span>${escapeHtml(item.titleAr || "نتيجة من مزين مصر")}</span><small>${branchLabel(item)}</small></button>`).join("") || '<div class="results-empty">لا توجد نتائج مطابقة حاليًا.</div>';
}

document.querySelector("#resultFilters").addEventListener("click", event => {
  const button = event.target.closest("[data-result-branch]"); if (!button) return;
  branch = button.dataset.resultBranch;
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
  document.querySelector("#resultViewerImage").src = item.imageUrl;
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
  if (globalThis.__APP_CHECK_SITE_KEY__) initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(globalThis.__APP_CHECK_SITE_KEY__), isTokenAutoRefreshEnabled: true });
  const response = await httpsCallable(getFunctions(app, "europe-west1"), "getCatalog", { timeout: 20000 })();
  items = (response.data?.content || []).filter(item => item.active !== false && item.type === "result" && item.imageUrl);
  render();
}

load().catch(() => { document.querySelector("#allResultsGrid").innerHTML = '<div class="results-empty">تعذر تحميل النتائج الآن. حاول مرة أخرى.</div>'; });
