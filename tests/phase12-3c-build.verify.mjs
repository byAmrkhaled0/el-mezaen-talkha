import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
const read=p=>fs.readFileSync(p,'utf8');
test('Worker theme is a Vite module and production HTML has no missing source theme path',()=>{
 assert.match(read('worker/index.html'),/<script type="module" src="\/src\/worker-theme\.js"><\/script>/);
 const html=read('dist/worker/index.html');assert.doesNotMatch(html,/src="\/src\/worker-theme\.js"/);
 const js=[...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.js)"/g)].map(x=>read(path.join('dist',x[1]))).join('\n');assert.match(js,/mz-worker-mobile-theme/);assert.match(js,/workerThemeToggle/);
});
test('Every built frontend entry references existing emitted local assets',()=>{
 for(const entry of ['index','worker/index','admin/index','login/index','account/index','booking/index','services/index','packages/index','team/index','results/index','reviews/index','hair-systems/index','branches/talkha/index','branches/mashaya/index','404']){
  const html=read('dist/'+entry+'.html');for(const match of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g))assert.ok(fs.existsSync(path.join('dist',match[1])),entry+': '+match[1]);assert.doesNotMatch(html,/<script[^>]+src="\/src\//);
 }
});
test('Request filters preserve native form identifiers and mobile CSS stays scoped',()=>{
 for(const entry of ['worker/index.html','admin/index.html']){const html=read(entry);assert.match(html,/<select name="requestStatus" data-request-filter>/);}
 assert.match(read('admin/index.html'),/<select name="requestBranch" data-request-branch>/);
 const css=read('src/worker-requests.css');assert.match(css,/@media\(max-width:720px\)/);assert.match(css,/min-height:44px/);assert.match(css,/min-height:48px/);
});
