import test from 'node:test';
import assert from 'node:assert/strict';
import {monthLedgerPages} from '../functions/src/month-ledger-pages.js';
import {backgroundRetry} from '../functions/src/background-retry.js';
function ledger(total,{failPage}={}) {
 const docs=Array.from({length:total},(_,i)=>({id:String(i),ref:{path:'revenueLedger/'+i},data:()=>({branchId:'talkha',amount:i%7===0?-1:1,staffId:'w1'})}));
 const reads=[];
 const query=(start=0)=>({startAfter:cursor=>query(Number(cursor.id)+1),limit:size=>({start,size})});
 const tx={get:async q=>{reads.push(q);if(reads.length===failPage)throw Error('offline');return {docs:docs.slice(q.start,q.start+q.size)};}};
 return {docs,reads,tx,query:query()};
}
for(const size of [0,1,499,500,501,2501])test(`complete scoped ledger includes all ${size} records`,async()=>{
 const f=ledger(size),rows=await monthLedgerPages(f.tx,f.query);
 assert.equal(rows.length,size);assert.equal(new Set(rows.map(x=>x.id)).size,size);
 assert.equal(f.reads.length,Math.floor(size/500)+1);
 assert.equal(rows.reduce((n,x)=>n+x.amount,0),f.docs.reduce((n,x)=>n+x.data().amount,0));
});
test('failed later page never returns a partial monthly result',async()=>{const f=ledger(2501,{failPage:3});await assert.rejects(monthLedgerPages(f.tx,f.query),/offline/);});
function retries() {
 const docs=new Map(),logs=[];
 const db={doc:path=>({path}),runTransaction:async fn=>fn({get:async ref=>({exists:docs.has(ref.path),data:()=>docs.get(ref.path)}),set:(ref,value)=>docs.set(ref.path,{...docs.get(ref.path),...value})})};
 return {docs,logs,run:backgroundRetry({db,timestamp:()=>1,now:()=>Date.parse('2026-10-23T12:00:00Z'),report:(...x)=>logs.push(x)})};
}
test('successful event does not create a failure record or extra read',async()=>{const f=retries();assert.equal(await f.run('task',{id:'1'},async()=>42),42);assert.equal(f.docs.size,0);});
test('transient failure is rethrown until bounded eighth failure with durable review state',async()=>{
 const f=retries(),error=Object.assign(Error('temporary'),{code:'unavailable'});
 for(let i=1;i<8;i++)await assert.rejects(f.run('task',{id:'1'},async()=>{throw error;}),error);
 assert.deepEqual(await f.run('task',{id:'1'},async()=>{throw error;}),{needsReview:true,code:'unavailable'});
 assert.equal(f.docs.size,1);assert.equal([...f.docs.values()][0].attempts,8);assert.equal([...f.docs.values()][0].state,'NEEDS_REVIEW');
});
test('permanent failures are recorded once without a seven day native retry loop',async()=>{for(const code of [3,5,7,9,'permission-denied','failed-precondition']){const f=retries();const r=await f.run('target',{id:'e'},async()=>{throw Object.assign(Error('private input'),{code});});assert.equal(r.needsReview,true);assert.ok(!JSON.stringify([...f.docs]).includes('private input'));}});
test('expired event is recorded for review without executing an obsolete side effect',async()=>{const f=retries();let ran=false;assert.equal((await f.run('task',{id:'old',time:'2026-10-21T00:00:00Z'},async()=>{ran=true;})).needsReview,true);assert.equal(ran,false);});
test('failure budgets are isolated by function and event identity',async()=>{const f=retries();for(const [name,id] of [['a','1'],['a','2'],['b','1']])await assert.rejects(f.run(name,{id},async()=>{throw Error('transient');}));assert.equal(f.docs.size,3);});
