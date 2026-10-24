import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync as readSourceFileSync} from 'node:fs';
// Git may check text out with CRLF on Windows; keep content baselines platform-independent.
const readFileSync=(path,encoding)=>{
 const value=readSourceFileSync(path,encoding);
 return typeof value==='string'?value.replace(/\r\n/g,'\n'):Buffer.from(value.toString('utf8').replace(/\r\n/g,'\n'),'utf8');
};
import {createHash} from 'node:crypto';
import {scheduling,schedulingGuardId,MAX_ACTIVATION_DAYS} from '../functions/src/scheduling.js';
class HttpsError extends Error { constructor(code,message,details){super(message);this.code=code;this.details=details;} }
const helpers=scheduling({db:null,FieldValue:null,HttpsError});
test('inclusive business calendar dates across Cairo DST use date keys without timezone shifts',()=>assert.deepEqual(helpers.dates('2026-10-30','2026-11-01'),['2026-10-30','2026-10-31','2026-11-01']));
test('leap day range preserved',()=>assert.deepEqual(helpers.dates('2028-02-28','2028-03-01'),['2028-02-28','2028-02-29','2028-03-01']));
test('invalid and reversed date ranges fail closed',()=>{for(const [from,to] of [['2027-02-29','2027-03-01'],['2027-01-02','2027-01-01'],['bad','bad']])assert.throws(()=>helpers.dates(from,to),{code:'invalid-argument'});});
test('atomic limit derived from documented request budget is explicit',()=>{assert.equal(MAX_ACTIVATION_DAYS,128);assert.equal(helpers.dates('2028-01-01','2028-05-07').length,128);assert.throws(()=>helpers.dates('2028-01-01','2028-05-08'),e=>e.details.code==='ATOMIC_LEAVE_RANGE_LIMIT');});
test('global manual leave expands to both branch contexts only',()=>{assert.deepEqual(helpers.context('worker-a','all','2027-01-01').map(row=>row.branchId),['talkha','mashaya']);assert.equal(helpers.context('worker-a','talkha','2027-01-01').length,1);assert.throws(()=>helpers.context('worker-a','other','2027-01-01'));});
test('guard identity separates staff branch and date without delimiter collisions',()=>{const tuples=[['a_b','talkha','2027-01-01'],['a','talkha','2027-01-01'],['a','mashaya','2027-01-01'],['a','talkha','2027-01-02']];assert.equal(new Set(tuples.map(args=>schedulingGuardId(...args))).size,4);});
test('locked baseline preservation: src/admin.css',()=>assert.equal(createHash('sha256').update(readFileSync(new URL('../src/admin.css',import.meta.url))).digest('hex'),'8675375d5ddc4305b4b4d085d75554de4dfc5964e89b2143e13feaf72442d808'));
test('locked baseline preservation: src/worker.css',()=>assert.equal(createHash('sha256').update(readFileSync(new URL('../src/worker.css',import.meta.url))).digest('hex'),'a32dd2dcc34377ba4675d04caa0bab0dcc276d3c155ee1934b6a77d1f78a10c3'));
test('mobile CSS preserved except authorized payroll 44px target inclusion',()=>{const css=readFileSync(new URL('../src/mobile-management.css',import.meta.url),'utf8');assert.match(css, /\.toolbar,\.settings-form,\.editor-fields,\.payroll-actions\)/);assert.equal(createHash('sha256').update(css.replace('.toolbar,.settings-form,.editor-fields,.payroll-actions)','.toolbar,.settings-form,.editor-fields)')).digest('hex'),'d4f9e1d73aa0aa1228c22ea3cc9c480ec1a91a4a3ea210e77118ae96c2defdb6');});
test('worker theme preserves the baseline except owner-authorized desktop switching and palette',()=>{
 let source=readFileSync(new URL('../src/worker-theme.js',import.meta.url),'utf8');
 source=source.replace('root.dataset.theme = preference;','root.dataset.theme = mobile.matches ? preference : desktopTheme;').replace('button.hidden = false;','button.hidden = !mobile.matches;').replace("button?.addEventListener('click', () => {\n    ","button?.addEventListener('click', () => {\n    if (!mobile.matches) return;").replace("color.content = preference === 'dark' ? '#091f2d' : '#f2f6f9'","color.content = mobile.matches ? (preference === 'dark' ? '#03151e' : '#f8fafc') : desktopColor");
 assert.equal(createHash('sha256').update(source).digest('hex'),'ab2ddf8a6023a512701950b458a3503820531ffdf979715aa258b71ffec669de');
});
test('locked baseline preservation: firestore.rules',()=>assert.equal(createHash('sha256').update(readFileSync(new URL('../firestore.rules',import.meta.url))).digest('hex'),'c8c74afdb9ed73c15631363e6a55b0e8de8267d7a108f2a485294ee2ac79b58d'));
test('locked baseline preservation: storage.rules',()=>assert.equal(createHash('sha256').update(readFileSync(new URL('../storage.rules',import.meta.url))).digest('hex'),'58a43d852efc7f56ba182101e714ba15087fa07b0cacc8d5e8d6860bfbf63765'));
test('dependency baseline preserved except authorized Vite 7.3.7 security patch',()=>{
 const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
 const before=JSON.parse(readFileSync(new URL('./fixtures/vite-security-baseline.json',import.meta.url),'utf8'));
 assert.equal(lock.packages['node_modules/vite'].version,'7.3.7');
 assert.equal(lock.packages[''].devDependencies.vite,'7.3.7');
 lock.packages['node_modules/vite']=before.beforeVite;
 lock.packages[''].devDependencies.vite=before.beforeRange;
 assert.equal(createHash('sha256').update(JSON.stringify(lock,null,2)+'\n').digest('hex'),'7f52b37a4e0379c91acce2c68a20b9e3efcd55d31aa5454ef399f151ea346701');
});
test('locked baseline preservation: functions/package-lock.json',()=>assert.equal(createHash('sha256').update(readFileSync(new URL('../functions/package-lock.json',import.meta.url))).digest('hex'),'95e3e8f7f5520ca034f72ee4342a7e9535a937f4f322909cdc9cbd0d86d9de49'));
test('pricing baseline preserved; authorized actor and active-drawer tracking changes only: createPosOrder',()=>{const source=readFileSync(new URL('../functions/src/index.js',import.meta.url),'utf8');let block=source.match(/export const createPosOrder =.*?(?=\nexport const |$)/s)[0];assert.match(block,/Object\.assign\(bookingRecord, receiptActor\(request\), \{createdAt:now\}\)/);block=block.replace(/  \/\/ OFFLINE_POS_BEGIN:[\s\S]*?  \/\/ OFFLINE_POS_END\n/,'').replace('\n\n  const customer =','\n  const customer =');
block=block.replace('      if (offlineOrder) offlineProtocol.match(offlineOrder, existingGuard.data());\n','');
block=block.replace('    if (offlineOrder) offlineProtocol.check(offlineOrder, {items, total:beforeWalletTotal, activeShift, dateKey});\n','');
block=block.replace('    if (offlineOrder) Object.assign(bookingRecord,{offlineOperationId:idempotencyKey,offlineShiftId:offlineOrder.shiftId,offlineSyncedAt:now});\n','');
block=block.replace('...(offlineOrder ? {offlineFingerprint:offlineOrder.fingerprint} : {expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000)})','expiresAt: Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000)');block=block.replace('    Object.assign(bookingRecord, receiptActor(request), {createdAt:now});\n','');block=block.replace('method === "cash" && activeShift ? activeShift.ref : null','method === "cash" && settings.cashDrawerEnabled === true ? activeShift?.ref : null');assert.equal(createHash('sha256').update(block.replace('ledgerShiftInTransaction(transaction, branch.id, method === \"cash\" && settings.cashDrawerEnabled === true, request)', 'ledgerShiftInTransaction(transaction, branch.id, method === \"cash\" && settings.cashDrawerEnabled === true)')).digest('hex'),'a0dff8568d373c8164d7dcdfb3cd55d4ab7f5445313d3e1f7026013ea793d7ef');});
test('Phase12.3E.1 authorized payroll posting delegates to the isolated financial module',()=>{const source=readFileSync(new URL('../functions/src/index.js',import.meta.url),'utf8');assert.match(source,/recordPayrollPayment = onCall\(adminOptions, payrollPosting\(/);const payroll=readFileSync(new URL('../functions/src/payroll-posting.js',import.meta.url),'utf8');assert.match(payroll,/calculatePayroll\(\{\.\.\.staff,revenue,adjustment\}\)/);assert.doesNotMatch(payroll,/workerLeaves|appointmentLocks|workerRequests/);});
