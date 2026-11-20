/// <reference lib="webworker" />
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

/**
 * What this worker keeps on the device: the static app shell (hashed JS/CSS, icons) and the offline page.
 * It deliberately never stores API responses, HTML pages or photos: those hold private data, and a phone
 * can be shared or lost. Offline, a navigation shows /offline instead.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    { matcher: ({ url }) => url.pathname.startsWith("/api/"), handler: new NetworkOnly() }, // private data, avatars included
    { matcher: ({ request }) => request.mode === "navigate", handler: new NetworkOnly() }, // pages: network, or /offline below
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static/"), // content-hashed, safe to keep for a long time
      handler: new CacheFirst({ cacheName: "static-assets", plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 })] }),
    },
    {
      matcher: ({ request, url }) => ["style", "script", "font", "image"].includes(request.destination) && url.origin === self.location.origin,
      handler: new StaleWhileRevalidate({ cacheName: "assets", plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 })] }),
    },
  ],
  fallbacks: { entries: [{ url: "/offline", matcher: ({ request }) => request.destination === "document" }] },
});

serwist.addEventListeners();
