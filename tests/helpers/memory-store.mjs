// Deterministic transactional store for handler tests. Emulator suites separately
// exercise real Firestore contention and transport behavior.
export function memoryStore(initial={}){
 const rows=new Map(Object.entries(initial)),writes=[];let serial=Promise.resolve(),seq=0;
 const clone=x=>Array.isArray(x)?x.map(clone):x&&typeof x==='object'?(typeof x.toDate==='function'?x:Object.fromEntries(Object.entries(x).map(([k,v])=>[k,clone(v)]))):x;
 const at=(x,key)=>key.split('.').reduce((v,k)=>v?.[k],x);
 const compare=(a,b)=>a?.seconds!=null&&b?.seconds!=null?(a.seconds-b.seconds||a.nanoseconds-b.nanoseconds):a===b?0:a>b?1:-1;
 const snap=path=>({id:path.split('/').at(-1),ref:doc(path),exists:rows.has(path),data:()=>clone(rows.get(path))});
 function doc(path){return {path,id:path.split('/').at(-1),get:async()=>snap(path)}}
 function query(name,conditions=[],limit=Infinity,orders=[],cursor=null){return {
  where:(...c)=>query(name,[...conditions,c],limit,orders,cursor),limit:n=>query(name,conditions,n,orders,cursor),orderBy:(field,order='asc')=>query(name,conditions,limit,[...orders,[field,order]],cursor),startAfter:s=>query(name,conditions,limit,orders,s),
  async get(){let docs=[...rows.keys()].filter(p=>p.startsWith(name+'/')&&p.split('/').length===2).map(snap).filter(s=>conditions.every(([key,op,want])=>{const value=at(s.data(),key);return op==='=='?value===want:op==='array-contains'?value?.includes(want):op==='in'?want.includes(value):op==='>'?compare(value,want)>0:false}));
   const sort=(a,b)=>{for(const [field,order]of orders){const n=compare(at(a.data(),field),at(b.data(),field));if(n)return order==='desc'?-n:n}return orders.at(-1)?.[1]==='desc'?b.id.localeCompare(a.id):a.id.localeCompare(b.id)};
   if(orders.length)docs.sort(sort);if(cursor)docs=docs.filter(s=>sort(s,cursor)>0);docs=docs.slice(0,limit);return {docs,size:docs.length,empty:!docs.length};}
 }}
 const db={doc,getAll:async(...refs)=>refs.map(r=>snap(r.path)),collection:name=>Object.assign(query(name),{doc:()=>doc(name+'/auto_'+(++seq))}),runTransaction(fn){const run=serial.then(async()=>{let writing=false;const staged=[];const tx={get:async ref=>{if(writing)throw Error('read after write');return ref.path?snap(ref.path):ref.get()},getAll:async(...refs)=>{if(writing)throw Error('read after write');return Promise.all(refs.map(r=>r.path?snap(r.path):r.get()))}};for(const kind of ['create','set','update','delete'])tx[kind]=(ref,value)=>{writing=true;staged.push([kind,ref.path,value])};const result=await fn(tx);for(const [kind,path,value]of staged){if(kind==='create'&&rows.has(path))throw Error('duplicate create');if(kind==='update'&&!rows.has(path))throw Error('missing update');if(kind==='delete')rows.delete(path);else rows.set(path,kind==='update'?{...rows.get(path),...clone(value)}:clone(value));writes.push({kind,path,value:clone(value)})}return result});serial=run.catch(()=>{});return run}};
 return {db,rows,writes};
}
export function fakeTimestamp(seconds,nanoseconds=0){return Object.freeze({seconds,nanoseconds,toDate:()=>new Date(seconds*1000+Math.floor(nanoseconds/1e6))})}
