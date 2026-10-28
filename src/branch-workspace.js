import {workerNowState} from './worker-queue-model.js';
import {serviceTimer,syncServiceClock} from './service-clock.js';
import {getBookingCalendar,getWorkerAvailability,getWorkerServiceSessions,getBranchWorkRequests,submitBranchWorkRequest,updateBranchWorkRequest,changeBooking} from './admin-api.js';


const labels={branchOperations:'تشغيل الفرع',teamAvailability:'مواعيد وانشغال العمال',targets:'التارجت',customerRequests:'طلبات العملاء',branchNeeds:'نواقص وأعطال الفرع'};
const types={SUPPLY:'نقص مستلزمات',EQUIPMENT:'عطل جهاز',CANCELLATION:'طلب إلغاء',RESCHEDULE:'طلب تغيير موعد',REFUND:'طلب استرداد'};
const statuses={NEW:'جديد',IN_PROGRESS:'قيد المتابعة',RESOLVED:'حُسمت المتابعة',REJECTED:'مرفوض'};
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n};
const button=text=>{const n=node('button',text);n.type='button';n.className='small-button';return n};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export function createBranchWorkspace({state,navigate}) {
  const main=document.querySelector('.admin-main');
  for(const [id,label]of Object.entries(labels)){
    if(document.getElementById(id))continue;
    const section=node('section');section.id=id;section.className='admin-section branch-workspace';section.append(node('h2',label));main.append(section);
    const link=button(label);link.dataset.section=id;link.className='branch-workspace-link';document.querySelector('#sidebar .sidebar-primary').append(link);
  }
  const target=document.getElementById('targets');
  for(const [id,label]of [['branchTargetPanel','تارجت الفرع'],['workerTargetPanel','تارجت العمال']]){const part=node('div');part.id=id;part.setAttribute('aria-label',label);target.append(part);}
  let active='',generation=0;
  
  function controls(root){const box=node('div');box.className='workspace-controls';const label=node('label','الفرع');const select=node('select');select.setAttribute('aria-label','فرع مساحة العمل');for(const id of state.branchIds){if(!['talkha','mashaya'].includes(id))continue;const option=node('option',id==='talkha'?'طلخا':'المشاية');option.value=id;select.append(option)}const header=document.querySelector('#headerBranchFilter');if([...select.options].some(o=>o.value===header?.value))select.value=header.value;label.append(select);const refresh=button('تحديث');box.append(label,refresh);root.append(box);return {select,refresh};}
  async function operations(root,branchId,v){
    const status=root.querySelector('[data-workspace-status]'),content=root.querySelector('[data-workspace-content]');
    const [calendar,availability,services]=await Promise.all([getBookingCalendar(today(),today(),branchId),getWorkerAvailability({branchId,dateKey:today()}),getWorkerServiceSessions({branchId})]);
    if(v!==generation)return;
    content.replaceChildren();
    const summary=node('div');summary.className='workspace-summary';
    const waiting=calendar.bookings.filter(b=>b.status==='arrived');
    for(const [title,value]of [['وصل وينتظر/في الخدمة',waiting.length],['الخدمات الجارية',services.sessions.length],['عمال الفرع',availability.staff.length]]){const metric=node('div');metric.append(node('span',title),node('strong',String(value)));summary.append(metric)}content.append(summary);
    const team=node('section');team.className='compact-team';team.append(node('h3','حالة العمال الآن'));
    const minute=t=>Number(t?.slice(0,2))*60+Number(t?.slice(3));
    for(const member of availability.staff){const live=services.sessions.find(s=>s.staffId===member.id),now=minute(services.serverClock.time),period=availability.periods.filter(p=>p.staffId===member.id&&minute(p.startTime)<=now&&now<minute(p.endTime)).sort((a,b)=>b.endTime.localeCompare(a.endTime))[0];const row=node('article');row.className='team-status-row';const booking=calendar.bookings.find(b=>b.staffId===member.id&&['pending','confirmed','arrived'].includes(b.status)&&minute(b.bookingTime)<=now&&now<minute(b.bookingTime)+Number(b.duration||0)),current=workerNowState(member,{live,period,booking,clock:services.serverClock});row.dataset.workerState=current.state;row.append(node('strong',member.nameAr),node('span',current.label));if(live)row.append(serviceTimer(live));else if(period)row.append(serviceTimer(period,{availability:true}));const next=(services.queued||[]).filter(value=>value.staffId===member.id);if(next.length)row.append(node('small',next.length+' مهمة في الطابور • التالية '+next[0].startTime));const assign=button('إضافة مهمة');assign.onclick=async()=>{await navigate('tasks');document.dispatchEvent(new CustomEvent('mz:queue-task-draft',{detail:{branchId,staffId:member.id}}));};const actions=node('div');actions.className='worker-row-actions';actions.append(assign);const busy=button('تحديد مدة انشغال');busy.onclick=async()=>{await navigate('teamAvailability');document.dispatchEvent(new CustomEvent('mz:worker-availability',{detail:{branchId,staffId:member.id}}));};actions.append(busy);row.append(actions);team.append(row)}
    team.append(node('small','عدم وجود خدمة جارية لا يضمن وجود موعد للحجز؛ الشيفت والحجوزات والراحة تُراجع بالخادم.'));const manage=button('إدارة العمال والتوفر');manage.onclick=()=>navigate('teamAvailability');team.append(manage);content.append(team);syncServiceClock(team,services.serverNowMs);
    const queue=node('section');queue.className='operation-queue';queue.append(node('h3','طابور حجوزات اليوم'));
    const bookings=calendar.bookings.filter(b=>['pending','confirmed','arrived'].includes(b.status)).sort((a,b)=>String(a.bookingTime).localeCompare(String(b.bookingTime)));
    for(const b of bookings){const row=node('article');row.className='queue-row';row.dataset.bookingId=b.id||b.code;row.append(node('strong',(b.customerName||'عميل')+' • '+(b.bookingTime||'—')),node('p',(b.serviceNamesAr||[]).join(' + ')),node('small',(b.staffNameAr||'بدون عامل')+' • '+({pending:'قيد المراجعة',confirmed:'في الانتظار — مؤكد',arrived:'وصل العميل'})[b.status]));
      if(b.staffId){const assign=button('إضافة لطابور العامل');assign.onclick=async()=>{await navigate('tasks');document.dispatchEvent(new CustomEvent('mz:queue-task-draft',{detail:{branchId,staffId:b.staffId,bookingId:b.id||b.code}}));};row.append(assign);}
      if(['pending','confirmed'].includes(b.status)){const arrived=button('تسجيل وصول');arrived.onclick=async()=>{if(!confirm('تسجيل حضور العميل للفرع؟'))return;arrived.disabled=true;try{await changeBooking(b.id||b.code,'arrived');await load(root)}catch(e){status.textContent=e.message;arrived.disabled=false}};row.append(arrived)}queue.append(row)}
    if(!bookings.length)queue.append(node('p','لا توجد حجوزات نشطة لهذا اليوم.'));const all=button('فتح الحجوزات وإجراءاتها');all.onclick=()=>navigate('bookings');queue.append(all);content.append(queue);status.textContent='آخر تحديث '+services.serverClock.time+' • التحديث يدوي لتقليل القراءة.';
  }
  document.addEventListener('mz:service-clock-expired',()=>{if(active==='branchOperations'&&!document.hidden)document.dispatchEvent(new Event('mz:service-board-refresh'));});
  document.addEventListener('mz:service-board-refresh',()=>{if(active==='branchOperations'&&!document.hidden){const root=document.getElementById('branchOperations');if(root?.classList.contains('active'))void load(root);}});
  function requestForm(root,group,branchId,refreshList){
    const details=node('details');details.className='workspace-request-create';details.append(node('summary',group==='needs'?'تسجيل نقص أو عطل':'تسجيل طلب عميل'));
    const form=node('form');form.className='workspace-request-form';const fields={};
    for(const [name,title,tag]of [['type','نوع الطلب','select'],['title','عنوان مختصر','input'],...(group==='customer'?[['bookingId','رقم الحجز أو الشيك','input']]:[]),['details','التفاصيل وسبب الطلب','textarea']]){const label=node('label',title),input=node(tag);input.name=name;input.required=true;if(tag!=='select'){input.maxLength=name==='details'?600:100;input.minLength=3;}else for(const [value,text]of Object.entries(types).filter(([type])=>group==='needs'?['SUPPLY','EQUIPMENT'].includes(type):!['SUPPLY','EQUIPMENT'].includes(type))){const option=node('option',text);option.value=value;input.append(option)}label.append(input);form.append(label);fields[name]=input;}
    let key='';form.oninput=()=>key='';const submit=button('تسجيل الطلب');submit.type='submit';submit.classList.add('primary');const feedback=node('p');feedback.setAttribute('role','status');form.append(submit,feedback);details.append(form);root.append(details);
    form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity())return;submit.disabled=true;try{await submitBranchWorkRequest({branchId,type:fields.type.value,title:fields.title.value,details:fields.details.value,...(fields.bookingId?{bookingId:fields.bookingId.value.trim()}:{}),idempotencyKey:key||=crypto.randomUUID()});key='';form.reset();feedback.textContent='اتسجل للمتابعة. التسجيل لا ينفذ إلغاء أو استرداد أو شراء تلقائيًا.';await refreshList()}catch(e){feedback.textContent=e.message}finally{submit.disabled=false}};
  }
  async function requests(root,branchId,v,append=false){
    const group=root.id==='branchNeeds'?'needs':'customer',status=root.querySelector('[data-workspace-status]'),content=root.querySelector('[data-workspace-content]');
    const data=await getBranchWorkRequests({branchId,group,...(append&&root.dataset.cursor?{cursor:root.dataset.cursor}:{})});if(v!==generation)return;if(!append)content.replaceChildren();
    for(const row of data.items){const card=node('details');card.className='workspace-request';card.append(node('summary',types[row.type]+' • '+row.title+' • '+statuses[row.status]),node('p',row.details));if(row.bookingId)card.append(node('p','العملية: '+row.bookingId));if(row.resolution)card.append(node('p','المتابعة: '+row.resolution));
      if(state.role==='admin'&&!['RESOLVED','REJECTED'].includes(row.status)){const form=node('form');form.className='workspace-request-form';const label=node('label','حالة متابعة الطلب'),select=node('select');for(const [id,text]of Object.entries(statuses).filter(([id])=>id!=='NEW')){const option=node('option',text);option.value=id;select.append(option)}label.append(select);const reasonLabel=node('label','الإجراء أو سبب الحسم'),reason=node('textarea');reason.required=true;reason.minLength=3;reason.maxLength=400;reasonLabel.append(reason);const save=button('حفظ المتابعة');save.type='submit';form.append(label,reasonLabel,save);form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;save.disabled=true;try{await updateBranchWorkRequest({branchId,id:row.id,expectedVersion:row.version,status:select.value,resolution:reason.value});await load(root)}catch(error){status.textContent=error.message;save.disabled=false}};card.append(form)}content.append(card)}
    root.dataset.cursor=data.nextCursor||'';const more=root.querySelector('[data-workspace-more]');more.hidden=!data.nextCursor;status.textContent=content.children.length?`المعروض ${content.children.length} طلب — حسب الفرع المختار.`:'لا توجد طلبات في الفرع.';
  }
  async function load(root,append=false){const v=++generation,branchId=root.querySelector('.workspace-controls select')?.value,status=root.querySelector('[data-workspace-status]');if(!branchId)return;status.textContent='جارٍ تحميل بيانات الفرع…';root.querySelectorAll('.workspace-controls button,[data-workspace-more]').forEach(b=>b.disabled=true);try{if(root.id==='branchOperations')await operations(root,branchId,v);else await requests(root,branchId,v,append)}catch(e){if(v===generation)status.textContent=e.message||'تعذر تحميل البيانات؛ أعد المحاولة'}finally{if(v===generation)root.querySelectorAll('.workspace-controls button,[data-workspace-more]').forEach(b=>b.disabled=false)}}
  async function open(id,selected=''){if(!['branchOperations','customerRequests','branchNeeds'].includes(id)){active=id;generation++;return;}
    const root=document.getElementById(id);active=id;root.replaceChildren(node('h2',labels[id]));const {select,refresh}=controls(root);if(selected&&[...select.options].some(o=>o.value===selected))select.value=selected;const status=node('p');status.dataset.workspaceStatus='';status.setAttribute('role','status');root.append(status);
    if(id!=='branchOperations'){root.append(node('p','سجل متابعة للفرع؛ التنفيذ المالي أو تعديل الحجز يظل في المسار الأصلي وبصلاحياته.'));requestForm(root,id==='branchNeeds'?'needs':'customer',select.value,()=>load(root));}
    if(id==='customerRequests'){const bookingActions=button('الحجوزات وإجراءات الإلغاء والاسترداد');bookingActions.onclick=()=>navigate('bookings');root.append(bookingActions);}
    const content=node('div');content.dataset.workspaceContent='';root.append(content);const more=button('تحميل الأقدم');more.dataset.workspaceMore='';more.hidden=true;more.onclick=()=>load(root,true);root.append(more);refresh.onclick=()=>load(root);select.onchange=()=>open(id,select.value);await load(root);
  }
  // Branch changes reset forms and pending drafts; never submit into a new scope.
  document.addEventListener('change',event=>{if(event.target.id==='headerBranchFilter'&&['branchOperations','customerRequests','branchNeeds'].includes(active))void open(active)});
  return {open,labels};
}
