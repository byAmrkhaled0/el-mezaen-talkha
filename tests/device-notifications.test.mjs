import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {requestDeviceNotificationPermission,deviceNotificationControls,showDeviceNotification} from '../src/device-notifications.js';

test('permission is requested synchronously from the user gesture and dismissal is not success',async()=>{
 let called=false,release;
 const waiting=requestDeviceNotificationPermission({permission:'default',requestPermission(){called=true;return new Promise(resolve=>{release=resolve;});}});
 assert.equal(called,true);release('default');await assert.rejects(waiting,/PUSH_DISMISSED/);
 await assert.rejects(requestDeviceNotificationPermission({permission:'denied',requestPermission(){throw Error('must not reprompt');}}),/PUSH_DENIED/);
 assert.equal(await requestDeviceNotificationPermission({permission:'granted'}),'granted');
});

test('device controls do not offer a misleading local test before token registration',()=>{
 for(const permission of ['default','denied','unsupported'])assert.equal(deviceNotificationControls({permission,ready:true}).canTest,false);
 assert.equal(deviceNotificationControls({permission:'granted'}).canTest,false);
 assert.equal(deviceNotificationControls({permission:'granted',ready:true}).canTest,true);
 assert.equal(deviceNotificationControls({permission:'granted',ready:true,busy:true}).canTest,false);
 assert.match(deviceNotificationControls({permission:'denied'}).help,/إعدادات الموقع/);
 assert.equal(deviceNotificationControls({permission:'default'}).disabled,false);
});

test('mobile notification uses the active service worker and propagates display failures',async()=>{
 const calls=[];
 await showDeviceNotification({showNotification:async(...args)=>calls.push(args)},'عنوان',{tag:'test'});
 assert.deepEqual(calls,[['عنوان',{tag:'test'}]]);
 await assert.rejects(showDeviceNotification({},'عنوان',{}),/PUSH_NOT_CONFIGURED/);
 await assert.rejects(showDeviceNotification({showNotification:async()=>{throw Error('DISPLAY_FAILED');}},'عنوان',{}),/DISPLAY_FAILED/);
});

test('actual push activation requests permission before async SDK initialization and only registers a valid token',async()=>{
 const source=await readFile(new URL('../src/admin-api.js',import.meta.url),'utf8');
 const block=source.slice(source.indexOf('export async function enablePush()'),source.indexOf('export async function showAdminTestNotification()')).replace('export ','');
 const calls=[];let token='token';let rejectPermission=false;
 const scope=vm.createContext({configured:true,__VAPID_KEY__:'public-key',Notification:{},navigator:{serviceWorker:{}},app:{},document:{querySelector:()=>({value:'talkha'})},
  requestDeviceNotificationPermission:()=>{calls.push('permission');if(rejectPermission)return Promise.reject(Error('PUSH_DENIED'));return Promise.resolve('granted');},
  loadMessaging:async()=>{calls.push('sdk');return {getMessaging:()=>({}),isSupported:async()=>true,getToken:async()=>token};},
  getActiveServiceWorker:async()=>({active:true}),call:async(name,data)=>calls.push([name,data.token,data.branchId])});
 vm.runInContext(block+';globalThis.activate=enablePush;',scope);
 assert.equal(await scope.activate(),true);assert.deepEqual(calls,['permission','sdk',['registerPushToken','token','talkha']]);
 calls.length=0;token='';await assert.rejects(scope.activate(),/PUSH_TOKEN_FAILED/);assert.equal(calls.some(x=>Array.isArray(x)),false);
 calls.length=0;rejectPermission=true;await assert.rejects(scope.activate(),/PUSH_DENIED/);assert.deepEqual(calls,['permission']);
});
