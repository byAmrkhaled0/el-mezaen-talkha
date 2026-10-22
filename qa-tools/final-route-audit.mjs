import {createServer,preview} from 'vite';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const {chromium:pw}=await import(process.env.PLAYWRIGHT_MODULE);const chromium=process.env.CHROMIUM_EXECUTABLE_PATH?{args:['--no-sandbox','--disable-dev-shm-usage']}:(await import(process.env.CHROMIUM_MODULE)).default;
const root=new URL('../',import.meta.url).pathname;const routes=['','admin','worker','login','account','booking','services','packages','reviews','results','team','hair-systems','branches/talkha','branches/mashaya'];const results=[],moduleGraph=[];
const browser=await pw.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:chromium.args.filter(a=>a!=='--single-process'&&!a.includes('gpu')&&!a.startsWith('--use-gl')&&!a.startsWith('--use-angle')).concat(['--disable-gpu'])});
try{for(const mode of ['dev','preview']){
 const port=mode==='dev'?4187:4188;const server=mode==='dev'?await createServer({root,server:{host:'127.0.0.1',port,strictPort:true}}):await preview({root,preview:{host:'127.0.0.1',port,strictPort:true}});if(mode==='dev')await server.listen();
 try{const context=await browser.newContext();await context.route('**/firebase-config.js',r=>r.fulfill({contentType:'text/javascript',body:'window.__FIREBASE_CONFIG__={};'}));await context.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 for(const width of [390,1440]){await page.setViewportSize({width,height:900});
 for(const route of routes)for(const suffix of route?['','/']:['/']){
  const path=route?'/'+route+suffix:'/';const response=await fetch('http://127.0.0.1:'+port+path);assert.ok(response.ok);const entryHtml=await response.text();await page.goto('http://127.0.0.1:'+port+path);if(route==='admin')assert.match(entryHtml,/id="adminApp"/);if(route==='worker')assert.match(entryHtml,/id="workspace"/);await page.reload();
  const html=await page.content();if(['admin','worker','login','account'].includes(route))assert.match(html,/noindex/);if(['admin','worker'].includes(route))assert.ok(page.url().includes('/'+route+'/')||page.url().includes('/login/'));
  await page.waitForTimeout(150);
  if(route==='reviews')assert.doesNotMatch(await page.locator('#reviewsGrid').innerText(),/جارٍ تحميل|تعذر تحميل/);
  assert.ok((await page.locator('body').innerText()).trim().length>20,mode+' '+path+' blank body');
  if(mode==='dev'&&route==='reviews')assert.equal(await page.evaluate(async()=>typeof (await import('/src/firebase-client.js')).getPublishedReviews),'function');
  const resolved=page.url();await page.goto('http://127.0.0.1:'+port+(route==='services'?'/results/':'/services/'));await page.goBack();await page.waitForTimeout(150);assert.equal(new URL(page.url()).pathname,new URL(resolved).pathname,mode+' '+path+' back');results.push({mode,path,width,resolved,direct:true,refresh:true,back:true});
 }
 await page.goto('http://127.0.0.1:'+port+'/');
 await page.evaluate(()=>localStorage.setItem('mz-branch','talkha'));
 await page.goto('http://127.0.0.1:'+port+'/?book=1');
 await page.locator('#bookingDialog[open]').waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('mz-branch')),'talkha');
 assert.equal(await page.locator('#branchDialog').isVisible(),false);
 results.push({mode,path:'/?book=1',width,bookingOpen:true,branchPreserved:true});
 if(width===390){await page.locator('[data-close-booking]').first().click();await page.locator('.premium-bottom-nav a[href="/services/"]').click();assert.equal(new URL(page.url()).pathname,'/services/');results.push({mode,path:'mobile-navigation',width,servicesLink:true});}
 }
 if(mode==='dev'){
   const module=await server.moduleGraph.getModuleByUrl('/src/firebase-client.js');
   assert.ok(module,'Vite must resolve the real Firebase client module');
   const source=await fs.readFile(root+'src/firebase-client.js','utf8');
   assert.equal((source.match(/export async function getPublishedReviews\(/g)||[]).length,1);
   moduleGraph.push({id:module.id,url:module.url,importers:[...module.importers].map(m=>m.url),reviewExportDefinitions:1});
 }
 assert.deepEqual(errors,[]);await context.close();
 }finally{if(mode==='dev')await server.close();else await new Promise(r=>server.httpServer.close(r));}
}}finally{await browser.close();}
await fs.writeFile(new URL('../../final-closure-evidence/route-results.json',import.meta.url),JSON.stringify({offlineFirebaseConfig:true,realModules:true,moduleGraph,results,errors:[]},null,2));console.log(JSON.stringify({checks:results.length,errors:[],moduleGraph}));
