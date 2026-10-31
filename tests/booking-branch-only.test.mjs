import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {browsingSubset,browsingPackageEligible} from '../src/public-browsing.js';
import {reconcileBranchCart,packageEligible} from '../src/public-branch.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('src/app.js');
const branches=[{id:'talkha',active:true},{id:'mashaya',active:true},{id:'closed',active:false}];
const services=[{id:'t',branchIds:['talkha'],active:true,price:70},{id:'m',branchIds:['mashaya'],active:true,price:100},{id:'shared',branchIds:['talkha','mashaya'],active:true},{id:'bad',branchIds:['closed'],active:true},{id:'unscoped',branchIds:[],active:true},{id:'draft',branchIds:['talkha'],active:true,status:'draft'}];
test('public browsing shows active branches together, no duplicates, no unscoped or inactive data',()=>{
 const catalog={branches,services};
 assert.deepEqual(browsingSubset(services,catalog).map(x=>x.id),['t','m','shared']);
 assert.deepEqual(reconcileBranchCart([{id:'t'},{id:'m'},{id:'shared'}],catalog,'talkha').kept.map(x=>x.id),['t','shared']);
 assert.deepEqual(reconcileBranchCart([{id:'t'},{id:'m'}],catalog,'mashaya').kept.map(x=>x.id),['m']);
});
test('package display requires a fully eligible active branch; checkout never borrows another branch service',()=>{
 const catalog={branches,services};const good={id:'p',active:true,branchIds:['talkha'],includedServiceIds:['t']};
 assert(browsingPackageEligible(good,catalog));assert(!packageEligible(good,catalog,'mashaya'));
 assert(!browsingPackageEligible({...good,includedServiceIds:['m']},catalog));
 assert(!browsingPackageEligible({...good,branchIds:['closed']},catalog));
});
function openingHarness(){
 let release,pickerOpens=0;const state={catalog:{},cart:[],branchId:'talkha',lang:'ar'};
 const dialog={open:false,setAttribute(){},removeAttribute(){},close(){this.open=false;}},branchDialog={open:false};const button={disabled:false,setAttribute(){},removeAttribute(){}};
 const context=vm.createContext({state,catalogReady:true,bookingOpening:false,firebaseConfigured:true,currentBranch:()=>({id:'talkha'}),$:id=>id==='#bookingDialog'?dialog:branchDialog,trackEvent(){},refreshCatalog:()=>new Promise(resolve=>release=resolve),prefillCustomer:async()=>{},openBranchDialog:()=>{pickerOpens++;branchDialog.open=true;},showToast(){},t:x=>x,console});
 vm.runInContext(source.slice(source.indexOf('async function openBooking('),source.indexOf('function openBranchDialog(')),context);
 return {context,dialog,branchDialog,button,release:()=>release(true),pickerOpens:()=>pickerOpens};
}
test('booking opens branch choice immediately even with a saved branch; duplicate clicks share opening lock',async()=>{
 const h=openingHarness();const first=h.context.openBooking(h.button);assert.equal(h.pickerOpens(),1);assert(h.button.disabled);
 await h.context.openBooking(h.button);assert.equal(h.pickerOpens(),1);h.release();await first;assert(!h.button.disabled);
});
test('closing branch choice while refresh is pending does not reopen it unexpectedly',async()=>{
 const h=openingHarness();const pending=h.context.openBooking(h.button);h.branchDialog.open=false;h.release();await pending;assert.equal(h.pickerOpens(),1);assert(!h.branchDialog.open);
});
test('catalog, results and branch information pages never save a checkout branch during browsing',()=>{
 assert.doesNotMatch(read('src/catalog-page.js'),/localStorage\.setItem\("mz-branch"|catalogBranchDialog|openBranchDialog/);
 assert.doesNotMatch(read('src/results.js'),/localStorage\.setItem|resultFilters|data-result-branch/);
 const branchPage=read('src/branch-page.js'),context=branchPage.slice(branchPage.indexOf('function setBranchContext'),branchPage.indexOf('function renderCatalog'));
 assert.doesNotMatch(context,/localStorage\.setItem|reconcileBranchCart|confirm\(/);
});

test('actual branch selection updates checkout only, retains same-branch worker and cancellation preserves the cart',()=>{
 const state={catalog:{branches,services},cart:[{id:'t'}],branchId:'talkha',staffId:'worker-t',lang:'ar'};
 let accept=false,opened=0;const calls=[];const fields=new Map();
 const context=vm.createContext({state,bookingSubmitting:false,availabilityRequestId:0,reconcileBranchCart,confirm:()=>accept,branchName:branch=>branch.id,$:id=>{if(!fields.has(id))fields.set(id,{});return fields.get(id);},localStorage:{setItem(){}},trackEvent(){},saveCart(){},closeBranchDialog(){},renderSettings:()=>calls.push('settings'),renderCart:()=>calls.push('cart'),updateSummary:()=>calls.push('summary'),showBookingDialog:()=>opened++,showToast(){}});
 vm.runInContext(source.slice(source.indexOf('function selectBranch('),source.indexOf('function closeBooking(')),context);
 assert(context.selectBranch('talkha',true));assert.equal(state.staffId,'worker-t');assert.equal(opened,1);assert.deepEqual(calls,['settings','cart','summary']);
 assert.equal(context.selectBranch('mashaya',true),false);assert.equal(state.branchId,'talkha');assert.equal(state.cart.length,1);
 accept=true;assert(context.selectBranch('mashaya',true));assert.equal(state.branchId,'mashaya');assert.equal(state.staffId,'any');assert.equal(state.cart.length,0);
});
