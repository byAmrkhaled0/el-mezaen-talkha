import {mountWorkerWorkflow} from './worker-workflow.js';
import './worker-workflow.css';
import {startWorkerService,finishWorkerService} from './admin-api.js';
let workerWorkflow;
import {mountWorkerHome,workerEncouragement} from './worker-home.js';
import {getWorkerBookingHistory} from './admin-api.js';
let workerHomeView;
import {workerNotificationTarget} from './worker-notification-target.js';
import './worker-queue.css';
import {workerDayQueue} from './worker-queue-model.js';
import {mountOrderAdditions} from './order-additions-ui.js';
import {getOrderAdditions,submitOrderAddition,decideOrderAddition} from './admin-api.js';
let orderAdditionView=null;
import {taskServiceTiming,syncServiceClock} from './task-service-ui.js';
import {mountSelfAttendance} from './staff-self-attendance.js';
let personalAttendanceView;
import {mountMonthlyTargetPanel} from './monthly-target-panel.js';
import {createWorkerRequestCenter} from './request-center.js';
import './worker-requests.css';
import {getWorkerRequests,submitWorkerRequest,updateWorkerRequest} from './admin-api.js';
import {changeBooking} from './admin-api.js';
import {changeOwnWorkerPassword} from './admin-api.js';
import './global-navigation.js';
import './worker.css';
import './order-additions.css';
import './mobile-management.css';
import {watchAuth,currentAccess,getWorkerWorkspace,recordWorkerAttendance,updateWorkerTask,markWorkerNotificationRead,uploadImage,updateWorkerProfilePhoto,enablePush,watchWorkerPush,logout} from './admin-api.js';
import {staffRouteGuard} from './staff-routing.js';
import {safeMediaUrl} from './media.js';
import {latestWorkerContext,validateWorkerPhoto,workerPhotoSave} from './worker-self-service.js';
const branchName=id=>({talkha:'طلخا',mashaya:'المشاية'})[id]||id;const $=s=>document.querySelector(s);let user,access,workspace,unsubscribe,activeBranchId='',selectedPhoto,photoVersion=0;
const set=(id,text)=>$(id).textContent=text;const money=n=>`${Number(n||0).toLocaleString('ar-EG')} ج.م`;
function node(tag,text){const n=document.createElement(tag);n.textContent=text;return n;}
function view(name,{fromHistory=false}={}){if(!['home','bookings','tasks','notifications','attendance','profile','requests'].includes(name))name='home';document.querySelectorAll('[data-screen]').forEach(n=>n.hidden=n.dataset.screen!==name);document.querySelectorAll('[data-view]').forEach(n=>n.setAttribute('aria-current',n.dataset.view===name?'page':'false'));if(fromHistory)history.replaceState(null,'',`#${name}`);else if(location.hash!==`#${name}`)history.pushState(null,'',`#${name}`);if(name==='requests')return requestCenter.load();if(name==='bookings')return orderAdditionView?.load();if(name==='attendance')return personalAttendanceView?.load();}
function renderBookingQueue(w){const groups=workerDayQueue((w.bookings||[]).filter(row=>row.serviceProgress?.[w.staff?.id]?.status!=='DONE'),w.dateKey,w.activeBookingId),root=$('#bookings');root.replaceChildren();for(const [key,title]of [['serving','في الخدمة الآن'],['pending','طلبات تحتاج موافقة'],['waiting','قائمة الانتظار — حجوزات اليوم المؤكدة'],['upcoming','المواعيد القادمة'],['shop','طلبات المحل غير المدفوعة']]){if(!groups[key].length)continue;const group=node('section','');group.className='worker-queue-group';group.append(node('h3',title+' ('+groups[key].length+')'));for(const [index,row]of groups[key].entries()){const card=booking(row);if(key==='waiting')card.prepend(node('small','دور '+(index+1)+' • حسب الموعد'));group.append(card);}root.append(group);}if(!root.children.length)root.append(node('p','لا توجد حجوزات نشطة.'));}
function booking(b){const n=node('article','');n.className='worker-panel worker-booking';n.dataset.entity=b.id||b.code;n.append(node('time',`${b.bookingDate||''} • ${b.bookingTime||''}`),node('h3',b.customerName||'عميل'),node('p',(b.serviceNamesAr||[]).join(' + ')),node('small',b.source==='pos'&&b.paymentStatus==='unpaid'?'طلب خدمة • شيك غير مدفوع':({pending:'قيد المراجعة',confirmed:'في الانتظار — مؤكد',arrived:'وصل العميل',completed:'مكتمل',cancelled:'ملغي'})[b.status]||b.status||''));if((b.source==='pos'||['confirmed','arrived'].includes(b.status))&&b.paymentStatus==='unpaid'&&!b.financialPosted&&!b.cashPosted&&!b.rewardPosted&&!b.serviceTargetsPosted&&!['PAID','VOIDED','REFUNDED'].includes(b.orderState)&&!['cancelled','rejected','refunded'].includes(b.status)){
 const actions=node('div','');actions.className='worker-upsell-actions';const add=node('button','إضافة خدمة للعميل');add.type='button';add.dataset.addServiceToCheck=b.id||b.code;
 add.onclick=async()=>{if(add.disabled)return;add.disabled=true;try{await view('bookings');await orderAdditionView?.openForOrder(b.id||b.code);}catch(error){set('#status',error.message||'تعذر فتح إضافة الخدمة');}finally{add.disabled=false;}};
 actions.append(add,node('small','الطلب يروح للكاشير للموافقة قبل إضافته للشيك'));n.append(actions);
 }return n;}
async function openWorkerNotification(button,note){
 if(button.disabled)return;button.disabled=true;
 try{await markWorkerNotificationRead(note.id);await refresh();const target=workerNotificationTarget(note);await view(target.screen);const screen=document.querySelector('[data-screen="'+target.screen+'"]');const entity=target.entity&&[...(screen?.querySelectorAll('[data-entity]')||[])].find(node=>node.dataset.entity===target.entity);const destination=entity||screen?.querySelector('h2');if(destination){destination.setAttribute('tabindex','-1');destination.scrollIntoView({block:'center'});destination.focus({preventScroll:true});}set('#status','تم فتح الإشعار');}
 catch(error){set('#status',error.message||'تعذر فتح الإشعار؛ حاول تاني');}
 finally{button.disabled=false;}
}
function render(){if(!workspace||workspace.activeBranchId!==activeBranchId)return;mountMonthlyTargetPanel({anchor:document.querySelector('#workerOwnTarget'),role:"worker",branchIds:workspace.authorizedBranchIds||[],activeBranchId});const w=workspace,s=w.staff||{},a=w.attendance;set('#workerEncouragement',workerEncouragement(w));if(!workerWorkflow)workerWorkflow=mountWorkerWorkflow({anchor:$('#workerHomeHistory'),start:startWorkerService,finish:finishWorkerService,refresh,addService:async id=>{await view('bookings');await orderAdditionView?.openForOrder(id);},openTasks:()=>view('tasks')});workerWorkflow?.sync(w);if(!workerHomeView)workerHomeView=mountWorkerHome({anchor:$('#workerHomeHistory'),getContext:()=>({uid:user?.uid,activeBranchId}),history:getWorkerBookingHistory,enablePush});workerHomeView?.sync(w);set('#name',s.nameAr||'العامل');set('#branch',`فرع العمل الحالي: ${branchName(w.activeBranchId)}`);const ids=w.authorizedBranchIds||[];$('#workingBranchControl').hidden=ids.length<2;$('#workingBranch').replaceChildren(...ids.map(id=>{const n=node('option',branchName(id));n.value=id;return n;}));$('#workingBranch').value=w.activeBranchId;set('#activeBranchLabel',ids.length===1?`فرع العمل: ${branchName(w.activeBranchId)}`:'اختيار الفرع يغيّر سياق العمل فقط؛ التعيينات تحددها الإدارة');$('#avatar').src=safeMediaUrl(s.imageUrl)||'/assets/el-mezaen-mark-v2.webp';$('#profileAvatar').src=$('#avatar').src;set('#shiftStatus',`الشيفت ${s.shiftStart||'غير محدد'} — ${s.shiftEnd||'غير محدد'}`);set('#attendanceState',a?.status==='PRESENT'?'حضورك مسجل':a?'تم تسجيل الانصراف':'غير مسجل اليوم');$('#checkIn').disabled=Boolean(a);$('#checkOut').disabled=!a||a.status==='CHECKED_OUT'||a.branchId!==activeBranchId;$('#attendanceBranch').hidden=true;$('#attendanceBranch').replaceChildren(...[activeBranchId].map(id=>{const n=node('option',branchName(id));n.value=id;return n;}));if(a&&a.branchId!==activeBranchId)set('#attendanceState',`سجل حضور اليوم في ${branchName(a.branchId)}؛ اختره لتسجيل الانصراف`);set('#attendancePageState',a?.status==='PRESENT'?'حضورك مسجل':a?'تم تسجيل الانصراف':'لم تسجل حضورك اليوم');const timeline=$('#attendanceHistory');timeline.replaceChildren();for(const [label,value]of [['الفرع',a?.branchId?branchName(a.branchId):'لم يُسجل'],['الحضور',a?.checkInTime||'لم يُسجل بعد'],['الانصراف',a?.checkOutTime||'لم يُسجل بعد']]){const row=node('p','');row.append(node('strong',label+' • '),node('span',value));timeline.append(row);}const distance=a?.checkOutEvidence?.distanceMeters??a?.locationEvidence?.distanceMeters;set('#attendanceGps',Number.isFinite(distance)?`تم التحقق من الموقع بواسطة الخادم • المسافة ${Math.round(distance)} متر`:'يتم التحقق من موقعك عند التسجيل');$('#workerOverview').replaceChildren(...[['bookings','حجوزات اليوم',(w.bookings||[]).filter(b=>b.bookingDate===w.dateKey).length],['tasks','مهام جديدة',(w.tasks||[]).filter(t=>t.status==='NEW').length],['notifications','تنبيهات غير مقروءة',(w.notifications||[]).filter(n=>!n.read).length]].map(([screen,label,count])=>{const b=node('button','');b.append(node('b',count),node('span',label));b.onclick=()=>view(screen);return b;}));renderBookingQueue(w);$('#nextBooking').replaceChildren(w.bookings?.length?booking(w.bookings[0]):node('p','لا توجد حجوزات قادمة'));$('#tasks').replaceChildren(...(w.tasks||[]).map(t=>{const n=node('article','');n.className='worker-panel';n.dataset.entity=t.id;n.append(node('h3',t.title),node('p',t.details||''),(()=>{const pill=node('small',({NEW:'جديدة',SEEN:'تمت رؤيتها',IN_PROGRESS:'جاري التنفيذ',DONE:'تمت'})[t.status]||t.status);pill.className='worker-task-status';pill.dataset.state=t.status;return pill;})());const timing=taskServiceTiming(t);if(timing)n.append(timing);const next={NEW:'SEEN',SEEN:'IN_PROGRESS',IN_PROGRESS:'DONE'}[t.status];if(next){const b=node('button',({SEEN:'اطلعت عليها',IN_PROGRESS:'ابدأ المهمة',DONE:'تمت المهمة'})[next]);b.onclick=()=>busy(b,()=>updateWorkerTask(t.id,next));n.append(b);}return n;}));$('#notifications').replaceChildren(...(w.notifications||[]).map(n=>{const b=node('button','');b.className=`worker-panel notification ${n.read?'read':''}`;b.append(node('b',n.title||'تنبيه'),node('p',n.body||''),node('small',(n.read?'مقروء':'جديد')+' • اضغط لفتح التفاصيل'));b.setAttribute('aria-label',(n.title||'تنبيه')+' — فتح التفاصيل');b.onclick=()=>openWorkerNotification(b,n);return b;}));set('#unread',(w.notifications||[]).filter(n=>!n.read).length);$('#targetProgress').value=Number(w.target?.progressPercent||0);set('#targetText',`الهدف الوظيفي ${money(w.target?.target)} • المحقق في ${branchName(w.activeBranchId)} ${money(w.target?.achieved)} • الفارق عن الهدف ${money(w.target?.remaining)}`);renderWorkerProfile(s,w,a,user);syncServiceClock($('#tasks'),w.serverNowMs);}
const requestCenter=createWorkerRequestCenter(()=>workspace,{getWorkerRequests,submitWorkerRequest,updateWorkerRequest});
const loadContext=latestWorkerContext(getWorkerWorkspace,result=>{
 workspace=result;activeBranchId=result.activeBranchId;render();requestCenter.contextChanged();orderAdditionView?.contextChanged();$('#workerData').hidden=false;$('#contextRetry').hidden=true;
});
async function refresh(){return loadContext(activeBranchId);}
async function switchBranch(){
 activeBranchId=$('#workingBranch').value;$('#workerData').hidden=true;$('#contextRetry').hidden=true;set('#status','جارٍ تحميل بيانات الفرع…');
 try{if(await refresh())set('#status','تم تحميل بيانات الفرع');}catch(e){set('#status',e.message||'تعذر تحميل الفرع');$('#contextRetry').hidden=false;}
}
$('#workingBranch').onchange=switchBranch;
$('#contextRetry').onclick=switchBranch;
async function busy(button,action){if(button.disabled)return;button.disabled=true;try{await action();await refresh();set('#status','تم تحديث البيانات');}catch(e){set('#status',e.message||'تعذر تنفيذ الطلب');}finally{button.disabled=false;if(workspace)render();}}
function mountWorkerAttendance(account){
 const anchor=document.querySelector('[data-screen="attendance"]');if(!anchor)return;
 personalAttendanceView?.dispose();
 for(const child of [...anchor.children])child.hidden=true;
 personalAttendanceView=mountSelfAttendance({role:'worker',uid:account.uid,currentUid:()=>user?.uid,anchor,preferredBranch:()=>activeBranchId,onRecorded:()=>refresh()});
 $('#checkIn').hidden=true;$('#checkOut').hidden=true;
 let open=$('#workerAttendanceOpen');
 if(!open){open=node('button','حضوري وساعات عملي');open.id='workerAttendanceOpen';open.type='button';$('#checkIn').parentElement.append(open);}
 open.onclick=()=>view('attendance');
}
$('#workerReauthenticate').onclick=async()=>{const button=$('#workerReauthenticate');if(button.disabled)return;button.disabled=true;try{await logout();location.replace('/login/?mode=worker');}catch(error){set('#status',error.message||'تعذر تسجيل الخروج؛ حاول تاني');button.disabled=false;}};
watchAuth(async u=>{$('#workspace').hidden=true;$('.worker-nav').hidden=true;$('#workerReauthenticate').hidden=true;if(!u){user=null;workerWorkflow?.dispose();workerWorkflow=null;workerHomeView?.dispose();workerHomeView=null;personalAttendanceView?.dispose();location.replace('/login/?mode=worker');return;}try{user=u;access=await currentAccess(u);const redirect=staffRouteGuard('/worker/',access.role);if(redirect){location.replace(redirect);return;}if(access.mustChangePassword){$('#passwordGate').hidden=false;set('#status','');return;}set('#status','جارٍ تحميل حسابك…');await refresh();mountWorkerAttendance(u);$('#workerLoadRetry').hidden=true;$('#workspace').hidden=false;$('.worker-nav').hidden=false;set('#status','');const event=new URLSearchParams(location.search).get('workerEvent')||'';await view(event.includes('request')?'requests':event.includes('task')?'tasks':event.includes('attendance')?'attendance':event?'bookings':location.hash.slice(1),{fromHistory:true});const entity=new URLSearchParams(location.search).get('entity');if(entity)document.querySelector(`[data-entity="${CSS.escape(entity)}"]`)?.scrollIntoView({block:'center'});unsubscribe=await watchWorkerPush(()=>refresh().catch(e=>set('#status',e.message)));}catch(e){$('#workerLoadRetry').hidden=false;$('#workerReauthenticate').hidden=false;$('.worker-nav').hidden=true;$('#workspace').hidden=true;if(access?.role==='worker'&&e.cause?.details?.workerRecovery===true){$('#passwordGate').hidden=false;$('#workspace').hidden=true;}set('#status',e.message||'تعذر تحميل حسابك؛ أعد المحاولة');}});
orderAdditionView=mountOrderAdditions({anchor:document.querySelector('[data-screen="bookings"]'),worker:true,context:()=>({uid:user?.uid,branchId:activeBranchId}),api:{get:getOrderAdditions,submit:submitOrderAddition,decide:decideOrderAddition}});
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

// Restore the visible section for direct links and browser Back/Forward.
window.addEventListener('popstate',()=>view(location.hash.slice(1),{fromHistory:true}));
window.addEventListener('hashchange',()=>view(location.hash.slice(1),{fromHistory:true}));
