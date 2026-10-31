import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {collectRecordPages} from '../src/record-history-client.js';
assert.equal(process.env.GCLOUD_PROJECT,'demo-el-mezaen-gate');assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8087');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9097');
const require=createRequire(new URL('../functions/package.json',import.meta.url)),h=await import('../functions/src/index.js');
const {getFirestore,Timestamp}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth'),db=getFirestore(),auth=getAuth();
const phone='01099887766',customerId=createHash('sha256').update(phone).digest('hex').slice(0,32),customer={uid:'record-customer',token:{auth_time:Math.ceil(Date.now()/1000),phone_number:'+201099887766'}};
const actor=(uid,role,branchIds)=>({uid,token:{role,branchIds,auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'password'}}});
const cashier=actor('record-cashier','cashier',['talkha']),owner=actor('record-owner','admin',['talkha','mashaya']);
const manager=actor('record-manager','manager',['talkha']);
const call=(name,a,data={})=>h[name].run({auth:a,data,rawRequest:{ip:'127.0.0.1',headers:{}}});
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Cairo'}).format(new Date());
test('prepare only isolated records, including more rows than old dashboard and account limits',async()=>{
 for(const a of [customer,cashier,manager,owner]){await auth.createUser({uid:a.uid,...(a===customer?{phoneNumber:customer.token.phone_number}:{})});if(a!==customer){await auth.setCustomUserClaims(a.uid,{role:a.token.role,branchIds:a.token.branchIds,...(a.token.permissions?{permissions:a.token.permissions}:{})});await db.doc('users/'+a.uid).set({role:a.token.role,active:true,branchIds:a.token.branchIds});}}
 await db.doc('customers/'+customerId).set({firstName:'عميل',lastName:'اختبار',phone,authUid:customer.uid,bookingCount:65,completedVisits:4,qrToken:'mzc_records_customer_123456789012345'});
 const batch=db.batch();
 for(let i=0;i<125;i++){
  const branchId=i%2?'mashaya':'talkha',id='record-ledger-'+String(i).padStart(3,'0');
  batch.set(db.doc('revenueLedger/'+id),{branchId,dateKey:'2026-09-15',staffId:'ali',itemIds:['beard'],amount:i===0?-70:70,createdAt:Timestamp.fromMillis(1000+i)});
 }
 for(let i=0;i<65;i++)batch.set(db.doc('bookings/record-booking-'+String(i).padStart(3,'0')),{phoneHash:customerId,branchId:i%2?'mashaya':'talkha',bookingDate:i<25?today:'2026-01-01',bookingTime:'10:00',status:i<25?'confirmed':'completed',paymentStatus:i<25?'unpaid':'paid',createdAt:new Timestamp(2000+Math.floor(i/2),i%2),customerName:'عميل اختبار',phone});
 for(let i=0;i<45;i++)batch.set(db.doc('walletTransactions/record-wallet-'+i),{customerId,points:i,createdAt:new Timestamp(3000+Math.floor(i/2),i%2)});
 batch.set(db.doc('bookings/record-other-customer'),{phoneHash:'other',branchId:'mashaya',bookingDate:today,status:'confirmed',createdAt:Timestamp.now()});await batch.commit();
});
test('customer sees early-created future booking independently, and every history/wallet page exactly once',async()=>{
 const portal=await call('getCustomerPortal',customer);assert.equal(portal.bookingHistory.length,20);assert.equal(portal.upcomingBookings.length,20);assert.equal(portal.walletActivity.length,20);assert.equal(portal.customer.completedVisits,4);
 for(const [kind,field,expected] of [['history','bookingHistory',65],['wallet','walletActivity',45],['upcoming','upcomingBookings',25]]){
  const rows=[...portal[field]];let cursor=portal.historyCursors[kind];while(cursor){const page=await call('getCustomerHistory',customer,{kind,cursor});rows.push(...page.items);cursor=page.nextCursor;}
  assert.equal(rows.length,expected);assert.equal(new Set(rows.map(r=>r.id)).size,expected);assert.ok(rows.every(r=>r.id!=='record-other-customer'));
 }
 await assert.rejects(call('getCustomerHistory',null,{kind:'history'}));
 await assert.rejects(call('getCustomerHistory',customer,{kind:'wallet',cursor:portal.historyCursors.history}));
});
test('authorized branch manager historical export crosses old 80-row limit, while cashier finance remains denied',async()=>{
 const filters={kind:'revenue',branchId:'all',from:'2026-09-01',to:'2026-09-30',staff:'ali',service:'beard'};
 const read=a=>data=>call('getAdminHistory',a,data);
 await assert.rejects(call('getAdminHistory',cashier,filters));
 const local=await collectRecordPages(read(manager),filters);assert.equal(local.length,63);assert.ok(local.every(row=>row.branchId==='talkha'));assert.equal(local.find(r=>r.id==='record-ledger-000').amount,-70);
 const all=await collectRecordPages(read(owner),filters);assert.equal(all.length,125);assert.equal(new Set(all.map(r=>r.id)).size,125);
 await assert.rejects(call('getAdminHistory',manager,{...filters,branchId:'mashaya'}));await assert.rejects(call('getAdminHistory',customer,filters));await assert.rejects(call('getAdminHistory',null,filters));
 const page=await call('getAdminHistory',owner,filters);await assert.rejects(call('getAdminHistory',owner,{...filters,service:'hair',cursor:page.nextCursor}));await assert.rejects(call('getAdminHistory',manager,{...filters,cursor:page.nextCursor}));
 assert.equal((await collectRecordPages(read(owner),{...filters,service:'missing'})).length,0);
});
test('booking export filters old matching bookings across scanned pages without including other branch or POS',async()=>{
 const rows=await collectRecordPages(data=>call('getAdminHistory',cashier,data),{kind:'bookings',branchId:'all',status:'completed',payment:'paid',date:'2026-01-01',query:'اختبار'});
 assert.equal(rows.length,20);assert.ok(rows.every(row=>row.status==='completed'&&row.branchId==='talkha'));
});
