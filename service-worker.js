const CACHE_NAME = "coffee-counter-v15";
const APP_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./sounds/749860__etheraudio__satisfying-click.wav",
  "./assets/my_coffee_cup1.png",
  "./assets/colacao%201.png",
  "./assets/Taza%20icono%20cafe.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(networkFirst(event.request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const networkRequest = createNetworkRequest(request);

  try {
    const networkResponse = await fetch(networkRequest);

    if (shouldCacheResponse(networkResponse)) {
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    if (request.mode === "navigate") {
      return cache.match("./index.html");
    }

    throw error;
  }
}

function createNetworkRequest(request) {
  return new Request(request, { cache: "reload" });
}

function shouldCacheResponse(response) {
  return Boolean(response && response.ok && response.type === "basic");
}
