/**
 * Service worker — Coach Aïmen.
 *
 * Stratégie :
 *  - navigation (HTML) : réseau d'abord, cache en secours → tu vois toujours la
 *    dernière version quand tu as du réseau, et l'app s'ouvre quand tu n'en as pas ;
 *  - données et assets statiques : cache d'abord, mise à jour en arrière-plan →
 *    les 913 ko d'exercices ne sont téléchargés qu'une fois ;
 *  - GIF du CDN : cache d'abord, avec plafond, pour ne pas saturer le stockage.
 */

const VERSION = "v3";
const SHELL_CACHE = `coach-shell-${VERSION}`;
const DATA_CACHE = `coach-data-${VERSION}`;
const MEDIA_CACHE = `coach-media-${VERSION}`;
const MEDIA_MAX_ENTRIES = 400;

const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // `addAll` échoue en bloc si une seule ressource manque : on tolère les absences.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("coach-") && !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    const fallback = await cache.match("/");
    if (fallback) return fallback;
    throw error;
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // Revalidation silencieuse : la prochaine ouverture aura la version fraîche.
    fetch(request)
      .then((response) => {
        if (response && response.ok) cache.put(request, response.clone());
      })
      .catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (response && (response.ok || response.type === "opaque")) {
    cache.put(request, response.clone());
    if (maxEntries) trimCache(cacheName, maxEntries);
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === "https://cdn.jsdelivr.net") {
    event.respondWith(cacheFirst(request, MEDIA_CACHE, MEDIA_MAX_ENTRIES));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith("/data/")) {
    event.respondWith(cacheFirst(request, DATA_CACHE));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|jpg|webp|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  }
});
