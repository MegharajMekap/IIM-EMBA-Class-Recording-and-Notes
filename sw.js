// Minimal service worker. Its only job is to exist, which is one of the
// browser's requirements before it will offer "Add to Home Screen".
// It does not cache anything, so the page always loads fresh online.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // pass everything straight to the network
