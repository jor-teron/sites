/* Agent — agent_sw.js: Agent's own service worker (AG8, AG-F7). Scope = apps/lab/agent/ (registered by app/main.js as
   plain agent_sw.js), so it never touches the Hub's root sw.js (whose activate only clears hub-* caches).
   AG-F7: ONE plain cache 'agent-files', never keyed on a build or version. Every same-origin GET in this folder
   (pages, app files, vendor/transformers files) is network-first (cache:'no-cache'), stored under its bare URL
   (query stripped); offline, the cached copy is served (pages fall back to agent.html). Install precaches the
   shell list (agent.html's local src= / href=, + index.html, agent.html, the icon). Activate deletes the old
   'agent-shell-*' / 'agent-vendor-*' caches once. 'agent-browser-model' (Browser model files) is never touched here.
   AG20: restored (AG19 shipped this file empty by mistake).
   AG15: the shell list also reads image.html (the Image page); VER only changes this file so browsers re-install.
   AG27: VER agent-ag27 so install picks up the shared Hub dialog linked from agent.html (chat rename).
   AG28: VER agent-ag28 so install picks up the step limit (0 = unlimited, no 30 cap) and the 128000 context default.
   AG29: VER agent-ag29 so install precaches prompts/prompt_*.txt and prompts/prompt_fallback.js (prompt wording).
   AG30: VER agent-ag30 so install precaches usage.html (the Usage page) and the files it links.
   Never cached: non-GET, anything cross-origin, and same-origin paths outside this folder except the shell list. */
var FILES = 'agent-files', VER = 'agent-ag33', PAGES = ['agent.html', 'image.html', 'usage.html'];   /* AG15: VER bump re-installs; image.html and usage.html files precached too */
/* AG33 Legacy: VER = 'agent-ag32'. AG33 bumps it for knowledge.js, ksearch.js, search_memory.js, knowview.js. */
/* AG32 Legacy: VER = 'agent-ag31'. AG32 bumps it for core/summary.js and gui/summaryview.js. */
/* AG31 Legacy: VER = 'agent-ag30'. AG31 bumps it so install precaches core/length.js, core/assist.js, gui/assistset.js. */
/* AG30 Legacy: VER = 'agent-ag29' so the previous install could precache prompts/prompt_*.txt and prompts/prompt_fallback.js. */
/* AG29 Legacy: VER = 'agent-ag28' so the previous install could pick up the step limit and the 128000 context default. */
var PROMPTS = ['prompts/prompt_fallback.js', 'prompts/prompt_system.txt', 'prompts/prompt_files.txt', 'prompts/prompt_shell.txt', 'prompts/prompt_web.txt', 'prompts/prompt_memory.txt', 'prompts/prompt_settings.txt'];
var BASE = new URL('./', self.location.href).href;
function bare(u) { var x = new URL(u); x.search = ''; x.hash = ''; return x.href; }
function shellList() {
  return Promise.all(PAGES.map(function (p) { return fetch(BASE + p, { cache: 'no-store' }).then(function (r) { return r.text(); }).catch(function () { return ''; }); })).then(function (hs) {
    var urls = PAGES.concat(['index.html', 'agent_icon.png']), re = /\s(?:src|href)="([^"#:]+)"/g, m, h = hs.join('\n');
    while ((m = re.exec(h))) if (!/^(\/\/|data:|mailto:)/.test(m[1])) urls.push(m[1]);
    urls = urls.concat(PROMPTS);
    return urls.map(function (u) { return bare(new URL(u, BASE).href); }).filter(function (u, i, a) { return a.indexOf(u) === i; });
  });
}
self.addEventListener('install', function (e) {
  e.waitUntil(shellList().then(function (l) { return caches.open(FILES).then(function (c) { return Promise.all(l.map(function (x) {
    return fetch(x, { cache: 'no-cache' }).then(function (res) { if (res.ok) return c.put(x, res); }).catch(function () {}); })); }); })
    .catch(function () {}).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('agent-shell-') === 0 || k.indexOf('agent-vendor-') === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
function fromCache(r, page) {
  return caches.open(FILES).then(function (c) { return c.match(bare(r.url), { ignoreSearch: true }).then(function (h) {
    return h || (page ? c.match(BASE + 'agent.html') : null); }); }).then(function (h) { return h || Response.error(); });
}
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET') return;
  var u = new URL(r.url); if (u.origin !== self.location.origin) return;   /* APIs, helper, CDN: straight to the network */
  if (r.url.indexOf(BASE) !== 0 && r.mode === 'navigate') return;   /* other Hub pages: not ours */
  var page = r.mode === 'navigate';
  var mine = r.url.indexOf(BASE) === 0, net = page ? fetch(r) : fetch(r, { cache: 'no-cache' });
  e.respondWith(net.then(function (res) {
    if (mine && res && res.ok && res.type === 'basic' && res.status === 200) { var c = res.clone(); caches.open(FILES).then(function (ca) { return ca.put(bare(r.url), c); }); }
    return res;
  }).catch(function () { return fromCache(r, page); }));
});

/* AG-F7: legacy AG8 worker below, kept as comments */
// /* Agent — agent_sw.js: Agent's own service worker (AG8). Scope = apps/lab/agent/ (registered by app/main.js as
//    agent_sw.js?v=<release>), so it never touches the Hub's root sw.js (whose activate only clears hub-* caches); same
//    pattern as My Day's dashboard_sw.js. Lookups only read Agent's own caches. A shell file that fails to download is skipped. Caches (all prefixed 'agent-', only those are cleaned):
//    - 'agent-shell-<release>': precached on install from agent.html itself (every local src= / href= it lists, with
//      their ?v= tags, + index.html, agent.html, the icon); old agent-shell-* deleted on activate.
//    - 'agent-vendor-<dir>': vendor/transformers-x.y.z files cached on first use (12 MB), kept across releases.
//    Pages (navigations) are network-first with the cached agent.html as offline fallback; other app files cache-first.
//    Never cached: non-GET, anything cross-origin (Ollama, OpenAI-compatible, Gemini, Tavily, the bash helper, Hugging Face
//    model downloads — Transformers.js caches those itself), and same-origin paths outside this folder except the shell list. */
// var V = new URL(self.location.href).searchParams.get('v') || 'dev';
// var SHELL = 'agent-shell-' + V, VENDOR = 'agent-vendor-transformers-3.7.0';
// var BASE = new URL('./', self.location.href).href;
// function shellList() {
//   return fetch(BASE + 'agent.html', { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (h) {
//     var urls = ['agent.html', 'index.html', 'agent_icon.png'], re = /\s(?:src|href)="([^"#:]+)"/g, m;
//     while ((m = re.exec(h))) if (!/^(\/\/|data:|mailto:)/.test(m[1])) urls.push(m[1]);
//     return urls.map(function (u) { return new URL(u, BASE).href; }).filter(function (u, i, a) { return a.indexOf(u) === i; });
//   });
// }
// self.addEventListener('install', function (e) {
//   e.waitUntil(shellList().then(function (l) { return caches.open(SHELL).then(function (c) { return Promise.all(l.map(function (x) { return c.add(x).catch(function () {}); })); }); }).then(function () { return self.skipWaiting(); }));
// });
// self.addEventListener('activate', function (e) {
//   e.waitUntil(caches.keys().then(function (ks) {
//     return Promise.all(ks.filter(function (k) { return (k.indexOf('agent-shell-') === 0 && k !== SHELL) || (k.indexOf('agent-vendor-') === 0 && k !== VENDOR); }).map(function (k) { return caches.delete(k); }));
//   }).then(function () { return self.clients.claim(); }));
// });
// function put(name, req, res) { if (res && res.ok && res.type === 'basic') { var c = res.clone(); caches.open(name).then(function (ca) { ca.put(req, c); }); } return res; }
// self.addEventListener('fetch', function (e) {
//   var r = e.request; if (r.method !== 'GET') return;
//   var u = new URL(r.url); if (u.origin !== self.location.origin) return;   /* APIs, helper, CDN: straight to the network */
//   if (r.mode === 'navigate') {
//     if (r.url.indexOf(BASE) !== 0) return;
//     e.respondWith(fetch(r).then(function (res) { return put(SHELL, r, res); }).catch(function () {
//       return caches.open(SHELL).then(function (c) { return c.match(r, { ignoreSearch: true }).then(function (h) { return h || c.match(BASE + 'agent.html'); }); }); }));
//     return;
//   }
//   if (r.url.indexOf(BASE + 'vendor/') === 0) {
//     e.respondWith(caches.open(VENDOR).then(function (c) { return c.match(r, { ignoreSearch: true }).then(function (h) { return h || fetch(r).then(function (res) { return put(VENDOR, r, res); }); }); }));
//     return;
//   }
//   e.respondWith(caches.open(SHELL).then(function (c) { return c.match(r); }).then(function (h) {
//     return h || fetch(r).then(function (res) { return r.url.indexOf(BASE) === 0 && !u.search ? res : r.url.indexOf(BASE) === 0 ? put(SHELL, r, res) : res; });
//   }));
// });
