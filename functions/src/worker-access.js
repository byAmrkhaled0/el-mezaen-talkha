import { workerAccessMutation } from "./worker-access-state.js";
import {normalizeWorkerUsername,workerAuthEmail} from './worker-username.js';
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
    if (!Number.isFinite(Number(request.auth.token.auth_time)) || user.disabled || user.tokensValidAfterTime && Number(request.auth.token.auth_time) * 1000 < Date.parse(user.tokensValidAfterTime)) throw new HttpsError('permission-denied', 'الحساب أو الجلسة غير متاحة');
    return user;
  }
  return {
    async changeWorkerPassword(request) {
      const user = await identity(request);
      if (user.customClaims?.role !== 'worker' || request.auth.token.role !== 'worker'
          || request.auth.token.firebase?.sign_in_provider !== 'password'
          || Number(request.auth.token.auth_time) * 1000 < Date.now() - 300000)
        throw new HttpsError('permission-denied', 'أعد التحقق من كلمة المرور أولًا');
      await rateLimit(request, 'worker-password', 5, 900000, user.uid);
      const password = request.data?.newPassword;
      if (typeof password !== 'string' || password.length < 8 || password.length > 128)
        throw new HttpsError('invalid-argument', 'كلمة المرور يجب أن تكون من 8 إلى 128 حرفًا');
      const account = await db.doc(`users/${user.uid}`).get();
      if (!account.exists || account.data().role !== 'worker'
          || user.customClaims.staffId !== request.auth.token.staffId
          || JSON.stringify(user.customClaims.branchIds) !== JSON.stringify(request.auth.token.branchIds))
        throw new HttpsError('permission-denied', 'صلاحية الحساب تغيرت');
      if (account.data().active === false && !(account.data().accessOperation?.action === 'change-password' && account.data().accessOperation?.actorUid === user.uid)) throw new HttpsError('permission-denied', 'الحساب غير فعال');
      const auth = getAuth();
      await workerAccessMutation({ db, uid:user.uid, actorUid:user.uid, action:'change-password',
        validate: profile => { if (profile.staffId !== user.customClaims.staffId || JSON.stringify(profile.branchIds) !== JSON.stringify(user.customClaims.branchIds)) throw new HttpsError('permission-denied','تغير ربط الحساب'); },
        mutate: async op => {
          await auth.setCustomUserClaims(user.uid, {...user.customClaims, mustChangePassword:true});
          await auth.updateUser(user.uid, {password});
          await auth.revokeRefreshTokens(user.uid);
          await auth.setCustomUserClaims(user.uid, {...user.customClaims, mustChangePassword:false});
          return {mustChangePassword:false, active:op.activeBefore, accountStatus:op.statusBefore};
        },
        finish: async (tx, profile) => {
          const staff=await tx.get(db.doc(`staff/${profile.staffId}`));
          if (!staff.exists || staff.data().active === false || staff.data().userUid !== user.uid || !profile.branchIds.every(id=>staff.data().branchIds?.includes(id))) throw new HttpsError('permission-denied','تغير ربط العامل');
          audit(tx,user.uid,'worker-password-changed',user.uid);return {};
        }
      });
      return {ok:true, signInAgain:true};
    },
    async registerWorkerAccess(request) {
      const user = await identity(request);
      await rateLimit(request, 'worker-register', 10, 600000, user.uid);
      if (user.customClaims?.role) {
        if (user.customClaims.role !== 'worker') return { status: user.disabled ? 'DISABLED' : 'ACTIVE' };
        const profile = await db.doc(`users/${user.uid}`).get(), data = profile.data();
        return { status: user.disabled || data?.accountStatus === 'DISABLED' ? 'DISABLED' :
          !profile.exists || data.role !== 'worker' || data.active !== true || data.accessOperation || data.roleChangePending ? 'PENDING' : 'ACTIVE' };
      }
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
      const secret = String(request.data?.secret || '');
      if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new HttpsError('invalid-argument', 'الدعوة غير صحيحة');
      const inviteRef = db.doc(`workerInvitations/${invitationHash(secret)}`);
      const userRef = db.doc(`users/${user.uid}`);
      const invite = await db.runTransaction(async tx => {
        const snapshot = await tx.get(inviteRef), record = snapshot.data();
        const recovering = record?.status === 'REDEEMING' && record.redeemedBy === user.uid;
        if (!recovering) { validateInvitation(record,user); if(user.customClaims?.role)throw new HttpsError('failed-precondition','الحساب لديه صلاحيات بالفعل'); }
        const staffRef=db.doc(`staff/${record.staffId}`);
        const [staff,account,linked]=await Promise.all([tx.get(staffRef),tx.get(userRef),tx.get(db.collection('users').where('staffId','==',record.staffId).limit(2))]);
        if (!staff.exists || staff.data().active === false || !record.branchIds.every(id=>staff.data().branchIds?.includes(id)) || linked.docs.some(d=>d.id!==user.uid) || account.data()?.accountStatus==='DISABLED'
            || (staff.data().userUid && staff.data().userUid!==user.uid)
            || (!recovering && account.data()?.role)
            || (recovering && (account.data()?.role!=='worker' || account.data()?.staffId!==record.staffId || account.data()?.active!==false || user.customClaims?.role && user.customClaims.role!=='worker')))
          throw new HttpsError('failed-precondition','العامل مرتبط أو غير متاح');
        if (!recovering) {
          tx.update(inviteRef,{status:'REDEEMING',redeemedBy:user.uid,redeemedAt:FieldValue.serverTimestamp()});
          tx.update(staffRef,{userUid:user.uid});
          tx.set(userRef,{name:user.displayName||staff.data().nameAr||'',email:user.email||'',phone:user.phoneNumber||'',authProviders:user.providerData.map(p=>p.providerId),role:'worker',staffId:record.staffId,branchIds:record.branchIds,permissions:ROLE_DEFAULT_PERMISSIONS.worker,accountStatus:'PENDING',active:false,updatedAt:FieldValue.serverTimestamp()},{merge:true});
        }
        return record;
      });
      await workerAccessMutation({ db, uid:user.uid, actorUid:user.uid, action:'invitation',
        mutate: async () => {
          await getAuth().setCustomUserClaims(user.uid,{role:'worker',staffId:invite.staffId,branchIds:invite.branchIds,permissions:ROLE_DEFAULT_PERMISSIONS.worker});
          await getAuth().revokeRefreshTokens(user.uid);
          return {active:true,accountStatus:'ACTIVE',mustChangePassword:false};
        },
        finish: async (tx,profile) => {
          const [record,staff]=await Promise.all([tx.get(inviteRef),tx.get(db.doc(`staff/${invite.staffId}`))]);
          if(record.data()?.status!=='REDEEMING'||record.data().redeemedBy!==user.uid||staff.data()?.userUid!==user.uid||staff.data()?.active===false||!profile.branchIds.every(id=>staff.data()?.branchIds?.includes(id)))throw new HttpsError('failed-precondition','تغير ربط الدعوة');
          tx.update(inviteRef,{status:'REDEEMED',activatedAt:FieldValue.serverTimestamp()});audit(tx,user.uid,'redeem-worker-invitation',invite.staffId);return {};
        }
      });
      return { status: 'ACTIVE', signInAgain: true };
    },
    async manageAccessAccount(request) {
      await requireLiveAdmin(request); requireRecentAdmin(request);
      const uid = String(request.data?.uid || '');
      const action = request.data?.action;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || uid === request.auth.uid || !['disable', 'activate', 'revoke', 'unlink', 'username'].includes(action)) throw new HttpsError('invalid-argument', 'عملية الحساب غير صحيحة');
      const auth = getAuth(); const user = await auth.getUser(uid);
      if (user.customClaims?.role === 'admin') throw new HttpsError('permission-denied', 'حسابات الأدمن محمية');
      const profile = await db.doc(`users/${uid}`).get();
      if (profile.data()?.role === 'worker') {
        if (user.customClaims?.role && user.customClaims.role !== 'worker') throw new HttpsError('permission-denied','صلاحية الحساب تغيرت');
        let username;
        if (action === 'username') {
          try { username=normalizeWorkerUsername(request.data?.username); } catch { throw new HttpsError('invalid-argument','اسم المستخدم غير صالح'); }
          const password=request.data?.temporaryPassword;
          if(typeof password!=='string'||password.length<8||password.length>128)throw new HttpsError('invalid-argument','كلمة المرور المؤقتة غير صالحة');
        }
        await workerAccessMutation({db,uid,actorUid:request.auth.uid,action,
          mutate: async op => {
            const canonical=op.profile;
            const staff=await db.doc(`staff/${canonical.staffId}`).get();
            if(action!=='unlink' && (!staff.exists||staff.data().active===false||staff.data().userUid!==uid||!canonical.branchIds?.every(id=>staff.data().branchIds?.includes(id))))throw new HttpsError('failed-precondition','راجع ربط العامل وفروعه أولًا');
            const claims={role:'worker',staffId:canonical.staffId,branchIds:canonical.branchIds,permissions:ROLE_DEFAULT_PERMISSIONS.worker,mustChangePassword:action==='username'||op.mustChangeBefore};
            // Gate before credential replacement. Auth failure leaves canonical access closed.
            await auth.setCustomUserClaims(uid,{...claims,mustChangePassword:true});
            if(action==='username')await auth.updateUser(uid,{email:workerAuthEmail(username),password:request.data.temporaryPassword});
            if(action==='disable'||action==='activate')await auth.updateUser(uid,{disabled:action==='disable'});
            await auth.revokeRefreshTokens(uid);
            await auth.setCustomUserClaims(uid,action==='unlink'?{}:claims);
            const active=action==='activate'?true:action==='disable'||action==='unlink'?false:op.activeBefore;
            return {active,accountStatus:action==='unlink'?'PENDING':active?'ACTIVE':'DISABLED',mustChangePassword:claims.mustChangePassword,
              ...(username?{username,email:workerAuthEmail(username)}:{}),
              ...(action==='unlink'?{role:FieldValue.delete(),staffId:FieldValue.delete(),branchIds:[],permissions:[]}: {})};
          },
          finish: async (tx,current) => {
            const staff=current.staffId?await tx.get(db.doc(`staff/${current.staffId}`)):null;
            if(action==='unlink'&&staff?.data()?.userUid===uid)tx.update(staff.ref,{userUid:FieldValue.delete()});
            if(action!=='unlink'&&(!staff?.exists||staff.data().userUid!==uid||staff.data().active===false||!current.branchIds?.every(id=>staff.data().branchIds?.includes(id))))throw new HttpsError('failed-precondition','تغير ربط العامل');
            audit(tx,request.auth.uid,`account-${action}`,uid);return {};
          }
        });
        return {ok:true};
      }
      let username;
      if (action === 'username') {
        if (user.customClaims?.role !== 'worker' || profile.data()?.role !== 'worker' || !profile.data()?.staffId)
          throw new HttpsError('permission-denied','تعيين الدخول خاص بحساب عامل مرتبط');
        try { username=normalizeWorkerUsername(request.data?.username); }
        catch { throw new HttpsError('invalid-argument','اسم المستخدم غير صالح'); }
        const password=request.data?.temporaryPassword;
        if(typeof password!=='string'||password.length<8||password.length>128)throw new HttpsError('invalid-argument','كلمة المرور المؤقتة غير صالحة');
        const staff=await db.doc(`staff/${profile.data().staffId}`).get();
        if(!staff.exists||staff.data().userUid!==uid||!profile.data().branchIds?.every(id=>staff.data().branchIds?.includes(id)))throw new HttpsError('failed-precondition','راجع ربط العامل وفروعه أولًا');
        await auth.updateUser(uid,{email:workerAuthEmail(username),password});
        await auth.setCustomUserClaims(uid,{...user.customClaims,mustChangePassword:true});
      }
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
      if(username)batch.set(profile.ref,{username,email:workerAuthEmail(username),mustChangePassword:true,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      audit(batch, request.auth.uid, `account-${action}`, uid); await batch.commit();
      return { ok: true };
    }
  };
}
