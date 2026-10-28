import {serviceTimer,syncServiceClock} from './service-clock.js';
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
// Reuses the existing task form. No duplicate inputs or parallel save protocol.
export function mountWorkerTaskDrawer({getCatalog,prepareDraft}){
 const form=document.querySelector('#workerTaskForm');if(!form||document.querySelector('#workerTaskDrawer'))return;
 const host=document.querySelector('#tasks'),article=form.closest('article'),dialog=el('dialog');dialog.id='workerTaskDrawer';dialog.className='editor-dialog cashier-side-dialog';dialog.setAttribute('aria-labelledby','workerTaskDrawerTitle');
 const header=article.querySelector('.panel-head');header.querySelector('h2').id='workerTaskDrawerTitle';header.querySelector('p').textContent='الخدمة تدخل بعد الشغل الحالي، ويتراجع وقتها قبل الحفظ.';
 const close=el('button','×');close.type='button';close.className='dialog-close';close.setAttribute('aria-label','إغلاق إضافة المهمة');header.append(close);
 const entry=el('button','إضافة مهمة للعامل');entry.type='button';entry.className='small-button primary';article.before(entry);dialog.append(article);document.querySelector('.admin-main').append(dialog);
 const field=(text,input)=>{const label=el('label',text);label.append(input);return label;},mode=el('select');mode.name='taskMode';
 for(const[value,text]of [['service','خدمة أو باقة من القائمة'],['booking','حجز عميل موجود'],['manual','مهمة بمدة محددة'],['administrative','ملاحظة أو مهمة إدارية']]){const option=el('option',text);option.value=value;mode.append(option);}
 const choices=el('select');choices.name='serviceChoice';choices.setAttribute('aria-label','خدمة المهمة');
 const duration=el('input');duration.name='durationMinutes';duration.type='number';duration.min='5';duration.max='240';duration.step='5';duration.value='30';
 const modeField=field('نوع المهمة',mode),choiceField=field('الخدمة أو الباقة',choices),durationField=field('المدة بالدقائق',duration);form.querySelector('[name=staffId]').closest('label').after(modeField,choiceField,durationField);
 const title=form.querySelector('[name=title]'),booking=form.querySelector('[name=bookingId]'),due=form.querySelector('[name=dueAt]');
 const note=el('p','الوقت في الطابور تقديري؛ انتهاء الخدمة والتحصيل إجراءان منفصلان.');note.className='field-hint';form.append(note);
 const submit=form.querySelector('button[type=submit]'),footer=el('footer');footer.append(submit);form.append(footer);
 function refresh(){const previous=choices.value;choices.replaceChildren(new Option('اختار الخدمة أو الباقة',''));for(const item of getCatalog()){if(!['service','package'].includes(item.kind))continue;choices.add(new Option(`${item.nameAr} • ${Number(item.duration)||'غير محدد'} دقيقة`,item.kind+':'+item.id));}if([...choices.options].some(option=>option.value===previous))choices.value=previous;sync();}
 function sync(resetKey=false){const timed=mode.value!=='administrative';choiceField.hidden=mode.value!=='service';choices.required=mode.value==='service';choices.disabled=!choices.required;durationField.hidden=mode.value!=='manual';duration.required=mode.value==='manual';duration.disabled=!duration.required;booking.closest('label').hidden=!['booking','administrative'].includes(mode.value);booking.required=mode.value==='booking';booking.disabled=timed&&mode.value!=='booking';due.closest('label').hidden=timed;due.disabled=timed;title.required=!['service','booking'].includes(mode.value);submit.textContent=timed?'إضافة لطابور العامل':'إرسال المهمة';if(resetKey)form.dataset.key='';}
 mode.onchange=()=>sync(true);form.addEventListener('input',()=>{form.dataset.key='';});choices.onchange=()=>{const chosen=getCatalog().find(item=>item.kind+':'+item.id===choices.value);if(chosen)title.value=chosen.nameAr;form.dataset.key='';};
 const busy=()=>submit.disabled;
 close.onclick=()=>{if(!busy())dialog.close();};dialog.addEventListener('cancel',event=>{if(busy())event.preventDefault();});entry.onclick=()=>{refresh();if(!dialog.open)dialog.showModal();};form.querySelector('[name=branchId]').addEventListener('change',refresh);
 document.addEventListener('mz:queue-task-draft',async event=>{try{await prepareDraft(event.detail||{});mode.value=event.detail?.bookingId?'booking':'service';if(event.detail?.bookingId)booking.value=event.detail.bookingId;refresh();if(!dialog.open)dialog.showModal();}catch(error){note.textContent=error.message;}});
 refresh();return {refresh,close:()=>{if(dialog.open)dialog.close();}};
}
export function taskServiceTiming(task){if(!task.serviceSessionId||!task.serviceTiming)return null;const line=el('div');line.className='task-service-timing';line.append(el('small',`${task.serviceTiming.startTime} — ${task.serviceTiming.endTime}`));if(['NEW','SEEN','IN_PROGRESS'].includes(task.status))line.append(serviceTimer(task.serviceTiming,{queued:task.status!=='IN_PROGRESS'}));return line;}
export {syncServiceClock};
