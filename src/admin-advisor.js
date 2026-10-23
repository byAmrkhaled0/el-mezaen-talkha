import {adminAssistantResponse} from './assistant-provider.js';
import {getAdminBusinessInsights,adminBusinessAssistant,prepareAdminTargetAction,confirmAdminTargetAction} from './admin-api.js';
import './admin-advisor.css';
const mounted=new WeakMap();
const money=n=>new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(Number(n)||0)+' ج.م.';
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
export function mountAdminAdvisor({role,root=document}){
 const host=root.querySelector('#adminAssistant');if(!host)return;host.hidden=role!=='admin';if(role!=='admin'||mounted.has(host))return;
 const state={busy:false,version:0,history:[],proposal:null,draft:null,lastReport:null};mounted.set(host,state);
 host.append(el('h2','مساعد المزين — التسويق والتشغيل'),el('p','حلّل فترة لحد31 يوم، قارن الفروع، واسأل عن خطوات تساعدك تحقق التارجت. الاقتراحات لا تنشر عروض ولا تغيّر أسعار.','advisor-intro'));
 const form=el('form',null,'advisor-filters');
 const field=(title,input)=>{const label=el('label',title);label.append(input);form.append(label);return input;};
 const branch=field('الفرع',el('select'));for(const [id,name]of [['all','الفرعين معًا'],['talkha','طلخا'],['mashaya','المشاية']]){const o=el('option',name);o.value=id;branch.append(o);}
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const month=field('شهر التارجت',el('input'));month.type='month';month.value=today.slice(0,7);
 const from=field('من',el('input'));from.type='date';from.value=today.slice(0,8)+'01';
 const to=field('إلى',el('input'));to.type='date';to.value=today;to.max=today;
 const analyze=el('button','حلّل الشغل','primary');analyze.type='submit';form.append(analyze);host.append(form);
 const notice=el('p','التحليل بيتحمّل لما تطلبه؛ مفيش تحديث تلقائي.','advisor-notice');notice.setAttribute('role','status');host.append(notice);
 const report=el('div',null,'advisor-report');host.append(report);
 const chat=el('form',null,'advisor-chat');const label=el('label','اسأل مساعد المزين');const input=el('textarea');input.rows=3;input.maxLength=1600;input.placeholder='مثال: إيه الخدمة الأكثر طلبًا في طلخا؟ واقترح خطة للتارجت.';label.append(input);const send=el('button','ابعت السؤال','primary');send.type='submit';chat.append(label,send);host.append(chat);
 const reply=el('div',null,'advisor-reply');reply.setAttribute('aria-live','polite');host.append(reply);
 const proposal=el('div',null,'advisor-proposal');host.append(proposal);
 const scope=()=>({branchId:branch.value,month:month.value,from:from.value,to:to.value});
 const invalidate=()=>{state.lastReport=null;state.version++;state.history=[];state.proposal=null;state.draft=null;proposal.replaceChildren();reply.replaceChildren();report.replaceChildren();notice.textContent='الفترة أو الفرع اتغير؛ اطلب تحليل جديد.';};
 for(const i of [branch,month,from,to])i.addEventListener('change',invalidate);
 async function busy(task){if(state.busy)return;state.busy=true;host.setAttribute('aria-busy','true');host.querySelectorAll('button,input,select,textarea').forEach(x=>x.disabled=true);try{await task();}catch(e){notice.textContent=e.message||'تعذر تحميل التحليل؛ جرّب تاني.';}finally{state.busy=false;host.removeAttribute('aria-busy');host.querySelectorAll('button,input,select,textarea').forEach(x=>x.disabled=false);}}
 function render(result){state.lastReport=result;report.replaceChildren();notice.textContent=result.facts.coverage;
  for(const b of result.facts.branches){const card=el('article',null,'advisor-branch');card.append(el('h3',b.name),el('p',`طلبات الفترة: ${b.orderCount} — السابقة: ${b.previousOrderCount} — الملغي: ${b.cancelledCount}`),el('p',`صافي الإيراد: ${money(b.netRevenue)} — تارجت ${result.facts.month}: ${money(b.target.target)} — المتبقي: ${b.target.remaining==null?'غير محدد':money(b.target.remaining)}`));
   const list=el('ul');for(const d of b.demand)list.append(el('li',`${d.name}: ${d.quantity} وحدة — الفترة السابقة: ${d.previousQuantity}`));if(!b.demand.length)list.append(el('li','مفيش طلبات كفاية لترتيب الخدمات.'));card.append(el('h4','الأكثر طلبًا'),list);
   const workers=el('details');workers.append(el('summary','أداء الفريق ('+b.workers.length+')'));for(const w of b.workers)workers.append(el('p',`${w.name} — رقم العامل: ${w.staffId} — إيراد الفترة المنسوب له: ${money(w.attributedNetRevenue)} — تارجت الشهر: ${money(w.monthlyTarget)}`));card.append(workers);report.append(card);}
  const ideas=el('ul',null,'advisor-ideas');for(const idea of result.recommendations)ideas.append(el('li',idea));report.append(ideas);
 }
 async function showProposal(action){state.proposal=action;state.draft=null;proposal.replaceChildren(el('h3','اقتراح تارجت — لم يتم الحفظ'),el('p',`${action.kind==='workerTarget'?'تارجت العامل '+action.staffId:'تارجت الفرع'} — ${action.branchId==='talkha'?'طلخا':'المشاية'} — ${action.month} — ${money(action.targetAmount)}`));
  const review=el('button','راجع التعديل قبل الحفظ','small-button');review.type='button';proposal.append(review);review.onclick=()=>busy(async()=>{const draft=await prepareAdminTargetAction({action});state.draft=draft;proposal.replaceChildren(el('h3','تأكيد تعديل التارجت'),el('p',`${draft.label} — شهر ${draft.action.month} — ${draft.action.branchId==='talkha'?'طلخا':'المشاية'}`),el('p',`القيمة الشهرية الحالية: ${draft.before==null?'غير محددة':money(draft.before)} ← الجديدة: ${money(draft.action.targetAmount)}`),el('p','التعديل للتارجت فقط؛ لا يغيّر رواتب أو مكافآت. التأكيد صالح10 دقائق.'));
   const confirm=el('button','أؤكد حفظ التارجت','primary');confirm.type='button';const cancel=el('button','إلغاء','small-button');cancel.type='button';proposal.append(confirm,cancel);cancel.onclick=()=>{state.draft=null;proposal.replaceChildren();};confirm.onclick=()=>busy(async()=>{await confirmAdminTargetAction({draftId:draft.draftId,confirmed:true});state.draft=null;proposal.replaceChildren(el('p','اتحفظ التارجت واتسجل في سجل النشاط.'));render(await getAdminBusinessInsights(scope()));document.dispatchEvent(new CustomEvent('mz:targets-updated'));});});
 }
 form.addEventListener('submit',e=>{e.preventDefault();busy(async()=>{render(await getAdminBusinessInsights(scope()));});});
 chat.addEventListener('submit',e=>{e.preventDefault();if(!input.value.trim())return;busy(async()=>{const message=input.value.trim();const result=await adminAssistantResponse({report:state.lastReport,insights:getAdminBusinessInsights,ask:adminBusinessAssistant,scope:scope(),message,history:state.history});render(result);reply.replaceChildren(el('strong',result.mode==='model'?'رد المساعد الذكي':'تحليل محلي — الموديل الحي غير متاح'),el('p',result.message));state.history.push({role:'user',content:message},{role:'assistant',content:result.message});state.history=state.history.slice(-6);input.value='';proposal.replaceChildren();if(result.proposal)await showProposal(result.proposal);});});
}
