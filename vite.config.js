import { defineConfig } from "vite";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const siteUrl = (process.env.SITE_URL || "https://el-mezaen-talkha.vercel.app").replace(/\/$/, "");
const siteOrigin = new URL(siteUrl).origin;

function localConfig(req,res,next) {
  if(new URL(req.url,'http://localhost').pathname!=='/__local-appcheck.js')return next();
  if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host||'')){res.writeHead(404);res.end();return;}
  let token;try{token=JSON.parse(readFileSync(resolve(import.meta.dirname,'.local/firebase-dev.json'),'utf8')).appCheckDebugToken;}catch{}
  res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-store');
  res.end(typeof token==='string'&&/^[a-zA-Z0-9_-]{20,200}$/.test(token)?`globalThis.__LOCAL_APPCHECK_DEBUG_TOKEN__=${JSON.stringify(token)};`:'');
}
const entries = new Set(["admin", "worker", "login", "account", "booking", "services", "packages", "team", "reviews", "results", "hair-systems", "branches/talkha", "branches/mashaya"]);
function normalizeRoute(req, res, next) {
  const url = new URL(req.url, "http://localhost");
  if (entries.has(url.pathname.slice(1))) {
    res.writeHead(307, { Location: `${url.pathname}/${url.search}` });
    res.end(); return;
  }
  next();
}

export default defineConfig({
  plugins: [{
    name: "mpa-route-normalization",
    configureServer(server) { server.middlewares.use(localConfig); server.middlewares.use(normalizeRoute); },
    configurePreviewServer(server) { server.middlewares.use(normalizeRoute); }
  }, {
    name: "seo-site-url",
    transformIndexHtml(html,ctx) {
      if(ctx.server) html=html.replace('</head>','<script src="/__local-appcheck.js"></script></head>');
      return html.replaceAll("__SITE_URL__", siteUrl).replaceAll("__SITE_ORIGIN__", siteOrigin);
    }
  }],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        worker: resolve(import.meta.dirname, "worker/index.html"),
        booking: resolve(import.meta.dirname, "booking/index.html"),
        main: resolve(import.meta.dirname, "index.html"),
        admin: resolve(import.meta.dirname, "admin/index.html"),
        login: resolve(import.meta.dirname, "login/index.html")
        ,services: resolve(import.meta.dirname, "services/index.html")
        ,packages: resolve(import.meta.dirname, "packages/index.html")
        ,reviews: resolve(import.meta.dirname, "reviews/index.html")
        ,team: resolve(import.meta.dirname, "team/index.html")
        ,branchTalkha: resolve(import.meta.dirname, "branches/talkha/index.html")
        ,branchMashaya: resolve(import.meta.dirname, "branches/mashaya/index.html")
        ,hairSystems: resolve(import.meta.dirname, "hair-systems/index.html")
        ,account: resolve(import.meta.dirname, "account/index.html")
        ,results: resolve(import.meta.dirname, "results/index.html")
        ,notFound: resolve(import.meta.dirname, "404.html")
      }
    }
  },
  server: { port: 4173, strictPort: true }
});
