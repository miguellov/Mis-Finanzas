const CACHE = "finanzas-v1";

const PRECACHE_URLS = [
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./logo.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((url) =>
            cache.add(new Request(url, { cache: "reload" })).catch(() => {})
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(self.location.origin)) {
    return;
  }
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        if (res.ok) {
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || caches.match("./index.html"))
      )
  );
});
