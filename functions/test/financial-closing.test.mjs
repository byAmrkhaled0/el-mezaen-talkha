import test from 'node:test';
import assert from 'node:assert/strict';
import {financialDayRef,consolidatedDayClosing} from '../src/financial-closing.js';
import {cairoDateKey} from '../src/reporting.js';
const db={doc:path=>({path})};
test('shared accounting guards use settings and separate dates; physical scopes reuse branch state',()=>{
 assert.equal(financialDayRef(db,'all','2026-10-10').path,'settings/financialDay_all_2026-10-10');
 assert.notEqual(financialDayRef(db,'all','2026-10-10').path,financialDayRef(db,'all','2026-10-11').path);
 assert.equal(financialDayRef(db,'talkha','2026-10-10').path,'cashShiftState/talkha');
 assert.equal(financialDayRef(db,'mashaya','2026-10-10').path,'cashShiftState/mashaya');
});
test('Cairo closing keys roll over at local midnight rather than UTC midnight',()=>{
 assert.equal(cairoDateKey(new Date('2026-10-10T20:59:59Z')),'2026-10-10');
 assert.equal(cairoDateKey(new Date('2026-10-10T21:00:00Z')),'2026-10-11');
});
test('historical closings without approved shared contract are not silently marked final',async()=>{
 const snapshot=row=>({exists:!!row,data:()=>row});
 const fake={...db,getAll:async()=>[snapshot({status:'CLOSED'}),snapshot({status:'CLOSED'}),snapshot({status:'CLOSED',expenses:99})]};
 const result=await consolidatedDayClosing(fake,'2020-01-01',s=>s.data());
 assert.equal(result.status,'NOT_FINAL');assert.deepEqual(result.missingScopes,['all']);assert.equal(result.expenses,undefined);
});
