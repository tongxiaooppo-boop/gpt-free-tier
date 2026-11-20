const CACHE = "gft-static-__BUILD_VERSION__";
const scope = new URL("./", self.location.href);
const shell = new URL("index.html", scope).href;
const localStatic = url => url.origin === scope.origin && url.pathname.startsWith(scope.pathname) && /\.(?:js|css|png|webmanifest|woff2?)$/.test(url.pathname);

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch(new Request(shell, { cache: "reload" }));
    if (!response.ok) throw new Error("無法快取應用程式");
    const html = await response.clone().text();
    const files = ["manifest.webmanifest", "icon-192.png", "icon-512.png"].map(path => new URL(path, scope).href);
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const url = new URL(match[1], shell);
      if (localStatic(url)) files.push(url.href);
    }
    await cache.addAll([...new Set(files)]);
    await cache.put(shell, response);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("gft-static-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.hostname === "api.openai.com" || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const isShell = request.mode === "navigate" && (url.pathname === scope.pathname || url.pathname === new URL(shell).pathname);
  if (!isShell && (!localStatic(url) || url.search)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = isShell ? shell : request;
    const cached = await cache.match(key);
    if (cached) return cached;
    const response = await fetch(isShell ? shell : request);
    if (response.ok && response.type === "basic") await cache.put(key, response.clone());
    return response;
  })());
});
