import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
assert.equal(process.env.GCLOUD_PROJECT,'demo-el-mezaen-verify');
assert.equal(process.env.FUNCTIONS_EMULATOR,'true');
for(const k of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'])assert.match(process.env[k],/^127\.0\.0\.1:\d+$/);
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {getFirestore,AggregateField}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
const h=await import('../functions/src/index.js');const db=getFirestore(),auth=getAuth(),actors={};
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const oldDate='2026-09-01';let seq=0;const key=()=>`f2-local-request-${++seq}`;
const call=(name,data,role='admin')=>h[name].run({auth:actors[role],data,rawRequest:{ip:'127.0.0.1',headers:{}}});
const input=(extra={})=>({branchId:'talkha',dateKey:today,amount:100,category:'other',description:'مصروف محلي',paymentMethod:'instapay',idempotencyKey:key(),...extra});
const create=(extra={},role='admin')=>call('recordExpense',input(extra),role);
const edit=(id,extra={})=>call('updateExpense',{id,...input(extra)});
const del=id=>call('adminSecureDelete',{kind:'expense',id,reason:'تصحيح اختباري محلي'});
const close=(branchId='talkha',businessDate=today)=>call('closeBusinessDay',{branchId,businessDate,actualCash:0,reason:'إقفال محلي',idempotencyKey:key()});
const guard=(branch='talkha',date=today)=>db.doc(branch==='all'?`settings/financialDay_all_${date}`:`cashShiftState/${branch}`);
const version=async(branch='talkha',date=today)=>Number((await guard(branch,date).get()).data()?.financialPostingVersion||0);
const audits=async(action)=> (await db.collection('activityLogs').where('action','==',action).get()).size;
const total=async(branch='talkha',date=today)=>(await db.collection('expenses').where('branchId','==',branch).where('dateKey','==',date).aggregate({amount:AggregateField.sum('amount')}).get()).data().amount;
async function gate(marker,loser,winner){
 const original=db.runTransaction.bind(db);let hit,release,armed=true,timer;const ready=new Promise(r=>hit=r),wait=new Promise(r=>release=r);
 db.runTransaction=(cb,...opts)=>original(async tx=>{if(armed&&cb.toString().includes(marker)){armed=false;hit();await wait;}return cb(tx);},...opts);
 const pending=loser();pending.catch(()=>{});
 try {await Promise.race([ready,new Promise((_,rej)=>timer=setTimeout(()=>rej(Error('race gate timeout')),12000))]);const first=await winner();release();return{first,second:await pending.catch(error=>({error}))};}
 finally{clearTimeout(timer);release();db.runTransaction=original;}
}
const fail=code=>e=>e.code===code;
async function seed(id,row){await db.doc('expenses/'+id).set({...input(),idempotencyKey:null,createdBy:actors.admin.uid,...row});return id;}
async function closedBranches(date=today){for(const b of ['talkha','mashaya'])await db.doc(`dailyClosings/${b}_${date}`).set({branchId:b,businessDate:date,status:'CLOSED',expenses:0,netSales:1000});}
before(async()=>{
 for(const [role,branches,permissions] of [['admin',['talkha','mashaya'],[]],['manager',['talkha'],['expenses','revenue']],['cashier',['talkha'],['pos']],['worker',['talkha'],[]]]){
  const uid='f2-'+role,email=uid+'@example.test';await auth.createUser({uid,email,password:'SyntheticLocal123!'});const claims={role,branchIds:branches,permissions,mustChangePassword:false};await auth.setCustomUserClaims(uid,claims);
  const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'SyntheticLocal123!',returnSecureToken:true})});assert.equal(r.status,200);actors[role]={uid,token:await auth.verifyIdToken((await r.json()).idToken)};
 }
});
beforeEach(async()=>{
 const r=await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-el-mezaen-verify/databases/(default)/documents`,{method:'DELETE'});assert.equal(r.status,200);
 for(const [role,a] of Object.entries(actors))await db.doc('users/'+a.uid).set({...a.token,role,active:true});
 for(const b of ['talkha','mashaya'])await db.doc('branches/'+b).set({active:true,nameAr:b});
 await db.doc('settings/public').set({cashDrawerEnabled:true});
});
after(async()=>db.terminate());

test('supported noncash methods coordinate without requiring or mutating physical drawers',async()=>{
 for(const method of ['instapay','vodafone_cash','other'])await create({paymentMethod:method});
 assert.equal(await version(),3);assert.equal(await total(),300);assert.equal((await db.collection('cashMovements').get()).size,0);assert.equal((await db.collection('cashShifts').get()).size,0);assert.equal((await guard('mashaya').get()).exists,false);
});
test('ordinary card and shared creation remain rejected under existing payment/scope validation',async()=>{await assert.rejects(create({paymentMethod:'card'}),fail('invalid-argument'));await assert.rejects(create({branchId:'all'}),fail('invalid-argument'));assert.equal(await version(),0);});
test('F02 expense-first rejects stale closing then explicit fresh close includes 100 exactly once',async()=>{
 const r=await gate('stateBeforeAggregation.updateTime',()=>close(),()=>create());assert.equal(r.second.error.code,'aborted');assert.equal((await db.doc('dailyClosings/talkha_'+today).get()).exists,false);assert.equal(await total(),100);assert.equal(await version(),1);
 const c=await close();assert.equal(c.closing.expenses,100);assert.equal(await audits('close-business-day'),1);assert.equal(await audits('record-expense'),1);
 fs.writeFileSync(process.env.F2_RACE_EVIDENCE||new URL('../qa/delivery-f2-race-evidence.json',import.meta.url),JSON.stringify({node:process.version,expenseFirst:{closingAborted:r.second.error.code,expenseTotal:100,freshClosingTotal:c.closing.expenses,guardIncrement:1},realFirestoreTransactions:true},null,2));
});
test('closing-first rejects expense atomically without expense guard or audit writes',async()=>{
 const r=await gate('const existingExpense = await transaction.get(expenseRef)',()=>create(),()=>close());assert.equal(r.second.error.code,'failed-precondition');assert.equal(await total(),0);assert.equal((await guard().get()).exists,false);assert.equal(await audits('record-expense'),0);
});
test('cash drawer disabled still invalidates closing without cash movement',async()=>{
 await db.doc('settings/public').set({cashDrawerEnabled:false});const r=await gate('stateBeforeAggregation.updateTime',()=>close(),()=>create({paymentMethod:'cash'}));assert.equal(r.second.error.code,'aborted');assert.equal(await version(),1);assert.equal((await db.collection('cashMovements').get()).size,0);assert.equal((await db.collection('cashShifts').get()).size,0);
});
test('cash open shift keeps balance movement audit and guard atomic and idempotent',async()=>{
 const shift=await call('openCashShift',{branchId:'talkha',openingCash:1000,idempotencyKey:key()});const data=input({paymentMethod:'cash'});const results=await Promise.all([call('recordExpense',data),call('recordExpense',data)]);assert.equal(results.filter(r=>r.idempotent).length,1);
 const s=(await db.doc('cashShifts/'+shift.shiftId).get()).data();assert.equal(s.cashOut,100);assert.equal(s.expectedCash,900);assert.equal(await version(),1);assert.equal((await db.collection('cashMovements').get()).size,1);assert.equal(await audits('record-expense'),1);
 await call('closeCashShift',{branchId:'talkha',actualCash:900,reason:'محلي',idempotencyKey:key()});const c=await close();assert.equal(c.closing.expenses,100);assert.equal(c.closing.cashOut,100);
});
for(const mutation of ['edit','delete'])test(`${mutation}-first invalidates precomputed branch expense total`,async()=>{
 const id=await seed('source',{amount:100});const r=await gate('stateBeforeAggregation.updateTime',()=>close(),()=>mutation==='edit'?edit(id,{amount:250}):del(id));assert.equal(r.second.error.code,'aborted');assert.equal(await version(),1);assert.equal((await close()).closing.expenses,mutation==='edit'?250:0);
});
for(const mutation of ['edit','delete'])test(`closing-first rejects ${mutation} without partial mutations`,async()=>{
 const id=await seed('source',{amount:100});const before=(await db.doc('expenses/'+id).get()).data();const r=await gate(mutation==='edit'?'const snapshot = await transaction.get(expenseRef)':'const expenseSnapshot = await transaction.get(expenseRef)',()=>mutation==='edit'?edit(id,{amount:250}):del(id),()=>close());assert.equal(r.second.error.code,'failed-precondition');assert.deepEqual((await db.doc('expenses/'+id).get()).data(),before);assert.equal(await version(),0);assert.equal(await audits(mutation==='edit'?'update-expense':'secure-delete-expense'),0);
});
test('branch move coordinates both guards and correct old/new totals',async()=>{
 const id=await seed('move',{amount:100});const r=await gate('stateBeforeAggregation.updateTime',()=>close('mashaya'),()=>edit(id,{branchId:'mashaya',amount:150}));assert.equal(r.second.error.code,'aborted');assert.equal(await version('talkha'),1);assert.equal(await version('mashaya'),1);assert.equal(await total('talkha'),0);assert.equal((await close('mashaya')).closing.expenses,150);
});
test('same-branch date move deduplicates coordination reference',async()=>{const id=await seed('date-move',{dateKey:oldDate});await edit(id,{dateKey:today});assert.equal(await version(),1);assert.equal(await total('talkha',oldDate),0);assert.equal(await total(),100);});
for(const which of ['old-branch','new-branch','old-date','new-date'])test(`${which} closed period rejects attribution move atomically`,async()=>{
 const dateMove=which.endsWith('date');const old={branchId:'talkha',dateKey:dateMove?oldDate:today},next={branchId:dateMove?'talkha':'mashaya',dateKey:today};const id=await seed('closed-move',old);const b=which.startsWith('old')?old:next;await db.doc(`dailyClosings/${b.branchId}_${b.dateKey}`).set({status:'CLOSED'});await assert.rejects(edit(id,next),fail('failed-precondition'));assert.equal(await version('talkha'),0);assert.equal(await version('mashaya'),0);assert.equal((await db.doc('expenses/'+id).get()).data().branchId,'talkha');
});
for(const mutation of ['edit','delete'])test(`shared ${mutation}-first invalidates independent shared closing`,async()=>{
 await closedBranches(oldDate);const id=await seed('legacy-shared',{branchId:'all',dateKey:oldDate,amount:100});const r=await gate('guard.updateTime.isEqual',()=>close('all',oldDate),()=>mutation==='edit'?edit(id,{dateKey:today,amount:150}):del(id));assert.equal(r.second.error.code,'aborted');assert.equal(await version('all',oldDate),1);assert.equal(await total('all',oldDate),0);assert.equal((await close('all',oldDate)).closing.consolidated.expenses,0);if(mutation==='edit')assert.equal(await version(),1);
});
for(const mutation of ['edit','delete'])test(`shared closing-first preserves legacy expense and guard`,async()=>{
 await closedBranches(oldDate);const id=await seed('legacy-shared',{branchId:'all',dateKey:oldDate,amount:100});const r=await gate(mutation==='edit'?'const snapshot = await transaction.get(expenseRef)':'const expenseSnapshot = await transaction.get(expenseRef)',()=>mutation==='edit'?edit(id):del(id),()=>close('all',oldDate));assert.equal(r.second.error.code,'failed-precondition');assert.equal(await total('all',oldDate),100);assert.equal(await version('all',oldDate),1);assert.equal(await version(),0);assert.equal(r.first.closing.consolidated.expenses,100);
});
test('concurrent independent expenses preserve every coordination increment',async()=>{await Promise.all(Array.from({length:6},(_,i)=>create({amount:10+i})));assert.equal(await version(),6);assert.equal(await total(),75);assert.equal(await audits('record-expense'),6);});
test('identical concurrent expense requests create one expense audit and increment',async()=>{const data=input();const r=await Promise.all(Array.from({length:4},()=>call('recordExpense',data)));assert.equal(new Set(r.map(x=>x.id)).size,1);assert.equal(await version(),1);assert.equal(await audits('record-expense'),1);await close();assert.equal((await call('recordExpense',data)).idempotent,true);assert.equal(await version(),1);});
test('inventory create edit delete valuation and financial guard stay atomic',async()=>{
 await db.doc('inventoryItems/item').set({branchId:'talkha',stockQty:10,costPrice:10});const x=await create({category:'inventory',inventoryItemId:'item',stockQuantity:10,amount:200});assert.equal((await db.doc('inventoryItems/item').get()).data().stockQty,20);assert.equal((await db.doc('inventoryItems/item').get()).data().costPrice,15);
 await edit(x.id,{category:'inventory',inventoryItemId:'item',stockQuantity:5,amount:100});assert.equal((await db.doc('inventoryItems/item').get()).data().stockQty,15);assert.equal((await db.doc('inventoryItems/item').get()).data().costPrice,13.33);await del(x.id);assert.equal((await db.doc('inventoryItems/item').get()).data().stockQty,10);assert.equal(await version(),3);assert.equal((await db.doc('stockMovements/purchase_'+x.id).get()).exists,false);
});
test('inventory precondition failure rolls back guard expense and audit',async()=>{
 await db.doc('inventoryItems/item').set({branchId:'talkha',stockQty:0,costPrice:10});const id=await seed('used-stock',{category:'inventory',inventoryItemId:'item',stockQuantity:10});await assert.rejects(del(id),fail('failed-precondition'));assert.equal(await version(),0);assert.equal(await audits('secure-delete-expense'),0);assert.equal((await db.doc('expenses/'+id).get()).exists,true);
});
test('server permissions reject worker cashier cross-branch manager revoked admin and generic bypass',async()=>{
 await assert.rejects(create({},'worker'),fail('permission-denied'));await assert.rejects(create({},'cashier'),fail('permission-denied'));await assert.rejects(create({branchId:'mashaya'},'manager'),fail('permission-denied'));await assert.rejects(call('adminSecureDelete',{kind:'expense',id:'x',reason:'test'},'manager'),fail('permission-denied'));
 for(const name of ['adminUpsert','adminDelete'])await assert.rejects(call(name,{collection:'expenses',id:'x',data:input()}),fail('invalid-argument'));
 await db.doc('users/'+actors.admin.uid).update({active:false});await assert.rejects(create(),e=>['permission-denied','unauthenticated'].includes(e.code));assert.equal(await version(),0);
});
test('payroll-linked and cash-linked expenses remain immutable through ordinary paths',async()=>{
 for(const [id,extra] of [['payroll',{payrollPaymentId:'p'}],['cash',{cashMovementId:'m'}]]){await seed(id,extra);await assert.rejects(edit(id),fail('failed-precondition'));}
 await db.doc('payrollPayments/p').set({postingVersion:2});await assert.rejects(del('payroll'),fail('failed-precondition'));await assert.rejects(del('cash'),fail('failed-precondition'));assert.equal(await version(),0);
});
