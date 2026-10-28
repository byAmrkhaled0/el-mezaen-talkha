import {recordOwnStaffAttendance} from './admin-api.js';
import './manual-attendance.css';
let active;
export function openManualAttendance({staffId,branchId,label,action,uid,currentUid=()=>uid,onRecorded}){
 if(active?.isConnected){active.focus();return;}
 const dialog=document.createElement('dialog');active=dialog;dialog.className='manual-attendance-dialog';dialog.setAttribute('aria-labelledby','manualAttendanceTitle');
 dialog.innerHTML=`<form><header><div><small>تسجيل بواسطة مسؤول الفرع</small><h2 id="manualAttendanceTitle"></h2></div><button type="button" data-close aria-label="إغلاق">×</button></header><div class="manual-attendance-body"><p data-person></p><p>التسجيل بالوقت الحالي من السيرفر، وبيتحفظ باسم حسابك. التسجيل اليدوي لا يؤكد الموقع الجغرافي.</p><label>سبب التسجيل اليدوي<textarea name="reason" required minlength="3" maxlength="200" rows="3" placeholder="مثال: تأكيد وجود الموظف بالفرع وتعذر تحديد موقع الجهاز"></textarea></label><p data-message role="status" aria-live="polite"></p></div><footer><button type="button" data-cancel>إلغاء</button><button type="submit">تأكيد التسجيل</button></footer></form>`;
 document.body.append(dialog);const $=s=>dialog.querySelector(s),form=$('form');let pending=false;
 $('h2').textContent=action==='checkIn'?'تسجيل حضور يدوي':'تسجيل انصراف يدوي';$('[data-person]').textContent=label+' • '+({talkha:'فرع طلخا',mashaya:'فرع المشاية'}[branchId]||branchId);
 const close=()=>{if(!pending)dialog.close();};$('[data-close]').onclick=$('[data-cancel]').onclick=close;dialog.addEventListener('cancel',event=>{if(pending)event.preventDefault();});dialog.addEventListener('close',()=>{dialog.remove();if(active===dialog)active=null;});
 form.onsubmit=async event=>{event.preventDefault();if(pending||!form.reportValidity())return;if(uid!==currentUid()){dialog.close();return;}pending=true;const controls=[...form.querySelectorAll('button,textarea')];controls.forEach(n=>n.disabled=true);$('[data-message]').textContent='جاري تأكيد التسجيل…';try{await recordOwnStaffAttendance({method:'manual',staffId,branchId,action,reason:$('textarea').value.trim()});if(uid!==currentUid())return;pending=false;dialog.close();await onRecorded?.();}catch(error){$('[data-message]').textContent=error.message||'تعذر التسجيل؛ حدّث السجل قبل إعادة المحاولة';}finally{pending=false;controls.forEach(n=>n.disabled=false);}};
 dialog.showModal();$('textarea').focus();
}
