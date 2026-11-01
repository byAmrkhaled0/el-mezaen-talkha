import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';import {doc,onSnapshot,getDoc} from 'firebase/firestore';
import {publishBookingInboxSignal} from '../functions/src/booking-inbox-signals.js';import {createBookingSignalPump} from '../src/booking-live.js';
const projectId='demo-mezaen-live-booking';if(process.env.GCLOUD_PROJECT!==projectId||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8791')throw Error('Requires the dedicated local demo Firestore emulator. Production is forbidden.');
const require=createRequire(new URL('../functions/package.json',import.meta.url));const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
test('local Firestore signal reaches matching cashier without reload; direct booking and foreign profile reads remain denied',{timeout:25000},async()=>{
 const env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8791,rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}}),app=initializeApp({projectId},'booking-live-test'),db=getFirestore(app);
 const users=[{uid:'cashier-t',customClaims:{role:'cashier',branchIds:['talkha']}},{uid:'cashier-m',customClaims:{role:'cashier',branchIds:['mashaya']}}];let unsubscribe,pump;
 try{
  await Promise.all(users.map(user=>db.doc('users/'+user.uid).set({role:'cashier',active:true})));
  const client=env.authenticatedContext('cashier-t',users[0].customClaims).firestore(),notes=[];let refreshes=0,resolveArrival;
  const arrived=new Promise(resolve=>resolveArrival=resolve),initial=new Promise((resolve,reject)=>{
   pump=createBookingSignalPump({scope:()=>({uid:'cashier-t',role:'cashier',branchIds:['talkha'],selectedBranch:'talkha'}),notify:item=>notes.push(item.id),refresh:async()=>{const row=await db.doc('bookings/booking-one').get();if(row.exists){refreshes++;resolveArrival();}},onError:reject});
   let first=true;unsubscribe=onSnapshot(doc(client,'users','cashier-t'),snapshot=>{pump.receive({signals:snapshot.data()?.bookingInboxSignals||{},initial:first});if(first){first=false;resolve();}},reject);
  });
  await initial;
  const bookingRef=db.doc('bookings/booking-one');await bookingRef.set({branchId:'talkha',status:'pending',source:'website',total:70,customerName:'Synthetic only'});const after=await bookingRef.get();
  const event={id:'emulated-event',params:{bookingId:'booking-one'},data:{before:{data:()=>undefined},after}};
  await publishBookingInboxSignal({db,auth:{getUsers:async()=>({users})},event});
  await Promise.race([arrived,new Promise((_,reject)=>setTimeout(()=>reject(Error('Live update did not arrive')),6000))]);assert.deepEqual(notes,['booking-one']);assert.equal(refreshes,1);
  const own=(await db.doc('users/cashier-t').get()).data(),foreign=(await db.doc('users/cashier-m').get()).data();assert.equal(own.bookingInboxSignals.talkha.bookingId,'booking-one');assert.equal(foreign.bookingInboxSignals,undefined);assert.equal((await bookingRef.get()).data().total,70);assert(!JSON.stringify(own.bookingInboxSignals).includes('Synthetic'));
  await assertFails(getDoc(doc(client,'bookings','booking-one')));await assertFails(getDoc(doc(client,'users','cashier-m')));
 }finally{unsubscribe?.();pump?.dispose();await env.cleanup();await db.terminate();await deleteApp(app);}
});
