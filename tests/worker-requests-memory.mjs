// Test adapter, not a Firebase emulator. Transactions are serialized and atomic.
export class FakeTimestamp {
  constructor(ms,nanoseconds){this.ms=nanoseconds==null?ms:ms*1000+nanoseconds/1e6;} get seconds(){return Math.floor(this.ms/1000);} get nanoseconds(){return Math.round((this.ms-this.seconds*1000)*1e6);} toMillis(){return this.ms;} toDate(){return new Date(this.ms);} static fromMillis(ms){return new FakeTimestamp(ms);}
}
const field=(object,path)=>path==='__name__'?object.id:path.split('.').reduce((value,key)=>value?.[key],object);
const value=v=>v instanceof FakeTimestamp?v.ms:v;
const copy=v=>v instanceof FakeTimestamp?new FakeTimestamp(v.ms):Array.isArray(v)?v.map(copy):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,copy(x)])):v;
function put(target,path,value){const parts=path.split('.'),last=parts.pop();let at=target;for(const part of parts)at=at[part] ||= {};at[last]=value;}
class Query {
  constructor(db,name,filters=[],orders=[],size=null,cursor=null){Object.assign(this,{db,name,filters,orders,size,cursor});}
  where(...filter){return new Query(this.db,this.name,[...this.filters,filter],this.orders,this.size,this.cursor);}
  orderBy(name,direction='asc'){return new Query(this.db,this.name,this.filters,[...this.orders,[name,direction]],this.size,this.cursor);}
  limit(size){return new Query(this.db,this.name,this.filters,this.orders,size,this.cursor);}
  startAfter(...cursor){return new Query(this.db,this.name,this.filters,this.orders,this.size,cursor);}
  doc(id){return this.db.doc(`${this.name}/${id||`test-auto-${++this.db.sequence}`}`);}
  async get(){return this.db.readQuery(this);}
}
export class MemoryFirestore {
  constructor(){this.rows=new Map();this.sequence=0;this.clock=1791547200000;this.reads=[];this.writes=[];this.queue=Promise.resolve();}
  seed(path,data){this.rows.set(path,copy(data));}
  doc(path){return {path,id:path.split('/').at(-1),get:async()=>this.snapshot(path)};}
  collection(name){return new Query(this,name);}
  snapshot(path){const data=this.rows.get(path);return {id:path.split('/').at(-1),exists:data!==undefined,data:()=>copy(data)};}
  readQuery(query){
    if(query.size==null)throw Error('Unbounded query in test');this.reads.push(query);
    let rows=[...this.rows].filter(([path])=>path.startsWith(query.name+'/')&&path.split('/').length===2).map(([path,data])=>({path,id:path.split('/')[1],...copy(data)}));
    for(const [name,operator,expected]of query.filters)rows=rows.filter(row=>{const actual=value(field(row,name)),test=value(expected);return operator==='=='?actual===test:operator==='in'?test.includes(actual):operator==='<='?actual<=test:operator==='>='?actual>=test:operator==='array-contains'?actual?.includes(test):false;});
    const compare=(a,b)=>{for(const [name,direction]of query.orders){const x=value(field(a,name)),y=value(field(b,name));if(x!==y)return (x<y?-1:1)*(direction==='desc'?-1:1);}return 0;};
    rows.sort(compare);
    if(query.cursor){const pivot={};query.orders.forEach(([name],i)=>put(pivot,name==='__name__'?'id':name,query.cursor[i]));rows=rows.filter(row=>compare(row,pivot)>0);}
    const docs=rows.slice(0,query.size).map(row=>this.snapshot(row.path));return {docs,empty:!docs.length,size:docs.length};
  }
  async runTransaction(callback){
    const run=async()=>{
      let writing=false;const staged=[];
      const tx={get:async ref=>{if(writing)throw Error('Firestore reads after writes');return ref instanceof Query?this.readQuery(ref):this.snapshot(ref.path);},
        create:(ref,data)=>{writing=true;staged.push(['create',ref.path,data]);},set:(ref,data)=>{writing=true;staged.push(['set',ref.path,data]);},update:(ref,data)=>{writing=true;staged.push(['update',ref.path,data]);}};
      const result=await callback(tx);const now=new FakeTimestamp(++this.clock);
      const resolve=v=>v?.__serverTimestamp?now:v instanceof FakeTimestamp?copy(v):Array.isArray(v)?v.map(resolve):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolve(x)])):v;
      for(const [operation,path]of staged)if(operation==='create'&&this.rows.has(path))throw Error('Duplicate create');
      for(const [operation,path,input]of staged){const data=resolve(input);if(operation==='update'){const row=copy(this.rows.get(path));for(const [k,v]of Object.entries(data))put(row,k,v);this.rows.set(path,row);}else this.rows.set(path,data);this.writes.push([operation,path]);}
      return result;
    };
    const next=this.queue.then(run,run);this.queue=next.catch(()=>{});return next;
  }
}
export const FakeFieldValue={serverTimestamp:()=>({__serverTimestamp:true})};
