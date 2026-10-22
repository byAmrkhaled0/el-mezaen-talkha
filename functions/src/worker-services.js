import {createHash} from 'node:crypto';
import {minutes,staffCanServeInterval} from './core.js';

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
export async function activeServiceLeaves(db, requestedDate, now, ErrorType) {
  const snapshot=await db.collection('workerServiceSessions').where('active','==',true).limit(201).get();
  if(snapshot.size>200)throw new ErrorType('resource-exhausted','عدد الخدمات الجارية تجاوز حد العرض الآمن');
  return snapshot.docs.map(s=>serviceBlockingLeave(s.data(),requestedDate,now)).filter(Boolean);
}

export function workerServiceHandlers(d) {
  const fail=(code,message)=>{throw new d.HttpsError(code,message)};
  const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
  const timestamp=()=>d.FieldValue.serverTimestamp();
  const overlap=(a,b)=>minutes(a.startTime)<minutes(b.endTime)&&minutes(a.endTime)>minutes(b.startTime);
  const view=(id,row)=>({id,staffId:row.staffId,staffName:row.staffName,branchId:row.branchId,dateKey:row.dateKey,startTime:row.startTime,endTime:row.endTime,bookingId:row.bookingId||null,active:row.active===true,status:row.status,version:row.version,overdue:row.active===true&&(row.dateKey<d.now().dateKey||row.dateKey===d.now().dateKey&&minutes(row.endTime)<=minutes(d.now().time))});
  async function access(r) {
    await d.requireLiveStaff(r);
    if(!['admin','cashier'].includes(r.auth?.token?.role))fail('permission-denied','تشغيل الخدمات للأدمن والكاشير فقط');
    if(r.auth.token.role!=='admin')d.requirePermission(r,'teamOperations');
    const branchId=r.data?.branchId;
    if(!['talkha','mashaya'].includes(branchId))fail('invalid-argument','اختر فرعًا محددًا');
    d.requireBranchAccess(r,branchId);
    return branchId;
  }
  function duration(value,max=240){if(!Number.isInteger(value)||value<5||value>max||value%5!==0)fail('invalid-argument','المدة من 5 دقائق وبمضاعفات 5');return value;}
  function requestKey(key){if(typeof key!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(key))fail('invalid-argument','معرف تأمين الطلب غير صحيح');return key;}
  async function board(r) {
    const branchId=await access(r),snapshot=await d.db.collection('workerServiceSessions').where('active','==',true).limit(201).get();
    if(snapshot.size>200)fail('resource-exhausted','عدد الخدمات الجارية تجاوز حد العرض الآمن');
    return {branchId,serverClock:d.now(),sessions:snapshot.docs.filter(s=>s.data().branchId===branchId).map(s=>view(s.id,s.data()))};
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
  async function start(r) {
    const branchId=await access(r),data=r.data||{},staffId=data.staffId,span=duration(data.durationMinutes),key=requestKey(data.idempotencyKey),bookingId=data.bookingId||'';
    if(!validId(staffId)||bookingId&&!validId(bookingId))fail('invalid-argument','العامل أو الحجز غير صحيح');
    if(bookingId)d.requirePermission(r,'bookings');
    const id='service_'+digest([r.auth.uid,key]),ref=d.db.doc('workerServiceSessions/'+id),stateRef=d.db.doc('workerServiceState/'+staffId),leaveRef=d.db.doc('workerLeaves/'+id);
    const fingerprint=digest({branchId,staffId,span,bookingId});
    return d.db.runTransaction(async tx=>{
      const [existing,state,staff,branch,booking]=await tx.getAll(ref,stateRef,d.db.doc('staff/'+staffId),d.db.doc('branches/'+branchId),...(bookingId?[d.db.doc('bookings/'+bookingId)]:[]));
      if(existing.exists){if(existing.data().fingerprint!==fingerprint||existing.data().branchId!==branchId)fail('already-exists','تم استخدام الطلب ببيانات مختلفة');return {ok:true,idempotent:true,session:view(id,existing.data())};}
      if(state.data()?.activeSessionId)fail('already-exists','العامل عنده خدمة جارية بالفعل؛ انهيها أو مدّدها');
      if(!staff.exists||!branch.exists||branch.data().active===false||!staff.data().branchIds?.includes(branchId))fail('failed-precondition','العامل أو الفرع غير متاح');
      const now=d.now(),end=minutes(now.time)+span;
      if(end>1439)fail('failed-precondition','المدة تتجاوز نهاية اليوم؛ اختار مدة أقل');
      if(bookingId&&(!booking?.exists||booking.data().branchId!==branchId||booking.data().staffId!==staffId||booking.data().bookingDate!==now.dateKey||!['pending','confirmed','arrived'].includes(booking.data().status)))fail('failed-precondition','الحجز لا يتبع العامل والفرع واليوم أو ليس نشطًا');
      const settings=await d.readSettings();
      const interval={dateKey:now.dateKey,startTime:now.time,endTime:asTime(end)};
      const guards=await checkInterval(tx,{...staff.data(),id:staffId},{...settings,...branch.data(),id:branchId},interval,bookingId);
      const at=timestamp(),row={...interval,staffId,staffName:String(staff.data().nameAr||staffId),branchId,bookingId:bookingId||null,active:true,status:'ACTIVE',version:1,fingerprint,startedBy:r.auth.uid,createdAt:at,updatedAt:at};
      d.schedule.writeGuards(tx,guards);
      if(bookingId&&booking.data().status!=='arrived')tx.update(booking.ref,{status:'arrived',arrivedAt:at,updatedAt:at});
      tx.create(ref,row);
      tx.set(stateRef,{staffId,branchId,...interval,activeSessionId:id,version:(state.data()?.version||0)+1,updatedAt:at});
      tx.create(leaveRef,{staffId,branchId:'all',...interval,kind:'busy',reason:'خدمة جارية',active:true,sourceServiceSessionId:id,createdAt:at,updatedAt:at});
      tx.create(d.db.collection('activityLogs').doc(),{action:'worker-service-start',branchId,staffId,sessionId:id,actorUid:r.auth.uid,durationMinutes:span,bookingId:bookingId||null,createdAt:at});
      return {ok:true,session:view(id,row)};
    });
  }
  async function change(r,finish=false) {
    const branchId=await access(r),data=r.data||{},id=data.sessionId,key=requestKey(data.idempotencyKey);
    if(!validId(id)||!Number.isSafeInteger(data.expectedVersion)||data.expectedVersion<1)fail('invalid-argument','الخدمة أو نسخة بياناتها غير صحيحة');
    const extra=finish?0:duration(data.additionalMinutes,120),ref=d.db.doc('workerServiceSessions/'+id);
    return d.db.runTransaction(async tx=>{
      const session=await tx.get(ref),row=session.data();
      if(!session.exists||row.branchId!==branchId)fail('permission-denied','الخدمة لا تتبع الفرع المختار');
      if(finish&&row.status==='FINISHED'&&row.finishRequestKey===key)return {ok:true,idempotent:true,session:view(id,row)};
      if(!finish&&row.lastExtendRequestKey===key){if(row.lastExtendMinutes!==extra)fail('already-exists','التمديد محفوظ بمدة مختلفة');return {ok:true,idempotent:true,session:view(id,row)};}
      if(row.active!==true||row.version!==data.expectedVersion)fail('aborted','تغيرت الخدمة؛ حدّث بيانات العامل قبل المحاولة');
      const stateRef=d.db.doc('workerServiceState/'+row.staffId),leaveRef=d.db.doc('workerLeaves/'+id);
      const [state,leave,staff,branch]=await tx.getAll(stateRef,leaveRef,d.db.doc('staff/'+row.staffId),d.db.doc('branches/'+branchId));
      if(state.data()?.activeSessionId!==id||!leave.exists||leave.data().sourceServiceSessionId!==id)fail('failed-precondition','سجلات الخدمة غير متسقة؛ راجع الإدارة');
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
      d.schedule.writeGuards(tx,guards);
      tx.set(ref,next);
      tx.update(leaveRef,{active:!finish,endTime:next.endTime,updatedAt:at});
      tx.set(stateRef,{...state.data(),activeSessionId:finish?null:id,endTime:next.endTime,version:(state.data().version||0)+1,updatedAt:at});
      tx.create(d.db.collection('activityLogs').doc(),{action:finish?'worker-service-finish':'worker-service-extend',branchId,staffId:row.staffId,sessionId:id,actorUid:r.auth.uid,...(!finish?{additionalMinutes:extra}:{}),createdAt:at});
      return {ok:true,session:view(id,next)};
    });
  }
  return {board,start,extend:r=>change(r),finish:r=>change(r,true)};
}
