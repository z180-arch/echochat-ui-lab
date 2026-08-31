// ============================================================
//  EchoChat Rebuild · Service Worker
//  离线缓存 + 资源预缓存
// ============================================================

const CACHE_NAME = "echochat-v2";
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./src/styles/tokens.css",
  "./src/styles/base.css",
  "./src/styles/components.css",
  "./src/styles/layouts.css",
  "./src/styles/responsive.css",
  "./src/main.js",
  "./src/core/utils.js",
  "./src/core/events.js",
  "./src/core/storage.js",
  "./src/core/store.js",
  "./src/infrastructure/idb.js",
  "./src/infrastructure/asset.js",
  "./src/domain/persona.js",
  "./src/domain/provider.js",
  "./src/domain/memory.js",
  "./src/domain/worldbook.js",
  "./src/domain/moments.js",
  "./src/domain/relations.js",
  "./src/domain/chat.js",
  "./src/ui/components/index.js",
  "./src/ui/views/index.js",
  "./config.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // 网络优先：API 请求
  if (request.url.includes("/v1/") || request.url.includes("/chat/completions")) {
    return;
  }

  // 缓存优先：静态资源
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
