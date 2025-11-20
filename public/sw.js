// Simple offline-first caching for the app shell and static assets.
const APP_SHELL = ['/', '/index.html', '/manifest.json'];
const STATIC_CACHE = 'smartspend-static-v2';
const RUNTIME_CACHE = 'smartspend-runtime-v2';

const offlineResponse = async () => {
  const cached = await caches.match('/index.html');
  return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
};

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(RUNTIME_CACHE);
  const cachedResponse = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cachedResponse) {
    networkFetch.catch(() => undefined);
    return cachedResponse;
  }

  const networkResponse = await networkFetch;
  return networkResponse || offlineResponse();
};

const networkFirstPage = async (request) => {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match('/index.html');
    if (cached) return cached;
    return new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.url.startsWith('chrome-extension')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }

  const url = new URL(request.url);
  const sameOriginAsset =
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/assets/') ||
      ['script', 'style', 'font', 'image'].includes(request.destination));

  const cdnHosts = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdn.tailwindcss.com',
    'aistudiocdn.com',
  ];
  const isCDN = cdnHosts.includes(url.hostname);

  if (sameOriginAsset || isCDN) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
