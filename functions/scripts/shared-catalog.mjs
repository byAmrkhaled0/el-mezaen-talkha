import {readFile,writeFile} from 'node:fs/promises';
import {applicationDefault,initializeApp} from 'firebase-admin/app';import {getFirestore,FieldPath} from 'firebase-admin/firestore';
import {planSharedCatalog,catalogFingerprint} from '../src/shared-catalog-plan.js';
const args=process.argv.slice(2),apply=args.includes('--apply'),planPath=args[args.indexOf('--plan')+1];
if(!args.includes('--plan')||!planPath||planPath.startsWith('--'))throw Error('Use --plan <local-file.json>; default is DRY_RUN');
if(args.some(a=>a.startsWith('--')&&!['--apply','--plan'].includes(a)))throw Error('UNKNOWN_ARGUMENT');
initializeApp({credential:applicationDefault(),projectId:'el-mezaen-talkha'});const db=getFirestore();
async function read(reader){const snapshots=await Promise.all(['services','packages'].map(c=>reader.get(db.collection(c).orderBy(FieldPath.documentId()).limit(1001))));if(snapshots.some(s=>s.size>=1001))throw Error('CATALOG_LIMIT_REQUIRES_REVIEW');const collections=snapshots.map(s=>s.docs.map(d=>({...d.data(),id:d.id})));const versions=snapshots.map(s=>s.docs.map(d=>[d.id,d.updateTime.seconds,d.updateTime.nanoseconds]));return {collections,versions};}
try{
 if(!apply){const current=await read({get:q=>q.get()}),plan=planSharedCatalog(...current.collections);const output={project:'el-mezaen-talkha',createdAt:new Date().toISOString(),fingerprint:catalogFingerprint(current.versions),...plan};await writeFile(planPath,JSON.stringify(output,null,2),{flag:'wx'});console.log(`DRY_RUN: ${plan.count} branch-scope updates. No prices, names, status or cloud data changed. Review ${planPath}`);}
 else{const plan=JSON.parse(await readFile(planPath,'utf8'));if(plan.project!=='el-mezaen-talkha')throw Error('WRONG_PROJECT');await db.runTransaction(async tx=>{const current=await read(tx),actual=planSharedCatalog(...current.collections);if(catalogFingerprint(current.versions)!==plan.fingerprint||JSON.stringify(actual.operations)!==JSON.stringify(plan.operations))throw Error('CATALOG_CHANGED_OR_PLAN_MODIFIED_RUN_NEW_DRY_RUN');for(const op of actual.operations)tx.update(db.doc(`${op.collection}/${op.id}`),{branchIds:op.branchIds});});console.log('APPLIED: shared service/package branch scopes only. Future edits must keep both branches selected.');}
}catch(error){console.error('STOP:',error.code||error.message);process.exitCode=1;}
