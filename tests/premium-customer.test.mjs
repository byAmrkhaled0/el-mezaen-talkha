import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {publicCartCount} from '../src/public-cart-count.js';
import {accountCopy,accountMessages} from '../src/account-copy.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('cart quantities handle damaged local entries without breaking the public shell',()=>{
 assert.equal(publicCartCount(null),0);assert.equal(publicCartCount({qty:2}),0);
 assert.equal(publicCartCount([{qty:3},{qty:2}]),5);
 assert.equal(publicCartCount([null,{}, {qty:-1},{qty:'bad'},{qty:Infinity}]),5);
});
test('saveCart publishes same-tab notification after persistence without a network call',()=>{
 const events=[],counts=[{}];const state={cart:[{id:'a',qty:2}]};
 const context=vm.createContext({state,localStorage:{setItem:(k,v)=>events.push([k,v])},window:{dispatchEvent:e=>events.push(e.type)},CustomEvent:class {constructor(type){this.type=type;}},$$:()=>counts});
 const s=read('src/app.js');vm.runInContext(s.slice(s.indexOf('function saveCart()'),s.indexOf('function showToast(')),context);context.saveCart();
 assert.equal(events[0][0],'mz-cart');assert.equal(JSON.parse(events[0][1])[0].qty,2);assert.equal(events[1],'mz:cart');
 assert.match(read('src/public-controls.js'),/addEventListener\('mz:cart', updateCount\)/);
});
test('all account application messages have English translations; Arabic remains exact',()=>{
 assert.ok(Object.keys(accountMessages).length>80);
 for(const [ar,en] of Object.entries(accountMessages)){assert.equal(accountCopy(ar,'ar'),ar);assert.equal(accountCopy(ar,'en'),en);assert.doesNotMatch(en,/[\u0600-\u06ff]/,ar);}
});
for(const lang of ['ar','en'])test(`account card ${lang} preserves cancellation, repeat and paid rules; escapes CMS content`,()=>{
 const s=read('src/account.js'),ctx=vm.createContext({getLang:()=>lang,accountCopy:s=>accountCopy(s,lang),esc:s=>String(s??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),money:n=>String(n||0)});
 vm.runInContext(s.slice(s.indexOf('function statusLabel('),s.indexOf('function renderFavorite(')),ctx);
 const item={id:'b',status:'confirmed',paymentStatus:'unpaid',serviceNamesAr:['<script>'],branchNameAr:'طلخا',branchNameEn:'Talkha',items:[]};
 const card=ctx.bookingCard(item,true);assert.match(card,/data-cancel="b"/);assert.match(card,/data-reschedule="b"/);assert.match(card,/data-repeat="b"/);assert.doesNotMatch(card,/<script>/);
 if(lang==='en'){assert.match(card,/Branch: Talkha/);assert.match(card,/>Cancel</);assert.match(card,/>Reschedule</);}else assert.match(card,/الفرع:/);
 assert.doesNotMatch(ctx.bookingCard({...item,paymentStatus:'paid'},true),/data-cancel/);
 assert.doesNotMatch(ctx.bookingCard({...item,productOnly:true},true),/data-reschedule/);
});
test('QR rendering is deferred until authenticated portal has a QR token',()=>{
 const s=read('src/account.js');assert.doesNotMatch(s,/^import QRCode/m);assert.match(s,/if \(c.qrToken\) \{ const \{default: QRCode\} = await import\("qrcode"\)/);
 assert.match(s,/sequence !== loadSequence \|\| !auth.currentUser/);
});
test('account feedback uses live regions and theme colors, not inline pale colors',()=>{
 assert.doesNotMatch(read('src/account.js'),/style.color = error/);assert.match(read('src/account.js'),/setAttribute\("role", error \? "alert" : "status"\)/);
 assert.match(read('src/account.css'),/html\[data-theme=light\] .message\[data-message-state=error\]/);
});
test('Historical baseline reproduces duplicate uncached collection requests with deferred fixture',async()=>{
 // Preserve the original diagnostic expectation against the archived before-fix implementation.
 const code=read('tests/fixtures/admin-loadCollection.before.txt'),pending=[],calls=[];
 const ctx=vm.createContext({collectionRequestEpoch:1,state:{collections:new Map(),collectionCursors:new Map()},$:()=>({value:'talkha'}),$$:()=>[],CSS:{escape:x=>x},renderCollection(){},toast(){},getCollection:(...args)=>{calls.push(args);return new Promise(resolve=>pending.push(resolve));}});
 vm.runInContext(code.slice(code.indexOf('async function loadCollection('),code.indexOf('async function loadPosOffers(')),ctx);
 const a=ctx.loadCollection('services'),b=ctx.loadCollection('services');assert.equal(calls.length,2);
 for(const resolve of pending)resolve({items:[],nextCursor:null});await Promise.all([a,b]);
 await ctx.loadCollection('services');assert.equal(calls.length,2,'settled cache prevents the third request');
});
