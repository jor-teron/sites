/*
 * Notification Centre (apps/system/notifications/nc.js), H66.
 * Data: localStorage 'sites-hub.notifs' (JSON, newest first, max 100: { id, t, app, appId, entry, hash, aicon,
 * icon, title, text, read }) and 'sites-hub.dnd' ('1' = Do Not Disturb), both written by the Hub
 * (hub/viewer/hub_notifcenter.js). Inside the Hub this page uses window.top.HubNotifCenter (so the 🔔 badge
 * and panel update at once); on its own it reads / writes the keys itself. Live on the 'storage' event.
 * Shown = read: while the page is visible every notification is marked read.
 * A tap: HubNotifCenter.activate(id) (the notice's own action if the Hub still has it, else its app);
 * on its own: opens the app's page. Times: HH:MM device clock (IST on Indian devices), grouped by day.
 * Everything from a notification is set with textContent only.
 */
(function () {
  'use strict';
  const KEY = 'sites-hub.notifs', DND = 'sites-hub.dnd';
  const $ = (id) => document.getElementById(id);
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function hub() { try { const t = window.top; return t !== window && t.HubNotifCenter ? t.HubNotifCenter : null; } catch (_) { return null; } }
  function read() {
    const H = hub();
    if (H) return H.list();
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => x && x.id) : []; } catch (_) { return []; }
  }
  function write(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { /* blocked */ } }
  const dnd = () => { const H = hub(); if (H) return H.dnd(); try { return localStorage.getItem(DND) === '1'; } catch (_) { return false; } };
  function setDnd(on) {
    const H = hub();
    if (H) { H.setDnd(on); return; }
    try { if (on) localStorage.setItem(DND, '1'); else localStorage.removeItem(DND); } catch (_) { /* blocked */ }
  }
  function remove(id) { const H = hub(); if (H) H.remove(id); else write(read().filter((x) => x.id !== id)); }
  function clearAll() { const H = hub(); if (H) H.clear(); else write([]); }
  function markAllRead() {
    const H = hub();
    if (H) { H.markAllRead(); return; }
    const l = read(); if (l.some((x) => !x.read)) { l.forEach((x) => { x.read = true; }); write(l); }
  }
  function activate(r) {
    const H = hub();
    if (H) { H.activate(r.id); return; }
    if (r.entry && /^apps\/[\w./-]+$/.test(r.entry)) location.href = '../../../' + r.entry + (r.hash ? '#' + r.hash : '');
  }

  const pad = (n) => String(n).padStart(2, '0');
  const hm = (t) => { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  function dayName(t) {
    const d = new Date(t), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
    const k = (x) => x.getFullYear() * 10000 + x.getMonth() * 100 + x.getDate();
    if (k(d) === k(now)) return 'Today';
    if (k(d) === k(y)) return 'Yesterday';
    try { return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }); }
    catch (_) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  }
  function zone() {
    try { const z = Intl.DateTimeFormat().resolvedOptions().timeZone; return z === 'Asia/Calcutta' || z === 'Asia/Kolkata' ? 'IST' : 'local time'; } catch (_) { return 'local time'; }
  }

  // filter from the hash: #app=Pooh%20Chat
  let filter = '';
  try { filter = new URLSearchParams(location.hash.replace(/^#/, '')).get('app') || ''; } catch (_) { filter = ''; }
  const sel = $('nc-filter'), box = $('nc-list');

  function paintFilter(list) {
    const counts = new Map();
    list.forEach((r) => counts.set(r.app || 'Hub', (counts.get(r.app || 'Hub') || 0) + 1));
    const names = [...counts.keys()].sort((a, b) => a.localeCompare(b));
    if (filter && !counts.has(filter)) names.push(filter);
    const opts = [el('option', '', 'All apps (' + list.length + ')')];
    opts[0].value = '';
    names.forEach((n) => { const o = el('option', '', n + ' (' + (counts.get(n) || 0) + ')'); o.value = n; opts.push(o); });
    sel.replaceChildren(...opts);
    sel.value = filter;
  }
  function item(r) {
    const li = el('div', 'item' + (r.read ? '' : ' unread'));
    li.dataset.id = r.id; li.dataset.app = r.app || 'Hub';
    li.setAttribute('role', 'button'); li.tabIndex = 0;
    const ic = el('div', 'ico');
    if (r.icon) ic.textContent = r.icon;
    else if (r.aicon) { const im = el('img'); im.alt = ''; im.src = '../../../' + r.aicon; im.addEventListener('error', () => { im.remove(); ic.textContent = '🔔'; }); ic.appendChild(im); }
    else ic.textContent = '🔔';
    const body = el('div', 'body');
    const meta = el('div', 'meta');
    meta.append(el('span', 'app', r.app || 'Hub'), el('time', 'time', hm(r.t)));
    meta.lastChild.dateTime = new Date(r.t).toISOString();
    body.appendChild(meta);
    if (r.title) body.appendChild(el('div', 't', r.title));
    if (r.text) body.appendChild(el('div', 'x', r.text));
    const del = el('button', 'del', '✕'); del.type = 'button'; del.title = 'Clear'; del.setAttribute('aria-label', 'Clear this notification');
    del.addEventListener('click', (e) => { e.stopPropagation(); remove(r.id); paint(); });
    li.append(ic, body, del);
    const go = () => activate(r);
    li.addEventListener('click', go);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    return li;
  }
  function paint() {
    const all = read();
    const quiet = dnd();
    $('nc-dnd').checked = quiet;
    $('nc-dnd-note').hidden = !quiet;
    paintFilter(all);
    const list = filter ? all.filter((r) => (r.app || 'Hub') === filter) : all;
    $('nc-count').textContent = all.length
      ? (filter ? list.length + ' of ' + all.length : all.length) + ' notification' + (all.length === 1 ? '' : 's') + ' · times in ' + zone()
      : '';
    $('nc-clear').disabled = !all.length;
    box.textContent = '';
    if (!list.length) { box.appendChild(el('p', 'empty', all.length ? 'Nothing from ' + filter + '.' : 'No notifications yet.')); return; }
    let day = '';
    list.forEach((r) => {
      const d = dayName(r.t);
      if (d !== day) { day = d; box.appendChild(el('h2', 'day', d)); }
      box.appendChild(item(r));
    });
    if (!document.hidden && list.some((r) => !r.read)) setTimeout(markAllRead, 1200);   // shown = read (the dots stay until the next paint)
  }

  sel.addEventListener('change', () => { filter = sel.value; try { history.replaceState(null, '', filter ? '#app=' + encodeURIComponent(filter) : location.pathname + location.search); } catch (_) { /* file:// */ } paint(); });
  $('nc-dnd').addEventListener('change', (e) => { setDnd(e.target.checked); paint(); });
  $('nc-clear').addEventListener('click', () => { clearAll(); paint(); });
  window.addEventListener('storage', (e) => { if (!e.key || e.key === KEY || e.key === DND) paint(); });
  const H = hub();
  if (H && H.on) { const off = H.on(() => paint()); window.addEventListener('pagehide', off); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) paint(); });
  setInterval(() => { if (!document.hidden) paint(); }, 60000);   // Today / Yesterday roll over
  paint();
})();
