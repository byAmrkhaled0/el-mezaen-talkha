import {chromium} from 'file:///C:/Users/amrk7/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const fixture=JSON.parse(fs.readFileSync('qa/service-runtime-context.json','utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true}),rows=[];
async function session(email){
 const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'}),errors=[],external=[];
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(['localhost','127.0.0.1'].includes(url.hostname))return route.continue();external.push(url.origin);return route.abort()});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:4185/login/');await page.waitForLoadState('networkidle');
 await page.locator('#email').fill(email);await page.locator('#password').fill('QaOnly-2026-Test!');await page.locator('#password').press('Enter');
 await page.waitForFunction(()=>location.pathname.startsWith('/admin/'),{},{timeout:45000});await page.waitForTimeout(2500);
 return {context,page,errors,external};
}
async function settled(page){await page.waitForFunction(()=>!document.querySelector('.admin-section.active')?.classList.contains('section-loading'),{},{timeout:45000});await page.waitForTimeout(500)}
async function shots(s,label,selector){await settled(s.page);for(const width of [390,820,1440]){await s.page.setViewportSize({width,height:900});for(const theme of ['light','dark']){await s.page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await s.page.locator(selector).scrollIntoViewIfNeeded();await s.page.waitForTimeout(150);const dims=await s.page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dims.scroll<=width+1,JSON.stringify(dims));rows.push({label,theme,...dims});await s.page.screenshot({path:`qa/service-${label}-${width}-${theme}.png`})}}}
try{
 const s=await session('qa-cashier-talkha@qa.example.test'),p=s.page;
 await p.goto('http://127.0.0.1:4185/admin/#admin=teamAvailability');await settled(p);
 const panel=p.locator('#teamAvailability .worker-availability'),controls=panel.locator('.worker-service-controls');
 await panel.locator('select[name=staffId] option[value="'+fixture.browserStaffId+'"]').waitFor({state:'attached'});
 const existing=controls.locator('.service-session').filter({hasText:'عامل تشغيل browser'});if(await existing.count()){await existing.getByRole('button',{name:'إنهاء الخدمة'}).click();await existing.waitFor({state:'detached'});await p.waitForFunction(id=>!!document.querySelector('select[name=staffId] option[value="'+id+'"]'),fixture.browserStaffId)}
 await panel.locator('select[name=staffId]').selectOption(fixture.browserStaffId);
 const start=controls.getByRole('button',{name:'بدء الخدمة للعامل المختار'});await controls.locator('[name=durationMinutes]').fill('30');
 let lost=false;
 await p.route('**/startWorkerService',async route=>{if(lost)return route.continue();lost=true;const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed')});
 await start.click();await p.waitForTimeout(1000);await assert.doesNotReject(()=>start.waitFor({state:'visible'}));
 await p.waitForFunction(()=>!document.querySelector('.worker-service-controls button[type=submit]')?.disabled);
 await start.click();await controls.locator('.service-session').filter({hasText:'عامل تشغيل browser'}).waitFor();
 assert.equal(await controls.locator('.service-session').filter({hasText:'عامل تشغيل browser'}).count(),1);
 await p.waitForFunction(id=>document.querySelector('#teamAvailability select[name=staffId]')?.value===id,fixture.browserStaffId);
 rows.push({case:'server-committed-response-lost-retry-one-session',passed:true});
 let card=controls.locator('.service-session').filter({hasText:'عامل تشغيل browser'});
 await card.getByRole('button',{name:'تمديد الخدمة'}).click();await p.waitForResponse(r=>r.url().endsWith('/getWorkerServiceSessions')&&r.status()===200);await settled(p);
 rows.push({case:'ui-extend-service',passed:true});await shots(s,'cashier-service','#teamAvailability .worker-service-controls');
 card=controls.locator('.service-session').filter({hasText:'عامل تشغيل browser'});await card.getByRole('button',{name:'إنهاء الخدمة'}).click();await card.waitFor({state:'detached'});rows.push({case:'ui-finish-service',passed:true});
 let historyRequests=0;p.on('request',r=>{if(r.url().endsWith('/getCashHandoverHistory'))historyRequests++});
 await p.goto('http://127.0.0.1:4185/admin/#admin=cash');await settled(p);const history=p.locator('#cash .cash-handover-history');await history.waitFor();assert.equal(historyRequests,0);
 await history.locator(':scope > summary').click();await history.locator('.handover-history-item').first().waitFor();assert.equal(historyRequests,1);await history.locator('.handover-history-item > summary').first().click();
 await shots(s,'cashier-history','#cash .cash-handover-history');rows.push({case:'history-lazy-load-and-expanded-details',passed:true});
 assert.deepEqual(s.errors,[]);assert.deepEqual(s.external,[]);await s.context.close();
 const a=await session('qa-admin@qa.example.test');await a.page.goto('http://127.0.0.1:4185/admin/#admin=staff');await settled(a.page);
 await a.page.locator(`[data-worker-availability="${fixture.browserStaffId}"]`).click();await a.page.waitForFunction(id=>document.querySelector('#teamAvailability .worker-availability select[name=staffId]')?.value===id,fixture.browserStaffId);
 await shots(a,'admin-service','#teamAvailability .worker-service-controls');assert.deepEqual(a.errors,[]);assert.deepEqual(a.external,[]);rows.push({case:'admin-staff-availability-shortcut',passed:true});
 await a.page.goto('http://127.0.0.1:4185/admin/#admin=pos');await settled(a.page);await a.page.locator('[data-new-pos]:visible').first().click();await a.page.locator('#posBranch').selectOption('talkha');await a.page.locator('#posSectionFilter').selectOption('service');await a.page.locator('[data-pos-category=all]').click();await a.page.locator('[data-pos-add=qa-haircut]').click();
 await a.page.locator('[data-pos-worker=qa-haircut]').selectOption(fixture.browserStaffId);await a.page.locator('[data-service-draft-worker]').click();
 await a.page.waitForFunction(id=>location.hash.includes('teamAvailability')&&document.querySelector('#teamAvailability select[name=staffId]')?.value===id,fixture.browserStaffId);rows.push({case:'pos-service-draft-carries-worker-and-branch-without-starting',passed:true});
 const adminPanel=a.page.locator('#teamAvailability .worker-availability');const otherId=await adminPanel.locator('select[name=staffId] option').evaluateAll(options=>options.map(o=>o.value).find(id=>id!==document.querySelector('#teamAvailability select[name=staffId]').value));assert.ok(otherId);await adminPanel.locator('select[name=staffId]').selectOption(otherId);await adminPanel.locator(':scope > .operations-controls button').click();await a.page.waitForResponse(r=>r.url().endsWith('/getWorkerAvailability')&&r.status()===200);await a.page.waitForFunction(id=>document.querySelector('#teamAvailability select[name=staffId]')?.value===id,otherId);rows.push({case:'manual-selection-after-pos-draft-survives-refresh',passed:true});
 assert.deepEqual(a.errors,[]);await a.context.close();
 fs.writeFileSync('qa/service-browser.json',JSON.stringify({verified:true,variants:18,pageErrors:0,externalRequests:0,rows},null,2));console.log('PASS: 18 responsive/theme variants, service lost-response retry, extend/finish, lazy handover history, staff shortcut.');
}finally{await browser.close()}
