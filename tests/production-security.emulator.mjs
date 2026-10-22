import test, { mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);
assert.equal(process.env.GCLOUD_PROJECT,'demo-el-mezaen-gate');
const req=createRequire(new URL('../functions/package.json',import.meta.url));
const {getAuth}=req('firebase-admin/auth'),{getFirestore,Timestamp}=req('firebase-admin/firestore'),{getMessaging}=req('firebase-admin/messaging');
const h=await import('../functions/src/index.js');
const {workerAccessHandlers,invitationHash}=await import('../functions/src/worker-access.js');
const db=getFirestore(),auth=getAuth(),messaging=getMessaging();
afterEach(()=>mock.restoreAll());
test('Worker registration status follows canonical pending state despite an old active claim',async()=>{
 const uid='sec-registration-state';await worker(uid,{active:false,accountStatus:'PENDING',accessOperation:{action:'username'}});
 assert.equal((await handlers.registerWorkerAccess(request(uid,{}))).status,'PENDING');
});
test('Password final Firestore commit failure remains closed and safely resumes',async()=>{
 const uid='sec-final-write'; await worker(uid); const run=db.runTransaction.bind(db);let writes=0;
 mock.method(db,'runTransaction',async(...args)=>{if(++writes===2)throw Object.assign(Error('FINAL_WRITE_OUTAGE'),{code:'unavailable'});return run(...args)});
 await assert.rejects(handlers.changeWorkerPassword(request(uid,{newPassword:'RecoveryPass123!'})));
 const pending=(await db.doc(`users/${uid}`).get()).data();assert.equal(pending.active,false);assert.equal(pending.accessOperation.action,'change-password');
 mock.restoreAll();await handlers.changeWorkerPassword(request(uid,{newPassword:'RecoveryPass123!'}));
 const ready=(await db.doc(`users/${uid}`).get()).data();assert.equal(ready.active,true);assert.equal(ready.mustChangePassword,false);assert.equal(ready.accessOperation,undefined);
});
const handlers=workerAccessHandlers({db,requireLiveAdmin:async()=>{},requireRecentAdmin:()=>{},rateLimit:async()=>{}});
const actor=uid=>({uid,token:{role:'worker',staffId:uid,branchIds:['talkha'],auth_time:Math.floor(Date.now()/1000)+5,firebase:{sign_in_provider:'password'}}});
const request=(uid,data)=>({auth:actor(uid),data,rawRequest:{ip:'127.0.0.1',headers:{}}});
async function worker(uid,extra={}){
 await auth.createUser({uid,email:`${uid}@workers.el-mezaen.invalid`,password:'TestPass123!',emailVerified:true});
 await auth.setCustomUserClaims(uid,{role:'worker',staffId:uid,branchIds:['talkha'],mustChangePassword:false,permissions:['attendance','tasks']});
 await db.doc(`users/${uid}`).set({role:'worker',staffId:uid,branchIds:['talkha'],active:true,accountStatus:'ACTIVE',mustChangePassword:false,...extra});
 await db.doc(`staff/${uid}`).set({active:true,userUid:uid,branchIds:['talkha']});
 return actor(uid);
}
const fail=()=>{throw Object.assign(Error('INJECTED_OUTAGE'),{code:'unavailable'})};
const event=(id,before,after,key)=>({id:key,params:{bookingId:id,taskId:id},data:{before,after}});
async function booking(id,staffId){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(Date.now()+14*60000).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));const ref=db.doc(`bookings/${id}`);await ref.set({staffId,branchId:'talkha',bookingDate:`${p.year}-${p.month}-${p.day}`,bookingTime:`${p.hour}:${p.minute}`,status:'confirmed'});return await ref.get();}
async function device(uid){await db.doc(`pushTokens/${uid}`).set({token:`fixture-${uid}`,uid,role:'worker',staffId:uid,branchIds:['talkha'],updatedAt:Timestamp.now()});}

test('Invitation recovers after claim-write failure without a second redemption or privilege escalation',async()=>{
 const uid='sec-invite',secret='s'.repeat(43);await auth.createUser({uid,email:'sec-invite@example.test',emailVerified:true});await db.doc('staff/sec-invite').set({active:true,branchIds:['talkha']});
 await db.doc(`workerInvitations/${invitationHash(secret)}`).set({status:'NEW',staffId:uid,branchIds:['talkha'],email:'sec-invite@example.test',expiresAt:Timestamp.fromMillis(Date.now()+60000)});
 mock.method(auth,'setCustomUserClaims',fail);await assert.rejects(handlers.redeemWorkerInvitation(request(uid,{secret})));
 assert.equal((await db.doc(`users/${uid}`).get()).data().active,false);mock.restoreAll();
 assert.equal((await handlers.redeemWorkerInvitation(request(uid,{secret,role:'admin'}))).status,'ACTIVE');assert.equal((await auth.getUser(uid)).customClaims.role,'worker');
 await assert.rejects(handlers.redeemWorkerInvitation(request('someone-else',{secret})));
});
test('Username/password partial failure closes worker access before credentials change',async()=>{
 await worker('sec-username');mock.method(auth,'setCustomUserClaims',fail);
 await assert.rejects(handlers.manageAccessAccount(request('admin-test',{uid:'sec-username',action:'username',username:'sec.new',temporaryPassword:'Temporary123!'})));
 const profile=(await db.doc('users/sec-username').get()).data();assert.equal(profile.active,false);assert.equal(profile.mustChangePassword,true);assert.ok(!JSON.stringify(profile).includes('Temporary123!'));mock.restoreAll();
 await handlers.manageAccessAccount(request('admin-test',{uid:'sec-username',action:'username',username:'sec.new',temporaryPassword:'Temporary123!'}));
 assert.equal((await auth.getUser('sec-username')).customClaims.mustChangePassword,true);assert.equal((await db.doc('users/sec-username').get()).data().username,'sec.new');
});
test('Own password partial failure remains closed and a fresh authenticated retry recovers',async()=>{
 await worker('sec-password');mock.method(auth,'revokeRefreshTokens',fail);await assert.rejects(handlers.changeWorkerPassword(request('sec-password',{newPassword:'Permanent123!'})));
 assert.equal((await db.doc('users/sec-password').get()).data().active,false);mock.restoreAll();
 await handlers.changeWorkerPassword(request('sec-password',{newPassword:'Permanent123!'}));assert.equal((await db.doc('users/sec-password').get()).data().active,true);assert.equal((await db.doc('users/sec-password').get()).data().mustChangePassword,false);
});
test('Duplicate reassignment event preserves notification read state',async()=>{
 await worker('sec-old');await worker('sec-new');const before=await booking('sec-reassign','sec-old');await db.doc('bookings/sec-reassign').update({staffId:'sec-new'});const after=await db.doc('bookings/sec-reassign').get();const e=event('sec-reassign',before,after,'sec-reassign-event');await h.syncWorkerBookingNotifications.run(e);
 const notes=await db.collection('workerNotifications').where('entityId','==','sec-reassign').get();const note=notes.docs.find(x=>x.data().staffId==='sec-old');assert.ok(note);await note.ref.update({read:true});await h.syncWorkerBookingNotifications.run(e);assert.equal((await note.ref.get()).data().read,true);
});
test('Booking push failure retries the durable existing notification',async()=>{
 await worker('sec-push');await device('sec-push');const after=await booking('sec-push-book','sec-push');const e=event('sec-push-book',null,after,'sec-push-event');let attempts=0;mock.method(messaging,'sendEachForMulticast',async()=>{attempts++;if(attempts===1)fail();return {successCount:1,responses:[{success:true}]};});
 await assert.rejects(h.syncWorkerBookingNotifications.run(e));await h.syncWorkerBookingNotifications.run(e);assert.equal(attempts,2);mock.restoreAll();
});
test('Reminder is not marked SENT before successful FCM acceptance',async()=>{
 await worker('sec-reminder');await device('sec-reminder');const after=await booking('sec-reminder-book','sec-reminder');mock.method(messaging,'sendEachForMulticast',async()=>({successCount:1,responses:[{success:true}]}));await h.syncWorkerBookingNotifications.run(event('sec-reminder-book',null,after,'sec-reminder-event'));mock.restoreAll();mock.method(messaging,'sendEachForMulticast',fail);
 await assert.rejects(h.remindWorkersBeforeBooking.run({}));assert.notEqual((await db.doc('workerBookingReminders/sec-reminder-book').get()).data().state,'SENT');mock.restoreAll();
});
test('Disabled or cross-branch worker devices receive no booking push',async()=>{
 await worker('sec-disabled');await auth.updateUser('sec-disabled',{disabled:true});await device('sec-disabled');const after=await booking('sec-disabled-book','sec-disabled');let attempts=0;mock.method(messaging,'sendEachForMulticast',async()=>{attempts++;return {successCount:1,responses:[{success:true}]};});await h.syncWorkerBookingNotifications.run(event('sec-disabled-book',null,after,'sec-disabled-event'));assert.equal(attempts,0);mock.restoreAll();
});
test('Task push failure can retry without marking delivery successful or resetting read state',async()=>{
 await worker('sec-task');await device('sec-task');const ref=db.doc('workerTasks/sec-task');await ref.set({assigneeStaffId:'sec-task',branchId:'talkha',status:'NEW',title:'QA'});const before=await ref.get();await ref.update({status:'SEEN'});const after=await ref.get();await db.doc('workerNotifications/task_update_sec-task_SEEN').set({staffId:'sec-task',branchId:'talkha',read:true});let attempts=0;mock.method(messaging,'sendEachForMulticast',async()=>{attempts++;if(attempts===1)fail();return {successCount:1,responses:[{success:true}]};});const e=event('sec-task',before,after,'sec-task-event');await assert.rejects(h.notifyWorkersOnTaskUpdate.run(e));await h.notifyWorkersOnTaskUpdate.run(e);assert.equal(attempts,2);mock.restoreAll();
});

test('Role edit Auth failure leaves the canonical worker closed and safely resumable',async()=>{
 const uid='sec-role';await worker(uid);await auth.createUser({uid:'sec-admin'});await auth.setCustomUserClaims('sec-admin',{role:'admin'});
 const r={auth:{uid:'sec-admin',token:{role:'admin',auth_time:Math.floor(Date.now()/1000)+5}},data:{uid,role:'worker',staffId:uid,branchIds:['talkha']},rawRequest:{ip:'127.0.0.1',headers:{}}};
 const original=auth.setCustomUserClaims.bind(auth);mock.method(auth,'setCustomUserClaims',async(target,claims)=>{if(target===uid)fail();return original(target,claims);});await assert.rejects(h.setUserRole.run(r));
 assert.equal((await db.doc(`users/${uid}`).get()).data().active,false);mock.restoreAll();await h.setUserRole.run(r);assert.equal((await db.doc(`users/${uid}`).get()).data().active,true);
});

test('Partial multicast retries only failed recipients and preserves read state',async()=>{
 const uid='sec-partial';await worker(uid);await device(uid);await db.doc('pushTokens/sec-partial-extra').set({token:'fixture-partial-two',uid,role:'worker',staffId:uid,branchIds:['talkha'],updatedAt:Timestamp.now()});
 const after=await booking('sec-partial-book',uid),e=event('sec-partial-book',null,after,'partial-event'),calls=[];
 mock.method(messaging,'sendEachForMulticast',async payload=>{calls.push(payload.tokens);return calls.length===1?{successCount:1,responses:[{success:true},{success:false,error:{code:'messaging/server-unavailable'}}]}:{successCount:1,responses:[{success:true}]};});
 await assert.rejects(h.syncWorkerBookingNotifications.run(e));const note=(await db.collection('workerNotifications').where('entityId','==','sec-partial-book').get()).docs[0];await note.ref.update({read:true});await h.syncWorkerBookingNotifications.run(e);
 assert.equal(calls[0].length,2);assert.equal(calls[1].length,1);assert.equal(calls[1][0],calls[0][1]);assert.equal((await note.ref.get()).data().read,true);assert.equal((await note.ref.get()).data().workerPush.accepted,2);mock.restoreAll();
});
test('A-B-A booking events use physical revision and cannot replay an obsolete identical assignment',async()=>{
 const uid='sec-aba';await worker(uid);const original=await booking('sec-aba-book',uid);await h.syncWorkerBookingNotifications.run(event('sec-aba-book',null,original,'aba-original'));
 await db.doc('bookings/sec-aba-book').update({staffId:'any'});await db.doc('bookings/sec-aba-book').update({staffId:uid});const current=await db.doc('bookings/sec-aba-book').get();
 await h.syncWorkerBookingNotifications.run(event('sec-aba-book',original,current,'aba-current'));const before=(await db.collection('workerNotifications').where('entityId','==','sec-aba-book').get()).size;
 await h.syncWorkerBookingNotifications.run(event('sec-aba-book',null,original,'aba-stale'));assert.equal((await db.collection('workerNotifications').where('entityId','==','sec-aba-book').get()).size,before);
});
test('Cancellation suppresses the retry of an earlier booking push',async()=>{
 const uid='sec-cancel';await worker(uid);await device(uid);const after=await booking('sec-cancel-book',uid),e=event('sec-cancel-book',null,after,'cancel-old');mock.method(messaging,'sendEachForMulticast',fail);await assert.rejects(h.syncWorkerBookingNotifications.run(e));mock.restoreAll();
 await db.doc('bookings/sec-cancel-book').update({status:'cancelled'});const cancelled=await db.doc('bookings/sec-cancel-book').get();let pushes=0;mock.method(messaging,'sendEachForMulticast',async()=>{pushes++;return {successCount:1,responses:[{success:true}]};});await h.syncWorkerBookingNotifications.run(e);assert.equal(pushes,0);await h.syncWorkerBookingNotifications.run(event('sec-cancel-book',after,cancelled,'cancel-new'));assert.equal((await db.doc('workerBookingReminders/sec-cancel-book').get()).exists,false);mock.restoreAll();
});
test('Repeated task status transitions produce separate events; duplicate preserves read state',async()=>{
 const uid='sec-repeat-task';await worker(uid);const ref=db.doc('workerTasks/sec-repeat-task');await ref.set({assigneeStaffId:uid,branchId:'talkha',status:'NEW',title:'QA'});
 let before=await ref.get(),lastEvent;
 for(const [index,status] of ['SEEN','IN_PROGRESS','SEEN'].entries()){await ref.update({status});const after=await ref.get();lastEvent=event('sec-repeat-task',before,after,'task-repeat-'+index);await h.notifyWorkersOnTaskUpdate.run(lastEvent);before=after;}
 const notes=await db.collection('workerNotifications').where('entityId','==','sec-repeat-task').get();assert.equal(notes.size,3);for(const note of notes.docs)await note.ref.update({read:true});await h.notifyWorkersOnTaskUpdate.run(lastEvent);assert.ok((await db.collection('workerNotifications').where('entityId','==','sec-repeat-task').get()).docs.every(d=>d.data().read));
});
test('Worker password gate blocks token registration and all private workspace access',async()=>{
 const uid='sec-gated';await worker(uid,{mustChangePassword:true});await auth.setCustomUserClaims(uid,{role:'worker',staffId:uid,branchIds:['talkha'],mustChangePassword:true});
 for(const name of ['getWorkerWorkspace','registerPushToken'])await assert.rejects(h[name].run(request(uid,{token:'fixture-never-register'})));
});
test('Revoked admin cannot authorize account changes even while the role claim still says admin',async()=>{
 const uid='sec-revoked-admin';await auth.createUser({uid});await auth.setCustomUserClaims(uid,{role:'admin'});await auth.revokeRefreshTokens(uid);
 await assert.rejects(h.createWorkerInvitation.run({auth:{uid,token:{role:'admin',auth_time:1}},data:{staffId:'sec-gated'},rawRequest:{ip:'127.0.0.1',headers:{}}}));
});
