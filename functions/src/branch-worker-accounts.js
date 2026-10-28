import {getAuth} from 'firebase-admin/auth';
import {FieldValue,FieldPath} from 'firebase-admin/firestore';
import {HttpsError} from 'firebase-functions/v2/https';
import {normalizeWorkerUsername,workerAuthEmail} from './worker-username.js';
import {ROLE_DEFAULT_PERMISSIONS} from './authorization.js';
export function branchWorkerAccountHandlers({db,requireLiveStaff,requireBranchAccess,rateLimit}) {
 const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);
 async function access(request,recent=false){
  await requireLiveStaff(request);
  const role=request.auth?.token?.role;
  if(!['admin','manager','cashier'].includes(role))throw new HttpsError('permission-denied','إنشاء حسابات العمال للأدمن والكاشير فقط');
  if(recent&&Number(request.auth.token.auth_time)*1000<Date.now()-300000)throw new HttpsError('unauthenticated','أعد التحقق بكلمة مرور حسابك أولًا');
  if(role!=='admin'){
   const account=await db.doc('users/'+request.auth.uid).get();
   if(!account.exists||account.data().role!==role||account.data().active!==true||account.data().accessOperation||account.data().roleChangePending)throw new HttpsError('permission-denied','حساب الكاشير غير فعال');
   const liveBranches=account.data().branchIds||[];
   if(!(request.auth.token.branchIds||[]).every(id=>liveBranches.includes(id)))throw new HttpsError('permission-denied','فروع الحساب تغيرت؛ سجل الدخول مجددًا');
  }
  return role;
 }
 function checkBranches(request,branches){
  if(!Array.isArray(branches)||!branches.length||branches.some(id=>!['talkha','mashaya'].includes(id)))throw new HttpsError('failed-precondition','راجع فروع العامل');
  branches.forEach(id=>requireBranchAccess(request,id));
 }
 return {
  async list(request){
   const role=await access(request),branchId=request.data?.branchId;
   if(!['talkha','mashaya'].includes(branchId))throw new HttpsError('invalid-argument','اختر فرعًا محددًا');
   requireBranchAccess(request,branchId);
   const cursor=request.data?.cursor||'';if(cursor&&!validId(cursor))throw new HttpsError('invalid-argument','مؤشر غير صالح');
   let query=db.collection('staff').where('branchIds','array-contains',branchId).orderBy(FieldPath.documentId());
   if(cursor)query=query.startAfter(cursor);
   const page=await query.limit(51).get(),rows=page.docs.slice(0,50);
   const allowed=request.auth.token.branchIds||[];
   return {items:rows.filter(doc=>doc.data().active!==false&&(role==='admin'||doc.data().branchIds.every(id=>allowed.includes(id)))).map(doc=>({id:doc.id,nameAr:String(doc.data().nameAr||doc.id),linked:Boolean(doc.data().userUid)})),nextCursor:page.size>50?rows.at(-1).id:null};
  },
  async create(request){
   const role=await access(request,true),data=request.data||{};
   if(Object.keys(data).some(key=>!['staffId','username','password'].includes(key)))throw new HttpsError('invalid-argument','البيانات المسموح بها: العامل واسم المستخدم وكلمة المرور فقط');
   if(!validId(data.staffId)||typeof data.password!=='string'||data.password.length<8||data.password.length>128)throw new HttpsError('invalid-argument','اختر العامل واكتب باسورد من 8 إلى 128 حرفًا');
   let username;try{username=normalizeWorkerUsername(data.username);}catch{throw new HttpsError('invalid-argument','اسم المستخدم: 3–32 حرفًا إنجليزيًا أو رقمًا أو . _ -');}
   const ref=db.doc('staff/'+data.staffId),snapshot=await ref.get();
   if(!snapshot.exists||snapshot.data().active===false)throw new HttpsError('failed-precondition','العامل غير متاح');
   const branches=snapshot.data().branchIds;checkBranches(request,branches);
   if(snapshot.data().userUid||!(await db.collection('users').where('staffId','==',data.staffId).limit(1).get()).empty)throw new HttpsError('already-exists','العامل عنده حساب بالفعل');
   await rateLimit(request,'branch-worker-account',360,3600000,request.auth.uid);
   const auth=getAuth(),email=workerAuthEmail(username);let user,persisted=false;
   try{
    user=await auth.createUser({email,password:data.password,displayName:String(snapshot.data().nameAr||username).slice(0,80),disabled:true});
    const claims={role:'worker',permissions:ROLE_DEFAULT_PERMISSIONS.worker,branchIds:branches,staffId:data.staffId,mustChangePassword:true};
    await auth.setCustomUserClaims(user.uid,claims);
    await db.runTransaction(async tx=>{
     const [staff,linked]=await Promise.all([tx.get(ref),tx.get(db.collection('users').where('staffId','==',data.staffId).limit(1))]);
     if(!staff.exists||staff.data().active===false||staff.data().userUid||!linked.empty||JSON.stringify(staff.data().branchIds)!==JSON.stringify(branches))throw new HttpsError('failed-precondition','تغير ربط العامل؛ راجع الحسابات');
     checkBranches(request,staff.data().branchIds);
     const now=FieldValue.serverTimestamp();
     tx.create(db.doc('users/'+user.uid),{...claims,name:String(staff.data().nameAr||username).slice(0,80),username,email,active:false,accountStatus:'PENDING',authProviders:['password'],createdBy:request.auth.uid,createdAt:now,updatedAt:now});
     tx.update(ref,{userUid:user.uid,updatedAt:now});
     tx.create(db.collection('activityLogs').doc(),{action:'create-worker-account',actorUid:request.auth.uid,actorRole:role,collection:'users',entityId:user.uid,staffId:data.staffId,branchIds:branches,createdAt:now});
    });
    persisted=true;await auth.updateUser(user.uid,{disabled:false});await db.doc('users/'+user.uid).update({active:true,accountStatus:'ACTIVE'});
    return {ok:true,uid:user.uid,username,loginPath:'/login/?mode=worker',mustChangePassword:true};
   }catch(error){
    if(persisted)throw new HttpsError('unavailable','الحساب محفوظ ويحتاج إعادة تفعيل من الأدمن',{uid:user.uid});
    if(user)await auth.deleteUser(user.uid).catch(()=>{});
    if(error instanceof HttpsError)throw error;
    if(error.code==='auth/email-already-exists')throw new HttpsError('already-exists','اسم المستخدم مستخدم بالفعل');
    throw new HttpsError('internal','لم يكتمل إنشاء الحساب؛ أعد المحاولة');
   }
  }
 };
}
