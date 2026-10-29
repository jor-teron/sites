/* Music Player MP1 — the one save module. localStorage only (Hub Drive can replace it later):
   'music-player-settings-v1'  = { theme:'system'|'light'|'dark', vis:false, volume:0..1, muted, sort:'title'|'artist'|'album',
                                   shuffle:false, repeat:'off'|'all'|'one' }
   'music-player-state-v1'     = resume: { queue:[path], order:[index]|null, idx, path, pos, src:'all'|'pl:<id>', at }
   'music-player-playlists-v1' = [ { id, name, items:[{path, name, size}] } ]  (saved by path + file name, not by file)
   'music-player-tags-v1'      = tag cache { "<path>|<size>": [title, artist, album, track, duration] } (newest 3000)
   The folder handle (where supported) and per-file positions live in ../shared-media/media_files.js.
   Theme 'system' follows the Hub's sites-hub.theme when set, else the OS. Default theme: dark. */
(function () {
  'use strict';
  var SET = 'music-player-settings-v1', ST = 'music-player-state-v1', PL = 'music-player-playlists-v1', TG = 'music-player-tags-v1';
  var TAG_CAP = 3000;
  function rd(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }
  function wr(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  var P = { theme: 'dark', vis: false, volume: 1, muted: false, sort: 'title', shuffle: false, repeat: 'off' };
  Object.assign(P, rd(SET) || {});
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  if (['title', 'artist', 'album'].indexOf(P.sort) < 0) P.sort = 'title';
  if (['off', 'all', 'one'].indexOf(P.repeat) < 0) P.repeat = 'off';
  P.vis = P.vis === true; P.shuffle = P.shuffle === true; P.muted = P.muted === true;
  P.volume = Math.max(0, Math.min(1, isFinite(+P.volume) ? +P.volume : 1));

  function state() {
    var s = rd(ST); if (!s || typeof s !== 'object') return null;
    if (!Array.isArray(s.queue)) return null;
    s.queue = s.queue.filter(function (p) { return typeof p === 'string'; }).slice(0, 20000);
    s.idx = Math.max(0, Math.min(s.queue.length - 1, s.idx | 0));
    s.order = Array.isArray(s.order) && s.order.length === s.queue.length ? s.order.map(function (n) { return n | 0; }) : null;
    s.pos = Math.max(0, +s.pos || 0); s.src = typeof s.src === 'string' ? s.src : 'all';
    return s;
  }
  function playlists() {
    var a = rd(PL); if (!Array.isArray(a)) return [];
    return a.filter(function (p) { return p && typeof p.name === 'string'; }).map(function (p) {
      return { id: String(p.id || ('p' + Math.random().toString(36).slice(2, 9))), name: p.name.slice(0, 80),
        items: (Array.isArray(p.items) ? p.items : []).filter(function (i) { return i && typeof i.path === 'string'; })
          .map(function (i) { return { path: i.path, name: String(i.name || i.path.split('/').pop()), size: +i.size || 0 }; }) };
    });
  }
  var tags = rd(TG); if (!tags || typeof tags !== 'object') tags = {};
  var tagT = 0;
  function saveTags() {
    clearTimeout(tagT);
    tagT = setTimeout(function () {
      var ks = Object.keys(tags); if (ks.length > TAG_CAP) ks.slice(0, ks.length - TAG_CAP).forEach(function (k) { delete tags[k]; });
      if (!wr(TG, tags)) { tags = {}; wr(TG, tags); }
    }, 800);
  }

  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function theme() {
    var t = P.theme, hub = ls('sites-hub.theme');
    if (t === 'system' && (hub === 'light' || hub === 'dark')) t = hub;
    var dark = t === 'dark' || (t === 'system' && mq && mq.matches);
    document.documentElement.classList.toggle('dark', dark);
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);
  addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') theme(); });

  window.MPSave = {
    KEYS: { SET: SET, ST: ST, PL: PL, TG: TG },
    get: function (k) { return P[k]; },
    set: function (k, v) { P[k] = v; wr(SET, P); if (k === 'theme') theme(); },
    theme: theme,
    state: state,
    saveState: function (s) { s.at = Date.now(); return wr(ST, s); },
    clearState: function () { try { localStorage.removeItem(ST); } catch (_) { /* */ } },
    playlists: playlists,
    savePlaylists: function (a) { return wr(PL, a); },
    tag: function (k) { var t = tags[k]; return Array.isArray(t) ? { title: t[0] || '', artist: t[1] || '', album: t[2] || '', track: t[3] || 0, dur: t[4] || 0, tagged: !!t[5] } : null; },
    setTag: function (k, t) { delete tags[k]; tags[k] = [t.title || '', t.artist || '', t.album || '', t.track || 0, Math.round(t.dur || 0), t.tagged ? 1 : 0]; saveTags(); }
  };
  theme();
})();
