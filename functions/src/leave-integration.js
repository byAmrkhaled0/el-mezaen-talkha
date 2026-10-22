import { createHash } from 'node:crypto';

export const operationalLeaveId = (requestId, dateKey) => `request_${createHash('sha256').update(JSON.stringify([requestId, dateKey])).digest('hex')}`;

export function leaveIntegrationHandlers({ db, FieldValue, HttpsError, schedule, requireLiveAdmin,
  requireLiveStaff, requireRole, branchesFor, permissionsFor, today, notify = async () => {} }) {
  const fail = message => { throw new HttpsError('failed-precondition', message); };
  const stamp = () => FieldValue.serverTimestamp();
  async function reviewer(request, activation) {
    if (activation) { await requireLiveAdmin(request); return 'admin'; }
    await requireLiveStaff(request);
    const role = requireRole(request, ['admin', 'manager']);
    if (role === 'manager' && !permissionsFor(request).has('payroll')) throw new HttpsError('permission-denied', 'مراجعة الطلبات تتطلب صلاحية الرواتب الحالية');
    return role;
  }
  function validate(row, role, request) {
    if (row.requestType !== 'LEAVE' || row.status !== 'APPROVED') fail('يجب اعتماد طلب الإجازة إداريًا أولًا');
    if (role !== 'admin' && !branchesFor(request).includes(row.branchId)) throw new HttpsError('permission-denied', 'الفرع غير مصرح به');
    if (!['talkha', 'mashaya'].includes(row.branchId)) fail('فرع الطلب غير صحيح');
    if (Buffer.byteLength(JSON.stringify(row), 'utf8') > 32 * 1024) fail('حجم سجل الطلب يتجاوز ميزانية التفعيل الآمن');
    return schedule.dates(row.requestData?.startDate, row.requestData?.endDate);
  }
  async function process(request, activation) {
    const role = await reviewer(request, activation);
    const requestId = request.data?.requestId;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(requestId || '') || Object.keys(request.data || {}).some(key => key !== 'requestId'))
      throw new HttpsError('invalid-argument', 'معرّف طلب الإجازة غير صحيح');
    const result = await db.runTransaction(async tx => {
      const ref = db.doc(`workerRequests/${requestId}`), snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new HttpsError('not-found', 'الطلب غير موجود');
      const row = snapshot.data();
      if (row.requestId !== requestId) fail('مرجع الطلب غير متطابق');
      const days = validate(row, role, request);
      const contexts = days.map(dateKey => ({ staffId: row.staffId, branchId: row.branchId, dateKey }));
      const guards = await schedule.readGuards(tx, contexts);
      const member = await tx.get(db.doc(`staff/${row.staffId}`));
      if (!member.exists || member.data().active === false || member.data().userUid !== row.createdBy || !member.data().branchIds?.includes(row.branchId))
        fail('تغير ربط العامل أو تخصيصه للفرع؛ راجع الإدارة');
      const ids = days.map(date => operationalLeaveId(requestId, date));
      const leaves = await tx.getAll(...ids.map(id => db.doc(`workerLeaves/${id}`)));
      if (row.integrationStatus === 'ACTIVE') {
        if (JSON.stringify(row.operationalLeaveReferences) !== JSON.stringify(ids) || leaves.some((leaf, i) => !leaf.exists || leaf.data().sourceRequestId !== requestId || leaf.data().staffId !== row.staffId || leaf.data().branchId !== row.branchId || leaf.data().dateKey !== days[i] || leaf.data().active !== true))
          fail('سجلات التفعيل غير متطابقة؛ يلزم مراجعة الإدارة');
        return { ok: true, active: true, idempotent: true, requestId, integrationStatus: 'ACTIVE', operationalLeaveReferences: ids };
      }
      if (row.integrationStatus !== 'AWAITING_LEAVE_INTEGRATION' || row.operationalLeaveReferences?.length) fail('حالة تكامل الإجازة غير صالحة');
      if (row.requestData.startDate < today()) fail('لا يمكن تفعيل نطاق إجازة بدأ في تاريخ سابق');
      if (leaves.some(leaf => leaf.exists)) fail('توجد سجلات بهذا المرجع؛ لن يتم استبدالها');
      const conflicts = [], overlaps = [];
      // Sequential bounded daily queries avoid an unbounded range scan or query fan-out.
      for (const context of contexts) {
        conflicts.push(...await schedule.bookingConflicts(tx, context));
        overlaps.push(...await schedule.activeLeaves(tx, context));
      }
      if (conflicts.length) return { ok: false, active: false, blocked: true, code: 'LEAVE_BOOKING_CONFLICT', requestId,
        integrationStatus: 'AWAITING_LEAVE_INTEGRATION', conflicts };
      if (overlaps.length) fail('توجد إجازة تشغيلية متداخلة؛ لن يتم استبدالها');
      if (!activation) return { ok: true, active: false, requestId, integrationStatus: row.integrationStatus, conflicts: [] };
      const notificationId = `request_${requestId}_leave_active`, noteRef = db.doc(`workerNotifications/${notificationId}`);
      const previousNotification = await tx.get(noteRef);
      const now = stamp(), version = row.version + 1;
      if (!Number.isSafeInteger(version)) fail('إصدار الطلب غير صالح');
      // All reads above; deterministic documents, audit and notification commit together.
      schedule.writeGuards(tx, guards);
      leaves.forEach((leaf, i) => tx.create(leaf.ref, { staffId: row.staffId, branchId: row.branchId, dateKey: days[i],
        startTime: '00:00', endTime: '23:59', active: true, reason: String(row.requestData.reason || '').slice(0, 200),
        sourceRequestId: requestId, createdBy: request.auth.uid, createdAt: now, updatedAt: now }));
      tx.update(ref, { integrationStatus: 'ACTIVE', operationalLeaveReferences: ids, activatedBy: request.auth.uid,
        activatedAt: now, updatedAt: now, version,
        [`reviewHistory.v${version}`]: { actorUid: request.auth.uid, actorRole: 'admin', action: 'ACTIVATE_LEAVE',
          from: 'APPROVED', to: 'APPROVED', version, note: 'تم تفعيل الإجازة في جدول العمل', at: now } });
      tx.create(db.doc(`activityLogs/request_${requestId}_leave_active`), { action: 'worker-leave-activate', requestId,
        staffId: row.staffId, branchId: row.branchId, actorUid: request.auth.uid, actorRole: 'admin', createdAt: now });
      if (!previousNotification.exists) tx.create(noteRef, { staffId: row.staffId, branchId: row.branchId, type: 'worker_request',
        requestId, entityId: requestId, read: false, title: 'تم تفعيل إجازتك', body: 'إجازتك المعتمدة أصبحت نشطة في جدول العمل', createdAt: now });
      return { ok: true, active: true, idempotent: false, requestId, integrationStatus: 'ACTIVE', operationalLeaveReferences: ids, notificationId };
    });
    // Device delivery is outside the retryable transaction; inbox is already durable.
    if (activation && result.active) {
      try { await notify(result.notificationId || `request_${requestId}_leave_active`); }
      catch { return { ...result, notificationDeferred: true }; }
    }
    return result;
  }
  return { checkWorkerLeaveConflicts: request => process(request, false), activateWorkerLeave: request => process(request, true) };
}
