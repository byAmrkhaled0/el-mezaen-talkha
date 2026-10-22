import { randomUUID } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const terminal = new Set(['FCM_ACCEPTED','NO_RECIPIENTS','SUPPRESSED','FAILED_PERMANENT','FAILED_RETRY_EXHAUSTED']);
export function workerPushAllowed(user, profile, staff, device, branchId) {
  if (!user || user.disabled || user.customClaims?.role !== 'worker' || user.customClaims.mustChangePassword === true
      || profile?.role !== 'worker' || profile.active !== true || profile.mustChangePassword === true || profile.accessOperation
      || staff?.active === false || staff?.userUid !== user.uid || profile.staffId !== user.customClaims.staffId
      || device?.uid !== user.uid || device.role !== 'worker' || device.staffId !== profile.staffId || !device.token) return false;
  if (![profile.branchIds,user.customClaims.branchIds,staff.branchIds,device.branchIds].every(ids=>Array.isArray(ids)&&ids.includes(branchId)))return false;
  const registered=device.updatedAt?.toMillis?.() ?? Date.parse(device.updatedAt||'');
  return !user.tokensValidAfterTime || Number.isFinite(registered)&&registered>=Date.parse(user.tokensValidAfterTime);
}

// Durable per-channel lease on the inbox document. FCM acceptance is not a
// device-delivery receipt. Crash after FCM but before commit may resend (at least once).
export async function deliverWorkerNotification({ db, ref, send, valid = async()=>true, channel='workerPush' }) {
  const leaseId=randomUUID();
  const claim=await db.runTransaction(async tx=>{
    const note=await tx.get(ref);if(!note.exists)return null;
    const data=note.data(),state=data[channel];
    if(terminal.has(state?.state))return {terminal:state.state};
    if(state?.leaseUntil?.toMillis()>Date.now())return {busy:true};
    if(Number(state?.attempts||0)>=8){tx.update(ref,{[channel]:{...state,state:'FAILED_RETRY_EXHAUSTED'}});return {terminal:'FAILED_RETRY_EXHAUSTED'};}
    tx.update(ref,{[channel]:{state:'ATTEMPTING',attempts:Number(state?.attempts||0)+1,leaseId,leaseUntil:Timestamp.fromMillis(Date.now()+120000),attemptedAt:FieldValue.serverTimestamp(),acceptedTokenHashes:state?.acceptedTokenHashes||[]}});
    return {data,acceptedTokenHashes:state?.acceptedTokenHashes||[]};
  });
  if(!claim)return 'SUPPRESSED';if(claim.terminal)return claim.terminal;
  if(claim.busy)throw Object.assign(new Error('Notification delivery lease is busy'),{code:'DELIVERY_BUSY'});
  let result, failure;
  try {result=await valid(claim.data)?await send(claim.data,claim.acceptedTokenHashes):{suppressed:true,attempted:0,sent:0};}
  catch(error){failure=error;result={retryable:true,attempted:0,sent:0};}
  const state=result.suppressed?'SUPPRESSED':result.retryable?'RETRY':result.attempted===0?(claim.acceptedTokenHashes.length?'FCM_ACCEPTED':'NO_RECIPIENTS'):result.sent>0||claim.acceptedTokenHashes.length?'FCM_ACCEPTED':'FAILED_PERMANENT';
  await db.runTransaction(async tx=>{
    const current=await tx.get(ref);if(current.data()?.[channel]?.leaseId!==leaseId)return;
    tx.update(ref,{[channel]:{...current.data()[channel],state,leaseUntil:Timestamp.fromMillis(0),attempted:result.attempted||0,accepted:[...new Set([...claim.acceptedTokenHashes,...(result.acceptedTokenHashes||[])])].length,acceptedTokenHashes:[...new Set([...claim.acceptedTokenHashes,...(result.acceptedTokenHashes||[])])],...(state==='FCM_ACCEPTED'?{acceptedAt:FieldValue.serverTimestamp()}:{}),...(result.retryable?{lastErrorCode:String(failure?.code||'FCM_PARTIAL_FAILURE').slice(0,80)}:{})}});
  });
  if(result.retryable)throw failure||Object.assign(new Error('Transient FCM response; retry required'),{code:'FCM_RETRY'});
  return state;
}
