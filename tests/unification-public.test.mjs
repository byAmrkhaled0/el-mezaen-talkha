import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {sharedEditorial,editorialOrigin} from '../src/public-editorial.js';
import {publicSubset,reconcileBranchCart,packageEligible} from '../src/public-branch.js';
import {publicHeaderMarkup,publicRoutes,updatePublicFooter,selectedFooterBranch} from '../src/public-navigation.js';
import {publicDataStatus,publicStatusText} from '../src/public-status.js';
import {safeMediaUrl} from '../src/media.js';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const rows=Array.from({length:14},(_,i)=>({id:String(i),type:'gallery',active:true,status:'published',titleEn:'Photo '+i,branchIds:[i%2?'mashaya':'talkha'],imageUrl:'https://fixture.invalid/'+i+'.webp'}));
for(const type of ['gallery','celebrity','result'])test(`shared ${type}: full published portfolio independent of booking branch`,()=>{
 const data=rows.map(r=>({...r,type})),original=JSON.stringify(data);
 for(const branch of ['talkha','mashaya','']){globalThis.localStorage={getItem:()=>branch};assert.equal(sharedEditorial(data,type).length,14);}
 assert.equal(JSON.stringify(data),original);assert.equal(editorialOrigin(data[0],'en'),'Talkha');assert.equal(editorialOrigin(data[1],'en'),'El Mashaya');
});
test('shared media reject publication and privacy restrictions',()=>{
 for(const flags of [{active:false},{active:undefined},{status:'hidden'},{status:'draft'},{published:false},{catalogVisible:false},{private:true},{isPrivate:true},{branchRestricted:true},{restricted:true},{visibility:'private'},{access:'members'},{scope:'branch'}])assert.equal(sharedEditorial([{...rows[0],...flags}],'gallery').length,0,JSON.stringify(flags));
 assert.deepEqual(sharedEditorial(rows,'service'),[]);assert.deepEqual(sharedEditorial(null,'gallery'),[]);
});
test('result requires safe image or complete pair',()=>{
 const base={...rows[0],type:'result',imageUrl:''};assert.equal(sharedEditorial([{...base,beforeImageUrl:'https://fixture.invalid/a',afterImageUrl:'https://fixture.invalid/b'}],'result').length,1);
 for(const more of [{imageUrl:'javascript:alert(1)'},{beforeImageUrl:'https://fixture.invalid/a'},{beforeImageUrl:'https://fixture.invalid/a',afterImageUrl:'data:text/html,x'}])assert.equal(sharedEditorial([{...base,...more}],'result').length,0);
});
const services=[{id:'t',active:true,branchIds:['talkha']},{id:'m',active:true,branchIds:['mashaya']}];
test('operational catalog stays branch isolated',()=>{assert.deepEqual(publicSubset(services,'talkha').map(x=>x.id),['t']);assert.deepEqual(publicSubset(services,'mashaya').map(x=>x.id),['m']);assert.deepEqual(publicSubset(services,''),[]);});
test('packages cannot borrow another branch service',()=>assert.equal(packageEligible({id:'p',active:true,branchIds:['mashaya'],includedServiceIds:['t']},{services},'mashaya'),false));
test('cart reconciliation removes incompatible items without mutating input',()=>{const cart=[{id:'t',qty:2},{id:'m',qty:1}],before=JSON.stringify(cart),r=reconcileBranchCart(cart,{services},'mashaya');assert.equal(r.removed,1);assert.deepEqual(r.kept,[{id:'m',qty:1}]);assert.equal(JSON.stringify(cart),before);});
for(const lang of ['ar','en'])test(`canonical ${lang} header unique controls, all routes, bounded SVG`,()=>{
 const html=publicHeaderMarkup(lang);for(const id of ['langToggle','themeToggle','menuToggle','branchSwitch','navLinks'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1);
 assert.equal((html.match(/class="icon-btn header-cart"/g)||[]).length,0);assert.equal((html.match(/nav-book"/g)||[]).length,1);
 for(const svg of html.match(/<svg[^>]+>/g)){assert.match(svg,/width="20"/);assert.match(svg,/height="20"/);assert.match(svg,/viewBox="0 0 24 24"/);}
 for(const [url] of publicRoutes)assert.ok(html.includes('href="'+url+'"'),url);
});
const branches=[{id:'talkha',active:true,nameEn:'Talkha',addressEn:'T address',phone:'01010000001',instagram:'https://fixture.invalid/t'},{id:'mashaya',active:true,nameEn:'Mashaya',addressEn:'M address',phone:'01010000002',instagram:'https://fixture.invalid/m'}];
function footer(id){globalThis.localStorage={getItem:()=>id};const contact={},social={},about={},label={};const foot={querySelector:s=>({'#branchFooterGrid':contact,'#socialLinks':social,'[data-footer-about]':about}[s])};updatePublicFooter({branches},'en',{querySelector:()=>foot,querySelectorAll:()=>[label]});return {contact:contact.innerHTML,social:social.innerHTML};}
test('footer shows only selected branch and one social channel link',()=>{const t=footer('talkha'),m=footer('mashaya');assert.match(t.contact,/T address/);assert.doesNotMatch(t.contact,/M address|01010000002/);assert.match(m.contact,/M address/);assert.doesNotMatch(m.contact,/T address|01010000001/);assert.equal((t.social.match(/<a /g)||[]).length,1);assert.match(t.social,/width="20"/);});
test('footer no selection does not invent contacts',()=>{assert.match(footer('').contact,/Choose your branch/);assert.doesNotMatch(footer('').contact,/tel:|wa.me/);assert.equal(selectedFooterBranch({branches:[{...branches[0],active:false}]},'talkha'),null);});
test('actual gallery renderer retains seven Mashaya records with no Talkha mixing',()=>{
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{value:'',innerHTML:'',textContent:'',replaceChildren(){}});return nodes.get(id);};
 const context=vm.createContext({page:'gallery',branchId:'mashaya',lang:'en',catalog:{content:rows},$,sharedEditorial,editorialOrigin,publicSubset,localized:(r,k)=>r[k+'En']||'',escapeHtml:String,safeMediaUrl,videoSource:()=>({}),deferredVideoMarkup:()=>'',mountDeferredVideos(){},mountEditorialViewer(){}});
 const s=read('src/catalog-page.js');vm.runInContext(s.slice(s.indexOf('function renderEditorial()'),s.indexOf('function renderCacheNotice()')),context);context.renderEditorial();const html=$('#catalogGrid').innerHTML;assert.equal((html.match(/<article/g)||[]).length,7);assert.doesNotMatch(html,/Talkha/);assert.match(html,/El Mashaya/);assert.equal((html.match(/data-editorial-image/g)||[]).length,7);
});
test('actual results renderer displays selected-branch pairs; search has explicit empty state',()=>{
 const nodes=new Map(),document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,{});return nodes.get(s);}};
 const ctx=vm.createContext({resultLoading:false,resultLoadError:null,document,items:[{...rows[0],type:'result',imageUrl:'',beforeImageUrl:'https://fixture.invalid/b',afterImageUrl:'https://fixture.invalid/a'},{...rows[1],type:'result'}],branch:'talkha',visibleItems:[],search:'',catalog:{},sharedEditorial,safeMediaUrl,resultText:(a,e)=>e,resultTitle:i=>i.titleEn,escapeHtml:String,branchLabel:i=>editorialOrigin(i,'en'),publicStatusText,getLang:()=> 'en'});
 const s=read('src/results.js');vm.runInContext(s.slice(s.indexOf('function render()'),s.indexOf('document.querySelector("#resultFilters")')),ctx);ctx.render();assert.equal((nodes.get('#allResultsGrid').innerHTML.match(/data-result-index/g)||[]).length,1);assert.match(nodes.get('#allResultsGrid').innerHTML,/result-pair/);assert.equal(nodes.get('#resultsCount').textContent,'1 results');ctx.search='absent';ctx.render();assert.match(nodes.get('#allResultsGrid').innerHTML,/No matching published content yet/);
});
test('results selector refuses an unknown branch before changing persisted state',()=>{
 let handler;const document={querySelector:()=>({addEventListener:(event,fn)=>handler=fn}),querySelectorAll:()=>[]};let renders=0;const ctx=vm.createContext({document,catalog:{},activeBranch:()=>null,branch:'talkha',render:()=>renders++,localStorage:{setItem(){throw Error('unexpected mutation');}},sessionStorage:{removeItem(){throw Error('unexpected mutation');}}});const s=read('src/results.js'),start=s.indexOf('document.querySelector("#resultFilters")');vm.runInContext(s.slice(start,s.indexOf('document.querySelector("#resultsSearch")',start)),ctx);handler({target:{closest:()=>({dataset:{resultBranch:'unknown'}})}});assert.equal(ctx.branch,'talkha');assert.equal(renders,0);
});

test('error states distinguish auth, protection, network, contract, rendering',()=>{assert.equal(publicDataStatus({code:'functions/unauthenticated'}),'authorization-error');assert.equal(publicDataStatus({code:'appCheck/403'}),'app-check-error');assert.equal(publicDataStatus(new Error('network')),'connection-error');for(const lang of ['ar','en'])for(const state of ['loading','authorization-error','app-check-error','connection-error','contract-error','rendering-error','editorial-empty'])assert.ok(publicStatusText(state,lang));});
test('shared shell/media add no Firebase reads/listeners',()=>{assert.doesNotMatch(read('src/public-navigation.js'),/getCatalog\(|fetch\(|onSnapshot\(|httpsCallable/);assert.doesNotMatch(read('src/public-editorial.js'),/getCatalog\(|fetch\(|onSnapshot\(|localStorage/);});
