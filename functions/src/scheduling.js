import { createHash } from 'node:crypto';
import { isValidDateKey, minutes } from './core.js';

export const SCHEDULING_BRANCHES = ['talkha', 'mashaya'];
export const SCHEDULE_QUERY_LIMIT = 100;
// Conservative atomic envelope: 10MiB request, 2MiB reserved for request/history,
// audit/notification and protocol overhead; 64KiB/day for guards, leaves and indexes.
// This is an application safety budget, not a claimed Firestore day/write quota.
export const MAX_ACTIVATION_DAYS = Math.floor((10 * 1024 * 1024 - 2 * 1024 * 1024) / (64 * 1024));
export const schedulingGuardId = (staffId, branchId, dateKey) => `schedule_${createHash('sha256').update(JSON.stringify([staffId, branchId, dateKey])).digest('hex')}`;
const fail = (ErrorType, message, details) => { throw new ErrorType('failed-precondition', message, details); };

export function scheduling({ db, FieldValue, HttpsError }) {
  function context(staffId, branchId, dateKey) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(staffId || '') || ![...SCHEDULING_BRANCHES, 'all'].includes(branchId) || !isValidDateKey(dateKey))
      throw new HttpsError('invalid-argument', 'سياق جدول العامل غير صحيح');
    return (branchId === 'all' ? SCHEDULING_BRANCHES : [branchId]).map(branch => ({ staffId, branchId: branch, dateKey }));
  }
  function dates(start, end) {
    if (!isValidDateKey(start) || !isValidDateKey(end) || start > end) throw new HttpsError('invalid-argument', 'نطاق الإجازة غير صحيح');
    const count = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) + 1;
    if (count > MAX_ACTIVATION_DAYS) fail(HttpsError, 'نطاق الإجازة يتجاوز الحد الآمن للتفعيل الذري', { code: 'ATOMIC_LEAVE_RANGE_LIMIT', maximumDays: MAX_ACTIVATION_DAYS });
    return Array.from({ length: count }, (_, offset) => new Date(Date.parse(`${start}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10));
  }
  async function readGuards(tx, contexts) {
    const unique = new Map(contexts.flatMap(row => context(row.staffId, row.branchId, row.dateKey)).map(row => [schedulingGuardId(row.staffId, row.branchId, row.dateKey), row]));
    const entries = [...unique].sort(([a], [b]) => a.localeCompare(b));
    const refs = entries.map(([id]) => db.doc(`settings/${id}`));
    const snapshots = refs.length ? await tx.getAll(...refs) : [];
    return entries.map(([id, row], i) => {
      const value = snapshots[i].data();
      if (value && (value.staffId !== row.staffId || value.branchId !== row.branchId || value.dateKey !== row.dateKey || !Number.isSafeInteger(value.version) || value.version < 0 || value.version === Number.MAX_SAFE_INTEGER))
        fail(HttpsError, 'سجل حماية الجدول يحتاج مراجعة');
      return { ...row, ref: refs[i], version: value?.version || 0 };
    });
  }
  function writeGuards(tx, guards) {
    for (const { ref, version, ...row } of guards) tx.set(ref, { ...row, version: version + 1, updatedAt: FieldValue.serverTimestamp() });
  }
  async function bounded(tx, query, label) {
    const snapshot = await tx.get(query.limit(SCHEDULE_QUERY_LIMIT + 1));
    if (snapshot.size > SCHEDULE_QUERY_LIMIT) fail(HttpsError, 'نتائج الجدول تجاوزت حد الفحص الآمن؛ يلزم مراجعة الإدارة', { code: 'SCHEDULE_QUERY_OVERFLOW', query: label });
    return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
  }
  async function activeLeaves(tx, row) {
    context(row.staffId, row.branchId, row.dateKey);
    const branches = row.branchId === 'all' ? [...SCHEDULING_BRANCHES, 'all'] : [row.branchId, 'all'];
    const groups = await Promise.all(branches.map(branchId => bounded(tx, db.collection('workerLeaves')
      .where('staffId', '==', row.staffId).where('branchId', '==', branchId)
      .where('dateKey', '==', row.dateKey).where('active', '==', true), 'activeLeaves')));
    return [...new Map(groups.flat().map(leave => [leave.id, leave])).values()];
  }
  async function bookingConflicts(tx, row, excludedBookingId = '', includeDuration = false) {
    const contexts = context(row.staffId, row.branchId, row.dateKey);
    const snapshots = await Promise.all(contexts.map(value => bounded(tx, db.collection('bookings')
      .where('staffId', '==', value.staffId).where('branchId', '==', value.branchId)
      .where('bookingDate', '==', value.dateKey).where('status', 'in', ['pending', 'confirmed', 'arrived']), 'bookingConflicts')));
    const start = minutes(row.startTime || '00:00'), end = minutes(row.endTime || '23:59');
    return snapshots.flat().filter(booking => booking.id !== excludedBookingId && booking.serviceProgress?.[row.staffId]?.status!=='DONE' &&
      minutes(booking.bookingTime) < end && minutes(booking.bookingTime) + Math.max(5, Number(booking.duration || 0)) > start)
      .map(booking => ({ bookingId: booking.id, bookingDate: booking.bookingDate, bookingTime: booking.bookingTime,
        staffId: booking.staffId, branchId: booking.branchId, status: booking.status, ...(includeDuration?{duration:Math.max(5,Number(booking.duration||0))}:{}) }));
  }
  function validateLeave(row) {
    context(row.staffId, row.branchId, row.dateKey);
    if (!/^\d{2}:\d{2}$/.test(row.startTime || '') || !/^\d{2}:\d{2}$/.test(row.endTime || '') ||
        minutes(row.startTime) >= minutes(row.endTime) || minutes(row.endTime) > 1439 || minutes(row.startTime) < 0)
      throw new HttpsError('invalid-argument', 'وقت الإجازة غير صحيح');
  }
  // Called only after the existing live staff, schedule permission and branch checks.
  // Re-authorize the latest old/new contexts inside the transaction on every retry.
  async function mutateManual(ref, payload, authorize, audit, normalize = row => row) {
    return db.runTransaction(async tx => {
      const previous = await tx.get(ref), before = previous.exists ? previous.data() : null;
      if(before?.sourceServiceSessionId)fail(HttpsError,'الفترة مرتبطة بخدمة جارية؛ استخدم إنهاء الخدمة أو تمديدها');
      if (before?.sourceRequestId) fail(HttpsError, 'الإجازة مرتبطة بطلب معتمد؛ لا يمكن تعديل سجل التفعيل يدويًا');
      const next = payload === null ? null : normalize({ ...(before || {}), ...payload }, before);
      if (before) { validateLeave(before); authorize(before); }
      if (next) { validateLeave(next); authorize(next); }
      const guards = await readGuards(tx, [before, next].filter(Boolean));
      if (next) {
        const member = await tx.get(db.doc(`staff/${next.staffId}`));
        const branches = next.branchId === 'all' ? null : [next.branchId];
        if (!member.exists || member.data().active === false || (branches && !branches.every(branch => member.data().branchIds?.includes(branch))))
          fail(HttpsError, 'العامل غير نشط أو غير مخصص لفرع الإجازة');
        if (next.active !== false) {
          const conflicts = await bookingConflicts(tx, next);
          if (conflicts.length) fail(HttpsError, 'توجد حجوزات تتعارض مع الإجازة', { code: 'LEAVE_BOOKING_CONFLICT', conflicts });
        }
      }
      writeGuards(tx, guards);
      if (next) tx.set(ref, { ...next, updatedAt: FieldValue.serverTimestamp(), ...(before ? {} : { createdAt: FieldValue.serverTimestamp() }) });
      else tx.delete(ref);
      tx.create(db.collection('activityLogs').doc(), { ...audit, action: next ? (before ? 'update' : 'create') : 'delete',
        collection: 'workerLeaves', entityId: ref.id, branchId: (next || before)?.branchId || null, createdAt: FieldValue.serverTimestamp() });
      return { ok: true, id: ref.id };
    });
  }
  return { context, dates, readGuards, writeGuards, activeLeaves, bookingConflicts, mutateManual };
}
