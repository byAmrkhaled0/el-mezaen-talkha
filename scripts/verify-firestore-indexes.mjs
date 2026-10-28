import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export function validateFirestoreIndexes(config){
 const issues=[];if(!Array.isArray(config.indexes))return ['indexes must be an array'];
 const seen=new Set();for(const [position,index]of config.indexes.entries()){
  const prefix='Index '+position+' ('+index.collectionGroup+')',fields=index.fields||[],real=fields.filter(field=>field.fieldPath!=='__name__'),name=fields.find(field=>field.fieldPath==='__name__');
  if(!index.collectionGroup||fields.length<2||fields.length>100)issues.push(prefix+': invalid composite field count');
  if(new Set(fields.map(field=>field.fieldPath)).size!==fields.length)issues.push(prefix+': repeated field');
  if(fields.filter(field=>field.arrayConfig).length>1)issues.push(prefix+': more than one array field');
  if((index.queryScope||'COLLECTION')==='COLLECTION'&&real.length===1&&(name?.order||real[0].order||'ASCENDING')===(real[0].order||'ASCENDING'))issues.push(prefix+': automatic single-field index must not be submitted as a composite');
  const key=JSON.stringify([index.collectionGroup,index.queryScope||'COLLECTION',fields.map(field=>[field.fieldPath,field.order||field.arrayConfig])]);if(seen.has(key))issues.push(prefix+': duplicate composite');seen.add(key);
 }
 return issues;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const config=JSON.parse(await readFile(resolve('firestore.indexes.json'),'utf8')),issues=validateFirestoreIndexes(config);
 if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}else console.log('PASS: '+config.indexes.length+' composite index definitions; no redundant automatic indexes. Local validation only; no cloud resources changed.');
}
