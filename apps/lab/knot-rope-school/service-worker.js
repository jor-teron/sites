const CACHE = "knot-rope-school-v10";
const FILES = ["./", "./index.html", "./knot-rope-school.html", "./ui/tokens.css", "./ui/layout.css", "./ui/components.css", "./ui/responsive.css", "./core/lessons.js", "./lessons/lesson-01.js", "./lessons/lesson-02.js", "./lessons/lesson-03.js", "./lessons/lesson-04.js", "./lessons/lesson-05.js", "./lessons/lesson-06.js", "./lessons/lesson-07.js", "./core/diagrams.js", "./core/tutorials.js", "./core/app.js", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match("./knot-rope-school.html"))));
});