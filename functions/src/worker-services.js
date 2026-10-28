import {bookingServiceWorkers,workerFinishedBooking,finishBookingService} from './booking-service-state.js';
import {createHash} from 'node:crypto';
import {minutes,staffCanServeInterval} from './core.js';
import {cairoAppointmentMillis} from './worker-reminders.js';

const clockTime = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '');
const dateKey = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
const asTime = value => `${String(Math.floor(value / 60)).padStart(2,'0')}:${String(value % 60).padStart(2,'0')}`;
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// Never auto-finish a physical service. An overdue service blocks new slots until
// an operator finishes it or explicitly extends it after conflict checks.
export function serviceBlockingLeave(row, requestedDate, now) {
  if (!row?.activeSessionId && row?.active !== true) return null;
  if (!dateKey(row.dateKey) || !clockTime(row.startTime) || !clockTime(row.endTime) || minutes(row.startTime)>=minutes(row.endTime)) throw Error('INVALID_ACTIVE_SERVICE_STATE');
  const overdue=row.dateKey<now.dateKey || row.dateKey===now.dateKey && minutes(row.endTime)<=minutes(now.time);
  if(requestedDate<row.dateKey)return null;
  if(requestedDate===row.dateKey)return {staffId:row.staffId,branchId:'all',startTime:row.startTime,endTime:overdue?'23:59':row.endTime};
  return overdue?{staffId:row.staffId,branchId:'all',startTime:'00:00',endTime:'23:59'}:null;
}
export async function liveServiceLeave(tx, db, staffId, requestedDate, now) {
  const snapshot=await tx.get(db.doc('workerServiceState/'+staffId));
  if(!snapshot.exists||!snapshot.data().activeSessionId)return null;
  if(snapshot.data().staffId!==staffId)throw Error('INVALID_ACTIVE_SERVICE_STATE');
  return serviceBlockingLeave(snapshot.data(),requestedDate,now);
}
export async function activeServiceLeaves(db, requestedDate, now, ErrorType, staffIds) {
  if(staffIds){const ids=[...new Set(staffIds)];if(!ids.length||ids.length>21)throw new ErrorType('invalid-argument','نطاق عمال الحجز غير صحيح');const groups=[];for(let i=0;i<ids.length;i+=10)groups.push(ids.slice(i,i+10));const results=await Promise.all(groups.map(group=>db.collection('workerServiceSessions').where('staffId','in',group).where('active','==',true).limit(group.length+1).get()));if(results.some((snapshot,i)=>snapshot.size>groups[i].length))throw new ErrorType('failed-precondition','أكثر من خدمة نشطة لنفس نطاق العمال؛ راجع التشغيل');return results.flatMap(snapshot=>snapshot.docs.map(s=>serviceBlockingLeave(s.data(),requestedDate,now))).filter(Boolean);}
  const snapshot=await db.collection('workerServiceSessions').where('active','==',true).limit(201).get();
  if(snapshot.size>200)throw new ErrorType('resource-exhausted','عدد الخدمات الجارية تجاوز حد العرض الآمن');
  return snapshot.docs.map(s=>serviceBlockingLeave(s.data(),requestedDate,now)).filter(Boolean);
}

export function workerServiceHandlers(d) {
  const fail=(code,message)=>{throw new d.HttpsError(code,message)};
  const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
  const timestamp=()=>d.FieldValue.serverTimestamp();
  const overlap=(a,b)=>minutes(a.startTime)<minutes(b.endTime)&&minutes(a.endTime)>minutes(b.startTime);
  const view=(id,row)=>({id,staffId:row.staffId,staffName:row.staffName,branchId:row.branchId,dateKey:row.dateKey,startTime:row.startTime,endTime:row.endTime,bookingId:row.bookingId||null,taskId:row.taskId||null,title:row.title||'',expectedEndAtMs:cairoAppointmentMillis(row.dateKey,row.endTime),active:row.active===true,status:row.status,version:row.version,overdue:row.active===true&&(row.dateKey<d.now().dateKey||row.dateKey===d.now().dateKey&&minutes(row.endTime)<=minutes(d.now().time))});
  async function access(r, workerStaffId='') {
    await d.requireLiveStaff(r);
    if(!['admin','manager','cashier'].includes(r.auth?.token?.role)&&!(workerStaffId&&r.auth?.token?.role==='worker'))fail('permission-denied','تشغيل الخدمات لمسؤول الفرع أو العامل صاحب المهمة فقط');
    if(!['admin','worker'].includes(r.auth.token.role))d.requirePermission(r,'teamOperations');
    const branchId=r.data?.branchId;
    if(!['talkha','mashaya'].includes(branchId))fail('invalid-argument','اختر فرعًا محددًا');
    d.requireBranchAccess(r,branchId);
    return branchId;
  }
  function duration(value,max=240){if(!Number.isInteger(value)||value<5||value>max||value%5!==0)fail('invalid-argument','المدة من 5 دقائق وبمضاعفات 5');return value;}
  function requestKey(key){if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(key))fail('invalid-argument','معرف تأمين الطلب غير صحيح');return key;}
  async function board(r) {
    const branchId=await access(r),staffId=r.data?.staffId;
    if(r.data?.view==='completed'){
      // Query pending checks themselves: newer paid notices must never evict an unpaid check.
      const result=await d.db.collection('bookings').where('branchId','==',branchId).where('paymentStatus','==','unpaid').where('serviceStatus','==','READY_FOR_CHECKOUT').orderBy('serviceFinishedAt','desc').limit(31).get();
      const docs=result.docs.filter(doc=>!['cancelled','rejected','refunded'].includes(doc.data().status)&&!['VOIDED','REFUNDED'].includes(doc.data().orderState));
      return {items:docs.slice(0,30).map(doc=>{const booking=d.cleanDoc(doc);return {id:'ready_'+doc.id,type:'service_completed',bookingId:doc.id,branchId,staffId:booking.staffId||null,title:'الخدمة اكتملت — العميل جاهز للتحصيل',body:(booking.customerName||'عميل')+' • '+(booking.code||doc.id),readyForCheckout:true,read:false,createdAt:booking.serviceFinishedAt,booking};}),hasMore:result.size>30};
    }
    if(staffId){if(!validId(staffId))fail('invalid-argument','العامل غير صحيح');const member=await d.db.doc('staff/'+staffId).get();if(!member.exists||!member.data().branchIds?.includes(branchId))fail('permission-denied','العامل خارج نطاق الفرع');}
    let active=d.db.collection('workerServiceSessions').where('branchId','==',branchId).where('active','==',true),waiting=d.db.collection('workerServiceSessions').where('branchId','==',branchId).where('status','==','QUEUED');
    if(staffId){active=active.where('staffId','==',staffId);waiting=waiting.where('staffId','==',staffId);}
    const [snapshot,queued]=await Promise.all([active.limit(staffId?2:351).get(),waiting.limit(staffId?13:1001).get()]);
    if(snapshot.size>(staffId?1:350))fail('resource-exhausted','عدد الخدمات الجارية تجاوز حد العرض الآمن');
    if(queued.size>(staffId?12:1000))fail('resource-exhausted','طابور الفرع تجاوز حد العرض الآمن؛ حدّث مهام العاملين');
    return {branchId,serverClock:d.now(),serverNowMs:d.clockMillis?.()||cairoAppointmentMillis(d.now().dateKey,d.now().time),sessions:snapshot.docs.filter(s=>s.data().branchId===branchId).map(s=>view(s.id,s.data())),queued:queued.docs.map(s=>view(s.id,s.data())).sort((a,b)=>a.startTime.localeCompare(b.startTime))};
  }
  async function checkInterval(tx, member, branch, interval, bookingId='', ownSessionId='') {
    const guards=await d.schedule.readGuards(tx,[{staffId:member.id,branchId:'all',dateKey:interval.dateKey}]);
    const leaves=await d.schedule.activeLeaves(tx,{staffId:member.id,branchId:'all',dateKey:interval.dateKey});
    const others=leaves.filter(leaf=>leaf.sourceServiceSessionId!==ownSessionId);
    if(others.some(leaf=>overlap(interval,{startTime:leaf.startTime||'00:00',endTime:leaf.endTime||'23:59'})))fail('failed-precondition','الفترة تتعارض مع راحة أو عدم توفر مسجل للعامل');
    if(!staffCanServeInterval(member,{branchId:branch.id,day:new Date(interval.dateKey+'T12:00:00Z').getUTCDay(),start:minutes(interval.startTime),end:minutes(interval.endTime),openingTime:branch.openingTime,closingTime:branch.closingTime,leaves:[]}))fail('failed-precondition','العامل غير متاح داخل الشيفت أو الفترة المختارة');
    const conflicts=await d.schedule.bookingConflicts(tx,{staffId:member.id,branchId:'all',...interval},bookingId);
    if(conflicts.length)fail('failed-precondition','الفترة متعارضة مع حجز قائم؛ راجع الحجوزات قبل بدء الخدمة أو تمديدها');
    return guards;
  }
  async function start(r,{workerStaffId='',bookingDriven=false}={}) {
    const branchId=await access(r,workerStaffId),data=r.data||{},staffId=data.staffId,span=duration(data.durationMinutes,data.serviceId?480:240),key=requestKey(data.idempotencyKey),bookingId=data.bookingId||'';
    if(!validId(staffId)||bookingId&&!validId(bookingId))fail('invalid-argument','العامل أو الحجز غير صحيح');
    if(workerStaffId&&(staffId!==workerStaffId||!bookingId))fail('permission-denied','اختر حجزًا مسندًا لحسابك');
    if(bookingId&&!workerStaffId)d.requirePermission(r,'bookings');
    const id='service_'+digest([r.auth.uid,key]),ref=d.db.doc('workerServiceSessions/'+id),stateRef=d.db.doc('workerServiceState/'+staffId),leaveRef=d.db.doc('workerLeaves/'+id);
    const fingerprint=digest({branchId,staffId,span,bookingId,...(data.serviceId?{serviceId:data.serviceId,serviceKind:data.serviceKind||'service'}:{})});
    return d.db.runTransaction(async tx=>{
      const [existing,state,staff,branch,booking]=await tx.getAll(ref,stateRef,d.db.doc('staff/'+staffId),d.db.doc('branches/'+branchId),...(bookingId?[d.db.doc('bookings/'+bookingId)]:[]));
      if(existing.exists){if(existing.data().fingerprint!==fingerprint||existing.data().branchId!==branchId)fail('already-exists','تم استخدام الطلب ببيانات مختلفة');return {ok:true,idempotent:true,session:view(id,existing.data())};}
      if(state.exists&&state.data().staffId!==staffId)fail('failed-precondition','سجل العامل يحتاج مراجعة');
      if(state.data()?.queueSessionIds?.length)fail('failed-precondition','ابدأ المهمة المحجوزة في الطابور أولًا');
      if(state.data()?.activeSessionId)fail('already-exists','العامل عنده خدمة جارية بالفعل؛ انهيها أو مدّدها');
      if(!staff.exists||!branch.exists||branch.data().active===false||!staff.data().branchIds?.includes(branchId))fail('failed-precondition','العامل أو الفرع غير متاح');
      if(workerStaffId&&(staff.data().active===false||staff.data().userUid!==r.auth.uid))fail('permission-denied','تغير ربط العامل');
      if(bookingDriven&&booking?.exists&&(booking.data().paymentStatus!=='unpaid'||booking.data().financialPosted||['PAID','VOIDED','REFUNDED'].includes(booking.data().orderState)))fail('failed-precondition','الحجز مدفوع أو مغلق');
      if(bookingDriven&&booking?.exists&&workerFinishedBooking(booking.data(),staffId))fail('failed-precondition','خدماتك في الشيك خلصت بالفعل');
      const source=data.serviceId?await sourceDuration(tx,data,branchId):null;
      if(source&&staff.data().serviceIds?.length&&source.serviceIds.some(id=>!staff.data().serviceIds.includes(id)))fail('failed-precondition','العامل غير مخصص لهذه الخدمة');
      const effectiveSpan=bookingDriven?duration(Math.ceil(Number(booking?.data()?.duration||5)/5)*5,480):source?.span||(booking?.exists&&Number.isFinite(Number(booking.data().duration))?duration(Number(booking.data().duration),480):span);
      const now=d.now(),end=minutes(now.time)+effectiveSpan;
      if(end>1439)fail('failed-precondition','المدة تتجاوز نهاية اليوم؛ اختار مدة أقل');
      if(bookingId&&(!booking?.exists||booking.data().branchId!==branchId||!(bookingDriven?bookingServiceWorkers(booking.data()).includes(staffId):booking.data().staffId===staffId)||booking.data().bookingDate!==now.dateKey||!(bookingDriven?['confirmed','arrived'].includes(booking.data().status)||booking.data().source==='pos'&&booking.data().paymentStatus==='unpaid'&&booking.data().status==='completed':['pending','confirmed','arrived'].includes(booking.data().status))))fail('failed-precondition','الحجز لا يتبع العامل والفرع واليوم أو ليس نشطًا');
      if(bookingDriven&&d.checkPresence&&!await d.checkPresence(tx,{...staff.data(),id:staffId},branchId,now.dateKey,asTime(end)))fail('failed-precondition','سجل حضورك أولًا وتأكد أن الخدمة داخل مدة الوردية');
      const settings=await d.readSettings();
      const interval={dateKey:now.dateKey,startTime:now.time,endTime:asTime(end)};
      const guards=await checkInterval(tx,{...staff.data(),id:staffId},{...settings,...branch.data(),id:branchId},interval,bookingId);
      const at=timestamp(),row={...interval,staffId,staffName:String(staff.data().nameAr||staffId),branchId,bookingId:bookingId||null,active:true,status:'ACTIVE',version:1,fingerprint,durationMinutes:effectiveSpan,...(bookingDriven?{bookingDriven:true}:{}),title:source?.title||(bookingDriven?String(booking.data().customerName||'عميل'):''),startedBy:r.auth.uid,createdAt:at,updatedAt:at};
      d.schedule.writeGuards(tx,guards);
      if(bookingId&&bookingDriven)tx.update(booking.ref,{serviceStatus:'IN_PROGRESS',serviceProgress:{...(booking.data().serviceProgress||{}),[staffId]:{status:'IN_PROGRESS',sessionId:id,startedAt:at}},...(booking.data().source!=='pos'?{status:'arrived',arrivedAt:at}:{}),updatedAt:at});
      else if(bookingId&&booking.data().status!=='arrived')tx.update(booking.ref,{status:'arrived',arrivedAt:at,updatedAt:at});
      tx.create(ref,row);
      tx.set(stateRef,{staffId,branchId,...interval,activeSessionId:id,version:(state.data()?.version||0)+1,updatedAt:at});
      tx.create(leaveRef,{staffId,branchId:'all',...interval,kind:'busy',reason:'خدمة جارية',active:true,sourceServiceSessionId:id,createdAt:at,updatedAt:at});
      tx.create(d.db.collection('activityLogs').doc(),{action:'worker-service-start',branchId,staffId,sessionId:id,actorUid:r.auth.uid,durationMinutes:effectiveSpan,bookingId:bookingId||null,createdAt:at});
      return {ok:true,session:view(id,row)};
    });
  }
  async function change(r,finish=false,{workerStaffId='',taskFinalStatus='DONE'}={}) {
    const branchId=await access(r,workerStaffId),data=r.data||{},id=data.sessionId,key=requestKey(data.idempotencyKey);
    if(!validId(id)||!Number.isSafeInteger(data.expectedVersion)||data.expectedVersion<1)fail('invalid-argument','الخدمة أو نسخة بياناتها غير صحيحة');
    const extra=finish?0:duration(data.additionalMinutes,120),ref=d.db.doc('workerServiceSessions/'+id);
    const outcome=await d.db.runTransaction(async tx=>{
      const session=await tx.get(ref),row=session.data();
      if(!session.exists||row.branchId!==branchId||workerStaffId&&row.staffId!==workerStaffId)fail('permission-denied','الخدمة لا تتبع العامل والفرع المختار');
      if(finish&&row.status==='FINISHED'&&row.finishRequestKey===key)return {ok:true,idempotent:true,session:view(id,row),...(row.bookingId?{notificationId:'service_finished_'+id}:{})};
      if(!finish&&row.lastExtendRequestKey===key){if(row.lastExtendMinutes!==extra)fail('already-exists','التمديد محفوظ بمدة مختلفة');return {ok:true,idempotent:true,session:view(id,row)};}
      if(row.active!==true||row.version!==data.expectedVersion)fail('aborted','تغيرت الخدمة؛ حدّث بيانات العامل قبل المحاولة');
      const stateRef=d.db.doc('workerServiceState/'+row.staffId),leaveRef=d.db.doc('workerLeaves/'+id);
      const [state,leave,staff,branch]=await tx.getAll(stateRef,leaveRef,d.db.doc('staff/'+row.staffId),d.db.doc('branches/'+branchId));
      if(state.data()?.staffId!==row.staffId||state.data()?.activeSessionId!==id||!leave.exists||leave.data().sourceServiceSessionId!==id)fail('failed-precondition','سجلات الخدمة غير متسقة؛ راجع الإدارة');
      const task=row.taskId?await tx.get(d.db.doc('workerTasks/'+row.taskId)):null;
      if(row.taskId&&(!task?.exists||task.data().serviceSessionId!==id||task.data().assigneeStaffId!==row.staffId||task.data().branchId!==branchId))fail('failed-precondition','ربط المهمة بالخدمة غير متسق');
      if(workerStaffId&&(!staff.exists||staff.data().active===false||staff.data().userUid!==r.auth.uid||!staff.data().branchIds?.includes(branchId)))fail('permission-denied','تغير ربط العامل');
      const linkedBooking=finish&&row.bookingId?await tx.get(d.db.doc('bookings/'+row.bookingId)):null;
      let completion=null,locks=[];
      if(linkedBooking?.exists&&linkedBooking.data().branchId===branchId&&bookingServiceWorkers(linkedBooking.data()).includes(row.staffId)){
        completion=finishBookingService(linkedBooking.data(),row.staffId,id,timestamp());
        if(completion.serviceStatus==='READY_FOR_CHECKOUT'){
          const ids=linkedBooking.data().lockIds||[];if(!Array.isArray(ids)||ids.length>500||ids.some(value=>typeof value!=='string'||value.includes('/')))fail('failed-precondition','راجع حجز العامل مع الإدارة');
          locks=ids.length?await tx.getAll(...ids.map(value=>d.db.doc('appointmentLocks/'+value))):[];
          if(locks.some(lock=>lock.exists&&![row.bookingId,linkedBooking.data().code].filter(Boolean).includes(lock.data().bookingId)))fail('failed-precondition','قفل الحجز مرتبط بعملية أخرى؛ راجع الإدارة');
        }
      }
      const at=timestamp(),now=d.now();let guards,next;
      if(finish){
        guards=await d.schedule.readGuards(tx,[{staffId:row.staffId,branchId:'all',dateKey:row.dateKey}]);
        next={...row,active:false,status:'FINISHED',version:row.version+1,finishedBy:r.auth.uid,finishedAt:at,finishDateKey:now.dateKey,finishTime:now.time,finishRequestKey:key,updatedAt:at};
      }else{
        if(row.dateKey!==now.dateKey)fail('failed-precondition','الخدمة من يوم سابق؛ انهيها بدل تمديدها');
        if(!staff.exists||!branch.exists||branch.data().active===false||!staff.data().branchIds?.includes(branchId))fail('failed-precondition','العامل أو الفرع غير متاح للتمديد');
        const end=Math.max(minutes(row.endTime),minutes(now.time))+extra;
        if(end>1439)fail('failed-precondition','التمديد يتجاوز نهاية اليوم');
        const settings=await d.readSettings(),interval={dateKey:row.dateKey,startTime:row.startTime,endTime:asTime(end)};
        guards=await checkInterval(tx,{...staff.data(),id:row.staffId},{...settings,...branch.data(),id:branchId},interval,row.bookingId||'',id);
        next={...row,endTime:interval.endTime,version:row.version+1,lastExtendRequestKey:key,lastExtendMinutes:extra,updatedAt:at};
      }
      let notificationId;
      if(finish&&completion){
        tx.update(linkedBooking.ref,{...completion,updatedAt:at});locks.filter(lock=>lock.exists).forEach(lock=>tx.delete(lock.ref));
        notificationId='service_finished_'+id;
        tx.create(d.db.doc('workerNotifications/'+notificationId),{type:'service_completed',staffId:row.staffId,branchId,bookingId:row.bookingId,entityId:row.bookingId,staffNameAr:row.staffName||staff.data()?.nameAr||'العامل',title:completion.serviceStatus==='READY_FOR_CHECKOUT'?'الخدمة اكتملت — العميل جاهز للتحصيل':'العامل أنهى خدماته في الشيك',body:(row.staffName||staff.data()?.nameAr||'العامل')+' • '+(linkedBooking.data().customerName||'عميل')+' • '+(linkedBooking.data().code||row.bookingId),readyForCheckout:completion.serviceStatus==='READY_FOR_CHECKOUT',read:false,createdAt:at});
      }
      d.schedule.writeGuards(tx,guards);
      if(task)tx.update(task.ref,{...(finish?{status:taskFinalStatus,completedAt:at}:{}),serviceTiming:{dateKey:next.dateKey,startTime:next.startTime,endTime:next.endTime,active:!finish},updatedAt:at});
      tx.set(ref,next);
      tx.update(leaveRef,{active:!finish,endTime:next.endTime,updatedAt:at});
      tx.set(stateRef,{...state.data(),activeSessionId:finish?null:id,endTime:next.endTime,version:(state.data().version||0)+1,updatedAt:at});
      tx.create(d.db.collection('activityLogs').doc(),{action:finish?'worker-service-finish':'worker-service-extend',branchId,staffId:row.staffId,sessionId:id,actorUid:r.auth.uid,...(!finish?{additionalMinutes:extra}:{}),createdAt:at});
      return {ok:true,session:view(id,next),...(notificationId?{notificationId}:{})};
    });
    if(outcome.notificationId&&d.notifyOperator)await d.notifyOperator(outcome.notificationId).catch(()=>{});
    return outcome;
  }

  const MAX_QUEUE=12;
  async function queuedRows(tx,state,staffId){
    if(state&&(state.staffId!==staffId||!Number.isSafeInteger(state.version)||state.version<0||state.version>=Number.MAX_SAFE_INTEGER))fail('failed-precondition','سجل حماية العامل يحتاج مراجعة');
    const ids=state?.queueSessionIds||[];
    if(!Array.isArray(ids)||ids.length>MAX_QUEUE||ids.some(id=>!validId(id))||new Set(ids).size!==ids.length)fail('failed-precondition','طابور العامل يحتاج مراجعة');
    const rows=ids.length?await tx.getAll(...ids.map(id=>d.db.doc('workerServiceSessions/'+id))):[];
    if(rows.some(row=>!row.exists||row.data().status!=='QUEUED'||row.data().staffId!==staffId||!dateKey(row.data().dateKey)||!clockTime(row.data().startTime)||!clockTime(row.data().endTime)||minutes(row.data().startTime)>=minutes(row.data().endTime)||!validId(row.data().taskId)))fail('failed-precondition','تغير طابور العامل؛ حدّث البيانات');
    return rows;
  }
  async function sourceDuration(tx,data,branchId){
    if(data.bookingId){
      if(!validId(data.bookingId))fail('invalid-argument','رقم الحجز غير صحيح');
      const booking=await tx.get(d.db.doc('bookings/'+data.bookingId));const row=booking.data();
      if(!booking.exists||row.branchId!==branchId||row.staffId!==data.staffId||row.bookingDate!==d.now().dateKey||!['pending','confirmed','arrived'].includes(row.status)||row.source==='pos')fail('failed-precondition','اختر حجزًا نشطًا لنفس العامل والفرع واليوم');
      const span=duration(Number(row.duration),480);
      return {span,booking,title:'خدمة حجز '+(row.code||booking.id),serviceIds:(row.items||[]).flatMap(item=>Array.isArray(item.serviceIds)?item.serviceIds:item.kind==='service'?[item.id]:[])};
    }
    if(data.serviceId){
      if(!validId(data.serviceId)||!['service','package'].includes(data.serviceKind||'service'))fail('invalid-argument','الخدمة غير صحيحة');
      const source=await tx.get(d.db.doc((data.serviceKind==='package'?'packages/':'services/')+data.serviceId)),row=source.data();
      if(!source.exists||row.active===false||row.status==='expired'||row.type==='product'||!row.branchIds?.includes(branchId))fail('failed-precondition','الخدمة غير متاحة في الفرع');
      return {span:duration(Number(row.duration),480),title:String(row.nameAr||'خدمة'),serviceIds:data.serviceKind==='package'?row.includedServiceIds||[]:[data.serviceId]};
    }
    return {span:duration(data.durationMinutes),title:String(data.title||'مهمة بمدة'),serviceIds:[]};
  }
  async function queue(r){
    const branchId=await access(r),data=r.data||{},staffId=data.staffId,key=requestKey(data.idempotencyKey);
    if(!validId(staffId))fail('invalid-argument','اختر العامل');
    const taskId=createHash('sha256').update(r.auth.uid+'|'+key).digest('hex'),id='queued_'+taskId,taskRef=d.db.doc('workerTasks/'+taskId),ref=d.db.doc('workerServiceSessions/'+id),stateRef=d.db.doc('workerServiceState/'+staffId);
    const fingerprint=digest({branchId,staffId,serviceId:data.serviceId||'',serviceKind:data.serviceKind||'service',bookingId:data.bookingId||'',durationMinutes:data.serviceId||data.bookingId?null:data.durationMinutes,title:String(data.title||'').trim().slice(0,120),details:String(data.details||'').trim().slice(0,600),priority:data.priority||'normal'});
    return d.db.runTransaction(async tx=>{
      const [existing,state,member,branch,existingTask]=await tx.getAll(ref,stateRef,d.db.doc('staff/'+staffId),d.db.doc('branches/'+branchId),taskRef);
      if(existing.exists){if(existing.data().fingerprint!==fingerprint)fail('already-exists','الطلب محفوظ ببيانات مختلفة');return {ok:true,taskId,idempotent:true,session:view(id,existing.data())};}
      if(existingTask.exists)fail('already-exists','معرف الطلب مستخدم لمهمة أخرى');
      if(!member.exists||!branch.exists||branch.data().active===false||member.data().active===false||!member.data().branchIds?.includes(branchId))fail('failed-precondition','العامل أو الفرع غير متاح');
      const queued=await queuedRows(tx,state.data(),staffId);
      if(queued.length>=MAX_QUEUE)fail('resource-exhausted','طابور العامل ممتلئ؛ راجع المهام الحالية');
      const active=state.data()?.activeSessionId?await tx.get(d.db.doc('workerServiceSessions/'+state.data().activeSessionId)):null;
      const now=d.now();
      if(active&&(!active.exists||active.data().active!==true||active.data().staffId!==staffId||!clockTime(active.data().startTime)||!clockTime(active.data().endTime)||active.data().dateKey!==now.dateKey||active.data().branchId!==branchId||minutes(active.data().endTime)<=minutes(now.time)))fail('failed-precondition','الخدمة الحالية متأخرة أو في فرع آخر؛ راجعها قبل إضافة مهمة');
      if(queued.some(row=>row.data().dateKey!==now.dateKey||row.data().branchId!==branchId))fail('failed-precondition','راجع المهام السابقة للعامل قبل إضافة مهمة جديدة');
      const source=await sourceDuration(tx,data,branchId);
      if(member.data().serviceIds?.length&&source.serviceIds.some(id=>!member.data().serviceIds.includes(id)))fail('failed-precondition','العامل غير مخصص لهذه الخدمة');
      const earliest=Math.max(minutes(now.time),...(active?[minutes(active.data().endTime)]:[]),...queued.map(row=>minutes(row.data().endTime)));
      const startMinute=source.booking?minutes(source.booking.data().bookingTime):earliest;
      if(startMinute<earliest)fail('failed-precondition','الحجز يتداخل مع المهمة الحالية أو الطابور؛ غيّر موعده من الحجوزات أولًا');
      const interval={dateKey:now.dateKey,startTime:asTime(startMinute),endTime:asTime(startMinute+source.span)};
      if(startMinute+source.span>1439)fail('failed-precondition','المهمة تتجاوز نهاية اليوم');
      const settings=await d.readSettings(),guards=await checkInterval(tx,{...member.data(),id:staffId},{...settings,...branch.data(),id:branchId},interval,data.bookingId||'');
      const at=timestamp(),row={...interval,staffId,staffName:String(member.data().nameAr||staffId),branchId,bookingId:data.bookingId||null,taskId,title:String(data.title||source.title).trim().slice(0,120),durationMinutes:source.span,active:false,status:'QUEUED',version:1,fingerprint,createdAt:at,updatedAt:at};
      d.schedule.writeGuards(tx,guards);tx.create(ref,row);
      tx.set(stateRef,{...(state.data()||{}),staffId,branchId,queueSessionIds:[...queued.map(row=>row.id),id],version:(state.data()?.version||0)+1,updatedAt:at});
      tx.create(d.db.doc('workerLeaves/'+id),{...interval,staffId,branchId:'all',kind:'busy',reason:'مهمة في الطابور',active:true,sourceServiceSessionId:id,createdAt:at,updatedAt:at});
      tx.create(taskRef,{branchId,assigneeStaffId:staffId,assigneeNameAr:row.staffName,title:String(data.title||source.title).trim().slice(0,120),details:String(data.details||'').trim().slice(0,600),priority:['low','normal','high','urgent'].includes(data.priority)?data.priority:'normal',bookingId:data.bookingId||null,status:'NEW',serviceSessionId:id,durationMinutes:source.span,serviceTiming:{...interval,active:false},createdBy:r.auth.uid,createdAt:at,updatedAt:at});
      tx.create(d.db.doc('workerNotifications/task_'+taskId),{staffId,branchId,type:'task',entityId:taskId,title:'مهمة جديدة في الطابور',body:String(data.title||source.title).slice(0,120),read:false,createdAt:at});
      tx.create(d.db.collection('activityLogs').doc(),{action:'queue-worker-service',branchId,staffId,taskId,sessionId:id,actorUid:r.auth.uid,durationMinutes:source.span,createdAt:at});
      return {ok:true,taskId,session:view(id,row)};
    });
  }
  async function checkTimeline(tx,member,branch,plans,excludedSessions){
    const context={staffId:member.id,branchId:'all',dateKey:plans[0].interval.dateKey};
    const guards=await d.schedule.readGuards(tx,[context]),leaves=await d.schedule.activeLeaves(tx,context),bookings=await d.schedule.bookingConflicts(tx,{...context,startTime:'00:00',endTime:'23:59'},'',true);
    const external=leaves.filter(leaf=>!excludedSessions.includes(leaf.sourceServiceSessionId));
    for(const plan of plans){
      const interval=plan.interval;
      if(minutes(interval.endTime)>1439||external.some(leaf=>overlap(interval,{startTime:leaf.startTime||'00:00',endTime:leaf.endTime||'23:59'}))||!staffCanServeInterval(member,{branchId:branch.id,day:new Date(interval.dateKey+'T12:00:00Z').getUTCDay(),start:minutes(interval.startTime),end:minutes(interval.endTime),openingTime:branch.openingTime,closingTime:branch.closingTime,leaves:[]}))fail('failed-precondition','تعديل الطابور يتجاوز الشيفت أو يتداخل مع بريك أو إجازة');
      if(bookings.some(booking=>booking.bookingId!==plan.row.bookingId&&minutes(booking.bookingTime)<minutes(interval.endTime)&&minutes(booking.bookingTime)+booking.duration>minutes(interval.startTime)))fail('failed-precondition','توقيت الطابور الجديد يتعارض مع حجز قائم؛ راجع مواعيد الحجوزات');
    }
    return guards;
  }
  async function startQueued(r,taskId,workerStaffId){
    const branchId=await access(r,workerStaffId),id=r.data.sessionId,ref=d.db.doc('workerServiceSessions/'+id);
    return d.db.runTransaction(async tx=>{
      const rowSnap=await tx.get(ref),row=rowSnap.data();
      if(!rowSnap.exists||row.branchId!==branchId||row.taskId!==taskId||workerStaffId&&row.staffId!==workerStaffId)fail('permission-denied','المهمة لا تتبع العامل والفرع');
      if(row.active===true)return {ok:true,idempotent:true,status:'IN_PROGRESS',session:view(id,row)};
      if(row.status!=='QUEUED')fail('failed-precondition','المهمة ليست في طابور الانتظار');
      const [state,member,branch,task,leave]=await tx.getAll(d.db.doc('workerServiceState/'+row.staffId),d.db.doc('staff/'+row.staffId),d.db.doc('branches/'+branchId),d.db.doc('workerTasks/'+taskId),d.db.doc('workerLeaves/'+id));
      if(!task.exists||task.data().serviceSessionId!==id||!['NEW','SEEN'].includes(task.data().status)||!leave.exists||leave.data().sourceServiceSessionId!==id)fail('failed-precondition','تغير ربط المهمة');
      const queued=await queuedRows(tx,state.data(),row.staffId);
      if(state.data()?.activeSessionId||queued[0]?.id!==id)fail('failed-precondition','انهي المهمة الحالية وابدأ أول مهمة في الطابور');
      const queuedTasks=await tx.getAll(...queued.map(row=>d.db.doc('workerTasks/'+row.data().taskId)));
      const bookingIds=[...new Set(queued.map(row=>row.data().bookingId).filter(Boolean))],linkedBookings=bookingIds.length?await tx.getAll(...bookingIds.map(id=>d.db.doc('bookings/'+id))):[];
      const bookingsById=new Map(linkedBookings.map(s=>[s.id,s]));
      if(queuedTasks.some((value,i)=>!value.exists||value.data().serviceSessionId!==queued[i].id||value.data().assigneeStaffId!==row.staffId||value.data().branchId!==branchId||!['NEW','SEEN'].includes(value.data().status)))fail('failed-precondition','تغير ربط مهام الطابور');
      for(const linked of linkedBookings)if(!linked.exists||linked.data().staffId!==row.staffId||linked.data().branchId!==branchId||linked.data().bookingDate!==d.now().dateKey||!['pending','confirmed','arrived'].includes(linked.data().status))fail('failed-precondition','حجز في الطابور اتغير أو اتلغى؛ راجعه قبل بدء المهمة');
      const now=d.now(),span=duration(Number(task.data().durationMinutes),480),end=minutes(now.time)+span;
      if(row.dateKey!==now.dateKey||end>1439||!member.exists||!branch.exists||branch.data().active===false||!member.data().branchIds?.includes(branchId))fail('failed-precondition','راجع يوم المهمة والعامل والفرع');
      const settings=await d.readSettings(),interval={dateKey:now.dateKey,startTime:now.time,endTime:asTime(end)};
      const plans=[{snapshot:rowSnap,task, row,interval}],future=[];let tail=end;
      for(let i=1;i<queued.length;i++){
        const value=queued[i].data(),linked=bookingsById.get(value.bookingId),begin=linked?minutes(linked.data().bookingTime):Math.max(tail,minutes(value.startTime)),span=duration(Number(queuedTasks[i].data().durationMinutes),480);
        if(begin<tail||begin+span>1439)fail('failed-precondition','تأخير المهمة يتداخل مع حجز محدد أو نهاية اليوم');
        const nextInterval={dateKey:now.dateKey,startTime:asTime(begin),endTime:asTime(begin+span)};
        const plan={snapshot:queued[i],task:queuedTasks[i],row:value,interval:nextInterval};plans.push(plan);future.push(plan);tail=begin+span;
      }
      const guards=await checkTimeline(tx,{...member.data(),id:row.staffId},{...settings,...branch.data(),id:branchId},plans,queued.map(row=>row.id));
      const at=timestamp(),next={...row,...interval,active:true,status:'ACTIVE',version:row.version+1,startedBy:r.auth.uid,startedAt:at,updatedAt:at};
      d.schedule.writeGuards(tx,guards);tx.set(ref,next);tx.update(leave.ref,{...interval,active:true,reason:'خدمة جارية',updatedAt:at});
      for(const plan of future){tx.update(plan.snapshot.ref,{...plan.interval,updatedAt:at});tx.update(d.db.doc('workerLeaves/'+plan.snapshot.id),{...plan.interval,updatedAt:at});tx.update(plan.task.ref,{serviceTiming:{...plan.interval,active:false},updatedAt:at});}
      if(row.bookingId)tx.update(bookingsById.get(row.bookingId).ref,{status:'arrived',arrivedAt:at,updatedAt:at});
      tx.set(state.ref,{...state.data(),...interval,activeSessionId:id,queueSessionIds:queued.slice(1).map(row=>row.id),version:(state.data().version||0)+1,updatedAt:at});
      tx.update(task.ref,{status:'IN_PROGRESS',serviceTiming:{...interval,active:true},startedAt:at,updatedAt:at});
      tx.create(d.db.collection('activityLogs').doc(),{action:'start-queued-worker-service',branchId,staffId:row.staffId,taskId,sessionId:id,actorUid:r.auth.uid,createdAt:at});
      return {ok:true,status:'IN_PROGRESS',session:view(id,next)};
    });
  }
  async function cancelQueued(r,taskId){
    const branchId=await access(r),id=r.data.sessionId,ref=d.db.doc('workerServiceSessions/'+id);
    return d.db.runTransaction(async tx=>{
      const snapshot=await tx.get(ref),row=snapshot.data();
      if(!snapshot.exists||row.branchId!==branchId||row.taskId!==taskId)fail('permission-denied','المهمة لا تتبع الفرع');
      if(row.status==='CANCELLED')return {ok:true,idempotent:true,status:'CANCELLED'};
      if(row.status!=='QUEUED')fail('failed-precondition','المهمة بدأت بالفعل؛ حدّث حالتها قبل الإلغاء');
      const [state,task,leave]=await tx.getAll(d.db.doc('workerServiceState/'+row.staffId),d.db.doc('workerTasks/'+taskId),d.db.doc('workerLeaves/'+id));
      const queued=await queuedRows(tx,state.data(),row.staffId),guards=await d.schedule.readGuards(tx,[{staffId:row.staffId,branchId:'all',dateKey:row.dateKey}]);
      if(!task.exists||task.data().serviceSessionId!==id||!leave.exists||leave.data().sourceServiceSessionId!==id||!queued.some(row=>row.id===id))fail('failed-precondition','تغير ربط المهمة');
      const at=timestamp();d.schedule.writeGuards(tx,guards);tx.update(ref,{status:'CANCELLED',version:row.version+1,updatedAt:at});tx.update(leave.ref,{active:false,updatedAt:at});tx.update(task.ref,{status:'CANCELLED',updatedAt:at});tx.update(state.ref,{queueSessionIds:queued.filter(row=>row.id!==id).map(row=>row.id),version:state.data().version+1,updatedAt:at});
      tx.create(d.db.collection('activityLogs').doc(),{action:'cancel-queued-worker-service',branchId,staffId:row.staffId,taskId,actorUid:r.auth.uid,createdAt:at});return {ok:true,status:'CANCELLED'};
    });
  }
  async function transitionTask(r,taskId,status){
    const task=await d.db.doc('workerTasks/'+taskId).get(),value=task.data();
    if(!task.exists||!validId(value.serviceSessionId))fail('failed-precondition','المهمة ليست مرتبطة بخدمة');
    const workerStaffId=r.auth?.token?.role==='worker'?await d.linkedStaffId(r):'';
    if(workerStaffId&&value.assigneeStaffId!==workerStaffId||r.auth?.token?.role==='worker'&&(!workerStaffId||status==='CANCELLED'))fail('permission-denied','المهمة ليست متاحة لحساب العامل');
    d.requireBranchAccess(r,value.branchId);
    if(value.status===status)return {ok:true,idempotent:true,status};
    const data={...r.data,branchId:value.branchId,sessionId:value.serviceSessionId,idempotencyKey:'task_'+digest([taskId,status])};const request={...r,data};
    if(status==='IN_PROGRESS')return startQueued(request,taskId,workerStaffId);
    const session=await d.db.doc('workerServiceSessions/'+value.serviceSessionId).get();
    if(status==='CANCELLED'&&session.data()?.status==='QUEUED')return cancelQueued(request,taskId);
    if(!['DONE','CANCELLED'].includes(status))fail('invalid-argument','حالة المهمة غير صحيحة');
    return change({...request,data:{...data,expectedVersion:session.data()?.version}},true,{workerStaffId,taskFinalStatus:status});
  }
  async function startBooking(r){if(r.auth?.token?.role!=='worker')fail('permission-denied','خاص بحساب العامل');const staffId=await d.linkedStaffId(r);return start({...r,data:{...r.data,staffId,durationMinutes:5}},{workerStaffId:staffId,bookingDriven:true});}
  async function finishBooking(r){if(r.auth?.token?.role!=='worker')fail('permission-denied','خاص بحساب العامل');const staffId=await d.linkedStaffId(r);return change(r,true,{workerStaffId:staffId});}
  return {board,start,queue,transitionTask,startBooking,finishBooking,project:view,extend:r=>change(r),finish:r=>change(r,true)};

}
