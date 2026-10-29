import {staffDestination} from './staff-routing.js';
// Never navigate a guest away from their account landing page or use stale claims.
export function createCustomerAccountRouter({showGuest,showPending,showCustomer,navigate,onError}){
 let generation=0;
 return {async update(user){
  const stamp=++generation;
  if(!user){showGuest();return;}
  showPending();
  try{
   const token=await user.getIdTokenResult();if(stamp!==generation)return;
   const destination=staffDestination(token.claims.role);
   if(destination){navigate(destination);return;}
   if(token.claims.role||!user.phoneNumber)throw Error('سجّل برقم موبايل العميل لفتح حسابه.');
   await showCustomer(user);
  }catch(error){if(stamp===generation){showGuest();onError(error);}}
 },dispose(){generation++;}};
}
