import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const code=fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8').replace('/*__OFFLINE_ASSETS__*/ []',JSON.stringify(['/admin/','/assets/admin-test.js','/firebase-config.js']));
function worker(clientPaths,{fail=false}={}){
 const handlers={},saved=new Set(),added=[];
 const cache={match:async url=>saved.has(url)?{}:undefined,addAll:async urls=>{added.push(...urls);if(fail)throw Error('offline');urls.forEach(url=>saved.add(url));},add:async url=>saved.add(url)};
 const self={location:{origin:'https://example.test'},clients:{matchAll:async()=>clientPaths.map(path=>({url:'https://example.test'+path}))},skipWaiting(){},addEventListener:(name,cb)=>handlers[name]=cb};
 vm.runInNewContext(code,{self,caches:{open:async()=>cache},URL,console});
 return {added,saved,async install(){let done;handlers.install({waitUntil:p=>done=p});await done;},async ready(path){let done,answer;handlers.message({source:{url:path},data:{type:'OFFLINE_READY'},ports:[{postMessage:v=>answer=v}],waitUntil:p=>done=p});await done;return answer;}};
}
test('public visitor does not download admin bundles during service worker installation',async()=>{
 const w=worker(['/services/','/']);await w.install();assert.deepEqual(w.added,[]);assert(!w.saved.has('/admin/'));assert(w.saved.has('/'));
});
test('opening admin directly retains complete offline preparation',async()=>{
 const w=worker(['/admin/#admin=pos']);await w.install();assert(w.saved.has('/assets/admin-test.js'));assert.equal((await w.ready('https://example.test/admin/')).ready,true);
});
test('public-to-admin navigation prepares only missing files, then reports ready',async()=>{
 const w=worker(['/']);await w.install();w.saved.add('/firebase-config.js');
 assert.equal((await w.ready('https://example.test/admin/#admin=pos')).ready,true);assert.deepEqual(w.added,['/admin/','/assets/admin-test.js']);
 await w.ready('https://example.test/admin/');assert.equal(w.added.length,2);
});
test('public or foreign message cannot trigger admin prefetch; failed download remains not ready',async()=>{
 const w=worker(['/']);await w.install();for(const path of ['https://example.test/','https://foreign.test/admin/'])assert.equal((await w.ready(path)).ready,false);assert.equal(w.added.length,0);
 const failed=worker(['/'],{fail:true});await failed.install();assert.equal((await failed.ready('https://example.test/admin/')).ready,false);
});
