// Simple service worker to prevent 404 errors
// This is a minimal implementation for NoStressPlanner

const CACHE_NAME = 'nostressplanner-v1';

self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // For now, just pass through all requests
  // In the future, we could add caching strategies here
  event.respondWith(fetch(event.request));
});
