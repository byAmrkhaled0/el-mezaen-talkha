import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const root=process.cwd();
const verify=(dir=root)=>spawnSync(process.env.PYTHON || 'python3',['scripts/verify-premium-assets.py',dir],{encoding:'utf8'});
test('all generated premium assets decode and responsive variants exist',()=>{const r=verify();assert.equal(r.status,0,r.stderr);});
for(const defect of ['empty','corrupt','missing']) test(`asset gate rejects ${defect} file`,()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'premium-integrity-'));
 try{
  for(const item of JSON.parse(readFileSync('scripts/premium-assets.manifest.json','utf8'))){const target=path.join(dir,item.path);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(item.path,target);}
  const target=path.join(dir,'public/assets/premium/package-premium-2-1280.webp');
  if(defect==='missing')rmSync(target);else writeFileSync(target,defect==='empty'?'':'not a valid webp');
  assert.notEqual(verify(dir).status,0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('public runtime module graph cannot open legacy static FAQ',()=>{
 const seen=new Set();
 function visit(file){if(seen.has(file))return;seen.add(file);assert.notEqual(path.basename(file),'faq-chatbot.js');const source=readFileSync(file,'utf8');assert.doesNotMatch(source,/(?:import|open)[^\n]*faq-chatbot/);for(const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)['"]([^'"]+)['"]/g)){if(!match[1].startsWith('.'))continue;const next=path.resolve(path.dirname(file),match[1]);if(existsSync(next)&&next.endsWith('.js'))visit(next);}}
 for(const name of ['app.js','public-assistant.js','ai-chat.js','catalog-page.js','branch-page.js'])visit(path.resolve(root,'src',name));
 assert.ok(seen.size>5);
});
