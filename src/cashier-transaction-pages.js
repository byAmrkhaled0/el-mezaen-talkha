import {createCursorPager} from './cursor-pager.js';
export function mountTransactionPages({getPage,getBranch,offline,onRows,money,dateTime,paymentMethod,paymentLabel}){
 const $=s=>document.querySelector(s),table=$('#cashierTransactionsTable');if(!table)return null;
 const pager=createCursorPager(getPage,{take:25,maxHistory:10000});let result=null,loading=false,error='',generation=0,timer,lastScope='';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=()=>({branchId:getBranch(),search:$('#cashierTransactionSearch').value.trim(),source:$('#cashierTransactionType').value,paymentMethod:$('#cashierTransactionPayment').value,staffId:$('#cashierTransactionStaff').value});
 function render(){
  if(offline())return false;if(!result&&!loading&&!error)return false;
  const rows=result?.items||[],offset=((result?.page||1)-1)*25;
  table.innerHTML=loading&&!result?'<tr><td colspan="8">جاري تحميل الصفحة…</td></tr>':rows.map((item,index)=>`<tr><td>${offset+index+1}</td><td><b>${esc(item.receiptNumber||item.code||item.id)}</b></td><td>${esc(dateTime(item.createdAt||item.bookingDate))}</td><td>${esc(item.customerName||'عميل')}<small>${esc(item.staffNameAr||'')}</small></td><td><span class="status-pill">${item.source==='pos'?'شيك':'حجز'}</span></td><td>${esc(item.paymentMethod?paymentMethod(item.paymentMethod):paymentLabel(item.paymentStatus))}</td><td><b>${money(item.total)}</b></td><td><button class="transaction-view-button" type="button" data-open-receipt="${esc(item.id)}" aria-label="عرض العملية">◉</button></td></tr>`).join('')||'<tr><td colspan="8">لا توجد نتائج في الصفحة.</td></tr>';
  $('#cashierTransactionsCount').textContent=error||result?.warning||`${rows.length} عملية في الصفحة الحالية — الإجماليات من تقارير الفرع`;
  $('#cashierTransactionsPage').textContent=loading?'جاري التحميل…':`صفحة ${result?.page||1}`;
  $('#cashierTransactionsPrev').disabled=loading||!result?.canPrevious;$('#cashierTransactionsNext').textContent=error?'إعادة المحاولة':'التالي';$('#cashierTransactionsNext').disabled=loading||(!error&&!result?.canNext);
  return true;
 }
 async function load(direction='reset'){
  if(offline())return;const scope=JSON.stringify(context());if(scope!==lastScope){result=null;lastScope=scope;}const stamp=++generation;loading=true;error='';render();
  try{const value=await pager[direction](context());if(stamp!==generation||!value)return;result=value;onRows(value.items||[]);}catch(e){if(stamp===generation)error=e.message||'تعذر تحميل الصفحة';}finally{if(stamp===generation){loading=false;render();}}
 }
 const reset=()=>{generation++;result=null;loading=true;render();clearTimeout(timer);timer=setTimeout(()=>void load(),300);};
 for(const id of ['cashierTransactionSearch','cashierTransactionType','cashierTransactionPayment','cashierTransactionStaff']){const input=$('#'+id);input?.addEventListener(input.tagName==='INPUT'?'input':'change',reset);}
 $('#cashierTransactionsPrev').addEventListener('click',()=>void load('previous'));$('#cashierTransactionsNext').addEventListener('click',()=>void load(error?'reset':'next'));
 $('#cashierTransactionSearch').placeholder='بداية اسم العميل، موبايل كامل أو رقم الشيك';
 return {render,load,find:id=>result?.items?.find(item=>item.id===id)};
}
