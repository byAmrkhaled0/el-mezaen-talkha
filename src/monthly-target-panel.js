import {getMonthlyTargetProgress,setWorkerMonthlyTarget,setBranchMonthlyTarget} from './admin-api.js';
import './monthly-target-panel.css';
const mounted=new WeakMap();
const money=n=>new Intl.NumberFormat('ar-EG',{style:'currency',currency:'EGP',maximumFractionDigits:0}).format(n);
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function mountMonthlyTargetPanel({anchor,role,branchIds,activeBranchId,mode=role==='worker'?'workers':'branch'}){
 if(!anchor||!['admin','cashier','manager','worker'].includes(role))return;
 if(mounted.has(anchor)){const current=mounted.get(anchor);if(activeBranchId&&current.branch.value!==activeBranchId){current.branch.value=activeBranchId;void current.load();}return;}
 const panel=el('article');panel.className='monthly-target-panel admin-panel';
 panel.dataset.targetView=mode;const title=el('h2',role==='worker'?'تارجت الشهر بتاعك':mode==='workers'?'أهداف العمال الشهرية':'مؤشر تارجت الفرع');panel.append(title);
 const controls=el('div');controls.className='monthly-target-controls';
 const month=el('input');month.type='month';month.required=true;month.value=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).format(new Date());if(!/^\d{4}-\d{2}$/.test(month.value)){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(p=>[p.type,p.value]));month.value=parts.year+'-'+parts.month;}
 const branch=el('select');if(role==='admin'){const all=el('option','جميع الفروع');all.value='all';branch.append(all);}for(const id of branchIds){if(!['talkha','mashaya'].includes(id))continue;const option=el('option',id==='talkha'?'طلخا':'المشاية');option.value=id;branch.append(option);}if(activeBranchId)branch.value=activeBranchId;
 for(const [text,input] of [['الشهر',month],['الفرع',branch]]){const label=el('label',text);label.append(input);controls.append(label);}
 const refresh=el('button','تحديث');refresh.type='button';refresh.className='small-button';controls.append(refresh);panel.append(controls);
 const message=el('p');message.setAttribute('role','status');panel.append(message);const content=el('div');content.className='monthly-target-content';panel.append(content);anchor.prepend(panel);
 let version=0;
 function card(row,worker=false){
  const box=el('section');box.className='monthly-target-card';box.append(el('h3',worker?row.nameAr+' • '+(row.branchId==='talkha'?'طلخا':'المشاية'):row.nameAr||'هدف الفرع'));
  const p=row.progressPercent;const gauge=el('div');gauge.className='target-gauge';gauge.innerHTML='<svg viewBox="0 0 200 112" aria-hidden="true"><path class="gauge-track" d="M20 100 A80 80 0 0 1 180 100"/><path class="gauge-fill" d="M20 100 A80 80 0 0 1 180 100"/><line x1="100" y1="100" x2="100" y2="40"/><circle cx="100" cy="100" r="6"/></svg>';
  gauge.querySelector('.gauge-fill').style.strokeDashoffset=String(251.33*(1-(p||0)/100));gauge.querySelector('line').setAttribute('transform',`rotate(${-90+1.8*(p||0)} 100 100)`);
  const label=el('strong',p===null?'غير محدد':Math.round(p)+'%');gauge.append(label);gauge.setAttribute('role',p===null?'img':'meter');gauge.setAttribute('aria-label',p===null?'لم يُحدد تارجت لهذا النطاق':'نسبة تحقيق التارجت');if(p!==null){gauge.setAttribute('aria-valuemin','0');gauge.setAttribute('aria-valuemax','100');gauge.setAttribute('aria-valuenow',p);}box.append(gauge);if(worker){const bar=el('progress');bar.className='worker-target-bar';bar.max=100;bar.value=p||0;bar.setAttribute('aria-label',p===null?'التارجت غير محدد':'تحقيق التارجت '+Math.round(p)+'%');box.append(bar);}
  const state=el('b',row.status==='unset'?'التارجت غير محدد':row.achievedTarget?'تم تحقيق التارجت':'لسه ما اتحققش');state.className='target-state';state.dataset.state=row.status;box.append(state);
  const dl=el('dl');for(const [name,value]of [['التارجت',row.target>0?money(row.target):'غير محدد'],['المحقق',money(row.achieved)],['المتبقي',row.remaining===null?'—':money(row.remaining)]]){const wrap=el('div');wrap.append(el('dt',name),el('dd',value));dl.append(wrap);}box.append(dl);
  if(row.target>0&&row.source==='legacy')box.append(el('small','هدف شهري عام سابق؛ لم يُحدد هدف مستقل لهذا الشهر والفرع.'));
  if(row.canSet===true&&row.branchId!=='all'&&((worker&&['admin','cashier'].includes(role))||(!worker&&role==='admin'))){
   const form=el('form');form.className='target-edit';const input=el('input');input.type='number';input.min='0';input.max='1000000000';input.step='0.01';input.required=true;input.value=row.target;input.setAttribute('aria-label','قيمة التارجت بالجنيه');const save=el('button','حفظ التارجت');save.type='submit';save.className='small-button primary';form.append(input,save);box.append(form);
   form.addEventListener('submit',async e=>{e.preventDefault();if(!form.reportValidity())return;const scope={branchId:row.branchId,month:row.month,targetAmount:Number(input.value),...(worker?{staffId:row.staffId}:{})};save.disabled=true;try{await(worker?setWorkerMonthlyTarget(scope):setBranchMonthlyTarget(scope));await load();}catch(error){message.textContent=error.message||'تعذر حفظ التارجت';}finally{save.disabled=false;}});
  }
  if(row.locked)box.append(el('small','هدف الشهر محفوظ ومقفول. تحديد هدف جديد متاح مع بداية الشهر القادم.'));else if(['admin','cashier'].includes(role)&&!row.canSet&&row.branchId!=='all')box.append(el('small','عرض فقط؛ التحديد متاح للشهر الحالي وفي نطاق صلاحياتك.'));
  return box;
 }
 async function load(){const id=++version;const requested={month:month.value,branchId:branch.value,view:mode};if(!requested.branchId)return;refresh.disabled=true;content.replaceChildren();message.textContent='جاري تحميل التارجت…';try{const data=await getMonthlyTargetProgress(requested);if(id!==version)return;if(data.month!==requested.month||data.branchId!==requested.branchId)throw Error('نطاق التارجت غير متطابق');for(const old of anchor.querySelectorAll('.desktop-monthly-target,.owner-target,.worker-target-card'))old.hidden=true;const legacy=anchor.querySelector('#targetProgress')?.closest('article');if(legacy)legacy.hidden=true;
 if(mode==='workers'){for(const worker of data.workers||[])content.append(card(worker,true));if(!data.workers?.length)content.append(el('p','لا يوجد عمال متاحون في النطاق المختار.'));}
 else if(data.branch)content.append(card(data.branch.branchId==='all'?{...data.branch,nameAr:'المزين — كل الفروع'}:data.branch));
 message.textContent='القيم من الإيراد المسجل بالخادم • الشهر '+requested.month+' • الهدف يتحفظ مرة واحدة للشهر الحالي؛ الشهر الجديد يتفتح بتوقيت القاهرة.';}catch(error){if(id===version)message.textContent=error.message||'تعذر تحميل التارجت';}finally{if(id===version)refresh.disabled=false;}}

 refresh.addEventListener('click',load);month.addEventListener('change',load);branch.addEventListener('change',()=>{const header=document.querySelector('#headerBranchFilter');if(role!=='worker'&&header&&[...header.options].some(o=>o.value===branch.value)){header.value=branch.value;header.dispatchEvent(new Event('change',{bubbles:true}));}void load();});
 document.addEventListener('change',event=>{if(role==='worker'||!['headerBranchFilter','dashboardBranchFilter'].includes(event.target.id))return;const value=event.target.value;if(branch.value!==value&&[...branch.options].some(o=>o.value===value)){branch.value=value;void load();}});mounted.set(anchor,{load,branch});void load();
 document.addEventListener('mz:targets-updated',()=>load());
}
