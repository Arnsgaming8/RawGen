// Service Worker for RawGen - Caching & Notifications
const CACHE_NAME = 'rawgen-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js'
];

// Install - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch - serve from cache or network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // NEVER cache API or proxy calls
    if (event.request.method !== 'GET' || 
        url.pathname.startsWith('/api/') || 
        url.pathname.startsWith('/proxy/')) {
        return;
    }
    
    // Skip external requests
    if (url.origin !== self.location.origin) {
        return;
    }
    
    event.respondWith(
        caches.match(event.request).then(cached => {
            // Network first, cache fallback
            const fetchPromise = fetch(event.request).then(response => {
                // Cache successful static responses only
                if (response.ok && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            }).catch(err => {
                console.error('Fetch failed:', err);
                return cached;
            });
            
            return fetchPromise || cached;
        })
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            if (clientList.length > 0) {
                return clientList[0].focus();
            }
            return clients.openWindow('/');
        })
    );
});
