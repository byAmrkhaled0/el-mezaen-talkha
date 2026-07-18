const VERSION = "v55";
const STATIC_CACHE = `el-mezaen-static-${VERSION}`;
const RUNTIME_CACHE = `el-mezaen-runtime-${VERSION}`;
const CORE = [
  "/", "/admin/", "/login/", "/manifest.webmanifest", "/admin-manifest.webmanifest",
  "/assets/el-mezaen-mark-v2.webp", "/assets/icon-192.png", "/assets/icon-512.png",
  "/assets/icon-maskable-512.png", "/assets/apple-touch-icon.png", "/assets/hero-barbershop-cyan.webp"
];

async function put(cacheName, request, response) {
  if (!response?.ok || response.type === "opaque") return;
  const copy = response.clone();
  const cache = await caches.open(cacheName);
  await cache.put(request, copy);
}

self.addEventListener("install", event => {
  event.waitUntil(caches.open(STATIC_CACHE).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => ![STATIC_CACHE, RUNTIME_CACHE].includes(key)).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.hostname.includes("googleapis.com") || url.hostname.includes("cloudfunctions.net")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(async response => {
      await put(RUNTIME_CACHE, request, response);
      return response;
    }).catch(async () => await caches.match(request) || await caches.match(url.pathname.startsWith("/admin") ? "/admin/" : "/")));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(async response => {
    await put(RUNTIME_CACHE, request, response);
    return response;
  })));
});

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { notification: { body: event.data?.text() || "" } }; }
  const notification = payload.notification || payload.data?.notification || {};
  event.waitUntil(self.registration.showNotification(notification.title || payload.data?.title || "مزين مصر", {
    body: notification.body || payload.data?.body || "وصل حجز جديد",
    icon: notification.icon || "/assets/icon-192.png",
    badge: notification.badge || "/assets/icon-192.png",
    tag: notification.tag || payload.data?.bookingId || "el-mezaen-booking",
    requireInteraction: notification.requireInteraction !== false,
    data: { url: payload.fcmOptions?.link || payload.data?.link || "/admin/" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/admin/", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const existing = list.find(client => client.url.startsWith(self.location.origin));
    return existing ? existing.focus().then(() => existing.navigate(targetUrl)) : self.clients.openWindow(targetUrl);
  }));
});
