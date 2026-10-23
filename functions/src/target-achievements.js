import {monthLedgerPages} from './month-ledger-pages.js';
import {createHash} from 'node:crypto';
export const targetNoticeId=(staffId,branchId,month)=>'t_'+createHash('sha256').update(JSON.stringify([staffId,branchId,month])).digest('hex').slice(0,40);
export function affectedTargetScopes(before,after){const rows=new Map();for(const x of [before,after]){if(!x||!['talkha','mashaya'].includes(x.branchId)||!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(x.dateKey||''))continue;for(const staffId of new Set([x.staffId,...Object.keys(x.workerBreakdown||{})].filter(Boolean))){if(typeof staffId!=='string'||staffId.includes('/')||staffId.length>100)continue;const row={staffId,branchId:x.branchId,month:x.dateKey.slice(0,7)};rows.set(JSON.stringify(row),row);}}return [...rows.values()];}
export function createTargetAchievementHandlers(d){
 const fail=(c,m)=>{throw d.error(c,m);};const readerKey=uid=>createHash('sha256').update(uid).digest('hex').slice(0,40);
 async function check({staffId,branchId,month}){
  if(!staffId||staffId.includes('/')||!['talkha','mashaya'].includes(branchId)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))return false;
  const staffRef=d.db.doc('staff/'+staffId),ref=d.db.doc('targetNotifications/'+targetNoticeId(staffId,branchId,month));
  return d.db.runTransaction(async tx=>{const [staff,note]=await Promise.all([tx.get(staffRef),tx.get(ref)]);if(note.exists||!staff.exists||staff.data().active===false||!staff.data().branchIds?.includes(branchId))return false;
   const target=Number(staff.data().monthlyTargets?.[month]?.[branchId]?.targetAmount);if(!Number.isFinite(target)||target<=0)return false;
   const ledger=await monthLedgerPages(tx,d.ledgerQuery(branchId,month));
   const achieved=d.workerRevenue(ledger,staffId,[branchId]);if(achieved<target)return false;
   tx.create(ref,{staffId,staffName:String(staff.data().nameAr||staffId).slice(0,100),branchId,month,target,achieved,type:'worker-target-achieved',title:'عامل حقق التارجت',body:String(staff.data().nameAr||staffId).slice(0,100)+' حقق هدف '+month+' في '+(branchId==='talkha'?'طلخا':'المشاية'),createdAt:d.timestamp()});return true;
  });
 }
 async function admin(request){await d.requireLiveStaff(request);if(request.auth?.token?.role!=='admin')fail('permission-denied','إشعارات تحقيق الهدف للأدمن فقط');}
 async function list(request){await admin(request);const branch=request.data?.branchId||'all';if(!['all','talkha','mashaya'].includes(branch))fail('invalid-argument','فرع غير صالح');let query=d.db.collection('targetNotifications');const after=request.data?.after;if(after!=null){if(!Number.isSafeInteger(after.seconds)||after.seconds<0||after.seconds>253402300799||!Number.isInteger(after.nanoseconds)||after.nanoseconds<0||after.nanoseconds>=1e9)fail('invalid-argument','مؤشر إشعارات غير صالح');query=query.where('createdAt','>',d.fromParts(after.seconds,after.nanoseconds));}const snapshot=await query.orderBy('createdAt','desc').limit(50).get();const key=readerKey(request.auth.uid);return {cursor:snapshot.readTime?{seconds:snapshot.readTime.seconds,nanoseconds:snapshot.readTime.nanoseconds}:null,items:snapshot.docs.map(doc=>{const x=doc.data();return {id:doc.id,staffId:x.staffId,branchId:x.branchId,month:x.month,title:x.title,body:x.body,target:x.target,achieved:x.achieved,read:x.readBy?.[key]===true,createdAt:x.createdAt?.toDate?.().toISOString()||null};}).filter(x=>branch==='all'||x.branchId===branch),coverage:'آخر50 إشعار تحقيق تارجت مسجل؛ ظهورها حسب الفرع المختار'};}
 async function markRead(request){await admin(request);const ids=request.data?.ids;if(!Array.isArray(ids)||!ids.length||ids.length>50||ids.some(x=>typeof x!=='string'||!/^t_[a-f0-9]{40}$/.test(x)))fail('invalid-argument','إشعارات غير صالحة');const refs=[...new Set(ids)].map(id=>d.db.doc('targetNotifications/'+id));const docs=await d.db.getAll(...refs),batch=d.db.batch(),key=readerKey(request.auth.uid);for(const doc of docs)if(doc.exists)batch.update(doc.ref,{['readBy.'+key]:true});await batch.commit();return {ok:true};}
 return {check,list,markRead};
}
