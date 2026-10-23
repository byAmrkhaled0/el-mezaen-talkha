import {getOwnStaffAttendance,recordOwnStaffAttendance} from './admin-api.js';
import './staff-self-attendance.css';

export function mountSelfAttendance({role,uid,currentUid=()=>uid}) {
  document.querySelector('#staffSelfAttendance')?.remove();
  if(!['cashier','manager'].includes(role))return;
  const panel=document.createElement('details');
  panel.id='staffSelfAttendance';
  panel.className='self-attendance';
  panel.innerHTML='<summary>حضوري وانصرافي <small>تسجيل بموقع الفرع</small></summary><div class="self-attendance-body"><p role="status" aria-live="polite" data-self-status>افتح لعرض حالة حضورك.</p><label>فرع تسجيل الحضور<select data-self-branch aria-label="فرع حضوري"></select></label><p>بنطلب موقعك وقت التسجيل بس، وبنطابقه مع نطاق الفرع على السيرفر.</p><div class="self-attendance-actions"><button type="button" data-self-in disabled>تسجيل حضور</button><button type="button" data-self-out disabled>تسجيل انصراف</button><button type="button" data-self-refresh>تحديث</button></div></div>';
  const anchor=document.querySelector('#cashierHeader')||document.querySelector('.admin-header');
  if(!anchor)return;
  anchor.insertAdjacentElement('afterend',panel);
  const status=panel.querySelector('[data-self-status]'),select=panel.querySelector('select'),checkIn=panel.querySelector('[data-self-in]'),checkOut=panel.querySelector('[data-self-out]'),refresh=panel.querySelector('[data-self-refresh]');
  let data=null,pending=false,loaded=false;
  function controls(){
    select.disabled=pending||Boolean(data?.attendance);
    checkIn.disabled=pending||!data?.branches?.length||Boolean(data?.attendance);
    checkOut.disabled=pending||data?.attendance?.status!=='PRESENT'||!data?.branches?.some(branch=>branch.id===data.attendance.branchId);
    refresh.disabled=pending;
    panel.setAttribute('aria-busy',String(pending));
  }
  async function load(){
    pending=true;controls();status.textContent='جاري تحميل حضورك…';
    try{
      data=await getOwnStaffAttendance();loaded=true;
      select.replaceChildren(...data.branches.map(branch=>new Option(branch.nameAr,branch.id)));
      if(data.attendance)select.value=data.attendance.branchId;
      status.textContent=data.attendance?`${data.attendance.status==='PRESENT'?'حضورك مسجل':'تم تسجيل انصرافك'} • ${data.dateKey} • الحضور ${data.attendance.checkInTime}${data.attendance.checkOutTime?' • الانصراف '+data.attendance.checkOutTime:''}`:`لم تسجل حضورك اليوم • ${data.dateKey}`;
    }catch(error){data=null;loaded=false;status.textContent=error.message||'تعذر تحميل الحضور؛ اضغط تحديث.';}
    finally{pending=false;controls();}
  }
  async function record(action){
    if(pending||!data||currentUid()!==uid||!panel.isConnected)return;
    const branchId=select.value;
    pending=true;controls();status.textContent='جاري تحديد موقعك…';
    try{
      if(!navigator.geolocation)throw Error('المتصفح لا يدعم تحديد الموقع');
      const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,error=>reject(Error(error.code===1?'اسمح باستخدام الموقع لتسجيل الحضور.':'تعذر تحديد موقعك؛ افتح GPS وحاول من مكان مكشوف.')),{enableHighAccuracy:true,timeout:15000,maximumAge:0}));
      if(currentUid()!==uid||!panel.isConnected)return;
      await recordOwnStaffAttendance({action,branchId,latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy});
      await load();
    }catch(error){status.textContent=error.message||'تعذر التسجيل؛ حدّث حالة الحضور قبل إعادة المحاولة.';}
    finally{pending=false;controls();}
  }
  panel.addEventListener('toggle',()=>{if(panel.open&&!loaded&&!pending)void load();});
  refresh.onclick=()=>void load();
  checkIn.onclick=()=>void record('checkIn');checkOut.onclick=()=>void record('checkOut');
}
