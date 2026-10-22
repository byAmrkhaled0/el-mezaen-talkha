import { createHash } from 'node:crypto';
import { workerContext } from './worker-context.js';
import { isValidDateKey } from './core.js';
import { effectivePermissions } from './authorization.js';

export const REQUEST_TYPES = ['SALARY_ADVANCE', 'LEAVE'];
export const REQUEST_STATUSES = ['PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'DISBURSED'];
const open = ['PENDING', 'UNDER_REVIEW'];
const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 40);
const idPattern = /^[A-Za-z0-9_-]{1,100}$/;
const keyPattern = /^[A-Za-z0-9_-]{16,100}$/;

// Inject Firebase adapters so the real handlers can be exercised without production access.
export function workerRequestHandlers({ db, FieldValue, Timestamp, HttpsError, requireRole,
  requireLiveStaff, requireLiveAdmin, linkedStaffId, branchesFor, permissionsFor, rateLimit, notify }) {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  const text = (value, max, required = false) => {
    if (value == null && !required) return '';
    if (typeof value !== 'string' || value.trim().length > max || required && !value.trim()) fail('invalid-argument', 'راجع النصوص المطلوبة وطولها');
    return value.trim();
  };
  const keys = (value, allowed) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) fail('invalid-argument', 'بيانات الطلب غير صحيحة');
  };
  const money = value => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(Math.round(value * 100)) || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) fail('invalid-argument', 'المبلغ يجب أن يكون موجبًا وبدقة قرشين');
    return Math.round(value * 100) / 100;
  };
  const id = value => { if (typeof value !== 'string' || !idPattern.test(value)) fail('invalid-argument', 'معرّف السجل غير صحيح'); return value; };
  const stamp = () => FieldValue.serverTimestamp();
  const serialize = value => {
    if (value?.toDate) return value.toDate().toISOString();
    if (Array.isArray(value)) return value.map(serialize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, serialize(v)]));
    return value;
  };
  const policyRef = staffId => db.doc(`settings/workerAdvance_${staffId}`);
  const audit = (tx, documentId, data) => tx.create(db.doc(`activityLogs/${documentId}`), { ...data, createdAt: stamp() });
  async function actor(request) {
    await requireLiveStaff(request);
    const role = requireRole(request, ['admin', 'manager', 'worker']);
    if (role === 'manager' && !permissionsFor(request).has('payroll')) fail('permission-denied', 'مراجعة الطلبات تتطلب صلاحية الرواتب الحالية');
    return { role, uid: request.auth.uid, staffId: role === 'worker' ? await linkedStaffId(request) : null, branches: branchesFor(request) };
  }
  function workerStaff(snapshot, who, branchId) {
    const staff = snapshot.data();
    if (!snapshot.exists || staff.active === false || staff.userUid !== who.uid) fail('permission-denied', 'تغير ربط العامل أو حالة التوظيف');
    try { workerContext(who.branches, staff.branchIds, branchId); }
    catch { fail('permission-denied', 'الفرع غير مصرح به لحسابك وسجل العامل'); }
    return staff;
  }
  function scope(who, branchId) {
    if (!['talkha', 'mashaya'].includes(branchId) || who.role !== 'admin' && !who.branches.includes(branchId)) fail('permission-denied', 'الفرع غير مصرح به');
  }
  function owns(who, row) {
    scope(who, row.branchId);
    if (who.role === 'worker' && row.staffId !== who.staffId) fail('permission-denied', 'هذا الطلب لا يتبع حسابك');
  }
  function requestData(type, raw) {
    keys(raw, type === 'SALARY_ADVANCE' ? ['amount','reason','note'] : ['startDate','endDate','leaveType','reason','note']);
    const data = { reason: text(raw.reason, 200, true), note: text(raw.note, 300) };
    if (type === 'SALARY_ADVANCE') data.amount = money(raw.amount);
    else {
      if (!isValidDateKey(raw.startDate) || !isValidDateKey(raw.endDate) || raw.startDate > raw.endDate) fail('invalid-argument', 'تاريخ بداية ونهاية الإجازة غير صحيح');
      if (!['PERSONAL','SICK','OTHER'].includes(raw.leaveType)) fail('invalid-argument', 'اختر نوع الإجازة');
      Object.assign(data, { startDate: raw.startDate, endDate: raw.endDate, leaveType: raw.leaveType });
    }
    return data;
  }
  async function leaveConflicts(tx, row, excludedId = '') {
    const data = row.requestData;
    const query = db.collection('workerRequests').where('staffId','==',row.staffId).where('branchId','==',row.branchId)
      .where('requestType','==','LEAVE').where('status','in',[...open,'APPROVED'])
      .where('requestData.startDate','<=',data.endDate).where('requestData.endDate','>=',data.startDate)
      .orderBy('requestData.startDate').orderBy('requestData.endDate').limit(2);
    const existing = await tx.get(query);
    if (existing.docs.some(doc => doc.id !== excludedId)) fail('already-exists', 'توجد إجازة أو طلب متداخل في هذا الفرع');
    const approved = await tx.get(db.collection('workerLeaves').where('staffId','==',row.staffId).where('branchId','in',[row.branchId,'all'])
      .where('active','==',true).where('dateKey','>=',data.startDate).where('dateKey','<=',data.endDate).limit(1));
    if (!approved.empty) fail('already-exists', 'توجد إجازة معتمدة متداخلة');
  }
  const event = (who, action, from, to, version, note, eventId, payloadHash) => ({ actorUid: who.uid, actorRole: who.role, action, from, to, version, note, eventId, payloadHash, at: stamp() });
  function notification(tx, row, suffix, reviewer = false) {
    const noteId = `request_${row.requestId}_${suffix}`;
    tx.create(db.doc(`workerNotifications/${noteId}`), {
      ...(reviewer ? { reviewerInbox: true } : { staffId: row.staffId }), branchId: row.branchId,
      type: 'worker_request', entityId: row.requestId, requestId: row.requestId, read: false,
      title: reviewer ? 'طلب عامل جديد للمراجعة' : 'تحديث طلبك',
      body: reviewer ? 'افتح طلبات العاملين للمراجعة' : ({ APPROVED: 'تم اعتماد طلبك إداريًا؛ لا يعني الصرف أو تفعيل الإجازة', REJECTED: 'تم رفض طلبك؛ راجع رد الإدارة', CANCELLED: 'تم إلغاء طلبك' })[row.status],
      createdAt: stamp()
    });
    return noteId;
  }
  async function deliver(noteId, reviewer) {
    if (!noteId) return false;
    try { await notify(noteId, reviewer); return false; }
    catch { return true; } // Durable inbox/request exists; retry never changes the decision.
  }
  return {
    async getWorkerAdvancePolicy(request) {
      await requireLiveAdmin(request);
      const staffId = id(request.data?.staffId);
      const [staff, policy] = await Promise.all([db.doc(`staff/${staffId}`).get(),policyRef(staffId).get()]);
      if (!staff.exists) fail('not-found', 'العامل غير موجود');
      return { staffId, staffNameAr: staff.data().nameAr || staffId, policy: policy.exists ? serialize(policy.data()) : null };
    },
    async setWorkerAdvancePolicy(request) {
      await requireLiveAdmin(request);
      keys(request.data, ['staffId','enabled','maxPerRequest','expectedVersion']);
      const staffId = id(request.data.staffId);
      if (typeof request.data.enabled !== 'boolean') fail('invalid-argument', 'حدد حالة السماح بالسلف');
      const max = request.data.enabled ? money(request.data.maxPerRequest) : request.data.maxPerRequest == null ? null : money(request.data.maxPerRequest);
      const expected = request.data.expectedVersion;
      if (!Number.isSafeInteger(expected) || expected < 0) fail('invalid-argument','أعد تحميل إعداد العامل');
      await rateLimit(request,'worker-advance-policy',60,60000,request.auth.uid);
      return db.runTransaction(async tx => {
        const [staff, previous] = await Promise.all([tx.get(db.doc(`staff/${staffId}`)),tx.get(policyRef(staffId))]);
        if (!staff.exists || staff.data().active === false) fail('failed-precondition','العامل غير نشط');
        const before = previous.exists ? previous.data() : null;
        if ((before?.version || 0) !== expected) fail('aborted','الإعداد تغير؛ أعد تحميله قبل الحفظ');
        const policy = { staffId, enabled: request.data.enabled, maxPerRequest: max, version: expected + 1, updatedBy: request.auth.uid, updatedAt: stamp() };
        tx.set(policyRef(staffId),policy);
        audit(tx,`advance_policy_${staffId}_${policy.version}`,{ action:'worker-advance-policy', actorUid:request.auth.uid, actorRole:'admin', staffId, before, after:{enabled:policy.enabled,maxPerRequest:max,version:policy.version} });
        return { ok:true, version:policy.version };
      });
    },
    async submitWorkerRequest(request) {
      const who = await actor(request);
      if (who.role !== 'worker') fail('permission-denied','تقديم الطلب متاح للعامل فقط');
      keys(request.data,['branchId','requestType','requestData','idempotencyKey']);
      const { branchId, requestType, idempotencyKey } = request.data;
      scope(who,branchId);
      if (!REQUEST_TYPES.includes(requestType) || !keyPattern.test(String(idempotencyKey || ''))) fail('invalid-argument','نوع الطلب أو مفتاح المحاولة غير صحيح');
      const data = requestData(requestType,request.data.requestData);
      const requestId = `wr_${digest(`${who.uid}|${idempotencyKey}`)}`;
      const fingerprint = digest(JSON.stringify({ branchId,requestType,data }));
      const ref = db.doc(`workerRequests/${requestId}`);
      await rateLimit(request,'worker-request-submit',30,60000,who.uid);
      const result = await db.runTransaction(async tx => {
        const [staff, prior, policy] = await Promise.all([tx.get(db.doc(`staff/${who.staffId}`)),tx.get(ref),requestType === 'SALARY_ADVANCE' ? tx.get(policyRef(who.staffId)) : Promise.resolve(null)]);
        const member = workerStaff(staff,who,branchId);
        if (prior.exists) {
          const row = prior.data(); owns(who,row);
          if (row.fingerprint !== fingerprint) fail('already-exists','مفتاح المحاولة مستخدم لبيانات مختلفة؛ راجع الطلب الموجود');
          return { requestId, status:row.status, idempotent:true, notificationId:`request_${requestId}_submitted` };
        }
        const row = { requestId, staffId:who.staffId, staffNameAr:member.nameAr || who.staffId, branchId, requestType, requestData:data,
          status:'PENDING', fingerprint, version:1, createdBy:who.uid, createdAt:stamp(), updatedAt:stamp(),
          reviewHistory:{v1:event(who,'SUBMIT',null,'PENDING',1,'',digest(idempotencyKey),fingerprint)}, finalDecisionActor:null, finalDecisionAt:null };
        if (requestType === 'SALARY_ADVANCE') {
          const config = policy?.data();
          if (!policy?.exists || config.enabled !== true || !Number.isFinite(config.maxPerRequest) || config.maxPerRequest <= 0) fail('failed-precondition','السلف غير مفعلة أو حد الطلب غير مضبوط؛ تواصل مع الإدارة');
          if (data.amount > config.maxPerRequest) fail('invalid-argument','المبلغ يتجاوز الحد الأقصى لكل طلب الذي حددته الإدارة');
          row.advancePolicySnapshot = { version:config.version, maxPerRequest:config.maxPerRequest, enabled:true };
        } else {
          const lock = db.doc(`settings/workerRequestLock_${who.staffId}_${branchId}`);
          const guard = await tx.get(lock); await leaveConflicts(tx,row);
          tx.set(lock,{version:(guard.data()?.version || 0)+1});
        }
        tx.create(ref,row);
        const notificationId = notification(tx,row,'submitted',true);
        audit(tx,`worker_request_${requestId}_1`,{ action:'worker-request-submit',actorUid:who.uid,actorRole:who.role,staffId:who.staffId,branchId,requestId });
        return { requestId,status:'PENDING',idempotent:false,notificationId };
      });
      const notificationDeferred = await deliver(result.notificationId,true);
      return { ...result, notificationDeferred };
    },
    async getWorkerRequests(request) {
      const who = await actor(request);
      let branchId = request.data?.branchId;
      let authorized = who.branches.filter(branch => ['talkha','mashaya'].includes(branch));
      let policy = null;
      if (who.role === 'worker') {
        const staff = await db.doc(`staff/${who.staffId}`).get(); workerStaff(staff,who,branchId);
        const settings = await policyRef(who.staffId).get(); policy = settings.exists ? serialize(settings.data()) : null;
      }
      if (branchId !== 'all') scope(who,branchId);
      if (who.role === 'worker' && branchId === 'all') fail('permission-denied','اختر فرع العمل الحالي');
      if (who.role !== 'admin' && !authorized.length) fail('permission-denied','لا توجد فروع مصرح بها');
      const status = request.data?.status || 'all';
      if (status !== 'all' && !REQUEST_STATUSES.includes(status)) fail('invalid-argument','حالة الطلب غير صحيحة');
      let query = db.collection('workerRequests');
      if (who.role === 'worker') query = query.where('staffId','==',who.staffId);
      if (branchId !== 'all') query = query.where('branchId','==',branchId);
      else if (who.role !== 'admin') query = query.where('branchId','in',authorized);
      if (status !== 'all') query = query.where('status','==',status);
      query = query.orderBy('createdAt','desc').orderBy('__name__','desc');
      const cursor = request.data?.cursor;
      if (cursor) {
        keys(cursor,['id','createdAt','seconds','nanoseconds']);id(cursor.id);
        if (typeof cursor.createdAt !== 'number' || !Number.isSafeInteger(cursor.createdAt) || cursor.createdAt < 0) fail('invalid-argument','مؤشر الصفحة غير صحيح');
        let timestamp = Timestamp.fromMillis(cursor.createdAt);
        if (cursor.seconds != null || cursor.nanoseconds != null) {
          if (!Number.isSafeInteger(cursor.seconds) || cursor.seconds < 0 || !Number.isSafeInteger(cursor.nanoseconds) || cursor.nanoseconds < 0 || cursor.nanoseconds >= 1e9) fail('invalid-argument','مؤشر الصفحة غير صحيح');
          timestamp = new Timestamp(cursor.seconds,cursor.nanoseconds);
        }
        query = query.startAfter(timestamp,cursor.id);
      }
      const snapshot = await query.limit(26).get(), docs = snapshot.docs.slice(0,25);
      const last = docs.at(-1);
      return { items:docs.map(doc => serialize(doc.data())),policy,
        nextCursor:snapshot.docs.length > 25 && last ? { id:last.id,createdAt:last.data().createdAt.toMillis(),seconds:last.data().createdAt.seconds,nanoseconds:last.data().createdAt.nanoseconds } : null };
    },
    async updateWorkerRequest(request) {
      const who = await actor(request);
      keys(request.data,['requestId','action','note','idempotencyKey','expectedVersion']);
      const requestId = id(request.data.requestId), action = request.data.action, note = text(request.data.note,500,['REVIEW','REJECT'].includes(action));
      if (!['REVIEW','APPROVE','REJECT','CANCEL'].includes(action) || !keyPattern.test(String(request.data.idempotencyKey || ''))) fail('invalid-argument','الإجراء غير صحيح');
      if (action === 'CANCEL' ? who.role !== 'worker' : who.role === 'worker') fail('permission-denied','الإجراء غير متاح لهذا الدور');
      if (['APPROVE','REJECT'].includes(action)) await requireLiveAdmin(request);
      const expected = request.data.expectedVersion;
      if (!Number.isSafeInteger(expected) || expected < 1) fail('invalid-argument','أعد تحميل الطلب');
      await rateLimit(request,'worker-request-update',60,60000,who.uid);
      const eventId = digest(`${who.uid}|${request.data.idempotencyKey}`), fingerprint = digest(JSON.stringify({action,note}));
      const result = await db.runTransaction(async tx => {
        const ref = db.doc(`workerRequests/${requestId}`), snapshot = await tx.get(ref);
        if (!snapshot.exists) fail('not-found','الطلب غير موجود');
        const row = snapshot.data();owns(who,row);
        if (who.role === 'worker') workerStaff(await tx.get(db.doc(`staff/${who.staffId}`)),who,row.branchId);
        const prior = Object.values(row.reviewHistory || {}).find(item => item.eventId === eventId);
        if (prior) {
          if (prior.payloadHash !== fingerprint) fail('already-exists','مفتاح المحاولة مستخدم لإجراء مختلف');
          return { requestId,status:row.status,idempotent:true,notificationId:prior.to === 'UNDER_REVIEW' ? null : `request_${requestId}_${prior.version}`,reviewer:false };
        }
        if (!open.includes(row.status)) fail('failed-precondition','هذا الطلب مغلق ولا يمكن تعديل القرار');
        if (row.version !== expected) fail('aborted','الطلب تغير؛ أعد تحميله قبل اتخاذ القرار');
        if (action === 'APPROVE') {
          const staff = await tx.get(db.doc(`staff/${row.staffId}`));
          if (!staff.exists || staff.data().active === false || !staff.data().branchIds?.includes(row.branchId)) fail('failed-precondition','العامل لم يعد نشطًا في فرع الطلب');
          if (row.requestType === 'LEAVE') {
            const lock = db.doc(`settings/workerRequestLock_${row.staffId}_${row.branchId}`), guard = await tx.get(lock);
            await leaveConflicts(tx,row,requestId);tx.set(lock,{version:(guard.data()?.version || 0)+1});
          }
        }
        const status = ({REVIEW:'UNDER_REVIEW',APPROVE:'APPROVED',REJECT:'REJECTED',CANCEL:'CANCELLED'})[action], version = row.version+1;
        const history = event(who,action,row.status,status,version,note,eventId,fingerprint);
        const changes = { status,version,updatedAt:stamp(),[`reviewHistory.v${version}`]:history };
        if (['APPROVE','REJECT'].includes(action)) Object.assign(changes,{finalDecisionActor:who.uid,finalDecisionAt:stamp(),responseNote:note});
        if (action === 'APPROVE') Object.assign(changes,row.requestType === 'SALARY_ADVANCE'
          ? { approvedAmount:row.requestData.amount,integrationStatus:'AWAITING_DISBURSEMENT',disbursementReference:null }
          : { integrationStatus:'AWAITING_LEAVE_INTEGRATION',operationalLeaveReferences:[] });
        tx.update(ref,changes);
        const notificationId = action === 'REVIEW' ? null : notification(tx,{...row,status},String(version));
        audit(tx,`worker_request_${requestId}_${version}`,{action:`worker-request-${action.toLowerCase()}`,actorUid:who.uid,actorRole:who.role,staffId:row.staffId,branchId:row.branchId,requestId,from:row.status,to:status,note});
        return { requestId,status,idempotent:false,notificationId };
      });
      return { ...result,notificationDeferred:await deliver(result.notificationId,false) };
    }
  };
}

// Existing manager payroll permission permits review, never final approval.
export function requestReviewerAllowed(user, profile, branchId) {
  if (!user || user.disabled) return false;
  const claims = user.customClaims;
  if (claims?.role === 'admin') return true;
  return claims?.role === 'manager' && profile?.role === 'manager' && profile.active !== false
    && !profile.roleChangePending && claims.branchIds?.includes(branchId) === true
    && profile.branchIds?.includes(branchId) === true && effectivePermissions('manager',claims.permissions).has('payroll');
}
