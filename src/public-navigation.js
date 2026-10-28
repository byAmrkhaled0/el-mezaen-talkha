import {themeActionIcon} from './theme-control.js';
import {isPublicItem} from './public-branch.js';
import {getLang} from './i18n.js';
export const publicRoutes=[['/#offers','العروض'],['/#contact','تواصل معنا'],['/','الرئيسية'],['/services/','الخدمات'],['/packages/','الباقات'],['/results/','نتائج شغلنا'],['/hair-systems/','شبكية الشعر'],['/team/','الفريق'],['/reviews/','التقييمات'],['/gallery/','المعرض'],['/news/','الأخبار'],['/celebrities/','ضيوفنا'],['/branches/talkha/','فرع طلخا'],['/branches/mashaya/','فرع المشاية'],['/booking/','احجز موعدك'],['/account/','حسابي'],['/about/','عن المزين'],['/#newsSection','الأخبار وصور الفروع'],['/#manage-booking','مراجعة الحجز'],['/#choose-branch','الفروع والتواصل']];
const fallbackContacts=[{"id": "talkha", "nameAr": "فرع طلخا", "nameEn": "Talkha branch", "addressAr": "المنصورة - طلخا، تقسيم بهاء الشربيني، أمام محل LONDONE للملابس", "phone": "+201093008896", "whatsapp": "201093008896", "mapsUrl": "https://www.google.com/maps/search/?api=1&query=%D8%AA%D9%82%D8%B3%D9%8A%D9%85+%D8%A8%D9%87%D8%A7%D8%A1+%D8%A7%D9%84%D8%B4%D8%B1%D8%A8%D9%8A%D9%86%D9%8A+%D8%B7%D9%84%D8%AE%D8%A7"}, {"id": "mashaya", "nameAr": "فرع المشاية", "nameEn": "El Mashaya branch", "addressAr": "المنصورة - المشاية السفلية، أمام بوابة نادي الجزيرة الثانية، شارع حسام ربيع", "phone": "+201093008896", "whatsapp": "201093008896", "mapsUrl": "https://www.google.com/maps/search/?api=1&query=%D8%B4%D8%A7%D8%B1%D8%B9+%D8%AD%D8%B3%D8%A7%D9%85+%D8%B1%D8%A8%D9%8A%D8%B9+%D8%A7%D9%84%D9%85%D8%B4%D8%A7%D9%8A%D8%A9+%D8%A7%D9%84%D8%B3%D9%81%D9%84%D9%8A%D8%A9+%D8%A7%D9%84%D9%85%D9%86%D8%B5%D9%88%D8%B1%D8%A9"}];
const englishRoutes={'/#offers':'Offers','/#contact':'Contact','/':'Home','/services/':'Services','/packages/':'Packages','/results/':'Results','/hair-systems/':'Hair systems','/team/':'Team','/reviews/':'Reviews','/gallery/':'Gallery','/news/':'News','/celebrities/':'Guests','/branches/talkha/':'Talkha branch','/branches/mashaya/':'Mashaya branch','/booking/':'Book','/account/':'Account','/about/':'About','/#newsSection':'Updates','/#manage-booking':'Manage booking','/#choose-branch':'Branches'};
const routeLabel=(url,lang)=>lang==='en'?englishRoutes[url]||url:publicRoutes.find(row=>row[0]===url)?.[1]||url;
const footerCopy={ar:{about:'وجهتك للحلاقة والعناية الرجالية في طلخا والمشاية.',links:'اكتشف المزين',branches:'الفروع والتواصل',credit:'تم البرمجة بواسطة المهندس عمرو خالد',phone:'اتصال',whatsapp:'واتساب',map:'الاتجاهات',details:'تفاصيل الفرع',menu:'القائمة',brand:'مزين مصر'},en:{about:"Men’s grooming in Talkha and El Mashaya.",links:'Explore El Mezaen',branches:'Branches & contact',credit:'Developed by Eng. Amr Khaled',phone:'Call',whatsapp:'WhatsApp',map:'Directions',details:'Branch details',menu:'Menu',brand:'El Mezaen Egypt'}};
const safeWeb=value=>{try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}};
// Pure projection for footer display. Never selects a branch or changes booking state.
export function footerBranchModel(branch,lang='ar') {
 const phone=String(branch.phone||'').replace(/[^+0-9]/g,'');
 const secondaryPhone=String(branch.secondaryPhone||'').replace(/[^+0-9]/g,'');
 const wa=String(branch.whatsapp||branch.phone||'').replace(/\D/g,'').replace(/^0/,'20');
 return {id:branch.id,name:(lang==='en'?branch.nameEn:branch.nameAr)||branch.nameAr||'',address:(lang==='en'?branch.addressEn:branch.addressAr)||branch.addressAr||'',phone,secondaryCall:secondaryPhone?'tel:'+secondaryPhone:'',call:phone?'tel:'+phone:'',whatsapp:wa?'https://wa.me/'+wa:'',map:safeWeb(branch.mapsUrl),socials:['facebook','instagram','tiktok'].map(key=>({name:key,url:safeWeb(branch[key])})).filter(row=>row.url)};
}

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const icon=(paths)=>`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${paths}</svg>`;
export function developerCreditMarkup(lang='ar'){
 const en=lang==='en';
 return `<a class="developer-signature" href="https://wa.me/201008454029" target="_blank" rel="noopener" aria-label="${en?'Contact developer Eng. Amr Khaled Abouzeid on WhatsApp':'تواصل مع المبرمج م. عمرو خالد أبوزيد على واتساب'}"><span class="developer-signature-mark" aria-hidden="true">${icon('<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>')}</span><span class="developer-signature-copy"><small>${en?'Designed & developed by':'تصميم وتطوير'}</small><strong>${en?'Eng. Amr Khaled Abouzeid':'م. عمرو خالد أبوزيد'}</strong></span><span class="developer-signature-contact"><bdi>01008454029</bdi><span aria-hidden="true">↗</span></span></a>`;
}
const socialIcons={"facebook": "<svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M14 8h3V4h-3c-3 0-5 2-5 5v2H6v4h3v9h4v-9h3l1-4h-4V9c0-1 .3-1 1-1Z\"/></svg>", "instagram": "<svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"5\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/><circle cx=\"17.5\" cy=\"6.5\" r=\"1\"/></svg>", "tiktok": "<svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M14 3v11a4 4 0 1 1-4-4v4a1 1 0 1 0 1 1V3h3c.4 2 2 3.6 4 4v3c-1.5 0-2.9-.5-4-1.3V3Z\"/></svg>"};
const mapIcon=icon('<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>');
export function publicHeaderMarkup(lang='ar') {
 const en=lang==='en',primary=['/services/','/packages/','/#offers','/account/','/results/','/about/','/team/','/hair-systems/'];
 const nav=url=>`<a href="${url}" data-public-route="${url}">${routeLabel(url,lang)}</a>`;
 return `<div class="container nav-wrap"><a class="brand" href="/" aria-label="EL MEZAEN"><img src="/assets/el-mezaen-mark-v2.webp" width="38" height="46" alt="EL MEZAEN"><span><strong>EL MEZAEN</strong><small></small></span></a><nav class="nav-links" id="navLinks" aria-label="${en?'Main navigation':'التنقل الرئيسي'}">${primary.map(nav).join('')}<div class="nav-secondary">${publicRoutes.filter(([u])=>!primary.includes(u)).map(([u])=>nav(u)).join('')}</div></nav><div class="nav-actions"><a class="branch-switch" id="branchSwitch" href="/#choose-branch">${mapIcon}<b data-branch-switch-text data-shell-branch>${en?'Choose branch':'اختر الفرع'}</b></a><a class="btn btn-primary nav-book" href="/?book=1" data-i18n="bookNow">${en?'Book now':'احجز الآن'}</a><button type="button" class="icon-btn" id="langToggle" aria-label="${en?'Change language':'تغيير اللغة'}">${en?'ع':'EN'}</button><button type="button" class="icon-btn" id="themeToggle" aria-label="${en?'Change theme':'تغيير المظهر'}">${themeActionIcon(globalThis.document?.documentElement?.dataset.theme || 'dark')}</button><button type="button" class="icon-btn menu-toggle" id="menuToggle" aria-label="${en?'Menu':'القائمة'}" aria-controls="navLinks" aria-expanded="false">${icon('<path d="M4 6h16M4 12h16M4 18h16"/>')}</button></div></div><div class="container public-branch-strip"><div>${mapIcon}<span data-branch-strip-caption>${en?'Selected branch':'الفرع المختار'}</span><strong data-shell-branch>${en?'Choose your branch':'اختار فرعك'}</strong></div><a href="/#choose-branch" class="branch-strip-change">${en?'Change':'تغيير الفرع'}</a></div>`;
}
export function floatingCartMarkup(lang='ar',home=false) {
 const en=lang==='en',content=`${icon('<path d="M3 4h2l2.5 11h10l3-8H7"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>')}<span data-floating-cart-label>${en?'Cart':'السلة'}</span><b data-public-cart-count>0</b>`;
 const attrs=`class="public-floating-cart" data-floating-cart aria-label="${en?'Open booking cart':'افتح سلة الحجز'}"`;
 return home?`<button type="button" ${attrs} data-open-booking>${content}</button>`:`<a ${attrs} href="/?book=1">${content}</a>`;
}
let lastCatalog={branches:fallbackContacts,settings:{}},footerLanguage='ar';
export function selectedFooterBranch(catalog,id){return (catalog?.branches||[]).find(b=>b.id===id&&isPublicItem(b))||null;}
export function updatePublicFooter(catalog=lastCatalog,lang=footerLanguage,root=document){
 lastCatalog=catalog||lastCatalog;footerLanguage=lang;const footer=root.querySelector('[data-public-footer]');if(!footer)return;
 const en=lang==='en',branch=selectedFooterBranch(lastCatalog,localStorage.getItem('mz-branch')),model=branch?footerBranchModel(branch,lang):null;
 footer.querySelector('[data-footer-about]').textContent=footerCopy[lang].about;
 const credit=footer.querySelector('.developer-credit');if(credit)credit.innerHTML=developerCreditMarkup(lang);
 const contact=footer.querySelector('#branchFooterGrid');
 contact.innerHTML=model?`<h3>${esc(model.name)}</h3><p>${esc(model.address)}</p><div class="contact-actions">${model.call?`<a href="${esc(model.call)}"><bdi>${esc(model.phone)}</bdi></a>`:''}${model.whatsapp?`<a href="${esc(model.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>`:''}${model.map?`<a href="${esc(model.map)}" target="_blank" rel="noopener">${en?'Directions':'الاتجاهات'}</a>`:''}</div>${model.secondaryCall?`<details><summary>${en?'Additional phone':'رقم إضافي'}</summary><a href="${esc(model.secondaryCall)}"><bdi>${esc(model.secondaryCall.slice(4))}</bdi></a></details>`:''}<a href="/#choose-branch">${en?'Change branch':'تغيير الفرع'}</a>`:`<h3>${en?'Choose your branch':'اختر فرعك'}</h3><a href="/#choose-branch">${en?'Choose a booking branch':'اختيار فرع الحجز'}</a>`;
 const source=branch||{},settings=lastCatalog.settings||{};
 footer.querySelector('#socialLinks').innerHTML=['facebook','instagram','tiktok'].map(name=>{const url=safeWeb(source[name]||settings[name]);return url?`<a href="${esc(url)}" target="_blank" rel="noopener" aria-label="${name}">${socialIcons[name]}</a>`:'';}).join('');
 root.querySelectorAll('[data-shell-branch]').forEach(el=>el.textContent=model?.name||(en?'Choose branch':'اختر الفرع'));
}
export function refinePublicNavigation(root=document){
 const path=location.pathname;if(!publicRoutes.some(([url])=>url===path)&&!root.querySelector?.('[data-public-not-found]'))return;
 root.body.dataset.publicRefinement='true';const lang=getLang();footerLanguage=lang;
 let header=root.querySelector('.site-header');if(!header){header=root.createElement('header');root.body.prepend(header);}
 header.className='site-header public-header';header.innerHTML=publicHeaderMarkup(lang);
 if(path==='/'){header.querySelectorAll('#branchSwitch,.branch-strip-change').forEach(el=>el.dataset.openBranch='');header.querySelectorAll('.nav-book').forEach(el=>el.dataset.openBooking='');}
 if(!root.querySelector('[data-floating-cart]')){const slot=root.createElement('div');slot.innerHTML=floatingCartMarkup(lang,path==='/');root.body.append(slot.firstElementChild);}
 header.querySelectorAll('a[href]').forEach(a=>{if(a.getAttribute('href')===path)a.setAttribute('aria-current','page');});
 let footer=root.querySelector('body > footer');if(!footer){footer=root.createElement('footer');root.body.append(footer);}
 footer.className='site-footer public-footer';footer.dataset.publicFooter='true';
 footer.innerHTML=`<div class="container footer-layout"><div><a class="brand footer-brand" href="/"><img src="/assets/el-mezaen-mark-v2.webp" width="38" height="46" alt="EL MEZAEN"><strong>EL MEZAEN</strong></a><p data-footer-about>${footerCopy[lang].about}</p><div class="social-links" id="socialLinks"></div></div><nav aria-label="${enLabel(lang,'Explore','اكتشف المزين')}">${['/services/','/packages/','/gallery/','/celebrities/','/results/','/reviews/','/account/','/branches/talkha/','/branches/mashaya/'].map(url=>`<a href="${url}" data-public-route="${url}">${routeLabel(url,lang)}</a>`).join('')}</nav><div id="branchFooterGrid"></div></div><div class="container footer-bottom"><small>© 2026 EL MEZAEN</small><div class="developer-credit">${developerCreditMarkup(lang)}</div></div>`;
 updatePublicFooter(lastCatalog,lang,root);
 window.addEventListener('mz:catalog',e=>updatePublicFooter(e.detail,getLang(),root));
 window.addEventListener('mz:branch',()=>updatePublicFooter(lastCatalog,getLang(),root));
 window.addEventListener('mz:language',e=>{root.querySelector('[data-floating-cart-label]').textContent=enLabel(e.detail,'Cart','السلة');header.querySelector('[data-branch-strip-caption]').textContent=enLabel(e.detail,'Selected branch','الفرع المختار');header.querySelector('.branch-strip-change').textContent=enLabel(e.detail,'Change','تغيير الفرع');root.querySelectorAll('[data-public-route]').forEach(el=>el.textContent=routeLabel(el.dataset.publicRoute,e.detail));header.querySelector('.public-menu-close')?.setAttribute('aria-label',enLabel(e.detail,'Close navigation','إغلاق القائمة'));header.querySelector('#menuToggle').setAttribute('aria-label',enLabel(e.detail,'Menu','القائمة'));header.querySelector('#navLinks').setAttribute('aria-label',enLabel(e.detail,'Main navigation','التنقل الرئيسي'));updatePublicFooter(lastCatalog,e.detail,root);});
 const main=root.querySelector('main');if(main&&!main.id)main.id='main';if(main&&!root.querySelector('.skip-link')){const a=root.createElement('a');a.href='#'+main.id;a.className='skip-link';a.textContent=enLabel(lang,'Skip to content','تخطي إلى المحتوى');root.body.prepend(a);}
 const accountBar=root.querySelector('.account-header');if(accountBar){accountBar.classList.add('account-context');main?.prepend(accountBar);}
 header.querySelector('.branch-strip-change').addEventListener('click',e=>{const control=header.querySelector('#branchSwitch');if(control?.tagName==='BUTTON'){e.preventDefault();control.click();}});
 bindPublicMenu(root.querySelector('#menuToggle'),root.querySelector('#navLinks'),root);
 bindResponsivePublicHeader(header,root);

}
const enLabel=(lang,en,ar)=>lang==='en'?en:ar;
const boundPublicMenus=new WeakSet();
export function bindPublicMenu(toggle,links,root){
 if(!toggle||!links||boundPublicMenus.has(links))return;
 boundPublicMenus.add(links);
 const header=toggle.closest?.('.public-header'),background=new Map();
 const originalRole=links.getAttribute?.('role');
 let backdrop,closeButton;
 if(header&&root.createElement){
  backdrop=root.createElement('button');backdrop.type='button';backdrop.className='public-menu-backdrop';backdrop.hidden=true;backdrop.tabIndex=-1;backdrop.setAttribute('aria-hidden','true');header.append(backdrop);
 }
 const restoreBackground=()=>{for(const [node,inert] of background)node.inert=inert;background.clear();};
 const block=node=>{if(node&&!background.has(node)){background.set(node,node.inert);node.inert=true;}};
 const close=(restore=false)=>{
  restoreBackground();if(backdrop)backdrop.hidden=true;
  links.removeAttribute?.('aria-modal');if(originalRole)links.setAttribute('role',originalRole);else links.removeAttribute?.('role');
  root.body?.classList.remove('public-menu-open');links.classList.remove('open');toggle.setAttribute('aria-expanded','false');if(restore){const target=toggle.getClientRects&&!toggle.getClientRects().length?header?.querySelector('.brand'):toggle;target?.focus({preventScroll:true});}
 };
 const open=()=>{
  links.classList.toggle('open');toggle.setAttribute('aria-expanded','true');root.body?.classList.add('public-menu-open');
  links.setAttribute?.('role','dialog');links.setAttribute?.('aria-modal','true');
  if(backdrop){backdrop.hidden=false;header.style.setProperty('--menu-header-height',`${header.getBoundingClientRect().height}px`);}
  if(header){for(const node of [...root.body.children])if(node!==header)block(node);for(const node of header.querySelectorAll('.brand,.nav-actions > *,.public-branch-strip'))if(node!==toggle&&!links.contains(node))block(node);}
  links.querySelector?.('a,button,summary')?.focus({preventScroll:true});
 };
 toggle.addEventListener('click',()=>{if(links.classList.contains('open'))close(true);else open();});
 backdrop?.addEventListener('click',()=>close(true));
 if(root.createElement){closeButton=root.createElement('button');closeButton.type='button';closeButton.className='public-menu-close icon-btn';closeButton.setAttribute('aria-label',getLang()==='en'?'Close navigation':'إغلاق القائمة');closeButton.innerHTML=icon('<path d="m6 6 12 12M6 18 18 6"/>');closeButton.addEventListener('click',()=>close(true));links.prepend(closeButton);}

 globalThis.window?.matchMedia('(min-width:1281px)').addEventListener('change',e=>{if(e.matches)close(true);});
 root.addEventListener('keydown',e=>{
  if(!links.classList.contains('open'))return;
  if(e.key==='Escape'){e.preventDefault?.();close(true);return;}
  if(e.key==='Tab'){
   const nodes=[...links.querySelectorAll('a[href],button,summary,input,select')].filter(n=>!n.disabled&&n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');
   const first=nodes[0],last=nodes.at(-1);
   if(e.shiftKey&&(root.activeElement===first||root.activeElement===toggle)){e.preventDefault();last?.focus();}
   else if(!e.shiftKey&&(root.activeElement===last||root.activeElement===toggle)){e.preventDefault();first?.focus();}
  }
 });
 links.addEventListener('click',e=>{if(e.target.closest('a'))close();});
 root.addEventListener('click',e=>{if(!links.contains(e.target)&&!toggle.contains(e.target)&&links.classList.contains('open'))close(links.contains(root.activeElement));});
}

// Move the same controls, never clone them: page listeners and current state survive.
// Query by selector on each breakpoint because catalog-page replaces the branch anchor.
export function bindResponsivePublicHeader(header,root=document,media=window.matchMedia('(max-width:1280px)')) {
 const links=header.querySelector('#navLinks'),actions=header.querySelector('.nav-actions');
 const preferences=root.createElement('div');preferences.className='mobile-preferences';
 links.append(preferences);
 const selectors=['#branchSwitch','.nav-book'];
 const slots=selectors.map(selector=>{const node=header.querySelector(selector),marker=root.createComment('public-control-slot');actions.insertBefore(marker,node);return {selector,marker};});
 const sync=()=>{
  const active=root.activeElement;
  for(const {selector,marker} of slots){const node=header.querySelector(selector);if(!node)continue;if(media.matches)preferences.append(node);else actions.insertBefore(node,marker);}
  header.classList.toggle('mobile-shell',media.matches);
  if(media.matches && preferences.contains(active) && !links.classList.contains('open'))header.querySelector('#menuToggle').focus();
 };
 media.addEventListener('change',sync);sync();
 return sync;
}

export function closePublicMore(details){details.open=false;details.querySelector('summary')?.focus();}
