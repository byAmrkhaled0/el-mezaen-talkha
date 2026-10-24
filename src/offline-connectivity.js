let unavailable=false;
try {unavailable=globalThis.sessionStorage?.getItem('el-mezaen-offline-mode')==='1';}catch{}
export const isOfflineMode=()=>globalThis.navigator?.onLine===false||unavailable;
export function setDeviceOffline(value){
  const changed=unavailable!==Boolean(value);unavailable=Boolean(value);
  try{globalThis.sessionStorage?.setItem('el-mezaen-offline-mode',unavailable?'1':'0');}catch{}
  if(changed)globalThis.window?.dispatchEvent(new Event('offline-mode-changed'));
}
globalThis.window?.addEventListener('online',()=>setDeviceOffline(false));
