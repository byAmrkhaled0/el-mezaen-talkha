const qaExecutablePath=process.env.CHROMIUM_EXECUTABLE_PATH || await chromium.executablePath();
import { createServer } from 'vite';
import chromium from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright';
import fs from 'node:fs/promises';
const root=new URL('../',import.meta.url).pathname;
const server=await createServer({root,server:{host:'127.0.0.1',port:4175,strictPort:true}});await server.listen();
const browser=await playwright.launch({executablePath:qaExecutablePath,args:chromium.args.filter(a=>!a.startsWith("--use-gl")&&!a.startsWith("--use-angle")&&!a.includes("gpu")).concat(["--disable-gpu"]),headless:true});
const out=new URL('../qa-evidence',import.meta.url).pathname;await fs.mkdir(out,{recursive:true});
const sizes=[[320,568],[360,800],[375,812],[390,844],[412,915],[430,932],[768,1024],[820,1180],[1024,768],[1280,720],[1440,900],[1920,1080]];
const { seedCatalog }=await import('../src/seed-data.js');
const service=seedCatalog.services.find(s=>s.active!==false && s.branchIds?.includes('talkha') && s.type!=='product');
const results=[];
const page=await browser.newPage();
await page.route("**/firebase-config.js",route=>route.fulfill({contentType:"text/javascript",body:"window.__FIREBASE_CONFIG__={};"}));
await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,route=>route.abort());
await page.addInitScript(()=>{localStorage.setItem("mz-branch","talkha");localStorage.setItem("mz-theme","dark");});
for(const [width,height] of sizes){
 await page.setViewportSize({width,height});const errors=[];page.on("pageerror",e=>errors.push(e.message));
 for(const path of ['/','/services/','/packages/','/team/','/reviews/','/results/','/hair-systems/','/account/','/login/','/branches/talkha/','/branches/mashaya/']){
  await page.goto('http://127.0.0.1:4175'+path);await page.waitForTimeout(180);
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,width:document.documentElement.scrollWidth,clipped:[...document.querySelectorAll('button,a.btn')].filter(n=>{const r=n.getBoundingClientRect();return r.width>0 && (r.left < -1 || r.right > innerWidth+1) && !n.closest('.horizontal-cards,.category-filters,.nav-links,.catalog-filters,.filter-row') && !(()=>{let p=n.parentElement;while(p){if(['auto','scroll'].includes(getComputedStyle(p).overflowX)&&p.scrollWidth>p.clientWidth)return true;p=p.parentElement;}return false;})();}).map(n=>n.textContent.trim()).slice(0,8)}));
  results.push({width,height,path,...layout,errors:[...errors],fixture:'V10 local seed catalog, no production data'});
  if(([360,390,430,768,820,1024,1440].includes(width))&&['/','/services/','/packages/','/team/'].includes(path))await page.screenshot({path:`${out}/${path==='/'?'Home':path.replaceAll('/','')}-${width}.png`,fullPage:false});
  if((path==='/'&&[390,820,1440].includes(width))||(['services','packages','team'].includes(path.replaceAll('/',''))&&[390,1440].includes(width))){await page.evaluate(()=>document.querySelectorAll('.reveal').forEach(n=>n.classList.add('visible')));await page.screenshot({path:`${out}/${path==='/'?'Home':path.replaceAll('/','')}-${width}-FULL.png`,fullPage:true});}
  if(path==='/'){const counts=await page.evaluate(()=>({services:document.querySelectorAll('#services .service-card').length,packages:document.querySelectorAll('#packages .package-card').length,team:document.querySelectorAll('#team .team-card').length,removed:document.body.innerText.includes('قبل ما تيجي')||document.body.innerText.includes('أسئلة بتساعدك تحجز')}));if(counts.services>8||counts.packages>3||counts.team>5||counts.removed)throw Error('Home content gate failed');for(const text of ['عرض كل الخدمات','عرض كل الباقات','عرض كل فريق العمل'])if(!await page.getByText(text,{exact:true}).isVisible())throw Error('Missing Home catalog CTA '+text);}
 }
 await page.evaluate(id=>{localStorage.setItem('mz-cart',JSON.stringify([{id,qty:1}]));localStorage.removeItem('mz-preview-bookings');},service.id);
 await page.goto('http://127.0.0.1:4175/?book=1');await page.waitForTimeout(150);const open=await page.locator('#bookingDialog').evaluate(n=>n.open);results.push({width,height,path:'booking',open});
 if(width===390 || width===1440)await page.screenshot({path:`${out}/Booking-Service-${width}.png`});
 await page.locator('#nextStep').click();if(width===390)await page.screenshot({path:`${out}/Booking-Worker-${width}.png`});await page.locator('#nextStep').click();if(width===390)await page.screenshot({path:`${out}/Booking-Date-${width}.png`});
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo'}).format(new Date(Date.now()+3*86400000));
 await page.locator('#bookingDate').fill(date);await page.locator('#bookingDate').dispatchEvent('change');
 await page.waitForFunction(()=>document.querySelector('#bookingTime').options.length>1);
 await page.locator('#nextStep').click();if(width===390)await page.screenshot({path:`${out}/Booking-Time-${width}.png`});const value=await page.locator('#bookingTime').evaluate(s=>[...s.options].find(o=>o.value && !o.disabled)?.value);await page.locator('#bookingTime').selectOption(value);
 await page.locator('#nextStep').click();await page.locator('#firstName').fill('عميل');await page.locator('#lastName').fill('معاينة');await page.locator('#customerPhone').fill('01012345678');await page.locator('#nextStep').click();
 const review=await page.locator('[data-step="6"]').evaluate(n=>n.classList.contains('active'));results.push({path:'booking-review',width,height,review,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)});
 if(width===390 || width===1440)await page.screenshot({path:`${out}/Booking-Review-${width}.png`});
 await page.locator('#nextStep').click();await page.waitForFunction(()=>document.querySelector('[data-step="7"]').classList.contains('active'));
 results.push({path:'booking-confirmation',width,height,success:true,bookings:await page.evaluate(()=>JSON.parse(localStorage.getItem('mz-preview-bookings')||'[]').length)});
 page.removeAllListeners("pageerror");
}
await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:4175/');await page.locator('#services').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/AI-FAB-Home-Scroll-390.png`});
await fs.writeFile(`${out}/responsive-results.json`,JSON.stringify(results,null,2));
if(results.some(r=>r.overflow||r.errors?.length))throw Error('Responsive QA failed');
console.log(JSON.stringify({checks:results.length,overflow:results.filter(r=>r.overflow),errors:results.filter(r=>r.errors?.length),booking:results.filter(r=>r.path==='booking')}));
await browser.close();await server.close();
