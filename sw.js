/* ═══════════════════════════════════════════════════════════════════════════
   DEEPDIG · service worker — the whole game is static files, so the whole game
   fits in a cache and the shift survives a dead signal.

   Two rules, deliberately boring:
     * the shell (page, styles, scripts, manifest, icons) is precached at
       install time, so the second launch is instant;
     * everything else in assets/ is cached the first time the game asks for
       it, and revalidated in the background afterwards (stale-while-revalidate),
       so a shift never stalls on the network.

   Navigations are network-first, so a new deploy is picked up the moment the
   phone is online — the cache is a floor, not a ceiling.

   Bump VERSION whenever the shell changes: activate() drops every older cache.
   ═══════════════════════════════════════════════════════════════════════════ */
"use strict";

const VERSION = "deepdig-v1";
const PREFIX = "deepdig-";

/* every <script src> in index.html, plus the furniture around them —
   tools/test.sh asserts that this list cannot drift from the page */
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "manifest.webmanifest",
  "favicon-32.png",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "js/core.js",
  "js/assetlist.js",
  "js/assets.js",
  "js/ui.js",
  "js/well.js",
  "js/rig.js",
  "js/console.js",
  "js/depot.js",
  "js/render.js",
  "js/game.js",
  "js/touch.js",
  "js/main.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    /* one bad path must not sink the whole install — the game is playable
       from the network even if a single icon is unavailable */
    await Promise.all(SHELL.map((url) =>
      cache.add(new Request(url, { cache: "reload" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith(PREFIX) && n !== VERSION)
      .map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;      /* never touch the CDN */

  /* the page itself: fresh when online, cached when not */
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(VERSION);
        cache.put("index.html", fresh.clone());
        return fresh;
      } catch (e) {
        const cache = await caches.open(VERSION);
        return (await cache.match("index.html")) ||
               (await cache.match("./")) ||
               new Response("DEEPDIG is offline and has no cached copy yet.",
                            { status: 503, headers: { "Content-Type": "text/plain" } });
      }
    })());
    return;
  }

  /* everything else: answer from the cache, refresh it in the background */
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: false });
    const network = fetch(req)
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);
    return hit || (await network) || new Response("", { status: 504 });
  })());
});
