import {createHash} from 'node:crypto';
export function assertDrawerActor(request, shift, ErrorType=Error){
 if(request.auth?.token?.role==='cashier'&&shift.cashierUid!==request.auth.uid)throw new ErrorType('permission-denied','الوردية عهدة كاشير آخر؛ استلم ورديتك أولًا');
}
export function cashHandoverHandlers(d){
 const fail=(c,m)=>{throw new d.HttpsError(c,m)},stamp=()=>d.FieldValue.serverTimestamp();
 const validUid=u=>typeof u==='string'&&u.length>0&&u.length<=128&&!u.includes('/');
 const cents=n=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e7||Math.abs(n*100-Math.round(n*100))>1e-6)fail('invalid-argument','مبلغ الاستلام غير صحيح');return Math.round(n*100)/100};
 const clean=r=>Object.fromEntries(Object.entries(r).filter(([k])=>!['createdAt','updatedAt','acceptedAt','disputedAt'].includes(k)));
 async function access(r){await d.requireLiveStaff(r);if(!['admin','cashier'].includes(r.auth.token.role))fail('permission-denied','التسليم متاح للأدمن والكاشير');d.requireCashPermission(r);const b=await d.readBranch(r.data?.branchId);d.requireBranchAccess(r,b.id);return b;}
 function recipientAccount(row,branchId){return row?.role==='cashier'&&row.active!==false&&row.disabled!==true&&!row.roleChangePending&&!['DISABLED','REVOKED'].includes(row.accountStatus)&&row.branchIds?.includes(branchId)&&row.permissions?.includes('pos');}
 async function liveRecipient(uid,branchId){if(!validUid(uid))fail('invalid-argument','معرف المستلم غير صحيح');const u=await d.authUser(uid).catch(()=>null);if(!u||u.disabled||u.customClaims?.role!=='cashier'||!u.customClaims?.branchIds?.includes(branchId)||!u.customClaims?.permissions?.includes('pos'))fail('failed-precondition','حساب المستلم غير متاح');}
 async function validateRecipient(tx,uid,branchId,fromUid){
  if(!validUid(uid)||uid===fromUid)fail('invalid-argument','اختر كاشيرًا آخر للاستلام');
  const account=await tx.get(d.db.doc('users/'+uid));
  if(!account.exists||!recipientAccount(account.data(),branchId))fail('permission-denied','المستلم ليس كاشيرًا مخولًا في نفس الفرع');
  return {uid,name:String(account.data().name||account.data().email||uid).slice(0,150)};
 }
 function writePending(tx,{shiftId,branchId,fromUid,fromName,to,amount,now}){
  const id='handover_'+createHash('sha256').update(shiftId).digest('hex');
  tx.create(d.db.doc('cashHandovers/'+id),{id,branchId,fromShiftId:shiftId,fromUid,fromName:String(fromName||fromUid).slice(0,150),toUid:to.uid,toName:to.name,declaredCash:amount,status:'PENDING',createdAt:now,updatedAt:now});
  return id;
 }
 async function read(r){const b=await access(r);const [state,users]=await Promise.all([d.db.doc('cashShiftState/'+b.id).get(),d.db.collection('users').where('role','==','cashier').where('branchIds','array-contains',b.id).limit(101).get()]);if(users.size>100)fail('resource-exhausted','عدد الحسابات يتطلب مراجعة الإدارة');
  const id=state.data()?.pendingHandoverId;const note=id?await d.db.doc('cashHandovers/'+id).get():null;
  const pending=note?.exists&&note.data().branchId===b.id?clean(note.data()):null;
  if(pending&&r.auth.token.role!=='admin'&&![pending.fromUid,pending.toUid].includes(r.auth.uid))return {branchId:b.id,pending:null,blocked:true,recipients:[]};
  return {branchId:b.id,pending,recipients:users.docs.filter(s=>s.id!==r.auth.uid&&recipientAccount(s.data(),b.id)).map(s=>({uid:s.id,name:String(s.data().name||s.data().email||s.id).slice(0,150)}))};
 }
 async function receive(r,resolve=false){const b=await access(r),id=r.data?.handoverId,amount=cents(r.data?.receivedCash),reason=String(r.data?.reason||'').trim().slice(0,300);
  if(!/^handover_[a-f0-9]{64}$/.test(id||''))fail('invalid-argument','مرجع التسليم غير صحيح');
  const release=resolve&&r.data?.releaseToAdmin===true;
  if(resolve&&(r.auth.token.role!=='admin'||!reason))fail('permission-denied','حسم الاختلاف يتطلب الأدمن وسببًا');
  const noteRef=d.db.doc('cashHandovers/'+id),initial=await noteRef.get();
  if(!initial.exists||initial.data().branchId!==b.id)fail('not-found','التسليم غير موجود في الفرع');
  if(!resolve&&r.auth.uid!==initial.data().toUid)fail('permission-denied','الاستلام متاح للكاشير المحدد فقط');
  if(!release)await liveRecipient(initial.data().toUid,b.id);
  return d.db.runTransaction(async tx=>{
   const stateRef=d.db.doc('cashShiftState/'+b.id),shiftRef=d.db.doc('cashShifts/shift_'+id),closedRef=d.db.doc('dailyClosings/'+b.id+'_'+d.today());
   const [note,state,existing,closed,branch,sourceShift]=await tx.getAll(noteRef,stateRef,shiftRef,closedRef,d.db.doc('branches/'+b.id),d.db.doc('cashShifts/'+initial.data().fromShiftId));const row=note.data();
   if(!note.exists||row.branchId!==b.id||row.toUid!==initial.data().toUid)fail('aborted','تغير سياق التسليم');
   if(!resolve&&r.auth.uid!==row.toUid)fail('permission-denied','غير مخول بالاستلام');
   if(row.status==='RELEASED_TO_ADMIN'){if(!release||row.receivedCash!==amount)fail('already-exists','تم حسم العهدة بالفعل');return {ok:true,idempotent:true,releasedToAdmin:true};}
   if(row.status==='ACCEPTED'){if(row.receivedCash!==amount)fail('already-exists','تم الاستلام بمبلغ مختلف');return {ok:true,idempotent:true,shiftId:row.toShiftId};}
   if(!['PENDING','DISPUTED'].includes(row.status)||state.data()?.pendingHandoverId!==id||state.data()?.openShiftId||state.data()?.status!=='HANDOVER_PENDING')fail('failed-precondition','التسليم ليس في حالة انتظار');
   if(!sourceShift.exists||sourceShift.data().status!=='CLOSED'||sourceShift.data().branchId!==b.id||sourceShift.data().cashierUid!==row.fromUid||sourceShift.data().actualCash!==row.declaredCash||row.fromShiftId!==initial.data().fromShiftId)fail('failed-precondition','سجل الوردية المسلمة غير متسق');
   if(!branch.exists||branch.data().active===false||closed.exists||existing.exists)fail('failed-precondition','الفرع أو اليوم غير متاح لفتح الوردية');
   const now=stamp();
   if(release){
    tx.update(noteRef,{status:'RELEASED_TO_ADMIN',receivedCash:amount,receiptDifference:Math.round((amount-row.declaredCash)*100)/100,resolvedBy:r.auth.uid,resolutionReason:reason,acceptedAt:now,updatedAt:now});
    tx.set(stateRef,{...state.data(),status:'CLOSED',openShiftId:null,pendingHandoverId:null,lastHandoverId:id,updatedAt:now});
    tx.create(d.db.collection('activityLogs').doc(),{action:'cash-handover-admin-custody',branchId:b.id,handoverId:id,actorUid:r.auth.uid,amount,reason,createdAt:now});
    return {ok:true,releasedToAdmin:true};
   }
   const to=await validateRecipient(tx,row.toUid,b.id,row.fromUid);
   if(!resolve&&(amount!==row.declaredCash||row.status==='DISPUTED')){
    if(row.status==='DISPUTED')return {ok:false,disputed:true};
    if(!reason)fail('invalid-argument','اكتب سبب اختلاف المبلغ');
    tx.update(noteRef,{status:'DISPUTED',reportedCash:amount,disputeReason:reason,disputedBy:r.auth.uid,disputedAt:now,updatedAt:now});
    tx.create(d.db.collection('activityLogs').doc(),{action:'cash-handover-disputed',branchId:b.id,handoverId:id,actorUid:r.auth.uid,declaredCash:row.declaredCash,reportedCash:amount,createdAt:now});return {ok:false,disputed:true};
   }
   const shift={branchId:b.id,businessDate:d.today(),cashierUid:to.uid,cashierName:to.name,openingCash:amount,cashSales:0,cashIn:0,cashOut:0,cashRefunds:0,expectedCash:amount,status:'OPEN',handoverId:id,previousShiftId:row.fromShiftId,handoverFromBusinessDate:sourceShift.data().businessDate,openedAt:now,openedBy:r.auth.uid,createdAt:now,updatedAt:now};
   tx.create(shiftRef,shift);
   tx.update(noteRef,{status:'ACCEPTED',receivedCash:amount,toShiftId:shiftRef.id,receiptDifference:Math.round((amount-row.declaredCash)*100)/100,acceptedBy:r.auth.uid,...(resolve?{resolvedBy:r.auth.uid,resolutionReason:reason}:{}),acceptedAt:now,updatedAt:now});
   tx.set(stateRef,{...state.data(),status:'OPEN',openShiftId:shiftRef.id,businessDate:shift.businessDate,pendingHandoverId:null,lastHandoverId:id,updatedAt:now});
   tx.create(d.db.collection('activityLogs').doc(),{action:resolve?'cash-handover-resolved':'cash-handover-accepted',branchId:b.id,handoverId:id,actorUid:r.auth.uid,fromShiftId:row.fromShiftId,toShiftId:shiftRef.id,amount,reason:reason||null,createdAt:now});
   return {ok:true,shiftId:shiftRef.id};
  });
 }
 async function history(r){
  const branch=await access(r),isAdmin=r.auth.token.role==='admin',cursor=r.data?.cursor||null;let cursorSnapshot=null;
  if(cursor){
   if(!/^handover_[a-f0-9]{64}$/.test(cursor))fail('invalid-argument','مرجع صفحة التسليمات غير صحيح');
   cursorSnapshot=await d.db.doc('cashHandovers/'+cursor).get();
   if(!cursorSnapshot.exists||cursorSnapshot.data().branchId!==branch.id||!isAdmin&&![cursorSnapshot.data().fromUid,cursorSnapshot.data().toUid].includes(r.auth.uid))fail('permission-denied','صفحة التسليمات خارج نطاق الحساب');
  }
  const fields=isAdmin?[null]:['fromUid','toUid'];
  const snapshots=await Promise.all(fields.map(async field=>{
   let query=d.db.collection('cashHandovers').where('branchId','==',branch.id);
   if(field)query=query.where(field,'==',r.auth.uid);
   query=query.orderBy('createdAt','desc');if(cursorSnapshot)query=query.startAfter(cursorSnapshot);
   return query.limit(21).get();
  }));
  const records=new Map();for(const snapshot of snapshots)for(const doc of snapshot.docs)records.set(doc.id,doc);
  const ordered=[...records.values()].sort((a,b)=>{const x=a.data().createdAt,y=b.data().createdAt;return (y.seconds-x.seconds)||(y.nanoseconds-x.nanoseconds)||b.id.localeCompare(a.id);});
  const iso=value=>value?.toDate?value.toDate().toISOString():null;
  const items=ordered.slice(0,20).map(doc=>{const row=doc.data();return {id:doc.id,branchId:row.branchId,fromUid:row.fromUid,fromName:row.fromName||row.fromUid,toUid:row.toUid,toName:row.toName||row.toUid,fromShiftId:row.fromShiftId,toShiftId:row.toShiftId||null,status:row.status,declaredCash:row.declaredCash,receivedCash:row.receivedCash??null,receiptDifference:row.receiptDifference??null,reportedCash:row.reportedCash??null,disputeReason:row.disputeReason||'',resolutionReason:row.resolutionReason||'',resolvedBy:row.resolvedBy||null,acceptedBy:row.acceptedBy||null,createdAt:iso(row.createdAt),acceptedAt:iso(row.acceptedAt)};});
  return {branchId:branch.id,items,nextCursor:ordered.length>20?items.at(-1).id:null};
 }
 return {read,history,accept:r=>receive(r),resolve:r=>receive(r,true),validateRecipient,liveRecipient,writePending};
}

// A same-day custody transfer is already present in the day's original float and cash movements.
// Keep it as the receiving shift's opening float, but count it once in daily cash totals.
export function sumCashShiftDayTotals(shifts){
 return shifts.reduce((totals,shift)=>{
  for(const field of ['openingCash','cashSales','cashIn','cashOut','cashRefunds'])totals[field]+=Number(shift[field]||0);
  if(shift.handoverId&&shift.previousShiftId&&shift.handoverFromBusinessDate&&shift.handoverFromBusinessDate===shift.businessDate)totals.openingCash-=Number(shift.openingCash||0);
  return totals;
 },{openingCash:0,cashSales:0,cashIn:0,cashOut:0,cashRefunds:0});
}
