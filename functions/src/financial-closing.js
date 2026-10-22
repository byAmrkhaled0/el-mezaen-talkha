// Shared accounting scope is not a physical branch, cash drawer or shift.
export const financialDayRef = (db, branchId, dateKey) => branchId === 'all'
  ? db.doc(`settings/financialDay_all_${dateKey}`)
  : db.doc(`cashShiftState/${branchId}`);

export function sharedExpenseClosing({db, FieldValue, HttpsError, requireLiveAdmin,
  businessDateParts, isValidDateKey, aggregateScoped, AggregateField, cleanDoc}) {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  return async request => {
    await requireLiveAdmin(request);
    const data = request.data || {}, dateKey = data.businessDate || businessDateParts().dateKey;
    if (data.branchId !== 'all' || !isValidDateKey(dateKey) || dateKey > businessDateParts().dateKey ||
        !/^[A-Za-z0-9_-]{16,100}$/.test(data.idempotencyKey || '') ||
        data.actualCash != null && data.actualCash !== 0)
      fail('invalid-argument', 'راجع تاريخ الإقفال المشترك؛ هذا النطاق ليس درجًا نقديًا');
    const closingRef = db.doc(`dailyClosings/all_${dateKey}`), guardRef = financialDayRef(db, 'all', dateKey);
    const branchRefs = ['talkha', 'mashaya'].map(id => db.doc(`dailyClosings/${id}_${dateKey}`));
    const [prior, before, ...branches] = await db.getAll(closingRef, guardRef, ...branchRefs);
    if (prior.exists) {
      if (prior.data().closingContract !== 'shared-expenses-v1') fail('failed-precondition', 'سجل تاريخي غير متوافق؛ لن يتم تعديله');
      return {ok:true, idempotent:true, closing:cleanDoc(prior)};
    }
    if (branches.some((snapshot, i) => !snapshot.exists || snapshot.data().status !== 'CLOSED' ||
        snapshot.data().branchId !== ['talkha','mashaya'][i] || snapshot.data().businessDate !== dateKey))
      fail('failed-precondition', 'أقفل طلخا والمشاية لنفس اليوم أولًا');
    // Exact server aggregate, not a limited client-side scan. The guard protects
    // this snapshot against every supported shared-expense mutation.
    const total = await aggregateScoped('expenses', ['all'], q => q.where('dateKey', '==', dateKey), {amount:AggregateField.sum('amount')});
    if (!Number.isFinite(total.amount) || total.amount < 0) fail('failed-precondition', 'إجمالي المصروفات المشتركة غير صالح');
    return db.runTransaction(async transaction => {
      const [existing, guard, ...current] = await transaction.getAll(closingRef, guardRef, ...branchRefs);
      if (existing.exists) {
        if (existing.data().closingContract !== 'shared-expenses-v1') fail('failed-precondition', 'سجل تاريخي غير متوافق');
        return {ok:true, idempotent:true, closing:cleanDoc(existing)};
      }
      if (guard.exists !== before.exists || guard.exists && !guard.updateTime.isEqual(before.updateTime))
        fail('aborted', 'تغيرت المصروفات المشتركة؛ أعد الإقفال لتحديث التقرير');
      if (current.some((snapshot, i) => !snapshot.exists || snapshot.data().status !== 'CLOSED' ||
          !snapshot.updateTime.isEqual(branches[i].updateTime))) fail('aborted', 'تغير إقفال أحد الفروع؛ أعد المحاولة');
      const sum = field => current.reduce((value, snapshot) => value + Number(snapshot.data()[field] || 0), 0);
      const expenses = sum('expenses') + total.amount;
      const consolidated = {status:'FINAL', closingContract:'shared-expenses-v1', businessDate:dateKey,
        closingReferences:[...branchRefs.map(ref=>ref.id), closingRef.id], sharedExpenses:total.amount,
        grossSales:sum('grossSales'), netSales:sum('netSales'), expenses,
        netProfit:sum('netSales')-expenses, cashSales:sum('cashSales'), otherPayments:sum('otherPayments'),
        refunds:sum('refunds'), cashIn:sum('cashIn'), cashOut:sum('cashOut'),
        expectedCash:sum('expectedCash'), actualCash:sum('actualCash'), variance:sum('variance')};
      const now = FieldValue.serverTimestamp();
      const record = {branchId:'all', businessDate:dateKey, scopeType:'SHARED_EXPENSES',
        closingContract:'shared-expenses-v1', status:'CLOSED', expenses:total.amount, consolidated,
        closedBy:request.auth.uid, closedAt:now, createdAt:now};
      transaction.create(closingRef, record);
      transaction.set(guardRef, {status:'CLOSED', financialPostingVersion:FieldValue.increment(1), updatedAt:now}, {merge:true});
      transaction.create(db.doc(`activityLogs/shared_close_${dateKey}`), {action:'close-shared-expenses',
        branchId:'all', businessDate:dateKey, closingId:closingRef.id, actorUid:request.auth.uid,
        requestId:data.idempotencyKey, expenses:total.amount, createdAt:now});
      return {ok:true, closingId:closingRef.id, closing:{id:closingRef.id, ...record, closedAt:new Date().toISOString(), createdAt:new Date().toISOString()}};
    });
  };
}

export async function consolidatedDayClosing(db, dateKey, cleanDoc) {
  const snapshots = await db.getAll(...['talkha','mashaya','all'].map(id => db.doc(`dailyClosings/${id}_${dateKey}`)));
  const shared = snapshots[2];
  if (snapshots.every(s=>s.exists && s.data().status==='CLOSED') && shared.data().closingContract==='shared-expenses-v1')
    return {...shared.data().consolidated, sharedClosing:cleanDoc(shared)};
  // Additive metadata only: legacy report totals and immutable closings survive.
  return {status:'NOT_FINAL', businessDate:dateKey, missingScopes:['talkha','mashaya','all'].filter((id,i)=>
    !snapshots[i].exists || snapshots[i].data().status!=='CLOSED' || id==='all' && shared.data().closingContract!=='shared-expenses-v1')};
}
