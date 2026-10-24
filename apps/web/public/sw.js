/*
 * Service worker for the staff app: the floor tablet and the staff phone.
 *
 * Hand-written rather than generated, because the one rule that matters here is
 * a negative one and it has to be auditable in ten seconds:
 *
 *   SHELL ASSETS ARE CACHED. API RESPONSES ARE NEVER CACHED.
 *
 * A cached floor plan is a floor plan that lies. A waiter looking at a table
 * this worker served from disk, believing it is free, walks a party into
 * somebody's dinner. Everything below is arranged so that cannot happen: only
 * same-origin GETs for build assets and the app shell are ever stored, and
 * anything that looks like data goes to the network or fails loudly.
 */

const VERSION = 'v2';
const SHELL_CACHE = `yalla-shell-${VERSION}`;

/** The minimum needed to paint something without a network. */
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg'];

/** Hashed build output. Immutable by construction, so cache-first is safe. */
const ASSET_PATH = /^\/assets\//;
const ASSET_EXTENSION = /\.(?:js|css|woff2?|png|svg|webp|ico)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // `reload` so an install never picks the shell up out of the HTTP cache.
      .then((cache) => cache.addAll(SHELL_URLS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name !== SHELL_CACHE).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isShellAsset(url) {
  return ASSET_PATH.test(url.pathname) || ASSET_EXTENSION.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Anything that changes state is none of this worker's business.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin means the API, or a CDN we do not control. Straight through.
  if (url.origin !== self.location.origin) return;

  // Belt and braces alongside the cross-origin check: a same-origin API (a dev
  // proxy, a future reverse proxy) must never be cached either.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network first, so a reachable server always wins, falling back
  // to the shell so an installed tablet still opens in a basement. The shell
  // then fetches its own data and shows its own offline state.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match('/index.html')) ?? Response.error();
      }),
    );
    return;
  }

  // Build assets: cache first. Their URLs carry a content hash, so a stale one
  // is impossible — a changed file is a different URL.
  if (isShellAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else — which is data — is left entirely alone.
});

// --- Web Push (staff phone, 2026-10-24) -----------------------------------------
//
// The server sends `{ title, body, url, tag, kind }` (docs/notifications.md §6a).
// Nothing here fetches or stores anything: the notification carries its own
// words, and a tap opens the app, which reads the floor live as it always does.

/** Only ever a path inside the staff app: a push is not a way to open another site. */
function staffPath(url) {
  try {
    const target = new URL(typeof url === 'string' ? url : '/staff', self.location.origin);
    if (target.origin !== self.location.origin) return '/staff';
    return /^\/staff(?:[/?#]|$)/.test(target.pathname + target.search)
      ? target.pathname + target.search + target.hash
      : '/staff';
  } catch {
    return '/staff';
  }
}

function pushPayload(event) {
  try {
    const data = event.data ? event.data.json() : null;
    if (data && typeof data === 'object') return data;
  } catch {
    // Not JSON: fall through to the plain text, if any.
  }
  const text = event.data ? event.data.text() : '';
  return { title: 'SHURJ', body: text };
}

self.addEventListener('push', (event) => {
  const data = pushPayload(event);
  const title = typeof data.title === 'string' && data.title ? data.title : 'SHURJ';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    // The collapse key: a newer push about the same booking or table replaces
    // the older one rather than stacking up in the shade.
    tag: typeof data.tag === 'string' && data.tag ? data.tag : undefined,
    // A replaced one buzzes again: it is news, not a duplicate.
    renotify: typeof data.tag === 'string' && data.tag !== '',
    icon: '/icon-512.png',
    // No `badge`: Android draws a badge from its alpha channel alone, and
    // both icons are opaque squares, so either would sit in the status bar as
    // a blank white tile. Without one it shows the browser's own small glyph.
    data: { url: staffPath(data.url), kind: typeof data.kind === 'string' ? data.kind : null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = staffPath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // An open staff window is focused and told where to go, rather than
      // reloaded: a half-entered order is React state in it.
      const open = windows.find((client) => new URL(client.url).pathname.startsWith('/staff'));
      if (open) {
        open.postMessage({ type: 'staff-push-open', url });
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
