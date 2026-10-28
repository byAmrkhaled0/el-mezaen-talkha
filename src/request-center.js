// DOM-only request UI. APIs and authorized working context are supplied by each portal.
export const requestLabels = { PENDING:'بانتظار المراجعة', UNDER_REVIEW:'قيد المراجعة', APPROVED:'معتمد إداريًا', REJECTED:'مرفوض', CANCELLED:'ملغي', DISBURSED:'مصروف' };
const branchName = id => ({talkha:'طلخا',mashaya:'المشاية'})[id] || id;
const amount = value => `${Number(value).toLocaleString('ar-EG')} ج.م`;
const node = (tag,text='',className='') => {const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;};
const time = value => value ? new Date(value).toLocaleString('ar-EG') : 'غير متاح';
const icon = type => {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [k,v] of Object.entries({viewBox:'0 0 24 24',width:'24',height:'24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(k,v);
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('d',type==='LEAVE'?'M4 5h16v16H4V5ZM8 3v4m8-4v4M4 10h16m-10 4h4':'M3 6h17v14H3V6Zm0 4h17m-5 3h7v4h-7v-4Z');svg.append(path);return svg;
};
function card(row,role,action,integration,balanceLookup) {
  const c=node('article','',role==='worker'?'worker-panel request-card':'admin-panel request-card');
  c.dataset.entity=row.id;
  const head=node('header','', 'request-card-head'), badge=node('span',row.requestType==='LEAVE'&&row.integrationStatus==='ACTIVE'?'إجازة نشطة':requestLabels[row.status]||row.status,'request-badge');badge.dataset.status=row.status;
  head.append(icon(row.requestType),node('h3',row.requestType==='LEAVE'?'طلب إجازة':'طلب سلفة'),badge);c.append(head);
  c.append(node('p',`${row.staffNameAr} • ${branchName(row.branchId)}`),node('p',row.requestType==='LEAVE'?`${row.requestData.startDate} — ${row.requestData.endDate} • ${({PERSONAL:'شخصية',SICK:'مرضية',OTHER:'أخرى'})[row.requestData.leaveType]||row.requestData.leaveType}`:amount(row.requestData.amount)),node('p',row.requestData.reason));
  if(row.requestData.note)c.append(node('p',row.requestData.note));
  c.append(node('small',`تاريخ التقديم: ${time(row.createdAt)}`));
  if(row.status==='APPROVED')c.append(node('p',row.requestType==='LEAVE'?(row.integrationStatus==='ACTIVE'?'تم تفعيل الإجازة في جدول العمل':'معتمد إداريًا — بانتظار التفعيل في جدول العمل'):'اعتماد إداري؛ السلفة لم تُصرف بعد'));
  if(row.requestType==='SALARY_ADVANCE'&&row.status==='DISBURSED'){
    c.append(node('p',`تم صرف السلفة • ${amount(row.approvedAmount)} • ${time(row.disbursedAt)} • مرجع الحركة: ${row.disbursementReference}`),node('p',`خُصم من الرواتب: ${amount(Number(row.advanceDeductedCents||0)/100)} • المبلغ المتبقي: ${amount(Number(row.advanceRemainingCents||0)/100)}`));
  }
  if(row.responseNote)c.append(node('p',`رد الإدارة: ${row.responseNote}`));
  const details=node('section'),history=node('ol');const historyButton=node('button','سجل الطلب','small-button');historyButton.type='button';historyButton.setAttribute('aria-expanded','false');history.hidden=true;historyButton.onclick=()=>{history.hidden=!history.hidden;historyButton.setAttribute('aria-expanded',String(!history.hidden));};details.append(historyButton);
  for(const item of Object.values(row.reviewHistory||{}).sort((a,b)=>a.version-b.version))history.append(node('li',`${time(item.at)} • ${({admin:'الإدارة',manager:'المدير',worker:'العامل'})[item.actorRole]||item.actorRole} • ${requestLabels[item.to]||item.to}${item.note?` — ${item.note}`:''}`));
  details.append(history);c.append(details);
  if(['PENDING','UNDER_REVIEW'].includes(row.status)){
    const controls=node('div','','worker-actions request-actions');
    const note=node('textarea');note.maxLength=500;note.rows=2;note.setAttribute('aria-label',role==='worker'?'سبب الإلغاء اختياري':'ملاحظة المراجعة أو القرار');
    const choices=role==='worker'?[['CANCEL','إلغاء الطلب']]:role==='admin'?[['REVIEW','إضافة مراجعة'],['APPROVE','اعتماد'],['REJECT','رفض']]:[['REVIEW','إضافة مراجعة']];
    const attempts=new Map();
    for(const [operation,label] of choices){
      const b=node('button',label,'small-button');b.type='button';
      b.onclick=async()=>{
        if(b.disabled)return;
        if(['REVIEW','REJECT'].includes(operation)&&!note.value.trim()){note.setCustomValidity('اكتب الملاحظة أولًا');note.reportValidity();return;}
        note.setCustomValidity('');const fingerprint=JSON.stringify([operation,note.value]);
        if(!attempts.has(fingerprint))attempts.set(fingerprint,crypto.randomUUID());
        const buttons=[...controls.querySelectorAll('button')];buttons.forEach(n=>n.disabled=true);note.disabled=true;
        try{await action({requestId:row.requestId,action:operation,note:note.value,idempotencyKey:attempts.get(fingerprint),expectedVersion:row.version});}
        finally{buttons.forEach(n=>n.disabled=false);note.disabled=false;}
      };controls.append(b);
    }
    note.oninput=()=>note.setCustomValidity('');c.append(note,controls);
  }
  if(row.requestType==='LEAVE'&&row.status==='APPROVED'&&row.integrationStatus!=='ACTIVE'&&['admin','manager'].includes(role)&&integration){
    const controls=node('div','','worker-actions request-actions'),feedback=node('div');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    const operations=role==='admin'?[['CHECK','فحص تعارض الحجوزات'],['ACTIVATE','تفعيل الإجازة المعتمدة / إعادة المحاولة']]:[['CHECK','فحص تعارض الحجوزات']];
    for(const [operation,label] of operations){const button=node('button',label,'small-button');button.type='button';
      button.onclick=async()=>{const buttons=[...controls.querySelectorAll('button')];if(button.disabled)return;buttons.forEach(b=>b.disabled=true);feedback.replaceChildren(node('p','جارٍ التحقق من الجدول…'));
        try{const result=await integration(operation,{requestId:row.requestId});if(!c.isConnected)return;
          feedback.replaceChildren(node('p',result.active?'تم تفعيل الإجازة':result.conflicts?.length?'التفعيل متوقف بسبب حجوزات قائمة؛ لن يتم تغييرها':'لا توجد حجوزات متعارضة؛ يمكن للإدارة التفعيل'));
          if(result.conflicts?.length){const details=node('section'),list=node('ul');details.append(node('h4','الحجوزات المتعارضة'));
            for(const conflict of result.conflicts)list.append(node('li',`${conflict.bookingId} • ${conflict.bookingDate} ${conflict.bookingTime} • ${branchName(conflict.branchId)} • ${conflict.status}`));details.append(list);details.open=true;feedback.append(details);}
        }catch(error){if(c.isConnected)feedback.replaceChildren(node('p',error.message||'تعذر التحقق أو التفعيل'));}finally{buttons.forEach(b=>b.disabled=false);}
      };controls.append(button);
    }c.append(controls,feedback);
  }
  if(role==='admin'&&row.requestType==='SALARY_ADVANCE'&&balanceLookup){const b=node('button','عرض رصيد السلف الحالي','small-button'),feedback=node('p');b.type='button';feedback.setAttribute('role','status');b.onclick=async()=>{b.disabled=true;try{const value=await balanceLookup({staffId:row.staffId});if(c.isConnected)feedback.textContent=`الرصيد المتبقي للعامل: ${amount(value.outstandingAdvance)}`;}catch(e){feedback.textContent=e.message||'تعذر قراءة الرصيد';}finally{b.disabled=false;}};c.append(b,feedback);}
  return c;
}
function requestList(root,context,api,onResult=()=>{}) {
  const $=s=>root.querySelector(s),list=$('[data-request-list]'),status=$('[data-request-status]');
  let generation=0,cursor=null,next=null,previous=[];
  const report=message=>status.textContent=message;
  function invalidate(){++generation;list.replaceChildren();next=null;previous=[];cursor=null;$('[data-request-next]').hidden=true;$('[data-request-prev]').hidden=true;}
  async function load(reset=true,target=null){
    if(reset){previous=[];cursor=null;}else cursor=target;
    const version=++generation,ctx=context(),branchId=ctx.branchId;list.replaceChildren();report('جارٍ تحميل الطلبات…');root.setAttribute('aria-busy','true');
    $('[data-request-next]').hidden=true;$('[data-request-prev]').hidden=true;
    try{
      const result=await api.getWorkerRequests({branchId,status:$('[data-request-filter]').value,cursor});
      if(version!==generation||branchId!==context().branchId)return;
      next=result.nextCursor;list.replaceChildren(...result.items.map(row=>card(row,ctx.role,async payload=>{
        try{const response=await api.updateWorkerRequest(payload);await load();report(response.notificationDeferred?'تم حفظ القرار؛ إشعار الجهاز مؤجل':'تم تحديث الطلب');}
        catch(e){report(e.message||'تعذر تحديث الطلب');}
      },async(operation,payload)=>{
        const response=await (operation==='ACTIVATE'?api.activateWorkerLeave(payload):api.checkWorkerLeaveConflicts(payload));
        if(version!==generation||branchId!==context().branchId)return response;
        if(response.active){await load();report(response.notificationDeferred?'تم التفعيل؛ إشعار الجهاز مؤجل':'الإجازة نشطة في جدول العمل');}
        return response;
      },api.getWorkerAdvanceBalance)));

      if(!result.items.length)list.append(node('p','لا توجد طلبات في هذه الصفحة'));
      $('[data-request-next]').hidden=!next;$('[data-request-prev]').hidden=!previous.length;onResult(result);report('');
    }catch(e){if(version===generation)report(e.message||'تعذر تحميل الطلبات');}
    finally{if(version===generation)root.setAttribute('aria-busy','false');}
  }
  $('[data-request-filter]').onchange=()=>load();$('[data-request-refresh]').onclick=()=>load();
  $('[data-request-next]').onclick=()=>{if(!next)return;previous.push(cursor);return load(false,next);};
  $('[data-request-prev]').onclick=()=>{if(!previous.length)return;return load(false,previous.pop());};
  return {load,invalidate,report};
}
export function createWorkerRequestCenter(context,api) {
  const root=document.getElementById('workerRequests'),advance=root.querySelector('[data-advance-form]'),leave=root.querySelector('[data-leave-form]');
  let policy=null,branch=null;const submissionKeys=new Map();
  const list=requestList(root,()=>({role:'worker',branchId:context()?.activeBranchId}),api,result=>{
    policy=result.policy;const enabled=policy?.enabled===true&&Number(policy.maxPerRequest)>0;
    advance.querySelector('[data-advance-info]').textContent=enabled?`الحد الأقصى لكل طلب: ${amount(policy.maxPerRequest)}. يمكن تقديم أكثر من طلب في الشهر.`:'السلف غير مفعلة أو الحد غير مضبوط؛ تواصل مع الإدارة';
    advance.querySelector('button[type=submit]').disabled=!enabled;
    if(enabled)advance.elements.amount.max=policy.maxPerRequest;else advance.elements.amount.removeAttribute('max');
  });
  for(const [form,type] of [[advance,'SALARY_ADVANCE'],[leave,'LEAVE']]){
    form.oninput=()=>submissionKeys.delete(type);
    form.onsubmit=async event=>{
      event.preventDefault();const button=form.querySelector('button[type=submit]');if(button.disabled||!form.reportValidity())return;
      const branchId=context()?.activeBranchId;if(!branchId)return;
      if(!submissionKeys.has(type))submissionKeys.set(type,crypto.randomUUID());const key=submissionKeys.get(type);const fields=[...form.querySelectorAll('input,textarea,select,button')];fields.forEach(n=>n.disabled=true);
      const data={reason:form.elements.reason.value,note:form.elements.note.value};
      if(type==='SALARY_ADVANCE')data.amount=Number(form.elements.amount.value);
      else Object.assign(data,{startDate:form.elements.startDate.value,endDate:form.elements.endDate.value,leaveType:form.elements.leaveType.value});
      try{const response=await api.submitWorkerRequest({branchId,requestType:type,requestData:data,idempotencyKey:key});if(context()?.activeBranchId!==branchId)return;form.reset();submissionKeys.delete(type);root.querySelector('[data-request-filter]').value='all';await list.load();list.report(response.notificationDeferred?'تم تقديم الطلب؛ إشعار الجهاز مؤجل':'تم تقديم الطلب للمراجعة');}
      catch(e){if(context()?.activeBranchId===branchId)list.report(e.message||'تعذر تقديم الطلب');}
      finally{fields.forEach(n=>n.disabled=false);button.disabled=type==='SALARY_ADVANCE'&&!(policy?.enabled&&policy.maxPerRequest>0);}
    };
  }
  return {load:()=>list.load(),contextChanged(){
    const current=context()?.activeBranchId;if(branch===current)return;branch=current;policy=null;submissionKeys.clear();list.invalidate();advance.reset();leave.reset();advance.querySelector('button[type=submit]').disabled=true;
    if(!root.hidden)void list.load();
  }};
}
export function createAdminRequestCenter(context,api) {
  const root=document.getElementById('workerRequests'),branch=root.querySelector('[data-request-branch]'),limits=root.querySelector('[data-limit-panel]'),form=root.querySelector('[data-limit-form]');
  let configured=false,staffCursor=null,policyVersion=0,policyStaff='',policyGeneration=0;
  const list=requestList(root,()=>({role:context().role,branchId:branch.value}),api);
  const select=form.elements.staffId,policyStatus=root.querySelector('[data-policy-status]');
  const say=text=>policyStatus.textContent=text;
  async function loadPolicy(){
    const staffId=select.value,version=++policyGeneration;policyStaff='';form.querySelector('button[type=submit]').disabled=true;if(!staffId)return;
    try{const result=await api.getWorkerAdvancePolicy(staffId);if(version!==policyGeneration||select.value!==staffId)return;
      policyStaff=staffId;policyVersion=result.policy?.version||0;form.elements.enabled.checked=result.policy?.enabled===true;form.elements.maxPerRequest.required=form.elements.enabled.checked;form.elements.maxPerRequest.value=result.policy?.maxPerRequest||'';say(`إعداد ${result.staffNameAr} — الحد لكل طلب مستقل`);form.querySelector('button[type=submit]').disabled=false;
    }catch(e){if(version===policyGeneration)say(e.message||'تعذر تحميل الحد');}
  }
  async function loadStaff(cursor=''){
    if(context().role!=='admin')return;select.disabled=true;form.querySelector('button[type=submit]').disabled=true;
    try{const page=await api.getCollection('staff',25,cursor,'all');staffCursor=page.nextCursor;
      select.replaceChildren(node('option','اختر عاملًا'));select.firstElementChild.value='';
      for(const staff of page.items){const option=node('option',`${staff.nameAr||staff.id} — ${staff.id}`);option.value=staff.id;select.append(option);}
      root.querySelector('[data-staff-next]').hidden=!staffCursor;policyStaff='';say('اختر العامل لعرض الحد الحالي');
    }catch(e){say(e.message||'تعذر تحميل الفريق');}finally{select.disabled=false;}
  }
  select.onchange=loadPolicy;
  root.querySelector('[data-staff-next]').onclick=()=>loadStaff(staffCursor);
  root.querySelector('[data-staff-first]').onclick=()=>loadStaff();
  form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector('button[type=submit]');if(button.disabled||!form.reportValidity()||policyStaff!==select.value)return;
    button.disabled=true;select.disabled=true;
    try{const enabled=form.elements.enabled.checked;await api.setWorkerAdvancePolicy({staffId:policyStaff,enabled,maxPerRequest:form.elements.maxPerRequest.value?Number(form.elements.maxPerRequest.value):null,expectedVersion:policyVersion});await loadPolicy();say('تم حفظ الحد؛ الطلبات الموجودة تحتفظ بإعدادها السابق');}
    catch(e){say(e.message||'تعذر حفظ الحد؛ أعد اختيار العامل لتحميل الإعداد الحالي');}finally{select.disabled=false;button.disabled=policyStaff!==select.value;}
  };
  form.elements.enabled.onchange=()=>form.elements.maxPerRequest.required=form.elements.enabled.checked;
  branch.onchange=()=>list.load();
  return {async load(){
    const who=context();if(who.role!=='admin'&&!(who.role==='manager'&&who.permissions.has('payroll')))return;
    if(!configured){branch.replaceChildren();if(who.role==='admin'){const all=node('option','كل الفروع');all.value='all';branch.append(all);}
      for(const id of who.branchIds){const option=node('option',branchName(id));option.value=id;branch.append(option);}limits.hidden=who.role!=='admin';configured=true;
      if(who.role==='admin')void loadStaff();
    }
    return list.load();
  }};
}
