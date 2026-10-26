/* My Day — service worker. Cache-first for app files; bump VER when files change. Scope = this folder. */
var VER='myday-pd1-1';
var FILES=['./','dashboard.html','dashboard.css','dashboard_store.js','dashboard_core.js','dashboard_settings.js','dashboard_app.js',
  'cards/card_todo.js','cards/card_schedule.js','cards/card_notes.js','cards/card_links.js','manifest.json','dashboard_icon.svg','dashboard_icon_192.png','dashboard_icon_512.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(VER).then(function(c){return c.addAll(FILES);}).then(function(){return self.skipWaiting();}));});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k.indexOf('myday-')===0&&k!==VER;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(function(r){return r||fetch(e.request).then(function(res){
    if(res.ok&&new URL(e.request.url).pathname.indexOf(self.registration.scope.replace(location.origin,''))===0){var c=res.clone();caches.open(VER).then(function(ca){ca.put(e.request,c);});}return res;});}));
});
