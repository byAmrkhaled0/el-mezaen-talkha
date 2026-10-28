const VERSION = "production-20261023-1";
const STATIC_CACHE = `el-mezaen-static-${VERSION}`;
const RUNTIME_CACHE = `el-mezaen-runtime-${VERSION}`;
const OFFLINE_CORE = /*__OFFLINE_ASSETS__*/ [];
const CORE = [
  "/", "/manifest.webmanifest", "/admin-manifest.webmanifest",
  "/assets/el-mezaen-mark-v2.webp", "/assets/icon-192.png", "/assets/icon-512.png",
  "/assets/icon-maskable-512.png", "/assets/apple-touch-icon.png", "/assets/premium/hero-640.webp"
];

function compatibleResponse(request, response) {
  if (!response?.ok || response.type === "opaque") return false;
  const path = new URL(request.url || request, self.location.origin).pathname;
  const type = (response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (request.destination === "style" || path.endsWith(".css")) return type === "text/css";
  if (request.destination === "script" || /\.(?:js|mjs)$/.test(path)) return /^(?:text|application)\/(?:x-)?(?:javascript|ecmascript)$/.test(type);
  return true;
}

async function put(cacheName, request, response) {
  if (!compatibleResponse(request, response)) return;
  const copy = response.clone();
  const cache = await caches.open(cacheName);
  await cache.put(request, copy);
}

self.addEventListener("install", event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(async cache => {await cache.addAll(OFFLINE_CORE); await Promise.allSettled(CORE.map(url => cache.add(url)));}));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("el-mezaen-") && ![STATIC_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (["localhost", "127.0.0.1"].includes(new URL(request.url).hostname) && OFFLINE_CORE.length === 0) return;
  // Only built previews have a complete offline precache manifest.

  const url = new URL(request.url);
  // A cached heartbeat would hide a router/WAN outage from the cashier.
  if(url.origin===self.location.origin&&url.pathname==='/connection-check.txt'){event.respondWith(fetch(request,{cache:'no-store'}));return;}
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.hostname.includes("googleapis.com") || url.hostname.includes("cloudfunctions.net")) return;

  if(request.mode === 'navigate' && /^\/admin(?:\/|$)/.test(url.pathname)) {
    // Static shell only. No authenticated API responses enter CacheStorage.
    event.respondWith(fetch(request).then(async response=>{await put(STATIC_CACHE,'/admin/',response);return response;}).catch(async()=>await caches.match('/admin/')||new Response('افتح لوحة الإدارة أثناء الاتصال أولًا',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}})));
    return;
  }
  const sensitiveNavigation = request.mode === "navigate" && (url.pathname.startsWith("/admin") || url.pathname.startsWith("/worker") || url.pathname.startsWith("/login") || url.pathname.startsWith("/account"));
  if (sensitiveNavigation) {
    const retryPath = url.pathname.startsWith("/worker") ? "/worker/" : url.pathname.startsWith("/account") ? "/account/" : url.pathname.startsWith("/login") ? "/login/" : "/admin/";
    event.respondWith(fetch(request).catch(() => new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>غير متصل</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#020811;color:#f4fbff;font-family:system-ui;text-align:center}main{max-width:420px}a{color:#22d3ee}</style><main><h1>الاتصال بالإنترنت مطلوب</h1><p>هذه الصفحة تحتاج اتصالًا آمنًا بالإنترنت لعرض بيانات حسابك الحالية.</p><a href="${retryPath}">إعادة المحاولة</a></main>`, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })));
    return;
  }

  if (url.pathname === "/firebase-config.js") {
    event.respondWith(fetch(request, {cache:"no-store"}).then(async response=>{await put(STATIC_CACHE,request,response);return response;}).catch(async()=>await caches.match(request)||Response.error()));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(async response => {
      await put(RUNTIME_CACHE, request, response);
      return response;
    }).catch(async () => await caches.match(request) || await caches.match(url.pathname.startsWith("/admin") ? "/admin/" : "/")));
    return;
  }

  event.respondWith(caches.match(request).then(async cached => {
    if (cached && compatibleResponse(request, cached)) return cached;
    if (cached) {
      for (const name of await caches.keys()) await (await caches.open(name)).delete(request);
    }
    try {
      const response = await fetch(request);
      await put(RUNTIME_CACHE, request, response);
      return response;
    } catch {
      return new Response("", { status: 503, statusText: "Offline", headers: { "Cache-Control": "no-store" } });
    }
  }));
});

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { notification: { body: event.data?.text() || "" } }; }
  const notification = payload.notification || payload.data?.notification || {};
  event.waitUntil(self.registration.showNotification(notification.title || payload.data?.title || "مزين مصر", {
    body: notification.body || payload.data?.body || "وصل حجز جديد",
    icon: notification.icon || "/assets/icon-192.png",
    badge: notification.badge || "/assets/icon-192.png",
    tag: notification.tag || (payload.data?.entityId ? `${payload.data?.type||"notice"}_${payload.data.entityId}` : payload.data?.bookingId || "el-mezaen-booking"),
    requireInteraction: notification.requireInteraction !== false,
    data: { url: payload.fcmOptions?.link || payload.data?.link || "/admin/" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  let destination;try{destination=new URL(event.notification.data?.url || "/admin/",self.location.origin);}catch{destination=new URL('/admin/',self.location.origin);}
  if(destination.origin!==self.location.origin)destination=new URL('/admin/',self.location.origin);
  const targetUrl=destination.href,portal=destination.pathname.startsWith('/worker/')?'/worker/':destination.pathname.startsWith('/admin/')?'/admin/':destination.pathname;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const existing = list.find(client => {try{const url=new URL(client.url);return url.origin===self.location.origin&&url.pathname.startsWith(portal);}catch{return false;}});
    return existing ? existing.focus().then(() => existing.navigate(targetUrl)) : self.clients.openWindow(targetUrl);
  }));
});

self.addEventListener('message',event=>{
  if(event.data?.type!=='OFFLINE_READY')return;
  event.waitUntil((async()=>{const cache=await caches.open(STATIC_CACHE);const present=await Promise.all(OFFLINE_CORE.map(url=>cache.match(url)));event.ports[0]?.postMessage({ready:OFFLINE_CORE.length>0&&present.every(Boolean),version:VERSION});})());
});
