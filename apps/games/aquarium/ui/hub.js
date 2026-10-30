// Aquarium AQQ1e: optional sites-hub bridge (same v:1 protocol as Ping Pong ui/hub.js), only active inside a frame.
//   game -> hub {type:'hub-ready'} on load;  hub -> game {type:'hub-hello'} -> body.in-hub + reply {type:'hub-app', app, stats, buttons:[Tank]}
//   hub -> game {type:'hub-action', id:'tank'} -> open the tank picker. Accepted only from window.parent with a same-origin / file:// origin.
(function () {
  'use strict';
  var A = window.AQ, V = 1, linked = false;
  var IN_FRAME = (function () { try { return window.parent && window.parent !== window; } catch (e) { return true; } })();
  if (!IN_FRAME) return;
  function post(m) { m.v = V; try { window.parent.postMessage(m, '*'); } catch (e) { /* ignore */ } }
  function originOk(o) { return o === location.origin || o === 'null' || location.origin === 'null' || String(o).indexOf('file:') === 0; }
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || !originOk(e.origin)) return;
    var d = e.data; if (!d || typeof d !== 'object' || d.v !== V) return;
    if (d.type === 'hub-hello') {
      if (!linked) { linked = true; document.body.classList.add('in-hub'); }
      post({ type: 'hub-app', app: { name: 'Aquarium', version: 'AQQ1e' }, stats: [], buttons: [{ id: 'tank', label: 'Tank' }] });
    } else if (d.type === 'hub-action' && linked && d.id === 'tank') A.ui.picker(true);
  });
  post({ type: 'hub-ready' });
})();
