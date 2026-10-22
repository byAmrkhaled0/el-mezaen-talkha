import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { workerPushAllowed } from '../src/worker-notification-delivery.js';
const source=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
function policy(env) {const begin=source.indexOf('const runningInEmulator ='),end=source.indexOf('const publicOptions',begin);const ctx={process:{env}};vm.runInNewContext(source.slice(begin,end)+'; result=enforcePublicAppCheck;',ctx);return ctx.result;}
test('Production App Check cannot be disabled by missing/false/malformed config',()=>{assert.equal(policy({}),true);assert.equal(policy({ENFORCE_APP_CHECK:'true'}),true);for(const value of ['false','','TRUE','0'])assert.throws(()=>policy({ENFORCE_APP_CHECK:value}),/Production requires/);});
test('Explicit demo emulator App Check bypass remains available',()=>assert.equal(policy({FUNCTIONS_EMULATOR:'true',ENFORCE_APP_CHECK:'false'}),false));
const user={uid:'w',customClaims:{role:'worker',staffId:'s',branchIds:['talkha']}},profile={role:'worker',staffId:'s',branchIds:['talkha'],active:true},staff={userUid:'w',active:true,branchIds:['talkha']},device={uid:'w',role:'worker',staffId:'s',branchIds:['talkha'],token:'fixture',updatedAt:'2026-10-08T00:00:00Z'};
test('Worker push requires canonical identity, branch and current device',()=>{assert.equal(workerPushAllowed(user,profile,staff,device,'talkha'),true);assert.equal(workerPushAllowed(user,profile,staff,device,'mashaya'),false);});
for(const [name,u,p,s,d] of [
 ['disabled',{...user,disabled:true},profile,staff,device],
 ['password gate',{...user,customClaims:{...user.customClaims,mustChangePassword:true}},profile,staff,device],
 ['canonical pending',user,{...profile,active:false},staff,device],
 ['operation pending',user,{...profile,accessOperation:{action:'username'}},staff,device],
 ['unlinked',user,profile,{...staff,userUid:'other'},device],
 ['other branch device',user,profile,staff,{...device,branchIds:['mashaya']}],
 ['revoked',{...user,tokensValidAfterTime:'2026-10-09'},profile,staff,device]
])test(`Worker push denies ${name}`,()=>assert.equal(workerPushAllowed(u,p,s,d,'talkha'),false));
