// Local-only wiring: never route a real project or a remote page to demo services.
const linkedAuth=new WeakSet(),linkedFunctions=new WeakSet(),linkedStorage=new WeakSet();
export function assertDemoEmulator(config=globalThis.__FIREBASE_CONFIG__,host=globalThis.location?.hostname){
 if(globalThis.__USE_EMULATORS__!==true||!['127.0.0.1','localhost','[::1]'].includes(host)||!/^demo-[a-z0-9-]+$/.test(config?.projectId||''))throw new Error('LOCAL_EMULATORS_REQUIRE_LOOPBACK_DEMO_PROJECT');
 return true;
}
export function connectLocalAuth(auth,connect){assertDemoEmulator();if(!linkedAuth.has(auth)){connect(auth,'http://127.0.0.1:9099',{disableWarnings:true});linkedAuth.add(auth);}}
export function connectLocalFunctions(functions,connect){assertDemoEmulator();if(!linkedFunctions.has(functions)){connect(functions,'127.0.0.1',5001);linkedFunctions.add(functions);}}
export function connectLocalStorage(storage,connect){assertDemoEmulator();if(!linkedStorage.has(storage)){connect(storage,'127.0.0.1',9199);linkedStorage.add(storage);}}
