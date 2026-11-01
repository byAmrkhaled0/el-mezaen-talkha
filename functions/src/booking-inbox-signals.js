import {branchAllowed,effectivePermissions} from './authorization.js';
const roles=['admin','manager','cashier'];
const branches=['talkha','mashaya'];
export function bookingInboxRecipient(user,profile,branchId){
 if(!user||user.disabled||profile?.active===false||!roles.includes(user.customClaims?.role)||!branches.includes(branchId))return false;
 const claims=user.customClaims;if(profile?.role&&profile.role!==claims.role)return false;
 const permissions=effectivePermissions(claims.role,claims.permissions);
 return branchAllowed(claims.role,claims.branchIds,branchId)&&['bookings','pos','dashboard'].some(key=>permissions.has(key));
}
export function bookingInboxSignal(event){
 const before=event.data?.before?.data(),after=event.data?.after?.data();if(!after)return null;
 if(before&&['status','bookingDate','bookingTime','staffId','branchId'].every(key=>before[key]===after[key]))return null;
 const stamp=event.data.after.updateTime,id=event.params?.bookingId;
 if(!id||id.includes('/')||!stamp||!branches.includes(after.branchId))return null;
 return {eventId:String(event.id||id).slice(0,200),bookingId:id,branchId:after.branchId,type:before?'booking_changed':'new_booking',source:after.source==='pos'?'pos':'booking',revision:`${stamp.seconds}.${String(stamp.nanoseconds||0).padStart(9,'0')}`};
}
// Signal only: no customer name/phone, line items, price, payment data or device token.
// The existing self-profile GET rule is sufficient; booking reads stay callable-only.
export async function publishBookingInboxSignal({db,auth,event}){
 const signal=bookingInboxSignal(event);if(!signal)return {written:0};
 const before=event.data?.before?.data(),scopes=[...new Set([signal.branchId,before?.branchId].filter(id=>branches.includes(id)))];
 const snapshots=await db.collection('users').where('role','in',roles).limit(500).get();
 const docs=snapshots.docs,live=new Map();
 for(let index=0;index<docs.length;index+=100){const result=await auth.getUsers(docs.slice(index,index+100).map(doc=>({uid:doc.id})));for(const user of result.users)live.set(user.uid,user);}
 let written=0;
 await Promise.all(docs.map(async profile=>{
  const user=live.get(profile.id),allowed=scopes.filter(branchId=>bookingInboxRecipient(user,profile.data(),branchId));if(!allowed.length)return;
  const changed=await db.runTransaction(async tx=>{
   const current=await tx.get(profile.ref);if(!current.exists||current.data()?.active===false)return;
   const prior=current.data().bookingInboxSignals||{},next={};
   for(const branchId of allowed){if(!bookingInboxRecipient(user,current.data(),branchId))continue;const old=prior[branchId];if(old?.revision>=signal.revision)continue;next[branchId]={...signal,branchId,type:branchId===signal.branchId?signal.type:'booking_changed'};}
   if(Object.keys(next).length){tx.set(profile.ref,{bookingInboxSignals:next},{merge:true});return true;}return false;
  });
  if(changed)written++;
 }));
 return {written};
}
