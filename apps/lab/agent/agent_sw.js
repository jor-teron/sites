/* Agent — agent_sw.js: Agent's own service worker (AG8). Scope = apps/lab/agent/ (registered by app/main.js as
   agent_sw.js?v=<release>), so it never touches the Hub's root sw.js (whose activate only clears hub-* caches); same
   pattern as My Day's dashboard_sw.js. Lookups only read Agent's own caches. A shell file that fails to download is skipped. Caches (all prefixed 'agent-', only those are cleaned):
   - 'agent-shell-<release>': precached on install from agent.html itself (every local src= / href= it lists, with
     their ?v= tags, + index.html, agent.html, the icon); old agent-shell-* deleted on activate.
   - 'agent-vendor-<dir>': vendor/transformers-x.y.z files cached on first use (12 MB), kept across releases.
   Pages (navigations) are network-first with the cached agent.html as offline fallback; other app files cache-first.
   Never cached: non-GET, anything cross-origin (Ollama, OpenAI-compatible, Gemini, Tavily, the bash helper, Hugging Face
   model downloads — Transformers.js caches those itself), and same-origin paths outside this folder except the shell list. */
var V = new URL(self.location.href).searchParams.get('v') || 'dev';
var SHELL = 'agent-shell-' + V, VENDOR = 'agent-vendor-transformers-3.7.0';
var BASE = new URL('./', self.location.href).href;
function shellList() {
  return fetch(BASE + 'agent.html', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (h) {
    var urls = ['agent.html', 'index.html', 'agent_icon.png'], re = /\s(?:src|href)="([^"#:]+)"/g, m;
    while ((m = re.exec(h))) if (!/^(\/\/|data:|mailto:)/.test(m[1])) urls.push(m[1]);
    return urls.map(function (u) { return new URL(u, BASE).href; }).filter(function (u, i, a) { return a.indexOf(u) === i; });
  });
}
self.addEventListener('install', function (e) {
  e.waitUntil(shellList().then(function (l) { return caches.open(SHELL).then(function (c) { return Promise.all(l.map(function (x) { return c.add(x).catch(function () {}); })); }); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return (k.indexOf('agent-shell-') === 0 && k !== SHELL) || (k.indexOf('agent-vendor-') === 0 && k !== VENDOR); }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function put(name, req, res) { if (res && res.ok && res.type === 'basic') { var c = res.clone(); caches.open(name).then(function (ca) { ca.put(req, c); }); } return res; }
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET') return;
  var u = new URL(r.url); if (u.origin !== self.location.origin) return;   /* APIs, helper, CDN: straight to the network */
  if (r.mode === 'navigate') {
    if (r.url.indexOf(BASE) !== 0) return;
    e.respondWith(fetch(r).then(function (res) { return put(SHELL, r, res); }).catch(function () {
      return caches.open(SHELL).then(function (c) { return c.match(r, { ignoreSearch: true }).then(function (h) { return h || c.match(BASE + 'agent.html'); }); }); }));
    return;
  }
  if (r.url.indexOf(BASE + 'vendor/') === 0) {
    e.respondWith(caches.open(VENDOR).then(function (c) { return c.match(r, { ignoreSearch: true }).then(function (h) { return h || fetch(r).then(function (res) { return put(VENDOR, r, res); }); }); }));
    return;
  }
  e.respondWith(caches.open(SHELL).then(function (c) { return c.match(r); }).then(function (h) {
    return h || fetch(r).then(function (res) { return r.url.indexOf(BASE) === 0 && !u.search ? res : r.url.indexOf(BASE) === 0 ? put(SHELL, r, res) : res; });
  }));
});
