/* Telephone TP2b — the one save module. localStorage only:
   'telephone-settings-v1' = { name, theme:'system'|'light'|'dark', num:'<5 digits, 10000–99999>', did:<16 hex, lasting device id>,
     volume:0.9 (0–1), sink:'' (chosen audio output id, where setSinkId exists), keytones:true,
     TP2: dnd:false, dndFav:true (favourites still ring when DND is on), facing:'user'|'environment', missedSeen:<ms>,
     TP6: callNotify:true (system notification for incoming calls), notifyHinted:false (one-time first-call hint shown),
     TP2b: numAt:<ms when this number was set (later clashes: the newer one moves)>, oldNum:'<the 4-digit TP1/TP2 number it replaced>' }
   TP2b number check: the first number of a fresh device, or the 5-digit number replacing a saved 4-digit one, is only a
   candidate (pending) until the app has checked it against the online roster (checked()); until then save() keeps the
   stored value, so nothing unchecked is ever saved.
   'telephone-log-v1'      = [ {dir:'in'|'out'|'missed', num, name, did, at:<ms>, dur:<s>, why:''} ]  newest first, max 100
   'telephone-contacts-v1' = [ {id:<8 hex>, name, num:'<5 digits; an old 4-digit one is kept until its device shows up>', did:'' (device id when known: follows a new number), fav:false} ]  max 200
   'telephone-last-code'   = last Hub Connect Code used.
   Theme 'system' follows the Hub's sites-hub.theme when set, else the OS. Default theme: dark. */
(function () {
  'use strict';
  var KEY = 'telephone-settings-v1', LOG = 'telephone-log-v1', LAST = 'telephone-last-code', CON = 'telephone-contacts-v1', MAXLOG = 100, MAXCON = 200;
  var P = { name: '', theme: 'dark', num: '', did: '', volume: 0.9, sink: '', keytones: true, dnd: false, dndFav: true, facing: 'user', missedSeen: 0, numAt: 0, oldNum: '', callNotify: true, notifyHinted: false };   // TP6: callNotify, notifyHinted
  try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* blocked / broken */ }
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  P.volume = Math.max(0, Math.min(1, +P.volume)); if (isNaN(P.volume)) P.volume = 0.9;
  P.keytones = P.keytones !== false; P.sink = typeof P.sink === 'string' ? P.sink : '';
  P.dnd = P.dnd === true; P.dndFav = P.dndFav !== false; P.facing = P.facing === 'environment' ? 'environment' : 'user'; P.missedSeen = +P.missedSeen || 0;
  P.numAt = +P.numAt || 0; P.oldNum = /^\d{4}$/.test(String(P.oldNum || '')) ? String(P.oldNum) : '';
  function hex(n) {
    var a = new Uint8Array(n), s = '';
    try { crypto.getRandomValues(a); } catch (_) { for (var i = 0; i < n; i++) a[i] = Math.random() * 256; }
    for (var j = 0; j < n; j++) s += ('0' + a[j].toString(16)).slice(-2);
    return s;
  }
  var NUM = /^[1-9]\d{4}$/, OLD = /^\d{4}$/;   // TP2b: 5 digits, 10000–99999; OLD = a TP1/TP2 number
  function rnd() {   // test hook: window.__tpNextNum = ['12345', …] is used first (checks only)
    var q = window.__tpNextNum; if (Array.isArray(q) && q.length) return String(q.shift());
    return String(10000 + Math.floor(Math.random() * 90000));
  }
  function newNum(avoid) {   // 5 digits, 10000–99999 inclusive, not in avoid (when it can)
    var n, tries = 0;
    do { n = rnd(); } while (avoid && avoid.indexOf(n) >= 0 && ++tries < 200);
    return n;
  }
  var fresh = false, pending = false, stored = String(P.num || ''), migr = false;
  if (!/^[0-9a-f]{16}$/.test(String(P.did || ''))) { P.did = hex(8); fresh = true; }
  if (!NUM.test(stored)) {   // fresh device or an old 4-digit number → candidate, saved after the check
    if (OLD.test(stored)) { P.oldNum = stored; migr = true; }   // moved ONCE: the next load finds 5 digits
    P.num = newNum([stored]); pending = true;
  }
  var log = [];
  try { log = JSON.parse(localStorage.getItem(LOG) || '[]'); } catch (_) { log = []; }
  if (!Array.isArray(log)) log = [];
  log = log.filter(function (e) { return e && /^(in|out|missed)$/.test(e.dir) && /^\d{1,8}$/.test(String(e.num)) && +e.at > 0; }).slice(0, MAXLOG);
  var cons = [];
  function cleanCon(x) {   // repair: keep only well-formed contacts
    if (!x || typeof x !== 'object') return null;
    var num = String(x.num || '').replace(/\D/g, ''), nm = String(x.name || '').trim().slice(0, 40);
    if (!(NUM.test(num) || OLD.test(num)) || !nm) return null;   // old 4-digit numbers are kept (shown as old)
    return { id: /^[0-9a-f]{8}$/.test(String(x.id)) ? String(x.id) : hex(4), name: nm, num: num, did: /^[0-9a-f]{16}$/.test(String(x.did || '')) ? String(x.did) : '', fav: x.fav === true };
  }
  function loadCons(raw) { var a; try { a = JSON.parse(raw || '[]'); } catch (_) { a = []; } return (Array.isArray(a) ? a : []).map(cleanCon).filter(Boolean).slice(0, MAXCON); }
  cons = loadCons(ls0(CON));
  function ls0(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function sortCons() { cons.sort(function (a, b) { return a.name.localeCompare(b.name) || a.num.localeCompare(b.num); }); }
  sortCons();

  function save() {   // while the number is pending, the stored number stays as it was
    var o = pending ? Object.assign({}, P, { num: stored }) : P;
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { /* blocked */ }
  }
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
    numOk: function (n) { return NUM.test(String(n || '')); },
    isOld: function (n) { return OLD.test(String(n || '')); },
    pending: function () { return pending; },
    setNum: function (n) { P.num = String(n); P.numAt = Date.now(); if (!pending) save(); },   // later clash / New number
    checked: function (avoid) {   // TP2b: the roster answered (avoid = numbers online) or the wait ran out (avoid = null)
      if (!pending) return null;
      if (avoid && avoid.indexOf(P.num) >= 0) P.num = newNum(avoid);
      pending = false; P.numAt = Date.now(); stored = P.num; save();
      return { num: P.num, old: migr ? P.oldNum : '' };
    },
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
    followNum: function (did, num, old) {   // a known device came back with a new number → update its contact(s)
      var ch = [];   // by device id; TP2b: a contact without a device id that still has the device's old 4-digit number too
      if (!NUM.test(num)) return ch;
      cons.forEach(function (c) {
        var hit = c.did ? c.did === did : (OLD.test(old || '') && c.num === old && OLD.test(c.num));
        if (hit && c.num !== num) { c.num = num; if (!c.did && /^[0-9a-f]{16}$/.test(did)) c.did = did; ch.push(c.name); }
      });
      if (ch.length) saveCons();
      return ch;
    },
    followLog: function (did, num, old) {   // TP2b: Recent entries that still have the device's old 4-digit number
      if (!NUM.test(num)) return 0;
      var k = 0;
      log.forEach(function (e) { if (OLD.test(e.num) && ((e.did && e.did === did) || (!e.did && OLD.test(old || '') && e.num === old))) { e.num = num; if (!e.did) e.did = did; k++; } });
      if (k) { saveLog(); if (TPSave.onlog) TPSave.onlog(); }
      return k;
    },
    oncontacts: null
  };
  if (fresh) save();
  theme();
})();
