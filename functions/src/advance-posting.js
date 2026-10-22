import {createHash} from 'node:crypto';

export const advanceCheckpoint = (db, staffId) => db.doc(`settings/advanceBalance_${staffId}`);
export function checkpointValue(snapshot, fail) {
  const value=snapshot.exists?snapshot.data():{version:0,outstandingCents:0,sequence:0,lastPayrollMonth:null};
  if(value.schemaVersion!==1&&snapshot.exists || ![value.version,value.outstandingCents,value.sequence].every(n=>Number.isSafeInteger(n)&&n>=0)) fail('failed-precondition','رصيد السلف غير متسق؛ يلزم مراجعة الإدارة');
  return value;
}
// Canonical cash movements and payroll allocations are immutable sources.
// This constant-size checkpoint coordinates both transactions, not another ledger.
export function advanceHandlers({db,FieldValue,Timestamp,HttpsError,requireLiveStaff,requireRole,
  requireBranchAccess,requirePermission,branchesFor,linkedStaffId,businessDateParts,calculateExpectedCash,notify}) {
  const fail=(code,message)=>{throw new HttpsError(code,message);};
  const id=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))fail('invalid-argument','مرجع غير صحيح');return value;};
  const serial=v=>v?.toDate?v.toDate().toISOString():Array.isArray(v)?v.map(serial):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,serial(x)])):v;
  const fingerprint=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const role=async(request,roles)=>{await requireLiveStaff(request);return requireRole(request,roles);};
  return {
    async getReadyWorkerAdvances(request) {
      await role(request,['cashier']);requirePermission(request,'pos');
      const branchId=request.data?.branchId;requireBranchAccess(request,branchId);
      if(!['talkha','mashaya'].includes(branchId))fail('invalid-argument','اختر فرع العمل');
      let query=db.collection('workerRequests').where('branchId','==',branchId).where('requestType','==','SALARY_ADVANCE').where('status','==','APPROVED').where('integrationStatus','==','AWAITING_DISBURSEMENT').orderBy('__name__');
      if(request.data?.cursor)query=query.startAfter(id(request.data.cursor));
      const rows=await query.limit(26).get(),items=rows.docs.slice(0,25).map(doc=>{
        const row=doc.data();return {requestId:doc.id,staffNameAr:row.staffNameAr,branchId:row.branchId,approvedAmount:row.approvedAmount,status:row.status,integrationStatus:row.integrationStatus,version:row.version};
      });
      return {items,nextCursor:rows.size>25?rows.docs[24].id:null};
    },
    async getWorkerAdvanceBalance(request) {
      const who=await role(request,['admin','manager','worker']);
      const staffId=who==='worker'?await linkedStaffId(request):id(request.data?.staffId);
      if(who!=='worker')requirePermission(request,'payroll');
      if(who==='worker'&&request.data?.staffId&&request.data.staffId!==staffId)fail('permission-denied','لا يمكنك قراءة رصيد عامل آخر');
      const [staff,balance]=await db.getAll(db.doc(`staff/${staffId}`),advanceCheckpoint(db,staffId));
      if(!staff.exists||staff.data().active===false)fail('permission-denied','العامل غير نشط');
      const assigned=staff.data().branchIds;
      if(!Array.isArray(assigned)||!assigned.length||assigned.some(b=>!['talkha','mashaya'].includes(b)))fail('failed-precondition','فروع العامل غير صحيحة');
      if(who==='worker'&&(staff.data().userUid!==request.auth.uid||assigned.some(b=>!branchesFor(request).includes(b))))fail('permission-denied','رصيد العامل غير متاح لهذا الحساب');
      if(who==='manager'&&assigned.some(b=>!branchesFor(request).includes(b)))fail('permission-denied','رصيد عامل مشترك خارج نطاقك');
      const value=checkpointValue(balance,fail);
      if(who==='manager'&&(value.attributionBranchIds||[]).some(branch=>!branchesFor(request).includes(branch)))fail('permission-denied','رصيد يتضمن سلف فرع خارج نطاقك؛ المراجعة للإدارة');
      return {staffId,outstandingAdvance:value.outstandingCents/100,balanceVersion:value.version,lastPayrollMonth:value.lastPayrollMonth||null,legacyAdvancesIncluded:false};
    },
    async disburseWorkerAdvance(request) {
      await role(request,['cashier']);requirePermission(request,'pos');
      const data=request.data||{};
      if(Object.keys(data).some(k=>!['requestId','expectedVersion','expectedAmount','expectedShiftId'].includes(k)))fail('invalid-argument','بيانات الصرف غير صحيحة');
      const requestId=id(data.requestId),expectedShiftId=id(data.expectedShiftId);
      if(!Number.isSafeInteger(data.expectedVersion)||data.expectedVersion<1||typeof data.expectedAmount!=='number'||!Number.isFinite(data.expectedAmount)||data.expectedAmount<=0)fail('invalid-argument','أعد تحميل مبلغ ونسخة الطلب');
      const ref=db.doc(`workerRequests/${requestId}`),moveRef=db.doc(`cashMovements/advance_${requestId}`),auditRef=db.doc(`activityLogs/advance_${requestId}`),noteRef=db.doc(`workerNotifications/advance_${requestId}`);
      const attempt=fingerprint({uid:request.auth.uid,requestId,expectedShiftId,version:data.expectedVersion,amount:data.expectedAmount});
      const result=await db.runTransaction(async tx=>{
        const snapshot=await tx.get(ref);if(!snapshot.exists)fail('not-found','طلب السلفة غير موجود');
        const row=snapshot.data();requireBranchAccess(request,row.branchId);
        if(row.requestType!=='SALARY_ADVANCE'||row.requestId!==requestId)fail('failed-precondition','طلب غير صالح للصرف');
        if(row.status==='DISBURSED'){
          if(row.disbursementFingerprint!==attempt)fail('already-exists','تم صرف السلفة بالفعل');
          const committed=await tx.get(moveRef);
          if(!committed.exists||committed.data().requestId!==requestId||committed.data().amount!==row.approvedAmount)fail('failed-precondition','مرجع الصرف غير متسق');
          return {ok:true,idempotent:true,requestId,movementId:moveRef.id,amount:row.approvedAmount,businessDate:row.disbursementDate,notificationId:noteRef.id};
        }
        if(row.status!=='APPROVED'||row.integrationStatus!=='AWAITING_DISBURSEMENT'||row.disbursementReference||!row.finalDecisionActor||!row.finalDecisionAt)fail('failed-precondition','السلفة غير معتمدة وجاهزة للصرف');
        if(row.version!==data.expectedVersion||row.approvedAmount!==data.expectedAmount||row.approvedAmount!==row.requestData?.amount)fail('aborted','تغير الطلب أو المبلغ؛ أعد تحميله');
        const cents=Math.round(row.approvedAmount*100);
        if(!Number.isSafeInteger(cents)||cents<=0||cents>1000000000||Math.abs(cents-row.approvedAmount*100)>0.000001)fail('failed-precondition','المبلغ خارج حدود العملية النقدية');
        const staffId=id(row.staffId),branchId=row.branchId,today=businessDateParts().dateKey;
        const balanceRef=advanceCheckpoint(db,staffId);
        const [staff,branch,state,closed,previous,balance,audit,note]=await tx.getAll(db.doc(`staff/${staffId}`),db.doc(`branches/${branchId}`),db.doc(`cashShiftState/${branchId}`),db.doc(`dailyClosings/${branchId}_${today}`),moveRef,balanceRef,auditRef,noteRef);
        if(!staff.exists||staff.data().active===false||!staff.data().branchIds?.includes(branchId))fail('failed-precondition','العامل لم يعد نشطًا في فرع الطلب');
        if(!branch.exists||branch.data().active===false||closed.exists)fail('failed-precondition','الفرع غير نشط أو يومه مغلق');
        if(previous.exists||audit.exists||note.exists)fail('failed-precondition','مراجع صرف غير متسقة؛ راجع الإدارة');
        if(state.data()?.status!=='OPEN'||state.data().openShiftId!==expectedShiftId||state.data().businessDate!==today)fail('failed-precondition','الوردية تغيرت أو مغلقة');
        const shiftRef=db.doc(`cashShifts/${expectedShiftId}`),shift=await tx.get(shiftRef),drawer=shift.data();
        if(!shift.exists||drawer.status!=='OPEN'||drawer.branchId!==branchId||drawer.businessDate!==today||drawer.cashierUid!==request.auth.uid)fail('permission-denied','الوردية لا تتبع الكاشير والفرع الحاليين');
        const checkpoint=checkpointValue(balance,fail),outstandingCents=checkpoint.outstandingCents+cents,sequence=checkpoint.sequence+1;
        if(!Number.isSafeInteger(outstandingCents)||!Number.isSafeInteger(sequence))fail('resource-exhausted','تجاوز دقة الرصيد؛ يلزم مراجعة الإدارة');
        if(businessDateParts().dateKey!==today)fail('aborted','تغير يوم العمل؛ أعد المحاولة');
        const now=FieldValue.serverTimestamp(),amount=cents/100,version=row.version+1;
        tx.create(moveRef,{type:'CASH_OUT',category:'advance',amount,reason:'صرف سلفة معتمدة',staffId,staffNameAr:staff.data().nameAr||staffId,requestId,branchId,shiftId:shiftRef.id,businessDate:today,actorUid:request.auth.uid,advancePostingVersion:1,disbursementSequence:sequence,createdAt:now});
        tx.update(shiftRef,{cashOut:FieldValue.increment(amount),expectedCash:calculateExpectedCash({...drawer,cashOut:Number(drawer.cashOut||0)+amount}),updatedAt:now});
        tx.set(balanceRef,{schemaVersion:1,staffId,version:checkpoint.version+1,outstandingCents,sequence,attributionBranchIds:[...new Set([...(checkpoint.attributionBranchIds||[]),branchId])].sort(),lastPayrollMonth:checkpoint.lastPayrollMonth||null,lastDisbursementReference:moveRef.id,updatedAt:now});
        tx.update(ref,{status:'DISBURSED',integrationStatus:'DISBURSED',version,disbursementReference:moveRef.id,disbursementDate:today,disbursedAt:now,disbursedBy:request.auth.uid,disbursementFingerprint:attempt,advancePostingVersion:1,disbursementSequence:sequence,advanceRemainingCents:cents,advanceDeductedCents:0,updatedAt:now,[`reviewHistory.v${version}`]:{actorUid:request.auth.uid,actorRole:'cashier',action:'DISBURSE',from:'APPROVED',to:'DISBURSED',version,at:now}});
        tx.create(auditRef,{action:'approved-advance-disbursement',requestId,staffId,branchId,shiftId:shiftRef.id,movementId:moveRef.id,amount,actorUid:request.auth.uid,createdAt:now});
        tx.create(noteRef,{staffId,branchId,type:'worker_request',requestId,entityId:requestId,title:'تم صرف السلفة',body:'تم صرف طلبك المعتمد؛ راجع مرجع الصرف في طلباتي',read:false,createdAt:now});
        return {ok:true,idempotent:false,requestId,movementId:moveRef.id,amount,businessDate:today,notificationId:noteRef.id};
      });
      let notificationDeferred=false;try{await notify(result.notificationId);}catch{notificationDeferred=true;}
      return {...result,notificationDeferred};
    }
  };
}

// At most 150 allocations: <=159 writes, bounded payload well below 10MiB.
// This is an atomic-work bound, not a monthly request/debt cap; payouts stay open.
export async function readAdvanceAllocation(tx,db,staffId,gross,month,fail) {
  const ref=advanceCheckpoint(db,staffId),snapshot=await tx.get(ref),checkpoint=checkpointValue(snapshot,fail);
  if(checkpoint.lastPayrollMonth&&month<=checkpoint.lastPayrollMonth)fail('failed-precondition','لا يمكن خصم السلف في شهر سابق أو مسوى؛ راجع ترتيب الرواتب');
  if(!checkpoint.outstandingCents)return {ref,checkpoint,allocations:[],deduction:0,remaining:0,remainingBranchIds:[]};
  const rows=await tx.get(db.collection('workerRequests').where('staffId','==',staffId).where('advancePostingVersion','==',1).where('advanceRemainingCents','>',0).orderBy('advanceRemainingCents').limit(151));
  if(rows.size>150)fail('resource-exhausted','تجاوز عدد تخصيصات السلف حد التسوية الذرية؛ لم يتم خصم أو صرف أي مبلغ');
  if(rows.docs.reduce((sum,doc)=>sum+Buffer.byteLength(JSON.stringify(doc.data())),0)>2*1024*1024)fail('resource-exhausted','حجم بيانات السلف يتجاوز حد التسوية الذرية');
  const sorted=[...rows.docs].sort((a,b)=>a.data().disbursementSequence-b.data().disbursementSequence||a.id.localeCompare(b.id));
  if(sorted.some(doc=>doc.data().disbursementReference!==`advance_${doc.id}`))fail('failed-precondition','مرجع صرف السلفة غير صحيح');
  const movements=sorted.length?await tx.getAll(...sorted.map(doc=>db.doc(`cashMovements/${doc.data().disbursementReference}`))):[];
  let total=0;const sequences=new Set();
  for(let i=0;i<sorted.length;i++){
    const row=sorted[i].data(),move=movements[i].data(),cents=Math.round(Number(move?.amount)*100);
    if(row.status!=='DISBURSED'||row.integrationStatus!=='DISBURSED'||!movements[i].exists||move.requestId!==sorted[i].id||move.staffId!==staffId||move.branchId!==row.branchId||move.advancePostingVersion!==1||move.category!=='advance'||move.type!=='CASH_OUT'||!Number.isSafeInteger(row.advanceRemainingCents)||row.advanceRemainingCents<=0||!Number.isSafeInteger(row.advanceDeductedCents)||row.advanceDeductedCents<0||row.advanceRemainingCents+row.advanceDeductedCents!==cents||!Number.isSafeInteger(row.disbursementSequence)||sequences.has(row.disbursementSequence))fail('failed-precondition','تخصيصات السلف غير متسقة؛ يلزم مراجعة الإدارة');
    // A payout committed in a later business month cannot silently be deducted
    // into an earlier payroll period. No previous settlement is ever amended.
    if(row.disbursementDate?.slice(0,7)>month)fail('failed-precondition','السلفة مصروفة في شهر لاحق؛ لا يمكن خصمها بأثر رجعي');
    sequences.add(row.disbursementSequence);total+=row.advanceRemainingCents;
  }
  if(total!==checkpoint.outstandingCents)fail('failed-precondition','رصيد السلف لا يطابق المراجع المعتمدة');
  let left=Math.min(Math.floor((gross+1e-9)*100),total);const deduction=left/100,allocations=[];
  for(const doc of sorted){if(!left)break;const row=doc.data(),cents=Math.min(left,row.advanceRemainingCents);left-=cents;allocations.push({ref:doc.ref,requestId:doc.id,movementId:row.disbursementReference,branchId:row.branchId,cents,remainingCents:row.advanceRemainingCents-cents,deductedCents:row.advanceDeductedCents+cents});}
  const allocated=new Map(allocations.map(item=>[item.requestId,item.cents]));
  const remainingBranchIds=[...new Set(sorted.filter(doc=>doc.data().advanceRemainingCents-(allocated.get(doc.id)||0)>0).map(doc=>doc.data().branchId))].sort();
  return {ref,checkpoint,allocations,deduction,remaining:(total-Math.round(deduction*100))/100,remainingBranchIds};
}
export function writeAdvanceAllocation(tx,allocation,staffId,month,payrollId,FieldValue) {
  const now=FieldValue.serverTimestamp();
  for(const item of allocation.allocations)tx.update(item.ref,{advanceRemainingCents:item.remainingCents,advanceDeductedCents:item.deductedCents,lastPayrollDeductionReference:payrollId,updatedAt:now});
  tx.set(allocation.ref,{schemaVersion:1,staffId,version:allocation.checkpoint.version+1,sequence:allocation.checkpoint.sequence,attributionBranchIds:allocation.remainingBranchIds,outstandingCents:Math.round(allocation.remaining*100),lastPayrollMonth:month,lastPayrollReference:payrollId,updatedAt:now});
}
