import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('homepage executable code is external under the unchanged production CSP',()=>{
 const html=read('index.html'),csp=JSON.parse(read('vercel.json')).headers.flatMap(r=>r.headers).find(h=>h.key==='Content-Security-Policy').value;
 for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){
  if(/application\/ld\+json/.test(script[1]))continue;
  assert.match(script[1],/\bsrc=/,'inline executable script would be blocked');
 }
 assert.ok(!csp.match(/script-src[^;]*'unsafe-inline'/));
 assert.ok(html.indexOf('src="/hero-mount.js"')>html.indexOf('id="publicHeroTemplate"'));
 assert.match(html,/<script src="\/initial-locale.js"><\/script>/);
 assert.match(read('public/hero-bootstrap.js'),/getItem\('mz-public-catalog-v6'\)/);
});
test('external hero adapter mounts once with bootstrap or a static fallback',()=>{
 let mounted=0,lookups=0,replaced;
 vm.runInNewContext(read('public/hero-mount.js'),{mountPublicHero:()=>mounted++,document:{getElementById(){lookups++;}}});
 assert.equal(mounted,1);assert.equal(lookups,0);
 const image={src:'/static-hero.webp'};
 vm.runInNewContext(read('public/hero-mount.js'),{document:{getElementById:()=>({content:{firstElementChild:{cloneNode:()=>image}},replaceWith:x=>replaced=x})}});
 assert.equal(replaced,image);
});
test('external initial locale preserves Arabic and fills English before app load',()=>{
 for(const lang of ['ar','en']){const nodes=[{textContent:'احجز',dataset:{initialEn:'Book'}}];
 vm.runInNewContext(read('public/initial-locale.js'),{document:{documentElement:{lang},querySelectorAll:()=>nodes}});
 assert.equal(nodes[0].textContent,lang==='en'?'Book':'احجز');}
});
test('service worker activation evicts the old cached hero bootstrap release',async()=>{
 const handlers={},deleted=[];let waiting;
 const source=read('public/sw.js');
 vm.runInNewContext(source,{URL,caches:{keys:async()=>['el-mezaen-static-final-closure-2','el-mezaen-runtime-final-closure-2'],delete:async key=>deleted.push(key)},self:{addEventListener:(name,fn)=>handlers[name]=fn,clients:{claim(){}}}});
 handlers.activate({waitUntil:p=>waiting=p});await waiting;
 assert.equal(deleted.length,2);assert.ok(deleted.every(key=>key.endsWith('final-closure-2')));
});
