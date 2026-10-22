export function themeActionIcon(theme) {
 const paths=theme==='dark'?'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>':'<path d="M20.8 13A8.8 8.8 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>';
 return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}
export function syncThemeControl(root=document) {
 const button=root.querySelector('#themeToggle');if(!button)return;
 const dark=root.documentElement.dataset.theme==='dark',en=root.documentElement.lang==='en';
 button.innerHTML=themeActionIcon(dark?'dark':'light');
 const label=en?(dark?'Switch to light mode':'Switch to dark mode'):(dark?'تفعيل الوضع النهاري':'تفعيل الوضع الليلي');
 button.setAttribute('aria-label',label);button.setAttribute('title',label);button.setAttribute('aria-pressed',String(dark));
}
const mounted=new WeakSet();
export function mountThemeAppearance(root=document,win=window) {
 if(mounted.has(root))return;mounted.add(root);syncThemeControl(root);
 const observer=new win.MutationObserver(()=>syncThemeControl(root));
 observer.observe(root.documentElement,{attributes:true,attributeFilter:['data-theme','lang']});
 win.addEventListener('mz:language',()=>syncThemeControl(root));
}
