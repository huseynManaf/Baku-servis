const CACHE_NAME = 'bakuservis-shell-v1';
const APP_SHELL = ['/', '/css/style.css', '/js/app-shell.js', '/js/main.js', '/logo.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))));
});

self.addEventListener('push', (event) => {
  const data = event.data?.json() || { title: 'Baku Servis', body: 'Servis statusunuz yeniləndi.' };
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/favicon.svg',
    data: data.url || '/#track'
  }));
});