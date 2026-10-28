import {cairoAppointmentMillis} from './worker-reminders.js';
const ms=value=>value?.toMillis?.()??(typeof value==='number'?value:Date.parse(value||''));
const clock=value=>Number.isFinite(value)?new Intl.DateTimeFormat('en-GB',{timeZone:'Africa/Cairo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'';
export function attendanceMonthWindow(month){const [y,m]=month.split('-').map(Number);const first=month+'-01',next=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10),from=new Date(Date.UTC(y,m-1,-1)).toISOString().slice(0,10);return {first,next,from,start:cairoAppointmentMillis(first,'00:00'),end:cairoAppointmentMillis(next,'00:00')};}
export function attendanceShiftEngine({db,Timestamp,FieldValue,HttpsError,hash,requireLiveAdmin,requireLiveStaff,linkedStaffId,requirePermission,now=()=>Date.now(),sendPush=async()=>({retryable:false})}) {
  const fail=(code,message)=>{throw new HttpsError(code,message);};
  const key=uid=>hash(uid).slice(0,40);
  const queueRef=uid=>db.doc(`attendanceShiftQueue/${key(uid)}`);
  async function identity(request) {
    await requireLiveStaff(request);
    const role=request.auth?.token?.role;
    if(!['worker','cashier','manager','media'].includes(role))fail('permission-denied','الحضور خاص بفريق العمل');
    const p=await db.doc(`users/${request.auth.uid}`).get(),a=p.data();
    if(!p.exists||a.active!==true||a.role!==role||a.roleChangePending||a.accessOperation)fail('permission-denied','الحساب غير فعال');
    let staffId=`account_${hash(request.auth.uid).slice(0,32)}`;
    if(role==='worker'){
      requirePermission(request,'attendance');
      staffId=await linkedStaffId(request);const s=await db.doc(`staff/${staffId}`).get();
      if(!s.exists||s.data().active===false||s.data().userUid!==request.auth.uid)fail('permission-denied','ربط العامل غير صحيح');
    }
    return {uid:request.auth.uid,staffId,role,profile:a};
  }
  async function plan(uid) {
    const p=await db.doc(`attendancePolicies/${key(uid)}`).get();
    if(!p.exists)return {durationMinutes:480,policyVersion:0};
    const minutes=p.data()?.durationMinutes;
    if(!Number.isInteger(minutes)||minutes<15||minutes>1440)fail('failed-precondition','الإدارة لازم تحدد مدة ورديتك الأول من قسم مدد وسجل الحضور');
    return {durationMinutes:minutes,policyVersion:p.data().version||1};
  }
  async function sessionReads(tx,uid){const ref=queueRef(uid);return {ref,snapshot:await tx.get(ref)};}
  function start(tx,uid,recordRef,base,policy,queue){
    const t=now(),due=t+policy.durationMinutes*60000;
    const previous=queue.snapshot.data();
    if(previous?.state==='ACTIVE')fail('failed-precondition','عندك وردية حضور مفتوحة؛ حدّث سجل الحضور أولًا');
    const fields={plannedMinutes:policy.durationMinutes,policyVersion:policy.policyVersion,startedAt:Timestamp.fromMillis(t),scheduledEndAt:Timestamp.fromMillis(due),recordVersion:2};
    tx.set(queue.ref,{state:'ACTIVE',uid,staffId:base.staffId,role:base.accountRole,branchId:base.branchId,recordPath:recordRef.path,dueAt:Timestamp.fromMillis(due),startedAt:Timestamp.fromMillis(t),plannedMinutes:policy.durationMinutes,updatedAt:FieldValue.serverTimestamp()});
    return fields;
  }
  function finishFields(record,automatic=false){
    const start=ms(record.startedAt||record.checkInAt),due=ms(record.scheduledEndAt),t=now();
    if(!Number.isFinite(start))return {status:'CHECKED_OUT',checkOutAt:FieldValue.serverTimestamp(),checkOutTime:clock(t),endReason:'MANUAL',durationUnknown:true};
    const timed=Number.isFinite(due)&&t>=due,end=timed?due:t;
    return {status:'CHECKED_OUT',checkOutAt:Timestamp.fromMillis(end),checkOutTime:clock(end),endedAt:Timestamp.fromMillis(end),workedSeconds:Math.max(0,Math.floor((end-start)/1000)),endReason:automatic||timed?'DURATION_COMPLETED':'MANUAL',exitLocationConfirmed:!automatic&&!timed,processedAt:FieldValue.serverTimestamp()};
  }
  function end(tx,uid,recordRef,record,queue,{automatic=false}={}){
    const fields=finishFields(record,automatic);
    tx.update(recordRef,fields);
    if(queue.snapshot.data()?.recordPath===recordRef.path)tx.set(queue.ref,{state:'DONE',updatedAt:FieldValue.serverTimestamp()},{merge:true});
    if(fields.endReason==='DURATION_COMPLETED'){
      const id=hash(recordRef.path).slice(0,48);
      tx.set(db.doc(`attendanceShiftNotifications/${id}`),{uid,role:record.accountRole||'worker',staffId:record.staffId,branchId:record.branchId,recordPath:recordRef.path,title:'مدة ورديتك اكتملت',body:`اكتملت ${record.plannedMinutes/60} ساعة، وتم إنهاء سجل حضورك تلقائيًا.`,link:record.accountRole==='worker'?'/worker/#attendance':'/admin/#admin=myAttendance',createdAt:FieldValue.serverTimestamp(),deliveryState:'PENDING',nextAttemptAt:Timestamp.fromMillis(now()),attempts:0});
    }
    tx.set(db.collection('activityLogs').doc(),{action:fields.endReason==='DURATION_COMPLETED'?'attendance-duration-completed':'attendance-manual-end',userId:uid,branchId:record.branchId,entityId:recordRef.id,collection:'attendanceDays',workedSeconds:fields.workedSeconds??null,createdAt:FieldValue.serverTimestamp()});
    return fields;
  }
  async function settle(uid){
    return db.runTransaction(async tx=>{
      const queue=await sessionReads(tx,uid),q=queue.snapshot.data();
      if(q?.state!=='ACTIVE')return null;
      const ref=db.doc(q.recordPath),snapshot=await tx.get(ref),record=snapshot.data();
      if(!snapshot.exists||record.userId!==uid){tx.set(queue.ref,{state:'INVALID'},{merge:true});return null;}
      if(record.status!=='PRESENT'){tx.set(queue.ref,{state:'DONE'},{merge:true});return null;}
      if(ms(q.dueAt)>now())return {id:snapshot.id,...record};
      return {id:snapshot.id,...record,...end(tx,uid,ref,record,queue,{automatic:true})};
    });
  }
  function project(snapshot){
    const r=typeof snapshot.data==='function'?snapshot.data():snapshot;
    const start=ms(r.startedAt||r.checkInAt),end=ms(r.endedAt||r.checkOutAt);
    return {id:snapshot.id||r.id,dateKey:r.dateKey,branchId:r.branchId,status:r.status,checkInTime:r.checkInTime||clock(start),checkOutTime:r.checkOutTime||'',startedAt:Number.isFinite(start)?new Date(start).toISOString():null,endedAt:Number.isFinite(end)?new Date(end).toISOString():null,scheduledEndAt:Number.isFinite(ms(r.scheduledEndAt))?new Date(ms(r.scheduledEndAt)).toISOString():null,plannedMinutes:r.plannedMinutes??null,workedSeconds:r.workedSeconds??null,endReason:r.endReason||null,recordingMethod:r.locationEvidence?.method==='MANUAL'?'MANUAL':Number.isFinite(r.locationEvidence?.distanceMeters)?'GPS':null,checkOutMethod:r.checkOutEvidence?.method==='MANUAL'?'MANUAL':null,legacy:!r.recordVersion};
  }
  async function month(request){
    let uid=request.auth?.uid;
    if(request.data?.uid&&request.data.uid!==uid){await requireLiveAdmin(request);uid=request.data.uid;}
    else await identity(request);
    if(typeof uid!=='string'||!uid||uid.includes('/'))fail('invalid-argument','الحساب غير صحيح');
    const month=request.data?.month;
    if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail('invalid-argument','حدد الشهر');
    await settle(uid);
    const window=attendanceMonthWindow(month);
    const q=await db.collection('attendanceDays').where('userId','==',uid).where('dateKey','>=',window.from).where('dateKey','<',window.next).orderBy('dateKey','desc').limit(34).get();
    const rows=q.docs.map(project).filter(r=>r.dateKey.startsWith(month)||Number.isFinite(Date.parse(r.startedAt))&&Date.parse(r.startedAt)<window.end&&(Date.parse(r.endedAt)||now())>window.start).map(r=>({...r,carryOver:!r.dateKey.startsWith(month),monthSeconds:r.workedSeconds==null||!Number.isFinite(Date.parse(r.startedAt))||!Number.isFinite(Date.parse(r.endedAt))?null:Math.max(0,Math.floor((Math.min(Date.parse(r.endedAt),window.end)-Math.max(Date.parse(r.startedAt),window.start))/1000))}));
    return {month,rows,summary:{days:rows.filter(r=>!r.carryOver).length,recordedSeconds:rows.reduce((sum,r)=>sum+(r.monthSeconds||0),0),open:rows.filter(r=>r.status==='PRESENT').length,unknown:rows.filter(r=>r.legacy&&r.workedSeconds==null).length,automatic:rows.filter(r=>r.endReason==='DURATION_COMPLETED').length}};
  }
  async function policies(request){
    await requireLiveAdmin(request);
    const role=request.data?.role||'worker',cursor=request.data?.cursor||'';
    if(!['worker','cashier','manager','media'].includes(role)||typeof cursor!=='string'||cursor.includes('/'))fail('invalid-argument','حدد الدور');
    let q=db.collection('users').where('role','==',role).orderBy('__name__').limit(101);if(cursor)q=q.startAfter(cursor);
    const result=await q.get(),docs=result.docs.slice(0,100);
    const settings=await Promise.all(docs.map(d=>db.doc(`attendancePolicies/${key(d.id)}`).get()));
    return {items:docs.map((d,i)=>({uid:d.id,staffId:d.data().staffId||null,name:d.data().name||d.data().username||'حساب موظف',role,active:d.data().active===true,branchIds:d.data().branchIds||[],durationMinutes:settings[i].exists?settings[i].data()?.durationMinutes:480,version:settings[i].data()?.version||0})),nextCursor:result.docs.length>100?docs.at(-1).id:null};
  }
  async function setPolicy(request){
    await requireLiveAdmin(request);
    const {uid,durationMinutes,expectedVersion}=request.data||{};
    if(typeof uid!=='string'||!uid||uid.includes('/')||!Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>1440||!Number.isInteger(expectedVersion)||expectedVersion<0)fail('invalid-argument','مدة الوردية من ربع ساعة إلى 24 ساعة');
    const ref=db.doc(`attendancePolicies/${key(uid)}`);
    return db.runTransaction(async tx=>{
      const [profile,before]=await Promise.all([tx.get(db.doc(`users/${uid}`)),tx.get(ref)]);
      if(!profile.exists||!['worker','cashier','manager','media'].includes(profile.data().role)||profile.data().active!==true||profile.data().roleChangePending)fail('failed-precondition','حدد حساب موظف فعال');
      const version=before.data()?.version||0;
      if(version!==expectedVersion)fail('aborted','المدة تغيرت؛ حدّث القائمة');
      tx.set(ref,{uid,durationMinutes,version:version+1,updatedBy:request.auth.uid,updatedAt:FieldValue.serverTimestamp()});
      tx.set(db.collection('activityLogs').doc(),{action:'set-attendance-duration',entityId:uid,actorUid:request.auth.uid,beforeMinutes:before.data()?.durationMinutes??null,afterMinutes:durationMinutes,createdAt:FieldValue.serverTimestamp()});
      return {ok:true,version:version+1};
    });
  }
  async function sweep(){
    const due=await db.collection('attendanceShiftQueue').where('state','==','ACTIVE').where('dueAt','<=',Timestamp.fromMillis(now())).orderBy('dueAt').limit(700).get();
    for(let i=0;i<due.docs.length;i+=10)await Promise.all(due.docs.slice(i,i+10).map(d=>settle(d.data().uid)));
    const pending=await db.collection('attendanceShiftNotifications').where('deliveryState','in',['PENDING','SENDING']).where('nextAttemptAt','<=',Timestamp.fromMillis(now())).orderBy('nextAttemptAt').limit(100).get();
    for(const doc of pending.docs){
      const lease=hash(`${doc.id}:${now()}:${Math.random()}`);
      const note=await db.runTransaction(async tx=>{const s=await tx.get(doc.ref),n=s.data();if(!n||!['PENDING','SENDING'].includes(n.deliveryState)||ms(n.nextAttemptAt)>now())return null;if(n.attempts>=5){tx.update(doc.ref,{deliveryState:'FAILED'});return null;}tx.update(doc.ref,{deliveryState:'SENDING',lease,attempts:n.attempts+1,nextAttemptAt:Timestamp.fromMillis(now()+120000)});return n;});
      if(!note)continue;
      let retryable=true;try{retryable=Boolean((await sendPush({...note,id:doc.id})).retryable);}catch{}
      await db.runTransaction(async tx=>{const s=await tx.get(doc.ref);if(s.data()?.lease===lease)tx.update(doc.ref,{deliveryState:retryable?'PENDING':'DONE',nextAttemptAt:Timestamp.fromMillis(now()+60000),updatedAt:FieldValue.serverTimestamp()});});
    }
    return {processed:due.size,notifications:pending.size};
  }
  return {identity,plan,sessionReads,start,end,settle,project,month,policies,setPolicy,sweep};
}
