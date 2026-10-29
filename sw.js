// Must sit at the site root: a service worker only controls pages at or below its own folder.
// The ?v= tag changes with every Hub release, so this file's bytes change and the browser
// installs the new worker (hub.html registers it with updateViaCache:'none').
importScripts('hub/update/hub_sw.js?v=20261029c');
