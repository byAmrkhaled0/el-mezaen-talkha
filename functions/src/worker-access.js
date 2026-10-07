import { createHash, randomBytes } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { normalizePhone } from './core.js';
import { ROLE_DEFAULT_PERMISSIONS } from './authorization.js';
export const invitationHash = secret => createHash('sha256').update(String(secret)).digest('hex');
export function validateInvitation(invite, identity, now = Date.now()) {
  if (!invite || invite.status !== 'NEW') throw new HttpsError('failed-precondition', 'الدعوة غير متاحة أو استُخدمت بالفعل');
  if (invite.expiresAt.toMillis() <= now) throw new HttpsError('failed-precondition', 'انتهت صلاحية الدعوة');
  if (invite.phone && (!identity.phoneNumber || normalizePhone(identity.phoneNumber) !== invite.phone)) throw new HttpsError('permission-denied', 'رقم الحساب لا يطابق الدعوة');
  if (invite.email && (!identity.emailVerified || identity.email?.toLowerCase() !== invite.email)) throw new HttpsError('permission-denied', 'البريد المعتمد لا يطابق الدعوة');
}
export function workerAccessHandlers({ db, requireLiveAdmin, requireRecentAdmin, rateLimit }) {
  const audit = (tx, uid, action, targetId) => tx.set(db.collection('activityLogs').doc(), { actorUid: uid, action, collection: 'users', entityId: targetId, createdAt: FieldValue.serverTimestamp() });
  async function identity(request) {
    if (!request.auth) throw new HttpsError('unauthenticated', 'سجل الدخول أولًا');
    const user = await getAuth().getUser(request.auth.uid);
    if (user.disabled || user.tokensValidAfterTime && Number(request.auth.token.auth_time) * 1000 < Date.parse(user.tokensValidAfterTime)) throw new HttpsError('permission-denied', 'الحساب أو الجلسة غير متاحة');
    return user;
  }
  return {
    async registerWorkerAccess(request) {
      const user = await identity(request);
      await rateLimit(request, 'worker-register', 10, 600000, user.uid);
      if (user.customClaims?.role) return { status: user.disabled ? 'DISABLED' : 'ACTIVE' };
      const ref = db.doc(`users/${user.uid}`);
      await db.runTransaction(async tx => {
        const row = await tx.get(ref);
        if (!row.exists) { tx.create(ref, { name: user.displayName || '', email: user.email || '', phone: user.phoneNumber || '', authProviders: user.providerData.map(p => p.providerId), accountStatus: 'PENDING', active: false, createdAt: FieldValue.serverTimestamp() }); audit(tx, user.uid, 'worker-access-request', user.uid); }
      });
      return { status: 'PENDING', message: 'تم إنشاء حسابك، في انتظار اعتماد الإدارة' };
    },
    async createWorkerInvitation(request) {
      await requireLiveAdmin(request); requireRecentAdmin(request);
      const staffId = String(request.data?.staffId || '');
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(staffId)) throw new HttpsError('invalid-argument', 'اختر العامل');
      const staff = await db.doc(`staff/${staffId}`).get();
      const branches = staff.data()?.branchIds;
      if (!staff.exists || staff.data().active === false || !Array.isArray(branches) || !branches.length || staff.data().userUid) throw new HttpsError('failed-precondition', 'سجل العامل غير متاح للربط');
      const email = String(request.data?.email || '').trim().toLowerCase();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new HttpsError('invalid-argument', 'البريد غير صحيح');
      const phone = request.data?.phone ? normalizePhone(request.data.phone) : null;
      const secret = randomBytes(32).toString('base64url');
      const id = invitationHash(secret);
      const hours = Math.max(1, Math.min(168, Number(request.data?.hours) || 48));
      const batch = db.batch();
      batch.create(db.doc(`workerInvitations/${id}`), { staffId, branchIds: branches, email: email || null, phone, expiresAt: Timestamp.fromMillis(Date.now() + hours * 3600000), status: 'NEW', createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp() });
      audit(batch, request.auth.uid, 'create-worker-invitation', staffId);
      await batch.commit();
      return { secret, expiresInHours: hours }; // Returned once; never persisted or logged.
    },
    async redeemWorkerInvitation(request) {
      const user = await identity(request);
      await rateLimit(request, 'worker-invite', 5, 900000, user.uid);
      if (user.customClaims?.role) throw new HttpsError('failed-precondition', 'الحساب لديه صلاحيات بالفعل');
      const secret = String(request.data?.secret || '');
      if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new HttpsError('invalid-argument', 'الدعوة غير صحيحة');
      const inviteRef = db.doc(`workerInvitations/${invitationHash(secret)}`);
      const userRef = db.doc(`users/${user.uid}`);
      const invite = await db.runTransaction(async tx => {
        const snapshot = await tx.get(inviteRef);
        const record = snapshot.data(); validateInvitation(record, user);
        const staffRef = db.doc(`staff/${record.staffId}`);
        const [staff, account, linked] = await Promise.all([tx.get(staffRef), tx.get(userRef), tx.get(db.collection('users').where('staffId', '==', record.staffId).limit(2))]);
        if (!staff.exists || staff.data().active === false || staff.data().userUid || !record.branchIds.every(id => staff.data().branchIds?.includes(id)) || !linked.empty || account.data()?.accountStatus === 'DISABLED' || account.data()?.role) throw new HttpsError('failed-precondition', 'العامل مرتبط أو غير متاح');
        tx.update(inviteRef, { status: 'REDEEMED', redeemedBy: user.uid, redeemedAt: FieldValue.serverTimestamp() });
        tx.update(staffRef, { userUid: user.uid });
        tx.set(userRef, { name: user.displayName || staff.data().nameAr || '', email: user.email || '', phone: user.phoneNumber || '', authProviders: user.providerData.map(p => p.providerId), role: 'worker', staffId: record.staffId, branchIds: record.branchIds, permissions: ROLE_DEFAULT_PERMISSIONS.worker, accountStatus: 'PENDING', active: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        audit(tx, user.uid, 'redeem-worker-invitation', record.staffId);
        return record;
      });
      // The canonical account stays inactive until claims are installed successfully.
      await getAuth().setCustomUserClaims(user.uid, { role: 'worker', staffId: invite.staffId, branchIds: invite.branchIds, permissions: ROLE_DEFAULT_PERMISSIONS.worker });
      await getAuth().revokeRefreshTokens(user.uid);
      await userRef.update({ accountStatus: 'ACTIVE', active: true });
      return { status: 'ACTIVE', signInAgain: true };
    },
    async manageAccessAccount(request) {
      await requireLiveAdmin(request); requireRecentAdmin(request);
      const uid = String(request.data?.uid || '');
      const action = request.data?.action;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || uid === request.auth.uid || !['disable', 'activate', 'revoke', 'unlink'].includes(action)) throw new HttpsError('invalid-argument', 'عملية الحساب غير صحيحة');
      const auth = getAuth(); const user = await auth.getUser(uid);
      if (user.customClaims?.role === 'admin') throw new HttpsError('permission-denied', 'حسابات الأدمن محمية');
      const profile = await db.doc(`users/${uid}`).get();
      if (action === 'activate' && !user.customClaims?.role) {
        const customer = await db.collection('customers').where('authUid','==',uid).limit(1).get();
        if (customer.empty) throw new HttpsError('failed-precondition', 'اربط الحساب عبر صلاحيات الحساب أولًا');
      }
      if (action === 'unlink' && user.customClaims?.role !== 'worker') throw new HttpsError('failed-precondition','فك الربط خاص بحسابات العمال');
      if (action === 'disable' || action === 'activate') await auth.updateUser(uid, { disabled: action === 'disable' });
      if (action === 'unlink') await auth.setCustomUserClaims(uid, {});
      await auth.revokeRefreshTokens(uid);
      const batch = db.batch();
      if (profile.exists) batch.set(profile.ref, { accountStatus: action === 'disable' ? 'DISABLED' : action === 'unlink' ? 'PENDING' : action === 'activate' ? 'ACTIVE' : profile.data().accountStatus || 'ACTIVE', active: action === 'disable' || action === 'unlink' ? false : action === 'activate' ? true : profile.data().active !== false, ...(action === 'unlink' ? { role: FieldValue.delete(), staffId: FieldValue.delete(), branchIds: [], permissions: [] } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (action === 'unlink' && profile.data()?.staffId) batch.update(db.doc(`staff/${profile.data().staffId}`), { userUid: FieldValue.delete() });
      audit(batch, request.auth.uid, `account-${action}`, uid); await batch.commit();
      return { ok: true };
    }
  };
}
