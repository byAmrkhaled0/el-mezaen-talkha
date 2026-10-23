import { validateAttendanceLocation } from './core.js';

// Personal attendance grants no team-management permission and accepts no target identity.
export function staffSelfAttendanceHandlers({db,requireLiveStaff,requireRole,requireBranchAccess,branchesFor,rateLimit,businessDateParts,FieldValue,HttpsError,hash}) {
  const fail=(code,message)=>{throw new HttpsError(code,message);};
  async function context(request) {
    requireRole(request,['cashier','manager']);
    await requireLiveStaff(request);
    const profile=await db.doc(`users/${request.auth.uid}`).get();
    const account=profile.data();
    if(!profile.exists || account.active!==true || account.role!==request.auth.token.role || account.roleChangePending || account.accessOperation)
      fail('permission-denied','الحساب غير فعال؛ راجع الإدارة');
    const ids=[...new Set(branchesFor(request))].filter(id=>account.branchIds?.includes(id));
    if(!ids.length)fail('permission-denied','الحساب غير مرتبط بفرع معتمد');
    const staffId=`account_${hash(request.auth.uid).slice(0,32)}`;
    const {dateKey,time}=businessDateParts();
    return {account,ids,staffId,dateKey,time,ref:db.doc(`attendanceDays/${dateKey}_${staffId}`)};
  }
  async function read(request) {
    const c=await context(request);
    const [record,...branches]=await Promise.all([c.ref.get(),...c.ids.map(id=>db.doc(`branches/${id}`).get())]);
    const attendance=record.exists?record.data():null;
    if(attendance && attendance.userId!==request.auth.uid)fail('permission-denied','ربط سجل الحضور غير صحيح');
    return {dateKey:c.dateKey,attendance:attendance?{status:attendance.status,branchId:attendance.branchId,checkInTime:attendance.checkInTime||'',checkOutTime:attendance.checkOutTime||'',distanceMeters:attendance.checkOutEvidence?.distanceMeters??attendance.locationEvidence?.distanceMeters}:null,
      branches:branches.flatMap((branch,i)=>branch.exists&&branch.data().active!==false?[{id:c.ids[i],nameAr:branch.data().nameAr||c.ids[i]}]:[])};
  }
  async function record(request) {
    const c=await context(request),data=request.data||{};
    if(['staffId','userId','uid','targetUid'].some(key=>Object.hasOwn(data,key)))fail('invalid-argument','الحضور خاص بحسابك فقط');
    const {action,branchId}=data;
    if(!['checkIn','checkOut'].includes(action)||typeof branchId!=='string'||!c.ids.includes(branchId))fail('permission-denied','اختر فرعًا مصرحًا لحسابك');
    requireBranchAccess(request,branchId);
    await rateLimit(request,'own_staff_attendance',20,15*60*1000,request.auth.uid);
    const now=FieldValue.serverTimestamp();
    const result=await db.runTransaction(async tx=>{
      const [current,profile,branchSnapshot]=await Promise.all([tx.get(c.ref),tx.get(db.doc(`users/${request.auth.uid}`)),tx.get(db.doc(`branches/${branchId}`))]);
      const account=profile.data(),branch=branchSnapshot.data();
      if(!profile.exists||account.active!==true||account.role!==request.auth.token.role||account.roleChangePending||account.accessOperation||!account.branchIds?.includes(branchId))fail('permission-denied','تغير ربط حسابك؛ سجل الدخول مجددًا');
      if(!branchSnapshot.exists||branch.active===false)fail('failed-precondition','الفرع غير متاح');
      if(![branch.latitude,branch.longitude,data.latitude,data.longitude,data.accuracy].every(value=>typeof value==='number'&&Number.isFinite(value)))fail('failed-precondition','إحداثيات الفرع أو موقعك غير مكتملة');
      let evidence;
      try{evidence=validateAttendanceLocation({branchLatitude:branch.latitude,branchLongitude:branch.longitude,latitude:data.latitude,longitude:data.longitude,accuracy:data.accuracy,radiusMeters:branch.attendanceRadiusMeters??100});}
      catch(error){fail('failed-precondition',({OUTSIDE_BRANCH_GEOFENCE:'أنت خارج نطاق الفرع',LOCATION_ACCURACY_TOO_LOW:'دقة GPS غير كافية؛ حاول من مكان مكشوف',INVALID_ATTENDANCE_RADIUS:'نطاق حضور الفرع غير مضبوط'})[error.message]||'إحداثيات الموقع غير صحيحة');}
      const previous=current.data();
      if(current.exists&&(previous.userId!==request.auth.uid||previous.branchId!==branchId))fail('failed-precondition','سجل الحضور مرتبط بفرع أو حساب مختلف');
      if(action==='checkIn'&&current.exists||action==='checkOut'&&previous?.status==='CHECKED_OUT')return {idempotent:true,status:previous.status};
      if(action==='checkOut'&&!current.exists)fail('failed-precondition','سجّل حضورك أولًا');
      if(action==='checkIn')tx.create(c.ref,{staffId:c.staffId,staffNameAr:String(account.name||'فريق المزين').slice(0,100),userId:request.auth.uid,accountRole:account.role,branchId,dateKey:c.dateKey,status:'PRESENT',checkInTime:c.time,checkInAt:now,locationEvidence:{...evidence,latitude:Number(data.latitude.toFixed(5)),longitude:Number(data.longitude.toFixed(5))},createdAt:now,updatedAt:now});
      else tx.update(c.ref,{status:'CHECKED_OUT',checkOutTime:c.time,checkOutAt:now,checkOutEvidence:evidence,updatedAt:now});
      tx.set(db.collection('activityLogs').doc(),{action:action==='checkIn'?'staff-self-check-in':'staff-self-check-out',collection:'attendanceDays',entityId:c.ref.id,userId:request.auth.uid,actorRole:account.role,staffId:c.staffId,branchId,distanceMeters:evidence.distanceMeters,createdAt:now});
      return {idempotent:false,status:action==='checkIn'?'PRESENT':'CHECKED_OUT'};
    });
    return {ok:true,dateKey:c.dateKey,branchId,...result};
  }
  return {read,record};
}
