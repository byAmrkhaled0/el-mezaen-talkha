import {createCursorPager} from './cursor-pager.js';
export function mountPosCatalogPaging({target,getContext,getPage,onRows,onRender,offline,decorateRow=row=>row}){
 const bar=document.createElement('nav');bar.className='catalog-pagination';bar.setAttribute('aria-label','صفحات أصناف الفاتورة');
 const previous=document.createElement('button'),next=document.createElement('button'),label=document.createElement('span');previous.type=next.type='button';previous.className=next.className='small-button';previous.textContent='السابق';next.textContent='التالي';bar.append(previous,label,next);target.after(bar);
 const pager=createCursorPager(getPage,{take:25,maxHistory:10000});let key='',rows=[],version=0,timer,failed=false;
 async function load(direction='reset'){
  if(offline())return;const context=getContext(),scope=JSON.stringify(context),stamp=++version;key=scope;rows=[];failed=false;previous.disabled=next.disabled=true;label.textContent='جاري تحميل الأصناف…';onRender();
  try{const page=await pager[direction](context);if(!page||version!==stamp||scope!==JSON.stringify(getContext())||offline())return;rows=page.items||[];onRows(rows.map(decorateRow),context);previous.disabled=!page.canPrevious;next.disabled=!page.canNext;label.textContent=page.warning||`صفحة ${page.page}`;}
  catch(error){if(stamp!==version)return;failed=true;next.disabled=false;next.textContent='إعادة المحاولة';label.textContent=error.message||'تعذر تحميل الأصناف';}
  finally{if(stamp===version)onRender();}
 }
 const api={ensure(){bar.hidden=offline();if(offline()){if(key){version++;key='';rows=[];}clearTimeout(timer);return;}const scope=JSON.stringify(getContext());if(scope!==key){key=scope;version++;rows=[];previous.disabled=next.disabled=true;label.textContent='جاري البحث…';clearTimeout(timer);timer=setTimeout(()=>void load(),300);}},rows(){return offline()?null:rows.map(decorateRow);},refresh(){key='';api.ensure();}};
 previous.onclick=()=>void load('previous');next.onclick=()=>{next.textContent='التالي';void load(failed?'reset':'next');};return api;
}
