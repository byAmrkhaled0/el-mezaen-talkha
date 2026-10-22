// Synthetic fixtures only. Run inside the verified disconnected Sandbox.
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {ALL_PERMISSIONS} from '../functions/src/authorization.js';
import {workerAuthEmail} from '../functions/src/worker-username.js';
const projectId='demo-el-mezaen-qa';
for(const [name,value] of Object.entries({GCLOUD_PROJECT:projectId,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9098',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8088',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9198'}))if(process.env[name]!==value)throw Error('QA_SEED_ENV:'+name);
if(process.env.QA_ISOLATION_VERIFIED!=='windows-sandbox-network-disabled' && process.env.QA_LOCALHOST_AUTHORIZED!=='demo-emulators-only')throw Error('QA_SEED_REQUIRES_VERIFIED_ISOLATION');
if(process.env.GOOGLE_APPLICATION_CREDENTIALS)throw Error('QA_SEED_NO_CREDENTIALS');
const require=createRequire(new URL('../functions/package.json',import.meta.url));const load=async name=>import(pathToFileURL(require.resolve(name)).href);
const {initializeApp}=await load('firebase-admin/app');const {getAuth}=await load('firebase-admin/auth');const {getFirestore}=await load('firebase-admin/firestore');
initializeApp({projectId,storageBucket:projectId+'.appspot.com'});const auth=getAuth(),db=getFirestore();
const password='QaOnly-2026-Test!';
const identities=[{uid:'qa-admin',role:'admin',branchIds:['talkha','mashaya'],permissions:ALL_PERMISSIONS},{uid:'qa-manager-talkha',role:'manager',branchIds:['talkha'],permissions:['dashboard','bookings','services','packages','staff','gallery','results','hairMedia','celebrities','posts']},{uid:'qa-cashier-talkha',role:'cashier',branchIds:['talkha'],permissions:['dashboard','pos','bookings','gallery']},{uid:'qa-manager-mashaya',role:'manager',branchIds:['mashaya'],permissions:['dashboard','bookings','gallery','posts']},{uid:'qa-worker-talkha',role:'worker',branchIds:['talkha'],permissions:['attendance','tasks'],staffId:'qa-staff-talkha',username:'qa-worker-talkha'}];
for(const item of identities){const email=item.role==='worker'?workerAuthEmail(item.username):item.uid+'@qa.example.test';try{await auth.getUser(item.uid);await auth.updateUser(item.uid,{email,password,disabled:false});}catch(e){if(e.code!=='auth/user-not-found')throw e;await auth.createUser({uid:item.uid,email,password,displayName:item.uid});}
 const {uid,username,...claims}=item;await auth.setCustomUserClaims(uid,{...claims,mustChangePassword:false});await db.doc('users/'+uid).set({...claims,...(username?{username}:{}),email,name:uid,active:true,mustChangePassword:false},{merge:true});}
for(const branch of ['talkha','mashaya']){
 await db.doc('branches/'+branch).set({nameAr:branch==='talkha'?'طلخا تجريبي':'المشاية تجريبي',nameEn:branch+' QA',active:true,openingTime:'10:00',closingTime:'22:00',phone:'01000000000',whatsapp:'201000000000',code:branch==='talkha'?'QT':'QM'});
 await db.doc('staff/qa-staff-'+branch).set({nameAr:'عامل تجريبي '+branch,nameEn:'QA Worker '+branch,specialtyAr:'قص تجريبي',bioAr:'بيانات مصطنعة للاختبار',active:true,available:true,published:true,catalogVisible:true,branchIds:[branch],serviceIds:['qa-haircut'],workDays:[0,1,2,3,4,5,6],shiftStart:'10:00',shiftEnd:'22:00',sortOrder:1,...(branch==='talkha'?{userUid:'qa-worker-talkha'}:{}),baseSalary:12345,payroll:{marker:'QA_PRIVATE_SENTINEL'},monthlyTarget:99999,phone:'01000000000',internalNotes:'QA_PRIVATE_SENTINEL'});
}
await db.doc('categories/qa-hair').set({nameAr:'قص تجريبي',nameEn:'QA Hair',active:true,sortOrder:1});
await db.doc('services/qa-haircut').set({nameAr:'قص شعر تجريبي',nameEn:'QA Haircut',categoryId:'qa-hair',type:'service',active:true,available:true,branchIds:['talkha','mashaya'],price:100,duration:30,sortOrder:1});
await db.doc('packages/qa-package').set({nameAr:'باقة تجريبية',nameEn:'QA Package',active:true,available:true,branchIds:['talkha','mashaya'],includedServiceIds:['qa-haircut'],price:90,duration:30,sortOrder:1});
await db.doc('settings/public').set({businessNameAr:'المزين QA',businessNameEn:'EL MEZAEN QA',openingTime:'10:00',closingTime:'22:00',slotMinutes:30,aiAgentEnabled:false},{merge:true});
for(const [uid,phoneNumber] of [['qa-customer-1','+201000000001'],['qa-customer-2','+201000000002']]){try{await auth.getUser(uid);}catch(e){if(e.code!=='auth/user-not-found')throw e;await auth.createUser({uid,phoneNumber,displayName:uid});}}
console.log(JSON.stringify({projectId,accounts:identities.map(x=>({uid:x.uid,email:x.role==='worker'?workerAuthEmail(x.username):x.uid+'@qa.example.test',username:x.username||null,role:x.role})),password,customerPhones:['+201000000001','+201000000002'],note:'Synthetic emulator-only credentials. Fixture seeder is not proof of accepted bookings.'},null,2));
