/*
 * H82 HubDnd — one Hub-wide Do Not Disturb, shared by hub.html, /phone.html and their app frames.
 * Keys (this device only, never synced, see hub_profile.js SYNC_SKIP):
 *   localStorage 'sites-hub.dnd'     = '1' on, absent / '0' off (H66 key, also read by hub_notifcenter.js)
 *   localStorage 'sites-hub.dndFavs' = '1' favourites still ring while DND is on (urgent calls marked fav:true)
 * API window.HubDnd: isOn(), set(on), allowFavs(), setAllowFavs(on), on('change', fn), off('change', fn).
 * fn gets {on, favs}. Fires on set() / setAllowFavs() here and on the storage event (other tabs / frames).
 * Apps: use window.parent.HubDnd (or top) when present, else read the keys and listen for 'storage'. DOM-free.
 */
(function () {
  'use strict';
  if (window.HubDnd) return;
  var DND = 'sites-hub.dnd', FAVS = 'sites-hub.dndFavs', fns = [];
  function get(k) { try { return localStorage.getItem(k) === '1'; } catch (_) { return false; } }
  function put(k, v) { try { if (v) localStorage.setItem(k, '1'); else localStorage.removeItem(k); } catch (_) { /* blocked */ } }
  function fire() {
    var s = { on: get(DND), favs: get(FAVS) };
    fns.slice().forEach(function (f) { try { f(s); } catch (_) { /* listener gone */ } });
  }
  window.addEventListener('storage', function (e) { if (!e.key || e.key === DND || e.key === FAVS) fire(); });
  window.HubDnd = {
    KEY: DND, FAVS_KEY: FAVS,
    isOn: function () { return get(DND); },
    set: function (on) { on = !!on; if (on === get(DND)) return; put(DND, on); fire(); },
    allowFavs: function () { return get(FAVS); },
    setAllowFavs: function (on) { on = !!on; if (on === get(FAVS)) return; put(FAVS, on); fire(); },
    on: function (ev, fn) { if (ev === 'change' && typeof fn === 'function') fns.push(fn); },
    off: function (ev, fn) { var i = fns.indexOf(fn); if (i >= 0) fns.splice(i, 1); }
  };
})();
