import {getOwnStaffAttendance,recordOwnStaffAttendance,getAttendanceMonth,getAttendancePolicies,setAttendancePolicy,enablePush} from './admin-api.js';
import './staff-self-attendance.css';
import {attendancePresentation} from './attendance-presentation.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const monthNow=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).format(new Date());
const duration=s=>s==null?'غير متاح':`${Math.floor(s/3600)} س ${Math.floor(s%3600/60)} د`;
const endLabel=r=>r.endReason==='DURATION_COMPLETED'?'انتهاء المدة تلقائيًا':r.status==='PRESENT'?'حضور مفتوح':r.endReason==='MANUAL'?'انصراف مسجل':'سجل سابق';
function historyMarkup(result){return `<div class="attendance-metrics"><article><small>أيام مسجلة</small><b>${result.summary.days}</b></article><article><small>ساعات محتسبة</small><b>${duration(result.summary.recordedSeconds)}</b></article><article><small>انتهاء تلقائي</small><b>${result.summary.automatic}</b></article></div><details class="attendance-history-note"><summary>إزاي بتتحسب ساعات الحضور؟</summary><p class="attendance-help">الانتهاء التلقائي يقفل مدة الحضور المحددة؛ مش تأكيد لخروج الموظف فعليًا. الساعات محسوبة من وقت السيرفر، والأجزاء الممتدة بين الشهور بتتحسب في شهرها. السجلات القديمة الناقصة مش بنخمّن مدتها.</p></details><div class="attendance-table-wrap"><table role="table" aria-label="سجل الحضور الشهري"><thead><tr><th>اليوم</th><th>الفرع</th><th>حضور</th><th>انتهاء</th><th>المدة المحتسبة</th><th>طريقة الانتهاء</th></tr></thead><tbody>${result.rows.map(r=>`<tr><td data-label="اليوم">${esc(r.dateKey)}${r.carryOver?"<small>وردية ممتدة من الشهر السابق</small>":""}</td><td data-label="الفرع">${esc(({talkha:'طلخا',mashaya:'المشاية'})[r.branchId]||r.branchId)}</td><td data-label="الحضور">${esc(r.checkInTime||'—')}</td><td data-label="الانصراف">${esc(r.checkOutTime||'—')}${r.endedAt&&r.startedAt&&r.endedAt.slice(0,10)!==r.startedAt.slice(0,10)?'<small>اليوم التالي / تاريخ الانتهاء '+esc(new Date(r.endedAt).toLocaleDateString('ar-EG',{timeZone:'Africa/Cairo'}))+'</small>':''}</td><td data-label="المدة">${duration(r.monthSeconds??r.workedSeconds)}</td><td data-label="الحالة">${endLabel(r)}</td></tr>`).join('')||'<tr><td colspan="6">لا توجد سجلات لهذا الشهر.</td></tr>'}</tbody></table></div>`;}
export function mountSelfAttendance({role,uid,currentUid=()=>uid,anchor,preferredBranch=()=>'',onRecorded}) {
  document.querySelector('#staffSelfAttendance')?.remove();
  if(!['worker','cashier','manager'].includes(role))return;
  const target=anchor||document.querySelector('#myAttendance');if(!target)return;
  const panel=document.createElement('div');panel.id='staffSelfAttendance';panel.className='attendance-workspace';
  panel.innerHTML=`<header class="attendance-heading"><div><small>يومك في المزين</small><h2>حضوري وساعات عملي</h2><p>سجّل حضورك من الفرع، وتابع ساعاتك في مكان واحد.</p></div><button type="button" data-self-refresh>تحديث السجل</button></header>
  <div class="attendance-current">
   <div class="attendance-tap-area"><span class="attendance-state-pill" data-self-badge>جاري التحميل</span>
    <button type="button" class="attendance-fingerprint" data-self-in disabled aria-label="تسجيل حضوري والتحقق من موقع الفرع">
     <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M15 25c0-10 7-17 17-17s17 7 17 17M9 30v-5C9 12 19 2 32 2s23 10 23 23v8M21 31v-6a11 11 0 0 1 22 0v12c0 9-3 17-8 24M27 34v-9a5 5 0 0 1 10 0v12c0 9-4 16-10 23M15 34c0 10-2 16-6 21M21 38c0 10-3 18-8 23M27 41c-1 7-3 13-6 18M49 32v6c0 8-2 15-5 21M55 40c0 6-1 11-3 16M32 25v12c0 7-2 13-6 18"/></svg>
     <span data-self-button-label>تسجيل حضوري</span>
    </button><p class="attendance-tap-hint" data-self-hint>التحقق بموقع الفرع؛ لا يتم جمع بصمة إصبع.</p>
   </div>
   <div class="attendance-controls"><div class="attendance-current-title"><small>حالة اليوم</small><strong data-self-status role="status" aria-live="polite">جاري تحميل حضورك…</strong></div>
    <label>فرع الحضور<select data-self-branch aria-label="فرع حضوري"></select></label>
    <div class="attendance-today-times"><div><small>وقت الحضور</small><b data-self-in-time>—</b></div><div><small>وقت الانصراف</small><b data-self-out-time>—</b></div></div>
    <p data-self-plan></p><p class="attendance-countdown" data-self-countdown></p>
    <div class="self-attendance-actions"><button type="button" data-self-out disabled>تسجيل انصرافي</button><button type="button" data-self-push>تفعيل تنبيه نهاية المدة</button></div>
   </div>
  </div><p data-self-error role="status" aria-live="polite"></p>
  <section class="attendance-history"><header><div><small>متابعة ساعاتك</small><h3>سجل الحضور الشهري</h3></div><label>الشهر<input data-self-month aria-label="شهر سجل حضوري" type="month"></label></header><div data-self-history></div></section>`;
  target.append(panel);
  const $=s=>panel.querySelector(s),status=$('[data-self-status]'),select=$('select'),checkIn=$('[data-self-in]'),checkOut=$('[data-self-out]'),refresh=$('[data-self-refresh]'),month=$('[data-self-month]');month.value=monthNow();
  let data=null,pending=false,version=0,disposed=false,phase='loading';
  const valid=()=>!disposed&&panel.isConnected&&currentUid()===uid;
  const controls=()=>{select.disabled=pending||Boolean(data?.attendance);checkIn.disabled=pending||!data?.durationMinutes||!data?.branches?.length||Boolean(data?.attendance);checkOut.disabled=pending||data?.attendance?.status!=='PRESENT'||!data?.branches?.some(b=>b.id===data.attendance.branchId);refresh.disabled=pending;month.disabled=pending;panel.setAttribute('aria-busy',String(pending));const view=attendancePresentation(data,{phase});panel.dataset.attendanceState=view.kind;$('[data-self-button-label]').textContent=view.label;$('[data-self-badge]').textContent=view.present?'متواجد بالفرع':view.completed?'انتهت المدة':view.waiting?'لحظات…':'تسجيل آمن بالموقع';$('[data-self-hint]').textContent=view.hint;$('[data-self-in-time]').textContent=view.checkIn;$('[data-self-out-time]').textContent=view.checkOut;};
  function tick(){const end=Date.parse(data?.attendance?.scheduledEndAt||'');const out=$('[data-self-countdown]');if(data?.attendance?.status!=='PRESENT'||!Number.isFinite(end)){out.textContent='';return;}const left=Math.max(0,Math.ceil((end-Date.now())/1000));out.textContent=left?'متبقي على نهاية المدة: '+duration(left):'اكتملت المدة؛ جاري انتظار تحديث السجل من السيرفر.';}
  async function load({includeHistory=true}={}){
    if(pending||!valid())return;const requestVersion=++version;pending=true;controls();$('[data-self-error]').textContent='';
    try{const previousStatus=data?.attendance?.status;let [today,history]=await Promise.all([getOwnStaffAttendance(),includeHistory?getAttendanceMonth({month:month.value}):null]);if(!valid()||requestVersion!==version)return;if(!includeHistory&&today.attendance?.status!==previousStatus){history=await getAttendanceMonth({month:month.value});if(!valid()||requestVersion!==version)return;}data=today;select.replaceChildren(...data.branches.map(b=>new Option(b.nameAr,b.id)));if(data.attendance)select.value=data.attendance.branchId;else if(data.branches.some(b=>b.id===preferredBranch()))select.value=preferredBranch();status.textContent=data.attendance?data.attendance.status==='PRESENT'?'حضورك مسجل داخل الفرع':endLabel(data.attendance):'جاهز تبدأ يومك؟';$('[data-self-plan]').textContent=data.durationMinutes?'مدة الوردية المحددة: '+data.durationMinutes/60+' ساعة'+(data.attendance?.plannedMinutes?' • مدة السجل الحالي: '+data.attendance.plannedMinutes/60+' ساعة':''):'مدة الوردية غير محددة؛ راجع الإدارة قبل تسجيل الحضور.';if(history)$('[data-self-history]').innerHTML=historyMarkup(history);phase='idle';tick();}catch(e){if(valid()){$('[data-self-error]').textContent=e.message||'تعذر تحميل الحضور';data=null;phase='idle';status.textContent='تعذر تحديث الحالة؛ أعد المحاولة';}}finally{pending=false;if(valid())controls();}
  }
  async function record(action){
    if(pending||!data||!valid())return;
    const branchId=select.value;pending=true;phase='locating';controls();$('[data-self-error]').textContent='جاري تحديد موقعك…';
    try{
      if(!navigator.geolocation)throw Error('المتصفح لا يدعم GPS');
      const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,e=>reject(Error(e.code===1?'اسمح باستخدام الموقع من إعدادات المتصفح ثم حاول مجددًا':e.code===3?'تحديد الموقع أخد وقت طويل؛ قرب من مكان مفتوح وحاول تاني':'تعذر تحديد الموقع بدقة')),{enableHighAccuracy:true,timeout:15000,maximumAge:0}));
      if(!valid())return;
      phase='confirming';controls();$('[data-self-error]').textContent='جاري مطابقة موقع الفرع وتأكيد التسجيل…';
      await recordOwnStaffAttendance({action,branchId,latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy});
      if(!valid())return;
      if(onRecorded)void Promise.resolve().then(()=>valid()&&onRecorded()).catch(()=>{});
      phase='idle';pending=false;await load();
    }catch(e){if(valid())$('[data-self-error]').textContent=e.message||'تعذر التسجيل؛ حدّث السجل قبل إعادة المحاولة';}
    finally{pending=false;phase='idle';if(valid())controls();}
  }
  refresh.onclick=()=>void load();month.onchange=()=>void load();checkIn.onclick=()=>void record('checkIn');checkOut.onclick=()=>void record('checkOut');
  $('[data-self-push]').onclick=async()=>{try{await enablePush();$('[data-self-error]').textContent='تم تفعيل إشعارات هذا الجهاز';}catch(e){$('[data-self-error]').textContent=e.message||'تعذر تفعيل الإشعارات';}};
  const timer=setInterval(()=>{if(!valid()){clearInterval(timer);return;}tick();if(!target.hidden&&(target.classList.contains('active')||role==='worker'&&!target.hidden)&&!document.hidden)void load({includeHistory:false});},60000);
  return {load,dispose(){disposed=true;clearInterval(timer);panel.remove();}};
}
export function mountAttendanceManagement(anchor){
  if(!anchor)return;
  anchor.innerHTML='<div class="attendance-workspace"><header class="attendance-heading"><div><h2>مدد وسجل حضور الفريق</h2><p>حدد مدة كل حساب. التغيير ينطبق على الورديات الجديدة فقط.</p></div></header><div class="attendance-admin-filters"><label>الدور<select data-att-role><option value="worker">العمال</option><option value="cashier">الكاشير</option><option value="manager">المديرين</option></select></label><button data-att-refresh type="button">تحديث القائمة</button></div><p data-att-message role="status"></p><div data-att-roster></div><button data-att-more type="button" hidden>تحميل حسابات أخرى</button><section class="attendance-history"><header><h3 data-att-person>اختار حساب لعرض سجله</h3><input type="month" data-att-month aria-label="شهر سجل الموظف"></header><div data-att-history></div></section></div>';
  const $=s=>anchor.querySelector(s),month=$('[data-att-month]');month.value=monthNow();let items=[],cursor=null,selected='',pending=false,version=0,rosterVersion=0;
  function render(){const list=$('[data-att-roster]');list.innerHTML=items.map((r,i)=>`<article class="attendance-person"><div><b>${esc(r.name)}</b><small>${r.active?'فعال':'غير فعال'} • ${esc(r.branchIds.join(' / '))}</small></div><label>مدة الوردية بالساعات<input type="number" min="0.25" max="24" step="0.25" data-att-hours="${i}" value="${r.durationMinutes==null?'':r.durationMinutes/60}" placeholder="مثال: 8"></label><button type="button" data-att-save="${i}" ${!r.active?'disabled':''}>حفظ المدة</button><button type="button" data-att-view="${i}">السجل الشهري</button></article>`).join('')||'<p>لا توجد حسابات بهذا الدور.</p>';$('[data-att-more]').hidden=!cursor;}
  async function roster(more=false){if(more&&pending)return;pending=true;const v=++rosterVersion;$('[data-att-message]').textContent='جاري تحميل الحسابات…';try{const result=await getAttendancePolicies({role:$('[data-att-role]').value,cursor:more?cursor||'':''});if(v!==rosterVersion)return;items=more?[...items,...result.items]:result.items;cursor=result.nextCursor;render();$('[data-att-message]').textContent='تم تحميل '+items.length+' حساب. سجلات الحضور الحالية لا تتغير عند تعديل المدة.';}catch(e){if(v===rosterVersion)$('[data-att-message]').textContent=e.message;}finally{if(v===rosterVersion)pending=false;}}
  async function history(){if(!selected)return;const v=++version;$('[data-att-history]').textContent='جاري تحميل السجل…';try{const r=await getAttendanceMonth({uid:selected,month:month.value});if(v===version)$('[data-att-history]').innerHTML=historyMarkup(r);}catch(e){if(v===version)$('[data-att-history]').textContent=e.message;}}
  anchor.addEventListener('click',async event=>{const save=event.target.closest('[data-att-save]'),view=event.target.closest('[data-att-view]');if(save){const row=items[Number(save.dataset.attSave)],hours=Number($(`[data-att-hours="${save.dataset.attSave}"]`).value);save.disabled=true;try{const r=await setAttendancePolicy({uid:row.uid,durationMinutes:hours*60,expectedVersion:row.version});row.durationMinutes=hours*60;row.version=r.version;$('[data-att-message]').textContent='تم حفظ المدة للورديات القادمة.';}catch(e){$('[data-att-message]').textContent=e.message;}finally{save.disabled=!row.active;}}if(view){const row=items[Number(view.dataset.attView)];selected=row.uid;$('[data-att-person]').textContent='سجل '+row.name;await history();}});
  $('[data-att-role]').onchange=()=>{selected='';$('[data-att-history]').replaceChildren();void roster();};$('[data-att-refresh]').onclick=()=>void roster();$('[data-att-more]').onclick=()=>void roster(true);month.onchange=()=>void history();return {load:()=>roster()};
}
