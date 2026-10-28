$plan = Get-Content -LiteralPath $planPath -Raw -Encoding UTF8 | ConvertFrom-Json
$plan.operations | Select-Object nameAr, price | Format-Table -AutoSizeimport {readFile,writeFile} from 'node:fs/promises';
import {applicationDefault,initializeApp} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {planPublicServiceSharing,serviceCatalogFingerprint} from '../src/public-service-sharing.js';
const args=process.argv.slice(2),apply=args.includes('--apply'),index=args.indexOf('--plan'),path=args[index+1];
if(index<0||!path||path.startsWith('--')||args.some(a=>a.startsWith('--')&&!['--plan','--apply'].includes(a)))throw Error('Use --plan <new-local-file.json> [--apply]. Default is read-only DRY_RUN.');
const project='el-mezaen-talkha';
if(process.env.FIRESTORE_EMULATOR_HOST&&!String(process.env.GCLOUD_PROJECT||'').startsWith('demo-'))throw Error('EMULATOR_REQUIRES_EXPLICIT_DEMO_PROJECT');
initializeApp({credential:applicationDefault(),projectId:process.env.FIRESTORE_EMULATOR_HOST?process.env.GCLOUD_PROJECT:project});
const db=getFirestore();
async function read(reader){const snap=await reader.get(db.collection('services').where('active','==',true).orderBy('__name__').limit(1001));if(snap.size>=1001)throw Error('CATALOG_TOO_LARGE');return snap.docs.map(d=>({id:d.id,data:d.data(),version:[d.updateTime.seconds,d.updateTime.nanoseconds]}));}
try{
 if(!apply){const rows=await read({get:q=>q.get()}),plan={project,createdAt:new Date().toISOString(),fingerprint:serviceCatalogFingerprint(rows),...planPublicServiceSharing(rows)};await writeFile(path,JSON.stringify(plan,null,2),{flag:'wx'});console.log(`DRY_RUN: ${plan.count} published Talkha services will also be available in Mashaya. Prices and images remain unchanged. Review and keep ${path} as the branch-scope backup. Cloud writes: 0.`);}
 else{const plan=JSON.parse(await readFile(path,'utf8'));if(plan.project!==project)throw Error('WRONG_PROJECT');let changed=0;await db.runTransaction(async tx=>{const rows=await read(tx),current=planPublicServiceSharing(rows);if(serviceCatalogFingerprint(rows)!==plan.fingerprint||JSON.stringify(current.operations)!==JSON.stringify(plan.operations))throw Error('CATALOG_CHANGED_OR_PLAN_MODIFIED_CREATE_A_NEW_PLAN');for(const op of current.operations)tx.update(db.doc('services/'+op.id),{branchIds:op.branchIds});if(current.count){tx.set(db.doc('settings/catalogRevision'),{version:'shared-services-'+plan.fingerprint,updatedAt:FieldValue.serverTimestamp()},{merge:true});tx.set(db.doc('activityLogs/shared_services_'+plan.fingerprint),{action:'share-published-services',sourceBranchId:'talkha',destinationBranchId:'mashaya',serviceIds:current.operations.map(op=>op.id),pricesChanged:false,createdAt:FieldValue.serverTimestamp()});}changed=current.count;});console.log(`APPLIED: ${changed} service branch scopes updated. No prices, receipts, bookings, employees, images or packages changed.`);}
}catch(error){console.error('STOP:',error.message);process.exitCode=1;}finally{await db.terminate();}
