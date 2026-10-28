import {createCursorPager} from './cursor-pager.js';
const node=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n;};
export function mountWorkerHome({anchor,getContext,history,enablePush}){
 if(!anchor)return null;const panel=node('article');panel.className='worker-home-panel';
 const header=node('header'),title=node('div');title.append(node('small','شغلك اللي خلصته'),node('h2','سجل حجوزاتي'));const refresh=node('button','تحديث السجل');refresh.type='button';header.append(title,refresh);
 const note=node('p','الزيارات والشيكات المكتملة والمحصلة في فرعك الحالي، من الأحدث للأقدم.');note.className='worker-home-note';
 const message=node('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');const list=node('div');list.className='worker-home-history';
 const nav=node('nav');nav.setAttribute('aria-label','صفحات سجل الحجوزات');nav.className='catalog-pagination';const prev=node('button','السابق'),next=node('button','التالي'),page=node('span');prev.type=next.type='button';prev.disabled=next.disabled=true;nav.append(prev,page,next);panel.append(header,note,message,list,nav);
 const push=node('section');push.className='worker-home-push';const pushTitle=node('h3','خليك متابع شغلك'),pushNote=node('p'),pushButton=node('button','تفعيل تنبيهات الموبايل');pushButton.type='button';push.append(pushTitle,pushNote,pushButton);anchor.append(push,panel);
 let version=0,signature='',scope='',disposed=false,pending=false;
 const pager=createCursorPager(history,{take:20,maxHistory:1000});
 function pushState(){if(globalThis.__USE_EMULATORS__){pushNote.textContent='تنبيهات حسابك متاحة في الجرس. تنبيهات الموبايل الفعلية تحتاج النسخة المنشورة وإعداد إشعارات الجهاز.';pushButton.hidden=true;}else{pushNote.textContent='الحجوزات الجديدة بعد موافقة الكاشير، والمهام والتنبيهات المهمة توصلك هنا وعلى جهازك بعد السماح بالإشعارات.';pushButton.hidden=false;}}
 async function load(direction='reset'){
  const context=getContext();if(disposed||!context.uid||!context.activeBranchId)return;const key=JSON.stringify([context.uid,context.activeBranchId]),stamp=++version;pending=true;prev.disabled=next.disabled=refresh.disabled=true;message.textContent='جاري تحميل سجل حجوزاتك…';
  try{const result=await pager[direction]({activeBranchId:context.activeBranchId});if(disposed||stamp!==version||key!==JSON.stringify([getContext().uid,getContext().activeBranchId])||!result)return;
   list.replaceChildren();for(const row of result.items||[]){const card=node('article');card.className='worker-history-card';card.dataset.entity=row.id;card.append(node('time',(row.bookingDate||'')+' • '+(row.bookingTime||'')),node('h3',row.customerName||'عميل'),node('p',(row.serviceNamesAr||[]).join(' + ')||'تفاصيل الخدمات غير متاحة'),node('small','مكتمل • تم التحصيل'));list.append(card);}if(!(result.items||[]).length)list.append(node('p','أول زيارة مكتملة ومحصلة هتظهر هنا. يوم موفق وشغل يشرّفك!'));
   page.textContent='صفحة '+result.page;prev.disabled=!result.canPrevious;next.disabled=!result.canNext;message.textContent='';
  }catch(error){if(!disposed&&stamp===version)message.textContent=error.message||'تعذر تحميل السجل؛ حاول تاني';}
  finally{if(!disposed&&stamp===version){pending=false;refresh.disabled=false;}}
 }
 refresh.onclick=()=>void load();prev.onclick=()=>{if(!pending)void load('previous');};next.onclick=()=>{if(!pending)void load('next');};
 pushButton.onclick=async()=>{if(pushButton.disabled)return;pushButton.disabled=true;try{await enablePush();pushNote.textContent='تم ربط إشعارات هذا الجهاز بحسابك.';pushButton.textContent='تحديث ربط إشعارات الجهاز';}catch(error){pushNote.textContent=({PUSH_DENIED:'اسمح بالإشعارات من إعدادات المتصفح، وبعدها اضغط تفعيل تاني.',PUSH_NOT_CONFIGURED:'إشعارات الجهاز غير متاحة حاليًا على هذه النسخة أو هذا المتصفح. تنبيهات الحساب تفضل موجودة في الجرس.',PUSH_TOKEN_FAILED:'تعذر ربط إشعارات الجهاز؛ حاول تاني بالإنترنت.'})[error.message]||error.message||'تعذر تفعيل الإشعارات. اسمح بها من إعدادات المتصفح وحاول تاني.';}finally{pushButton.disabled=false;}};
 pushState();
 return {load,sync(workspace){const context=getContext(),key=JSON.stringify([context.uid,context.activeBranchId]),stamp=workspace.dateKey+'|'+(workspace.bookings||[]).filter(row=>row.status==='completed'&&row.paymentStatus==='paid').map(row=>row.id+':'+(row.updatedAt||'')).sort().join('|');if(key!==scope||stamp!==signature){if(key!==scope){version++;list.replaceChildren();page.textContent='';}scope=key;signature=stamp;void load();}},dispose(){disposed=true;version++;push.remove();panel.remove();}};
}
export function workerEncouragement(workspace){const options=['كل عميل مبسوط بشغلك خطوة لقدّام. يومك مليان إنجاز إن شاء الله.','اهتمامك بالتفاصيل هو اللي بيخلّي العميل يرجعلك. كمّل بنفس الاهتمام.','خدمة كويسة وتعامل محترم بيصنعوا فرق كل يوم. بالتوفيق في ورديتك.'];const key=String(workspace.dateKey||'')+String(workspace.staff?.id||'');return options[[...key].reduce((sum,char)=>sum+char.charCodeAt(0),0)%options.length];}
