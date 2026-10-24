// IndexedDB contains encrypted, UID-scoped data. No passwords or auth tokens are
// copied here. Keys are non-extractable; server authorization remains mandatory.
const NAME = 'el-mezaen-offline-v1';
export function createOfflineStore({indexedDB = globalThis.indexedDB, crypto = globalThis.crypto} = {}) {
  let opening;
  const open = () => opening ||= new Promise((resolve, reject) => {
    if (!indexedDB || !crypto?.subtle) return reject(new Error('المتصفح لا يدعم حفظ الشيكات الآمن على الجهاز'));
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => {request.result.createObjectStore('records', {keyPath: 'id'}); request.result.createObjectStore('keys');};
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {opening = null; reject(request.error);};
    request.onblocked = () => {opening = null; reject(new Error('اقفل تبويبات الموقع القديمة وحاول تاني'));};
  });
  async function transaction(name, mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode); let result;
      try {const request = operation(tx.objectStore(name)); if (request) request.onsuccess = () => {result = request.result;};}
      catch (error) {tx.abort(); reject(error); return;}
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('تعذر الحفظ على الجهاز؛ الشيك لم يتم حفظه'));
    });
  }
  async function key(uid) {
    if (!uid) throw new Error('لا توجد جلسة موظف على الجهاز');
    const existing = await transaction('keys', 'readonly', store => store.get(uid));
    if (existing) return existing;
    const created = await crypto.subtle.generateKey({name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
    try {await transaction('keys', 'readwrite', store => store.add(created, uid)); return created;}
    catch (error) {const winner = await transaction('keys', 'readonly', store => store.get(uid)); if (winner) return winner; throw error;}
  }
  async function seal(uid, value) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:new TextEncoder().encode(uid)}, await key(uid), new TextEncoder().encode(JSON.stringify(value)));
    return {iv, encrypted};
  }
  async function unseal(row) {
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM', iv:row.iv, additionalData:new TextEncoder().encode(row.uid)}, await key(row.uid), row.encrypted)));
  }
  async function put(uid, type, id, value) {
    const sealed = await seal(uid, value);
    const db=await open();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('records','readwrite'),store=tx.objectStore('records');
      const write=()=>store.put({id:JSON.stringify([uid,type,id]),uid,type,updatedAt:Date.now(),...sealed});
      if(type==='read') {const request=store.getAll();request.onsuccess=()=>{const rows=request.result.filter(row=>row.uid===uid&&row.type==='read').sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));for(const row of rows.slice(119))store.delete(row.id);write();};}else write();
      tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error||new Error('تعذر حفظ البيانات على الجهاز'));
    });
  }
  async function get(uid, type, id) {
    if (!uid) return null;
    const row = await transaction('records', 'readonly', store => store.get(JSON.stringify([uid,type,id])));
    return row ? unseal(row) : null;
  }
  async function list(uid, type) {
    if (!uid) return [];
    const rows = await transaction('records', 'readonly', store => store.getAll());
    return Promise.all(rows.filter(row => row.uid === uid && row.type === type).map(unseal));
  }
  async function insertSale(uid, id, value) {
    const sealed = await seal(uid, value), db = await open();
    await new Promise((resolve,reject) => {
      const tx=db.transaction('records','readwrite'), store=tx.objectStore('records'), request=store.getAll();
      request.onsuccess=()=>{
        const rows=request.result.filter(row=>row.uid===uid&&row.type==='sale');
        if(rows.length>=500){tx.abort();return;}
        store.add({id:JSON.stringify([uid,'sale',id]),uid,type:'sale',...sealed});
      };
      tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('قائمة الشيكات على الجهاز ممتلئة أو الشيك محفوظ بالفعل؛ راجع المزامنة'));
    });
  }
  async function prune(uid) {
    const rows=(await list(uid,'sale')).filter(sale=>sale.status==='confirmed').sort((a,b)=>b.createdAt-a.createdAt).slice(100);
    for(const row of rows)await transaction('records','readwrite',store=>store.delete(JSON.stringify([uid,'sale',row.id])));
  }
  async function lease(uid, token=null, release=false) {
    const db=await open(), id=JSON.stringify([uid,'lease','sync']);
    return new Promise((resolve,reject)=>{
      let result=null;const tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),request=store.get(id);
      request.onsuccess=()=>{
        const current=request.result;
        if(release){if(current?.token===token)store.delete(id);return;}
        if(current && current.until>Date.now() && current.token!==token)return;
        result=token||crypto.randomUUID();store.put({id,uid,type:'lease',token:result,until:Date.now()+120000});
      };
      tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(tx.error);
    });
  }
  async function clearCached(uid) {
    const db=await open();
    await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),request=store.getAll();request.onsuccess=()=>{for(const row of request.result)if(row.uid===uid&&['read','context'].includes(row.type))store.delete(row.id);};tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error);});
  }
  return {put,get,list,insertSale,prune,lease,clearCached};
}
