// Must sit at the site root: a service worker only controls pages at or below its own folder.
// The ?v= tag changes with every Hub release, so this file's bytes change and the browser
// installs the new worker (the Hub page registers it with updateViaCache:'none'; H129d: desktop/desktop.html, before: hub.html).
importScripts('hub/update/hub_sw.js?v=20261107a');
