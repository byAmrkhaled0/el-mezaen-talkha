import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
import {cairoAppointmentMillis} from '../functions/src/worker-reminders.js';
assert.equal(process.env.GCLOUD_PROJECT,'demo-el-mezaen-gate');assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8087');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9097');
const require=createRequire(new URL('../functions/package.json',import.meta.url)),h=await import('../functions/src/index.js');const {getAuth}=require('firebase-admin/auth'),{getFirestore,Timestamp}=require('firebase-admin/firestore'),db=getFirestore(),auth=getAuth();
const hash=s=>createHash('sha256').update(s).digest('hex'),actors={},rawRequest={ip:'127.0.0.1',headers:{}},gps={branchId:'talkha',latitude:31.05,longitude:31.38,accuracy:10};
const call=(name,role,data={})=>h[name].run({auth:actors[role],data,rawRequest});
test('isolated linked identities for all three employee roles and live admin',async()=>{
 await db.doc('branches/talkha').set({active:true,nameAr:'فرع اختبار',latitude:31.05,longitude:31.38,attendanceRadiusMeters:100});
 for(const role of ['admin','worker','cashier','manager']){const uid='lifecycle-'+role,claims={role,branchIds:['talkha'],permissions:role==='worker'?['attendance','tasks']:role==='manager'?['attendance']:[],...(role==='worker'?{staffId:'lifecycle-worker-profile'}:{})};await auth.createUser({uid,email:uid+'@qa.example.test',password:'Local-only-2026!'});await auth.setCustomUserClaims(uid,claims);await db.doc('users/'+uid).set({...claims,name:'حساب '+role,active:true});actors[role]={uid,token:{...claims,auth_time:Math.ceil(Date.now()/1000)}};}
 await db.doc('staff/lifecycle-worker-profile').set({userUid:actors.worker.uid,nameAr:'عامل اختبار',active:true,branchIds:['talkha']});
});
test('only live admin sets a bounded duration, with optimistic version checks',async()=>{
 for(const role of ['worker','cashier','manager'])await assert.rejects(call('setAttendancePolicy',role,{uid:actors[role].uid,durationMinutes:480,expectedVersion:0}));
 for(const value of [0,1441,8.5,NaN])await assert.rejects(call('setAttendancePolicy','admin',{uid:actors.worker.uid,durationMinutes:value,expectedVersion:0}));
 await assert.rejects(call('recordOwnStaffAttendance','cashier',{...gps,action:'checkIn'}));
 for(const role of ['worker','cashier','manager'])await call('setAttendancePolicy','admin',{uid:actors[role].uid,durationMinutes:480,expectedVersion:0});
 await assert.rejects(call('setAttendancePolicy','admin',{uid:actors.worker.uid,durationMinutes:360,expectedVersion:0}));
 const list=await call('getAttendancePolicies','admin',{role:'worker'});assert.equal(list.items[0].durationMinutes,480);
});
test('all employee roles start server-timed sessions; duplicates do not create extra records',async()=>{
 for(const role of ['worker','cashier','manager']){const endpoint=role==='worker'?'recordWorkerAttendance':'recordOwnStaffAttendance';const results=await Promise.all(Array.from({length:3},()=>call(endpoint,role,{...gps,action:'checkIn'})));assert.equal(results.filter(x=>!x.idempotent).length,1);const own=await call('getOwnStaffAttendance',role);assert.equal(own.attendance.plannedMinutes,480);assert.equal(Date.parse(own.attendance.scheduledEndAt)-Date.parse(own.attendance.startedAt),8*3600000);}
 await call('setAttendancePolicy','admin',{uid:actors.worker.uid,durationMinutes:360,expectedVersion:1});const worker=await call('getOwnStaffAttendance','worker');assert.equal(worker.durationMinutes,360);assert.equal(worker.attendance.plannedMinutes,480);
});
test('manual checkout is independent of cash shifts and records elapsed server seconds',async()=>{
 await call('recordOwnStaffAttendance','manager',{...gps,action:'checkOut'});const own=await call('getOwnStaffAttendance','manager');assert.equal(own.attendance.endReason,'MANUAL');assert.ok(own.attendance.workedSeconds>=0);assert.equal((await db.collection('cashShifts').get()).size,0);
});
test('scheduler closes overdue worker at its exact planned end and persists one notification',async()=>{
 const uid=actors.worker.uid,queue=db.doc('attendanceShiftQueue/'+hash(uid).slice(0,32)),q=(await queue.get()).data(),ref=db.doc(q.recordPath),end=Date.now()-2000,start=end-8*3600000;
 await ref.update({startedAt:Timestamp.fromMillis(start),checkInAt:Timestamp.fromMillis(start),scheduledEndAt:Timestamp.fromMillis(end)});await queue.update({dueAt:Timestamp.fromMillis(end),startedAt:Timestamp.fromMillis(start)});
 await Promise.all([h.finishAttendanceShifts.run({}),h.finishAttendanceShifts.run({})]);
 const row=(await ref.get()).data();assert.equal(row.status,'CHECKED_OUT');assert.equal(row.workedSeconds,28800);assert.equal(row.endReason,'DURATION_COMPLETED');assert.equal(row.endedAt.toMillis(),end);assert.equal(row.exitLocationConfirmed,false);
 assert.equal((await db.collection('attendanceShiftNotifications').where('uid','==',uid).get()).size,1);
 assert.equal((await db.collection('activityLogs').where('action','==','attendance-duration-completed').get()).size,1);
 assert.equal((await call('getOwnStaffAttendance','cashier')).attendance.status,'PRESENT');
 const own=await call('getOwnStaffAttendance','worker');assert.equal(own.attendance.endReason,'DURATION_COMPLETED');assert.equal((await db.collection('cashShifts').get()).size,0);
});
test('personal month history cannot be redirected to another employee',async()=>{
 const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit'}).format(new Date());
 await assert.rejects(call('getAttendanceMonth','cashier',{uid:actors.worker.uid,month}));await assert.rejects(call('getAttendancePolicies','manager',{}));await assert.rejects(call('getAttendanceMonth','worker',{month:'2026-13'}));
 const result=await call('getAttendanceMonth','worker',{month});assert.equal(result.rows.length,1);assert.equal(result.rows[0].workedSeconds,28800);assert.equal(result.rows[0].locationEvidence,undefined);assert.equal(result.rows[0].userId,undefined);
});
test('monthly totals split cross-month hours and preserve unknown legacy rows',async()=>{
 const uid='month-fixture';const row=async(id,date,start,end)=>db.doc('attendanceDays/'+id).set({userId:uid,dateKey:date,branchId:'talkha',status:'CHECKED_OUT',startedAt:Timestamp.fromMillis(start),endedAt:Timestamp.fromMillis(end),workedSeconds:(end-start)/1000,recordVersion:2,endReason:'DURATION_COMPLETED'});
 await row('month-before','2026-09-30',cairoAppointmentMillis('2026-09-30','23:00'),cairoAppointmentMillis('2026-10-01','03:00'));
 await row('month-after','2026-10-31',cairoAppointmentMillis('2026-10-31','23:00'),cairoAppointmentMillis('2026-11-01','02:00'));
 await db.doc('attendanceDays/month-legacy').set({userId:uid,dateKey:'2026-10-05',branchId:'talkha',status:'CHECKED_OUT'});
 const month=await call('getAttendanceMonth','admin',{uid,month:'2026-10'});assert.equal(month.rows.length,3);assert.equal(month.summary.recordedSeconds,4*3600);assert.equal(month.summary.unknown,1);assert.equal(month.rows.find(r=>r.id==='month-before').carryOver,true);
});
test('overnight manual checkout uses the original session and leaves the cash drawer untouched',async()=>{
 const uid=actors.cashier.uid,queue=db.doc('attendanceShiftQueue/'+hash(uid).slice(0,32)),q=(await queue.get()).data(),old=db.doc(q.recordPath),record=(await old.get()).data();
 const previousDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-86400000));
 const ref=db.doc('attendanceDays/'+previousDate+'_'+record.staffId),start=Date.now()-3600000;
 await ref.set({...record,dateKey:previousDate,startedAt:Timestamp.fromMillis(start),checkInAt:Timestamp.fromMillis(start),scheduledEndAt:Timestamp.fromMillis(start+8*3600000)});await old.delete();
 await queue.update({recordPath:ref.path,startedAt:Timestamp.fromMillis(start),dueAt:Timestamp.fromMillis(start+8*3600000)});
 const drawer=db.doc('cashShifts/attendance-preservation-fixture'),before={status:'OPEN',openingBalance:900,branchId:'talkha'};await drawer.set(before);
 const own=await call('getOwnStaffAttendance','cashier');assert.equal(own.attendance.status,'PRESENT');
 await call('recordOwnStaffAttendance','cashier',{...gps,action:'checkOut'});
 const ended=(await ref.get()).data();assert.equal(ended.status,'CHECKED_OUT');assert.equal(ended.endReason,'MANUAL');assert.ok(ended.workedSeconds>=3600&&ended.workedSeconds<3660);assert.deepEqual((await drawer.get()).data(),before);
});

test('inactive accounts and GPS/identity tampering are denied after the new lifecycle is enabled',async()=>{
 await assert.rejects(call('recordOwnStaffAttendance','cashier',{...gps,action:'checkOut',uid:actors.worker.uid}));await assert.rejects(call('recordOwnStaffAttendance','cashier',{...gps,latitude:30,action:'checkOut'}));
 await auth.updateUser(actors.cashier.uid,{disabled:true});await assert.rejects(call('getAttendanceMonth','cashier',{month:'2026-10'}));await assert.rejects(call('recordOwnStaffAttendance','cashier',{...gps,action:'checkOut'}));
});
