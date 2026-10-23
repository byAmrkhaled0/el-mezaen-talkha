const element=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n};

function compactActions(){
 for(const row of document.querySelectorAll('.row-actions:not([data-actions-packed])')){
  row.dataset.actionsPacked='true';
 }
}
function extraFilters(){
 for(const id of ['bookings','calendar']){
  const toolbar=document.querySelector('#'+id+' .toolbar');if(!toolbar||toolbar.dataset.compactFilters)return;toolbar.dataset.compactFilters='true';
  const movable=[...toolbar.children].filter(n=>n.matches('select,input,button')&&!/Search|Status|Date|Branch|Load|Refresh|Today/.test(n.id));if(movable.length<2)continue;
  const details=element('details');details.open=true;details.className='filter-drawer';details.append(element('summary','فلاتر وأدوات إضافية'));const body=element('div');body.className='toolbar';body.append(...movable);details.append(body);toolbar.after(details);
 }
 const metrics=document.querySelector('#cash .cashier-shift-breakdown');if(metrics&&!metrics.closest('details')){const details=element('details');details.open=true;details.className='filter-drawer shift-details';details.append(element('summary','تفاصيل مبيعات ومصروفات الوردية'));metrics.before(details);details.append(metrics);}
}
function cashierTheme(){
 const header=document.querySelector('#cashierHeader');if(!header||header.querySelector('#cashierThemeToggle'))return;
 const button=element('button');button.type='button';button.id='cashierThemeToggle';button.className='header-icon-button';
 const update=()=>{const dark=document.documentElement.dataset.theme==='dark';button.setAttribute('aria-label',dark?'تفعيل الوضع النهاري':'تفعيل الوضع الليلي');button.innerHTML=dark?'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/></svg>':'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/></svg>';};
 button.onclick=()=>document.getElementById('adminTheme')?.click();header.querySelector('.cashier-header-tools').append(button);update();new MutationObserver(update).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
}
extraFilters();cashierTheme();
let pending=false;
new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;compactActions()})}).observe(document.querySelector('#adminApp'),{childList:true,subtree:true});
