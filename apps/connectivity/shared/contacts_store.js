/* CT1 — the one shared contact list for Contacts, Telephone and Messages (window.HubContacts).
   localStorage 'telephone-contacts-v1' (same key + shape as Telephone TP2, so nothing is migrated):
     [ {id:<8 hex>, name (≤40), num:'<5 digits 10000–99999; an old 4-digit one is kept>', did:'<16 hex device id or "">', fav:false} ]
   max 200, sorted by name then number. API: list(), get(id), byNum(num, did), save(x) → copy|null, remove(id) → bool,
   onChange(fn) → off(); onChange also fires when another tab changes the list ('storage' event). */
(function (root) {
  'use strict';
  if (root.HubContacts) return;
  var KEY = 'telephone-contacts-v1', MAX = 200, NUM = /^[1-9]\d{4}$/, OLD = /^\d{4}$/, fns = [];
  function hex(n) {
    var a = new Uint8Array(n), s = '';
    try { crypto.getRandomValues(a); } catch (_) { for (var i = 0; i < n; i++) a[i] = Math.random() * 256; }
    for (var j = 0; j < n; j++) s += ('0' + a[j].toString(16)).slice(-2);
    return s;
  }
  function clean(x) {
    if (!x || typeof x !== 'object') return null;
    var num = String(x.num || '').replace(/\D/g, ''), nm = String(x.name || '').trim().slice(0, 40);
    if (!(NUM.test(num) || OLD.test(num)) || !nm) return null;
    return { id: /^[0-9a-f]{8}$/.test(String(x.id)) ? String(x.id) : hex(4), name: nm, num: num, did: /^[0-9a-f]{16}$/.test(String(x.did || '')) ? String(x.did) : '', fav: x.fav === true };
  }
  function sort(a) { a.sort(function (p, q) { return p.name.localeCompare(q.name) || p.num.localeCompare(q.num); }); return a; }
  function load(raw) { var a; try { a = JSON.parse(raw || '[]'); } catch (_) { a = []; } return sort((Array.isArray(a) ? a : []).map(clean).filter(Boolean).slice(0, MAX)); }
  function raw() { try { return localStorage.getItem(KEY) || ''; } catch (_) { return ''; } }
  var cons = load(raw());
  function fire() { fns.slice().forEach(function (f) { try { f(); } catch (_) { /* */ } }); }
  function store() { sort(cons); try { localStorage.setItem(KEY, JSON.stringify(cons)); } catch (_) { /* blocked */ } fire(); }
  function cp(x) { return x ? Object.assign({}, x) : null; }
  try { addEventListener('storage', function (e) { if (e.key === KEY || e.key === null) { cons = load(e.newValue === undefined ? raw() : e.newValue); fire(); } }); } catch (_) { /* */ }
  root.HubContacts = {
    KEY: KEY, numOk: function (n) { return NUM.test(String(n || '')); }, isOld: function (n) { return OLD.test(String(n || '')); },
    list: function () { return cons.map(cp); },
    get: function (id) { return cp(cons.filter(function (x) { return x.id === id; })[0]); },
    byNum: function (num, did) {   // device id first (it follows a new number), then the number
      var hit = did ? cons.filter(function (x) { return x.did && x.did === did; })[0] : null;
      return cp(hit || cons.filter(function (x) { return x.num === String(num); })[0]);
    },
    save: function (x) {   // add (no id) or edit (id)
      if (!x) return null;
      var y = clean(Object.assign({}, x, { id: x.id || hex(4) })); if (!y) return null;
      var i = -1; cons.forEach(function (c, k) { if (c.id === x.id) i = k; });
      if (i >= 0) cons[i] = y; else { if (cons.length >= MAX) return null; cons.push(y); }
      store(); return cp(y);
    },
    remove: function (id) { var n = cons.length; cons = cons.filter(function (c) { return c.id !== id; }); if (cons.length !== n) store(); return cons.length !== n; },
    onChange: function (fn) { fns.push(fn); return function () { fns = fns.filter(function (f) { return f !== fn; }); }; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
