// データやコードを更新したら必ずこの番号を上げる（端末に古い版が残らないように）
const CACHE_NAME = 'turf-lineage-v13';
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/main.js', 'js/util.js', 'js/bloodline.js', 'js/horse.js', 'js/horse-art.js', 'js/training.js', 'js/race-data.js',
  'js/race-sim.js', 'js/race-scene.js', 'js/race-view.js', 'js/game.js',
  'js/ui-common.js', 'js/ui-stable.js', 'js/ui-race.js', 'js/ui-farm.js',
  'data/trainings.json', 'data/sires.json', 'data/names.json', 'data/races.json', 'data/bloodlines.json', 'data/jockeys.json', 'data/horse-shapes.json',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// HTML と JSON は最新を優先し、オフライン時だけキャッシュを使う
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request)) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res.ok) (await caches.open(CACHE_NAME)).put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const isPage = event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('.json') || url.pathname.endsWith('.webmanifest');
  event.respondWith(isPage ? networkFirst(event.request) : cacheFirst(event.request));
});
