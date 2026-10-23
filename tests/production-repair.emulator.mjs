import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
assert.equal(process.env.GCLOUD_PROJECT,'demo-el-mezaen-gate');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST&&process.env.FIREBASE_AUTH_EMULATOR_HOST);
const req=createRequire(new URL('../functions/package.json',import.meta.url));
const {getAuth}=req('firebase-admin/auth'),{getFirestore,Timestamp}=req('firebase-admin/firestore');
const h=await import('../functions/src/index.js');
const db=getFirestore(),auth=getAuth(),month='2030-12',expected=new Map();
const workerId=i=>'repair-'+String(i).padStart(3,'0');
const admin={uid:'repair-admin',token:{role:'admin',auth_time:Math.floor(Date.now()/1000)+10}};
const call=(name,a,data)=>h[name].run({auth:a,data,rawRequest:{ip:'127.0.0.1',headers:{}}});
const entries=[];
test('isolated demo fixtures include 300 workers and more than 2500 signed monthly ledger rows',async()=>{
 await auth.createUser({uid:admin.uid});await auth.setCustomUserClaims(admin.uid,{role:'admin'});
 await db.doc('users/'+admin.uid).set({role:'admin',active:true});
 await db.doc('branches/talkha').set({active:true,nameAr:'QA',monthlyRevenueTargets:{[month]:{targetAmount:2000}}});
 await db.doc('branches/mashaya').set({active:true,nameAr:'QA other'});
 let batch=db.batch();
 for(let i=0;i<300;i++)batch.set(db.doc('staff/'+workerId(i)),{active:true,branchIds:['talkha'],nameAr:workerId(i),monthlyTargets:{[month]:{talkha:{targetAmount:i===0?800:5}}}});
 await batch.commit();
 for(let i=0;i<2500;i++)entries.push({id:String(i).padStart(5,'0'),branchId:'talkha',dateKey:month+'-03',amount:1,workerBreakdown:{[workerId(i%300)]:1}});
 entries.push({id:'08000',branchId:'talkha',dateKey:month+'-20',amount:1000,workerBreakdown:{[workerId(0)]:1000}});
 entries.push({id:'09000',branchId:'talkha',dateKey:month+'-21',amount:-200,workerBreakdown:{[workerId(0)]:-200}});
 entries.push({id:'09999',branchId:'talkha',dateKey:month+'-22',amount:75,staffId:workerId(0),revenueBreakdown:{services:50,drinks:25}});
 for(const row of entries){if(row.workerBreakdown)for(const [id,value]of Object.entries(row.workerBreakdown))expected.set(id,(expected.get(id)||0)+value);else expected.set(row.staffId,(expected.get(row.staffId)||0)+row.revenueBreakdown.services);}
 for(let i=0;i<entries.length;i+=400){batch=db.batch();for(const {id,...data}of entries.slice(i,i+400))batch.set(db.doc('revenueLedger/repair-'+id),data);await batch.commit();}
 await db.doc('revenueLedger/repair-outside').set({branchId:'mashaya',dateKey:month+'-03',amount:99999,workerBreakdown:{[workerId(0)]:99999}});
 for(const [collection,count]of [['bookings',2503],['workerTasks',2101]])for(let i=0;i<count;i+=400){batch=db.batch();for(let n=i;n<Math.min(i+400,count);n++)batch.set(db.doc(collection+'/repair-counter-'+String(n).padStart(5,'0')),collection==='bookings'?{branchId:'talkha',status:'completed',bookingDate:month+'-03',staffId:workerId(n%300)}:{branchId:'talkha',status:'DONE',completedAt:Timestamp.fromDate(new Date(month+'-15T10:00:00Z')),assigneeStaffId:workerId(n%300)});await batch.commit();}

});
test('monthly target view returns all 300 workers and complete exact branch/month attribution',async()=>{
 const r=await call('getMonthlyTargetProgress',admin,{branchId:'talkha',month,view:'workers'});
 assert.equal(r.workers.length,300);for(const row of r.workers)assert.equal(row.achieved,expected.get(row.staffId),row.staffId);
 assert.equal(r.branch.achieved,entries.reduce((n,x)=>n+x.amount,0));
});
test('achievement event replay creates one notice without rewriting its read state',async()=>{
 const event={id:'repair-target-event',params:{ledgerId:'repair-08000'},data:{before:{data:()=>undefined},after:{data:()=>entries.find(x=>x.id==='08000')}}};
 await h.checkWorkerTargetsOnRevenue.run(event);
 const first=await db.collection('targetNotifications').where('staffId','==',workerId(0)).get();assert.equal(first.size,1);
 assert.equal(first.docs[0].data().achieved,expected.get(workerId(0)));
 await first.docs[0].ref.update({readBy:{kept:true}});await h.checkWorkerTargetsOnRevenue.run(event);
 const again=await db.collection('targetNotifications').where('staffId','==',workerId(0)).get();assert.equal(again.size,1);assert.equal(again.docs[0].data().readBy.kept,true);
});
test('leaderboard supports 300 assigned workers without truncating their revenue',async()=>{
 const r=await call('getWorkerLeaderboard',admin,{branchId:'talkha',month});assert.equal(r.rows.length,300);
 assert.equal(r.rows.find(x=>x.staffId===workerId(0)).achieved,expected.get(workerId(0)));
 assert.equal(r.rows.reduce((n,x)=>n+x.completedBookings,0),2503);assert.equal(r.rows.reduce((n,x)=>n+x.completedTasks,0),2101);
});
