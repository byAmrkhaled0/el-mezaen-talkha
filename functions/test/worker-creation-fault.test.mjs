import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
const handler=source.slice(source.indexOf('export const createAdminUser ='),source.indexOf('async function sendOperationalPush')).replace('export const','const');
test('Auth orphan remains disabled when worker persistence AND cleanup fail',async()=>{
 let created,claims;
 const staff={exists:true,data:()=>({active:true,branchIds:['talkha']}),ref:{}};
 const auth={createUser:async data=>{created=data;return {uid:'fixture-orphan'}},setCustomUserClaims:async(uid,data)=>{claims=data},deleteUser:async()=>{throw Error('CLEANUP_OUTAGE')}};
 const ctx={onCall:(_o,fn)=>fn,adminOptions:{},sanitizeText:(value,max)=>String(value||'').trim().slice(0,max),ROLE_CAPABILITY_CEILINGS:{worker:['attendance','tasks']},ROLE_DEFAULT_PERMISSIONS:{worker:['attendance','tasks']},normalizeWorkerUsername:v=>v,workerAuthEmail:v=>v+'@workers.el-mezaen.invalid',requireRole:()=>{},requireLiveAdmin:async()=>{},requireRecentAdmin:()=>{},getAuth:()=>auth,HttpsError:class extends Error{constructor(code,message){super(message);this.code=code}},FieldValue:{serverTimestamp:()=>0},console:{error:()=>{}},db:{doc:()=>({get:async()=>staff}),collection:()=>({where:()=>({limit:()=>({get:async()=>({empty:true})})})}),runTransaction:async()=>{throw Error('PERSISTENCE_OUTAGE')}}};
 // The runtime import is replaced only in the test sandbox; the handler body is the production source.
 const executable=handler.replace('const { getAuth } = await import("firebase-admin/auth");','');
 vm.runInNewContext(executable+';run=createAdminUser;',ctx);
 await assert.rejects(ctx.run({auth:{uid:'admin',token:{}},data:{name:'QA',username:'fixture.worker',password:'Fixture123!',role:'worker',staffId:'fixture-staff',branchIds:['talkha']}}));
 assert.equal(created.disabled,true);assert.equal(claims.role,'worker');assert.equal(claims.mustChangePassword,true);
});
