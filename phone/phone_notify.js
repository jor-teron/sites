/*
 * H81 phone notices — the same window.HubNotify / window.hubToast API apps call on the Hub
 * (window.top.HubNotify.notice({icon, title, text, onClick, timeoutMs}) → {close(), update(t), node}),
 * so apps opened inside /phone.html reach the phone instead of failing silently.
 * Each notice goes to the quick panel's Notices list (#notices, newest first, max 30) and shows a
 * short #toast. Tapping a list item with onClick runs it and removes the item; ✕ removes it.
 * File cards (start / progress / done / fail) become one notice when done or failed.
 * Do Not Disturb (sites-hub.dnd '1'): no toast, still listed. HubNotify(o) also works (some apps call it so).
 */
(function () {
  'use strict';
  var list = [], seq = 0, toastT = 0, MAX = 30;
  function $(id) { return document.getElementById(id); }
  function dnd() { try { return localStorage.getItem('sites-hub.dnd') === '1'; } catch (_) { return false; } }
  function toast(msg) {
    var t = $('toast'); if (!t || !msg) return;
    t.textContent = msg; t.classList.add('show'); clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 3000);
  }
  function remove(n) { var i = list.indexOf(n); if (i >= 0) { list.splice(i, 1); render(); } }
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
      onClick: typeof o.onClick === 'function' ? o.onClick : null };
    list.unshift(n); if (list.length > MAX) list.length = MAX;
    render();
    if (!dnd()) toast((n.title ? n.title + ': ' : '') + n.text);
    var node = document.createElement('div');   // detached; callers that append buttons to card.node don't break
    return { close: function () { remove(n); }, update: function (t) { n.text = String(t); render(); }, node: node };
  }
  var files = {};
  function api(o) { return notice(o); }
  api.notice = notice;
  api.start = function (id, f) { files[id] = (f && f.name) || 'file'; };
  api.progress = function () {};
  api.done = function (id) { notice({ icon: '📥', title: 'Received', text: files[id] || 'file' }); delete files[id]; };
  api.fail = function (id, t) { notice({ icon: '⚠️', title: files[id] || 'File', text: t || 'Failed' }); delete files[id]; };
  api.timeoutMs = function () { return 3000; };
  Object.defineProperty(api, 'count', { get: function () { return list.length; } });
  api.render = render;
  window.HubNotify = api;
  window.hubToast = function (text, opts) { return notice(Object.assign({ text: String(text) }, opts || {})); };
})();
