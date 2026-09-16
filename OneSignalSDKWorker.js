// The app's one service worker.
//
// It has to be OneSignal's, because a page may only have one worker for its
// scope and OneSignal's is what receives the pushes. The app's own offline
// caching is therefore added here rather than in a second worker of its own.

try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');
} catch (error) {
  // Offline on the very first load, or no notifications configured at all.
  // The caching below is still worth installing.
}

const cacheName = 'poplet-v1';

const shell = [
  './',
  'index.html',
  'app.css',
  'manifest.json',
  'favicon.png',
  'fonts/Caveat-Variable.ttf',
  'fonts/PatrickHand-Regular.ttf',
  'js/geom.js',
  'js/noise.js',
  'js/rough.js',
  'js/theme.js',
  'js/pen.js',
  'js/boil.js',
  'js/shapes.js',
  'js/dates.js',
  'js/reminder.js',
  'js/store.js',
  'js/sync.js',
  'js/world.js',
  'js/bubbleShape.js',
  'js/background.js',
  'js/headFrame.js',
  'js/text.js',
  'js/controller.js',
  'js/book.js',
  'js/sketchCanvas.js',
  'js/config.js',
  'js/push.js',
  'js/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      // One file that won't download must not keep the whole app uncached.
      .then((cache) => Promise.allSettled(shell.map((path) => cache.add(path))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => name !== cacheName).map((name) => caches.delete(name))),
      )
      .then(() => self.clients.claim()),
  );
});

// The app's own files are served from the cache and refreshed behind the back
// of the page, so a phone with no signal still opens its sheet. Anything else
// — the notification service, the database — is never cached.
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Settings are the one file that must never come from an old copy: someone
  // who has just filled in their keys should not have to load the page twice
  // to see the app pick them up.
  if (url.pathname.endsWith('/js/config.js')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(cacheName).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      const fresh = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(cacheName).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        // Nothing cached and nothing on the network: let the browser show its
        // own offline page rather than an empty response it cannot read.
        .catch(() => hit || Response.error());
      return hit || fresh;
    }),
  );
});
