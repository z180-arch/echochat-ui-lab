// ============================================================
//  EchoChat · Service Worker (Versioned Cache Strategy)
//  APP_VERSION = 1.0.0
//  APP_VERSION ≠ DATA_SCHEMA_VERSION（用户数据不进入 SW Cache）
//
//  缓存策略：
//    HTML       → Network First（优先新鲜度）
//    JS/CSS/JSON → Stale-While-Revalidate（版本化资源）
//    Images     → Cache First（长期缓存）
//    API        → Network Only（不缓存）
//    用户数据    → 完全不进入 SW Cache
//
//  升级流程：新版本 → 新 cache namespace → install → activate → 清理旧缓存
// ============================================================

const APP_VERSION = "1.0.0";
const CACHE_PREFIX = "echochat-";
const STATIC_CACHE = `${CACHE_PREFIX}static-v${APP_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-v${APP_VERSION}`;

// 预缓存核心资源（HTML + 关键 JS/CSS）
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./config.js",
  "./src/main.js",
  "./src/core/version.js",
  "./src/core/utils.js",
  "./src/core/events.js",
  "./src/core/storage.js",
  "./src/core/store.js",
  "./src/styles/tokens.css",
  "./src/styles/base.css",
  "./src/styles/components.css",
  "./src/styles/layouts.css",
  "./src/styles/responsive.css",
];

// 判断资源类型
function getResourceType(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // API / 非 GET / 跨域：Network Only
  if (
    request.method !== "GET" ||
    url.pathname.includes("/v1/") ||
    url.pathname.includes("/chat/completions") ||
    url.origin !== self.location.origin
  ) {
    return "api";
  }

  // HTML
  if (path.endsWith(".html") || path === "/" || path === "" || path.endsWith("/")) {
    return "html";
  }

  // JS / CSS / JSON
  if (path.endsWith(".js") || path.endsWith(".css") || path.endsWith(".mjs") || path.endsWith(".json")) {
    return "static";
  }

  // 图片 / 字体 / 图标
  if (
    path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg") ||
    path.endsWith(".svg") || path.endsWith(".webp") || path.endsWith(".ico") ||
    path.endsWith(".woff2") || path.endsWith(".woff") || path.endsWith(".ttf")
  ) {
    return "image";
  }

  return "other";
}

// Install：预缓存核心资源，skipWaiting 让新版本立即激活
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        cache.addAll(PRECACHE_URLS.map((url) => new Request(url, { cache: "reload" })))
      )
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("[SW] precache failed:", err);
        return self.skipWaiting();
      })
  );
});

// Activate：清理旧版本缓存，claim 所有客户端
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        const obsolete = keys.filter(
          (key) =>
            key.startsWith(CACHE_PREFIX) &&
            key !== STATIC_CACHE &&
            key !== RUNTIME_CACHE
        );
        return Promise.all(obsolete.map((key) => caches.delete(key)));
      })
      .then(() => self.clients.claim())
      .then(() => {
        // 通知所有客户端：新版本已激活
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: "SW_UPDATED", version: APP_VERSION });
          });
        });
      })
  );
});

// Fetch：分类型策略
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const type = getResourceType(request);

  // API / 非 GET / 跨域：Network Only（不拦截）
  if (type === "api") return;

  // HTML：Network First（优先新鲜度，失败回退缓存）
  if (type === "html") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  // JS / CSS / JSON：Stale-While-Revalidate
  if (type === "static") {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Images：Cache First（长期缓存）
  if (type === "image") {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const clone = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  // Other：Network First
  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, clone));
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// 监听来自页面的消息
self.addEventListener("message", (event) => {
  if (event.data === "GET_VERSION") {
    event.source.postMessage({ type: "APP_VERSION", version: APP_VERSION });
  }
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
