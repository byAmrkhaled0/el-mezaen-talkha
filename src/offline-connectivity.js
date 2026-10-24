let unavailable=false;
try {unavailable=globalThis.sessionStorage?.getItem('el-mezaen-offline-mode')==='1';}catch{}
export const isOfflineMode=()=>globalThis.navigator?.onLine===false||unavailable;
export function setDeviceOffline(value){
  const changed=unavailable!==Boolean(value);unavailable=Boolean(value);
  try{globalThis.sessionStorage?.setItem('el-mezaen-offline-mode',unavailable?'1':'0');}catch{}
  if(changed)globalThis.window?.dispatchEvent(new Event('offline-mode-changed'));
}
globalThis.window?.addEventListener('online',()=>setDeviceOffline(false));

// Static, network-only heartbeat: no Firebase reads while the connection is healthy.
export function createConnectionMonitor({probe,onAvailable=async()=>{},online=()=>globalThis.navigator?.onLine!==false,setOffline=setDeviceOffline,isOffline=isOfflineMode,schedule=setTimeout,cancel=clearTimeout,visible=()=>!globalThis.document?.hidden}) {
  let stopped=true,timer,busy=false,wasAvailable=false;
  async function check(){
    if(stopped||busy)return;
    busy=true;
    try{
      if(!online()){wasAvailable=false;setOffline(true);return;}
      if(!visible())return;
      const available=await probe();
      if(stopped)return;
      if(!available){wasAvailable=false;setOffline(true);return;}
      setOffline(false);
      if(!wasAvailable){wasAvailable=true;try{await onAvailable();}catch{wasAvailable=false;}}
    }catch{wasAvailable=false;setOffline(true);}
    finally{busy=false;if(!stopped){cancel(timer);timer=schedule(check,isOffline()?15000:60000);}}
  }
  return {start(){if(!stopped)return;stopped=false;void check();},check,stop(){stopped=true;cancel(timer);}};
}

export async function networkReachable(){
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),5000);
  try{
    const response=await fetch('/connection-check.txt?t='+Date.now(),{cache:'no-store',credentials:'omit',signal:controller.signal});
    return response.ok&&(await response.text()).trim()==='EL_MEZAEN_CONNECTION_OK';
  }catch{return false;}finally{clearTimeout(timeout);}
}
