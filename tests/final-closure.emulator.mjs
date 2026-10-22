import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);assert.equal(process.env.GCLOUD_PROJECT,'demo-el-mezaen-gate');
const req=createRequire(new URL('../functions/package.json',import.meta.url));const {getAuth}=req('firebase-admin/auth');const {getFirestore,Timestamp}=req('firebase-admin/firestore');const h=await import('../functions/src/index.js');const db=getFirestore(),auth=getAuth();
const now=()=>Math.floor(Date.now()/1000);const rawRequest={ip:'127.0.0.1',headers:{}};
const actor=(uid,role,staffId,branches=['talkha'])=>({uid,token:{role,staffId,branchIds:branches,auth_time:now(),firebase:{sign_in_provider:'password'}}});
const admin=actor('closure-admin','admin');const call=(name,a,data={})=>h[name].run({auth:a,data,rawRequest});let uid,worker;
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date()),month=today.slice(0,7);
const signIn=async(email,password)=>{const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});return {status:r.status,body:await r.json()};};
test('Isolated demo fixtures use canonical Talkha-only assignments',async()=>{
 await auth.createUser({uid:admin.uid,email:'closure-admin@example.test'});await auth.setCustomUserClaims(admin.uid,{role:'admin'});
 for(const role of ['cashier','manager']){await auth.createUser({uid:'closure-'+role});await auth.setCustomUserClaims('closure-'+role,{role,branchIds:['talkha']});}
 for(const id of ['talkha','mashaya'])await db.doc(`branches/${id}`).set({nameAr:id,active:true,openingTime:'11:00',closingTime:'23:00'});
 await db.doc('staff/closure-a').set({nameAr:'عامل اختبار أ',branchIds:['talkha'],active:true,monthlyTarget:1000});await db.doc('staff/closure-b').set({nameAr:'عامل اختبار ب',branchIds:['mashaya'],active:true,monthlyTarget:1000});
 await call('setWorkerMonthlyTarget',admin,{staffId:'closure-a',branchId:'talkha',month,targetAmount:1000});
 await call('setWorkerMonthlyTarget',admin,{staffId:'closure-b',branchId:'mashaya',month,targetAmount:1000});
 await db.doc('revenueLedger/closure-talkha').set({branchId:'talkha',dateKey:today,amount:300,workerBreakdown:{'closure-a':300}});await db.doc('expenses/closure-talkha').set({branchId:'talkha',dateKey:today,amount:25});
 await db.doc('bookings/closure-completed').set({branchId:'talkha',staffId:'closure-a',bookingDate:today,status:'completed'});
});
test('Admin creates username identity; role, branch, permissions stay server controlled',async()=>{
 const result=await call('createAdminUser',admin,{name:'عامل اختبار أ',username:' Closure.A ',password:'TempPass123!',role:'worker',staffId:'closure-a',branchIds:['talkha'],permissions:['users','revenue']});uid=result.uid;worker=actor(uid,'worker','closure-a');
 const u=await auth.getUser(uid),p=(await db.doc(`users/${uid}`).get()).data();assert.equal(u.email,'closure.a@workers.el-mezaen.invalid');assert.deepEqual(u.customClaims.branchIds,['talkha']);assert.equal(u.customClaims.role,'worker');assert.equal(u.customClaims.mustChangePassword,true);assert.ok(!u.customClaims.permissions.includes('users'));assert.equal(p.username,'closure.a');assert.equal(p.password,undefined);assert.equal(p.temporaryPassword,undefined);
});
test('Firebase Authentication accepts username-derived account and correct password',async()=>assert.equal((await signIn('closure.a@workers.el-mezaen.invalid','TempPass123!')).status,200));
test('Wrong worker password is denied by Firebase Auth',async()=>assert.equal((await signIn('closure.a@workers.el-mezaen.invalid','wrong')).status,400));
test('Temporary-password worker cannot open private workspace',async()=>await assert.rejects(call('getWorkerWorkspace',worker)));
test('Role or branch edit preserves the worker temporary password security gate',async()=>{
 await call('setUserRole',admin,{uid,role:'worker',staffId:'closure-a',branchIds:['talkha']});
 assert.equal((await auth.getUser(uid)).customClaims.mustChangePassword,true);
 await assert.rejects(call('getWorkerWorkspace',worker));
 // Role edits revoke the previous session. Reauthenticate exactly as the UI does;
 // reusing the synthetic creation token was a same-second timing dependency.
 const login=await signIn('closure.a@workers.el-mezaen.invalid','TempPass123!');
 assert.equal(login.status,200);
 worker={uid,token:await auth.verifyIdToken(login.body.idToken)};
});
test('Worker cannot create another role or access account control',async()=>{await assert.rejects(call('createAdminUser',worker,{role:'admin'}));await assert.rejects(call('getAccessAccountCenter',worker));});
test('Worker password change requires recent authentication',async()=>await assert.rejects(call('changeWorkerPassword',{...worker,token:{...worker.token,auth_time:1}},{newPassword:'PermanentPass123!'})));
test('Own password change clears gate, revokes sessions, and leaves no password in Firestore',async()=>{
 await call('changeWorkerPassword',worker,{newPassword:'PermanentPass123!',uid:'closure-admin'});const u=await auth.getUser(uid),p=(await db.doc(`users/${uid}`).get()).data();assert.equal(u.customClaims.mustChangePassword,false);assert.equal(p.mustChangePassword,false);assert.equal(p.password,undefined);assert.ok(u.tokensValidAfterTime);assert.equal((await signIn(u.email,'PermanentPass123!')).status,200);assert.equal((await signIn(u.email,'TempPass123!')).status,400);
});
test('Worker A cannot impersonate Worker B via request fields or claims',async()=>{
 const token=(await signIn('closure.a@workers.el-mezaen.invalid','PermanentPass123!')).body.idToken;const decoded=await auth.verifyIdToken(token);worker={uid,token:decoded};const own=await call('getWorkerWorkspace',worker,{staffId:'closure-b',branchId:'mashaya'});assert.equal(own.staff.id,'closure-a');await assert.rejects(call('getWorkerWorkspace',{uid,token:{...decoded,staffId:'closure-b'}}));
});
test('Duplicate username rejected without linking a second staff account',async()=>{
 await db.doc('staff/closure-c').set({branchIds:['talkha'],active:true});await assert.rejects(call('createAdminUser',admin,{name:'نسخة',username:'closure.a',password:'TempPass123!',role:'worker',staffId:'closure-c',branchIds:['talkha']}));assert.equal((await db.doc('staff/closure-c').get()).data().userUid,undefined);
});
test('Cashier Talkha and manager cannot request Mashaya operational data',async()=>{
 for(const role of ['cashier','manager'])for(const name of ['getAdminDashboard','getBusinessDashboard','getWorkerLeaderboard'])await assert.rejects(call(name,actor('closure-'+role,role,null),{branchId:'mashaya',month}));
});
test('Admin Mashaya dashboard and business views contain no Talkha data',async()=>{
 const dashboard=await call('getAdminDashboard',admin,{branchId:'mashaya'}),business=await call('getBusinessDashboard',admin,{branchId:'mashaya',month});assert.equal(dashboard.stats.todayRevenue,0);assert.equal(business.stats.grossRevenue,0);assert.equal(business.expenses.length,0);assert.ok(business.payroll.every(r=>r.branchIds.includes('mashaya')));
});
test('Scoped Admin collection queries filter before pagination',async()=>{
 const rows=await call('getAdminCollection',admin,{collection:'staff',branchId:'mashaya'});assert.ok(rows.items.every(r=>r.branchIds.includes('mashaya')));assert.ok(!rows.items.some(r=>r.id==='closure-a'));
});
test('Leaderboard respects branch and ignores forged client target/rank',async()=>{
 const result=await call('getWorkerLeaderboard',admin,{branchId:'talkha',month,rank:1,target:1,achieved:999999});const a=result.rows.find(r=>r.staffId==='closure-a');assert.equal(a.target,1000);assert.equal(a.achieved,300);assert.equal(a.achievementPercent,30);assert.equal(a.completedBookings,1);assert.ok(!result.rows.some(r=>r.staffId==='closure-b'));
});
test('Completed task refreshes ranking activity without adding financial revenue',async()=>{
 await db.doc('workerTasks/closure-task').set({assigneeStaffId:'closure-a',branchId:'talkha',status:'IN_PROGRESS',title:'اختبار',createdAt:Timestamp.now()});await call('updateWorkerTask',worker,{taskId:'closure-task',status:'DONE'});const a=(await call('getWorkerLeaderboard',admin,{branchId:'talkha',month})).rows.find(r=>r.staffId==='closure-a');assert.equal(a.completedTasks,1);assert.equal(a.achieved,300);
});
test('Admin explicit all-branch leaderboard aggregates actual attribution',async()=>{
 const rows=(await call('getWorkerLeaderboard',admin,{branchId:'all',month})).rows;
 assert.equal(rows.find(r=>r.staffId==='closure-a').achieved,300);
 assert.ok(rows.some(r=>r.staffId==='closure-b'));
});
test('Secondary financial attribution matches worker workspace and branch ranking',async()=>{
 await db.doc('revenueLedger/closure-secondary').set({branchId:'talkha',dateKey:today,staffId:'closure-c',amount:75,workerBreakdown:{'closure-a':50,'closure-c':25}});
 await db.doc('revenueLedger/closure-foreign').set({branchId:'mashaya',dateKey:today,staffId:'closure-b',amount:900,workerBreakdown:{'closure-a':900}});
 const own=await call('getWorkerWorkspace',worker),row=(await call('getWorkerLeaderboard',admin,{branchId:'talkha',month})).rows.find(r=>r.staffId==='closure-a');
 assert.equal(own.target.achieved,350);assert.equal(row.achieved,350);
});
test('Cashier cannot create a cross-branch worker task',async()=>await assert.rejects(call('createWorkerTask',actor('closure-cashier','cashier',null),{assigneeStaffId:'closure-b',branchId:'mashaya',title:'forbidden'})));
test('Manager stale branch claims and disabled live account cannot read operations',async()=>{
 const a=actor('closure-manager','manager',null);await auth.setCustomUserClaims(a.uid,{role:'manager',branchIds:['mashaya']});await assert.rejects(call('getAdminDashboard',a,{branchId:'talkha'}));
 await auth.setCustomUserClaims(a.uid,{role:'manager',branchIds:['talkha']});await auth.updateUser(a.uid,{disabled:true});await assert.rejects(call('getAdminDashboard',a,{branchId:'talkha'}));
});
test('Disabled worker cannot sign in or access workspace',async()=>{
 await call('manageAccessAccount',admin,{uid,action:'disable'});assert.equal((await signIn('closure.a@workers.el-mezaen.invalid','PermanentPass123!')).status,400);await assert.rejects(call('getWorkerWorkspace',worker));
});
test('Unauthenticated operational reads and password writes are rejected',async()=>{
 for(const name of ['getWorkerLeaderboard','getBusinessDashboard','getWorkerWorkspace','changeWorkerPassword'])await assert.rejects(call(name,null,{newPassword:'not-allowed'}));
});

test('Monthly worker target stays locked after first save and cashier cannot set branch target',async()=>{await assert.rejects(call('setWorkerMonthlyTarget',admin,{staffId:'closure-a',branchId:'talkha',month,targetAmount:2000}),e=>e.code==='already-exists');await assert.rejects(call('setBranchMonthlyTarget',actor('closure-cashier','cashier',null),{branchId:'talkha',month,targetAmount:2000}),e=>e.code==='permission-denied');assert.equal((await db.doc('staff/closure-a').get()).data().monthlyTargets[month].talkha.targetAmount,1000);});
