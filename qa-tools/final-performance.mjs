import {preview} from 'vite';const {default:lighthouse}=await import(process.env.LIGHTHOUSE_MODULE||'lighthouse');import fs from 'node:fs/promises';
const {chromium:playwright}=await import(process.env.PLAYWRIGHT_MODULE);const chromium=process.env.CHROMIUM_EXECUTABLE_PATH?{args:['--no-sandbox','--disable-dev-shm-usage']}:(await import(process.env.CHROMIUM_MODULE||'@sparticuz/chromium')).default;
const out=process.env.QA_PERFORMANCE_OUTPUT||new URL('../../final-closure-evidence/performance',import.meta.url).pathname;await fs.mkdir(out,{recursive:true});const results=[];
for(const stage of process.env.BASELINE_ROOT?['baseline','after']:['after']){
 const root=stage==='baseline'?process.env.BASELINE_ROOT:new URL('../',import.meta.url).pathname;
 const server=await preview({root,configFile:root+'/vite.config.js',plugins:[{name:'offline-public-fixture',configurePreviewServer(server){server.middlewares.use((req,res,next)=>{if(req.url.split('?')[0]==='/firebase-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.__FIREBASE_CONFIG__={};localStorage.setItem("mz-branch","talkha");');}else next();});}}],preview:{host:'127.0.0.1',port:4190,strictPort:true}});
 const browser=await playwright.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:chromium.args.filter(a=>a!=='--single-process'&&!a.startsWith('--use-gl')&&!a.startsWith('--use-angle')&&!a.includes('gpu')).concat(['--disable-gpu','--remote-debugging-port=9222'])});
 try{
  const routes=process.env.QA_ROUTES_JSON?JSON.parse(process.env.QA_ROUTES_JSON):['/','/services/','/packages/','/reviews/','/team/','/results/','/hair-systems/','/branches/talkha/','/branches/mashaya/'];
  for(let i=0;i<routes.length;i++){
   const route=routes[i];const result=await lighthouse('http://127.0.0.1:4190'+route,{port:9222,logLevel:'error',output:['json'],onlyCategories:['performance','seo'],formFactor:'mobile',throttlingMethod:'simulate',screenEmulation:{mobile:true,width:390,height:844,deviceScaleFactor:1,disabled:false}});
   if(!result?.lhr)throw Error('No Lighthouse result');const lhr=result.lhr;
   const row={stage,route,performance:lhr.categories.performance.score*100,seo:lhr.categories.seo.score*100,lcpMs:lhr.audits['largest-contentful-paint'].numericValue,cls:lhr.audits['cumulative-layout-shift'].numericValue,tbtMs:lhr.audits['total-blocking-time'].numericValue,runtimeError:lhr.runtimeError||null};results.push(row);
   await fs.writeFile(out+`/${stage}-${i}.json`,JSON.stringify(lhr));await fs.writeFile(out+'/summary.json',JSON.stringify({conditions:'Local production build; no live Firebase; identical selected Talkha seed-fixture catalog, mobile simulated throttling; not production/RUM',results},null,2));console.log(JSON.stringify(row));
  }
 }finally{await browser.close();await new Promise(r=>server.httpServer.close(r));}
}
