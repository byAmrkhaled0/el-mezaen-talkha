// Public browsing only. Booking, live availability and customer/account calls never use this store.
export function createPublicCatalogRequests({storage, namespace='catalog', now=Date.now, ttl=30000, maximum=20}={}) {
  const pending=new Map(), recent=new Map();
  const prefix=`mz-browse-v1:${namespace}:`;
  function keyFor(payload) {
    return JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([,value])=>value!==undefined).sort(([a],[b])=>a.localeCompare(b))));
  }
  function read(key) {
    let record=recent.get(key);
    try { record ||= JSON.parse(storage?.getItem(prefix+key)||'null'); } catch {}
    const age=now()-Number(record?.savedAt);
    return record && age>=0 && age<ttl ? structuredClone(record.data) : null;
  }
  function save(key,data) {
    const record={savedAt:now(),data:structuredClone(data)};
    recent.delete(key);recent.set(key,record);
    while(recent.size>maximum)recent.delete(recent.keys().next().value);
    try {
      const serialized=JSON.stringify(record);
      if(serialized.length<250000)storage?.setItem(prefix+key,serialized);
      const keys=Array.from({length:storage?.length||0},(_,index)=>storage.key(index)).filter(key=>key?.startsWith(prefix));
      // Keep storage bounded; never touch account, cart or other project data.
      for(const old of keys.slice(0,Math.max(0,keys.length-maximum)))storage.removeItem(old);
    } catch {}
  }
  return async function request(payload,load,{remember=true}={}) {
    if(!['metadata','page'].includes(payload.mode))throw Error('PUBLIC_BROWSING_ONLY');
    const key=keyFor(payload);
    if(remember){const saved=read(key);if(saved)return saved;}
    if(!pending.has(key)) {
      const promise=Promise.resolve().then(load).then(data=>{if(remember)save(key,data);return data;}).finally(()=>pending.delete(key));
      pending.set(key,promise);
    }
    return structuredClone(await pending.get(key));
  };
}
