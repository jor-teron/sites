/*
 * H81 phone notices — the same window.HubNotify / window.hubToast API apps call on the Hub
 * (window.top.HubNotify.notice({icon, title, text, onClick, timeoutMs}) → {close(), update(t), node}),
 * so apps opened inside /phone.html reach the phone instead of failing silently.
 * Each notice goes to the quick panel's Notices list (#notices, newest first, max 50) and shows a
 * short #toast. Tapping a list item with onClick runs it and removes the item; ✕ removes it.
 * File cards (start / progress / done / fail) become one notice when done or failed.
 * PH2: the list is saved in localStorage 'sites-phone.notices' (newest first, last 50, this device only,
 * never synced) and restored on load (onClick actions are session-only). File cards still running at a
 * reload come back as "Interrupted". window.phoneToast(msg, ms) is the one #toast queue for the phone
 * and its notices, so each toast shows for its full time.
 * Do Not Disturb (sites-hub.dnd '1'): no toast, still listed. HubNotify(o) also works (some apps call it so).
 */
(function () {
  'use strict';
  var list = [], seq = 0, MAX = 50, KEY = 'sites-phone.notices', FKEY = 'sites-phone.noticeFiles';
  function $(id) { return document.getElementById(id); }
  function dnd() { try { return localStorage.getItem('sites-hub.dnd') === '1'; } catch (_) { return false; } }
  var q = [], busy = false;   // PH2: one toast queue (phone + notices)
  function toast(msg, ms) {
    if (!msg) return; q.push({ m: String(msg), ms: ms || 3000 }); if (q.length > 5) q.splice(0, q.length - 5); if (!busy) next();
  }
  function next() {
    var t = $('toast'), x = q.shift(); if (!t || !x) { busy = false; return; }
    busy = true; t.textContent = x.m; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); setTimeout(next, q.length ? 250 : 0); }, x.ms);
  }
  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }
  function store(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* full or blocked */ } }
  function save() { store(KEY, list.map(function (n) { return { icon: n.icon, title: n.title, text: n.text, time: n.time }; })); }
  function saveFiles() { store(FKEY, files); }
  function remove(n) { var i = list.indexOf(n); if (i >= 0) { list.splice(i, 1); save(); render(); } }
  function render() {
    var ul = $('notices'); if (!ul) return;
    ul.textContent = '';
    if (!list.length) { var li = document.createElement('li'); li.className = 'none'; li.textContent = 'No notices'; ul.appendChild(li); return; }
    list.forEach(function (n) {
      var l = document.createElement('li'); l.className = 'nt' + (n.onClick ? ' act' : '');
      var s = document.createElement('span'); s.className = 'nt-t';
      s.textContent = (n.icon ? n.icon + ' ' : '') + (n.title ? n.title + ': ' : '') + (n.text || '');
      var x = document.createElement('button'); x.type = 'button'; x.className = 'nt-x'; x.textContent = '✕'; x.setAttribute('aria-label', 'Dismiss');
      x.addEventListener('click', function (e) { e.stopPropagation(); remove(n); });
      if (n.onClick) l.addEventListener('click', function () { remove(n); try { n.onClick(); } catch (_) { /* app gone */ } });
      l.append(s, x); ul.appendChild(l);
    });
  }
  function notice(o) {
    if (typeof o === 'string') o = { text: o };
    o = o || {};
    var n = { id: ++seq, icon: o.icon || '', title: o.title || '', text: String(o.text || o.body || ''),
      onClick: typeof o.onClick === 'function' ? o.onClick : null, time: Date.now() };
    list.unshift(n); if (list.length > MAX) list.length = MAX;
    save();
    render();
    if (!dnd()) toast((n.title ? n.title + ': ' : '') + n.text);
    var node = document.createElement('div');   // detached; callers that append buttons to card.node don't break
    return { close: function () { remove(n); }, update: function (t) { n.text = String(t); save(); render(); }, node: node };
  }
  var files = {};
  (load(KEY) || []).slice(0, MAX).forEach(function (o) {   // PH2: restore (actions don't survive a reload)
    if (o) list.push({ id: ++seq, icon: o.icon || '', title: o.title || '', text: String(o.text || ''), onClick: null, time: o.time || 0 });
  });
  var left = load(FKEY) || {};   // PH2: file cards cut off by the reload → one "Interrupted" notice each, no toast
  Object.keys(left).forEach(function (id) { list.unshift({ id: ++seq, icon: '⚠️', title: left[id] || 'File', text: 'Interrupted (page reloaded)', onClick: null, time: Date.now() }); });
  if (list.length > MAX) list.length = MAX;
  store(FKEY, {}); save();
  function api(o) { return notice(o); }
  api.notice = notice;
  api.start = function (id, f) { files[id] = (f && f.name) || 'file'; saveFiles(); };
  api.progress = function () {};
  api.done = function (id) { notice({ icon: '📥', title: 'Received', text: files[id] || 'file' }); delete files[id]; saveFiles(); };
  api.fail = function (id, t) { notice({ icon: '⚠️', title: files[id] || 'File', text: t || 'Failed' }); delete files[id]; saveFiles(); };
  api.timeoutMs = function () { return 3000; };
  Object.defineProperty(api, 'count', { get: function () { return list.length; } });
  api.render = render;
  api.clear = function () { list.length = 0; save(); render(); };
  window.HubNotify = api;
  window.phoneToast = toast;
  window.hubToast = function (text, opts) { return notice(Object.assign({ text: String(text) }, opts || {})); };
})();
