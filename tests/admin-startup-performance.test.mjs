import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import {verifyStaffStartup,needsMarketingGrantCheck} from '../src/admin-startup.js';
test('staff startup runs independent proofs concurrently and returns no access until both finish',async()=>{
 const started=[];let identity,application,completed=false;
 const pending=verifyStaffStartup({getIdTokenResult:force=>{assert.equal(force,true);started.push('identity');return new Promise(r=>identity=r);}},()=>{started.push('application');return new Promise(r=>application=r);}).then(value=>{completed=true;return value;});
 assert.deepEqual(started,['identity','application']);identity({claims:{role:'cashier'}});await Promise.resolve();assert.equal(completed,false);application(true);assert.equal((await pending).claims.role,'cashier');
});
test('either failed proof rejects startup; no cached or unverified identity is returned',async()=>{
 await assert.rejects(verifyStaffStartup({getIdTokenResult:async()=>{throw Error('revoked');}},async()=>true),/revoked/);
 await assert.rejects(verifyStaffStartup({getIdTokenResult:async()=>({claims:{role:'admin'}})},async()=>{throw Error('app-check');}),/app-check/);
});
test('optional marketing lookup is skipped only when there are no marketing claims to filter',()=>{
 for(const role of ['cashier','manager','media']){assert.equal(needsMarketingGrantCheck(role,['pos','dashboard','teamOperations']),false);for(const permission of ['offers','campaigns','gallery','results','hairMedia','celebrities','posts'])assert.equal(needsMarketingGrantCheck(role,[permission]),true);}
 assert.equal(needsMarketingGrantCheck('admin',['campaigns']),false);
});
const admin=fs.readFileSync(new URL('../src/admin.js',import.meta.url),'utf8');
test('notification dialog opens before network, refreshes concurrently, and does not reopen after the user closes it',async()=>{
 const status={hidden:false,textContent:'',setAttribute(){}},dialog={open:false,opened:0,showModal(){this.open=true;this.opened++;},setAttribute(){},querySelector:()=>({after(){}})};const calls=[];let release,rendered=0;
 const task=name=>{calls.push(name);return name==='orders'?new Promise(r=>release=r):Promise.resolve();};
 const context=vm.createContext({state:{role:'admin',loadedAt:{dashboard:0}},Date,document:{createElement:()=>status},$:id=>id==='#adminAlertsDialog'?dialog:status,renderAdminAlerts:()=>rendered++,canOpenSection:()=>true,orderAdditionView:{poll:()=>task('orders')},loadTargetAchievementAlerts:()=>task('targets'),loadDashboard:()=>task('dashboard'),loadCashierDashboard:()=>task('cashier')});
 vm.runInContext(admin.slice(admin.indexOf('async function handlePushButton('),admin.indexOf('function goBackInAdmin()')),context);
 const pending=context.handlePushButton({});assert(dialog.open);assert.deepEqual(calls,['orders','targets','dashboard']);dialog.open=false;release();await pending;assert.equal(dialog.opened,1);assert.equal(dialog.open,false);assert.equal(rendered,2);assert(status.hidden);
});
