import assert from 'node:assert/strict';
const project='demo-el-mezaen-local',base='http://127.0.0.1:5001/'+project+'/europe-west1/';
assert.equal(process.env.GCLOUD_PROJECT,project);assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099');
const invoke=async(name,data,token)=>{const r=await fetch(base+name,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data}),signal:AbortSignal.timeout(45000)});const x=await r.json();if(!r.ok||x.error)throw Error(name+':'+(x.error?.message||r.status));return x.result??x.data;};
const {createRequire}=await import('node:module');const require=createRequire(new URL('../../functions/package.json',import.meta.url));const {initializeApp}=require('firebase-admin/app'),{getFirestore,FieldValue}=require('firebase-admin/firestore');assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');initializeApp({projectId:project});const marker=getFirestore().doc('settings/localReviewOperationsSeed');if((await marker.get()).exists){console.log('Existing local demonstration operations preserved.');process.exit(0);}
const catalog=await invoke('getCatalog',{});const selected=catalog.services.find(s=>s.type!=='product'&&s.active!==false&&Number(s.price)>0);assert.ok(selected);
const future=new Date();future.setUTCDate(future.getUTCDate()+1);const bookingDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(future);
for(const [branchId,email,phone]of [['talkha','wagih.local@example.test','01012345001'],['mashaya','mashaya.local@example.test','01012345002']]){
 const login=await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local-key',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'LocalReview-2026!',returnSecureToken:true})});assert.equal(login.status,200);const token=(await login.json()).idToken;
 await invoke('openCashShift',{branchId,openingCash:1000,idempotencyKey:'local-review-open-shift-'+branchId},token);
 const slots=await invoke('getAvailableSlots',{branchId,staffId:'local-worker-'+branchId,bookingDate,items:[{id:selected.id,kind:'service',qty:1}]});assert.ok(slots.slots.length>0);
 await invoke('createBooking',{branchId,staffId:'local-worker-'+branchId,bookingDate,bookingTime:slots.slots[0],customer:{firstName:'عميل تجريبي',lastName:branchId,phone},items:[{id:selected.id,kind:'service',qty:1}],clientRequestId:'local-review-booking-'+branchId});
 await invoke('createPosOrder',{branchId,staffId:'local-worker-'+branchId,customer:{firstName:'شيك تجريبي',lastName:branchId,phone},items:[{id:selected.id,kind:'service',qty:1}],paid:false,paymentMethod:'cash',idempotencyKey:'local-review-unpaid-'+branchId},token);
 console.log('Ready: local branch '+branchId+' shift, future booking, unpaid check');
}

await marker.set({seedVersion:1,createdAt:FieldValue.serverTimestamp()});
