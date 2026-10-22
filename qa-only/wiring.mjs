export function transformQaModule(code, name) {
  const plans={
    'admin-api.js':[
      ['auth = initializeAuth(app, { persistence: browserSessionPersistence });',"auth = wire(initializeAuth(app, { persistence: browserSessionPersistence }), 'auth');"],
      ['storage = getStorage(app);',"storage = wire(getStorage(app), 'storage');"],
      ['if (globalThis.__USE_EMULATORS__) connectFunctionsEmulator(functions, "127.0.0.1", 5001);',"wire(functions, 'functions');"]],
    'account.js':[
      ['auth = getAuth(app);',"auth = wire(getAuth(app), 'auth');"],
      ['functions = getFunctions(app, "europe-west1");',"functions = wire(getFunctions(app, 'europe-west1'), 'functions');"]],
    'firebase-client.js':[
      ['const auth = getAuth(app);',"const auth = wire(getAuth(app), 'auth');"],
      ['if (globalThis.__USE_EMULATORS__) connectFunctionsEmulator(functions, "127.0.0.1", 5001);',"wire(functions, 'functions');"]]
  };
  if(!plans[name])throw Error('QA_UNKNOWN_MODULE:'+name);
  const expected = name === 'admin-api.js' ? {initializeApp:1,initializeAuth:1,getAuth:0,getStorage:1,getFunctions:1} : {initializeApp:1,initializeAuth:0,getAuth:1,getStorage:0,getFunctions:1};
  for (const [call,count] of Object.entries(expected)) {
    const found = (code.match(new RegExp('\\b'+call+'\\s*\\(', 'g')) || []).length;
    if(found !== count)throw Error('QA_WIRING_DRIFT:'+name+':unexpected '+call+' count '+found);
  }

  let output=code;
  for(const [before,after] of plans[name]) {
    if(output.split(before).length!==2)throw Error('QA_WIRING_DRIFT:'+name+':'+before);
    output=output.replace(before,after);
  }
  return "import {wire} from 'virtual:qa-wire';\n"+output;
}
export function createQaWire(connectors, config, hostname) {
  if(config?.projectId!=='demo-el-mezaen-qa'||!['127.0.0.1','localhost'].includes(hostname))throw Error('QA_PROJECT_OR_HOST');
  const seen=new WeakMap();
  return function wire(value,kind) {
    if(!['auth','storage','functions'].includes(kind))throw Error('QA_SERVICE');
    if(seen.has(value)){if(seen.get(value)!==kind)throw Error('QA_SERVICE_MISMATCH');return value;}
    if(kind==='auth')connectors.auth(value,'http://127.0.0.1:9099');
    if(kind==='storage')connectors.storage(value,'127.0.0.1',9199);
    if(kind==='functions')connectors.functions(value,'127.0.0.1',5001);
    seen.set(value,kind);return value;
  };
}
export function normalizeQaStorageUrl(value,bucket) {
  if(bucket!=='demo-el-mezaen-qa.appspot.com')return value;
  try{const u=new URL(String(value||''));if(u.origin!=='http://127.0.0.1:9199'||u.username||u.password)return value;
    const m=u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
    if(!m||decodeURIComponent(m[1])!==bucket)return value;
    return 'https://firebasestorage.googleapis.com'+u.pathname+u.search;
  }catch{return value;}
}
export function transformQaManagedMedia(code){
  const needle='new URL(String(value || ""))';
  if(code.split(needle).length!==2)throw Error('QA_MANAGED_MEDIA_DRIFT');
  return 'const normalizeQaStorageUrl = '+normalizeQaStorageUrl.toString()+';\n'+code.replace(needle,'new URL(normalizeQaStorageUrl(value,bucketName))');
}
