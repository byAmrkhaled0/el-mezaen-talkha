import {getAuth,browserLocalPersistence,setPersistence,RecaptchaVerifier,signInWithPhoneNumber} from 'firebase/auth';
// Customer phone sessions keep the same persistence as account.js. Staff login
// always restores tab-scoped persistence in admin-api before credential sign-in.
export async function beginCustomerPhoneLogin(phone,container){
 const auth=getAuth();await setPersistence(auth,browserLocalPersistence);
 const verifier=new RecaptchaVerifier(auth,container,{size:'normal'});
 try{return {confirmation:await signInWithPhoneNumber(auth,phone,verifier),clear:()=>verifier.clear()};}catch(error){verifier.clear();throw error;}
}
