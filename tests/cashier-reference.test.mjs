import test from 'node:test';
import assert from 'node:assert/strict';
import {CASHIER_STEPS,cashierStepError,groupCashierCatalog,recentCashierCustomers} from '../src/cashier-reference-model.js';
test('invoice steps require an identified customer and selected items before payment',()=>{
 assert.deepEqual(CASHIER_STEPS,['العميل','الملف','الخدمات','الدفع']);
 const valid=p=>/^01\d{9}$/.test(p);
 assert.ok(cashierStepError(0,{firstName:'  ',phone:'01000000000'},valid));
 assert.ok(cashierStepError(0,{firstName:'Test',phone:'invalid'},valid));
 assert.ok(cashierStepError(0,{firstName:'Test',phone:'invalid'},()=>{throw Error()}));
 assert.equal(cashierStepError(0,{firstName:'Test',phone:'01000000000'},valid),'');
 assert.ok(cashierStepError(2,{items:[]}));
 assert.equal(cashierStepError(2,{items:[{id:'one'}]}),'');
});
test('reference category presentation preserves catalog prices, IDs and package choices',()=>{
 const items=[{id:'a',section:'service',categoryId:'c',category:'شعر',nameAr:'قص',price:120},{id:'b',section:'package',category:'باقة',nameAr:'باقة',price:240,choiceGroups:[{id:'x'}]}];
 const before=JSON.stringify(items),groups=groupCashierCatalog(items);
 assert.equal(groups.length,2);assert.equal(groups[1].items[0],items[1]);assert.equal(JSON.stringify(items),before);
 assert.deepEqual(groupCashierCatalog(items,{query:'قص',section:'service',category:'c'})[0].items,[items[0]]);
 assert.equal(groupCashierCatalog(items,{query:'missing'}).length,0);
 assert.equal(groupCashierCatalog(items,{section:'package',category:'c'})[0].items[0],items[1]);
});
test('customer list merges only supplied authorized rows without inventing visit totals',()=>{
 const rows=recentCashierCustomers([{id:'existing',firstName:'Cached',phone:'01000000000'}],[{phone:'01000000000',customerName:'Other'},{phone:'01100000000',customerName:'Demo Person',phoneHash:'known'},{customerName:'No phone'}]);
 assert.equal(rows.length,2);assert.equal(rows[0].firstName,'Cached');assert.equal(rows[1].lastName,'Person');assert.equal(rows[1].id,'known');assert.equal(rows[1].fromRecent,true);assert.equal(rows[1].totalVisits,undefined);
});
