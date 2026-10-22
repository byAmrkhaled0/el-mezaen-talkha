import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import http from 'node:http';import https from 'node:https';
const project='demo-el-mezaen-verify';
assert.equal(process.env.GCLOUD_PROJECT,project);
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'])assert.match(process.env[key]||'',/^127\.0\.0\.1:\d+$/);
assert.equal(process.env.FUNCTIONS_EMULATOR,'true');assert.equal(JSON.parse(process.env.FIREBASE_CONFIG).projectId,project);
// Forbid outgoing HTTP(S) in this process. All identities and records are synthetic.
const permitted=host=>['127.0.0.1','localhost','::1','[::1]'].includes(host);
for(const transport of [http,https])for(const method of ['request','get']){
 const original=transport[method];transport[method]=function(...args){const target=args[0];const host=typeof target==='string'||target instanceof URL?new URL(target).hostname:target.hostname||String(target.host||'').split(':')[0];assert.ok(permitted(host),`Blocked nonlocal HTTP: ${host}`);return original.apply(this,args);};
}
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {getAuth}=require('firebase-admin/auth'),{getFirestore,FieldValue}=require('firebase-admin/firestore');
const h=await import(process.env.BASELINE_FUNCTION_ENTRY);const db=getFirestore(),auth=getAuth(),actors={};
let syntheticClient=0;
const call=(name,actor,data={})=>h[name].run({auth:actor,data,rawRequest:{ip:name==='createBooking'?`127.1.0.${++syntheticClient}`:'127.0.0.1',headers:{}}});
let sequence=10000;const key=()=>`verify-attempt-${++sequence}-${Date.now()}`;
const advance=(amount=500,branchId='talkha')=>({branchId,requestType:'SALARY_ADVANCE',requestData:{amount,reason:'اختبار محلي',note:''},idempotencyKey:key()});
const leave=(start='2026-12-20',end=start,branchId='talkha')=>({branchId,requestType:'LEAVE',requestData:{startDate:start,endDate:end,leaveType:'PERSONAL',reason:'اختبار محلي'},idempotencyKey:key()});
const decision=(id,action,version=1)=>({requestId:id,action,note:'ملاحظة محلية',expectedVersion:version,idempotencyKey:key()});
const deny=p=>assert.rejects(p,e=>e.code==='permission-denied');
async function login(uid){const result=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${uid}@example.test`,password:'SyntheticLocal123!',returnSecureToken:true})});assert.equal(result.status,200);const body=await result.json();return {uid,token:await auth.verifyIdToken(body.idToken)};}


before(async()=>{
 await auth.createUser({uid:'race-admin',email:'race-admin@example.test',password:'SyntheticLocal123!'});const claims={role:'admin',branchIds:['talkha','mashaya'],permissions:[],mustChangePassword:false};await auth.setCustomUserClaims('race-admin',claims);await db.doc('users/race-admin').set({...claims,active:true});actors.admin=await login('race-admin');
 await db.doc('branches/talkha').set({nameAr:'فرع محلي',nameEn:'Local branch',code:'D',phone:'01000000000',whatsapp:'201000000000',active:true,bookingEnabled:true,openingTime:'11:00',closingTime:'23:00'});
 await db.doc('staff/race-staff').set({nameAr:'عامل محلي',nameEn:'Local worker',active:true,available:true,branchIds:['talkha'],serviceIds:['race-service']});
 await db.doc('services/race-service').set({nameAr:'خدمة محلية',nameEn:'Local service',active:true,branchIds:['talkha'],price:100,duration:30,staffRequired:true});
 await db.doc('settings/public').set({openingTime:'11:00',closingTime:'23:00'});
});
test('D-01 reproduced on unchanged approved baseline: manual leave commits after preflight, conflicting booking still commits',async()=>{
 const original=db.runTransaction.bind(db);let hit,release,timer;const ready=new Promise(r=>hit=r),wait=new Promise(r=>release=r);let armed=true;
 db.runTransaction=(callback,...options)=>original(async tx=>{
  if(callback.toString().includes('assignedLockRefs'))return callback(new Proxy(tx,{get(target,name){if(name==='getAll')return async(...refs)=>{if(armed&&refs.some(ref=>ref.path.startsWith('appointmentLocks/'))){armed=false;hit();await wait;}return target.getAll(...refs);};const value=target[name];return typeof value==='function'?value.bind(target):value;}}));return callback(tx);
 },...options);
 const data={branchId:'talkha',staffId:'race-staff',bookingDate:'2027-12-01',bookingTime:'12:00',clientRequestId:'original-race-synthetic-key',customer:{firstName:'عميل',lastName:'محلي',phone:'01099990001'},items:[{id:'race-service',kind:'service',qty:1}]};
 const booking=call('createBooking',null,data);booking.catch(()=>{});
 try{await Promise.race([ready,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('baseline gate timeout')),10000);})]);await call('adminUpsert',actors.admin,{collection:'workerLeaves',id:'race-leave',data:{staffId:'race-staff',branchId:'talkha',dateKey:data.bookingDate,startTime:'00:00',endTime:'23:59',active:true,reason:'اختبار سباق'}});release();const result=await booking;assert.ok(result.bookingId);assert.equal((await db.doc('workerLeaves/race-leave').get()).data().active,true);assert.equal((await db.doc('bookings/'+result.bookingId).get()).data().staffId,'race-staff');console.log('BASELINE D-01 REPRODUCED with real Firestore transactions; synthetic data only');}
 finally{clearTimeout(timer);release();db.runTransaction=original;}
});
