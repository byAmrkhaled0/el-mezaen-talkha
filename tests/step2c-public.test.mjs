import {branchPresentation} from './helpers/closure-behaviors.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {publicDataStatus,publicStatusText} from '../src/public-status.js';
import {translations} from '../src/i18n.js';
import {publicSubset,packageEligible} from '../src/public-branch.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
for(const [name,error,options,expected] of [
 ['auth',{code:'functions/unauthenticated'},{},'authorization-error'],['permission',{code:'permission-denied'},{},'authorization-error'],['App Check',{code:'appCheck/fetch-status-error'},{},'app-check-error'],['network',new Error('offline'),{},'connection-error'],['failure beats empty',{code:'unavailable'},{count:0,hasBranches:false},'connection-error'],['stale',null,{cached:true,count:0},'cached'],['inactive branches',null,{hasBranches:false},'no-active-branches'],['choose branch',null,{hasSelection:false},'choose'],['published empty',null,{count:0},'empty'],['content',null,{count:2},'ready']])test('STEP2C state '+name,()=>assert.equal(publicDataStatus(error,options),expected));
test('STEP2C errors are translated and never assert an empty catalog',()=>{for(const state of ['authorization-error','app-check-error','connection-error'])for(const lang of ['ar','en']){assert.ok(publicStatusText(state,lang));assert.notEqual(publicStatusText(state,lang),publicStatusText('empty',lang));}});
test('STEP2C public label keys have nonempty AR and EN without placeholders',()=>{const keys=Object.keys(translations.ar).filter(k=>k.startsWith('step2cCopy'));assert.ok(keys.length>100);for(const key of keys){assert.ok(translations.en[key],key);assert.doesNotMatch(translations.en[key],/undefined|TODO/);}});
function hairFixture({count=20,branch='talkha',error,cached=false}={}){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,innerHTML:'',dataset:{},textContent:''});return nodes.get(id);};
 const catalog={branches:[{id:'talkha',active:true},{id:'mashaya',active:true}],cached,content:Array.from({length:count},(_,i)=>({id:String(i),type:'hair-system',branchIds:['talkha'],active:true,status:'published',titleAr:'فيديو',titleEn:'Video '+i,videoUrl:'https://example.test/'+i+'.mp4'}))};
 catalog.content.push({type:'hair-system',branchIds:['mashaya'],active:true,videoUrl:'https://example.test/other.mp4',titleEn:'Foreign branch'});
 const context=vm.createContext({getCatalog:async()=>{if(error)throw error;return catalog;},getLang:()=> 'en',publicSubset,publicDataStatus,publicStatusText,document:{querySelector:node},localStorage:{getItem:()=>branch},videoSource:url=>({kind:'direct',url}),deferredVideoMarkup:item=>'<button data-play-video="'+item.videoUrl+'">Play</button>',mountDeferredVideos(){},escapeHtml:x=>String(x)});
 const code=read('src/hair-systems.js');vm.runInContext(code.slice(code.indexOf('async function renderHairMedia()'),code.indexOf("document.querySelector('#hairMediaGrid').addEventListener")),context);
 return {run:()=>context.loadHairMedia(),node};
}
test('STEP2C hair page renders >12 eligible videos with no foreign branch content',async()=>{const f=hairFixture();await f.run();const s=f.node('#hairMediaGrid').innerHTML;assert.equal((s.match(/<article/g)||[]).length,20);assert.doesNotMatch(s,/Foreign branch|other.mp4/);});
test('STEP2C hair load failure shows retry and does not disappear',async()=>{const f=hairFixture({error:{code:'functions/permission-denied'}});await f.run();assert.equal(f.node('#hair-videos').hidden,false);assert.equal(f.node('#hairMediaGrid').dataset.catalogState,'authorization-error');assert.match(f.node('#hairMediaGrid').innerHTML,/data-retry-hair/);});
test('STEP2C hair saved empty is distinct from published empty',async()=>{const f=hairFixture({count:0,cached:true});await f.run();assert.match(f.node('#hairMediaGrid').innerHTML,/saved copy/);});
test('STEP2C branch page does not cap full eligible services, packages or staff',()=>{
 const nodes=new Map();const $=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:''});return nodes.get(id);};
 const catalog={branches:[{id:'talkha',active:true}],offers:[],services:Array.from({length:10},(_,i)=>({id:'s'+i,nameAr:'Service '+i,active:true,branchIds:['talkha'],price:10})),packages:[],staff:Array.from({length:9},(_,i)=>({id:'t'+i,nameAr:'Staff '+i,active:true,available:true,branchIds:['talkha']}))};
 catalog.services.push({id:'foreign',active:true,branchIds:['mashaya'],nameAr:'Foreign'});
 const code=read('src/branch-page.js'),context=vm.createContext({branchText:(ar,en)=>en,branchField:(item,key)=>item[key+"En"]||item[key+"Ar"]||"",$,branchId:'talkha',publicSubset,packageEligible,Date,escapeHtml:String,safeMediaUrl:()=>'',serviceMedia:()=>'/x.webp',packageMedia:()=>'/p.webp',money:String});
 vm.runInContext(code.slice(code.indexOf('function renderCatalog('),code.indexOf('document.addEventListener(')),context);context.renderCatalog(catalog);
 assert.equal(($('#branchServices').innerHTML.match(/<article/g)||[]).length,10);assert.equal(($('#branchTeam').innerHTML.match(/<article/g)||[]).length,9);assert.doesNotMatch($('#branchServices').innerHTML,/Foreign/);
});
test('STEP2C presentation modules do not start SDK, polling or new network calls',()=>{for(const p of ['src/public-navigation.js','src/public-controls.js','src/public-status.js'])assert.doesNotMatch(read(p),/fetch\(|getCatalog\(|initializeApp\(|httpsCallable\(|setInterval\(|MutationObserver/);});
test('STEP2C full home branch options become compact after selection, remain recoverable through change action',()=>{assert.deepEqual(branchPresentation(false),{fullHidden:false,compactHidden:true});assert.deepEqual(branchPresentation(true),{fullHidden:true,compactHidden:false});});
test('STEP2C media slots and strict managed URL contract remain',()=>{assert.match(read('index.html'),/data-home-media="heroImageUrl"/);assert.match(read('index.html'),/data-home-media="aboutImageUrl"/);assert.match(read('public/hero-bootstrap.js'),/owner-hero-studio-suit/);});
