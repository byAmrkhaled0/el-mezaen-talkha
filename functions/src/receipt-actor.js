// Only the verified callable identity supplies the issuer. Never use request.data.
export function receiptActor(request) {
  const uid=request.auth?.uid;
  if(typeof uid!=='string'||!uid)throw new Error('RECEIPT_ACTOR_REQUIRED');
  return {cashierUid:uid,cashierName:String(request.auth.token?.name||request.auth.token?.email||uid).slice(0,120)};
}
