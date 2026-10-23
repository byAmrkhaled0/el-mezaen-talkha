import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {ALL_PERMISSIONS} from '../functions/src/authorization.js';
assert.equal(process.env.GCLOUD_PROJECT,'demo-el-mezaen-qa');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8084');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9094');
assert.ok(!process.env.GOOGLE_APPLICATION_CREDENTIALS);
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
initializeApp({projectId:'demo-el-mezaen-qa'});const db=getFirestore(),auth=getAuth();
assert.equal((await db.collection('bookings').limit(1).get()).size,0,'Journey suite must be empty before fixture creation');
for(const [uid,role,permissions] of [['journey-admin','admin',ALL_PERMISSIONS],['journey-cashier','cashier',['dashboard','pos','bookings','teamOperations']],['journey-worker','worker',['attendance','tasks']]]){
 const email=role==='worker'?'journey-worker@workers.el-mezaen.invalid':uid+'@qa.example.test';
 const claims={role,permissions,branchIds:['talkha'],mustChangePassword:false,...(role==='worker'?{staffId:'journey-staff',username:'journey-worker'}:{})};
 await auth.createUser({uid,email,password:'QaOnly-2026-Test!',displayName:uid});await auth.setCustomUserClaims(uid,claims);
 await db.doc('users/'+uid).set({...claims,name:uid,email,active:true});
}
for(const id of ['talkha','mashaya'])await db.doc('branches/'+id).set({nameAr:id==='talkha'?'طلخا — اختبار الرحلة':'المشاية — اختبار الرحلة',nameEn:id+' Journey QA',active:true,code:id==='talkha'?'JQ':'JM',openingTime:'00:00',closingTime:'23:59',phone:'01000000991',whatsapp:'201000000991'});
await db.doc('staff/journey-staff').set({nameAr:'عامل رحلة العميل التجريبي',nameEn:'Journey worker',active:true,available:true,published:true,catalogVisible:true,branchIds:['talkha'],serviceIds:['journey-haircut'],workDays:[0,1,2,3,4,5,6],shiftStart:'00:00',shiftEnd:'23:59',userUid:'journey-worker',sortOrder:1});
await db.doc('categories/journey-hair').set({nameAr:'قص الشعر',nameEn:'Hair',active:true,sortOrder:1});
await db.doc('services/journey-haircut').set({nameAr:'قص شعر — اختبار رحلة العميل',nameEn:'Journey haircut',categoryId:'journey-hair',type:'service',active:true,available:true,branchIds:['talkha'],price:100,duration:30,sortOrder:1});
await db.doc('settings/public').set({businessNameAr:'المزين — اختبار محلي',businessNameEn:'Journey QA',cashDrawerEnabled:true,openingTime:'00:00',closingTime:'23:59',slotMinutes:15,aiAgentEnabled:false});
await db.doc('branches/talkha').update({latitude:31.04,longitude:31.38,attendanceRadiusMeters:100});await db.terminate();console.log('PASS: isolated synthetic journey fixtures; no existing booking/ledger data.');
