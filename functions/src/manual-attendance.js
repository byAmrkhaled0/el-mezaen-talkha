// Operator-attested attendance is explicit, scoped and never fabricated as GPS evidence.
export function manualAttendanceHandler({db,engine,hash,FieldValue,HttpsError,requireLiveStaff,requireRole,requirePermission,requireBranchAccess,businessDateParts,getUser}){
 const fail=(code,message)=>{throw new HttpsError(code,message);};
 return async request=>{
  await requireLiveStaff(request);const role=requireRole(request,['admin','manager','cashier']);
  const {branchId,action,staffId,reason}=request.data||{};
  if(!['talkha','mashaya'].includes(branchId)||!['checkIn','checkOut'].includes(action)||typeof staffId!=='string'||!staffId||staffId.includes('/')||typeof reason!=='string'||reason.trim().length<3||reason.length>200)fail('invalid-argument','حدد الفرع والموظف وسبب التسجيل اليدوي (3 إلى 200 حرف)');
  if(role!=='admin')requirePermission(request,role==='cashier'?(staffId==='self'?'pos':'teamOperations'):'attendance');
  requireBranchAccess(request,branchId);
  const self=staffId==='self';if(self&&!['cashier','manager'].includes(role))fail('permission-denied','اختار عاملًا لتسجيل حضوره');
  const member=self?null:await db.doc('staff/'+staffId).get();const uid=self?request.auth.uid:member?.data()?.userUid;
  if(!uid||!self&&(!member.exists||member.data().active===false||!member.data().branchIds?.includes(branchId)))fail('failed-precondition','العامل غير مرتبط بحساب فعال في الفرع');
  const authUser=await getUser(uid);if(authUser.disabled||!self&&authUser.customClaims?.staffId!==staffId||authUser.customClaims?.role!==(self?role:'worker')||!authUser.customClaims?.branchIds?.includes(branchId))fail('permission-denied','حساب الموظف موقوف');
  const active=await engine.settle(uid),parts=businessDateParts(),personId=self?'account_'+hash(uid).slice(0,32):staffId;
  const ref=active&&(active.status==='PRESENT'||action==='checkOut')?db.doc('attendanceDays/'+active.id):db.doc(`attendanceDays/${parts.dateKey}_${personId}`);
  const policy=action==='checkIn'?await engine.plan(uid):null;
  return db.runTransaction(async tx=>{
   const refs=[ref,db.doc('users/'+uid),db.doc('users/'+request.auth.uid),db.doc('branches/'+branchId),...(!self?[db.doc('staff/'+staffId)]:[])];
   const [current,profile,actor,branch,staff]=await tx.getAll(...refs);const queue=await engine.sessionReads(tx,uid),account=profile.data(),operator=actor.data();
   if(!actor.exists||operator.active!==true||operator.role!==role||operator.roleChangePending||operator.accessOperation||role!=='admin'&&!operator.branchIds?.includes(branchId))fail('permission-denied','تغيرت صلاحية منفذ التسجيل');
   if(!profile.exists||account.active!==true||account.role!==(self?role:'worker')||account.roleChangePending||account.accessOperation||!account.branchIds?.includes(branchId))fail('permission-denied','حساب الموظف غير فعال في الفرع');
   if(!self&&(!staff.exists||staff.data().active===false||staff.data().userUid!==uid||account.staffId!==staffId||!staff.data().branchIds?.includes(branchId)))fail('permission-denied','تغير ربط العامل');
   if(!branch.exists||branch.data().active===false)fail('failed-precondition','الفرع غير متاح');
   const previous=current.data();if(current.exists&&(previous.userId!==uid||previous.staffId!==personId||previous.branchId!==branchId))fail('failed-precondition','السجل مرتبط بفرع مختلف');
   if(action==='checkIn'&&current.exists||action==='checkOut'&&previous?.status==='CHECKED_OUT')return {ok:true,idempotent:true,status:previous.status};
   if(action==='checkOut'&&!current.exists)fail('failed-precondition','سجل حضور الموظف أولًا');
   const now=FieldValue.serverTimestamp(),attestation={method:'MANUAL',verified:false,actorUid:request.auth.uid,actorRole:role,reason:reason.trim()};
   if(action==='checkIn'){
    const base={staffId:personId,staffNameAr:String(self?account.name||'الكاشير':staff.data().nameAr||account.name||'عامل').slice(0,100),userId:uid,accountRole:account.role,branchId,dateKey:parts.dateKey,status:'PRESENT',checkInTime:parts.time,checkInAt:now,locationEvidence:attestation,recordedBy:request.auth.uid,recordingMethod:'MANUAL',createdAt:now,updatedAt:now};
    const planned=engine.start(tx,uid,ref,base,policy,queue);tx.create(ref,{...base,...planned});
   }else{engine.end(tx,uid,ref,previous,queue);tx.update(ref,{checkOutEvidence:attestation,exitLocationConfirmed:false,checkOutRecordedBy:request.auth.uid,updatedAt:now});}
   tx.set(db.collection('activityLogs').doc(),{action:action==='checkIn'?'branch-manual-check-in':'branch-manual-check-out',actorUid:request.auth.uid,actorRole:role,targetUid:uid,staffId:personId,branchId,entityId:ref.id,collection:'attendanceDays',reason:reason.trim(),createdAt:now});
   return {ok:true,idempotent:false,status:action==='checkIn'?'PRESENT':'CHECKED_OUT',dateKey:parts.dateKey,method:'MANUAL'};
  });
 };
}
