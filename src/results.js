import "./seo-page.js";
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getFunctions, httpsCallable } from "firebase/functions";

const config = globalThis.__FIREBASE_CONFIG__ || {};
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
let items = [];
let branch = "all";

function render() {
  const visible = items.filter(item => branch === "all" || item.branchId === branch || item.branchId === "all");
  document.querySelector("#allResultsGrid").innerHTML = visible.map(item => `<a class="result-card" href="${escapeHtml(item.imageUrl)}" target="_blank" rel="noopener"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.titleAr || "نتيجة من مزين مصر")}" loading="lazy" decoding="async" width="1080" height="1080"><span>${escapeHtml(item.titleAr || "نتيجة من مزين مصر")}</span><small>${item.branchId === "mashaya" ? "فرع المشاية" : item.branchId === "talkha" ? "فرع طلخا" : "كل الفروع"}</small></a>`).join("") || '<div class="results-empty">لا توجد نتائج منشورة لهذا الفرع حاليًا.</div>';
}

document.querySelector("#resultFilters").addEventListener("click", event => {
  const button = event.target.closest("[data-result-branch]"); if (!button) return;
  branch = button.dataset.resultBranch;
  document.querySelectorAll("[data-result-branch]").forEach(item => item.classList.toggle("active", item === button));
  render();
});

async function load() {
  if (!config.projectId || String(config.projectId).includes("YOUR_")) return render();
  const app = initializeApp(config);
  if (globalThis.__APP_CHECK_SITE_KEY__) initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(globalThis.__APP_CHECK_SITE_KEY__), isTokenAutoRefreshEnabled: true });
  const response = await httpsCallable(getFunctions(app, "europe-west1"), "getCatalog", { timeout: 20000 })();
  items = (response.data?.content || []).filter(item => item.active !== false && item.type === "result" && item.imageUrl);
  render();
}

load().catch(() => { document.querySelector("#allResultsGrid").innerHTML = '<div class="results-empty">تعذر تحميل النتائج الآن. حاول مرة أخرى.</div>'; });
