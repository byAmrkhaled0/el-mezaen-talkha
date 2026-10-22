import {getLang} from './i18n.js';
import {publicDataStatus,publicStatusText} from './public-status.js';
import './global-navigation.js';
import {deferredVideoMarkup,mountDeferredVideos} from './deferred-video.js';
import { getCatalog, firebaseConfigured } from "./firebase-client.js";
import "./seo-page.js";
import { safeMediaUrl, videoSource } from "./media.js";
import { publicSubset } from "./public-branch.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

async function renderHairMedia() {
  // Demo media is supplied by the local synthetic catalog.
  const catalog = await getCatalog();
  if (catalog.offline) { if(!catalog.cached) throw new Error("Catalog unavailable"); }
  const branchId = localStorage.getItem("mz-branch") || "";
  const branch = (catalog?.branches || []).find(item => item.id === branchId && item.active !== false);
  const contact = document.querySelector('.seo-hero .hero-actions a[href^="https://wa.me/"]');
  if (contact && branch) {
    contact.href = `https://wa.me/${String(branch.whatsapp || branch.phone || "").replace(/\D/g, "").replace(/^0/, "2")}`;
    contact.textContent = `واتساب ${branch.nameAr}`;
  }
  if (contact && !branch) { contact.href = "/#choose-branch"; contact.textContent = "اختر الفرع للتواصل"; }
  const items = publicSubset(catalog?.content, branch?.id).filter(item => item.type === "hair-system" && item.videoUrl);
  const status=publicDataStatus(null,{cached:catalog.cached,hasBranches:catalog.branches?.some(b=>b.active!==false),hasSelection:Boolean(branch),count:items.length});
  document.querySelector("#hair-videos").hidden=false;
  const grid=document.querySelector("#hairMediaGrid");grid.dataset.catalogState=status;
  if(!items.length){grid.innerHTML=`<p role="status" class="empty-state">${publicStatusText(status,getLang())}</p>`;return;}
  document.querySelector("#hair-videos").hidden = false;
  document.querySelector("#hairMediaGrid").innerHTML = items.map(item => {
    const source = videoSource(item.videoUrl);
    const title = escapeHtml((getLang()==='en'?item.titleEn||item.titleAr:item.titleAr) || (getLang()==='en'?"Hair-system video":"فيديو من خدمات التركيبات"));
    if (source.kind === "direct") return `<article class="hair-media-card">${deferredVideoMarkup(item)}<div><h3>${title}</h3><p>${escapeHtml(item.bodyAr || '')}</p><small>${escapeHtml(branch?.nameAr||'')}</small></div></article>`;
    return `<a class="hair-media-card external" href="${escapeHtml(source.url)}" target="_blank" rel="noopener"><span>▶</span><div><h3>${title}</h3><p>${escapeHtml(item.bodyAr || "شاهد الفيديو")}</p></div></a>`;
  }).join("");
  if(catalog.cached)grid.insertAdjacentHTML("afterbegin",`<p class="catalog-cache-notice" role="status">${publicStatusText("cached",getLang())}</p>`);
  mountDeferredVideos(document.querySelector('#hairMediaGrid'));
}

function loadHairMedia(){document.querySelector('#hair-videos').hidden=false;document.querySelector('#hairMediaGrid').innerHTML=`<p role="status">${publicStatusText('loading',getLang())}</p>`;return renderHairMedia().catch(error=>{const grid=document.querySelector('#hairMediaGrid');const status=publicDataStatus(error);grid.dataset.catalogState=status;grid.innerHTML=`<div class="empty-state" role="status"><p>${publicStatusText(status,getLang())}</p><button class="btn btn-ghost" type="button" data-retry-hair>${getLang()==='en'?'Retry':'إعادة المحاولة'}</button></div>`;});}
document.querySelector('#hairMediaGrid').addEventListener('click',e=>{if(e.target.closest('[data-retry-hair]'))void loadHairMedia();});
void loadHairMedia();
