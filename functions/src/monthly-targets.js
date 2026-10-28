import {assertInitialTarget,cairoTargetMonth} from './target-policy.js';
// Monthly presentation targets only. Never posts revenue, payroll or bonuses.
export function targetMeter(target, achieved) {
 target=Math.max(0,Number(target)||0); achieved=Number(achieved)||0;
 return {target,achieved,remaining:target?Math.max(0,target-achieved):null,progressPercent:target?Math.max(0,Math.min(100,achieved/target*100)):null,achievedTarget:target>0&&achieved>=target,status:target<=0?'unset':achieved>=target?'achieved':'in-progress'};
}
export function createMonthlyTargetHandlers(d) {
 const fail=(code,message)=>{throw d.error(code,message);};
 const monthOf=value=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value||''))fail('invalid-argument','اختر الشهر والسنة');return value;};
 async function access(request,write=false){
   const role=request.auth?.token?.role;
   if(role==='worker'&&!write){const staffId=await d.linkedStaffId(request);if(!staffId)fail('permission-denied','حساب العامل غير مرتبط');return {role,staffId,branches:d.branchesFor(request)};}
   await d.requireLiveStaff(request);
   if(write&&!['admin','manager','cashier'].includes(role))fail('permission-denied','تحديد هدف العامل متاح للأدمن والكاشير فقط');
   if(['manager','cashier'].includes(role)&&write&&!d.hasPermission(request,'teamOperations'))fail('permission-denied','صلاحية إدارة الفريق مطلوبة');
   if(!write&&role!=='admin'&&!(['manager','cashier'].includes(role)&&request.data?.view==='workers'&&d.hasPermission(request,'teamOperations'))&&!d.hasPermission(request,'dashboard')&&!d.hasPermission(request,'revenue'))fail('permission-denied','لا تملك صلاحية عرض الهدف');
   return {role,branches:role==='admin'?['talkha','mashaya']:d.branchesFor(request)};
 }
 function scope(access,id){if(!['talkha','mashaya'].includes(id)||!access.branches.includes(id))fail('permission-denied','الفرع خارج صلاحيات الحساب');return id;}
 async function read(request){
   const a=await access(request),month=monthOf(request.data?.month),currentMonth=d.currentMonth?.()||cairoTargetMonth(),workerView=request.data?.view==='workers';
   if(workerView&&!['admin','manager','cashier','worker'].includes(a.role))fail('permission-denied','أهداف العاملين متاحة للأدمن والكاشير والعامل لنفسه');
   if(workerView&&['manager','cashier'].includes(a.role)&&!d.hasPermission(request,'teamOperations'))fail('permission-denied','صلاحية الفريق مطلوبة');
   if(request.data?.branchId==='all'){
     if(a.role!=='admin')fail('permission-denied','الإجمالي متاح للأدمن فقط');
     const parts=await Promise.all(a.branches.map(branchId=>read({...request,data:{...request.data,branchId}})));
     const branches=parts.map(x=>x.branch).filter(Boolean);
     return {month,branchId:'all',branch:{branchId:'all',nameAr:'مجموع أهداف الفروع',month,...targetMeter(branches.reduce((n,x)=>n+x.target,0),branches.reduce((n,x)=>n+x.achieved,0))},branches,workers:parts.flatMap(x=>x.workers),canEdit:true};
   }
   const branchId=scope(a,request.data?.branchId);
   const branchSnap=await d.db.doc('branches/'+branchId).get();if(!branchSnap.exists||branchSnap.data().active===false)fail('not-found','الفرع غير متاح');
   const workers=[];let staffDocs=[];
   if((a.role==='admin'&&request.data?.view!=='branch')||(['manager','cashier'].includes(a.role)&&workerView)){const snapshot=await d.db.collection('staff').where('branchIds','array-contains',branchId).limit(501).get();if(snapshot.size>500)fail('resource-exhausted','عدد العاملين يتطلب تقسيم العرض');staffDocs=snapshot.docs;}
   if(a.role==='worker'){const snapshot=await d.db.doc('staff/'+a.staffId).get();if(!snapshot.exists||snapshot.data().active===false||snapshot.data().userUid!==request.auth.uid||!snapshot.data().branchIds?.includes(branchId))fail('permission-denied','سجل العامل خارج الفرع');staffDocs=[snapshot];}
   if(staffDocs.length){const ledger=await d.monthlyAttributedLedger([branchId],month);for(const doc of staffDocs){const staff=doc.data();if(staff.active===false)continue;const configured=staff.monthlyTargets?.[month]?.[branchId];const target=configured?.targetAmount??0;workers.push({staffId:doc.id,nameAr:staff.nameAr||doc.id,branchId,month,source:configured?'monthly':'unset',locked:configured!=null,canSet:['admin','manager','cashier'].includes(a.role)&&month===currentMonth&&configured==null,...targetMeter(target,d.attributedWorkerRevenue(ledger,doc.id,[branchId]))});}}
   let branch=null;
   if(a.role!=='worker'){const achieved=await d.branchRevenue(branchId,month);const summary=d.branchMonthlyTargetSummary(branchSnap.data(),month,achieved);branch={branchId,nameAr:branchSnap.data().nameAr||branchId,month,source:branchSnap.data().monthlyRevenueTargets?.[month]?'monthly':'unset',locked:branchSnap.data().monthlyRevenueTargets?.[month]!=null,canSet:a.role==='admin'&&month===currentMonth&&branchSnap.data().monthlyRevenueTargets?.[month]==null,...targetMeter(branchSnap.data().monthlyRevenueTargets?.[month]?.targetAmount??0,summary.achieved)};}
   return {month,branchId,branch,workers,canEdit:a.role==='admin'};
 }
 async function setWorker(request){
   const a=await access(request,true),month=monthOf(request.data?.month),branchId=scope(a,request.data?.branchId),staffId=request.data?.staffId,amount=request.data?.targetAmount;
   if(typeof staffId!=='string'||!staffId||staffId.length>100||staffId.includes('/')||typeof amount!=='number'||!Number.isFinite(amount)||amount<0||amount>1e9)fail('invalid-argument','بيانات الهدف غير صحيحة');
   const ref=d.db.doc('staff/'+staffId),branch=d.db.doc('branches/'+branchId);
   await d.db.runTransaction(async tx=>{const [worker,salon]=await Promise.all([tx.get(ref),tx.get(branch)]);if(!worker.exists||worker.data().active===false||!worker.data().branchIds?.includes(branchId)||!salon.exists||salon.data().active===false)fail('failed-precondition','العامل أو الفرع غير متاح');try{assertInitialTarget(month,worker.data().monthlyTargets?.[month]?.[branchId],d.currentMonth?.()||cairoTargetMonth());}catch(e){fail(e.code,e.message);}const now=d.timestamp();tx.update(ref,{['monthlyTargets.'+month+'.'+branchId]:{targetAmount:amount,updatedAt:now,updatedBy:request.auth.uid}});tx.set(d.db.collection('activityLogs').doc(),{action:'set-worker-monthly-target',actorUid:request.auth.uid,actorRole:a.role,staffId,branchId,month,targetAmount:amount,createdAt:now});});
   return {ok:true,staffId,branchId,month,targetAmount:amount};
 }
 return {read,setWorker};
}
