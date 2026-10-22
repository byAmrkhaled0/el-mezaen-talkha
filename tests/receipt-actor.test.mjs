import test from 'node:test';import assert from 'node:assert/strict';
import {receiptActor} from '../functions/src/receipt-actor.js';
test('receipt issuer comes exclusively from verified authentication, not client payload',()=>{
 assert.deepEqual(receiptActor({auth:{uid:'real',token:{name:'كاشير موثوق',email:'verified@example.invalid'}},data:{cashierUid:'forged',cashierName:'forged'}}),{cashierUid:'real',cashierName:'كاشير موثوق'});
});
test('receipt issuer retains a real identity when display name or email is unavailable',()=>{
 assert.deepEqual(receiptActor({auth:{uid:'real',token:{email:'verified@example.invalid'}}}),{cashierUid:'real',cashierName:'verified@example.invalid'});
 assert.deepEqual(receiptActor({auth:{uid:'real',token:{}}}),{cashierUid:'real',cashierName:'real'});
 assert.throws(()=>receiptActor({data:{cashierUid:'forged'}}),/RECEIPT_ACTOR_REQUIRED/);
});
