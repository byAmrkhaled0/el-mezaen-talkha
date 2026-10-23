import {mountSelfAttendance} from './staff-self-attendance.js';
let personalAttendanceView;
import {mountMonthlyTargetPanel} from './monthly-target-panel.js';
import {createWorkerRequestCenter} from './request-center.js';
import './worker-requests.css';
import {getWorkerRequests,submitWorkerRequest,updateWorkerRequest} from './admin-api.js';
import {changeOwnWorkerPassword} from './admin-api.js';
import './global-navigation.js';
import './worker.css';
import './mobile-management.css';
import {watchAuth,currentAccess,getWorkerWorkspace,recordWorkerAttendance,updateWorkerTask,markWorkerNotificationRead,uploadImage,updateWorkerProfilePhoto,enablePush,watchWorkerPush,logout} from './admin-api.js';
import {staffRouteGuard} from './staff-routing.js';
import {safeMediaUrl} from './media.js';
import {latestWorkerContext,validateWorkerPhoto,workerPhotoSave} from './worker-self-service.js';
const branchName=id=>({talkha:'طلخا',mashaya:'المشاية'})[id]||id;const $=s=>document.querySelector(s);let user,access,workspace,unsubscribe,activeBranchId='',selectedPhoto,photoVersion=0;
const set=(id,text)=>$(id).textContent=text;const money=n=>`${Number(n||0).toLocaleString('ar-EG')} ج.م`;
function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function view(name){if(!['home','bookings','tasks','notifications','attendance','profile','requests'].includes(name))name='home';document.querySelectorAll('[data-screen]').forEach(n=>n.hidden=n.dataset.screen!==name);document.querySelectorAll('[data-view]').forEach(n=>n.setAttribute('aria-current',n.dataset.view===name?'page':'false'));history.replaceState(null,'',`#${name}`);if(name==='requests')void requestCenter.load();if(name==='attendance')void personalAttendanceView?.load();}
function booking(b){const n=node('article','');n.className='worker-panel worker-booking';n.dataset.entity=b.id||b.code;n.append(node('time',`${b.bookingDate||''} • ${b.bookingTime||''}`),node('h3',b.customerName||'عميل'),node('p',(b.serviceNamesAr||[]).join(' + ')),node('small',({pending:'قيد المراجعة',confirmed:'مؤكد',arrived:'وصل العميل',completed:'مكتمل',cancelled:'ملغي'})[b.status]||b.status||''));return n;}
function render(){if(!workspace||workspace.activeBranchId!==activeBranchId)return;mountMonthlyTargetPanel({anchor:document.querySelector('#workerOwnTarget'),role:"worker",branchIds:workspace.authorizedBranchIds||[],activeBranchId});const w=workspace,s=w.staff||{},a=w.attendance;set('#name',s.nameAr||'العامل');set('#branch',`فرع العمل الحالي: ${branchName(w.activeBranchId)}`);const ids=w.authorizedBranchIds||[];$('#workingBranchControl').hidden=ids.length<2;$('#workingBranch').replaceChildren(...ids.map(id=>{const n=node('option',branchName(id));n.value=id;return n;}));$('#workingBranch').value=w.activeBranchId;set('#activeBranchLabel',ids.length===1?`فرع العمل: ${branchName(w.activeBranchId)}`:'اختيار الفرع يغيّر سياق العمل فقط؛ التعيينات تحددها الإدارة');$('#avatar').src=safeMediaUrl(s.imageUrl)||'/assets/el-mezaen-mark-v2.webp';$('#profileAvatar').src=$('#avatar').src;set('#shiftStatus',`الشيفت ${s.shiftStart||'غير محدد'} — ${s.shiftEnd||'غير محدد'}`);set('#attendanceState',a?.status==='PRESENT'?'حضورك مسجل':a?'تم تسجيل الانصراف':'غير مسجل اليوم');$('#checkIn').disabled=Boolean(a);$('#checkOut').disabled=!a||a.status==='CHECKED_OUT'||a.branchId!==activeBranchId;$('#attendanceBranch').hidden=true;$('#attendanceBranch').replaceChildren(...[activeBranchId].map(id=>{const n=node('option',branchName(id));n.value=id;return n;}));if(a&&a.branchId!==activeBranchId)set('#attendanceState',`سجل حضور اليوم في ${branchName(a.branchId)}؛ اختره لتسجيل الانصراف`);set('#attendancePageState',a?.status==='PRESENT'?'حضورك مسجل':a?'تم تسجيل الانصراف':'لم تسجل حضورك اليوم');const timeline=$('#attendanceHistory');timeline.replaceChildren();for(const [label,value]of [['الفرع',a?.branchId?branchName(a.branchId):'لم يُسجل'],['الحضور',a?.checkInTime||'لم يُسجل بعد'],['الانصراف',a?.checkOutTime||'لم يُسجل بعد']]){const row=node('p','');row.append(node('strong',label+' • '),node('span',value));timeline.append(row);}const distance=a?.checkOutEvidence?.distanceMeters??a?.locationEvidence?.distanceMeters;set('#attendanceGps',Number.isFinite(distance)?`تم التحقق من الموقع بواسطة الخادم • المسافة ${Math.round(distance)} متر`:'يتم التحقق من موقعك عند التسجيل');$('#workerOverview').replaceChildren(...[['bookings','حجوزات اليوم',(w.bookings||[]).filter(b=>b.bookingDate===w.dateKey).length],['tasks','مهام جديدة',(w.tasks||[]).filter(t=>t.status==='NEW').length],['notifications','تنبيهات غير مقروءة',(w.notifications||[]).filter(n=>!n.read).length]].map(([screen,label,count])=>{const b=node('button','');b.append(node('b',count),node('span',label));b.onclick=()=>view(screen);return b;}));$('#bookings').replaceChildren(...(w.bookings||[]).map(booking));if(!w.bookings?.length)$('#bookings').append(node('p','لا توجد حجوزات'));$('#nextBooking').replaceChildren(w.bookings?.length?booking(w.bookings[0]):node('p','لا توجد حجوزات قادمة'));$('#tasks').replaceChildren(...(w.tasks||[]).map(t=>{const n=node('article','');n.className='worker-panel';n.dataset.entity=t.id;n.append(node('h3',t.title),node('p',t.details||''),(()=>{const pill=node('small',({NEW:'جديدة',SEEN:'تمت رؤيتها',IN_PROGRESS:'جاري التنفيذ',DONE:'تمت'})[t.status]||t.status);pill.className='worker-task-status';pill.dataset.state=t.status;return pill;})());const next={NEW:'SEEN',SEEN:'IN_PROGRESS',IN_PROGRESS:'DONE'}[t.status];if(next){const b=node('button',({SEEN:'اطلعت عليها',IN_PROGRESS:'ابدأ المهمة',DONE:'تمت المهمة'})[next]);b.onclick=()=>busy(b,()=>updateWorkerTask(t.id,next));n.append(b);}return n;}));$('#notifications').replaceChildren(...(w.notifications||[]).map(n=>{const b=node('button','');b.className=`worker-panel notification ${n.read?'read':''}`;b.append(node('b',n.title||'تنبيه'),node('p',n.body||''),node('small',n.read?'مقروء':'جديد'));b.onclick=()=>busy(b,async()=>{await markWorkerNotificationRead(n.id);view(n.type?.includes('request')?'requests':n.type?.includes('task')?'tasks':n.type?.includes('attendance')?'attendance':'bookings');});return b;}));set('#unread',(w.notifications||[]).filter(n=>!n.read).length);$('#targetProgress').value=Number(w.target?.progressPercent||0);set('#targetText',`الهدف الوظيفي ${money(w.target?.target)} • المحقق في ${branchName(w.activeBranchId)} ${money(w.target?.achieved)} • الفارق عن الهدف ${money(w.target?.remaining)}`);renderWorkerProfile(s,w,a,user);}
const requestCenter=createWorkerRequestCenter(()=>workspace,{getWorkerRequests,submitWorkerRequest,updateWorkerRequest});
const loadContext=latestWorkerContext(getWorkerWorkspace,result=>{
 workspace=result;activeBranchId=result.activeBranchId;render();requestCenter.contextChanged();$('#workerData').hidden=false;$('#contextRetry').hidden=true;
});
async function refresh(){return loadContext(activeBranchId);}
async function switchBranch(){
 activeBranchId=$('#workingBranch').value;$('#workerData').hidden=true;$('#contextRetry').hidden=true;set('#status','جارٍ تحميل بيانات الفرع…');
 try{if(await refresh())set('#status','تم تحميل بيانات الفرع');}catch(e){set('#status',e.message||'تعذر تحميل الفرع');$('#contextRetry').hidden=false;}
}
$('#workingBranch').onchange=switchBranch;
$('#contextRetry').onclick=switchBranch;
async function busy(button,action){if(button.disabled)return;button.disabled=true;try{await action();await refresh();set('#status','تم تحديث البيانات');}catch(e){set('#status',e.message||'تعذر تنفيذ الطلب');}finally{button.disabled=false;if(workspace)render();}}
watchAuth(async u=>{if(!u){location.replace('/login/?mode=worker');return;}try{user=u;access=await currentAccess(u);const redirect=staffRouteGuard('/worker/',access.role);if(redirect){location.replace(redirect);return;}if(access.mustChangePassword){$('#passwordGate').hidden=false;set('#status','');return;}set('#status','جارٍ تحميل حسابك…');await refresh();$('#workerLoadRetry').hidden=true;$('#workspace').hidden=false;set('#status','');const event=new URLSearchParams(location.search).get('workerEvent')||'';view(event.includes('request')?'requests':event.includes('task')?'tasks':event.includes('attendance')?'attendance':event?'bookings':location.hash.slice(1));const entity=new URLSearchParams(location.search).get('entity');if(entity)document.querySelector(`[data-entity="${CSS.escape(entity)}"]`)?.scrollIntoView({block:'center'});unsubscribe=await watchWorkerPush(()=>refresh().catch(e=>set('#status',e.message)));}catch(e){$('#workerLoadRetry').hidden=false;if(access?.role==='worker'&&e.cause?.details?.workerRecovery===true){$('#passwordGate').hidden=false;$('#workspace').hidden=true;}set('#status',e.message||'تعذر تحميل حسابك؛ أعد المحاولة');}});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
for(const[action,id]of[['checkIn','#checkIn'],['checkOut','#checkOut']])$(id).onclick=()=>busy($(id),async()=>{const attendanceBranch=activeBranchId;set('#gpsStatus','جارٍ تحديد موقعك…');if(!navigator.geolocation)throw Error('GPS غير مدعوم');const p=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,e=>reject(Error(e.code===1?'اسمح باستخدام GPS ثم حاول مجددًا':'تعذر تحديد الموقع')),{enableHighAccuracy:true,timeout:15000,maximumAge:0}));await recordWorkerAttendance({action,branchId:attendanceBranch,latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy});set('#gpsStatus',action==='checkIn'?'تم تسجيل حضورك':'تم تسجيل انصرافك');});
const savePhoto=workerPhotoSave(uploadImage,updateWorkerProfilePhoto);
$('#choosePhoto').onclick=()=>$('#photo').click();
function clearPhoto(){++photoVersion;selectedPhoto=null;$('#photo').value='';$('#photoPreview').hidden=true;$('#photoPreview').removeAttribute('src');$('#savePhoto').disabled=true;$('#cancelPhoto').hidden=true;$('#photoProgress').hidden=true;}
$('#photo').onchange=()=>{
 const file=$('#photo').files[0];if(!file)return;clearPhoto();
 try{validateWorkerPhoto(file);selectedPhoto=file;const version=photoVersion;const reader=new FileReader();
 reader.onload=()=>{if(version!==photoVersion)return;$('#photoPreview').src=reader.result;$('#photoPreview').hidden=false;$('#savePhoto').disabled=false;$('#cancelPhoto').hidden=false;set('#photoStatus','راجع الصورة ثم اضغط حفظ');};
 reader.onerror=()=>{if(version!==photoVersion)return;clearPhoto();set('#photoStatus','تعذر قراءة الصورة؛ اختر ملفًا آخر');};reader.readAsDataURL(file);
 }catch(e){set('#photoStatus',e.message);}
};
$('#cancelPhoto').onclick=()=>{clearPhoto();set('#photoStatus','تم إلغاء الاختيار');};
$('#savePhoto').onclick=async()=>{
 if($('#savePhoto').disabled||!selectedPhoto)return;const file=selectedPhoto;const staffId=workspace?.staff?.id;
 if(!staffId||staffId!==access.staffId){set('#photoStatus','تعذر التحقق من حساب العامل؛ أعد تسجيل الدخول');return;}
 for(const id of ['#photo','#choosePhoto','#savePhoto','#cancelPhoto'])$(id).disabled=true;
 $('#photoProgress').hidden=false;$('#photoProgress').value=0;set('#photoStatus','جارٍ تجهيز الصورة ورفعها…');
 try{const url=await savePhoto(file,staffId,percent=>{$('#photoProgress').value=percent;set('#photoStatus',percent===100?'جارٍ حفظ الصورة في ملفك…':`جارٍ الرفع ${percent}%`);});
 workspace.staff.imageUrl=url;render();clearPhoto();set('#photoStatus','تم حفظ صورتك؛ ستظهر في كتالوج الفريق بعد تحديثه');
 }catch(e){set('#photoStatus',e.message||'تعذر حفظ الصورة؛ أعد المحاولة');}
 finally{$('#choosePhoto').disabled=false;$('#photo').disabled=false;$('#cancelPhoto').disabled=false;$('#savePhoto').disabled=!selectedPhoto;}
};$('#enablePush').onclick=()=>busy($('#enablePush'),enablePush);$('#refresh').onclick=()=>busy($('#refresh'),async()=>{});$('#logout').onclick=async()=>{await logout();location.replace('/login/?mode=worker');};
const tick=()=>set('#clock',new Intl.DateTimeFormat('ar-EG',{timeZone:'Africa/Cairo',hour:'2-digit',minute:'2-digit'}).format(new Date()));tick();const clock=setInterval(tick,1000);window.addEventListener('beforeunload',()=>{clearInterval(clock);unsubscribe?.();});

$('#workerPasswordForm').onsubmit=async event=>{
 event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;
 const button=form.querySelector('button[type=submit]');if(button.disabled)return;button.disabled=true;
 try{await changeOwnWorkerPassword(form.elements.currentPassword.value,form.elements.newPassword.value);location.replace('/login/?mode=worker');}
 catch(error){set('#status',error.message||'تعذر تغيير كلمة المرور');}
 finally{button.disabled=false;form.reset();}
};
$('#openWorkerPassword').onclick=()=>{$('#passwordGate').hidden=false;$('#workspace').hidden=true;};
$('#passwordSignOut').onclick=async()=>{await logout();location.replace('/login/?mode=worker');};

import {renderWorkerProfile} from './worker-polish.js';
