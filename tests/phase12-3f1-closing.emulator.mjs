import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import http from 'node:http';
import https from 'node:https';
const project='demo-el-mezaen-verify';
assert.equal(process.env.GCLOUD_PROJECT,project);
assert.equal(process.env.FUNCTIONS_EMULATOR,'true');
assert.equal(JSON.parse(process.env.FIREBASE_CONFIG).projectId,project);
for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST']) assert.match(process.env[key]||'',/^127\.0\.0\.1:\d+$/);
for(const transport of [http,https]) for(const method of ['request','get']) {
 const original=transport[method];transport[method]=function(...args) {
  const target=args[0];const host=typeof target==='string'||target instanceof URL?new URL(target).hostname:target.hostname||String(target.host||'').split(':')[0];
  assert.ok(['127.0.0.1','localhost','::1','[::1]'].includes(host),`Blocked nonlocal HTTP: ${host}`);
  return original.apply(this,args);
 };
}
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {getAuth}=require('firebase-admin/auth');const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const h=await import('../functions/src/index.js');const db=getFirestore(),auth=getAuth(),actors={};
const call=(name,role,data)=>h[name].run({auth:actors[role],data,rawRequest:{ip:'127.0.0.1',headers:{}}});
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let firstSalary;let sequence=0;const key=()=>`payroll-local-attempt-${++sequence}`;
async function staff(id,branches=['talkha'],extra={}){await db.doc(`staff/${id}`).set({nameAr:'عامل محلي',active:true,branchIds:branches,baseSalary:1000,...extra});return id;}
const settle=(id,extra={},role='admin')=>call('recordPayrollPayment',role,{month:'2026-10',staffId:id,paymentMethod:'cash',...extra});
async function open(branch='talkha',role='cashier'){return call('openCashShift',role,{branchId:branch,openingCash:100000,idempotencyKey:key()});}
async function close(branch='talkha') {const state=(await db.doc(`cashShiftState/${branch}`).get()).data(),shift=(await db.doc(`cashShifts/${state.openShiftId}`).get()).data();return call('closeCashShift','admin',{branchId:branch,actualCash:shift.expectedCash,reason:'اختبار إغلاق محلي',idempotencyKey:key()});}
async function dayClose(branch='talkha') {return call('closeBusinessDay','admin',{branchId:branch,businessDate:today,actualCash:0,reason:'اختبار محلي',idempotencyKey:key()});}
async function gate(marker,loser,winner){
 const runner=db.runTransaction.bind(db);let hit,release,armed=true,timer;const ready=new Promise(r=>hit=r),wait=new Promise(r=>release=r);
 db.runTransaction=(callback,...opts)=>runner(async tx=>{if(armed&&callback.toString().includes(marker)){armed=false;hit();await wait;}return callback(tx);},...opts);
 const pending=loser();pending.catch(()=>{});
 try{await Promise.race([ready,new Promise((_,rej)=>{timer=setTimeout(()=>rej(Error('gate timed out')),10000);})]);const first=await winner();release();return {first,second:await pending.catch(error=>({error}))};}finally{clearTimeout(timer);release();db.runTransaction=runner;}
}
before(async()=>{
 for(const [role,branches,permissions] of [['admin',['talkha','mashaya'],[]],['cashier',['talkha'],['pos']],['manager',['talkha'],['payroll','pos']],['worker',['talkha'],[]]]){
  const uid=`f1-${role}`;await auth.createUser({uid,email:`${uid}@example.test`,password:'SyntheticLocal123!'});const claims={role,branchIds:branches,permissions,mustChangePassword:false,...(role==='worker'?{staffId:'f1-linked'}:{})};
  await auth.setCustomUserClaims(uid,claims);await db.doc(`users/${uid}`).set({...claims,active:true});
  const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`${uid}@example.test`,password:'SyntheticLocal123!',returnSecureToken:true})});assert.equal(r.status,200);actors[role]={uid,token:await auth.verifyIdToken((await r.json()).idToken)};
 }
 await staff('f1-linked',['talkha'],{userUid:'f1-worker'});
 for(const branch of ['talkha','mashaya'])await db.doc(`branches/${branch}`).set({active:true,nameAr:branch,nameEn:branch});
 await db.doc('settings/public').set({cashDrawerEnabled:true});await open();await open('mashaya','admin');
});
after(async()=>{await db.terminate();});

const pay=(id,method='instapay',extra={})=>settle(id,{paymentMethod:method,...extra});
const sharedClose=()=>call('closeBusinessDay','admin',{branchId:'all',businessDate:today,idempotencyKey:key()});
const absent=async id=>{for(const path of [`payrollPayments/2026-10_${id}`,`expenses/salary_2026-10_${id}`,`cashMovements/salary_2026-10_${id}`,`activityLogs/payroll_2026-10_${id}`])assert.equal((await db.doc(path).get()).exists,false,path);};
let sharedBefore,branchBefore;
test('all supported noncash methods post gross expense without cash drawer mutations',async()=>{
 const state=(await db.doc('cashShiftState/talkha').get()).data(), before=(await db.doc('cashShifts/'+state.openShiftId).get()).data();
 for(const method of ['instapay','card','vodafone_cash','other']){const id=await staff('f1-method-'+method);const r=await pay(id,method);assert.equal(r.cashMovementReference,null);assert.equal(r.payroll.advanceDeduction,0);assert.equal((await db.doc('expenses/salary_2026-10_'+id).get()).data().amount,1000);}
 assert.deepEqual((await db.doc('cashShifts/'+state.openShiftId).get()).data(),before);
 assert.equal((await db.doc('cashShiftState/talkha').get()).data().financialPostingVersion,4);
});
test('concurrent Instapay payroll commits exactly one expense and one guard version increment',async()=>{
 const id=await staff('f1-concurrent',['mashaya']), before=(await db.doc('cashShiftState/mashaya').get()).data().financialPostingVersion||0;
 const results=await Promise.all([pay(id),pay(id)]);assert.equal(results.filter(x=>x.idempotent).length,1);
 assert.equal((await db.collection('expenses').where('staffId','==',id).get()).size,1);assert.equal((await db.doc('cashShiftState/mashaya').get()).data().financialPostingVersion,before+1);
});
test('shared closing rejects before both physical branches close and does not create a shared shift',async()=>{
 await assert.rejects(sharedClose(),e=>e.code==='failed-precondition');assert.equal((await db.doc('dailyClosings/all_'+today).get()).exists,false);assert.equal((await db.doc('cashShiftState/all').get()).exists,false);
});
test('only live Admin may finalize shared accounting scope',async()=>{
 for(const role of ['manager','cashier','worker'])await assert.rejects(call('closeBusinessDay',role,{branchId:'all',businessDate:today,idempotencyKey:key()}),e=>e.code==='permission-denied');
 await auth.updateUser('f1-admin',{disabled:true});try{await assert.rejects(sharedClose(),e=>e.code==='permission-denied');}finally{await auth.updateUser('f1-admin',{disabled:false});}
});
test('shared cash payroll retains explicit funding, all expense and physical branch outflow',async()=>{
 const id=await staff('f1-shared-cash',['talkha','mashaya']);await assert.rejects(settle(id),e=>e.code==='invalid-argument');
 const r=await settle(id,{fundingBranchId:'mashaya'});assert.equal(r.payroll.branchId,'all');assert.equal(r.payroll.fundingBranchId,'mashaya');assert.equal((await db.doc('cashMovements/'+r.cashMovementReference).get()).data().branchId,'mashaya');
});
test('shared noncash recognized once; branch dashboard excludes shared expense',async()=>{
 const id=await staff('f1-shared-before',['talkha','mashaya']);sharedBefore=await pay(id);assert.equal(sharedBefore.cashMovementReference,null);
 const all=await call('getBusinessDashboard','admin',{branchId:'all',month:today.slice(0,7)}),branch=await call('getBusinessDashboard','manager',{branchId:'talkha',month:today.slice(0,7)});
 assert.equal(all.expenses.filter(e=>e.staffId===id).length,1);assert.ok(branch.expenses.every(e=>e.branchId==='talkha'));assert.equal(all.stats.netProfit,all.stats.grossRevenue-all.stats.totalExpenses);
});
test('prepare canonical disbursed advances for shared zero-net closing races',async()=>{
 for(const id of ['f1-shared-race','f1-shared-close-first']){
  await staff(id,['talkha','mashaya']);const requestId='advance-'+id;
  await db.doc('workerRequests/'+requestId).set({requestId,staffId:id,staffNameAr:'عامل اختبار',branchId:'talkha',requestType:'SALARY_ADVANCE',requestData:{amount:1500,reason:'اختبار محلي'},status:'APPROVED',integrationStatus:'AWAITING_DISBURSEMENT',approvedAmount:1500,finalDecisionActor:'f1-admin',finalDecisionAt:FieldValue.serverTimestamp(),disbursementReference:null,version:3,createdAt:FieldValue.serverTimestamp(),reviewHistory:{}});
  const state=(await db.doc('cashShiftState/talkha').get()).data();await call('disburseWorkerAdvance','cashier',{requestId,expectedVersion:3,expectedAmount:1500,expectedShiftId:state.openShiftId});
 }
});
test('bounded closing aggregates use canonical payments and refunds, without duplicating shared expense',async()=>{
 for(const [id,branchId,type,amount] of [['f1-sale-a','talkha','payment',10000],['f1-refund','talkha','refund',-1000],['f1-sale-b','mashaya','payment',2000]])await db.doc('revenueLedger/'+id).set({branchId,type,amount,dateKey:today,paymentMethod:'instapay'});
});
test('branch payroll commits first: stale day closing aborts, explicit retry includes expense',async()=>{
 await close('talkha');await close('mashaya');const id=await staff('f1-branch-race');
 const r=await gate('stateBeforeAggregation.updateTime',()=>dayClose(),()=>pay(id));assert.ok(r.first.ok);assert.equal(r.second.error.code,'aborted');assert.equal((await db.doc('dailyClosings/talkha_'+today).get()).exists,false);
 const final=await dayClose();assert.equal(final.closing.expenses,5000);branchBefore=(await db.doc('dailyClosings/talkha_'+today).get()).data();
});
test('day closing commits first: paused noncash payroll fails with no financial writes',async()=>{
 const id=await staff('f1-close-first',['mashaya']);const r=await gate('const [existing,oldExpense]',()=>pay(id),()=>dayClose('mashaya'));assert.ok(r.first.ok);assert.equal(r.second.error.code,'failed-precondition');await absent(id);
});
test('closed physical accounting day rejects every payroll method and preserves immutable report',async()=>{
 for(const method of ['cash','instapay','card','vodafone_cash','other']){const id=await staff('f1-closed-'+method);await assert.rejects(pay(id,method),e=>e.code==='failed-precondition');await absent(id);}
 assert.deepEqual((await db.doc('dailyClosings/talkha_'+today).get()).data(),branchBefore);
});
test('shared noncash still permitted after branch closings while independent shared scope remains open',async()=>{
 const id=await staff('f1-shared-open',['talkha','mashaya']);assert.ok((await pay(id)).ok);assert.equal((await db.doc('cashMovements/salary_2026-10_'+id).get()).exists,false);
});
test('shared cash payroll cannot bypass closed funding day even if shared accounting day remains open',async()=>{
 const id=await staff('f1-shared-cash-closed',['talkha','mashaya']);await assert.rejects(settle(id,{fundingBranchId:'talkha'}),e=>e.code==='failed-precondition');await absent(id);
});
test('consolidated daily reporting is NOT_FINAL until explicit shared closing',async()=>{
 const r=await call('getBusinessReport','admin',{type:'daily',branchId:'all',periodKey:today});assert.equal(r.financialClosing.status,'NOT_FINAL');assert.deepEqual(r.financialClosing.missingScopes,['all']);
});
test('shared payroll commits first: shared closing rejects stale aggregate without partial finalization',async()=>{
 const id=await staff('f1-shared-race',['talkha','mashaya']);const r=await gate('guard.updateTime.isEqual',()=>sharedClose(),()=>pay(id));assert.ok(r.first.ok);assert.equal(r.first.payroll.netPaid,0);assert.equal(r.first.payroll.advanceDeduction,1000);assert.equal(r.first.cashMovementReference,null);assert.equal((await db.doc('settings/advanceBalance_'+id).get()).data().outstandingCents,50000);assert.equal(r.second.error.code,'aborted');assert.equal((await db.doc('dailyClosings/all_'+today).get()).exists,false);
});
test('shared closing commits first: competing payroll rejected and consolidated totals capture shared expenses once',async()=>{
 const id=await staff('f1-shared-close-first',['talkha','mashaya']);const r=await gate('const [existing,oldExpense]',()=>pay(id),async()=>{const results=await Promise.all([sharedClose(),sharedClose()]);assert.equal(results.filter(x=>x.idempotent).length,1);return results.find(x=>!x.idempotent);});assert.ok(r.first.ok);assert.equal(r.second.error.code,'failed-precondition');await absent(id);assert.equal((await db.doc('settings/advanceBalance_'+id).get()).data().outstandingCents,150000);assert.equal((await db.doc('workerRequests/advance-'+id).get()).data().advanceDeductedCents,0);
 const shared=(await db.doc('dailyClosings/all_'+today).get()).data(), a=(await db.doc('dailyClosings/talkha_'+today).get()).data(),b=(await db.doc('dailyClosings/mashaya_'+today).get()).data();
 assert.equal(shared.expenses,4000);assert.equal(shared.consolidated.expenses,a.expenses+b.expenses+4000);assert.equal(shared.consolidated.netProfit,a.netSales+b.netSales-shared.consolidated.expenses);
 assert.equal(shared.consolidated.cashOut,4000);assert.equal(a.expenses,5000);assert.equal(b.expenses,1000);assert.equal((await db.doc('cashShiftState/all').get()).exists,false);
});
test('concurrent shared close retries return the immutable canonical closing and one audit',async()=>{
 const before=(await db.doc('dailyClosings/all_'+today).get()).data();const r=await Promise.all([sharedClose(),sharedClose()]);assert.ok(r.every(x=>x.idempotent));assert.deepEqual((await db.doc('dailyClosings/all_'+today).get()).data(),before);
 assert.equal((await db.collection('activityLogs').where('action','==','close-shared-expenses').get()).size,1);
});
test('closed shared scope blocks all methods without allocations; committed retry remains canonical',async()=>{
 for(const method of ['cash','instapay','card','vodafone_cash','other']){const id=await staff('f1-shared-closed-'+method,['talkha','mashaya']);await assert.rejects(pay(id,method,{...(method==='cash'?{fundingBranchId:'mashaya'}:{})}),e=>e.code==='failed-precondition');await absent(id);assert.equal((await db.doc('settings/advanceBalance_'+id).get()).exists,false);}
 const again=await pay('f1-shared-before');assert.equal(again.idempotent,true);assert.deepEqual(again.payroll,sharedBefore.payroll);
});
test('final consolidated report is additive; historical branch closing records remain unchanged',async()=>{
 const r=await call('getBusinessReport','admin',{type:'daily',branchId:'all',periodKey:today});assert.equal(r.financialClosing.status,'FINAL');assert.equal(r.financialClosing.sharedExpenses,4000);assert.equal(r.financialClosing.expenses,10000);assert.equal(r.combined.status,'FINAL');assert.equal(r.combined.totals.expenses,10000);assert.equal(r.combined.totals.sharedExpenses,4000);assert.equal(r.combined.totals.netProfit,r.financialClosing.netProfit);assert.equal(r.combined.totals.netRevenue,11000);assert.equal(r.combined.totals.netProfit,1000);
 assert.deepEqual((await db.doc('dailyClosings/talkha_'+today).get()).data(),branchBefore);
 const past=await call('getBusinessReport','admin',{type:'daily',branchId:'all',periodKey:'2020-01-01'});assert.equal(past.financialClosing.status,'NOT_FINAL');
});
test('unauthorized branch report and physical shared cash inputs rejected',async()=>{
 await assert.rejects(call('getBusinessReport','manager',{type:'daily',branchId:'mashaya',periodKey:today}),e=>e.code==='permission-denied');
 await assert.rejects(call('closeBusinessDay','admin',{branchId:'all',businessDate:today,idempotencyKey:key(),actualCash:1}),e=>e.code==='invalid-argument');
});
test('invalid, future and non-calendar shared closing dates rejected',async()=>{
 for(const date of ['2026-02-30','2099-01-01','2026-13-01'])await assert.rejects(call('closeBusinessDay','admin',{branchId:'all',businessDate:date,idempotencyKey:key()}),e=>e.code==='invalid-argument');
});
test('no booking, leave, scheduled job or cash drawer introduced by shared accounting closure',async()=>{
 for(const name of ['bookings','workerLeaves'])assert.equal((await db.collection(name).limit(1).get()).size,0);
 assert.equal((await db.collection('cashShifts').where('branchId','==','all').get()).size,0);
});

test('separate-date legacy shared expense deletion coordinates closing; closed records cannot be deleted',async()=>{
 const date='2020-01-02';for(const id of ['talkha','mashaya'])await call('closeBusinessDay','admin',{branchId:id,businessDate:date,actualCash:0,idempotencyKey:key()});
 for(const [id,amount] of [['f1-legacy-delete',20],['f1-legacy-preserve',30]])await db.doc('expenses/'+id).set({branchId:'all',dateKey:date,amount,category:'other'});
 const closing=()=>call('closeBusinessDay','admin',{branchId:'all',businessDate:date,idempotencyKey:key()});
 const r=await gate('guard.updateTime.isEqual',closing,()=>call('adminSecureDelete','admin',{kind:'expense',id:'f1-legacy-delete',reason:'synthetic authorized deletion'}));assert.ok(r.first.ok);assert.equal(r.second.error.code,'aborted');assert.equal((await db.doc('dailyClosings/all_'+date).get()).exists,false);
 const final=await closing();assert.equal(final.closing.expenses,30);await assert.rejects(call('adminSecureDelete','admin',{kind:'expense',id:'f1-legacy-preserve',reason:'synthetic test'}),e=>e.code==='failed-precondition');assert.equal((await db.doc('expenses/f1-legacy-preserve').get()).data().amount,30);
 assert.equal((await db.doc('settings/financialDay_all_'+today).get()).data().status,'CLOSED');assert.equal((await db.doc('settings/financialDay_all_'+date).get()).data().status,'CLOSED');
});
