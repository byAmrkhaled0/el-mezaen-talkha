import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { workerRequestHandlers,requestReviewerAllowed } from '../functions/src/worker-requests.js';
import { effectivePermissions } from '../functions/src/authorization.js';
import { MemoryFirestore,FakeTimestamp,FakeFieldValue } from './worker-requests-memory.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
const request=(role='worker',branchIds=['talkha'],uid=role==='worker'?'worker-a':role)=>({auth:{uid,token:{role,branchIds,permissions:role==='manager'?['payroll']:[]}},data:{}});
const invoke=(handler,actor,data)=>handler({...actor,data});
function fixture(){
 const db=new MemoryFirestore(),notifications=[],rates=[];
 db.seed('staff/staff-a',{nameAr:'عامل أ',active:true,userUid:'worker-a',branchIds:['talkha','mashaya']});
 db.seed('staff/staff-b',{nameAr:'عامل ب',active:true,userUid:'worker-b',branchIds:['talkha']});
 const requireRole=(req,roles)=>{if(!req.auth)throw new HttpsError('unauthenticated','login');if(roles&&!roles.includes(req.auth.token.role))throw new HttpsError('permission-denied','role');return req.auth.token.role;};
 const h=workerRequestHandlers({db,Timestamp:FakeTimestamp,FieldValue:FakeFieldValue,HttpsError,requireRole,
 requireLiveStaff:async req=>{requireRole(req);if(req.auth.disabled)throw new HttpsError('permission-denied','disabled');},
 requireLiveAdmin:async req=>{requireRole(req,['admin']);if(req.auth.disabled)throw new HttpsError('permission-denied','disabled');},
 linkedStaffId:async req=>req.auth.uid==='worker-b'?'staff-b':'staff-a',branchesFor:req=>req.auth.token.branchIds,
 permissionsFor:req=>effectivePermissions(req.auth.token.role,req.auth.token.permissions),rateLimit:async(...args)=>rates.push(args.slice(1)),notify:async(...args)=>notifications.push(args)});
 db.seed('settings/workerAdvance_staff-a',{staffId:'staff-a',enabled:true,maxPerRequest:2000,version:1});
 return {db,h,notifications,rates};
}
let sequence=0;
const advance=(amount=1000,extra={})=>({branchId:'talkha',requestType:'SALARY_ADVANCE',requestData:{amount,reason:'سبب اختباري',note:''},idempotencyKey:`request-test-${String(++sequence).padStart(8,'0')}`,...extra});
const leave=(startDate='2026-11-01',endDate='2026-11-03',extra={})=>({branchId:'talkha',requestType:'LEAVE',requestData:{startDate,endDate,leaveType:'PERSONAL',reason:'سبب اختباري',note:''},idempotencyKey:`leave-test-${String(++sequence).padStart(8,'0')}`,...extra});
const update=(row,action,extra={})=>({requestId:row.requestId,action,note:['REVIEW','REJECT'].includes(action)?'ملاحظة اختباريّة':'',expectedVersion:row.version||1,idempotencyKey:`action-test-${String(++sequence).padStart(8,'0')}`,...extra});
const denied=promise=>assert.rejects(promise,{code:'permission-denied'});
const rows=(db,collection)=>[...db.rows].filter(([p])=>p.startsWith(collection+'/')).map(([,row])=>row);

test('canonical worker identity rejects staffId, client limits, status and unapproved branch payloads',async()=>{
 const {h,db}=fixture(),worker=request();
 for(const extra of [{staffId:'staff-b'},{maxPerRequest:9000},{status:'APPROVED'}])await assert.rejects(invoke(h.submitWorkerRequest,worker,advance(1000,extra)),{code:'invalid-argument'});
 await denied(invoke(h.submitWorkerRequest,worker,advance(1000,{branchId:'mashaya'})));
 const result=await invoke(h.submitWorkerRequest,worker,advance());assert.equal(db.rows.get('workerRequests/'+result.requestId).staffId,'staff-a');
});
test('missing or disabled advance policy blocks submission without a default',async()=>{
 for(const config of [null,{enabled:false,maxPerRequest:2000},{enabled:true,maxPerRequest:0}]){
  const {h,db}=fixture();if(config)db.seed('settings/workerAdvance_staff-a',config);else db.rows.delete('settings/workerAdvance_staff-a');
  await assert.rejects(invoke(h.submitWorkerRequest,request(),advance()),{code:'failed-precondition'});assert.equal(rows(db,'workerRequests').length,0);
 }
});
test('amount validation enforces each request maximum and valid finite cents',async()=>{
 const {h}=fixture();for(const amount of [-1,0,2000.01,NaN,Infinity,'100',0.001])await assert.rejects(invoke(h.submitWorkerRequest,request(),advance(amount)),{code:'invalid-argument'});
 await invoke(h.submitWorkerRequest,request(),advance(2000));
});
test('multiple requests in the same month remain valid beyond cumulative configured limit',async()=>{
 const {h,db,rates}=fixture();for(let i=0;i<4;i++)await invoke(h.submitWorkerRequest,request(),advance(2000));
 assert.equal(rows(db,'workerRequests').length,4);assert.equal(rows(db,'workerRequests').reduce((n,r)=>n+r.requestData.amount,0),8000);
 assert.ok(rates.every(args=>args[1]===30&&args[2]===60000));
});
test('repeated submission creates one request, history, audit and reviewer inbox document',async()=>{
 const {h,db}=fixture(),data=advance();const a=await invoke(h.submitWorkerRequest,request(),data),b=await invoke(h.submitWorkerRequest,request(),data);
 assert.equal(a.requestId,b.requestId);assert.equal(b.idempotent,true);assert.equal(rows(db,'workerRequests').length,1);assert.equal(rows(db,'workerNotifications').length,1);assert.equal(rows(db,'activityLogs').length,1);
 await assert.rejects(invoke(h.submitWorkerRequest,request(),{...data,requestData:{...data.requestData,amount:500}}),{code:'already-exists'});
});
test('only Admin configures advance limits and changes preserve audited snapshots',async()=>{
 const {h,db}=fixture();for(const role of ['manager','cashier','worker'])await denied(invoke(h.setWorkerAdvancePolicy,request(role),{staffId:'staff-a',enabled:true,maxPerRequest:100,expectedVersion:1}));
 const submitted=await invoke(h.submitWorkerRequest,request(),advance(2000));
 await invoke(h.setWorkerAdvancePolicy,request('admin'),{staffId:'staff-a',enabled:true,maxPerRequest:100,expectedVersion:1});
 assert.equal(db.rows.get('workerRequests/'+submitted.requestId).advancePolicySnapshot.maxPerRequest,2000);
 await invoke(h.updateWorkerRequest,request('admin'),update(submitted,'APPROVE'));
 assert.equal(db.rows.get('workerRequests/'+submitted.requestId).approvedAmount,2000);
 assert.equal(db.rows.get('activityLogs/advance_policy_staff-a_2').before.maxPerRequest,2000);
 await assert.rejects(invoke(h.setWorkerAdvancePolicy,request('admin'),{staffId:'staff-a',enabled:false,maxPerRequest:null,expectedVersion:1}),{code:'aborted'});
});
test('Admin can disable requests while an existing idempotent submission remains unchanged',async()=>{
 const {h}=fixture(),data=advance();await invoke(h.submitWorkerRequest,request(),data);
 await invoke(h.setWorkerAdvancePolicy,request('admin'),{staffId:'staff-a',enabled:false,maxPerRequest:null,expectedVersion:1});
 assert.equal((await invoke(h.submitWorkerRequest,request(),data)).idempotent,true);
 await assert.rejects(invoke(h.submitWorkerRequest,request(),advance()),{code:'failed-precondition'});
});
test('worker cannot self-approve, edit amounts or cancel another workers request',async()=>{
 const {h,db}=fixture(),row=await invoke(h.submitWorkerRequest,request(),advance());
 for(const action of ['APPROVE','REJECT','REVIEW'])await denied(invoke(h.updateWorkerRequest,request(),update(row,action)));
 await denied(invoke(h.updateWorkerRequest,request('worker',['talkha'],'worker-b'),update(row,'CANCEL')));
 await assert.rejects(invoke(h.updateWorkerRequest,request(),update(row,'CANCEL',{requestData:{amount:50}})),{code:'invalid-argument'});
 assert.equal(db.rows.get('workerRequests/'+row.requestId).status,'PENDING');
});
test('manager review requires existing payroll permission and strict branch scope; final decisions require Admin',async()=>{
 const {h}=fixture(),row=await invoke(h.submitWorkerRequest,request(),advance());
 await denied(invoke(h.updateWorkerRequest,request('manager',['mashaya']),update(row,'REVIEW')));
 const noPermission=request('manager');noPermission.auth.token.permissions=[];await denied(invoke(h.updateWorkerRequest,noPermission,update(row,'REVIEW')));
 await invoke(h.updateWorkerRequest,request('manager'),update(row,'REVIEW'));
 for(const role of ['manager','cashier'])for(const action of ['APPROVE','REJECT'])await denied(invoke(h.updateWorkerRequest,request(role),update({...row,version:2},action)));
});
test('only Admin finalizes; approved advance creates no cash movement, payroll deduction or ledger',async()=>{
 const {h,db}=fixture(),row=await invoke(h.submitWorkerRequest,request(),advance());
 await invoke(h.updateWorkerRequest,request('admin'),update(row,'APPROVE'));
 const saved=db.rows.get('workerRequests/'+row.requestId);assert.equal(saved.status,'APPROVED');assert.equal(saved.disbursementReference,null);assert.equal(saved.integrationStatus,'AWAITING_DISBURSEMENT');assert.equal(saved.finalDecisionActor,'admin');assert.ok(saved.finalDecisionAt instanceof FakeTimestamp);
 for(const collection of ['cashMovements','revenueLedger','payrollPayments','expenses','workerLeaves'])assert.equal(rows(db,collection).length,0);
});
test('repeat approval is idempotent and closed requests reject new transitions or DISBURSED',async()=>{
 const {h,db}=fixture(),row=await invoke(h.submitWorkerRequest,request(),advance()),data=update(row,'APPROVE');
 await invoke(h.updateWorkerRequest,request('admin'),data);const count=db.writes.length;assert.equal((await invoke(h.updateWorkerRequest,request('admin'),data)).idempotent,true);assert.equal(db.writes.length,count);
 for(const action of ['REVIEW','REJECT','APPROVE'])await assert.rejects(invoke(h.updateWorkerRequest,request('admin'),update({...row,version:2},action)),{code:'failed-precondition'});
 await assert.rejects(invoke(h.updateWorkerRequest,request('admin'),update(row,'DISBURSED')),{code:'invalid-argument'});
 await assert.rejects(invoke(h.updateWorkerRequest,request(),update({...row,version:2},'CANCEL')),{code:'failed-precondition'});
});
test('pending worker cancellation and Admin rejection persist notes and deduplicated own notifications',async()=>{
 const {h,db}=fixture();for(const action of ['CANCEL','REJECT']){
  const row=await invoke(h.submitWorkerRequest,request(),advance()),data=update(row,action,{note:'رد اختباري'}),actor=action==='CANCEL'?request():request('admin');
  await invoke(h.updateWorkerRequest,actor,data);await invoke(h.updateWorkerRequest,actor,data);
  const own=rows(db,'workerNotifications').filter(n=>n.requestId===row.requestId&&n.staffId==='staff-a');assert.equal(own.length,1);assert.ok(Object.values(db.rows.get('workerRequests/'+row.requestId).reviewHistory).some(e=>e.note==='رد اختباري'));
 }
});
test('stale revisions reject conflicting reviewers without modifying history',async()=>{
 const {h,db}=fixture(),row=await invoke(h.submitWorkerRequest,request(),advance());await invoke(h.updateWorkerRequest,request('manager'),update(row,'REVIEW'));
 await assert.rejects(invoke(h.updateWorkerRequest,request('admin'),update(row,'APPROVE')),{code:'aborted'});assert.equal(Object.keys(db.rows.get('workerRequests/'+row.requestId).reviewHistory).length,2);
});
test('inactive worker or mismatched staff UID cannot submit or read own requests',async()=>{
 for(const patch of [{active:false},{userUid:'someone-else'}]){const {h,db}=fixture();db.seed('staff/staff-a',{...db.rows.get('staff/staff-a'),...patch});await denied(invoke(h.submitWorkerRequest,request(),advance()));await denied(invoke(h.getWorkerRequests,request(),{branchId:'talkha'}));}
});
test('canonical assignments constrain worker claims even when another branch is claimed',async()=>{
 const {h,db}=fixture();db.seed('staff/staff-a',{...db.rows.get('staff/staff-a'),branchIds:['talkha']});
 await denied(invoke(h.submitWorkerRequest,request('worker',['talkha','mashaya']),advance(1000,{branchId:'mashaya'})));
 await denied(invoke(h.getWorkerRequests,request('worker',['talkha','mashaya']),{branchId:'mashaya'}));
});
test('request listing is own-only for worker and branch-scoped for manager',async()=>{
 const {h}=fixture();await invoke(h.submitWorkerRequest,request(),advance());await invoke(h.submitWorkerRequest,request('worker',['talkha','mashaya']),advance(1000,{branchId:'mashaya'}));
 const own=await invoke(h.getWorkerRequests,request(),{branchId:'talkha',staffId:'staff-b'});assert.equal(own.items.length,1);assert.ok(own.items.every(r=>r.staffId==='staff-a'&&r.branchId==='talkha'));
 assert.equal((await invoke(h.getWorkerRequests,request('manager'),{branchId:'all'})).items.length,1);
 await denied(invoke(h.getWorkerRequests,request('manager'),{branchId:'mashaya'}));await denied(invoke(h.getWorkerRequests,request('cashier'),{branchId:'all'}));
 assert.equal((await invoke(h.getWorkerRequests,request('admin'),{branchId:'all'})).items.length,2);
});
test('cursor pages and status filters remain bounded without duplicate rows or scope leaks',async()=>{
 const {h,db}=fixture();for(let i=0;i<29;i++)await invoke(h.submitWorkerRequest,request(),advance());
 const page=await invoke(h.getWorkerRequests,request(),{branchId:'talkha',status:'PENDING'});assert.equal(page.items.length,25);assert.ok(page.nextCursor);
 const second=await invoke(h.getWorkerRequests,request(),{branchId:'talkha',status:'PENDING',cursor:page.nextCursor});assert.equal(second.items.length,4);assert.equal(new Set([...page.items,...second.items].map(r=>r.requestId)).size,29);assert.equal(second.nextCursor,null);
 assert.ok(db.reads.every(q=>q.size<=26));await assert.rejects(invoke(h.getWorkerRequests,request(),{branchId:'talkha',cursor:{id:'x',createdAt:'bad'}}),{code:'invalid-argument'});
});
test('leave validates real dates, order, required reason and administrative type',async()=>{
 const {h}=fixture();for(const data of [leave('2026-02-30','2026-03-01'),leave('2026-11-03','2026-11-01'),leave(undefined,undefined,{requestData:{startDate:'2026-11-01',endDate:'2026-11-03',leaveType:'PAID',reason:'reason'}})])await assert.rejects(invoke(h.submitWorkerRequest,request(),data),{code:'invalid-argument'});
});
test('leave request detects overlapping pending requests and existing approved leaves',async()=>{
 const {h,db}=fixture();await invoke(h.submitWorkerRequest,request(),leave());await assert.rejects(invoke(h.submitWorkerRequest,request(),leave('2026-11-03','2026-11-05')),{code:'already-exists'});
 db.seed('workerLeaves/approved-leave',{staffId:'staff-a',branchId:'all',active:true,dateKey:'2026-12-10'});
 await assert.rejects(invoke(h.submitWorkerRequest,request(),leave('2026-12-09','2026-12-11')),{code:'already-exists'});
 await invoke(h.submitWorkerRequest,request(),leave('2026-11-04','2026-11-05'));
});
test('concurrent overlapping submissions serialize through worker/branch guard in the test adapter',async()=>{
 const {h,db}=fixture();const results=await Promise.allSettled([invoke(h.submitWorkerRequest,request(),leave()),invoke(h.submitWorkerRequest,request(),leave())]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.ok(db.rows.has('settings/workerRequestLock_staff-a_talkha'));
});
test('leave approval is administrative only and rechecks active leave conflicts',async()=>{
 const {h,db}=fixture(),row=await invoke(h.submitWorkerRequest,request(),leave());
 await invoke(h.updateWorkerRequest,request('admin'),update(row,'APPROVE'));
 assert.equal(db.rows.get('workerRequests/'+row.requestId).integrationStatus,'AWAITING_LEAVE_INTEGRATION');assert.equal(rows(db,'workerLeaves').length,0);
 const another=await invoke(h.submitWorkerRequest,request(),leave('2026-12-01','2026-12-02'));db.seed('workerLeaves/later',{staffId:'staff-a',branchId:'talkha',dateKey:'2026-12-01',active:true});await assert.rejects(invoke(h.updateWorkerRequest,request('admin'),update(another,'APPROVE')),{code:'already-exists'});
});
test('request notifications are generic, branch-attributed, durable and limited to authorized reviewer recipients',async()=>{
 const {h,db}=fixture(),row=await invoke(h.submitWorkerRequest,request(),advance());const note=rows(db,'workerNotifications')[0];assert.equal(note.branchId,'talkha');assert.equal(note.reviewerInbox,true);assert.equal(note.staffId,undefined);assert.doesNotMatch(note.body,/1000|سبب اختباري/);
 const user=role=>({uid:role,customClaims:{role,branchIds:['talkha'],permissions:['payroll']}});
 assert.equal(requestReviewerAllowed(user('admin'),null,'mashaya'),true);assert.equal(requestReviewerAllowed(user('cashier'),{role:'cashier'},'talkha'),false);
 assert.equal(requestReviewerAllowed(user('manager'),{role:'manager',active:true,branchIds:['talkha']},'talkha'),true);assert.equal(requestReviewerAllowed(user('manager'),{role:'manager',active:true,branchIds:['talkha']},'mashaya'),false);
 await invoke(h.updateWorkerRequest,request('admin'),update(row,'REJECT'));assert.equal(rows(db,'workerNotifications').filter(n=>n.staffId==='staff-a').length,1);
});
test('closed payroll, financial/availability engines, Rules and role ceilings are untouched by request handlers',()=>{
 const source=read('functions/src/worker-requests.js');assert.doesNotMatch(source,/collection\(['"](?:cashMovements|revenueLedger|payrollPayments|expenses)['"]\)|recordPayrollPayment|calculatePayroll|addCashMovement/);
 assert.match(read('firestore.rules'),/match \/\{document=\*\*\}[\s\S]*allow read, write: if false/);
 assert.equal(effectivePermissions('worker',['payroll']).has('payroll'),false);assert.equal(effectivePermissions('cashier',['payroll']).has('payroll'),false);
 const css=read('src/worker-requests.css');assert.match(css,/@media\(max-width:720px\)/);assert.doesNotMatch(read('src/app.js'),/worker-requests|request-center/);
 assert.match(read('src/worker.js'),/requestCenter\.contextChanged\(\)/);assert.match(read('src/admin.js'),/workerRequests: "payroll"/);
});
