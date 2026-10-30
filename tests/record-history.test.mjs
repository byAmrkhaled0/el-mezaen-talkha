import test from 'node:test';
import assert from 'node:assert/strict';
import {recordMatches,historyCursor} from '../functions/src/record-history.js';
import {collectRecordPages} from '../src/record-history-client.js';
test('revenue filters include inclusive dates, worker, service and signed refunds',()=>{
 const filter={from:'2026-09-01',to:'2026-09-30',staff:'ali',service:'beard'};
 const row={dateKey:'2026-09-01',staffId:'ali',itemIds:['beard'],amount:-50};
 assert.equal(recordMatches(row,'revenue',filter),true);
 for(const override of [{dateKey:'2026-08-31'},{dateKey:'2026-10-01'},{staffId:'other'},{itemIds:['hair']}])assert.equal(recordMatches({...row,...override},'revenue',filter),false);
});
test('booking exports honor all screen filters and exclude POS orders',()=>{
 const filters={date:'2026-10-30',status:'active',payment:'unpaid',query:'+201012345678'};
 const row={id:'a',bookingDate:filters.date,status:'confirmed',paymentStatus:'unpaid',phone:'01012345678'};
 assert.equal(recordMatches(row,'bookings',filters),true);
 for(const override of [{source:'pos'},{status:'completed'},{paymentStatus:'paid'},{bookingDate:'2026-10-29'}])assert.equal(recordMatches({...row,...override},'bookings',filters),false);
 assert.equal(recordMatches({...row,customerName:'Ahmed'},'bookings',{...filters,query:'ahmed'}),true);
});
test('complete export follows empty scanned pages, deduplicates IDs and preserves selected scope',async()=>{
 const calls=[],filters={kind:'revenue',branchId:'talkha',from:'2026-09-01',service:'beard'};
 const rows=await collectRecordPages(async input=>{calls.push(input);return calls.length===1?{items:[],nextCursor:'a'}:calls.length===2?{items:[{id:'one',amount:-10}],nextCursor:'b'}:{items:[{id:'one',amount:-10},{id:'two',amount:20}],nextCursor:null};},filters);
 assert.deepEqual(rows.map(r=>r.id),['one','two']);assert.equal(calls.length,3);assert.equal(calls[2].cursor,'b');for(const call of calls)assert.equal(call.service,'beard');
});
test('export aborts on failed or repeated pages and never returns a partial result',async()=>{
 await assert.rejects(collectRecordPages(async()=>({items:[{id:'one'}],nextCursor:'a'}),{}),/متكرر/);
 await assert.rejects(collectRecordPages(async()=>{throw Error('offline');},{}),/offline/);
 await assert.rejects(collectRecordPages(async()=>({items:[{id:'one'}],nextCursor:'a'}),{},{maxPages:1}),/فترة أصغر/);
});
test('history cursor cannot be replayed for another account, stream or filter scope',()=>{
 const fail=()=>Error('invalid');const cursor=Buffer.from(JSON.stringify({scope:'owner-a',id:'one'})).toString('base64url');
 assert.equal(historyCursor(cursor,'owner-a',fail).id,'one');assert.throws(()=>historyCursor(cursor,'owner-b',fail));assert.throws(()=>historyCursor('not-json','owner-a',fail));
});
