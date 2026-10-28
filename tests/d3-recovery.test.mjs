import {projectCatalogStaff} from '../src/catalog-cache.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {publicDataStatus,publicStatusText} from '../src/public-status.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('src/catalog-page.js');
function harness(catalog){
 const elements=new Map();
 const el=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',textContent:'',disabled:false,setAttribute(){},replaceChildren(){}});return elements.get(key);};
 let opens=0,renders=0;
 const listeners=[];
 const context=vm.createContext({page:"services",publicDataStatus,publicStatusText,console:{debug(){}},getCatalogMetadata:async()=>catalog,loadPublicPage:async()=>{},activeBranch:(c,id)=>c.branches.find(b=>b.id===id&&b.active!==false),branchId:'',catalog:{},localized:()=>'',localStorage:{removeItem(){}},document:{querySelector:el,addEventListener:(name,cb,opts)=>listeners.push({cb,opts})},$:el,render:()=>renders++,openBranchDialog:()=>opens++,lang:'ar',location:{reload(){context.reloads++}},reloads:0});
 return {context,el,listeners,opens:()=>opens,renders:()=>renders};
}
async function boot(h){
 const start=source.indexOf('async function loadCatalogPage');
 if(start>=0){vm.runInContext('let catalogLoadPromise;\n'+source.slice(start).replace(/await loadCatalogPage\(\);\s*$/,''),h.context);await h.context.loadCatalogPage();}
 else {await vm.runInContext('(async()=>{'+source.slice(source.lastIndexOf('\ntry {'))+'})()',h.context);}
}
test('catalog network fallback gives retry, never opens an empty branch dialog',async()=>{const h=harness({branches:[],offline:true});await boot(h);assert.equal(h.opens(),0);assert.match(h.el('#catalogGrid').innerHTML,/data-retry-page/);});
test('successful empty catalog is a distinct unavailable state',async()=>{const h=harness({branches:[]});await boot(h);assert.equal(h.opens(),0);assert.match(h.el('#catalogGrid').innerHTML,/data-retry-page/);assert.doesNotMatch(h.el('#catalogGrid').innerHTML,/تحقق من الاتصال/);});
test('active branches retain normal branch choice',async()=>{const h=harness({branches:[{id:'talkha',active:true}]});await boot(h);assert.equal(h.opens(),1);assert.equal(h.renders(),1);});
test('retry cannot be consumed by an unrelated click',()=>{assert.doesNotMatch(source,/data-retry-page[^\n]+once:\s*true/);assert.match(source,/event.target.closest\("\[data-retry-page\]"\)/);});
test('Home uses six services and preserves dedicated full service route',()=>{const a=read('src/app.js');assert.match(a,/const visible =[^\n]+slice\(0, 6\)/);assert.ok(read('index.html').includes('/services/'));assert.doesNotMatch(source,/const items =[^\n]+slice\(0, 6\)/);});
test('complete before and after pair is accepted without redundant combined image',()=>{const a=read('src/app.js');assert.match(a,/item.type === "result" && \(item.imageUrl \|\| \(item.beforeImageUrl && item.afterImageUrl\)\)\)/);});

function catalogClient(remote) {
 const code=read('src/firebase-client.js');
 let calls=0;
 const context=vm.createContext({projectCatalogStaff,structuredClone,navigator:{onLine:true},firebaseConfigured:true,readCatalogCache:()=>null,saveCatalogCache(){},localCatalog:()=>({staff:[],content:[],categories:[],faqs:[],offers:[],settings:{}}),callFunction:async()=>{calls++;return remote();},console:{debug(){}}});
 vm.runInContext(code.slice(code.indexOf('let catalogRequest;'),code.indexOf('export async function getPublishedReviews')).replace('export async function','async function'),context);
 return {get:()=>context.getCatalog(),calls:()=>calls};
}
test('concurrent catalog reads share one request but return independent data',async()=>{
 let release;const pending=new Promise(r=>release=r);const client=catalogClient(()=>pending);
 const a=client.get(),b=client.get();assert.equal(client.calls(),1);release({branches:[{id:'talkha'}],services:[{id:'s'}]});
 const [one,two]=await Promise.all([a,b]);one.services[0].id='changed';assert.equal(two.services[0].id,'s');
 await client.get();assert.equal(client.calls(),2);
});
test('failed catalog request releases in-flight slot for retry',async()=>{
 let fail=true;const client=catalogClient(async()=>{if(fail)throw Error('offline');return {branches:[{id:'talkha'}]};});
 await assert.rejects(client.get(),/offline/);fail=false;assert.equal((await client.get()).branches[0].id,'talkha');assert.equal(client.calls(),2);
});
test('minimum frontend rejection still fails closed and permits later retry',async()=>{
 const client=catalogClient(async()=>{throw Object.assign(Error('old'),{code:'BACKEND_VERSION_MISMATCH'});});
 await assert.rejects(client.get(),{code:'BACKEND_VERSION_MISMATCH'});await assert.rejects(client.get(),{code:'BACKEND_VERSION_MISMATCH'});assert.equal(client.calls(),2);
});

test('result viewer displays after image for a complete pair and combined image otherwise',()=>{
 const code=read('src/results.js');const nodes=new Map();
 const node=k=>{if(!nodes.has(k))nodes.set(k,{hidden:false,focus(){},removeAttribute(k){delete this[k];}});return nodes.get(k);};
 const context=vm.createContext({visibleItems:[{beforeImageUrl:'/before.webp',afterImageUrl:'/after.webp'},{imageUrl:'/combined.webp'}],viewer:{hidden:true,querySelector:node},document:{activeElement:{},querySelector:node,body:{classList:{add(){}}}},safeMediaUrl:x=>x,branchLabel:()=>'',resultTitle:item=>item.titleAr||'El Mezaen result',resultOpener:null,viewerIndex:0});
 vm.runInContext(code.slice(code.indexOf('function showViewer('),code.indexOf('function closeViewer(')),context);
 context.showViewer(0);assert.equal(node('#resultViewerImage').src,'/after.webp');assert.equal(node('#resultViewerBefore').src,'/before.webp');
 context.showViewer(1);assert.equal(node('#resultViewerImage').src,'/combined.webp');assert.equal(node('#resultViewerBefore').hidden,true);assert.equal(node('#resultViewerBefore').src,undefined);
});
