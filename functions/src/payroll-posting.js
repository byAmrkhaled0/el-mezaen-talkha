import {financialDayRef} from './financial-closing.js';
import {readAdvanceAllocation,writeAdvanceAllocation} from './advance-posting.js';
import {createHash} from 'node:crypto';

// The payroll identity remains month_staffId. Cash outflow is a linked posting,
// not a second salary expense. Existing earned-salary calculation is injected.
export function payrollPosting({db, FieldValue, HttpsError, calculatePayroll,
  calculateExpectedCash, nextMonthKey, businessDateParts, sanitizeText, requireLiveStaff,
  requirePermission, requireBranchAccess, branchesFor, allResourceBranchesAllowed}) {
  const fail=(code,message)=>{throw new HttpsError(code,message);};
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const serialize=value=>value?.toDate?value.toDate().toISOString():Array.isArray(value)?value.map(serialize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,serialize(v)])):value;
  // Callable responses contain committed scalar values, never serverTimestamp transforms.
  const publicPayment=row=>serialize(Object.fromEntries(Object.entries(row).filter(([key])=>!['paidAt','createdAt','updatedAt','postingFingerprint'].includes(key))));
  return async request=>{
    await requireLiveStaff(request);requirePermission(request,'payroll');
    const data=request.data||{},month=data.month,staffId=data.staffId,adjustment=Number(data.adjustment||0),method=sanitizeText(data.paymentMethod||'cash',30);
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')||!/^[A-Za-z0-9_-]{1,100}$/.test(staffId||'')||!Number.isFinite(adjustment)||Math.abs(adjustment)>1000000)fail('invalid-argument','بيانات صرف الراتب غير صحيحة');
    if(Object.keys(data).some(k=>!['month','staffId','adjustment','paymentMethod','fundingBranchId','expectedShiftId','expectedEntitlement','expectedBalanceVersion'].includes(k)))fail('invalid-argument','بيانات صرف الراتب غير صحيحة');
    if(data.expectedEntitlement!=null&&(typeof data.expectedEntitlement!=='number'||!Number.isFinite(data.expectedEntitlement)||data.expectedEntitlement<0))fail('invalid-argument','قيمة تأكيد المستحق غير صحيحة');
    if(data.expectedBalanceVersion!=null&&(!Number.isSafeInteger(data.expectedBalanceVersion)||data.expectedBalanceVersion<0))fail('invalid-argument','نسخة رصيد السلف غير صحيحة');
    if(data.fundingBranchId!=null&&!['talkha','mashaya'].includes(data.fundingBranchId))fail('invalid-argument','فرع صرف المرتب غير صحيح');
    if(data.expectedShiftId!=null&&!/^[A-Za-z0-9_-]{1,100}$/.test(data.expectedShiftId))fail('invalid-argument','مرجع الوردية غير صحيح');
    if(method!=='cash'&&(data.fundingBranchId!=null||data.expectedShiftId!=null))fail('invalid-argument','فرع الدرج للراتب النقدي فقط');
    const payrollRef=db.doc(`payrollPayments/${month}_${staffId}`),expenseRef=db.doc(`expenses/salary_${month}_${staffId}`),movementRef=db.doc(`cashMovements/salary_${month}_${staffId}`),auditRef=db.doc(`activityLogs/payroll_${month}_${staffId}`);
    const fingerprint=digest({month,staffId,adjustment,method,fundingBranchId:data.fundingBranchId||null,expectedShiftId:data.expectedShiftId||null,expectedEntitlement:data.expectedEntitlement??null,...(data.expectedBalanceVersion!=null?{expectedBalanceVersion:data.expectedBalanceVersion}:{})});
    return db.runTransaction(async transaction=>{
      const [existing,oldExpense]=await transaction.getAll(payrollRef,expenseRef);
      if(existing.exists){
        const paid=existing.data();
        if(paid.staffId!==staffId||paid.month!==month||paid.status!=='paid')fail('failed-precondition','سجل التسوية غير متسق؛ يلزم مراجعة الإدارة');
        if(!paid.branchId||paid.branchId==='all'&&request.auth.token.role!=='admin')fail('permission-denied','الراتب المشترك يتطلب الأدمن الرئيسي');
        if(paid.branchId!=='all')requireBranchAccess(request,paid.branchId);
        if(paid.fundingBranchId)requireBranchAccess(request,paid.fundingBranchId);
        if(request.auth.token.role!=='admin')for(const allocation of paid.advanceAllocations||[])requireBranchAccess(request,allocation.branchId);
        if(paid.postingFingerprint?paid.postingFingerprint!==fingerprint:Number(paid.adjustment||0)!==adjustment||(oldExpense.data()?.paymentMethod||'cash')!==method||data.fundingBranchId!=null||data.expectedShiftId!=null)fail('already-exists','تمت تسوية الشهر ببيانات مختلفة؛ راجع السجل المعتمد');
        return {ok:true,idempotent:true,payrollPaymentId:payrollRef.id,payroll:publicPayment(paid),cashMovementReference:paid.cashMovementReference||null};
      }
      if(oldExpense.exists)fail('failed-precondition','يوجد مصروف راتب سابق دون تسوية؛ يلزم مراجعة الإدارة');
      const staffRef=db.doc(`staff/${staffId}`),totalRef=db.doc(`workerMonthlyTotals/${month}_${staffId}`);
      const [staffSnapshot,monthlyTotal]=await transaction.getAll(staffRef,totalRef);
      if(!staffSnapshot.exists)fail('not-found','العامل غير موجود');
      const staff=staffSnapshot.data(),assigned=staff.branchIds;
      if(!Array.isArray(assigned)||!assigned.length||assigned.some(b=>!['talkha','mashaya'].includes(b)))fail('failed-precondition','فروع العامل غير صحيحة');
      if(!allResourceBranchesAllowed(request.auth.token.role,branchesFor(request),staff)||(request.auth.token.role!=='admin'&&assigned.length!==1))fail('permission-denied','صرف راتب عامل يعمل في أكثر من فرع يتطلب الأدمن الرئيسي');
      const expenseBranch=assigned.length===1?assigned[0]:'all';
      let funding=null,shift=null,zeroCashState=null;
      const today=businessDateParts().dateKey;
      const accountingGuard=financialDayRef(db,expenseBranch,today);
      const [accountingDay,accountingState]=await transaction.getAll(db.doc(`dailyClosings/${expenseBranch}_${today}`),accountingGuard);
      if(accountingDay.exists||accountingState.data()?.status==='CLOSING'||expenseBranch==='all'&&accountingState.data()?.status==='CLOSED')fail('failed-precondition','تم إغلاق يوم المصروفات أو يجري إقفاله؛ لا يمكن تسوية الراتب');
      if(expenseBranch!=='all'){
        const accountingBranch=await transaction.get(db.doc(`branches/${expenseBranch}`));
        if(!accountingBranch.exists||accountingBranch.data().active===false)fail('failed-precondition','فرع المصروفات غير نشط');
      }
      // Preserve the existing payroll revenue source and fallback attribution.
      // Move reads into this transaction so retries re-evaluate current inputs.
      let query=db.collection('revenueLedger').where('staffId','==',staffId).where('dateKey','>=',`${month}-01`).where('dateKey','<',`${nextMonthKey(month)}-01`);
      if(request.auth.token.role!=='admin')query=query.where('branchId','==',assigned[0]);
      const rows=await transaction.get(query.limit(2001));
      if(rows.size>2000)fail('resource-exhausted','تجاوز الشهر حد قراءة الرواتب؛ لا يمكن تسوية مبلغ ناقص');
      const revenue=monthlyTotal.exists?Number(monthlyTotal.data()?.revenue||0):rows.docs.reduce((sum,s)=>sum+Number(s.data().workerBreakdown?.[staffId]??s.data().amount??0),0);
      const calculated=calculatePayroll({...staff,revenue,adjustment}),amount=calculated.netSalary;
      if(!Number.isFinite(amount)||amount<=0)fail('failed-precondition','حدد الراتب الأساسي للعامل من قسم فريق العمل أولًا');
      if(data.expectedEntitlement!=null&&Math.abs(data.expectedEntitlement-amount)>0.000001)fail('aborted','تغير مستحق الراتب؛ حدّث بيانات الرواتب وأكد القيمة الجديدة');
      if(method==='cash'&&(amount>10000000||Math.abs(amount*100-Math.round(amount*100))>0.000001))fail('failed-precondition','قيمة الراتب خارج دقة أو حد العملية النقدية');
      const allocation=await readAdvanceAllocation(transaction,db,staffId,amount,month,fail);
      if(request.auth.token.role!=='admin'&&(allocation.checkpoint.attributionBranchIds||[]).some(branch=>!branchesFor(request).includes(branch)))fail('permission-denied','تسوية سلف من فرع آخر تتطلب الأدمن الرئيسي');
      if(data.expectedBalanceVersion!=null&&data.expectedBalanceVersion!==allocation.checkpoint.version)fail('aborted','تغير رصيد السلف؛ حدث البيانات وأكد صافي الدفع');
      const netPayable=method==='cash'?Math.round((amount-allocation.deduction)*100)/100:amount-allocation.deduction;
      if(netPayable<0)fail('failed-precondition','صافي الراتب غير صحيح');
      // Zero-net settlement never touches a cash drawer. Shared cash attribution
      // remains explicit even when no physical cash outflow is necessary.
      if(method==='cash'){
        funding=assigned.length===1?assigned[0]:data.fundingBranchId;
        if(!funding)fail('invalid-argument','اختر فرع صرف المرتب صراحة للعامل المشترك');
        if(!assigned.includes(funding)||data.fundingBranchId&&data.fundingBranchId!==funding)fail('permission-denied','فرع صرف المرتب لا يتبع العامل');
        requireBranchAccess(request,funding);
        if(netPayable===0){
          zeroCashState=db.doc(`cashShiftState/${funding}`);
          const [branch,state,closing]=await transaction.getAll(db.doc(`branches/${funding}`),zeroCashState,db.doc(`dailyClosings/${funding}_${today}`));
          if(!branch.exists||branch.data().active===false||state.data()?.status==='CLOSING'||closing.exists)fail('failed-precondition','الفرع أو يومه غير مؤهل للتسوية؛ الإغلاق جار أو مكتمل');
        }
      }
      if(method==='cash'&&netPayable>0){
        funding=assigned.length===1?assigned[0]:data.fundingBranchId;
        if(!funding)fail('invalid-argument','اختر فرع صرف المرتب صراحة للعامل المشترك');
        if(!assigned.includes(funding)||data.fundingBranchId&&data.fundingBranchId!==funding)fail('permission-denied','فرع صرف المرتب لا يتبع العامل');
        requireBranchAccess(request,funding);
        const [branch,state,closing]=await transaction.getAll(db.doc(`branches/${funding}`),db.doc(`cashShiftState/${funding}`),db.doc(`dailyClosings/${funding}_${today}`));
        if(!branch.exists||branch.data().active===false)fail('failed-precondition','فرع صرف المرتب غير نشط');
        if(closing.exists)fail('failed-precondition','تم إغلاق يوم الفرع؛ لا يمكن صرف الراتب النقدي');
        if(state.data()?.status!=='OPEN'||!state.data()?.openShiftId)fail('failed-precondition','لا توجد وردية كاش مؤهلة مفتوحة');
        if(data.expectedShiftId&&data.expectedShiftId!==state.data().openShiftId)fail('aborted','تغيرت الوردية؛ أعد تحميل بيانات الصرف');
        const ref=db.doc(`cashShifts/${state.data().openShiftId}`),snapshot=await transaction.get(ref),record=snapshot.data();
        if(!snapshot.exists||record.status!=='OPEN'||record.branchId!==funding||record.businessDate!==today||state.data().businessDate!==today||!record.cashierUid)fail('failed-precondition','حالة الوردية أو تاريخها غير صالح للصرف');
        // Admin's existing drawer/close override is preserved. A scoped manager
        // may post only through their own shift; no new role capability is granted.
        if(request.auth.token.role!=='admin'&&record.cashierUid!==request.auth.uid)fail('permission-denied','الوردية لا تتبع الحساب الذي يصرف الراتب');
        shift={ref,record};
      }
      const [movement,audit]=await transaction.getAll(movementRef,auditRef);
      if(movement.exists||audit.exists)fail('failed-precondition','توجد مراجع صرف سابقة دون تسوية؛ يلزم مراجعة الإدارة');
      if(businessDateParts().dateKey!==today)fail('aborted','تغير يوم العمل؛ أعد المحاولة');
      const now=FieldValue.serverTimestamp(),cashReference=shift?movementRef.id:null;
      const record={month,staffId,branchId:expenseBranch,staffNameAr:staff.nameAr||staffId,...calculated,status:'paid',paidAt:now,createdBy:request.auth.uid,paymentMethod:method,grossEntitlement:amount,advanceDeduction:allocation.deduction,netCashPaid:method==='cash'?netPayable:0,netPaid:netPayable,remainingAdvance:allocation.remaining,advanceAllocations:allocation.allocations.map(({requestId,movementId,branchId,cents})=>({requestId,movementId,branchId,amount:cents/100})),advanceBalanceVersion:allocation.checkpoint.version+1,advanceAttributionBranchIds:allocation.checkpoint.attributionBranchIds||[],fundingBranchId:funding,cashMovementReference:cashReference,shiftId:shift?.ref.id||null,postingFingerprint:fingerprint,postingVersion:2};
      transaction.create(payrollRef,record);
      transaction.create(expenseRef,{amount,category:'salary',description:`راتب ${staff.nameAr||staffId} عن ${month}`,branchId:expenseBranch,dateKey:today,payrollPaymentId:payrollRef.id,staffId,month,paymentMethod:method,grossEntitlement:amount,advanceDeduction:allocation.deduction,netCashPaid:record.netCashPaid,fundingBranchId:funding,cashMovementId:cashReference,...(shift?{shiftId:shift.ref.id}:{}),createdAt:now,createdBy:request.auth.uid});
      if(shift){
        const next={...shift.record,cashOut:Number(shift.record.cashOut||0)+netPayable};
        transaction.create(movementRef,{type:'CASH_OUT',amount:netPayable,category:'salary',reason:`راتب ${staff.nameAr||staffId} عن ${month}`,staffId,payrollPaymentId:payrollRef.id,expenseId:expenseRef.id,branchId:funding,shiftId:shift.ref.id,businessDate:today,actorUid:request.auth.uid,createdAt:now});
        transaction.update(shift.ref,{cashOut:FieldValue.increment(netPayable),expectedCash:calculateExpectedCash(next),updatedAt:now});
      }
      transaction.set(accountingGuard,{financialPostingVersion:FieldValue.increment(1),updatedAt:now},{merge:true});
      if(zeroCashState&&zeroCashState.path!==accountingGuard.path)transaction.set(zeroCashState,{financialPostingVersion:FieldValue.increment(1),updatedAt:now},{merge:true});
      writeAdvanceAllocation(transaction,allocation,staffId,month,payrollRef.id,FieldValue);
      transaction.create(auditRef,{action:'pay-salary',collection:'payrollPayments',entityId:payrollRef.id,branchId:expenseBranch,fundingBranchId:funding,shiftId:shift?.ref.id||null,cashMovementReference:cashReference,grossEntitlement:amount,advanceDeduction:allocation.deduction,netCashPaid:record.netCashPaid,userId:request.auth.uid,userEmail:request.auth.token.email||'',createdAt:now});
      return {ok:true,idempotent:false,payrollPaymentId:payrollRef.id,payroll:publicPayment(record),cashMovementReference:cashReference};
    });
  };
}
