import {getWorkerServiceSessions,startWorkerService,extendWorkerService,finishWorkerService,getCashHandoverHistory} from './admin-api.js';
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
const action=text=>{const n=el('button',text);n.type='button';n.className='small-button';return n};
const label=(parent,text,input)=>{const n=el('label',text);n.append(input);parent.append(n);return input};
const money=n=>n==null?'—':new Intl.NumberFormat('ar-EG',{style:'currency',currency:'EGP'}).format(n);

export function mountWorkerServiceControls({box,branch,staff,onChanged}) {
  const area=el('section');area.className='worker-service-controls';
  area.append(el('h3','تشغيل العامل دلوقتي'),el('p','بدء الخدمة يقفل وقت العامل في الحجز. انتهاء المدة المتوقعة لا ينهي الخدمة تلقائيًا؛ إنهاؤها هنا لا يعني تحصيل الفاتورة.'));
  const form=el('form');form.className='operations-controls';
  const duration=label(form,'المدة المتوقعة بالدقائق',el('input'));duration.type='number';duration.name='durationMinutes';duration.min='5';duration.max='240';duration.step='5';duration.value='30';duration.required=true;
  const booking=label(form,'رقم الحجز المرتبط — اختياري',el('input'));booking.name='bookingId';booking.maxLength=100;booking.autocomplete='off';
  const start=action('بدء الخدمة للعامل المختار');start.type='submit';start.classList.add('primary');form.append(start);
  const status=el('p');status.setAttribute('role','status');const list=el('div');list.className='service-session-list';
  const refresh=action('تحديث الخدمات الجارية');area.append(form,refresh,status,list);box.insertBefore(area,box.querySelector('.manual-availability'));
  let version=0,key='',draftStaff='',ready=false;
  async function load(){const v=++version,branchId=branch.value;if(!branchId)return;start.disabled=true;ready=false;status.textContent='جاري مراجعة الخدمات الجارية…';try{const data=await getWorkerServiceSessions({branchId});if(v!==version||branch.value!==branchId)return;list.replaceChildren();for(const row of data.sessions){
    const card=el('article');card.className='service-session';if(row.overdue)card.dataset.overdue='true';
    card.append(el('strong',row.staffName),el('p',`${row.dateKey} • ${row.startTime} — ${row.endTime}`));
    if(row.bookingId)card.append(el('small','الحجز: '+row.bookingId));
    if(row.overdue)card.append(el('b','المدة انتهت والعامل لسه مش متاح؛ راجع الخدمة والحجوزات القادمة.'));
    const controls=el('div');controls.className='operations-controls';const extra=label(controls,'زيادة المدة',el('select'));for(const n of [5,15,30,60]){const o=el('option',n+' دقيقة');o.value=n;extra.append(o)}extra.value='15';
    const extend=action('تمديد الخدمة'),finish=action('إنهاء الخدمة');controls.append(extend,finish);card.append(controls);
    for(const [button,isFinish] of [[extend,false],[finish,true]]){let requestKey='';button.addEventListener('click',async()=>{if(branch.value!==row.branchId)return;if(!confirm(isFinish?'تأكيد انتهاء الخدمة وتحرير وقت العامل؟ التحصيل منفصل.':'تمديد الخدمة بعد مراجعة الحجوزات المتداخلة؟'))return;extend.disabled=finish.disabled=true;try{const payload={branchId:row.branchId,sessionId:row.id,expectedVersion:row.version,idempotencyKey:requestKey||=crypto.randomUUID(),...(!isFinish?{additionalMinutes:Number(extra.value)}:{})};await(isFinish?finishWorkerService(payload):extendWorkerService(payload));await load();await onChanged();}catch(e){status.textContent=e.message||'تعذر تنفيذ الإجراء؛ حدّث الجدول';extend.disabled=finish.disabled=false;}})}
    list.append(card);
  }if(!data.sessions.length)list.append(el('p','لا توجد خدمات جارية في الفرع.'));status.textContent=`وقت الخادم: ${data.serverClock.dateKey} ${data.serverClock.time} • اختار العامل من القائمة ثم ابدأ الخدمة.`;ready=true;start.disabled=!staff.options.length;}catch(e){if(v===version)status.textContent=e.message||'تعذر تحميل الخدمات'}}
  form.addEventListener('input',()=>key='');staff.addEventListener('change',()=>{key='';draftStaff='';booking.value=''});
  form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity()||!staff.value)return;if(!confirm('بدء الخدمة الآن وحجز وقت العامل المختار؟'))return;start.disabled=true;try{await startWorkerService({branchId:branch.value,staffId:staff.value,durationMinutes:Number(duration.value),bookingId:booking.value.trim()||undefined,idempotencyKey:key||=crypto.randomUUID()});key='';booking.value='';await load();await onChanged();}catch(error){status.textContent=error.message||'تعذر بدء الخدمة';start.disabled=false}});
  refresh.addEventListener('click',load);branch.addEventListener('change',()=>{key='';booking.value='';void load()});
  document.addEventListener('mz:service-board-refresh',()=>{if(box.closest('.admin-section')?.classList.contains('active')&&!document.hidden)void load()});
  document.addEventListener('mz:service-start-draft',async event=>{const draft=event.detail||{};if([...branch.options].some(o=>o.value===draft.branchId)){branch.value=draft.branchId;branch.dispatchEvent(new Event('change'))}draftStaff=draft.staffId||'';duration.value=String(Math.min(240,Math.max(5,Math.ceil((draft.durationMinutes||30)/5)*5)));booking.value=draft.bookingId||'';await onChanged();if([...staff.options].some(o=>o.value===draftStaff))staff.value=draftStaff;await load();area.scrollIntoView({block:'start',behavior:'smooth'});});
  // Staff options are populated asynchronously by the existing scoped availability panel.
  const observer=new MutationObserver(()=>{start.disabled=!ready||!staff.options.length;if(draftStaff&&[...staff.options].some(o=>o.value===draftStaff))staff.value=draftStaff});observer.observe(staff,{childList:true});
  void load();return {load};
}

const historyMounts=new WeakMap();
export function mountCashHandoverHistory({anchor,branchId}) {
  if(!anchor)return;
  if(historyMounts.has(anchor)){historyMounts.get(anchor).setBranch(branchId);return;}
  const box=el('details');box.className='admin-panel cash-handover-history';box.append(el('summary','سجل تسليمات الوردية'));
  const scope=el('p'),status=el('p');status.setAttribute('role','status');const list=el('div');list.className='handover-history-list';const refresh=action('تحديث السجل'),more=action('تحميل الأقدم');more.hidden=true;box.append(scope,refresh,status,list,more);anchor.append(box);
  let current=branchId,cursor=null,version=0,loaded=false;
  const states={PENDING:'في انتظار الاستلام',DISPUTED:'اختلاف يحتاج مراجعة',ACCEPTED:'تم الاستلام',RELEASED_TO_ADMIN:'العهدة مع الإدارة'};
  async function load(append=false){const v=++version,branch=current;refresh.disabled=more.disabled=true;status.textContent='جاري تحميل سجل التسليمات…';if(!append)list.replaceChildren();try{const data=await getCashHandoverHistory({branchId:branch,...(append&&cursor?{cursor}:{})});if(v!==version||current!==branch)return;for(const row of data.items){const item=el('details');item.className='handover-history-item';const title=el('summary',`${row.createdAt?new Date(row.createdAt).toLocaleString('ar-EG'):''} • ${row.fromName} ← ${row.toName} • ${states[row.status]||row.status}`);item.append(title);const dl=el('dl');for(const [name,value]of [['المبلغ المعلن',money(row.declaredCash)],['المبلغ المستلم',money(row.receivedCash)],['فرق الاستلام',money(row.receiptDifference)],['العد المختلف',money(row.reportedCash)],['الوردية المسلمة',row.fromShiftId],['وردية الاستلام',row.toShiftId||'—'],['سبب الاختلاف',row.disputeReason||'—'],['قرار الإدارة',row.resolutionReason||'—'],['اعتمد الاستلام',row.acceptedBy||row.resolvedBy||'—']]){const group=el('div');group.append(el('dt',name),el('dd',value));dl.append(group)}item.append(dl);list.append(item)}cursor=data.nextCursor;more.hidden=!cursor;loaded=true;status.textContent=list.children.length?`المعروض ${list.children.length} تسليم — القراءة حسب صلاحيات الحساب.`:'لا توجد تسليمات محفوظة في النطاق.';}catch(e){if(v===version)status.textContent=e.message||'تعذر تحميل السجل';}finally{if(v===version)refresh.disabled=more.disabled=false;}}
  const setBranch=value=>{if(current===value)return;current=value;version++;cursor=null;loaded=false;list.replaceChildren();more.hidden=true;scope.textContent=value==='talkha'?'فرع طلخا':'فرع المشاية';if(box.open)void load()};
  scope.textContent=current==='talkha'?'فرع طلخا':'فرع المشاية';box.addEventListener('toggle',()=>{if(box.open&&!loaded)void load()});refresh.addEventListener('click',()=>load());more.addEventListener('click',()=>load(true));historyMounts.set(anchor,{setBranch});
}
