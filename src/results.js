import {activeBranch,reconcileBranchCart} from './public-branch.js';
import {sharedEditorial,editorialOrigin} from './public-editorial.js';
import {getLang} from './i18n.js';
import {publicDataStatus,publicStatusText} from './public-status.js';
const resultText=(ar,en)=>getLang()==='en'?en:ar;
const resultTitle=item=>(getLang()==='en'?item.titleEn||item.titleAr:item.titleAr)||resultText('نتيجة من مزين مصر','El Mezaen result');
import './global-navigation.js';
import {getCatalogMetadata,getCatalogPage} from './firebase-client.js';
import {createCursorPager} from './cursor-pager.js';
import { safeMediaUrl } from "./media.js";
import "./seo-page.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
let items = [];
let resultLoadError=null,resultLoading=false;
let branch = localStorage.getItem('mz-branch') || ''; // Customer-selected branch; never aggregate branches.
let catalog = null;
let search = "";
let visibleItems = [];
let viewerIndex = 0;
let resultOpener=null;

const branchLabel = item => editorialOrigin(item,getLang());

function render() {
  if(resultLoading||resultLoadError)return;
  visibleItems = sharedEditorial(items,"result",branch).filter(item => !search || `${item.titleAr || ""} ${item.titleEn || ""}`.toLowerCase().includes(search));
  document.querySelector("#resultsCount").textContent = visibleItems.length ? `${visibleItems.length} ${resultText("نتيجة","results")}` : "";
  document.querySelector("#allResultsGrid").innerHTML = visibleItems.map((item, index) => `<button class="result-card" type="button" data-result-index="${index}" aria-label="${resultText('عرض','View')} ${escapeHtml(resultTitle(item))}">${item.beforeImageUrl && item.afterImageUrl ? `<div class="result-pair"><span class="result-label before">${resultText("قبل","Before")}</span><span class="result-label after">${resultText("بعد","After")}</span><img src="${escapeHtml(safeMediaUrl(item.beforeImageUrl))}" alt="${resultText('قبل','Before')}" loading="lazy" decoding="async" width="540" height="1080"><img src="${escapeHtml(safeMediaUrl(item.afterImageUrl))}" alt="${resultText('بعد','After')}" loading="lazy" decoding="async" width="540" height="1080"></div>` : `<img src="${escapeHtml(safeMediaUrl(item.imageUrl))}" alt="${escapeHtml(resultTitle(item))}" loading="lazy" decoding="async" width="1080" height="1080">`}<span>${escapeHtml(resultTitle(item))}</span><small>${branchLabel(item)}</small></button>`).join("") || `<div class="results-empty">${branch ? publicStatusText(catalog?.cached?"cached":"editorial-empty",getLang()) : resultText("اختار فرع طلخا أو المشاية لعرض نتائجه.","Choose Talkha or El Mashaya to see its results.")}</div>`;
}

document.querySelector("#resultFilters").addEventListener("click", event => {
  const button = event.target.closest("[data-result-branch]"); if (!button) return;
  const next = button.dataset.resultBranch;
  if (!activeBranch(catalog,next)) return;
  let cart=[];try{cart=JSON.parse(localStorage.getItem('mz-cart')||'[]');}catch{}
  const {kept,removed}=reconcileBranchCart(cart,{...catalog,...catalog.cartSources},next);
  if(removed&&!confirm(resultText('تغيير الفرع هيشيل العناصر غير المتاحة فيه من السلة. تكمل؟','Switching branch removes unavailable cart items. Continue?')))return;
  branch = next;
  localStorage.setItem('mz-branch',next);
  if(removed)localStorage.setItem('mz-cart',JSON.stringify(kept));
  sessionStorage.removeItem('mz-staff-booking');sessionStorage.removeItem('mz-entry-item');
  window.dispatchEvent(new CustomEvent('mz:cart'));window.dispatchEvent(new CustomEvent('mz:branch'));
  document.querySelectorAll("[data-result-branch]").forEach(item => (item.classList.toggle("active", item === button),item.setAttribute("aria-pressed",String(item===button))));
  void loadResults();
});

document.querySelector("#resultsSearch").addEventListener("input", event => {
  search = event.target.value.trim().toLowerCase();
  resultsVersion++;clearTimeout(searchTimer);searchTimer=setTimeout(()=>void loadResults(),300);
});

const viewer = document.querySelector("#resultViewer");
function showViewer(index) {
  const item = visibleItems[index]; if (!item) return;
  if(viewer.hidden)resultOpener=document.activeElement;
  viewerIndex = index;
  document.querySelector("#resultViewerImage").src = safeMediaUrl(item.beforeImageUrl && item.afterImageUrl ? item.afterImageUrl : item.imageUrl);
  const before = document.querySelector("#resultViewerBefore");
  if (before) { before.hidden = !(item.beforeImageUrl && item.afterImageUrl); if (!before.hidden) before.src = safeMediaUrl(item.beforeImageUrl); else before.removeAttribute("src"); }
  document.querySelector("#resultViewerImage").alt = resultTitle(item);
  document.querySelector("#resultViewerTitle").textContent = resultTitle(item);
  document.querySelector("#resultViewerBranch").textContent = branchLabel(item);
  viewer.hidden = false;
  document.body.classList.add("viewer-open");
  viewer.querySelector(".result-viewer-close").focus();
}
function closeViewer() { viewer.hidden = true; document.body.classList.remove("viewer-open"); resultOpener?.focus?.(); }
function moveViewer(step) { if (visibleItems.length) showViewer((viewerIndex + step + visibleItems.length) % visibleItems.length); }
document.querySelector("#allResultsGrid").addEventListener("click", event => { const card = event.target.closest("[data-result-index]"); if (card) showViewer(Number(card.dataset.resultIndex)); });
viewer.querySelector(".result-viewer-close").addEventListener("click", closeViewer);
viewer.querySelector(".result-viewer-prev").addEventListener("click", () => moveViewer(-1));
viewer.querySelector(".result-viewer-next").addEventListener("click", () => moveViewer(1));
viewer.addEventListener("click", event => { if (event.target === viewer) closeViewer(); });
document.addEventListener("keydown", event => { if (viewer.hidden) return; if (event.key === "Escape") closeViewer(); if(event.key==='Tab'){const nodes=[...viewer.querySelectorAll('button,a[href],[tabindex="0"]')].filter(node=>!node.disabled);if(nodes.length&&event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1).focus();}else if(nodes.length&&!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0].focus();}} if (event.key === "ArrowRight") moveViewer(getLang() === "en" ? 1 : -1); if (event.key === "ArrowLeft") moveViewer(getLang() === "en" ? -1 : 1); });

const resultPager=createCursorPager(getCatalogPage,{take:12,maxHistory:10000});let resultsVersion=0,searchTimer;
const pageBar=document.createElement('nav');pageBar.className='catalog-pagination';pageBar.setAttribute('aria-label',resultText('صفحات النتائج','Result pages'));
const prevPage=document.createElement('button'),nextPage=document.createElement('button'),pageText=document.createElement('span');prevPage.type=nextPage.type='button';prevPage.className=nextPage.className='btn btn-ghost';prevPage.textContent=resultText('السابق','Previous');nextPage.textContent=resultText('التالي','Next');pageBar.append(prevPage,pageText,nextPage);document.querySelector('#allResultsGrid').after(pageBar);
prevPage.onclick=()=>void loadResults('previous');nextPage.onclick=()=>void loadResults('next');
async function load(direction='reset',version=resultsVersion) {
  // The isolated demo uses the same synthetic catalog path.
  if(!catalog)catalog={content:[],...await getCatalogMetadata()};
  if(!activeBranch(catalog,branch))branch='';
  pageBar.hidden=false;
  const page=await resultPager[direction]({collection:'content',type:'result',branchId:branch,globalOnly:!branch,search:document.querySelector('#resultsSearch').value.trim(),lang:getLang()});if(!page||version!==resultsVersion)return;if(page.offline||page.cached)throw Object.assign(new Error('Catalog is offline'),{publicStatus:'cached'});catalog.content=page.items||[];prevPage.disabled=!page.canPrevious;nextPage.disabled=!page.canNext;pageText.textContent=resultText('صفحة ','Page ')+page.page;
  if (catalog.offline) throw Object.assign(new Error("Catalog is offline"),{publicStatus:catalog.cached?"cached":"connection-error"});
  if (!Array.isArray(catalog.content)) throw Object.assign(new Error("Missing content contract"),{publicStatus:"contract-error"});
  items = catalog.content.filter(item => item.type === "result" && (item.imageUrl || (item.beforeImageUrl && item.afterImageUrl))).map(item => ({ ...item, branchIds: Array.isArray(item.branchIds) ? item.branchIds.filter(value => ["talkha", "mashaya"].includes(value)) : [item.branchId].filter(value => ["talkha", "mashaya"].includes(value)) }));

  if(!activeBranch(catalog,branch))branch='';
  document.querySelectorAll("[data-result-branch]").forEach(el => {el.classList.toggle("active",el.dataset.resultBranch===branch);el.setAttribute("aria-pressed",String(el.dataset.resultBranch===branch));});
  resultLoading=false;
  try { render(); } catch(error) { error.publicStatus="rendering-error"; throw error; }
}

function loadResults(direction='reset'){const version=++resultsVersion;resultLoadError=null;resultLoading=true;prevPage.disabled=nextPage.disabled=true;const grid=document.querySelector('#allResultsGrid');grid.dataset.catalogState='loading';grid.setAttribute('aria-busy','true');grid.innerHTML=`<p role="status">${publicStatusText('loading',getLang())}</p>`;return load(direction,version).then(()=>{if(version!==resultsVersion)return;grid.dataset.catalogState=visibleItems.length?'ready':'empty';}).catch(error => {if(version!==resultsVersion)return;resultLoadError=error;const grid=document.querySelector('#allResultsGrid');const status=error.publicStatus||publicDataStatus(error);grid.dataset.catalogState=status;grid.innerHTML=`<div class="results-empty" role="status"><p>${publicStatusText(status,getLang())}</p><button type="button" class="btn btn-ghost" data-retry-results>${resultText('إعادة المحاولة','Retry')}</button></div>`;}).finally(()=>{if(version!==resultsVersion)return;resultLoading=false;grid.setAttribute('aria-busy','false');});}
document.querySelector('#allResultsGrid').addEventListener('click',e=>{if(e.target.closest('[data-retry-results]'))void loadResults();});
void loadResults();

const en=getLang()==='en';
document.querySelector('.results-hero h1').textContent=en?'Our results':'نتائج شغلنا';
document.querySelector('.results-hero .seo-lead').textContent=en?'Browse published work from El Mezaen. General results are always visible; choose a branch to include its work.':'تصفّح أعمال المزين المنشورة. النتائج العامة ظاهرة ليك، واختيار الفرع بيضيف نتائج شغله.';
document.querySelector('#all-results-title').textContent=en?'Published results':'النتائج المنشورة';
document.querySelector('.section-kicker').textContent=en?'Before & after portfolio':'معرض أعمال قبل وبعد';
document.querySelector('#resultsSearch').placeholder=en?'Search by title prefix':'ابحث ببداية العنوان';
document.querySelector('#resultsSearch').setAttribute('aria-label',en?'Search results':'البحث في النتائج');
document.querySelector('#resultFilters').setAttribute('aria-label',en?'Where the work was done':'فرع تنفيذ العمل');
for(const [id,ar,eng] of [['talkha','طلخا','Talkha'],['mashaya','المشاية','El Mashaya']]) document.querySelector(`[data-result-branch="${id}"]`).textContent=en?eng:ar;
for(const [sel,ar,eng] of [['.result-viewer-close','إغلاق الصورة','Close image'],['.result-viewer-prev','الصورة السابقة','Previous image'],['.result-viewer-next','الصورة التالية','Next image']]) viewer.querySelector(sel).setAttribute('aria-label',en?eng:ar);
