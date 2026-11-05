import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {publicCartCount} from '../src/public-cart-count.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('empty cart stays out of the way; adding/removing items updates visibility and accessible count without touching storage',()=>{
 const source=read('src/public-controls.js'),code=source.slice(source.indexOf('const updateCount = '),source.indexOf('\n  window.addEventListener',source.indexOf('const updateCount = ')));
 let saved='[]',lang='ar';const badge={},cart={hidden:false,attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
 const ctx=vm.createContext({publicCartCount,getLang:()=>lang,localStorage:{getItem:()=>saved},document:{querySelectorAll:()=>[badge],querySelector:()=>cart}});vm.runInContext(code+';globalThis.sync=updateCount;',ctx);
 ctx.sync();assert.equal(cart.hidden,true);saved=JSON.stringify([{id:'cut',qty:2}]);ctx.sync();assert.equal(cart.hidden,false);assert.equal(badge.textContent,'2');assert.match(cart.attrs['aria-label'],/2/);
 lang='en';ctx.sync();assert.equal(cart.attrs['aria-label'],'Open booking cart, 2 items');saved='broken-json';ctx.sync();assert.equal(cart.hidden,true);
});
test('hero preload and rendered image agree on responsive size, so one appropriate image is fetched',()=>{
 const html=read('index.html'),bootstrap=read('public/hero-bootstrap.js');const sizes=[...html.matchAll(/class="hero-photo"[^>]*\bsizes="([^"]+)"|sizes="([^"]+)"[^>]*class="hero-photo"/g)].map(m=>m[1]||m[2]);
 assert.equal(sizes.length,2);const preload=bootstrap.match(/setAttribute\('imagesizes','([^']+)'\)/)?.[1];assert.ok(preload);assert.ok(sizes.every(s=>s===preload));assert.match(preload,/80px.*110px.*340px/);
});
function slotsFixture(){
 const app=read('src/app.js'),select={disabled:false,innerHTML:''},date={value:'2026-11-06'},notice={hidden:true,children:[],replaceChildren(...children){this.children=children;}};
 const state={branchId:'talkha',staffId:'any',lang:'ar',date:'',time:''},calls=[],pending=[];
 const ctx=vm.createContext({state,availabilityRequestId:0,availabilityLoading:false,$:s=>({'#bookingTime':select,'#bookingDate':date,'#bookingAvailabilityNotice':notice})[s],document:{createElement:tag=>({tag})},renderBookingAvailability:()=>{notice.hidden=true;notice.replaceChildren();},updateSummary(){},needsAppointment:()=>true,availabilityFingerprint:()=>state.branchId+'|'+date.value,cartItems:()=>[{id:'cut',kind:'service',qty:1},{id:'tea',kind:'drink',qty:1}],getAvailableSlots:payload=>{calls.push(payload);return new Promise((resolve,reject)=>pending.push({resolve,reject}));},escapeAttr:String,escapeHtml:String,slotLabel:String,showToast(){},console:{debug(){}}});
 vm.runInContext(app.slice(app.indexOf('async function renderTimes()'),app.indexOf('async function applyCouponCode()')),ctx);
 return {ctx,state,select,date,notice,calls,pending};
}
test('actual slot retry keeps the selected date and items, prevents double requests, and clears the error after recovery',async()=>{
 const f=slotsFixture();const first=f.ctx.renderTimes();f.pending[0].reject(Error('temporary'));await first;
 const retry=f.notice.children.find(n=>n.id==='bookingSlotsRetry');assert.ok(retry);assert.equal(retry.type,'button');assert.equal(f.notice.hidden,false);
 retry.onclick();retry.onclick();assert.equal(f.calls.length,2);assert.equal(f.select.disabled,true);assert.equal(f.date.value,'2026-11-06');assert.equal(f.calls[1].bookingDate,f.calls[0].bookingDate);assert.deepEqual(f.calls[1].items,f.calls[0].items);assert.equal(f.calls[1].items.length,1);
 f.pending[1].resolve({slots:['14:00']});await new Promise(r=>setImmediate(r));assert.equal(f.select.disabled,false);assert.match(f.select.innerHTML,/14:00/);assert.equal(f.notice.hidden,true);assert.equal(f.state.time,'');
});
test('failed stale slot lookup cannot replace newer branch/date results or re-enable its pending controls',async()=>{
 const f=slotsFixture();const first=f.ctx.renderTimes();f.state.branchId='mashaya';f.date.value='2026-11-07';const second=f.ctx.renderTimes();f.pending[0].reject(Error('stale'));await first;assert.equal(f.notice.children.length,0);assert.equal(f.select.disabled,true);
 f.pending[1].resolve({slots:['15:00']});await second;assert.match(f.select.innerHTML,/15:00/);assert.equal(f.select.disabled,false);
});
