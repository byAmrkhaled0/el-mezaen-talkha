import "./seo-page.js";
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getFunctions, httpsCallable } from "firebase/functions";
import { videoSource } from "./media.js";

const config = globalThis.__FIREBASE_CONFIG__ || {};
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

async function renderHairMedia() {
  if (!config.projectId || String(config.projectId).includes("YOUR_")) return;
  const app = initializeApp(config);
  if (globalThis.__APP_CHECK_SITE_KEY__) initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(globalThis.__APP_CHECK_SITE_KEY__), isTokenAutoRefreshEnabled: true });
  const result = await httpsCallable(getFunctions(app, "europe-west1"), "getCatalog", { timeout: 20000 })();
  const items = (result.data?.content || []).filter(item => item.active !== false && item.type === "hair-system" && item.videoUrl);
  if (!items.length) return;
  document.querySelector("#hair-videos").hidden = false;
  document.querySelector("#hairMediaGrid").innerHTML = items.slice(0, 12).map(item => {
    const source = videoSource(item.videoUrl);
    const title = escapeHtml(item.titleAr || "فيديو من خدمات التركيبات");
    if (source.kind === "direct") return `<article class="hair-media-card"><div class="hair-video-shell"><video src="${escapeHtml(source.url)}" poster="${escapeHtml(item.imageUrl || "")}" controls playsinline webkit-playsinline preload="metadata"></video><span class="hair-video-error" hidden>تعذر تشغيل الفيديو على هذا الجهاز. جرّب فتحه في المتصفح الأساسي.</span></div><div><h3>${title}</h3><p>${escapeHtml(item.bodyAr || "")}</p></div></article>`;
    return `<a class="hair-media-card external" href="${escapeHtml(source.url)}" target="_blank" rel="noopener"><span>▶</span><div><h3>${title}</h3><p>${escapeHtml(item.bodyAr || "شاهد الفيديو")}</p></div></a>`;
  }).join("");
  document.querySelectorAll("#hairMediaGrid video").forEach(video => video.addEventListener("error", () => {
    video.closest(".hair-video-shell")?.classList.add("video-failed");
    const message = video.parentElement?.querySelector(".hair-video-error"); if (message) message.hidden = false;
  }));
}

renderHairMedia().catch(() => {});
