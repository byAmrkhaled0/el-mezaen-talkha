import baseline from '../vite.config.js';
import {readFileSync} from 'node:fs';
import {transformQaModule,createQaWire,transformQaManagedMedia} from './wiring.mjs';
for(const name of ['admin-api.js','account.js','firebase-client.js'])transformQaModule(readFileSync(new URL('../src/'+name,import.meta.url),'utf8'),name);
const config={apiKey:'demo-only-key',authDomain:'demo-el-mezaen-qa.firebaseapp.com',projectId:'demo-el-mezaen-qa',storageBucket:'demo-el-mezaen-qa.appspot.com',appId:'1:123:web:qa'};
const runtime=`import {connectAuthEmulator} from 'firebase/auth';import {connectStorageEmulator} from 'firebase/storage';import {connectFunctionsEmulator} from 'firebase/functions';const createQaWire=${createQaWire.toString()};export const wire=createQaWire({auth:(instance)=>connectAuthEmulator(instance,'http://127.0.0.1:9098'),storage:(instance,host)=>connectStorageEmulator(instance,host,9198),functions:(instance,host)=>connectFunctionsEmulator(instance,host,5201)},globalThis.__FIREBASE_CONFIG__,location.hostname);`;
export default {...baseline,cacheDir:'node_modules/.vite-target-lock',server:{host:'127.0.0.1',port:4185,strictPort:true},plugins:[{
 name:'qa-only-emulators',enforce:'pre',
 transformIndexHtml(){return [{tag:'style',children:'body .firebase-emulator-warning{pointer-events:none}',injectTo:'head'}];},
 configureServer(server){server.middlewares.use((req,res,next)=>{const path=new URL(req.url,'http://localhost').pathname;if(!['/firebase-config.js','/__local-appcheck.js'].includes(path))return next();res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');res.end(path==='/__local-appcheck.js'?'':`globalThis.__FIREBASE_CONFIG__=${JSON.stringify(config)};globalThis.__USE_EMULATORS__=true;globalThis.__OFFLINE_DEMO__=false;globalThis.__APP_CHECK_SITE_KEY__='';`);});},
 resolveId(id){if(id==='virtual:qa-wire')return '\0virtual:qa-wire';},load(id){if(id==='\0virtual:qa-wire')return runtime;},
 transform(code,id){const path=id.split('?')[0].replaceAll('\\','/');if(path.endsWith('/functions/src/managed-media.js'))return {code:transformQaManagedMedia(code).replaceAll('9199','9198'),map:null};const name=path.split('/').at(-1);if(path.includes('/src/')&&['admin-api.js','account.js','firebase-client.js'].includes(name))return {code:transformQaModule(code,name),map:null};}
},...(baseline.plugins||[])]};
