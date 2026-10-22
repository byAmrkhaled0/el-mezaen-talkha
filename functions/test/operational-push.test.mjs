import test from 'node:test';import assert from 'node:assert/strict';import {operationalPushAllowed as allowed} from '../src/operational-push.js';
const user={uid:'a',customClaims:{role:'cashier',branchIds:['talkha']}},device={uid:'a',token:'fixture',branchIds:['talkha']};
test('cashier push is restricted to live branch claims',()=>{assert.equal(allowed(user,device,'talkha'),true);assert.equal(allowed(user,device,'mashaya'),false);});
test('stale device branch is never an authority after role/branch change',()=>assert.equal(allowed({...user,customClaims:{role:'cashier',branchIds:['mashaya']}},device,'talkha'),false));
test('disabled account receives no operational push',()=>assert.equal(allowed({...user,disabled:true},device,'talkha'),false));
test('Admin all-branch notifications require explicit registration choice',()=>{const admin={uid:'a',customClaims:{role:'admin'}};assert.equal(allowed(admin,device,'mashaya'),false);assert.equal(allowed(admin,{...device,receiveAllBranches:true},'mashaya'),true);});
test('revoked session device cannot receive sensitive notifications',()=>assert.equal(allowed({...user,tokensValidAfterTime:'2026-01-02'}, {...device,updatedAt:'2026-01-01'},'talkha'),false));
