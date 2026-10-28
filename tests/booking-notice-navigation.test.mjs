import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/admin.js',import.meta.url),'utf8');
test('booking notice closes inbox and opens its exact booking without depending on list filters',async()=>{
 const fragment=source.slice(source.indexOf('  const calendarBooking = event.target.closest'),source.indexOf('  const calendarBooking = event.target.closest')+700);
 const handler=fragment.slice(0,fragment.indexOf('return openReceiptDrawer(calendarBooking.dataset.calendarBooking);')+'return openReceiptDrawer(calendarBooking.dataset.calendarBooking);'.length)+' }';
 const calls=[];const row={dataset:{calendarBooking:'scoped-booking'},closest:()=>({close:()=>calls.push('close')})};
 const run=new Function('event','openReceiptDrawer',handler);
 const result=run({target:{closest:selector=>selector==='[data-calendar-booking]'?row:null}},id=>{calls.push(id);return 'opened';});
 assert.equal(result,'opened');assert.deepEqual(calls,['close','scoped-booking']);
 assert.equal(run({target:{closest:()=>null}},()=>{throw Error('unrelated click');}),undefined);
});
