import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

// Auth and Firestore cannot share a transaction. Keep canonical access closed
// until every side effect succeeds. The lease serializes changes; no password,
// password hash, invitation secret or Auth token is persisted here.
export async function workerAccessMutation({ db, uid, actorUid, action, mutate, finish, validate = () => {} }) {
  const ref = db.doc(`users/${uid}`), id = randomUUID();
  const operation = await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref), profile = snapshot.data();
    if (!snapshot.exists || profile.role !== 'worker' || profile.roleChangePending) throw new HttpsError('failed-precondition', 'حساب العامل غير متاح');
    const previous = profile.accessOperation;
    if (previous?.leaseUntil?.toMillis() > Date.now()) throw new HttpsError('aborted', 'تحديث الحساب جارٍ؛ أعد المحاولة بعد قليل');
    if (previous && (previous.actorUid !== actorUid || previous.action !== action)) throw new HttpsError('failed-precondition', 'أكمل عملية الحساب السابقة أولًا');
    validate(profile);
    const op = { id, actorUid, action, activeBefore: previous?.activeBefore ?? (profile.active !== false), mustChangeBefore: previous?.mustChangeBefore ?? (profile.mustChangePassword === true), statusBefore: previous?.statusBefore || profile.accountStatus || 'ACTIVE', leaseUntil: Timestamp.fromMillis(Date.now() + 120000) };
    tx.update(ref, { active: false, mustChangePassword: true, accountStatus: 'PENDING', accessOperation: op, updatedAt: FieldValue.serverTimestamp() });
    return { ...op, profile };
  });
  try {
    const patch = await mutate(operation);
    await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (current.data()?.accessOperation?.id !== id) throw new HttpsError('aborted', 'تغيرت عملية الحساب');
      const extra = await finish(tx, current.data(), operation, patch);
      tx.update(ref, { ...patch, ...extra, accessOperation: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    });
  } catch (error) {
    // Retry may safely resume after a provider failure. If even this write fails,
    // the account remains closed and the two-minute lease expires naturally.
    await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (current.data()?.accessOperation?.id === id) tx.update(ref, { 'accessOperation.leaseUntil': Timestamp.fromMillis(0) });
    }).catch(() => {});
    throw error;
  }
}
