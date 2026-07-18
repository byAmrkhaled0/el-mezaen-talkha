const CACHE = "el-mezaen-v53";
const CORE = ["/", "/admin/", "/login/", "/manifest.webmanifest", "/admin-manifest.webmanifest", "/assets/el-mezaen-mark-v2.webp", "/assets/icon-192.png", "/assets/icon-512.png", "/assets/icon-maskable-512.png", "/assets/apple-touch-icon.png", "/assets/hero-barbershop-cyan.webp"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || event.request.url.includes("googleapis.com") || event.request.url.includes("cloudfunctions.net")) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(async () => await caches.match(event.request) || await caches.match(event.request.url.includes("/admin") ? "/admin/" : "/")));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => {
    const network = fetch(event.request).then(response => {
      if (response.ok && new URL(event.request.url).origin === location.origin) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { notification: { body: event.data?.text() || "" } }; }
  const notification = payload.notification || payload.data?.notification || {};
  const title = notification.title || payload.data?.title || "مزين مصر";
  const body = notification.body || payload.data?.body || "وصل حجز جديد";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: notification.icon || "/assets/icon-192.png",
    badge: notification.badge || "/assets/icon-192.png",
    tag: notification.tag || payload.data?.bookingId || "el-mezaen-booking",
    requireInteraction: notification.requireInteraction !== false,
    data: { url: payload.fcmOptions?.link || payload.data?.link || "/admin/" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/admin/", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const existing = list.find(client => client.url.startsWith(self.location.origin));
    return existing ? existing.focus().then(() => existing.navigate(url)) : clients.openWindow(url);
  }));
});
