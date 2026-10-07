import test from 'node:test';import assert from 'node:assert/strict';
import {createServer,preview} from 'vite';
const root=new URL('../',import.meta.url).pathname;
const entries=['admin','worker','login','account','booking','services','packages','team','reviews','results','hair-systems','branches/talkha','branches/mashaya'];
for(const mode of ['dev','preview'])test(`Actual Vite ${mode}: all extensionless MPA routes preserve entry and query`,async()=>{
 const server=mode==='dev'?await createServer({root,server:{host:'127.0.0.1',port:0,strictPort:false}}):await preview({root,preview:{host:'127.0.0.1',port:0,strictPort:false}});
 if(mode==='dev')await server.listen();const http=mode==='dev'?server.httpServer:server.httpServer;const origin=`http://127.0.0.1:${http.address().port}`;
 try{for(const route of entries){const noSlash=await fetch(`${origin}/${route}?qa=route`);const slash=await fetch(`${origin}/${route}/?qa=route`);assert.equal(noSlash.status,200);assert.equal(new URL(noSlash.url).pathname,`/${route}/`);assert.equal(new URL(noSlash.url).search,'?qa=route');assert.equal(await noSlash.text(),await slash.text());if(['admin','worker','login'].includes(route)){const html=await(await fetch(`${origin}/${route}`)).text();assert.match(html,new RegExp(mode==='dev'?`src/${route}\\.js`:`assets/${route}-`));assert.doesNotMatch(html,/class="hero-editorial"/);}}}finally{if(mode==='dev')await server.close();else await new Promise(resolve=>server.httpServer.close(resolve));}
});
