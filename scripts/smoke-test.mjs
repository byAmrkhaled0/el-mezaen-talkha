import assert from "node:assert/strict";
const base=(process.env.SMOKE_BASE_URL||"http://127.0.0.1:4173").replace(/\/$/,"");
const routes=["/","/admin/","/login/","/account/","/services/","/team/","/hair-systems/","/branches/talkha/","/branches/mashaya/","/firebase-config.js","/assets/icon-192.png"];
for(const route of routes){const response=await fetch(`${base}${route}`,{redirect:"follow"});assert.equal(response.status,200,`${route} returned ${response.status}`);const type=response.headers.get("content-type")||"";if(route.endsWith(".js"))assert.match(type,/javascript/);if(route.endsWith(".png"))assert.match(type,/image\/png/);if(route.endsWith("/")||route==="/")assert.match(type,/text\/html/)}
const home=await(await fetch(`${base}/`)).text();assert.match(home,/firebase-config\.js/);assert.match(home,/\/account\//);console.log(`Smoke PASS: ${routes.length} routes and critical MIME types at ${base}`);
