import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = name => fs.readFileSync(new URL('../src/'+name, import.meta.url),'utf8');
const css = read('mobile-management.css');
test('shared refinement has exactly one top-level mobile breakpoint and no desktop rules',()=>{
  const clean=css.replace(/\/\*[\s\S]*?\*\//g,'').trim();
  assert.ok(clean.startsWith('@media (max-width:720px) {'));
  let depth=0;let end=-1;
  for(let i=0;i<clean.length;i++){if(clean[i]==='{')depth++;if(clean[i]==='}'){depth--;if(depth===0)end=i;}assert.ok(depth>=0);}
  assert.equal(depth,0);assert.equal(end,clean.length-1);
  assert.equal((clean.match(/@media/g)||[]).length,1);
});
test('stylesheet is loaded only by internal entries after their existing CSS',()=>{
  for(const [js,base] of [['admin.js','admin.css'],['worker.js','worker.css']]){
    const s=read(js);assert.ok(s.indexOf("import './mobile-management.css';")>s.indexOf('./'+base));
  }
  for(const js of ['app.js','account.js','catalog-page.js','results.js','hair-systems.js'])assert.ok(!read(js).includes('mobile-management.css'));
});
test('outline icons share a single stroke style and do not inject markup or handlers',()=>{
  const urls=[...css.matchAll(/data:image\/svg\+xml,([^"\)]+)/g)].map(m=>decodeURIComponent(m[1]));
  assert.equal(urls.length,9);
  for(const svg of urls){assert.ok(svg.includes('stroke-width="1.8"'));assert.ok(svg.includes('fill="none"'));assert.ok(svg.includes('stroke-linecap="round"'));assert.ok(!svg.includes('<script'));}
  assert.match(css,/content:""/);assert.doesNotMatch(css,/display:[^;]*!important/);
});
test('light palette is guarded and explicit dark Worker theme is preserved',()=>{
  assert.match(css,/html\[data-admin-role\]\[data-theme="light"\]/);
  assert.match(css,/html:not\(\[data-theme="dark"\]\) \.worker-app/);
  assert.ok(!css.includes('html[data-theme="dark"]'));
  assert.match(css,/min-height:48px;min-width:44px/);
  assert.match(css,/safe-area-inset-bottom/);
});
