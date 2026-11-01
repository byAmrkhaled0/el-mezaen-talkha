// Authenticated budgets are tied to the principal, not a caller-controlled IP/header.
export function createStaffRateLimiter({consume,fail,now=Date.now}){
 return (request,action,limit,windowMs)=>{
  const uid=request.auth?.uid;if(!uid)throw fail('unauthenticated','سجّل الدخول أولًا');
  if(!/^[a-z][a-z-]{1,40}$/.test(action)||!Number.isInteger(limit)||limit<1||!Number.isFinite(windowMs)||windowMs<1000)throw Error('Invalid staff rate policy');
  const bucket=Math.floor(now()/windowMs);
  return consume(`staff|${uid}|${action}|${bucket}`,action,limit,windowMs,bucket);
 };
}
