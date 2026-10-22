import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformQaModule,createQaWire,normalizeQaStorageUrl,transformQaManagedMedia} from '../qa-only/wiring.mjs';
import {canonicalManagedStoragePath} from '../functions/src/managed-media.js';
for(const name of ['admin-api.js','account.js','firebase-client.js'])test('QA wiring fail-fast and source compatibility '+name,()=>{
 const code=readFileSync(new URL('../src/'+name,import.meta.url),'utf8');const transformed=transformQaModule(code,name);assert.match(transformed,/virtual:qa-wire/);assert.match(transformed,/wire\(/);
 const marker=name==='admin-api.js'?'auth = initializeAuth(app, { persistence: browserSessionPersistence });':name==='account.js'?'auth = getAuth(app);':'const auth = getAuth(app);';
 assert.throws(()=>transformQaModule(code.replace(marker,marker.replace('auth','renamed')),name),/QA_WIRING_DRIFT/);
 assert.throws(()=>transformQaModule(code+'\n'+marker,name),/QA_WIRING_DRIFT/);
 assert.throws(()=>transformQaModule(code+'\nconst added = getAuth(otherApp);',name),/QA_WIRING_DRIFT/);
});
test('every service connects once before return, exceptions do not mark connected',()=>{const calls=[];const c={};for(const kind of ['auth','storage','functions'])c[kind]=(value,...args)=>{calls.push([kind,...args]);value.connected=true;};const wire=createQaWire(c,{projectId:'demo-el-mezaen-qa'},'127.0.0.1');for(const kind of ['auth','storage','functions']){const value={};assert.equal(wire(value,kind).connected,true);wire(value,kind);}assert.deepEqual(calls,[['auth','http://127.0.0.1:9099'],['storage','127.0.0.1',9199],['functions','127.0.0.1',5001]]);assert.throws(()=>createQaWire(c,{projectId:'el-mezaen-talkha'},'127.0.0.1'),/QA_PROJECT/);assert.throws(()=>createQaWire(c,{projectId:'demo-el-mezaen-qa'},'example.com'),/QA_PROJECT/);let attempts=0;const fail=createQaWire({auth(){attempts++;throw Error('connect failed');}},{projectId:'demo-el-mezaen-qa'},'localhost');const a={};assert.throws(()=>fail(a,'auth'));assert.throws(()=>fail(a,'auth'));assert.equal(attempts,2);});
test('production media validator rejects emulator URL; QA parser accepts only exact demo bucket and origin',()=>{
 const bucket='demo-el-mezaen-qa.appspot.com';const url='http://127.0.0.1:9199/v0/b/'+bucket+'/o/public%2Fhomepage%2Fhero.webp?alt=media';assert.equal(canonicalManagedStoragePath(url,bucket),'');assert.equal(canonicalManagedStoragePath(normalizeQaStorageUrl(url,bucket),bucket),'public/homepage/hero.webp');
 for(const value of [url.replace('127.0.0.1','localhost'),url.replace(':9199',':9198'),url.replace('demo-el-mezaen-qa.appspot.com','other.appspot.com'),url.replace('127.0.0.1','user:pass@127.0.0.1')])assert.equal(normalizeQaStorageUrl(value,bucket),value);
 assert.equal(normalizeQaStorageUrl(url,'el-mezaen-talkha.appspot.com'),url);
 const code=readFileSync(new URL('../functions/src/managed-media.js',import.meta.url),'utf8');const transformed=transformQaManagedMedia(code);const c=vm.createContext({URL});vm.runInContext(transformed.replaceAll('export function','function')+';globalThis.parse=canonicalManagedStoragePath',c);assert.equal(c.parse(url,bucket),'public/homepage/hero.webp');assert.equal(c.parse(url.replace('hero.webp','..%2Fsecret'),bucket),'');assert.throws(()=>transformQaManagedMedia(code.replace('new URL(String(value || ""))','new URL(value)')),/DRIFT/);
});
