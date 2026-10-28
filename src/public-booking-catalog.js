import {createCursorPager} from './cursor-pager.js';
export function mountPublicBookingCatalog({target,getContext,getPage,onPage,markup}){
 if(!target)return null;
 const details=target.closest('details'),toolbar=document.createElement('div');toolbar.className='booking-catalog-search';
 const search=document.createElement('input');search.type='search';const kind=document.createElement('select');
 for(const [value,label]of [['services','الخدمات والمنتجات'],['packages','الباقات'],['offers','العروض']]){const option=document.createElement('option');option.value=value;option.textContent=label;kind.append(option);}kind.setAttribute('aria-label','نوع الأصناف');
 const bar=document.createElement('nav');bar.className='catalog-pagination';const previous=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');previous.type=next.type='button';previous.className=next.className='btn btn-ghost';bar.append(previous,label,next);toolbar.append(kind,search);target.before(toolbar);target.after(bar);
 const pager=createCursorPager(getPage,{take:24,maxHistory:10000});let key='',version=0,timer,failed=false;
 function context(){return {...getContext(),collection:kind.value,search:search.value.trim()};}
 function invalidate(){version++;previous.disabled=next.disabled=true;target.setAttribute('aria-busy','true');}
 async function load(direction='reset'){
  const stamp=++version,scope=context(),en=scope.lang==='en';key=JSON.stringify(scope);failed=false;previous.disabled=next.disabled=true;target.setAttribute('aria-busy','true');target.textContent=en?'Loading…':'جاري البحث…';
  try{if(!scope.branchId){target.textContent=en?'Choose a branch first':'اختار الفرع الأول';return;}const result=await pager[direction](scope);if(!result||stamp!==version||key!==JSON.stringify(context()))return;onPage(scope.collection,result);target.innerHTML=(result.items||[]).map(item=>markup(item,scope.collection,result)).join('')||(en?'No matching items':'لا توجد أصناف مطابقة');previous.disabled=!result.canPrevious;next.disabled=!result.canNext;label.textContent=(en?'Page ':'صفحة ')+result.page;}
  catch(error){if(stamp!==version)return;failed=true;target.textContent=en?'Could not load items. Retry.':'تعذر تحميل الأصناف؛ جرّب تاني.';next.disabled=false;next.textContent=en?'Retry':'إعادة المحاولة';}
  finally{if(stamp===version)target.setAttribute('aria-busy','false');}
 }
 function refreshContext(force=false){const value=context(),en=value.lang==='en';for(const option of kind.children)option.textContent=({services:en?'Services & products':'الخدمات والمنتجات',packages:en?'Packages':'الباقات',offers:en?'Offers':'العروض'})[option.value];kind.setAttribute('aria-label',en?'Item type':'نوع الأصناف');search.placeholder=en?'Search by name prefix':'ابحث ببداية الاسم في كل الأصناف';search.setAttribute('aria-label',search.placeholder);previous.textContent=en?'Previous':'السابق';if(!failed)next.textContent=en?'Next':'التالي';if(force||key!==JSON.stringify(value)){invalidate();key=JSON.stringify(value);if(details.open)void load();else target.replaceChildren();}}
 search.oninput=()=>{invalidate();clearTimeout(timer);timer=setTimeout(()=>void load(),300);};kind.onchange=()=>{clearTimeout(timer);void load();};previous.onclick=()=>void load('previous');next.onclick=()=>void load(failed?'reset':'next');details.addEventListener('toggle',()=>{if(details.open)refreshContext(!pager.state().result);});refreshContext();
 return {refreshContext,refresh(){refreshContext(true);}};
}
