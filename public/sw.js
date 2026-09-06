const CACHE_NAME = 'wishline-demo-v5';
const APP_SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        if (response.ok) {
          await caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/'))),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' ? data.title : 'Wishline update';
  const body = typeof data.body === 'string'
    ? data.body
    : 'Steam published new wishlist activity. Open Wishline to review it.';
  const tag = typeof data.tag === 'string' ? data.tag : 'wishline-update';
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  const receiptId = typeof data.receiptId === 'string' && /^receipt_[0-9a-f]{32}$/.test(data.receiptId)
    ? data.receiptId
    : null;
  const receiptToken = typeof data.receiptToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(data.receiptToken)
    ? data.receiptToken
    : null;
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
    body,
    tag,
    renotify: false,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url, receiptId, receiptToken },
    });
    await acknowledgeTestNotification(receiptId, receiptToken, 'received');
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      await acknowledgeTestNotification(
        event.notification.data?.receiptId,
        event.notification.data?.receiptToken,
        'clicked',
      );
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clients.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        await existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })(),
  );
});

async function acknowledgeTestNotification(receiptId, receiptToken, state) {
  if (!/^receipt_[0-9a-f]{32}$/.test(receiptId || '') || !/^[A-Za-z0-9_-]{43}$/.test(receiptToken || '')) return;
  try {
    await fetch('/api/push/receipt', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json',
        'X-Wishline-Action': 'acknowledge-push-test',
      },
      body: JSON.stringify({ receiptId, receiptToken, state }),
    });
  } catch {
    // A failed acknowledgement must not suppress or break the notification.
  }
}
