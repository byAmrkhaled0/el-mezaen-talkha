import test from 'node:test';import assert from 'node:assert/strict';
import {createCustomerAccountRouter} from '../src/customer-account-entry.js';
const user=(role,phoneNumber='+201012345678')=>({phoneNumber,getIdTokenResult:async()=>({claims:{role}})});
function fixture(){const events=[];return {events,router:createCustomerAccountRouter({showGuest:()=>events.push('guest'),showPending:()=>events.push('pending'),showCustomer:()=>events.push('customer'),navigate:path=>events.push(path),onError:()=>events.push('error')})};}
test('a guest stays on the customer account landing page without reading private portal data',async()=>{const {events,router}=fixture();await router.update(null);assert.deepEqual(events,['guest']);});
test('a restored customer session opens the portal directly while staff keep their trusted destinations',async()=>{
 const customer=fixture();await customer.router.update(user(undefined));assert.deepEqual(customer.events,['pending','customer']);
 for(const role of ['admin','cashier','manager','media','worker']){const {events,router}=fixture();await router.update(user(role));assert.deepEqual(events,['pending',role==='worker'?'/worker/':'/admin/']);}
});
test('unsupported roles and accounts without a verified phone cannot open customer data',async()=>{
 for(const identity of [user('unknown'),user(undefined,null)]){const {events,router}=fixture();await router.update(identity);assert.deepEqual(events,['pending','guest','error']);}
});
test('an auth restore finishing after sign-out cannot reopen private data or redirect the guest',async()=>{
 let finish;const identity={phoneNumber:'+201012345678',getIdTokenResult:()=>new Promise(r=>finish=r)};
 const {events,router}=fixture(),pending=router.update(identity);await router.update(null);finish({claims:{role:'admin'}});await pending;assert.deepEqual(events,['pending','guest']);
});
test('a failed token restore stays on the guest page, and disposing ignores pending restores',async()=>{
 const failed=fixture();await failed.router.update({getIdTokenResult:async()=>{throw Error('network');}});assert.deepEqual(failed.events,['pending','guest','error']);
 let finish;const disposed=fixture(),pending=disposed.router.update({getIdTokenResult:()=>new Promise(r=>finish=r)});disposed.router.dispose();finish({claims:{role:'worker'}});await pending;assert.deepEqual(disposed.events,['pending']);
});
