// ============================================================================
// UNSC TAC-BALANCER V2 — SERVICE WORKER PWA (sw.js)
// Estrategia Network-First. Ignora siempre /api/*, Firestore, Google APIs y Discord
// para garantizar datos en vivo sin interferencias.
// ============================================================================
const CACHE_NAME = 'halomatch-pwa-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(STATIC_ASSETS))
            .catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) {
        // Ignorar siempre firestore.googleapis.com, googleapis.com, discord.com, etc.
        return;
    }
    if (url.pathname.startsWith('/api/')) {
        // Ignorar siempre /api/*
        return;
    }

    // Network-First para recursos del mismo origen
    event.respondWith(
        fetch(req)
            .then((networkRes) => {
                if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
                    const copy = networkRes.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
                }
                return networkRes;
            })
            .catch(() => caches.match(req))
    );
});
