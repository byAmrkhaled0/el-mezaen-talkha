// Existing Cash screen, explicit refresh/pagination only. No listener or polling.
export function createCashierAdvanceCenter(context,api,refreshCash) {
 const host=document.getElementById('cash'),root=document.createElement('article');root.className='admin-panel request-center';root.hidden=true;root.innerHTML='<h2>سلف جاهزة للصرف</h2><p>الصرف من الطلب المعتمد فقط عبر ورديتك المفتوحة.</p><div class="request-actions"><button class="small-button" type="button" data-refresh>تحديث الطلبات</button><button class="small-button" type="button" data-next hidden>التالي</button><button class="small-button" type="button" data-first>الصفحة الأولى</button></div><p data-status role="status" aria-live="polite"></p><div data-list class="entity-grid"></div>';host.append(root);
 const status=root.querySelector('[data-status]'),list=root.querySelector('[data-list]');let epoch=0,next=null,cursor=null;const attempts=new Map();
 const say=text=>status.textContent=text;
 async function load(reset=true){const who=context();root.hidden=!['cashier','manager'].includes(who.role);if(root.hidden)return;if(reset)cursor=null;const version=++epoch,branch=who.branchId;list.replaceChildren();say('جارٍ تحميل الطلبات المعتمدة…');
  try{const page=await api.getReadyWorkerAdvances({branchId:branch,cursor});if(version!==epoch||context().branchId!==branch)return;next=page.nextCursor;root.querySelector('[data-next]').hidden=!next;
   for(const row of page.items){const card=document.createElement('article');card.className='entity-card request-card';const title=document.createElement('h3'),desc=document.createElement('p'),button=document.createElement('button');title.textContent=row.staffNameAr;desc.textContent=`${row.requestId} • ${row.approvedAmount.toLocaleString('ar-EG')} ج.م • بانتظار الصرف`;button.className='small-button primary';button.type='button';button.textContent='تأكيد صرف السلفة';button.onclick=async()=>{if(button.disabled)return;const current=context();if(current.branchId!==branch)return;
    const existing=attempts.get(row.requestId),shift=current.shift;
    if(!existing&&(!shift||shift.status!=='OPEN'||shift.branchId!==branch||shift.cashierUid!==current.uid))return say('لا توجد وردية مفتوحة تتبع حسابك في هذا الفرع');
    const payload=existing||{requestId:row.requestId,expectedAmount:row.approvedAmount,expectedVersion:row.version,expectedShiftId:shift.id};
    if(!confirm(`تأكيد صرف السلفة ${row.requestId}\nالمبلغ ${payload.expectedAmount} ج.م\nالفرع ${branch==='talkha'?'طلخا':'المشاية'}\nالوردية ${payload.expectedShiftId}؟`))return;
    attempts.set(row.requestId,payload);button.disabled=true;
    try{const result=await api.disburseWorkerAdvance(payload);attempts.delete(row.requestId);if(version!==epoch||context().branchId!==branch)return;await refreshCash();await load();say(`تم صرف السلفة — مرجع حركة الدرج: ${result.movementId}`);}
    catch(error){if(!/unavailable|deadline-exceeded|internal|network/.test(error.code||error.cause?.code||error.message||''))attempts.delete(row.requestId);if(version===epoch)say(error.message||'تعذر الصرف');}finally{button.disabled=false;}
   };card.append(title,desc,button);list.append(card);}if(!page.items.length)list.textContent='لا توجد سلف معتمدة جاهزة للصرف';say('');
  }catch(error){if(version===epoch)say(error.message||'تعذر تحميل السلف');}
 }
 root.querySelector('[data-refresh]').onclick=()=>load();root.querySelector('[data-first]').onclick=()=>load();root.querySelector('[data-next]').onclick=()=>{if(next){cursor=next;void load(false);}};
 return {load,invalidate(){++epoch;list.replaceChildren();next=null;cursor=null;root.hidden=true;},show(){root.hidden=!['cashier','manager'].includes(context().role);root.scrollIntoView({block:'start'});return load();}};
}
