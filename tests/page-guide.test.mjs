import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {connectedDom} from './helpers/connected-dom.mjs';
import {guideSteps} from '../src/page-guide-content.js';
import {mountPageGuide,guideStorageKey,fitGuideCard,isGuideTargetVisible,isAdminGuideContext} from '../src/page-guide.js';

function fixture({hidden=false,blockedStorage=false}={}){
 const {document}=connectedDom(`<html lang="ar"><body><header class="header-actions"></header><div id="adminApp" ${hidden?'hidden':''}><section id="pos"><button data-new-pos>فاتورة جديدة</button><table id="cashierTransactionsTable"></table><input id="posItemSearch"></section></div><dialog id="otherEditor"><form><button type="submit">حفظ</button></form></dialog><dialog id="bookingDialog"><header></header><strong id="bookingBranchName">طلخا</strong><button id="bookingAddService">إضافة خدمة</button><button id="nextStep">التالي</button></dialog></body></html>`);
 const timers=new Map(),storage=new Map(),events=new Map();let serial=0,mutations=0;
 const proto=Object.getPrototypeOf(document.createElement('div'));
 proto.getClientRects=function(){let n=this;while(n){if(n.hidden||n.tagName==='DIALOG'&&!n.open)return [];n=n.parentElement;}return [{}];};
 proto.getBoundingClientRect=()=>({left:20,right:300,top:80,bottom:140,width:280,height:60});
 proto.showModal=function(){this.open=true;this.setAttribute('open','');};proto.close=function(){this.open=false;this.removeAttribute('open');this.dispatchEvent({type:'close'});};
 proto.scrollIntoView=function(){};proto.matches=function(selector){return !!this.closest(selector)&&this.closest(selector)===this;};
 proto.removeEventListener=function(type,listener){this.listeners[type]=(this.listeners[type]||[]).filter(l=>l!==listener);};
 proto.after=function(...nodes){let at=this;for(const node of nodes){const parent=at.parentElement;if(!parent)continue;const i=parent.childNodes.indexOf(at);node.remove();parent.childNodes.splice(i+1,0,node);node.parentElement=parent;at=node;}};
 Object.defineProperty(proto,'style',{get(){return this._style||={};},configurable:true});
 Object.defineProperty(proto,'offsetHeight',{get(){return 240;},configurable:true});
 document.documentElement=document.querySelector('html');document.body=document.querySelector('body');document.documentElement.lang='ar';document.hidden=false;
 const win={getComputedStyle:()=>({display:'block',visibility:'visible'}),addEventListener:(t,f)=>{if(!events.has(t))events.set(t,new Set());events.get(t).add(f);},removeEventListener:(t,f)=>events.get(t)?.delete(f)};
 const globals={window:win,document,location:{pathname:'/admin/'},innerWidth:390,innerHeight:780,localStorage:{getItem:k=>{if(blockedStorage)throw Error('disabled');return storage.get(k);},setItem:(k,v)=>{if(blockedStorage)throw Error('disabled');storage.set(k,v);}},setTimeout:f=>{timers.set(++serial,f);return serial;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:f=>{f();return 0;},cancelAnimationFrame:()=>{}};
 const prior=new Map(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [k,v]of Object.entries(globals))Object.defineProperty(globalThis,k,{value:v,writable:true,configurable:true});
 for(const n of document.querySelectorAll('[data-new-pos],#nextStep,#bookingAddService'))n.addEventListener('click',()=>mutations++);
 const $=q=>document.querySelector(q);
 return {document,$,storage,timers,events,get mutations(){return mutations;},tick(){const pending=[...timers.values()];timers.clear();pending.forEach(f=>f());},restore(){for(const [k,d]of prior)if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}};
}
test('first use waits for an authenticated visible workspace; navigation stays read-only and skip persists per account',()=>{
 const f=fixture({hidden:true});let ui;try{
  ui=mountPageGuide({role:'cashier',uid:'one',section:'pos'});f.tick();assert.equal(f.$('.mz-guide-dialog').open,false);
  f.$('#adminApp').hidden=false;f.$('#adminApp').removeAttribute('hidden');ui.refresh();f.tick();assert.equal(f.$('.mz-guide-dialog').open,true);
  const d=f.$('.mz-guide-dialog');assert.match(f.$('#mzGuideTitle').textContent,/الكاشير/);assert.equal(f.$('.header-actions .mz-guide-launch').textContent,'؟');assert.equal(f.$('.header-actions .mz-guide-launch').getAttribute('aria-label'),'مساعدة لوحة الإدارة');
  f.$('.mz-guide-next').dispatchEvent({type:'click'});assert.equal(f.mutations,0);
  f.$('.mz-guide-skip').dispatchEvent({type:'click'});assert.equal(d.open,false);assert.equal(f.storage.get(guideStorageKey({uid:'one',role:'cashier'})),'done');
  ui.refresh();f.tick();assert.equal(d.open,false);assert.equal(ui.start(),true);
  ui.refresh({uid:'two'});assert.equal(d.open,false);f.tick();assert.equal(d.open,true);assert.equal(f.mutations,0);
 }finally{ui?.dispose();f.restore();}
});
test('blocked storage, Escape and focus return work without causing another automatic popup in the same session',()=>{
 const f=fixture({blockedStorage:true});let ui;try{
  ui=mountPageGuide({role:'cashier',uid:'one',section:'pos'});f.$('.header-actions .mz-guide-launch').focus();f.tick();
  let prevented=false;f.$('.mz-guide-dialog').dispatchEvent({type:'cancel',preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(f.document.activeElement,f.$('.header-actions .mz-guide-launch'));
  ui.refresh();f.tick();assert.equal(f.$('.mz-guide-dialog').open,false);
 }finally{ui?.dispose();f.restore();}
});
test('does not interrupt any open dialog, typing or a hidden tab and never advances a booking',()=>{
 const f=fixture();let ui;try{
  ui=mountPageGuide({role:'cashier',uid:'one',section:'pos'});f.$('#otherEditor').showModal();f.tick();assert.equal(ui.start(),false);f.$('#otherEditor').close();
  f.document.activeElement=f.$('#posItemSearch');f.tick();assert.equal(f.$('.mz-guide-dialog').open,false);
  f.document.activeElement=null;f.document.hidden=true;ui.refresh();f.tick();assert.equal(f.$('.mz-guide-dialog').open,false);
  f.document.hidden=false;f.$('#bookingDialog').showModal();assert.equal(ui.start(),false);assert.equal(f.$('.mz-guide-dialog').open,false);
  assert.equal(f.mutations,0);assert.equal(f.$('#bookingDialog').open,true);
 }finally{ui?.dispose();f.restore();}
});
test('account switch and teardown close the tour and remove listeners; hidden targets are excluded',()=>{
 const f=fixture();let ui;try{
  f.$('[data-new-pos]').hidden=true;assert.equal(isGuideTargetVisible(f.$('[data-new-pos]')),false);
  ui=mountPageGuide({role:'cashier',uid:'one',section:'pos'});f.tick();f.$('.mz-guide-next').dispatchEvent({type:'click'});assert.doesNotMatch(f.$('#mzGuideTitle').textContent,/فاتورة جديدة/);
  ui.refresh({uid:''});assert.equal(f.$('.mz-guide-dialog').open,false);assert.equal(f.$('.header-actions .mz-guide-launch').hidden,true);
  ui.dispose();ui=null;assert.equal(f.$('.mz-guide-dialog'),null);assert.equal(f.timers.size,0);assert.equal([...f.events.values()].reduce((a,s)=>a+s.size,0),0);
 }finally{ui?.dispose();f.restore();}
});
test('mobile, desktop and keyboard-height card positions stay inside the viewport',()=>{
 for(const width of [320,360,390,430,768,1280])for(const height of [320,600,844])for(const top of [20,height-70]){
  const box=fitGuideCard({width,height,target:{top,left:20,right:width-30},cardWidth:360,cardHeight:250});
  assert.ok(box.left>=0&&box.top>=0);assert.ok(box.left+box.width<=width);assert.ok(box.top+250<=height);
 }
});
test('role/page copy is bilingual, attendance accurately distinguishes GPS from fingerprint capture',()=>{
 for(const role of ['cashier','manager','admin','media']){
  const steps=guideSteps({role,section:'pos'});assert.ok(steps.length>=3);
  for(const s of steps)for(const key of ['title','body','enTitle','enBody'])assert.ok(s[key]?.length>2);
 }
 assert.match(guideSteps({role:'cashier',section:'myAttendance'})[1].body,/لا يجمع بصمة/);
 for(const role of ['visitor','customer','worker','unknown'])assert.deepEqual(guideSteps({role}),[]);
 const js=readFileSync(new URL('../src/page-guide.js',import.meta.url),'utf8');assert.doesNotMatch(js,/fetch\(|httpsCallable|\.innerHTML\s*=|\.submit\(|\.click\(/);
});

test('public, customer and worker pages cannot mount help UI, timers or listeners even after an attempted refresh',()=>{
 for(const [pathname,role] of [['/','visitor'],['/services/','admin'],['/account/','customer'],['/worker/','worker'],['/login/','admin'],['/administrator/','admin'],['/admin/','worker']]){
  const f=fixture();try{
   globalThis.location.pathname=pathname;const ui=mountPageGuide({role,uid:'test'});ui.refresh({role:'admin',uid:'test'});assert.equal(ui.start(),false);
   assert.equal(f.$('.mz-guide-launch'),null);assert.equal(f.$('.mz-guide-dialog'),null);assert.equal(f.timers.size,0);assert.equal(f.events.size,0);ui.dispose();
  }finally{f.restore();}
 }
 for(const role of ['admin','manager','cashier','media'])assert.equal(isAdminGuideContext('/admin/',role),true);
});
test('public browsing, booking, customer and worker module graphs do not load administrative guide JS or CSS',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url));const seen=new Set();
 function visit(file){
  if(seen.has(file))return;seen.add(file);assert.doesNotMatch(path.basename(file),/^page-guide(?:-content)?\.(?:js|css)$/);
  if(!file.endsWith('.js'))return;const source=readFileSync(file,'utf8');
  for(const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)['"]([^'"]+)['"]/g)){
   if(!match[1].startsWith('.'))continue;const next=path.resolve(path.dirname(file),match[1]);if(existsSync(next))visit(next);
  }
 }
 for(const file of ['app.js','global-navigation.js','account.js','worker.js','catalog-page.js','results.js','branch-page.js'])visit(path.resolve(root,'src',file));
 assert.ok(seen.size>20);
 const admin=readFileSync(path.resolve(root,'src/admin.js'),'utf8');assert.match(admin,/mountPageGuide/);assert.match(admin,/page-guide\.css/);
});
