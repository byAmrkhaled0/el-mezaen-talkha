import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
assert.equal(process.env.GCLOUD_PROJECT,'demo-el-mezaen-gate');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9097');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8087');
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const handlers=await import('../functions/src/index.js');
const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore');
const auth=getAuth(),db=getFirestore();let actor,shiftId,receipt;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const call=(name,data)=>handlers[name].run({auth:actor,data,rawRequest:{ip:'127.0.0.1',headers:{}}});
const sale=(id,extra={})=>({idempotencyKey:'offline-fixture-'+id,branchId:'talkha',customer:{firstName:'Synthetic only',phone:'01012345678'},items:[{id:'offline-service',kind:'service',qty:1,workerId:'none'}],paymentMethod:'cash',paid:true,offline:{version:1,shiftId,dateKey:today,total:100,prices:[{id:'offline-service',kind:'service',qty:1,unitPrice:100}]},...extra});
before(async()=>{
  const uid='offline-pos-cashier',claims={role:'cashier',permissions:['dashboard','pos','bookings'],branchIds:['talkha']};
  await auth.createUser({uid,email:'offline-pos@qa.example.test',password:'LocalOnly-2026!'});await auth.setCustomUserClaims(uid,claims);
  actor={uid,token:{...claims,auth_time:Math.ceil(Date.now()/1000)}};
  await db.doc('users/'+uid).set({...claims,active:true});
  await db.doc('branches/talkha').set({active:true,code:'QA',nameAr:'محلي فقط',nameEn:'Local only',phone:'01000000000',whatsapp:'01000000000'});
  await db.doc('settings/public').set({cashDrawerEnabled:true,pointsEnabled:false,cashbackEnabled:false});
  await db.doc('services/offline-service').set({active:true,catalogVisible:true,branchIds:['talkha'],nameAr:'خدمة اختبار',nameEn:'Test service',price:100,duration:30});
  const opened=await call('openCashShift',{branchId:'talkha',openingCash:0,idempotencyKey:'offline-shift-fixture-000001'});shiftId=opened.shiftId;
});
test('real transaction: eight concurrent offline retries create one booking, ledger and cash sale',async()=>{
  const results=await Promise.all(Array.from({length:8},()=>call('syncOfflinePosOrder',sale('concurrent-000001'))));
  assert.equal(new Set(results.map(r=>r.bookingCode)).size,1);receipt=results[0];
  assert.equal((await db.collection('bookings').get()).size,1);assert.equal((await db.collection('revenueLedger').get()).size,1);assert.equal((await db.collection('cashMovements').where('type','==','CASH_SALE').get()).size,1);
  assert.equal((await db.doc('cashShifts/'+shiftId).get()).data().cashSales,100);
  const guard=(await db.collection('posOrderGuards').get()).docs[0].data();assert.ok(guard.offlineFingerprint);assert.equal(guard.expiresAt,undefined);
});
test('lost response retry returns canonical receipt even after source service is removed',async()=>{
  await db.doc('services/offline-service').delete();const result=await call('syncOfflinePosOrder',sale('concurrent-000001'));assert.equal(result.bookingCode,receipt.bookingCode);assert.equal(result.idempotent,true);
  await db.doc('services/offline-service').set({active:true,catalogVisible:true,branchIds:['talkha'],nameAr:'خدمة اختبار',nameEn:'Test service',price:100,duration:30});
});
test('same id with altered payload is rejected without another ledger',async()=>{
  const payload=sale('concurrent-000001');payload.customer.firstName='Altered';await assert.rejects(call('syncOfflinePosOrder',payload),{code:'failed-precondition'});assert.equal((await db.collection('revenueLedger').get()).size,1);
});
test('changed price holds sale for review without silently repricing',async()=>{
  await db.doc('services/offline-service').update({price:150});await assert.rejects(call('syncOfflinePosOrder',sale('price-change-00001')),{code:'failed-precondition'});await db.doc('services/offline-service').update({price:100});assert.equal((await db.collection('bookings').get()).size,1);
});
test('unavailable stock does not partially post sale or cash',async()=>{
  await db.doc('inventoryItems/offline-stock').set({active:true,category:'product',branchId:'talkha',nameAr:'Stock',sellingPrice:10,stockQty:0});
  const payload=sale('stock-shortage-00001');payload.items.push({kind:'inventory',id:'offline-stock',qty:1});payload.offline.prices.push({kind:'inventory',id:'offline-stock',qty:1,unitPrice:10});payload.offline.total=110;
  await assert.rejects(call('syncOfflinePosOrder',payload),{code:'failed-precondition'});assert.equal((await db.doc('cashShifts/'+shiftId).get()).data().cashSales,100);
});
test('disabled account cannot synchronize a locally saved sale',async()=>{
  await auth.updateUser(actor.uid,{disabled:true});await assert.rejects(call('syncOfflinePosOrder',sale('disabled-account-0001')),{code:'permission-denied'});await auth.updateUser(actor.uid,{disabled:false});
});
test('closed/replaced original shift and different business date cannot redirect money into another shift',async()=>{
  const wrong=sale('wrong-date-000001');wrong.offline.dateKey='2020-01-01';await assert.rejects(call('syncOfflinePosOrder',wrong),{code:'failed-precondition'});
  await db.doc('cashShifts/'+shiftId).update({status:'CLOSED'});await assert.rejects(call('syncOfflinePosOrder',sale('closed-shift-00001')),{code:'failed-precondition'});
  assert.equal((await db.collection('bookings').get()).size,1);assert.equal((await db.collection('revenueLedger').get()).size,1);
});
