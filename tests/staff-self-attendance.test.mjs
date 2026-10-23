import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {staffSelfAttendanceHandlers} from '../functions/src/staff-self-attendance.js';

function fixture(role='cashier') {
  const docs=new Map([['users/own',{active:true,role,name:'موظف اختبار',branchIds:['talkha']}],['branches/talkha',{active:true,nameAr:'طلخا',latitude:31.05,longitude:31.38,attendanceRadiusMeters:100}]]);
  const writes=[];let logId=0,live=true;
  const snapshot=path=>({exists:docs.has(path),id:path.split('/').at(-1),data:()=>docs.get(path)});
  const db={doc:path=>({path,id:path.split('/').at(-1),get:async()=>snapshot(path)}),collection:name=>({doc:()=>db.doc(`${name}/log${++logId}`)}),runTransaction:async fn=>fn({get:async ref=>snapshot(ref.path),create:(ref,value)=>{assert.equal(docs.has(ref.path),false);docs.set(ref.path,value);writes.push(ref.path);},update:(ref,value)=>{docs.set(ref.path,{...docs.get(ref.path),...value});writes.push(ref.path);},set:(ref,value)=>{docs.set(ref.path,value);writes.push(ref.path);}})};
  const handlers=staffSelfAttendanceHandlers({db,requireRole:(r,roles)=>{if(!roles.includes(r.auth?.token?.role))throw Object.assign(Error('role'),{code:'permission-denied'});},requireLiveStaff:async()=>{if(!live)throw Object.assign(Error('revoked'),{code:'permission-denied'});},requireBranchAccess:(r,id)=>{if(!r.auth.token.branchIds.includes(id))throw Error('branch');},branchesFor:r=>r.auth.token.branchIds,rateLimit:async()=>{},businessDateParts:()=>({dateKey:'2026-10-23',time:'10:00'}),FieldValue:{serverTimestamp:()=>123},HttpsError:class extends Error{constructor(code,message){super(message);this.code=code;}},hash:value=>createHash('sha256').update(value).digest('hex')});
  const request=(data={})=>({auth:{uid:'own',token:{role,branchIds:['talkha']}},data});
  const payload={action:'checkIn',branchId:'talkha',latitude:31.05,longitude:31.38,accuracy:10};
  return {docs,writes,handlers,request,payload,revoke:()=>live=false};
}
for(const role of ['cashier','manager'])test(`${role}: own GPS attendance, duplicate check-in/out and server identity`,async()=>{
  const f=fixture(role);assert.equal((await f.handlers.read(f.request())).attendance,null);
  const result=await f.handlers.record(f.request(f.payload));assert.equal(result.status,'PRESENT');assert.equal(f.writes.length,2);
  assert.equal((await f.handlers.record(f.request(f.payload))).idempotent,true);assert.equal(f.writes.length,2);
  const read=await f.handlers.read(f.request());assert.equal(read.attendance.status,'PRESENT');assert.equal(read.branches.length,1);
  assert.equal((await f.handlers.record(f.request({...f.payload,action:'checkOut'}))).status,'CHECKED_OUT');assert.equal(f.writes.length,4);
  assert.equal((await f.handlers.record(f.request({...f.payload,action:'checkOut'}))).idempotent,true);assert.equal(f.writes.length,4);
  const record=[...f.docs.values()].find(value=>value.accountRole===role);assert.equal(record.userId,'own');assert.equal(record.staffNameAr,'موظف اختبار');
});
test('legacy adapter without the worker lifecycle rejects unsupported roles',async()=>{
  for(const role of ['worker','customer','admin',null]){const f=fixture(role);await assert.rejects(f.handlers.record(f.request(f.payload)),{code:'permission-denied'});assert.equal(f.writes.length,0);}
});
test('forged target, unauthorized branch, poor GPS and distant location produce no writes',async()=>{
  for(const change of [{staffId:'someone'},{userId:'other'},{uid:'other'},{targetUid:'other'},{branchId:'mashaya'},{accuracy:200},{latitude:30},{latitude:null},{longitude:''},{action:'delete'}]){const f=fixture();await assert.rejects(f.handlers.record(f.request({...f.payload,...change})));assert.equal(f.writes.length,0);}
});
test('revoked/inactive/role-changing or mismatched canonical accounts fail closed',async()=>{
  const revoked=fixture();revoked.revoke();await assert.rejects(revoked.handlers.read(revoked.request()),{code:'permission-denied'});
  for(const change of [{active:false},{role:'worker'},{roleChangePending:{}},{branchIds:['mashaya']},{accessOperation:{action:'disable'}}]){const f=fixture();Object.assign(f.docs.get('users/own'),change);await assert.rejects(f.handlers.record(f.request(f.payload)),{code:'permission-denied'});assert.equal(f.writes.length,0);}
});
test('missing branch configuration, disabled branch and checkout before arrival never write',async()=>{
  for(const change of [{latitude:null},{longitude:undefined},{attendanceRadiusMeters:0},{active:false}]){const f=fixture();Object.assign(f.docs.get('branches/talkha'),change);await assert.rejects(f.handlers.record(f.request(f.payload)));assert.equal(f.writes.length,0);}
  const f=fixture();await assert.rejects(f.handlers.record(f.request({...f.payload,action:'checkOut'})),{code:'failed-precondition'});assert.equal(f.writes.length,0);
});
test('existing record cannot be taken over or checked out from another branch',async()=>{
  const f=fixture();await f.handlers.record(f.request(f.payload));const key=[...f.docs.keys()].find(k=>k.startsWith('attendanceDays/'));
  f.docs.get(key).userId='someone-else';await assert.rejects(f.handlers.read(f.request()),{code:'permission-denied'});await assert.rejects(f.handlers.record(f.request({...f.payload,action:'checkOut'})),{code:'failed-precondition'});assert.equal(f.writes.length,2);
});
