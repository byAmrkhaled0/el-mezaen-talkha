import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
assert.equal(process.env.GCLOUD_PROJECT,'demo-el-mezaen-gate');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9097');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8087');
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const h=await import('../functions/src/index.js');
const {getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore');
const auth=getAuth(),db=getFirestore(),rawRequest={ip:'127.0.0.1',headers:{}};
const actors={};
const data={action:'checkIn',branchId:'talkha',latitude:31.05,longitude:31.38,accuracy:10};
const call=(name,role,payload={})=>h[name].run({auth:actors[role],data:payload,rawRequest});
test('synthetic manager/cashier identities and branch GPS, no production resources',async()=>{
  await db.doc('branches/talkha').set({nameAr:'فرع محلي',active:true,latitude:31.05,longitude:31.38,attendanceRadiusMeters:100});
  for(const role of ['cashier','manager']){
    const uid=`own-attendance-${role}`,claims={role,branchIds:['talkha'],permissions:[]};
    await auth.createUser({uid,email:`${uid}@qa.example.test`,password:'Local-only-2026!'});
    await auth.setCustomUserClaims(uid,claims);
    await db.doc(`users/${uid}`).set({...claims,name:'حضور محلي',active:true});
    await db.doc('attendancePolicies/'+createHash('sha256').update(uid).digest('hex').slice(0,32)).set({uid,durationMinutes:480,version:1});
    actors[role]={uid,token:{...claims,auth_time:Math.ceil(Date.now()/1000)}};
  }
});
test('concurrent repeated cashier arrival creates one attendance and one audit event',async()=>{
  const result=await Promise.all(Array.from({length:6},()=>call('recordOwnStaffAttendance','cashier',data)));
  assert.equal(result.filter(x=>!x.idempotent).length,1);
  const records=await db.collection('attendanceDays').where('userId','==',actors.cashier.uid).get();assert.equal(records.size,1);
  const audits=await db.collection('activityLogs').where('action','==','staff-self-check-in').get();assert.equal(audits.size,1);
  assert.equal((await call('getOwnStaffAttendance','cashier')).attendance.status,'PRESENT');
  const out=await Promise.all(Array.from({length:3},()=>call('recordOwnStaffAttendance','cashier',{...data,action:'checkOut'})));
  assert.equal(out.filter(x=>!x.idempotent).length,1);
  assert.equal((await call('getOwnStaffAttendance','cashier')).attendance.status,'CHECKED_OUT');
});
test('manager has isolated personal record and appears in existing attendance dashboard',async()=>{
  assert.equal((await call('getOwnStaffAttendance','manager')).attendance,null);
  await call('recordOwnStaffAttendance','manager',data);
  actors.manager.token.permissions=['attendance'];
  await auth.setCustomUserClaims(actors.manager.uid,{role:'manager',branchIds:['talkha'],permissions:['attendance']});
  const result=await call('getAttendanceDashboard','manager',{branchId:'talkha'});
  assert.ok(result.rows.some(x=>x.accountRole==='manager'&&x.status==='PRESENT'));
  assert.ok(result.rows.some(x=>x.accountRole==='cashier'&&x.status==='CHECKED_OUT'));
  assert.equal(result.presentCount,1);
});
test('GPS/branch tampering and disabled account fail without changing attendance',async()=>{
  await assert.rejects(call('recordOwnStaffAttendance','manager',{...data,branchId:'mashaya'}));
  await assert.rejects(call('recordOwnStaffAttendance','manager',{...data,latitude:30}));
  await assert.rejects(call('recordOwnStaffAttendance','manager',{...data,userId:actors.cashier.uid}));
  await auth.updateUser(actors.manager.uid,{disabled:true});
  await assert.rejects(call('getOwnStaffAttendance','manager'));
  const records=await db.collection('attendanceDays').get();assert.equal(records.size,2);
});
test('300 service workers plus 300 cashier attendance rows fit the bounded dashboard without exposing cashier coordinates',async()=>{
  const {dateKey}=await call('getOwnStaffAttendance','cashier');
  for(let start=0;start<300;start+=100){const batch=db.batch();for(let i=start;i<start+100;i++){
    const staffId=`bulk-worker-${i}`;
    batch.set(db.doc(`staff/${staffId}`),{active:true,branchIds:['talkha'],nameAr:`عامل محلي ${i}`});
    batch.set(db.doc(`attendanceDays/${dateKey}_${staffId}`),{staffId,branchId:'talkha',dateKey,status:'PRESENT'});
  }await batch.commit();}
  const batch=db.batch();for(let i=0;i<300;i++){const staffId=`account_bulk_${i}`;batch.set(db.doc(`attendanceDays/${dateKey}_${staffId}`),{staffId,staffNameAr:`كاشير محلي ${i}`,userId:`bulk-${i}`,accountRole:'cashier',branchId:'talkha',dateKey,status:'PRESENT',locationEvidence:{latitude:31.05,longitude:31.38,distanceMeters:0}});}await batch.commit();
  const dashboard=await call('getAttendanceDashboard','cashier',{branchId:'talkha'});
  assert.equal(dashboard.rows.length,602);
  assert.equal(dashboard.rows.filter(row=>!row.accountRole).length,300);
  for(const row of dashboard.rows.filter(row=>row.accountRole)){
    assert.equal(row.attendance.userId,undefined);assert.equal(row.attendance.locationEvidence.latitude,undefined);assert.equal(row.attendance.locationEvidence.longitude,undefined);
  }
});
