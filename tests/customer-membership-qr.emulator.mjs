import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {createHash} from 'node:crypto';
assert.equal(process.env.GCLOUD_PROJECT,'demo-el-mezaen-gate');assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8087');assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9097');
const require=createRequire(import.meta.url),backendRequire=createRequire(new URL('../functions/package.json',import.meta.url));
const QRCode=require('qrcode'),qrRequire=createRequire(require.resolve('qrcode')),{PNG}=qrRequire('pngjs');
const {RGBLuminanceSource,BinaryBitmap,HybridBinarizer,QRCodeReader}=require('@zxing/library');
const h=await import('../functions/src/index.js');const {getFirestore}=backendRequire('firebase-admin/firestore'),{getAuth}=backendRequire('firebase-admin/auth');const db=getFirestore(),auth=getAuth();
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,32),rawRequest={ip:'127.0.0.1',headers:{}};
const uid='membership-qr-customer',phone='01099910009',customerId=hash(phone);
const customer={uid,token:{auth_time:Math.ceil(Date.now()/1000),phone_number:'+201099910009'}};
const actor=(uid,role,branchIds)=>({uid,token:{role,branchIds,auth_time:Math.floor(Date.now()/1000),firebase:{sign_in_provider:'password'}}});
const cashier=actor('membership-qr-cashier','cashier',['talkha']),admin=actor('membership-qr-admin','admin',['talkha','mashaya']);
const call=(name,a,data={})=>h[name].run({auth:a,data,rawRequest});let token;
test('prepare isolated customer, live cashier and branch-scoped booking fixtures',async()=>{
 for(const a of [customer,cashier,admin]){await auth.createUser({uid:a.uid,...(a===customer?{phoneNumber:customer.token.phone_number}:{})});if(a!==customer){await auth.setCustomUserClaims(a.uid,{role:a.token.role,branchIds:a.token.branchIds});await db.doc('users/'+a.uid).set({role:a.token.role,active:true,branchIds:a.token.branchIds});}}
 await db.doc('settings/public').set({loyaltyEnabled:false});await db.doc('branches/talkha').set({active:true,nameAr:'فرع اختبار'});
 await call('saveCustomerProfile',customer,{firstName:'عميل',lastName:'اختبار',preferredBranchId:'talkha'});
 await db.doc('customers/'+customerId).update({lastBranchId:'talkha'});
 for(const branchId of ['talkha','mashaya'])await db.doc('bookings/membership-'+branchId).set({phoneHash:customerId,branchId,status:'confirmed',createdAt:new Date()});
});
test('decode rendered QR and scan exact canonical token through cashier API, retaining branch boundaries',async()=>{
 const portal=await call('getCustomerPortal',customer);token=portal.customer.qrToken;assert.match(token,/^mzc_[A-Za-z0-9_-]{20,100}$/);
 const image=PNG.sync.read(await QRCode.toBuffer(token,{width:264,margin:4,errorCorrectionLevel:'M'}));
 const luminances=Uint8ClampedArray.from({length:image.width*image.height},(_,i)=>(image.data[i*4]+2*image.data[i*4+1]+image.data[i*4+2])/4);
 const decoded=new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(luminances,image.width,image.height)))).getText();assert.equal(decoded,token);assert.ok(!decoded.includes(phone));
 const result=await call('scanCustomerCode',cashier,{code:decoded});assert.equal(result.customer.id,customerId);assert.equal(result.customer.phone,phone);assert.equal(result.bookings.length,1);assert.equal(result.bookings[0].branchId,'talkha');
 assert.equal((await call('getCustomerPortal',customer)).customer.qrToken,token);
 await assert.rejects(call('scanCustomerCode',null,{code:token}));await assert.rejects(call('scanCustomerCode',customer,{code:token}));await assert.rejects(call('scanCustomerCode',cashier,{code:'mzc_not_an_existing_customer_token_1234'}));
});
test('profile changes preserve membership code; explicit admin rotation revokes old code',async()=>{
 await call('saveCustomerProfile',customer,{firstName:'عميل',lastName:'محدث',preferredBranchId:'talkha'});assert.equal((await call('getCustomerPortal',customer)).customer.qrToken,token);
 const rotated=await call('rotateCustomerQr',admin,{customerId,reason:'Isolated QR regression test',requestId:'membership-qr-rotation-20261030'});assert.notEqual(rotated.qrToken,token);
 await assert.rejects(call('scanCustomerCode',cashier,{code:token}),/إلغاء/);
 assert.equal((await call('scanCustomerCode',cashier,{code:rotated.qrToken})).customer.id,customerId);
});
