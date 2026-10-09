// Offline support. Each build's files are cached together when it installs,
// and older builds are deleted, so the cache doesn't grow with every deploy.

// Filled in with this build's id and files by vite.config.ts.
const BUILD = { id: 'dev', assets: [] };

const APP_SHELL = ['/', '/index.html', '/manifest.json'];
const SHELL_CACHE = 'runway-shell';
// Icons and fonts: a few fixed addresses, updated in place.
const RUNTIME_CACHE = 'runway-runtime';
const ASSET_CACHE = `runway-assets-${BUILD.id}`;

// A server may answer a missing file with the app's page; never cache that as the file.
const isCacheable = (response) =>
  Boolean(response) &&
  (response.ok || response.type === 'opaque') &&
  !(response.headers.get('Content-Type') || '').includes('text/html');

const offlineResponse = async () => {
  const cached = await caches.match('/index.html');
  return cached || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
};

const staleWhileRevalidate = async (request) => {
  const cache = await caches.open(RUNTIME_CACHE);
  const cachedResponse = await cache.match(request, { ignoreVary: true });

  const networkFetch = fetch(request)
    .then((response) => {
      if (isCacheable(response)) {
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

// Built files have their content hash in the name, so a cached copy is never
// stale. The address alone identifies them: a "Vary: Origin" header would
// otherwise stop the copy cached on install from matching a module request.
const cacheFirstAsset = async (request, pathname) => {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (isCacheable(response) && BUILD.assets.includes(pathname)) {
      const cache = await caches.open(ASSET_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return offlineResponse();
  }
};

const networkFirstPage = async (request) => {
  const cache = await caches.open(SHELL_CACHE);
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
  event.waitUntil(Promise.all([
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)),
    caches.open(ASSET_CACHE).then((cache) => cache.addAll(BUILD.assets)),
  ]));
  self.skipWaiting();
});

// Deletes every other cache: earlier builds, and the caches from before this
// scheme (smartspend-static-v4 and smartspend-runtime-v4).
self.addEventListener('activate', (event) => {
  const keep = [SHELL_CACHE, RUNTIME_CACHE, ASSET_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
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
  const isLocalDevelopment =
    ['localhost', '127.0.0.1'].includes(url.hostname) &&
    ['3000', '5173'].includes(url.port);
  if (isLocalDevelopment) return;

  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirstAsset(request, url.pathname));
    return;
  }

  const sameOriginStatic =
    url.origin === self.location.origin &&
    ['script', 'style', 'font', 'image'].includes(request.destination);

  const cdnHosts = [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
  ];
  const isCDN = cdnHosts.includes(url.hostname);

  if (sameOriginStatic || isCDN) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
