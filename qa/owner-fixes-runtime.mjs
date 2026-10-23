import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
assert.equal(process.env.GCLOUD_PROJECT,'demo-el-mezaen-qa');assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8088');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9098');assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS);
const require=createRequire(new URL('../functions/package.json',import.meta.url)),{initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');initializeApp({projectId:'demo-el-mezaen-qa'});const db=getFirestore(),rows=[],run=Date.now(),base='http://127.0.0.1:5201/demo-el-mezaen-qa/europe-west1/';
async function login(email){const r=await(await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-only-key',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password:'QaOnly-2026-Test!',returnSecureToken:true})})).json();assert.ok(r.idToken);return r.idToken;}
const admin=await login('qa-admin@qa.example.test'),cashier=await login('qa-cashier-talkha@qa.example.test'),manager=await login('qa-manager-talkha@qa.example.test'),worker=await login('qa-worker-talkha@workers.el-mezaen.invalid');
async function call(name,data,token,expected=200){const r=await fetch(base+name,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({data})});const body=await r.json();rows.push({name,status:r.status,body});assert.equal(r.status,expected,JSON.stringify(body));return body.result;}
const request={branchId:'talkha',type:'SUPPLY',title:'اختبار API لنقص مستلزمات',details:'طلب مصطنع لا يؤثر على مخزون أو درج',idempotencyKey:'qa-branch-needs-'+run};
const [a,b]=await Promise.all([call('submitBranchWorkRequest',request,cashier),call('submitBranchWorkRequest',request,cashier)]);assert.equal(a.id,b.id);assert.ok(a.idempotent||b.idempotent);
await call('submitBranchWorkRequest',{...request,title:'بيانات مختلفة'},cashier,409);
for(const token of [worker,manager])await call('getBranchWorkRequests',{branchId:'talkha',group:'needs'},token,403);
await call('getBranchWorkRequests',{branchId:'mashaya',group:'needs'},cashier,403);
await call('updateBranchWorkRequest',{branchId:'talkha',id:a.id,status:'RESOLVED',expectedVersion:1,resolution:'اختبار منع الحسم'},cashier,403);
await call('updateBranchWorkRequest',{branchId:'talkha',id:a.id,status:'IN_PROGRESS',expectedVersion:1,resolution:'مراجعة مصطنعة'},admin);
await call('updateBranchWorkRequest',{branchId:'talkha',id:a.id,status:'RESOLVED',expectedVersion:1,resolution:'نسخة قديمة'},admin,409);
await call('updateBranchWorkRequest',{branchId:'talkha',id:a.id,status:'RESOLVED',expectedVersion:2,resolution:'انتهاء اختبار متابعة API'},admin);
const existing=(await db.collection('bookings').where('branchId','==','talkha').limit(1).get()).docs[0];assert.ok(existing);const before=JSON.stringify(existing.data()),ledger=(await db.collection('revenueLedger').get()).size;
const customer=await call('submitBranchWorkRequest',{branchId:'talkha',type:'REFUND',title:'اختبار طلب استرداد فقط',details:'لا ننفذ استردادًا من سجل المتابعة',bookingId:existing.id,idempotencyKey:'qa-customer-request-'+run},cashier);
await call('updateBranchWorkRequest',{branchId:'talkha',id:customer.id,status:'RESOLVED',expectedVersion:1,resolution:'متابعة الاختبار فقط دون تغيير العملية'},admin);
assert.equal(JSON.stringify((await existing.ref.get()).data()),before);assert.equal((await db.collection('revenueLedger').get()).size,ledger);
const foreign='qa-branch-foreign-'+run;await db.doc('bookings/'+foreign).set({branchId:'mashaya',status:'confirmed',source:'qa-owner-fixes'});
await call('submitBranchWorkRequest',{branchId:'talkha',type:'CANCELLATION',title:'اختبار فرع مختلف',details:'يجب منع هذا الطلب',bookingId:foreign,idempotencyKey:'qa-cross-customer-'+run},cashier,403);
const list=await call('getBranchWorkRequests',{branchId:'talkha',group:'needs'},cashier);assert.ok(list.items.some(r=>r.id===a.id&&r.status==='RESOLVED'));assert.ok(list.items.every(r=>r.branchId==='talkha'));assert.ok(!JSON.stringify(list).includes('fingerprint'));
const queueId='qa-owner-queue-'+run,day=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
await db.doc('bookings/'+queueId).set({code:queueId,source:'qa-owner-fixes',branchId:'talkha',branchNameAr:'طلخا تجريبي',staffId:'qa-staff-talkha',staffNameAr:'عامل تجريبي talkha',customerName:'عميل اختبار لوحة التشغيل',serviceNamesAr:['قص تجريبي'],bookingDate:day,bookingTime:'18:00',duration:30,status:'confirmed',paymentStatus:'unpaid',total:100,createdAt:new Date()});
fs.writeFileSync('qa/owner-fixes-runtime-context.json',JSON.stringify({queueId,day},null,2));
fs.writeFileSync('qa/owner-fixes-runtime.json',JSON.stringify({verified:true,bookingUnchanged:true,ledgerUnchanged:true,rows},null,2));await db.terminate();console.log('PASS '+rows.length+' real HTTP cases; requests never altered booking or revenue.');
