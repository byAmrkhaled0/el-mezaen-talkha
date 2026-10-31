import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
assert.equal(process.env.GCLOUD_PROJECT,'demo-el-mezaen-gate');assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8087');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9097');
const require=createRequire(new URL('../functions/package.json',import.meta.url)),h=await import('../functions/src/index.js');
const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore'),auth=getAuth(),db=getFirestore();
const uid='live-customer-session',phone='01099911223',customerId=createHash('sha256').update(phone).digest('hex').slice(0,32);let identity;
const call=(name,data={})=>h[name].run({auth:identity,data,rawRequest:{ip:'127.0.0.1',headers:{}}});
test('prepare a real local Auth token and canonical customer',async()=>{
 await auth.createUser({uid,phoneNumber:'+201099911223'});
 const token=await auth.createCustomToken(uid);const r=await fetch('http://127.0.0.1:9097/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=local-only',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,returnSecureToken:true})});assert.equal(r.status,200);
 const signed=await r.json();identity={uid,token:await auth.verifyIdToken(signed.idToken)};assert.equal(identity.token.phone_number,'+201099911223');
 await db.doc('customers/'+customerId).set({firstName:'عميل',lastName:'اختبار',phone,authUid:uid,qrToken:'mzc_live_session_test_1234567890123456',pointsBalance:12,cashbackBalance:20});
 assert.equal((await call('getCustomerPortal',{profileOnly:true})).customer.phone,phone);
});
test('disabled customer cannot reuse an already verified token to read portal or history',async()=>{
 await auth.updateUser(uid,{disabled:true});
 for(const name of ['getCustomerPortal','getCustomerHistory'])await assert.rejects(call(name,name==='getCustomerHistory'?{kind:'history'}:{profileOnly:true}),error=>error.code==='permission-denied'||error.code==='unauthenticated',name+' must reject a disabled live account');
});

test('disabled customer cannot mutate consent, and reactivation restores access',async()=>{
 const ref=db.doc('customers/'+customerId),before=(await ref.get()).data();
 await assert.rejects(call('updateOwnWhatsappConsent',{consent:true}),error=>error.code==='permission-denied');
 assert.deepEqual((await ref.get()).data(),before);
 await auth.updateUser(uid,{disabled:false});
 assert.equal((await call('getCustomerPortal',{profileOnly:true})).customer.phone,phone);
});
test('changed phone and live staff promotion reject old customer claims',async()=>{
 await auth.updateUser(uid,{phoneNumber:'+201099911224'});
 await assert.rejects(call('getCustomerPortal',{profileOnly:true}),{code:'permission-denied'});
 await auth.updateUser(uid,{phoneNumber:'+201099911223'});
 await auth.setCustomUserClaims(uid,{role:'cashier'});
 await assert.rejects(call('getCustomerHistory',{kind:'history'}),{code:'permission-denied'});
 await auth.setCustomUserClaims(uid,{});
});
test('revoked old session cannot read history, freshly authenticated session can',async()=>{
 await auth.revokeRefreshTokens(uid);
 const user=await auth.getUser(uid),saved=identity;
 identity={...saved,token:{...saved.token,auth_time:Math.floor(Date.parse(user.tokensValidAfterTime)/1000)-1}};
 await assert.rejects(call('getCustomerHistory',{kind:'history'}),{code:'permission-denied'});
 const token=await auth.createCustomToken(uid);
 const response=await fetch('http://127.0.0.1:9097/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=local-only',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token,returnSecureToken:true})});
 assert.equal(response.status,200);identity={uid,token:await auth.verifyIdToken((await response.json()).idToken)};
 assert.equal((await call('getCustomerPortal',{profileOnly:true})).customer.phone,phone);
});
