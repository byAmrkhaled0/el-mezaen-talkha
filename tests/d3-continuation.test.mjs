// Harness update: supply actual newly imported editorial dependencies; assertions retained.
import {sharedEditorial,editorialOrigin} from '../src/public-editorial.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {publicSubset} from '../src/public-branch.js';
import {safeMediaUrl,videoSource} from '../src/media.js';
import {deferredVideoMarkup} from '../src/deferred-video.js';
const root=process.env.RECOVERY_TEST_ROOT||fileURLToPath(new URL('../',import.meta.url));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('src/catalog-page.js');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function editorial(content,{page='news',branchId='talkha',query=''}={}){
 const nodes=new Map();const el=k=>{if(!nodes.has(k))nodes.set(k,{value:query,innerHTML:'',textContent:'',replaceChildren(){}});return nodes.get(k);};
 const context=vm.createContext({sharedEditorial,editorialOrigin,mountEditorialViewer(){},page,branchId,catalog:{content},lang:'ar',publicSubset,localized:(i,k)=>i[k+'Ar']||'',escapeHtml:esc,safeMediaUrl,videoSource,deferredVideoMarkup,mountDeferredVideos(){},$:el});
 const code=source.slice(source.indexOf('function renderEditorial()'),source.indexOf('function renderCacheNotice()'));assert.ok(code.startsWith('function renderEditorial()'),'Editorial implementation required');
 vm.runInContext(code,context);context.renderEditorial();return el('#catalogGrid').innerHTML;
}
const row=(id,extra={})=>({id,type:'news',titleAr:'خبر '+id,bodyAr:'تفاصيل',branchIds:['talkha'],active:true,status:'published',...extra});
test('full editorial view preserves all published posts; Home cap does not limit dedicated page',()=>{const out=editorial(Array.from({length:9},(_,i)=>row(i)));assert.equal((out.match(/<article/g)||[]).length,9);});
test('editorial branch filter rejects other branch, draft, hidden and inactive records',()=>{const out=editorial([row('ok'),row('wrong',{branchIds:['mashaya']}),row('draft',{status:'draft'}),row('hidden',{status:'hidden'}),row('inactive',{active:false})]);assert.equal((out.match(/<article/g)||[]).length,1);assert.ok(out.includes('خبر ok'));});
test('editorial rejects financial all scope and no branch',()=>{assert.equal((editorial([row('all',{branchIds:['all']})]).match(/<article/g)||[]).length,0);assert.equal((editorial([row('ok')],{branchId:''}).match(/<article/g)||[]).length,0);});
test('editorial uses Admin sortOrder and searches full body',()=>{const out=editorial([row('last',{sortOrder:9}),row('first',{sortOrder:1})]);assert.ok(out.indexOf('خبر first')<out.indexOf('خبر last'));assert.ok(editorial([row('found',{bodyAr:'needle'})],{query:'needle'}).includes('خبر found'));});
test('editorial sanitizes text, links and media',()=>{const out=editorial([row('<script>',{bodyAr:'<img onerror=x>',imageUrl:'javascript:alert(1)',linkUrl:'javascript:alert(2)'})]);assert.ok(out.includes('&lt;script&gt;'));assert.ok(!out.includes('<script>'));assert.ok(!out.includes('javascript:'));});
test('gallery preserves deferred direct video, external video and full images',()=>{const out=editorial([row('clip',{type:'gallery',videoUrl:'https://example.test/a.mp4'}),row('external',{type:'gallery',videoUrl:'https://youtu.be/abcdefg'}),row('image',{type:'gallery',imageUrl:'https://example.test/a.webp'})],{page:'gallery'});assert.ok(out.includes('data-play-video'));assert.ok(out.includes('https://youtu.be/abcdefg'));assert.ok(out.includes('https://example.test/a.webp'));assert.ok(!out.includes('<video'));});
test('three new pages register HTML entry, route normalization, sitemap, build verification and Home links',()=>{for(const route of ['gallery','news','celebrities']){const h=read(route+'/index.html');assert.ok(h.includes(`data-page="${route}"`));assert.ok(h.includes(`__SITE_URL__/${route}/`));for(const p of ['vite.config.js','scripts/generate-seo.mjs','scripts/verify-build.mjs','src/public-navigation.js','index.html'])assert.ok(read(p).includes(route),p);}});
test('homepage previews cap gallery at four, news and guests at three',()=>{const a=read('src/app.js');assert.ok(a.includes('gallery.slice(0, 4)'));assert.ok(a.includes('news.slice(0, 3)'));assert.ok(a.includes('celebrities.slice(0, 3)'));});
test('English back label targets safe back span instead of first nav link',()=>{assert.ok(source.includes("document.querySelector('[data-safe-back] span')"));assert.ok(!source.includes("document.querySelector('.nav-actions a').textContent"));});
test('cache notice is outside grid and is retained/hidden on renders',()=>{const nodes=new Map();let before=0;const grid={before:n=>{nodes.set('#catalogCacheNotice',n);before++;}};const context=vm.createContext({catalog:{cached:true},lang:'en',document:{querySelector:k=>nodes.get(k),createElement:()=>({setAttribute(){}})},$:()=>grid});vm.runInContext(source.slice(source.indexOf('function renderCacheNotice()'),source.indexOf('function render()')),context);context.renderCacheNotice();context.renderCacheNotice();assert.equal(before,1);assert.equal(nodes.get('#catalogCacheNotice').hidden,false);context.catalog.cached=false;context.renderCacheNotice();assert.equal(nodes.get('#catalogCacheNotice').hidden,true);});

for (const route of ['/worker/','/account/','/login/']) test(`offline protected page retry returns to ${route}`,async()=>{
 const handlers={};let response;let cacheReads=0;
 const context=vm.createContext({URL,Response,fetch:async()=>{throw Error('offline');},caches:{match(){cacheReads++;}},self:{location:{origin:'https://qa.example.test'},addEventListener:(name,handler)=>handlers[name]=handler}});
 vm.runInContext(read('public/sw.js'),context);
 handlers.fetch({request:{url:'https://qa.example.test'+route,method:'GET',mode:'navigate'},respondWith:value=>response=value});
 const result=await response;assert.equal(result.status,503);assert.ok((await result.text()).includes(`href="${route}"`));assert.equal(cacheReads,0);
});

test('authorized offline admin serves only a previously cached static shell',async()=>{
 const handlers={};let response;const cached=new Response('<html>cached static shell</html>');
 const context=vm.createContext({URL,Response,fetch:async()=>{throw Error('offline');},caches:{match:async path=>{assert.equal(path,'/admin/');return cached;}},self:{location:{origin:'https://qa.example.test'},addEventListener:(name,handler)=>handlers[name]=handler}});
 vm.runInContext(read('public/sw.js'),context);
 handlers.fetch({request:{url:'https://qa.example.test/admin/',method:'GET',mode:'navigate'},respondWith:value=>response=value});
 assert.equal(await (await response).text(),'<html>cached static shell</html>');
});
