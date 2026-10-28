/* Telephone TP1 — the one save module. localStorage only:
   'telephone-settings-v1' = { name, theme:'system'|'light'|'dark', num:'<4 digits, 2–9 first>', did:<16 hex, lasting device id>,
     volume:0.9 (0–1), sink:'' (chosen audio output id, where setSinkId exists), keytones:true }
   'telephone-log-v1'      = [ {dir:'in'|'out'|'missed', num, name, at:<ms>, dur:<s>, why:''} ]  newest first, max 100
   'telephone-last-code'   = last Hub Connect Code used.
   Theme 'system' follows the Hub's sites-hub.theme when set, else the OS. Default theme: dark. */
(function () {
  'use strict';
  var KEY = 'telephone-settings-v1', LOG = 'telephone-log-v1', LAST = 'telephone-last-code', MAXLOG = 100;
  var P = { name: '', theme: 'dark', num: '', did: '', volume: 0.9, sink: '', keytones: true };
  try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* blocked / broken */ }
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  P.volume = Math.max(0, Math.min(1, +P.volume)); if (isNaN(P.volume)) P.volume = 0.9;
  P.keytones = P.keytones !== false; P.sink = typeof P.sink === 'string' ? P.sink : '';
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

  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (_) { /* blocked */ } }
  function saveLog() { try { localStorage.setItem(LOG, JSON.stringify(log)); } catch (_) { /* blocked */ } }
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
  });
  window.TPSave = {
    get: function (k) { return P[k]; },
    set: function (k, v) { P[k] = v; save(); if (k === 'theme') theme(); },
    name: name, theme: theme, ls: ls, newNum: newNum,
    log: function () { return log.slice(); },
    addLog: function (e) {
      log.unshift({ dir: e.dir, num: String(e.num || ''), name: String(e.name || '').slice(0, 40), at: e.at || Date.now(), dur: Math.max(0, Math.round(e.dur || 0)), why: e.why || '' });
      if (log.length > MAXLOG) log.length = MAXLOG;
      saveLog(); if (TPSave.onlog) TPSave.onlog();
    },
    clearLog: function () { log = []; saveLog(); if (TPSave.onlog) TPSave.onlog(); },
    lastCode: function () { return ls(LAST); },
    setLastCode: function (c) { try { localStorage.setItem(LAST, c); } catch (_) { /* */ } },
    onlog: null
  };
  if (fresh) save();
  theme();
})();
