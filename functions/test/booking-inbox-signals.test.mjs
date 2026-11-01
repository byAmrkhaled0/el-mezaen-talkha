import test from 'node:test';import assert from 'node:assert/strict';import {bookingInboxRecipient,bookingInboxSignal,publishBookingInboxSignal} from '../src/booking-inbox-signals.js';
const user=(uid,role='cashier',branchIds=['talkha'],extra={})=>({uid,customClaims:{role,branchIds},...extra});
const event=(branchId='talkha',extra={},before)=>({id:'event-one',params:{bookingId:'booking-one'},data:{before:{data:()=>before},after:{data:()=>({branchId,status:'pending',source:'website',customerName:'Private name',phone:'private',total:70,...extra}),updateTime:{seconds:1793500000,nanoseconds:1}}}});
test('recipients require live active staff, branch access and effective booking permissions',()=>{
 assert(bookingInboxRecipient(user('a','admin'),{},'mashaya'));assert(bookingInboxRecipient(user('t'),{},'talkha'));assert(!bookingInboxRecipient(user('m','cashier',['mashaya']),{},'talkha'));assert(!bookingInboxRecipient(user('w','worker'),{},'talkha'));assert(!bookingInboxRecipient(user('x','cashier',['talkha'],{disabled:true}),{},'talkha'));assert(!bookingInboxRecipient(user('x'),{active:false},'talkha'));assert(!bookingInboxRecipient({uid:'x',customClaims:{role:'manager',branchIds:['talkha'],permissions:['campaigns']}},{},'talkha'));
});
test('signal contains no customer, payment or price data and ignores unrelated booking writes',()=>{
 const row=bookingInboxSignal(event());assert.deepEqual(Object.keys(row).sort(),['bookingId','branchId','eventId','revision','source','type']);assert.equal(row.type,'new_booking');assert.equal(row.revision,'1793500000.000000001');assert.equal(bookingInboxSignal(event('talkha',{},event().data.after.data())),null);assert.equal(bookingInboxSignal(event('unknown')),null);
});
function fixture(){
 const rows=new Map(['admin','t','m','disabled','worker'].map(id=>['users/'+id,{role:id==='admin'?'admin':id==='worker'?'worker':'cashier',active:true}]));
 const live=[user('admin','admin'),user('t'),user('m','cashier',['mashaya']),user('disabled','cashier',['talkha'],{disabled:true}),user('worker','worker')];const writes=[];
 const ref=id=>({path:'users/'+id});const snap=path=>({id:path.split('/')[1],ref:{path},exists:rows.has(path),data:()=>structuredClone(rows.get(path))});
 const db={collection:()=>({where:()=>({limit:()=>({get:async()=>({docs:[...rows.keys()].map(snap)})})})}),runTransaction:async callback=>callback({get:async reference=>snap(reference.path),set:(reference,payload)=>{const prior=rows.get(reference.path);rows.set(reference.path,{...prior,bookingInboxSignals:{...prior.bookingInboxSignals,...payload.bookingInboxSignals}});writes.push({path:reference.path,payload});}})};
 return {rows,writes,db,auth:{getUsers:async ids=>({users:live.filter(row=>ids.some(id=>id.uid===row.uid))})}};
}
test('fanout reaches only the matching cashier and admin; repeat and out-of-order delivery are idempotent',async()=>{
 const t=fixture();assert.equal((await publishBookingInboxSignal({...t,event:event()})).written,2);assert.deepEqual(t.writes.map(row=>row.path).sort(),['users/admin','users/t']);assert.equal(t.rows.get('users/m').bookingInboxSignals,undefined);assert.equal((await publishBookingInboxSignal({...t,event:event()})).written,0);
 const older=event();older.data.after.updateTime.seconds--;assert.equal((await publishBookingInboxSignal({...t,event:older})).written,0);assert.equal(t.writes.length,2);
});
test('moving a booking refreshes both branch inboxes without reporting a new booking to the old branch',async()=>{
 const t=fixture();await publishBookingInboxSignal({...t,event:event('mashaya',{}, {branchId:'talkha',status:'pending'})});assert.equal(t.rows.get('users/t').bookingInboxSignals.talkha.type,'booking_changed');assert.equal(t.rows.get('users/m').bookingInboxSignals.mashaya.type,'booking_changed');assert.deepEqual(Object.keys(t.rows.get('users/admin').bookingInboxSignals).sort(),['mashaya','talkha']);assert(t.writes.every(row=>Object.keys(row.payload).join()==='bookingInboxSignals'));
});
