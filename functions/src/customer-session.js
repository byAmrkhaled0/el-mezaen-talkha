// Callable transport verifies token signatures; live account state also matters
// after disable, role/phone changes or explicit session revocation.
export async function liveCustomerIdentity(request,{getUser,normalizePhone,hash,HttpsError}){
 if(!request.auth||request.auth.token?.role)throw new HttpsError('unauthenticated','سجّل دخول العميل أولًا');
 const deny=()=>new HttpsError('permission-denied','صلاحية حساب العميل تغيرت؛ سجّل الدخول من جديد');
 let phone;try{phone=normalizePhone(request.auth.token.phone_number);}catch{throw new HttpsError('failed-precondition','حساب العميل غير مرتبط برقم هاتف صحيح');}
 let user;try{user=await getUser(request.auth.uid);}catch(error){if(error.code==='auth/user-not-found')throw deny();throw new HttpsError('unavailable','تعذر التحقق من حسابك؛ حاول مرة أخرى');}
 const authTime=Number(request.auth.token.auth_time),validSince=Date.parse(user.tokensValidAfterTime);
 let livePhone;try{livePhone=normalizePhone(user.phoneNumber);}catch{throw deny();}
 if(user.disabled||user.customClaims?.role||livePhone!==phone||!Number.isFinite(authTime)||authTime<=0
   ||Number.isFinite(validSince)&&authTime<Math.floor(validSince/1000))throw deny();
 return {uid:request.auth.uid,phone,customerId:hash(phone)};
}
