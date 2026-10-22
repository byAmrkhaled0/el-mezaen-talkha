// Harness update: supply actual newly imported editorial dependencies; assertions retained.
import {sharedEditorial,editorialOrigin} from '../src/public-editorial.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {bindPublicMenu,footerBranchModel,refinePublicNavigation,updatePublicFooter} from '../src/public-navigation.js';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
function menu(){
 const handlers={};let opened=false,focus=0;const attrs={};
 const toggle={contains:n=>n===toggle,setAttribute:(k,v)=>attrs[k]=v,focus:()=>focus++,addEventListener:(e,f)=>handlers['toggle:'+e]=f};
 const child={closest:()=>({})};const links={contains:n=>n===child||n===links,addEventListener:(e,f)=>handlers['links:'+e]=f,classList:{toggle(){opened=!opened;return opened;},contains:()=>opened,remove:()=>opened=false}};
 const root={activeElement:child,addEventListener:(e,f)=>handlers[e]=f};bindPublicMenu(toggle,links,root);
 return {handlers,attrs,toggle,links,child,root,opened:()=>opened,focused:()=>focus};
}
test('STEP2B menu toggles once and Esc restores focus',()=>{const m=menu();m.handlers['toggle:click']();assert.equal(m.attrs['aria-expanded'],'true');m.handlers.keydown({key:'Escape'});assert.equal(m.opened(),false);assert.equal(m.focused(),1);assert.equal(m.attrs['aria-expanded'],'false');});
test('STEP2B outside click closes while inside click keeps menu open',()=>{const m=menu();m.handlers['toggle:click']();m.handlers.click({target:m.child});assert.equal(m.opened(),true);m.handlers.click({target:{}});assert.equal(m.opened(),false);assert.equal(m.focused(),1);});
test('STEP2B click on a route closes without stealing navigation focus',()=>{const m=menu();m.handlers['toggle:click']();m.handlers['links:click']({target:m.child});assert.equal(m.opened(),false);assert.equal(m.focused(),0);});
test('STEP2B outside click does not steal focus from another control',()=>{const m=menu();m.root.activeElement={};m.handlers['toggle:click']();m.handlers.click({target:m.root.activeElement});assert.equal(m.focused(),0);});
test('STEP2B protected routes exit before any DOM mutation',()=>{const old=globalThis.location;try{for(const path of ['/admin/','/worker/','/login/','/cashier/']){globalThis.location={pathname:path};refinePublicNavigation({get body(){throw Error('protected DOM accessed');}});}}finally{globalThis.location=old;}});
test('STEP2B footer projection never invents absent contact details',()=>{const m=footerBranchModel({id:'talkha',nameAr:'طلخا'});assert.equal(m.phone,'');assert.equal(m.whatsapp,'');assert.equal(m.map,'');assert.deepEqual(m.socials,[]);});
test('STEP2B footer URLs reject script schemes and embedded credentials',()=>{const m=footerBranchModel({mapsUrl:'javascript:alert(1)',facebook:'https://user:pw@example.test',instagram:'https://example.test/ok'});assert.equal(m.map,'');assert.deepEqual(m.socials,[{name:'instagram',url:'https://example.test/ok'}]);});
test('STEP2B footer localization and Egyptian WhatsApp normalization',()=>{const row={id:'talkha',nameAr:'طلخا',nameEn:'Talkha',addressAr:'عنوان',addressEn:'Address',phone:'01093008896'};assert.equal(footerBranchModel(row,'en').name,'Talkha');assert.equal(footerBranchModel(row,'en').address,'Address');assert.equal(footerBranchModel(row).whatsapp,'https://wa.me/201093008896');assert.equal(row.phone,'01093008896');});
// Execute the actual editorial renderer with synthetic content and no SDK/browser.
const source=read('src/catalog-page.js');
function editorial({cached=false,offline=false,query='',items=[]}={}){
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{value:query,innerHTML:'',textContent:'',replaceChildren(){}});return nodes.get(id);};
 const context=vm.createContext({sharedEditorial,editorialOrigin,mountEditorialViewer(){},page:'gallery',branchId:'talkha',lang:'en',catalog:{content:items,cached,offline},$,publicSubset:rows=>rows.filter(x=>x.branchIds.includes('talkha')),localized:(r,k)=>r[k+'En']||'',escapeHtml:s=>String(s).replaceAll('<','&lt;'),safeMediaUrl:()=>'',videoSource:()=>({}),deferredVideoMarkup:()=>'',mountDeferredVideos(){}});
 vm.runInContext(source.slice(source.indexOf('function renderEditorial()'),source.indexOf('function renderCacheNotice()')),context);context.renderEditorial();return $('#catalogGrid').innerHTML;
}
test('STEP2B fresh empty gallery differs from saved/offline empty gallery',()=>{assert.match(editorial(),/No published content/);assert.match(editorial({cached:true,offline:true}),/saved copy/);assert.doesNotMatch(editorial({cached:true}),/No published content/);});
test('STEP2B search zero results is distinct from no published content',()=>{assert.match(editorial({query:'missing'}),/No results match/);});
test('STEP2B dedicated gallery renders complete eligible content',()=>{const rows=Array.from({length:12},(_,i)=>({active:true,branchIds:['talkha'],type:'gallery',titleEn:'Photo '+i,status:'published'}));assert.equal((editorial({items:rows}).match(/<article/g)||[]).length,12);});
test('STEP2B shell introduces no extra catalog/network request',()=>{const s=read('src/public-navigation.js');assert.doesNotMatch(s,/fetch\(|getCatalog\(|httpsCallable|onSnapshot|setInterval/);assert.match(s,/mz:catalog/);const old=globalThis.localStorage;globalThis.localStorage={getItem:()=> 'talkha'};try{const nodes=new Map();const node=k=>{if(!nodes.has(k))nodes.set(k,{textContent:'',innerHTML:''});return nodes.get(k);};const footer={querySelector:node};updatePublicFooter({branches:[{id:'talkha',active:true,nameEn:'Talkha',addressEn:'TEST ADDRESS',phone:'01000000001',mapsUrl:'https://example.test/talkha'}]},'en',{querySelector:()=>footer,querySelectorAll:()=>[]});assert.ok(node('#branchFooterGrid').innerHTML.includes('TEST ADDRESS'));assert.ok(node('#branchFooterGrid').innerHTML.includes('https://example.test/talkha'));}finally{globalThis.localStorage=old;}assert.match(s,/body > footer/);assert.match(s,/https:\/\/wa\.me\/201008454029/);});
