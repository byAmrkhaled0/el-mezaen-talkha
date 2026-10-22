import {mountThemeAppearance} from './theme-control.js';
import {publicCartCount} from './public-cart-count.js';
import { applyStaticTranslations, getLang } from './i18n.js';
export const controlIcon = name => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({back:'<path d="m9 5 7 7-7 7"/>',top:'<path d="m5 14 7-7 7 7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',map:'<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',cart:'<path d="M3 4h2l2.5 11h10l3-8H7"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',plus:'<path d="M12 5v14M5 12h14"/>'})[name] || ''}</svg>`;
export function mountPublicControls() {
  if (!document.body.hasAttribute('data-public-refinement')) return;
  const en = getLang() === 'en';applyStaticTranslations(en?'en':'ar');
  const header = document.querySelector('.site-header');
  const mobileIcons={'/':'<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3z"/>','/services/':'<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 13 13M8 16 21 3"/>','/?book=1':'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18m-9 3v4m-2-2h4"/>','/team/':'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 4a3 3 0 0 1 0 6m1 5a5 5 0 0 1 3 5"/>','/account/':'<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'};
  for(const link of document.querySelectorAll('.premium-bottom-nav a')){
    if(link.querySelector('svg'))continue;
    const label=document.createElement('span');label.textContent=link.textContent;
    if(link.dataset.i18n){label.dataset.i18n=link.dataset.i18n;link.removeAttribute('data-i18n');}
    link.replaceChildren(label);const glyph=document.createElement('span');glyph.innerHTML=`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${mobileIcons[link.getAttribute('href')]||''}</svg>`;link.prepend(glyph);
    if(link.getAttribute('href')===location.pathname)link.setAttribute('aria-current','page');
  }

  const assistant=document.querySelector('.faq-chat-fab');if(assistant){assistant.setAttribute('aria-controls','customerAiPanel');assistant.setAttribute('aria-label',en?'Open El Mezaen Assistant':'فتح مساعد المزين');assistant.title=en?'El Mezaen booking and enquiries assistant':'مساعد المزين للحجز والاستفسارات';}
  const search=document.querySelector('#catalogSearch');if(search){const team=document.body.dataset.page==='team';search.setAttribute('aria-label',team?(en?'Search team name or specialty':'البحث باسم عضو الفريق أو التخصص'):(en?'Search this catalog':'البحث في المحتوى'));}
  document.documentElement.lang=en?'en':'ar';document.documentElement.dir=en?'ltr':'rtl';
  header?.querySelectorAll('a[href="/login/"],a[href="/admin/"]').forEach(link => link.remove());
  for (const back of document.querySelectorAll('[data-safe-back]')) {
    back.innerHTML = controlIcon('back'); back.setAttribute('aria-label', en ? 'Back to previous page' : 'العودة للصفحة السابقة');
  }
  const top = document.querySelector('.scroll-top'); if (top) { top.innerHTML = controlIcon('top'); top.setAttribute('aria-label', en ? 'Back to top' : 'أعلى الصفحة'); }
  if(location.pathname!=='/'&&!document.querySelector('#catalogSearch')){
    header.querySelector('#langToggle').addEventListener('click',()=>{const next=en?'ar':'en';localStorage.setItem('mz-lang',next);const url=new URL(location.href);url.searchParams.set('lang',next);location.assign(url.href);});
    header.querySelector('#themeToggle').addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem('mz-theme',next);});
  }
  const updateCount = () => { let rows=[]; try { rows=JSON.parse(localStorage.getItem('mz-cart')||'[]'); } catch {} const count=publicCartCount(rows); document.querySelectorAll('[data-public-cart-count]').forEach(node=>node.textContent=String(count)); const cart=document.querySelector('[data-floating-cart]');if(cart)cart.setAttribute('aria-label',getLang()==='en'?`Open booking cart, ${count} items`:`افتح سلة الحجز، ${count} عناصر`); };
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  window.addEventListener('storage', event => { if (event.key === 'mz-branch') location.reload(); });
  updateCount(); window.addEventListener('mz:language', updateCount); window.addEventListener('mz:cart', updateCount); window.addEventListener('storage', updateCount); window.addEventListener('pageshow', updateCount);
  if (globalThis.__OFFLINE_DEMO__) {
    const notice=document.createElement('p');notice.className='offline-demo-notice';notice.setAttribute('role','status');
    notice.textContent=en?'OFFLINE DEMO — synthetic fixtures. Services, prices and availability are not live.':'OFFLINE DEMO — بيانات تجريبية. الخدمات والأسعار والمواعيد مش بيانات حية.';document.body.prepend(notice);
    document.addEventListener('click',event=>{const link=event.target.closest('a[href]');if(link&&new URL(link.href,location.href).origin!==location.origin)event.preventDefault();},true);
  }
  // Existing functional glyphs share outline SVG geometry; the assistant robot stays intact.
  const glyphs={'×':'close','⌖':'map','＋':'plus'};
  for(const control of document.querySelectorAll('button,.btn')) for(const node of [...control.childNodes]) {
    if(node.nodeType===3 && glyphs[node.textContent.trim()]) { const span=document.createElement('span');span.innerHTML=controlIcon(glyphs[node.textContent.trim()]);node.replaceWith(span); }
  }
  for(const [selector,ar,eng] of [['#themeToggle,[data-theme-toggle]','تغيير المظهر','Change theme'],['#langToggle','تغيير اللغة','Change language']]) document.querySelectorAll(selector).forEach(node=>node.setAttribute('aria-label',en?eng:ar));
  mountThemeAppearance();
}
