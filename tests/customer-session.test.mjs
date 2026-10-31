import test from 'node:test';import assert from 'node:assert/strict';
import {liveCustomerIdentity} from '../functions/src/customer-session.js';
import {normalizePhone} from '../functions/src/core.js';
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
const request={auth:{uid:'customer',token:{phone_number:'+201012345678',auth_time:200}}};
const user={phoneNumber:'+201012345678',disabled:false,customClaims:{},tokensValidAfterTime:new Date(100000).toISOString()};
const check=(r=request,override={},getUser=async()=>({...user,...override}))=>liveCustomerIdentity(r,{getUser,normalizePhone,hash:v=>'hash:'+v,HttpsError});
test('active verified customer keeps canonical identity with one live lookup',async()=>{let calls=0;assert.deepEqual(await check(request,{},async uid=>{calls++;assert.equal(uid,'customer');return user;}),{uid:'customer',phone:'01012345678',customerId:'hash:01012345678'});assert.equal(calls,1);});
test('disabled or promoted accounts cannot reuse customer tokens',async()=>{for(const change of [{disabled:true},{customClaims:{role:'cashier'}}])await assert.rejects(check(request,change),{code:'permission-denied'});});
test('revoked sessions fail, new sign-in after revocation succeeds',async()=>{const changed={tokensValidAfterTime:new Date(201000).toISOString()};await assert.rejects(check(request,changed),{code:'permission-denied'});assert.equal((await check({auth:{...request.auth,token:{...request.auth.token,auth_time:202}}},changed)).uid,'customer');});
test('changed phone identity cannot read the previous phone record',async()=>{await assert.rejects(check(request,{phoneNumber:'+201011111111'}),{code:'permission-denied'});});
test('anonymous, staff and malformed customer sessions are denied',async()=>{await assert.rejects(check({}),{code:'unauthenticated'});await assert.rejects(check({auth:{...request.auth,token:{...request.auth.token,role:'worker'}}}),{code:'unauthenticated'});await assert.rejects(check({auth:{...request.auth,token:{phone_number:'+201012345678'}}}),{code:'permission-denied'});});
test('Auth lookup failure never falls back to trusting cached token claims',async()=>{await assert.rejects(check(request,{},async()=>{throw {code:'auth/user-not-found'};}),{code:'permission-denied'});await assert.rejects(check(request,{},async()=>{throw {code:'network-error'};}),{code:'unavailable'});});
