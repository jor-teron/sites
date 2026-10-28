/* Telephone TP2 — the one save module. localStorage only:
   'telephone-settings-v1' = { name, theme:'system'|'light'|'dark', num:'<4 digits, 2–9 first>', did:<16 hex, lasting device id>,
     volume:0.9 (0–1), sink:'' (chosen audio output id, where setSinkId exists), keytones:true,
     TP2: dnd:false, dndFav:true (favourites still ring when DND is on), facing:'user'|'environment', missedSeen:<ms> }
   'telephone-log-v1'      = [ {dir:'in'|'out'|'missed', num, name, did, at:<ms>, dur:<s>, why:''} ]  newest first, max 100
   'telephone-contacts-v1' = [ {id:<8 hex>, name, num:'<4 digits>', did:'' (device id when known: follows a new number), fav:false} ]  max 200
   'telephone-last-code'   = last Hub Connect Code used.
   Theme 'system' follows the Hub's sites-hub.theme when set, else the OS. Default theme: dark. */
(function () {
  'use strict';
  var KEY = 'telephone-settings-v1', LOG = 'telephone-log-v1', LAST = 'telephone-last-code', CON = 'telephone-contacts-v1', MAXLOG = 100, MAXCON = 200;
  var P = { name: '', theme: 'dark', num: '', did: '', volume: 0.9, sink: '', keytones: true, dnd: false, dndFav: true, facing: 'user', missedSeen: 0 };
  try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* blocked / broken */ }
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  P.volume = Math.max(0, Math.min(1, +P.volume)); if (isNaN(P.volume)) P.volume = 0.9;
  P.keytones = P.keytones !== false; P.sink = typeof P.sink === 'string' ? P.sink : '';
  P.dnd = P.dnd === true; P.dndFav = P.dndFav !== false; P.facing = P.facing === 'environment' ? 'environment' : 'user'; P.missedSeen = +P.missedSeen || 0;
  function hex(n) {
    var a = new Uint8Array(n), s = '';
    try { crypto.getRandomValues(a); } catch (_) { for (var i = 0; i < n; i++) a[i] = Math.random() * 256; }
    for (var j = 0; j < n; j++) s += ('0' + a[j].toString(16)).slice(-2);
    return s;
  }
  function newNum(avoid) {   // 4 digits, never starting with 0 or 1
    var n, tries = 0;
    do { n = String(2000 + Math.floor(Math.random() * 8000)); } while (avoid && avoid.indexOf(n) >= 0 && ++tries < 50);
    return n;
  }
  var fresh = false;
  if (!/^[0-9a-f]{16}$/.test(String(P.did || ''))) { P.did = hex(8); fresh = true; }
  if (!/^[2-9]\d{3}$/.test(String(P.num || ''))) { P.num = newNum(); fresh = true; }
  var log = [];
  try { log = JSON.parse(localStorage.getItem(LOG) || '[]'); } catch (_) { log = []; }
  if (!Array.isArray(log)) log = [];
  log = log.filter(function (e) { return e && /^(in|out|missed)$/.test(e.dir) && /^\d{1,8}$/.test(String(e.num)) && +e.at > 0; }).slice(0, MAXLOG);
  var cons = [];
  function cleanCon(x) {   // repair: keep only well-formed contacts
    if (!x || typeof x !== 'object') return null;
    var num = String(x.num || '').replace(/\D/g, ''), nm = String(x.name || '').trim().slice(0, 40);
    if (!/^\d{4}$/.test(num) || !nm) return null;
    return { id: /^[0-9a-f]{8}$/.test(String(x.id)) ? String(x.id) : hex(4), name: nm, num: num, did: /^[0-9a-f]{16}$/.test(String(x.did || '')) ? String(x.did) : '', fav: x.fav === true };
  }
  function loadCons(raw) { var a; try { a = JSON.parse(raw || '[]'); } catch (_) { a = []; } return (Array.isArray(a) ? a : []).map(cleanCon).filter(Boolean).slice(0, MAXCON); }
  cons = loadCons(ls0(CON));
  function ls0(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function sortCons() { cons.sort(function (a, b) { return a.name.localeCompare(b.name) || a.num.localeCompare(b.num); }); }
  sortCons();

  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (_) { /* blocked */ } }
  function saveLog() { try { localStorage.setItem(LOG, JSON.stringify(log)); } catch (_) { /* blocked */ } }
  function saveCons() { sortCons(); try { localStorage.setItem(CON, JSON.stringify(cons)); } catch (_) { /* blocked */ } if (window.TPSave && TPSave.oncontacts) TPSave.oncontacts(); }
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function hubName() {
    try { if (window.SharedLinkDevices) return SharedLinkDevices.name(); } catch (_) { /* */ }
    return ls('shared-link-device-name');
  }
  function name() { return P.name || hubName() || 'Device'; }
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function theme() {
    var t = P.theme, hub = ls('sites-hub.theme');
    if (t === 'system' && (hub === 'light' || hub === 'dark')) t = hub;
    var dark = t === 'dark' || (t === 'system' && mq && mq.matches);
    document.documentElement.classList.toggle('dark', dark);
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);
  addEventListener('storage', function (e) {
    if (e.key === 'sites-hub.theme') theme();
    if (e.key === LOG) { try { log = JSON.parse(e.newValue || '[]') || []; } catch (_) { /* */ } if (window.TPSave && TPSave.onlog) TPSave.onlog(); }
    if (e.key === CON) { cons = loadCons(e.newValue); sortCons(); if (window.TPSave && TPSave.oncontacts) TPSave.oncontacts(); }
  });
  window.TPSave = {
    get: function (k) { return P[k]; },
    set: function (k, v) { P[k] = v; save(); if (k === 'theme') theme(); },
    name: name, theme: theme, ls: ls, newNum: newNum,
    log: function () { return log.slice(); },
    addLog: function (e) {
      log.unshift({ dir: e.dir, num: String(e.num || ''), name: String(e.name || '').slice(0, 40), did: /^[0-9a-f]{16}$/.test(String(e.did || '')) ? e.did : '', at: e.at || Date.now(), dur: Math.max(0, Math.round(e.dur || 0)), why: e.why || '' });
      if (log.length > MAXLOG) log.length = MAXLOG;
      saveLog(); if (TPSave.onlog) TPSave.onlog();
    },
    clearLog: function () { log = []; saveLog(); if (TPSave.onlog) TPSave.onlog(); },
    lastCode: function () { return ls(LAST); },
    setLastCode: function (c) { try { localStorage.setItem(LAST, c); } catch (_) { /* */ } },
    onlog: null,
    /* contacts (TP2) */
    contacts: function () { return cons.map(function (x) { return Object.assign({}, x); }); },
    contact: function (num, did) {   // by device id first (it survives a new number), then by number
      var hit = did ? cons.filter(function (x) { return x.did && x.did === did; })[0] : null;
      return hit || cons.filter(function (x) { return x.num === String(num); })[0] || null;
    },
    saveContact: function (x) {   // add (no id) or edit (id) → returns the saved copy, or null when invalid / full
      var y = cleanCon(Object.assign({}, x, { id: x.id || hex(4) })); if (!y) return null;
      var i = -1; cons.forEach(function (c, k) { if (c.id === x.id) i = k; });
      if (i >= 0) cons[i] = y; else { if (cons.length >= MAXCON) return null; cons.push(y); }
      saveCons(); return Object.assign({}, y);
    },
    deleteContact: function (id) { var n = cons.length; cons = cons.filter(function (c) { return c.id !== id; }); if (cons.length !== n) saveCons(); return cons.length !== n; },
    followNum: function (did, num) {   // a known device came back with a new number → update its contact(s)
      var ch = [];
      cons.forEach(function (c) { if (c.did && c.did === did && c.num !== num && /^\d{4}$/.test(num)) { c.num = num; ch.push(c.name); } });
      if (ch.length) saveCons();
      return ch;
    },
    oncontacts: null
  };
  if (fresh) save();
  theme();
})();
