import {createCursorPager} from './cursor-pager.js';
const node=(tag,text='',className='')=>{const value=document.createElement(tag);value.textContent=text;if(className)value.className=className;return value;};
const money=value=>Number(value||0).toLocaleString('ar-EG')+' ج.م';
export function additionRoute(requestId,branchId){return 'admin=orderAdditions&request='+encodeURIComponent(requestId)+'&branch='+encodeURIComponent(branchId);}
export function mountAdditionInbox({anchor,context,api,onNotices,onOpen,onChanged=async()=>{}}){
 let pageVersion=0,pollVersion=0,lastPoll=0,lastScope='',pending=[];
 const heading=node('div','','addition-page-heading'),title=node('h2','طلبات إضافات العمال'),back=node('button','رجوع للمعاملات','small-button');back.type='button';back.onclick=()=>onOpen();heading.append(title,back);
 const status=node('p','','order-additions-status');status.setAttribute('role','status');const list=node('div','','order-additions-list'),nav=node('nav','','catalog-pagination'),previous=node('button','‹','small-button'),next=node('button','›','small-button'),page=node('span');previous.type=next.type='button';previous.setAttribute('aria-label','الصفحة السابقة');next.setAttribute('aria-label','الصفحة التالية');nav.append(previous,page,next);anchor.append(heading,status,list,nav);
 const pager=createCursorPager(options=>api.get(options),{take:25,maxHistory:10000});
 const scope=()=>JSON.stringify(context());
 async function poll(force=false){const ctx=context(),key=scope();if(!ctx.uid||!ctx.allowed||!ctx.branches.length){pending=[];onNotices([]);return;}if(!force&&key===lastScope&&Date.now()-lastPoll<55000)return;if(key!==lastScope){pending=[];onNotices([]);}const stamp=++pollVersion;lastScope=key;lastPoll=Date.now();try{const pages=await Promise.all(ctx.branches.map(branchId=>api.get({branchId,take:25})));if(stamp!==pollVersion||key!==scope())return;pending=pages.flatMap(result=>result.items||[]).filter(row=>row.status==='PENDING');onNotices(pending);}catch{/* Keep the last verified inbox for this scope; the detail page reports read failures. */}}
 async function load(direction='reset'){
  const ctx=context(),key=scope(),stamp=++pageVersion;list.replaceChildren();status.textContent='جاري تحميل الطلب…';nav.hidden=true;
  if(!ctx.uid||!ctx.allowed||!ctx.branches.includes(ctx.branchId)){status.textContent='الفرع غير متاح لهذا الحساب';return;}
  try{const result=ctx.requestId?await api.get({branchId:ctx.branchId,requestId:ctx.requestId}):await pager[direction]({branchId:ctx.branchId});if(stamp!==pageVersion||key!==scope())return;
   title.textContent=ctx.requestId?'تفاصيل طلب الإضافة':'طلبات إضافات العمال';status.textContent='الإضافات للشيكات غير المدفوعة فقط؛ القرار يراجعه السيرفر.';
   for(const row of result.items||[]){const card=node('article','','addition-request');card.append(node('h3',row.customerName||'عميل'),node('p',`${row.staffNameAr||'العامل'} • ${row.bookingId}`),node('small',({PENDING:'بانتظار الموافقة',APPROVED:'تمت الإضافة للشيك',REJECTED:'مرفوض'})[row.status]||row.status));
    if(!ctx.requestId){const open=node('button','عرض الطلب','small-button');open.type='button';open.onclick=()=>onOpen(row);card.append(open);}
    else{for(const item of row.items||[])card.append(node('p',`${item.nameAr} × ${item.qty} • ${money(item.lineTotal)}`));card.append(node('b','الإجمالي الإضافي '+money(row.quotedTotal)));if(Number.isFinite(row.baseTotal))card.append(node('p','الشيك وقت تقديم الطلب '+money(row.baseTotal)));if(row.note)card.append(node('p',row.note));
     if(row.status==='PENDING'){const actions=node('div','','addition-actions');for(const [action,label]of [['APPROVE','موافقة وإضافة للشيك'],['REJECT','رفض الطلب']]){const button=node('button',label,'small-button');button.type='button';button.onclick=async()=>{if(button.disabled)return;if(action==='APPROVE'&&!confirm(`إضافة ${money(row.quotedTotal)} إلى الشيك ${row.bookingId}؟`))return;const buttons=[...actions.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await api.decide({requestId:row.id,action});if(key!==scope())return;await load();await poll(true);await onChanged();}catch(error){if(key===scope())status.textContent=error.message||'تعذر تنفيذ القرار';}finally{buttons.forEach(b=>b.disabled=false);}};actions.append(button);}card.append(actions);}
    }list.append(card);
   }
   if(!result.items?.length)list.append(node('p','لا توجد طلبات إضافات معلّقة.'));if(!ctx.requestId){previous.disabled=!result.canPrevious;next.disabled=!result.canNext;page.textContent='صفحة '+result.page;nav.hidden=!result.canPrevious&&!result.canNext;}
  }catch(error){if(stamp===pageVersion&&key===scope())status.textContent=error.message||'تعذر تحميل الطلب';}
 }
 previous.onclick=()=>void load('previous');next.onclick=()=>void load('next');
 return {load,poll,contextChanged(){pageVersion++;pollVersion++;pending=[];onNotices([]);lastPoll=0;}};
}
