import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
const require=createRequire(import.meta.url),rimrafRequire=createRequire(require.resolve('rimraf'));
const {glob,globSync}=rimrafRequire('glob'),{rimraf,rimrafSync}=require('rimraf');

test('reviewed glob replacement retains CommonJS API used by rimraf and async/sync pattern semantics',async()=>{
 assert.equal(rimrafRequire('glob/package.json').version,'14.0.3');
 const root=await mkdtemp(join(tmpdir(),'elmezaen-glob-'));
 assert.ok(resolve(root).startsWith(resolve(tmpdir())+sep));
 try{
  await mkdir(join(root,'keep'));await mkdir(join(root,'remove'));await writeFile(join(root,'keep','one.txt'),'safe');await writeFile(join(root,'remove','one.txt'),'fixture');
  const expected=['keep/one.txt','remove/one.txt'];
  assert.deepEqual((await glob('**/*.txt',{cwd:root})).map(x=>x.replaceAll('\\','/')).sort(),expected);
  assert.deepEqual(globSync('**/*.txt',{cwd:root}).map(x=>x.replaceAll('\\','/')).sort(),expected);
  assert.equal(await rimraf('remove/*.txt',{glob:{cwd:root}}),true);
  await assert.rejects(access(join(root,'remove','one.txt')));await access(join(root,'keep','one.txt'));
  assert.equal(rimrafSync('keep/*.txt',{glob:{cwd:root}}),true);
  await assert.rejects(access(join(root,'keep','one.txt')));
  const abort=new AbortController();abort.abort();await assert.rejects(glob('**/*',{cwd:root,signal:abort.signal}));
 }finally{await rm(root,{recursive:true,force:true});}
});
