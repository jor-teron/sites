/*
 * Hub — H66 Notification Centre (hub/viewer/hub_notifcenter.js). Loaded right after hub_notify.js.
 * Every notification the Hub shows (HubNotify.notice / window.hubToast / received-file cards from
 * HubNotify.done / fail) is also saved to a history on THIS device:
 *   localStorage 'sites-hub.notifs' = JSON [{ id, t, app, appId, entry, hash, aicon, icon, title, text, read }]
 *     newest first, at most MAX (100). Never synced and never in the saved profile (hub_profile.js EXCLUDE).
 *   localStorage 'sites-hub.dnd' = '1' Do Not Disturb: no cards pop up (they are still saved here), the
 *     🔔 shows muted (🔕). This device only (hub_profile.js SYNC_SKIP).
 * Source app: the notice's own { app, appId, entry } when the caller gives one; else worked out from the
 *   caller's script in the stack trace (apps/<cat>/<app>/… → that app via HUB_APP_INDEX; Hub files map to
 *   Pooh Chat / Devices / Settings / Files); else 'Hub'.
 * 🔔 #notif-btn (hub.html .header-right, right after 🎮; Desktop taskbar tray + Phone top bar): unread count badge;
 *   tap opens #notif-panel, a full-height side panel like 🎮 / 🐻 (hub_notifcenter.css, glass in hub_glass.css):
 *   DND switch, Clear all, Open app (apps/system/notifications/), the list grouped by day, newest first.
 *   Opening the panel marks everything read (badge clears). ✕ clears one; a tap runs the notice's own action
 *   when it is still in memory (this page session), else opens its source app.
 *   Hidden by Settings › Hub bar › Notifications (sites-hub.barNotif '0'; default shown; html.hub-bar-off-notif, wm.css).
 * The Notification Centre app (apps/system/notifications/) reads / writes the same keys and calls
 *   window.top.HubNotifCenter.activate(id) for a tap; the Hub repaints on the 'storage' event.
 * API window.HubNotifCenter: list(), unread(), dnd(), setDnd(on), markAllRead(), remove(id), clear(),
 *   activate(id), openPanel(), closePanel(), capture(o) (hub_notify.js), captureFile(c, ok) (hub_notify.js),
 *   update(id, text), on(fn) → off, MAX, KEY.
 */
(function () {
  'use strict';
  const KEY = 'sites-hub.notifs', DND = 'sites-hub.dnd', MAX = 100;
  const APP_ENTRY = 'apps/system/notifications/';
  const root = document.documentElement;
  const actions = new Map();   // id → the notice's onClick (this page session only)
  const subs = new Set();
  let seq = 0;

  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, n);

  /* ---------- store ---------- */
  function read() {
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a.filter((x) => x && typeof x === 'object' && x.id) : [];
    } catch (_) { return []; }
  }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); }
    catch (_) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30))); } catch (__) { /* full / blocked */ } }
    changed();
  }
  const dnd = () => { try { return localStorage.getItem(DND) === '1'; } catch (_) { return false; } };
  function setDnd(on) {
    if (window.HubDnd) { window.HubDnd.set(on); changed(); return; }   // H82: one switch (HubDnd fires its change)
    try { if (on) localStorage.setItem(DND, '1'); else localStorage.removeItem(DND); } catch (_) { /* blocked */ }
    changed();
  }
  const unread = () => read().filter((x) => !x.read).length;

  /* ---------- source app ---------- */
  const BASE = (() => { try { return new URL('.', location.href).href; } catch (_) { return ''; } })();
  function idx() { return window.HUB_APP_INDEX || {}; }
  function fromEntry(rel) {
    let best = null, bl = 0;
    const I = idx();
    Object.keys(I).forEach((id) => {
      const r = I[id], e = r && r[1];
      if (e && rel.indexOf(e) === 0 && e.length > bl) { best = { appId: id, app: r[2], entry: e, aicon: r[3] || '' }; bl = e.length; }
    });
    return best;
  }
  const HUB_SRC = [   // Hub files → the app a tap should open
    [/hub\/link\/hub_chat\.js/, { app: 'Pooh Chat', appId: 'pooh-chat', entry: 'apps/connectivity/pooh-chat/' }],
    [/hub\/link\/hub_receive\.js/, { app: 'Received files', entry: 'apps/system/files/' }],
    [/hub\/(link\/hub_sync|core\/hub_profile)\.js/, { app: 'Settings', appId: 'settings', entry: 'apps/system/settings/', hash: 'devices' }],
    [/hub\/(link\/hub_(link|meshlink|panels|linkstate|remote)|controller\/[\w-]+)\.js/, { app: 'Devices', entry: 'apps/system/settings/', hash: 'devices' }],
    [/apps\/system\/settings\//, { app: 'Settings', appId: 'settings', entry: 'apps/system/settings/' }],
  ];
  function source(o) {
    if (o && (o.app || o.entry)) {
      const e = o.entry ? fromEntry(String(o.entry)) : null;
      return Object.assign({ app: '', appId: '', entry: '', hash: '', aicon: '' }, e || {}, { app: clip(o.app || (e && e.app) || 'Hub', 40) });
    }
    let stack = '';
    try { stack = String(new Error().stack || ''); } catch (_) { /* none */ }
    const urls = stack.match(/(?:https?|file):\/\/[^\s)]+/g) || [];
    for (const u0 of urls) {
      const u = u0.replace(/:\d+(:\d+)?$/, '').split(/[?#]/)[0];
      if (/hub\/viewer\/hub_notif(y|center)\.js$/.test(u)) continue;
      const rel = BASE && u.indexOf(BASE) === 0 ? u.slice(BASE.length) : u.replace(/^[a-z]+:\/\/[^/]*\//, '');
      for (const [re, s] of HUB_SRC) if (re.test(rel)) { const e = s.appId ? fromEntry(s.entry) : null; return Object.assign({ hash: '', aicon: '' }, e || {}, s, { aicon: (e && e.aicon) || '' }); }
      if (/^apps\//.test(rel)) { const e = fromEntry(rel); if (e) return Object.assign({ hash: '' }, e); }
      if (/^hub\//.test(rel) || /hub\.html$/.test(rel)) break;
    }
    return { app: 'Hub', appId: '', entry: '', hash: '', aicon: '' };
  }

  /* ---------- capture (called by hub_notify.js) ---------- */
  function add(rec) {
    const list = read();
    list.unshift(rec);
    write(list);
    return rec.id;
  }
  /** a notice: → { id, mute } (mute = Do Not Disturb, hub_notify.js then shows no card) */
  function capture(o) {
    o = o || {};
    const s = source(o);
    const id = 'n' + Date.now().toString(36) + (++seq).toString(36);
    const title = clip(o.title, 120), text = clip(o.text != null ? o.text : o.body, 400);
    if (typeof o.onClick === 'function') actions.set(id, o.onClick);
    add({ id, t: Date.now(), app: s.app, appId: s.appId || '', entry: s.entry || '', hash: s.hash || '', aicon: s.aicon || '',
      icon: clip(o.icon, 8), title: title || (text ? '' : s.app), text, read: false });
    return { id, mute: dnd() };
  }
  /** a finished / failed received-file card */
  function captureFile(c, ok, why) {
    const N = window.HubNotify;
    const size = N && N.fmtSize ? N.fmtSize(c.size) : '';
    const id = 'n' + Date.now().toString(36) + (++seq).toString(36);
    if (ok && c.url && window.HubViewer && /^(image|pdf|video|audio)$/.test(c.kind)) {
      const u = c.url, nm = c.name, ty = c.type;
      actions.set(id, () => HubViewer.open(u, nm, ty));
    }
    add({ id, t: Date.now(), app: 'Received files', appId: 'files', entry: 'apps/system/files/', hash: '', aicon: 'apps/system/files/files_icon.png',
      icon: ({ image: '🖼️', pdf: '📕', video: '🎬', audio: '🎵', text: '📝', archive: '🗜️' })[c.kind] || '📄',
      title: clip(c.name, 120), text: ok ? (size ? size + ' · ' : '') + 'Received' : clip(why || 'Failed', 200), read: false });
    return id;
  }
  function update(id, text) {
    const list = read(), r = list.find((x) => x.id === id);
    if (!r) return;
    r.text = clip(text, 400);
    write(list);
  }
  function remove(id) { actions.delete(id); write(read().filter((x) => x.id !== id)); }
  function clear() { actions.clear(); write([]); }
  function markAllRead() {
    const list = read();
    if (!list.some((x) => !x.read)) return;
    list.forEach((x) => { x.read = true; });
    write(list);
  }
  function markRead(id) {
    const list = read(), r = list.find((x) => x.id === id);
    if (r && !r.read) { r.read = true; write(list); }
  }
  /** a tap on a history item: its own action while this page has it, else its source app */
  function activate(id) {
    const r = read().find((x) => x.id === id);
    if (!r) return false;
    markRead(id);
    closePanel();
    const fn = actions.get(id);
    if (fn) { try { fn(); } catch (_) { /* the notice's own action failed */ } return true; }
    if (r.entry && window.__hubOpenApp) return !!window.__hubOpenApp(r.entry, r.hash ? { hash: r.hash } : undefined);
    return false;
  }

  /* ---------- 🔔 + panel ---------- */
  const btn = document.getElementById('notif-btn');
  const badge = document.getElementById('notif-badge');
  const ico = btn && btn.querySelector('.notif-ico');
  let panel = null, listBox = null, dndIn = null, countEl = null;

  function pad(n) { return String(n).padStart(2, '0'); }
  function hm(t) { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dayName(t) {
    const d = new Date(t), now = new Date();
    const k = (x) => x.getFullYear() * 10000 + x.getMonth() * 100 + x.getDate();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (k(d) === k(now)) return 'Today';
    if (k(d) === k(y)) return 'Yesterday';
    try { return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }); }
    catch (_) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  }

  function build() {
    if (panel) return panel;
    panel = el('div', 'hub-side-panel');
    panel.id = 'notif-panel'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Notifications');
    const head = el('div', 'np-head');
    const title = el('strong', 'np-title', 'Notifications');
    countEl = el('span', 'np-count', '');
    title.appendChild(countEl);
    const x = el('button', 'hp-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', closePanel);
    head.append(title, x);
    const bar = el('div', 'np-bar');
    const lab = el('label', 'np-dnd');
    dndIn = el('input'); dndIn.type = 'checkbox'; dndIn.id = 'np-dnd';
    dndIn.addEventListener('change', () => setDnd(dndIn.checked));
    lab.append(dndIn, el('span', 'np-sw'), el('span', 'np-dnd-t', 'Do Not Disturb'));
    const clr = el('button', 'np-btn', 'Clear all'); clr.type = 'button'; clr.id = 'np-clear';
    clr.addEventListener('click', clear);
    const app = el('button', 'np-btn', 'Open app'); app.type = 'button'; app.id = 'np-app';
    app.title = 'Notification Centre: filter by app';
    app.addEventListener('click', () => { closePanel(); if (window.__hubOpenApp) window.__hubOpenApp(APP_ENTRY); });
    bar.append(lab, clr, app);
    listBox = el('div', 'np-list'); listBox.id = 'np-list';
    panel.append(head, bar, listBox);
    document.body.appendChild(panel);
    return panel;
  }

  function item(r) {
    const li = el('div', 'np-item' + (r.read ? '' : ' unread'));
    li.dataset.id = r.id;
    li.setAttribute('role', 'button'); li.tabIndex = 0;
    const ic = el('div', 'np-ico');
    if (r.icon) ic.textContent = r.icon;
    else if (r.aicon) { const im = el('img'); im.alt = ''; im.src = r.aicon; im.addEventListener('error', () => { im.remove(); ic.textContent = '🔔'; }); ic.appendChild(im); }
    else ic.textContent = '🔔';
    const body = el('div', 'np-body');
    const meta = el('div', 'np-meta');
    meta.append(el('span', 'np-app', r.app || 'Hub'), el('time', 'np-time', hm(r.t)));
    body.appendChild(meta);
    if (r.title) body.appendChild(el('div', 'np-t', r.title));
    if (r.text) body.appendChild(el('div', 'np-x', r.text));
    const del = el('button', 'np-del', '✕'); del.type = 'button'; del.title = 'Clear'; del.setAttribute('aria-label', 'Clear this notification');
    del.addEventListener('click', (e) => { e.stopPropagation(); remove(r.id); });
    li.append(ic, body, del);
    const go = () => activate(r.id);
    li.addEventListener('click', go);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    return li;
  }
  function paintList() {
    if (!panel || panel.hidden) return;
    const list = read();
    countEl.textContent = list.length ? ' ' + list.length : '';
    dndIn.checked = dnd();
    listBox.textContent = '';
    if (!list.length) { listBox.appendChild(el('div', 'np-empty', dnd() ? 'No notifications. Do Not Disturb is on.' : 'No notifications')); return; }
    let day = '';
    list.forEach((r) => {
      const d = dayName(r.t);
      if (d !== day) { day = d; listBox.appendChild(el('div', 'np-day', d)); }
      listBox.appendChild(item(r));
    });
  }
  function paintBtn() {
    if (!btn) return;
    const n = unread(), quiet = dnd();
    btn.classList.toggle('dnd', quiet);
    root.classList.toggle('hub-dnd', quiet);
    if (ico) ico.textContent = quiet ? '🔕' : '🔔';
    if (badge) { badge.textContent = n > 99 ? '99+' : String(n); badge.hidden = !n; }
    btn.title = 'Notifications' + (n ? ' (' + n + ' new)' : '') + (quiet ? ' · Do Not Disturb' : '');
    btn.setAttribute('aria-label', btn.title);
  }
  function changed() {
    paintBtn();
    paintList();
    subs.forEach((fn) => { try { fn(); } catch (_) { /* subscriber */ } });
  }

  function openPanel() {
    build();
    // one side panel at a time (🎮 Devices, 🐻 Pooh Chat)
    const chat = document.getElementById('chat-panel');
    if (chat && !chat.hidden) { const cx = chat.querySelector('.hp-x'); if (cx) cx.click(); }
    const pop = document.getElementById('ctrl-popover');
    if (pop && !pop.hidden && window.__hubController && window.__hubController.closePopover) window.__hubController.closePopover();
    panel.hidden = false;
    if (btn) btn.setAttribute('aria-expanded', 'true');
    paintList();          // unread ones keep their dot while the panel is open…
    const list = read();  // …and are saved as read now (the badge clears)
    if (list.some((x) => !x.read)) { list.forEach((x) => { x.read = true; }); try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { /* blocked */ } paintBtn(); subs.forEach((fn) => { try { fn(); } catch (_) { /* */ } }); }
  }
  function closePanel() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  if (btn) {
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (panel && !panel.hidden) closePanel(); else openPanel(); });
    document.addEventListener('pointerdown', (e) => { if (panel && !panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) closePanel(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel && !panel.hidden) { e.stopPropagation(); closePanel(); } }, true);
    // 🎮 Devices' backdrop covers the bar: a tap on 🔔 under it closes Devices and opens this (as hub_panels.js does for 🐻)
    const backdrop = document.getElementById('ctrl-backdrop');
    if (backdrop) backdrop.addEventListener('click', (e) => {
      const under = document.elementsFromPoint ? document.elementsFromPoint(e.clientX, e.clientY) : [];
      if (under.some((n) => n !== backdrop && btn.contains(n))) setTimeout(() => { if (!panel || panel.hidden) openPanel(); }, 0);
    });
    // another side panel opening closes this one
    ['chat-panel', 'ctrl-popover'].forEach((id) => {
      const watch = () => {
        const o = document.getElementById(id);
        if (!o) return false;
        new MutationObserver(() => { if (!o.hidden) closePanel(); }).observe(o, { attributes: true, attributeFilter: ['hidden'] });
        return true;
      };
      if (!watch()) document.addEventListener('DOMContentLoaded', watch, { once: true });
    });
  }
  window.addEventListener('storage', (e) => { if (!e.key || e.key === KEY || e.key === DND) changed(); });
  if (window.HubDnd) window.HubDnd.on('change', () => changed());   // H82: Settings / phone tile / apps set it here too
  // trim an over-long list left by an older build / another tab
  (function () { const l = read(); if (l.length > MAX) write(l); })();
  paintBtn();

  window.HubNotifCenter = {
    KEY, MAX, list: read, unread, dnd, setDnd, markAllRead, markRead, remove, clear, activate,
    openPanel, closePanel, capture, captureFile, update,
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    get panelOpen() { return !!(panel && !panel.hidden); },
  };
})();
