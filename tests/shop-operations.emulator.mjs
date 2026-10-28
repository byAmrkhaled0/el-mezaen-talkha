import {attendanceQueueId} from '../functions/src/booking-readiness.js';
import {cairoAppointmentMillis} from '../functions/src/cairo-time.js';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc} from 'firebase/firestore';
import {ref,uploadBytes,deleteObject} from 'firebase/storage';
import {BRANCH_OPERATION_PERMISSIONS,MEDIA_PERMISSIONS} from '../functions/src/authorization.js';
import {workerServiceHandlers} from '../functions/src/worker-services.js';
import {scheduling} from '../functions/src/scheduling.js';
const projectId='demo-el-mezaen-ops';
assert.equal(process.env.GCLOUD_PROJECT,projectId);
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'])assert.match(process.env[key]||'',/^127\.0\.0\.1:\d+$/);
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {getFirestore,FieldValue}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
const handlers=await import('../functions/src/index.js');
const db=getFirestore(),auth=getAuth(),tokens={};let rules;
const profiles={
 admin:{role:'admin',branchIds:[],permissions:[]},
 wagih:{role:'manager',branchIds:['talkha'],permissions:[...BRANCH_OPERATION_PERMISSIONS,'services','packages','sharedCatalog']},
 mashaya:{role:'manager',branchIds:['mashaya'],permissions:[...BRANCH_OPERATION_PERMISSIONS]},
 media:{role:'media',branchIds:['talkha','mashaya'],permissions:[...MEDIA_PERMISSIONS]},
 worker:{role:'worker',staffId:'queue-worker',branchIds:['talkha'],permissions:['tasks','attendance']}
};
const call=(name,actor,data)=>handlers[name].run({auth:{uid:actor,token:tokens[actor]},data,rawRequest:{ip:'127.0.0.1',headers:{}}});
const denied=(name,actor,data,code='permission-denied')=>assert.rejects(call(name,actor,data),{code});
before(async()=>{
 rules=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:18080,rules:await readFile('firestore.rules','utf8')},storage:{host:'127.0.0.1',port:19199,rules:await readFile('storage.rules','utf8')}});
 for(const[uid,profile]of Object.entries(profiles)){
  const email=uid+'@emulator.invalid',password='LocalOnlyOpsTest!3939';
  await auth.createUser({uid,email,password});await auth.setCustomUserClaims(uid,profile);
  await db.doc('users/'+uid).set({...profile,active:true});
  const response=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-only',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});
  const signed=await response.json();assert.equal(response.status,200);tokens[uid]=await auth.verifyIdToken(signed.idToken);
 }
 const batch=db.batch();
 batch.set(db.doc('settings/public'),{openingTime:'00:00',closingTime:'23:59',pointsRate:47,heroImageUrl:'',brandLogoUrl:''});
 for(const branchId of ['talkha','mashaya']){
  batch.set(db.doc('branches/'+branchId),{active:true,openingTime:'00:00',closingTime:'23:59'});
  batch.set(db.doc('staff/'+branchId),{active:true,branchIds:[branchId],baseSalary:12345});
  batch.set(db.doc('services/'+branchId),{active:true,nameAr:branchId,price:100,duration:30,branchIds:[branchId]});
 }
 batch.set(db.doc('staff/queue-worker'),{userUid:'worker',active:true,available:true,branchIds:['talkha'],workDays:[0,1,2,3,4,5,6],shiftStart:'00:00',shiftEnd:'23:59'});
 await batch.commit();
});
after(async()=>{await rules?.cleanup()});
test('verified live branch managers cannot read or mutate another branch; shared catalog listing is the only exception',async()=>{
 const catalog=await call('getAdminCollection','wagih',{collection:'services'});assert.deepEqual(catalog.items.map(r=>r.id).sort(),['mashaya','talkha']);
 const staff=await call('getAdminCollection','wagih',{collection:'staff'});assert.ok(staff.items.every(row=>row.branchIds.includes('talkha')));assert.ok(!staff.items.some(row=>row.id==='mashaya'));
 await denied('getAdminCollection','wagih',{collection:'staff',branchId:'mashaya'});
 await denied('adminUpsert','wagih',{collection:'staff',id:'mashaya',data:{nameAr:'Forbidden',branchIds:['mashaya']}});
 await denied('getAdminCollection','media',{collection:'staff'});await denied('getAdminCollection','media',{collection:'revenueLedger'});
 await denied('getBusinessDashboard','media',{});
 await denied('getAdminCollection','mashaya',{collection:'staff',branchId:'talkha'});
});
test('Wagih edits shared prices and server duration; Mashaya and media cannot acquire catalog grants',async()=>{
 const data={nameAr:'خدمة اختبار',nameEn:'Test service',price:150,duration:35,active:true,type:'service',branchIds:['talkha']};
 await call('adminUpsert','wagih',{collection:'services',id:'shared-new',data:{...data}});
 assert.deepEqual((await db.doc('services/shared-new').get()).data().branchIds,['talkha','mashaya']);
 assert.equal((await db.doc('services/shared-new').get()).data().duration,35);
 await denied('adminUpsert','mashaya',{collection:'services',id:'shared-new',data:{...data}});
 await denied('adminUpsert','media',{collection:'services',id:'shared-new',data:{...data}});
 for(const duration of [0,1,31,485])await denied('adminUpsert','wagih',{collection:'services',id:'invalid-duration',data:{...data,duration}},'invalid-argument');
 await denied('adminUpsert','wagih',{collection:'services',id:'invalid-scope',data:{...data,branchIds:['foreign']}},'invalid-argument');
});
test('media sees five public image settings only; no operating configuration or accounts access',async()=>{
 const result=await call('getAdminCollection','media',{collection:'settings'});assert.equal(result.items.length,1);assert.equal(Object.keys(result.items[0]).length,6);assert.ok(!('pointsRate'in result.items[0]));
 await call('adminUpsert','media',{collection:'settings',data:{heroImageUrl:''}});
 assert.equal((await db.doc('settings/public').get()).data().pointsRate,47);
 await denied('adminUpsert','media',{collection:'settings',data:{pointsRate:999}});
 await denied('getAdminCollection','media',{collection:'users'});
});
test('real Storage rules enforce granted folders, canonical media status and no financial document access',async()=>{
 const storage=(actor,profile=profiles[actor])=>rules.authenticatedContext(actor,profile).storage();
 const bytes=new Uint8Array([1,2,3]),upload=(actor,path,type='image/webp')=>uploadBytes(ref(storage(actor),path),bytes,{contentType:type});
 await assertSucceeds(upload('wagih','public/services/safe.webp'));
 await assertSucceeds(upload('wagih','public/packages/safe.webp'));
 await assertFails(upload('wagih','public/homepage/forbidden.webp'));
 await assertFails(upload('mashaya','public/services/forbidden.webp'));
 await assertSucceeds(upload('media','public/homepage/safe.webp'));
 await assertSucceeds(upload('media','public/content/gallery/talkha/safe.webp'));
 await assertFails(upload('media','public/content/gallery/foreign/bad.webp'));
 await assertFails(upload('media','public/staff/queue-worker/bad.webp'));
 await assertFails(upload('media','public/branding/bad.svg','image/svg+xml'));
 await assertFails(deleteObject(ref(storage('media'),'public/homepage/safe.webp')));
 await db.doc('users/media').update({active:false});await assertFails(upload('media','public/homepage/revoked.webp'));await db.doc('users/media').update({active:true});
 for(const actor of ['media','wagih'])await assertFails(setDoc(doc(rules.authenticatedContext(actor,profiles[actor]).firestore(),'revenueLedger/forged'),{amount:999}));
 await assertFails(getDoc(doc(rules.authenticatedContext('media',profiles.media).firestore(),'users/wagih')));
});
test('real Firestore contention reserves consecutive tasks and workers start only their linked queue',async()=>{
 class HttpError extends Error{constructor(code,message){super(message);this.code=code}}
 const clock={dateKey:'2026-10-25',time:'12:00'},schedule=scheduling({db,FieldValue,HttpsError:HttpError});
 const ops=workerServiceHandlers({db,FieldValue,HttpsError:HttpError,schedule,now:()=>({...clock}),readSettings:async()=>({openingTime:'00:00',closingTime:'23:59'}),requireLiveStaff:async r=>{assert.ok(tokens[r.auth.uid])},requirePermission:(r,p)=>{assert.ok(profiles[r.auth.uid].permissions.includes(p))},linkedStaffId:async r=>profiles[r.auth.uid].staffId,requireBranchAccess:(r,b)=>{if(!profiles[r.auth.uid].branchIds.includes(b))throw new HttpError('permission-denied','branch')}});
 const request=(key,actor='wagih')=>({auth:{uid:actor,token:tokens[actor]},data:{branchId:'talkha',staffId:'queue-worker',serviceId:'talkha',idempotencyKey:key}});
 const rows=await Promise.all([ops.queue(request('contention-first-request-12345')),ops.queue(request('contention-other-request-12345'))]);
 const intervals=rows.map(r=>r.session).sort((a,b)=>a.startTime.localeCompare(b.startTime));assert.equal(intervals[0].endTime,intervals[1].startTime);
 assert.equal((await ops.queue(request('contention-first-request-12345'))).idempotent,true);
 const state=(await db.doc('workerServiceState/queue-worker').get()).data(),firstId=state.queueSessionIds[0];
 const first=(await db.doc('workerServiceSessions/'+firstId).get()).data();
 await ops.transitionTask(request('unused-worker-request-12345','worker'),first.taskId,'IN_PROGRESS');
 assert.equal((await db.doc('workerServiceState/queue-worker').get()).data().activeSessionId,firstId);
 assert.equal((await db.doc('workerTasks/'+first.taskId).get()).data().status,'IN_PROGRESS');
 await ops.transitionTask(request('unused-worker-request-12345','worker'),first.taskId,'DONE');
 assert.equal((await db.doc('workerLeaves/'+firstId).get()).data().active,false);
 for(const collection of ['revenueLedger','cashShifts','expenses'])assert.equal((await db.collection(collection).get()).size,0);
});
test('branch operator pays an admin-approved advance once from their own drawer only; no approval or branch bypass',async()=>{
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await db.doc('cashShifts/manager-own').set({branchId:'talkha',businessDate:today,status:'OPEN',cashierUid:'wagih',openingCash:100,cashSales:0,cashIn:0,cashOut:0,cashRefunds:0,expectedCash:100});
 await db.doc('cashShiftState/talkha').set({branchId:'talkha',businessDate:today,status:'OPEN',openShiftId:'manager-own'});
 const approved={requestId:'approved-manager-advance',staffId:'queue-worker',staffNameAr:'Test',branchId:'talkha',requestType:'SALARY_ADVANCE',requestData:{amount:20},status:'APPROVED',integrationStatus:'AWAITING_DISBURSEMENT',approvedAmount:20,version:3,finalDecisionActor:'admin',finalDecisionAt:FieldValue.serverTimestamp()};
 await db.doc('workerRequests/approved-manager-advance').set(approved);
 const payload={requestId:approved.requestId,expectedVersion:3,expectedAmount:20,expectedShiftId:'manager-own'};
 await denied('getReadyWorkerAdvances','wagih',{branchId:'mashaya'});
 await denied('disburseWorkerAdvance','media',payload);await denied('disburseWorkerAdvance','mashaya',payload);
 await db.doc('cashShifts/manager-own').update({cashierUid:'another-owner'});await denied('disburseWorkerAdvance','wagih',payload);await db.doc('cashShifts/manager-own').update({cashierUid:'wagih'});
 await db.doc('workerRequests/pending-manager-advance').set({...approved,requestId:'pending-manager-advance',status:'PENDING',integrationStatus:'NONE'});
 await denied('disburseWorkerAdvance','wagih',{...payload,requestId:'pending-manager-advance'},'failed-precondition');
 const results=await Promise.all([call('disburseWorkerAdvance','wagih',payload),call('disburseWorkerAdvance','wagih',payload)]);assert.equal(results.filter(row=>row.idempotent).length,1);
 assert.equal((await db.doc('cashShifts/manager-own').get()).data().expectedCash,80);
 const saved=(await db.doc('workerRequests/'+approved.requestId).get()).data();assert.equal(saved.reviewHistory.v4.actorRole,'manager');
 assert.equal((await db.collection('cashMovements').where('requestId','==',approved.requestId).get()).size,1);
 assert.equal((await db.doc('settings/advanceBalance_queue-worker').get()).data().outstandingCents,2000);
});

const businessNow=()=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
let readyDate,readyWorker='ready-worker';
const readyItems=[{kind:'service',id:'ready-service',qty:1}];
const publicSlots=(date=readyDate)=>handlers.getAvailableSlots.run({data:{branchId:'talkha',staffId:readyWorker,bookingDate:date,items:readyItems},rawRequest:{ip:'127.0.0.1',headers:{}}});
test('GPS attendance gates public today availability; no absence bypass through crafted create request',async()=>{
 const parts=businessNow();readyDate=`${parts.year}-${parts.month}-${parts.day}`;
 await db.doc('branches/talkha').set({active:true,nameAr:'اختبار طلخا',code:'TK',openingTime:'00:00',closingTime:'23:59',latitude:31.05,longitude:31.38,attendanceRadiusMeters:100},{merge:true});
 await db.doc('staff/'+readyWorker).set({nameAr:'عامل تجريبي',userUid:'worker',active:true,available:true,branchIds:['talkha'],workDays:[0,1,2,3,4,5,6],shiftStart:'00:00',shiftEnd:'23:59'});
 profiles.worker.staffId=readyWorker;await auth.setCustomUserClaims('worker',profiles.worker);await db.doc('users/worker').update({staffId:readyWorker});const login=await fetch('http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-only',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'worker@emulator.invalid',password:'LocalOnlyOpsTest!3939',returnSecureToken:true})});assert.equal(login.status,200);tokens.worker=await auth.verifyIdToken((await login.json()).idToken);
 await db.doc('services/ready-service').set({nameAr:'دقن اختبار',price:100,duration:30,active:true,type:'service',branchIds:['talkha','mashaya']});
 const absent=await publicSlots();assert.equal(absent.reason,'staff_not_present');assert.deepEqual(absent.slots,[]);
 await call('setAttendancePolicy','admin',{uid:'worker',durationMinutes:480,expectedVersion:0});
 await denied('recordWorkerAttendance','worker',{action:'checkIn',branchId:'talkha',latitude:30,longitude:31.38,accuracy:10},'failed-precondition');
 assert.equal((await publicSlots()).slots.length,0);
 await call('recordWorkerAttendance','worker',{action:'checkIn',branchId:'talkha',latitude:31.05,longitude:31.38,accuracy:10});
 const ready=await publicSlots();assert.ok(ready.slots.length,'test clock must have at least one future slot before closing');assert.equal(ready.duration,30);assert.equal(ready.availability.state,'available');const board=await call('getWorkerAvailability','wagih',{branchId:'talkha',dateKey:readyDate});assert.equal(board.staff.find(s=>s.id===readyWorker).present,true);assert.ok(!JSON.stringify(board.staff).includes('userUid'));
});

test('active in-shop work hides overlapping slots and publishes an estimated next time; concurrent bookings allocate once',async()=>{
 const available=await publicSlots(),first=available.slots[0],endMinutes=Number(first.slice(0,2))*60+Number(first.slice(3))+30,end=`${String(Math.floor(endMinutes/60)).padStart(2,'0')}:${String(endMinutes%60).padStart(2,'0')}`;
 const parts=businessNow(),start=`${parts.hour}:${parts.minute}`;
 await db.doc('workerServiceState/'+readyWorker).set({staffId:readyWorker,branchId:'talkha',dateKey:readyDate,startTime:start,endTime:end,activeSessionId:'ready-session'});
 await db.doc('workerServiceSessions/ready-session').set({staffId:readyWorker,branchId:'talkha',dateKey:readyDate,startTime:start,endTime:end,active:true,status:'ACTIVE'});
 await db.doc('workerLeaves/ready-session').set({staffId:readyWorker,branchId:'all',dateKey:readyDate,startTime:start,endTime:end,active:true,kind:'busy',sourceServiceSessionId:'ready-session'});
 const busy=await publicSlots();assert.equal(busy.availability.state,'busy');assert.ok(!busy.slots.includes(first));assert.ok(busy.slots[0]>=end);assert.ok(busy.availability.waitMinutes>=30);
 const make=(phone,time,key)=>handlers.createBooking.run({data:{branchId:'talkha',staffId:readyWorker,bookingDate:readyDate,bookingTime:time,items:readyItems,customer:{firstName:'عميل',lastName:'اختبار',phone},clientRequestId:key},rawRequest:{ip:'127.0.0.1',headers:{}}});
 await assert.rejects(make('01000008001',first,'blocked-slot-attempt-12345'),{code:'failed-precondition'});
 const raced=await Promise.allSettled([make('01000008002',busy.slots[0],'book-same-time-one-12345'),make('01000008003',busy.slots[0],'book-same-time-two-12345')]);assert.equal(raced.filter(r=>r.status==='fulfilled').length,1,JSON.stringify(raced.map(r=>r.status==='rejected'?{code:r.reason.code,message:r.reason.message}:r.value)));assert.equal(raced.filter(r=>r.status==='rejected').length,1);
 const created=raced.find(r=>r.status==='fulfilled').value;const saved=(await db.doc('bookings/'+created.bookingId).get()).data();assert.equal(saved.duration,30);assert.equal(saved.status,'pending');assert.equal(saved.branchId,'talkha');
});

test('cashier reviews first; worker decisions and foreign/finance mutations fail',async()=>{
 const base={source:'website',staffId:readyWorker,branchId:'talkha',paymentStatus:'unpaid',status:'pending',duration:30,bookingDate:readyDate,bookingTime:'23:00',items:[],lockIds:[]};
 await db.doc('bookings/decision-own').set(base);
 const raced=await Promise.allSettled([call('updateBooking','worker',{id:'decision-own',action:'confirmed'}),call('updateBooking','wagih',{id:'decision-own',action:'rejected'})]);
 assert.equal(raced.filter(r=>r.status==='fulfilled').length,1);assert.equal(raced.filter(r=>r.status==='rejected').length,1);
 const saved=(await db.doc('bookings/decision-own').get()).data();assert.equal(saved.decisionBy,'wagih');
 for(const [id,patch]of [['decision-foreign',{staffId:'someone-else'}],['decision-paid',{paymentStatus:'paid'}],['decision-pos',{source:'pos'}],['decision-other-branch',{branchId:'mashaya'}]]){await db.doc('bookings/'+id).set({...base,...patch});await denied('updateBooking','worker',{id,action:'confirmed'});}
 for(const action of ['checkout','refund','completed','markPaid','arrived'])await denied('updateBooking','worker',{id:'decision-own',action});
 await db.doc('bookings/decision-reject').set({...base,lockIds:['ready-reject-lock'],duplicateGuardId:'ready-reject-guard'});await db.doc('appointmentLocks/ready-reject-lock').set({bookingId:'decision-reject'});await db.doc('bookingGuards/ready-reject-guard').set({bookingId:'decision-reject'});
 await denied('updateBooking','worker',{id:'decision-reject',action:'rejected'});await call('updateBooking','wagih',{id:'decision-reject',action:'rejected'});assert.equal((await db.doc('appointmentLocks/ready-reject-lock').get()).exists,false);assert.equal((await db.doc('bookingGuards/ready-reject-guard').get()).exists,false);
 assert.equal((await call('updateBooking','wagih',{id:'decision-reject',action:'rejected'})).idempotent,true);
});

test('attendance checkout or expired duration removes same-day bookability even if auto-close job is late; future schedule remains',async()=>{
 const queue=db.doc('attendanceShiftQueue/'+attendanceQueueId('worker'));const before=(await queue.get()).data();
 await queue.update({dueAt:new Date(Date.now()-1000)});assert.equal((await publicSlots()).reason,'staff_not_present');await queue.set(before);
 await call('recordWorkerAttendance','worker',{action:'checkOut',branchId:'talkha',latitude:31.05,longitude:31.38,accuracy:10});assert.equal((await publicSlots()).reason,'staff_not_present');
 // Explicitly finish the synthetic physical service; expiry never silently frees it.
 await db.doc('workerServiceSessions/ready-session').update({active:false,status:'FINISHED'});await db.doc('workerServiceState/'+readyWorker).update({activeSessionId:null});await db.doc('workerLeaves/ready-session').update({active:false});
 const next=new Date(readyDate+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+1);const result=await publicSlots(next.toISOString().slice(0,10));assert.ok(result.slots.length);
});

const catalogCall=data=>handlers.getCatalog.run({data,rawRequest:{ip:'127.0.0.1',headers:{}}});
test('600 catalog records page beyond the old 500 ceiling without private fields, duplicates or bulk responses',async()=>{
 for(let offset=0;offset<600;offset+=200){const batch=db.batch();for(let i=offset;i<offset+200;i++)batch.set(db.doc('services/scale-'+String(i).padStart(4,'0')),{active:true,nameAr:'بحثحجم '+String(i).padStart(4,'0'),nameEn:'Scale '+i,price:100,duration:30,type:'service',branchIds:['talkha'],costPrice:77,private:i<2});await batch.commit();}
 const ids=[];let cursor,skip=0,pages=0;
 do{const result=await catalogCall({mode:'page',collection:'services',branchId:'talkha',search:'بحثحجم ',Take:24,Skip:skip,cursor});assert.ok(result.items.length<=24);assert.ok(result.scanned<=24);assert.ok(!JSON.stringify(result.items).includes('costPrice'));assert.ok(result.items.every(row=>!row.private));ids.push(...result.items.map(row=>row.id));cursor=result.nextCursor;skip+=24;pages++;}while(cursor);
 assert.equal(pages,25);assert.equal(ids.length,598);assert.equal(new Set(ids).size,598);assert.ok(ids.includes('scale-0599'));
 const hydrated=await catalogCall({mode:'hydrate',ids:['scale-0599','scale-0000']});assert.equal(hydrated.services.length,1);assert.equal(hydrated.services[0].id,'scale-0599');assert.equal(hydrated.services[0].costPrice,undefined);
 await assert.rejects(catalogCall({mode:'page',collection:'users',take:25}),{code:'invalid-argument'});
 await assert.rejects(catalogCall({mode:'page',collection:'services',take:25,skip:100000}),{code:'invalid-argument'});
 const first=await catalogCall({mode:'page',collection:'services',branchId:'talkha',take:25});await assert.rejects(catalogCall({mode:'page',collection:'services',branchId:'mashaya',take:25,cursor:first.nextCursor}),{code:'invalid-argument'});
});

test('booking history uses real timestamp cursors, branch scope and server filters without ledger mutations',async()=>{
 const {Timestamp}=require('firebase-admin/firestore');const batch=db.batch();
 for(let i=0;i<80;i++)batch.set(db.doc('bookings/page-'+String(i).padStart(3,'0')),{code:'MZ-PAGE-'+i,source:'pos',branchId:i%2?'mashaya':'talkha',customerName:'تصفحعميل '+i,phone:'01000009000',paymentMethod:'cash',paymentStatus:'paid',status:'completed',total:100,createdAt:new Timestamp(1800000000,100+i)});await batch.commit();
 const request={collection:'bookings',branchId:'talkha',take:25,source:'pos',paymentMethod:'cash',search:'تصفحعميل '};
 const first=await call('getAdminCollection','wagih',request);assert.equal(first.items.length,25);assert.ok(first.items.every(row=>row.branchId==='talkha'));
 const second=await call('getAdminCollection','wagih',{...request,cursor:first.nextCursor,skip:25});assert.equal(second.items.length,15);assert.equal(new Set([...first.items,...second.items].map(row=>row.id)).size,40);assert.equal(second.nextCursor,null);
 await denied('getAdminCollection','mashaya',request);await denied('getAdminCollection','media',request);await denied('getAdminCollection','worker',request);
 const chronological=await call('getAdminCollection','wagih',{collection:'bookings',branchId:'talkha',take:25,source:'pos',paymentMethod:'cash'});const later=await call('getAdminCollection','wagih',{collection:'bookings',branchId:'talkha',take:25,source:'pos',paymentMethod:'cash',cursor:chronological.nextCursor,skip:25});assert.equal(new Set([...chronological.items,...later.items].map(row=>row.id)).size,chronological.items.length+later.items.length);
 const ledgerBefore=(await db.collection('revenueLedger').get()).size;await call('getAdminCollection','wagih',request);assert.equal((await db.collection('revenueLedger').get()).size,ledgerBefore);
});


test('server customer search and checkout catalog reach deep records without leaking foreign branches or cost fields',async()=>{
 const batch=db.batch();for(let i=0;i<90;i++){const id='search-'+String(i).padStart(3,'0');batch.set(db.doc('customers/'+id),{firstName:'توسعة '+String(i).padStart(3,'0'),lastName:'اختبار',phone:'010'+String(i).padStart(8,'0'),lastBranchId:i%2?'mashaya':'talkha',pointsBalance:999});batch.set(db.doc('services/'+id),{nameAr:'توسعة '+String(i).padStart(3,'0'),nameEn:'Scale '+i,type:'service',active:true,price:100,duration:30,costPrice:'PRIVATE_COST',branchIds:[i%2?'mashaya':'talkha']});}await batch.commit();
 let cursor=null,ids=[];do{const page=await call('getAdminCollection','wagih',{collection:'posCustomers',branchId:'talkha',search:'توسعة ',take:25,cursor});ids.push(...page.items.map(x=>x.id));assert.ok(page.items.every(x=>!('pointsBalance'in x)));cursor=page.nextCursor;}while(cursor);assert.equal(ids.length,45);assert.equal(new Set(ids).size,45);
 const customer=await call('getAdminCollection','wagih',{collection:'customers',branchId:'talkha',pageMode:'search',search:'توسعة 088',searchField:'firstName',take:25});assert.equal(customer.items[0].id,'search-088');
 const phone=await call('getAdminCollection','wagih',{collection:'posCustomers',branchId:'talkha',search:'+20 1000000088',searchField:'phone',take:25});assert.equal(phone.items[0].id,'search-088');
 const exact=await call('getAdminCollection','wagih',{collection:'packages',branchId:'talkha',pageMode:'search',ids:['nonexistent-required'],take:30});assert.equal(exact.items.length,0);
 const page=await call('getAdminCollection','wagih',{collection:'posCatalog',branchId:'talkha',section:'service',search:'توسعة 088',take:25});assert.equal(page.items[0].id,'search-088');assert.ok(!JSON.stringify(page).includes('PRIVATE_COST'));assert.equal(page.items[0].duration,30);
 await denied('getAdminCollection','mashaya',{collection:'posCustomers',branchId:'talkha',search:'توسعة '});await denied('getAdminCollection','media',{collection:'posCatalog',branchId:'talkha'});await denied('getAdminCollection','worker',{collection:'posCatalog',branchId:'talkha'});
 await denied('getAdminCollection','wagih',{collection:'customers',branchId:'talkha',pageMode:'search',searchField:'pointsBalance',search:'9'},'invalid-argument');
});


async function additionFixture(suffix){
 await db.doc('branches/talkha').set({active:true,code:'TK',nameAr:'طلخا',nameEn:'Talkha',phone:'01000000000',whatsapp:'01000000000'},{merge:true});
 await db.doc('settings/public').set({cashDrawerEnabled:false,loyaltyEnabled:false,walletRedemptionEnabled:false,minimumRedemption:0},{merge:true});
 await db.doc('services/addon-base').set({active:true,nameAr:'خدمة أساسية',nameEn:'Base',price:100,duration:30,type:'service',branchIds:['talkha']});
 await db.doc('services/addon-extra').set({active:true,nameAr:'خدمة إضافية',nameEn:'Extra',price:80,duration:20,type:'service',branchIds:['talkha']});
 await db.doc('inventoryItems/addon-product').set({active:true,nameAr:'منتج إضافة',sellingPrice:20,costPrice:3,stockQty:10,category:'product',branchId:'talkha'});
 await db.doc('drinks/addon-drink').set({active:true,nameAr:'شاي',price:10,drinkOptions:['سكر'],branchId:'all'});
 const result=await call('createPosOrder','wagih',{idempotencyKey:'addition-create-fixture-'+suffix,branchId:'talkha',customer:{firstName:'عميل إضافات',lastName:'اختبار',phone:'01012345678'},staffId:profiles.worker.staffId,items:[{id:'addon-base',kind:'service',qty:1,workerId:profiles.worker.staffId}],paid:false,paymentMethod:'card'});return result.bookingCode;
}
const additionCall=(endpoint,actor,data)=>call(endpoint,actor,{...data,scope:'orderAdditions'});
test('worker additions stay pending; cashier approval changes only the unpaid check and stock once; payment requires current revision',async()=>{
 const bookingId=await additionFixture('normal');const owned=await additionCall('getWorkerRequests','worker',{branchId:'talkha',view:'orders',bookingId});assert.equal(owned.items[0].items[0].lineTotal,100);
 const beforeLedger=(await db.collection('revenueLedger').get()).size;
 const request=await additionCall('submitWorkerRequest','worker',{bookingId,idempotencyKey:'addition-worker-request-normal',items:[{id:'addon-extra',kind:'service',qty:1,unitPrice:-999},{id:'addon-product',kind:'inventory',qty:2},{id:'addon-drink',kind:'drink',qty:1,option:'سكر'}]});
 assert.equal((await db.doc('bookings/'+bookingId).get()).data().total,100);assert.equal((await db.doc('inventoryItems/addon-product').get()).data().stockQty,10);
 const submitted=(await db.doc('orderAdditionRequests/'+request.id).get()).data();assert.equal(submitted.quotedTotal,130);assert.equal(submitted.status,'PENDING');
 const requests=await additionCall('getWorkerRequests','wagih',{branchId:'talkha'});assert.ok(requests.items.some(x=>x.id===request.id));
 await denied('updateWorkerRequest','worker',{scope:'orderAdditions',requestId:request.id,action:'APPROVE'});
 await denied('updateWorkerRequest','mashaya',{scope:'orderAdditions',requestId:request.id,action:'APPROVE'});
 const approved=await additionCall('updateWorkerRequest','wagih',{requestId:request.id,action:'APPROVE'});assert.equal(approved.status,'APPROVED');
 const order=(await db.doc('bookings/'+bookingId).get()).data();assert.equal(order.total,230);assert.equal(order.paymentStatus,'unpaid');assert.equal(order.financialPosted,false);assert.equal(order.orderRevision,1);assert.equal((await db.doc('inventoryItems/addon-product').get()).data().stockQty,8);assert.equal((await db.collection('revenueLedger').get()).size,beforeLedger);
 assert.equal((await additionCall('updateWorkerRequest','admin',{requestId:request.id,action:'APPROVE'})).idempotent,true);assert.equal((await db.doc('inventoryItems/addon-product').get()).data().stockQty,8);
 await denied('updateBooking','wagih',{id:bookingId,action:'checkout',paymentMethod:'card',expectedTotal:100,expectedOrderRevision:0},'failed-precondition');
 const pending=await additionCall('submitWorkerRequest','worker',{bookingId,idempotencyKey:'addition-worker-request-before-paid',items:[{id:'addon-product',kind:'inventory',qty:1}]});
 await call('updateBooking','wagih',{id:bookingId,action:'checkout',paymentMethod:'card',expectedTotal:230,expectedOrderRevision:1});
 assert.equal((await db.doc('revenueLedger/payment_'+bookingId).get()).data().amount,230);assert.equal((await db.doc('inventoryItems/addon-product').get()).data().stockQty,8);
 await denied('updateWorkerRequest','wagih',{scope:'orderAdditions',requestId:pending.id,action:'APPROVE'},'failed-precondition');
 await denied('submitWorkerRequest','worker',{scope:'orderAdditions',bookingId,idempotencyKey:'addition-worker-request-after-paid',items:[{id:'addon-extra',kind:'service',qty:1}]},'failed-precondition');
 await additionCall('updateWorkerRequest','wagih',{requestId:pending.id,action:'REJECT'});assert.equal((await db.doc('bookings/'+bookingId).get()).data().total,230);
});
test('opposing payment and addition approval cannot both commit an obsolete total; changed quotes are rejected',async()=>{
 const bookingId=await additionFixture('race');const request=await additionCall('submitWorkerRequest','worker',{bookingId,idempotencyKey:'addition-worker-request-race',items:[{id:'addon-extra',kind:'service',qty:1}]});
 const results=await Promise.allSettled([additionCall('updateWorkerRequest','wagih',{requestId:request.id,action:'APPROVE'}),call('updateBooking','wagih',{id:bookingId,action:'checkout',paymentMethod:'card',expectedTotal:100,expectedOrderRevision:0})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
 const row=(await db.doc('bookings/'+bookingId).get()).data();assert.ok(row.paymentStatus==='paid'&&row.total===100||row.paymentStatus==='unpaid'&&row.total===180);
 const changedId=await additionFixture('quote');const changed=await additionCall('submitWorkerRequest','worker',{bookingId:changedId,idempotencyKey:'addition-worker-request-quote',items:[{id:'addon-extra',kind:'service',qty:1}]});await db.doc('services/addon-extra').update({price:90});await denied('updateWorkerRequest','wagih',{scope:'orderAdditions',requestId:changed.id,action:'APPROVE'},'failed-precondition');assert.equal((await db.doc('bookings/'+changedId).get()).data().total,100);
});
test('secondary line worker receives order alerts and sees only their assigned unpaid checks',async()=>{
 await additionFixture('secondary-base');
 const result=await call('createPosOrder','wagih',{idempotencyKey:'addition-secondary-worker-fixture',branchId:'talkha',customer:{firstName:'عميل ثانوي',phone:'01012345678'},staffId:'talkha',items:[{id:'addon-base',kind:'service',qty:1,workerId:'talkha'},{id:'addon-extra',kind:'service',qty:1,workerId:profiles.worker.staffId}],paid:false,paymentMethod:'card'});
 const note=await call('notifyWorker','wagih',{staffId:profiles.worker.staffId,branchId:'talkha',bookingId:result.bookingCode,message:'عندك طلب',idempotencyKey:'addition-secondary-worker-notify'});assert.equal(note.ok,true);
 const orders=await additionCall('getWorkerRequests','worker',{branchId:'talkha',view:'orders'});assert.ok(orders.items.some(x=>x.id===result.bookingCode));const workspace=await call('getWorkerWorkspace','worker',{activeBranchId:'talkha'});assert.ok(workspace.bookings.some(x=>x.id===result.bookingCode));assert.ok(orders.items.every(x=>x.items.some(y=>y.workerId===profiles.worker.staffId)||x.id!==result.bookingCode));
 const catalog=await additionCall('getWorkerRequests','worker',{branchId:'talkha',view:'catalog',section:'product',search:'منتج إضافة'});assert.ok(!JSON.stringify(catalog).includes('costPrice'));
 await denied('getWorkerRequests','worker',{scope:'orderAdditions',branchId:'mashaya',view:'orders'});await denied('getWorkerRequests','media',{scope:'orderAdditions',branchId:'talkha'});
});

test('addition request history is cursor-paged and refuses another worker or branch cursor',async()=>{const batch=db.batch();for(let i=0;i<55;i++)batch.set(db.doc('orderAdditionRequests/history-'+String(i).padStart(3,'0')),{branchId:'talkha',staffId:profiles.worker.staffId,status:'PENDING',bookingId:'history-receipt',createdAt:require('firebase-admin/firestore').Timestamp.fromMillis(Date.now()+10000+i)});batch.set(db.doc('orderAdditionRequests/foreign-cursor'),{branchId:'mashaya',staffId:'someone',status:'PENDING',createdAt:FieldValue.serverTimestamp()});await batch.commit();let cursor=null,seen=[];do{const page=await additionCall('getWorkerRequests','worker',{branchId:'talkha',take:25,cursor});assert.ok(page.items.length<=25);seen.push(...page.items.filter(x=>x.id.startsWith('history-')).map(x=>x.id));cursor=page.nextCursor;}while(cursor);assert.equal(seen.length,55);assert.equal(new Set(seen).size,55);await denied('getWorkerRequests','worker',{scope:'orderAdditions',branchId:'talkha',cursor:'foreign-cursor'},'permission-denied');});
