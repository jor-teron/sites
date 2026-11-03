/**
 * Hub — received-file cards (bottom-right by default; notify.position: 'bottom-right' |
 * 'top-right' | 'top-center'). Bottom is the default because the browser's own download popup
 * appears top-right and would cover the cards.
 * API (used by hub_receive.js):
 *   HubNotify.start(id, {name, type, size})   card with a progress bar
 *   HubNotify.progress(id, bytes)
 *   HubNotify.done(id, {url, blob})            preview (images) or type icon, "Received ✓", auto-hide
 *   HubNotify.fail(id, text)
 * Tap a finished card = images / PDFs open in the hub viewer (hub_viewer.js), other files open
 * in a new tab (blob URL); ✕ dismisses early. Hover pauses the timer. New images / PDFs also
 * auto-open in the viewer when they finish receiving.
 * At most notify.maxStack cards show (newest on top); the rest wait behind "+N more" and appear
 * as cards close. Blob URLs are revoked notify.revokeAfterMs after their card closes.
 * Settings: HUB_CTRL_CONFIG.notify. prefers-reduced-motion: no slide / fade (hub_ctrl.css).
 * H26: notification cards replace every Hub toast.
 *   HubNotify.notice({icon, title, text, onClick, timeoutMs}) → {close()}   a plain notice card
 *   window.hubToast(text, opts)                                             thin wrapper (old toast callers)
 * Timeout for all finished cards: localStorage 'sites-hub.notifyTimeout' in ms (default 60000, '0' = never;
 * Settings → Windows → Notification timeout), read live when a card's timer starts.
 * H66: every notice and every finished / failed file card is also saved to the Notification Centre history
 *   (hub/viewer/hub_notifcenter.js, window.HubNotifCenter.capture / captureFile). Do Not Disturb
 *   (sites-hub.dnd '1'): notice() shows no card (it returns a handle with a detached node, so callers that
 *   add buttons to card.node still work) and html.hub-dnd hides the file cards (hub_notifcenter.css).
 */
(function () {
  'use strict';

  const CFG = Object.assign({
    durationMs: 10000, maxStack: 3, previewSize: 56, showPreviews: true, insetPx: 12, revokeAfterMs: 600000,
    position: 'bottom-right',
  }, (window.HUB_CTRL_CONFIG || {}).notify || {});
  function timeoutMs() {
    let v = null;
    try { v = localStorage.getItem('sites-hub.notifyTimeout'); } catch (_) { /* ignore */ }
    if (v === null || v === '') return 60000;
    const n = Number(v);
    return isFinite(n) && n >= 0 ? n : 60000;
  }
  const reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  const cards = [];          // newest first
  const byId = new Map();
  let host = null;
  let more = null;

  function ensureHost() {
    if (host) return host;
    host = document.createElement('div');
    host.id = 'hub-notify';
    const pos = ['bottom-right', 'top-right', 'top-center'].indexOf(CFG.position) >= 0 ? CFG.position : 'bottom-right';
    host.className = 'hn-' + pos;
    host.setAttribute('aria-live', 'polite');
    host.style.setProperty('--hn-inset', CFG.insetPx + 'px');
    host.style.setProperty('--hn-preview', CFG.previewSize + 'px');
    more = document.createElement('div');
    more.className = 'hn-more';
    more.hidden = true;
    host.appendChild(more);
    document.body.appendChild(host);
    return host;
  }

  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n >= 100 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
  }

  function kindOf(type, name) {
    const t = String(type || '').toLowerCase();
    const ext = String(name || '').toLowerCase().split('.').pop();
    if (t.indexOf('image/') === 0 || /^(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/.test(ext)) return 'image';
    if (t === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (t.indexOf('video/') === 0 || /^(mp4|webm|mov|mkv|avi|3gp)$/.test(ext)) return 'video';
    if (t.indexOf('audio/') === 0 || /^(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(ext)) return 'audio';
    if (t.indexOf('text/') === 0 || /^(txt|md|csv|json|log)$/.test(ext)) return 'text';
    if (/^(zip|rar|7z|tar|gz)$/.test(ext)) return 'archive';
    return 'file';
  }
  const ICON = { image: '🖼️', pdf: '📕', video: '🎬', audio: '🎵', text: '📝', archive: '🗜️', file: '📄' };

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* ---------- timers (run only while a finished card is visible and not hovered) ---------- */
  function startTimer(c) {
    if (c.timer || !c.finished || c.hover || c.hiddenInStack) return;
    const ms = c.ms != null ? c.ms : timeoutMs();
    if (!(ms > 0)) return;
    if (c.left == null || c.leftMs !== ms) { c.left = ms; c.leftMs = ms; }
    c.startedAt = Date.now();
    c.timer = setTimeout(() => close(c), c.left);
  }
  function stopTimer(c) {
    if (!c.timer) return;
    clearTimeout(c.timer);
    c.timer = 0;
    c.left = Math.max(400, c.left - (Date.now() - c.startedAt));
  }

  function layout() {
    ensureHost();
    let shown = 0;
    for (const c of cards) {
      const hide = shown >= CFG.maxStack;
      c.hiddenInStack = hide;
      c.node.hidden = hide;
      c.node.style.display = hide ? 'none' : '';
      if (hide) stopTimer(c); else { shown++; startTimer(c); }
    }
    const extra = cards.length - shown;
    more.hidden = extra <= 0;
    more.textContent = '+' + extra + ' more';
    host.appendChild(more);   // keep the "+N more" line last
  }

  function build(c) {
    const n = el('div', 'hn-card receiving');
    n.setAttribute('role', 'status');
    c.thumb = el('div', 'hn-thumb', ICON[c.kind]);
    const body = el('div', 'hn-body');
    c.nameEl = el('div', 'hn-name', c.name);
    c.nameEl.title = c.name;
    c.metaEl = el('div', 'hn-meta', 'Receiving… 0%');
    c.bar = el('div', 'hn-bar');
    c.fill = el('i');
    c.bar.appendChild(c.fill);
    body.append(c.nameEl, c.metaEl, c.bar);
    const x = el('button', 'hn-close', '✕');
    x.type = 'button';
    x.title = 'Close';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', (e) => { e.stopPropagation(); close(c); });
    n.append(c.thumb, body, x);
    n.addEventListener('click', () => { if (c.url) open(c); });
    n.addEventListener('mouseenter', () => { c.hover = true; stopTimer(c); });
    n.addEventListener('mouseleave', () => { c.hover = false; startTimer(c); });
    c.node = n;
  }

  function open(c) {
    if (/^(image|pdf|video|audio)$/.test(c.kind) && window.HubViewer) {
      HubViewer.open(c.url, c.name, c.type); return;
    }
    try { window.open(c.url, '_blank', 'noopener'); } catch (_) { /* ignore */ }
  }

  function close(c) {
    if (c.closed) return;
    c.closed = true;
    stopTimer(c);
    const i = cards.indexOf(c);
    if (i >= 0) cards.splice(i, 1);
    byId.delete(c.id);
    const gone = () => { c.node.remove(); };
    if (reduced.matches || c.node.hidden) gone();
    else { c.node.classList.add('out'); setTimeout(gone, 220); }
    if (c.url) {
      const url = c.url;
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ } }, CFG.revokeAfterMs);
    }
    layout();
  }

  function start(id, info) {
    ensureHost();
    let c = byId.get(id);
    if (c) return c;
    c = {
      id: id, name: String(info.name || 'file'), type: info.type || '', size: Number(info.size) || 0,
      kind: kindOf(info.type, info.name), left: null, timer: 0, finished: false, hover: false,
    };
    build(c);
    byId.set(id, c);
    cards.unshift(c);
    host.insertBefore(c.node, host.firstChild);
    layout();
    return c;
  }

  function progress(id, bytes) {
    const c = byId.get(id);
    if (!c || c.finished) return;
    const pct = c.size ? Math.min(100, Math.floor(bytes / c.size * 100)) : 100;
    c.fill.style.width = pct + '%';
    c.metaEl.textContent = 'Receiving… ' + pct + '% · ' + fmtSize(bytes) + ' / ' + fmtSize(c.size);
  }

  function done(id, res) {
    const c = byId.get(id) || start(id, res || {});
    c.finished = true;
    c.url = res && res.url;
    c.node.classList.remove('receiving');
    c.bar.remove();
    c.metaEl.textContent = '';
    c.metaEl.append(document.createTextNode(fmtSize(c.size) + ' · '), el('span', 'ok', 'Received ✓'));
    c.node.title = c.url ? 'Open ' + c.name : c.name;
    if (CFG.showPreviews && c.kind === 'image' && c.url) {
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.onload = () => { c.thumb.textContent = ''; c.thumb.appendChild(img); };
      img.src = c.url;
    }
    if (/^(image|pdf|video|audio)$/.test(c.kind) && c.url && window.HubViewer) {
      HubViewer.pushAndShow({ url: c.url, name: c.name, type: c.type, kind: c.kind });
    }
    try { if (window.HubNotifCenter) HubNotifCenter.captureFile(c, true); } catch (_) { /* H66 history only */ }
    startTimer(c);
  }

  function fail(id, text) {
    const c = byId.get(id);
    if (!c) return;
    c.finished = true;
    c.node.classList.remove('receiving');
    c.bar.remove();
    c.metaEl.textContent = '';
    c.metaEl.appendChild(el('span', 'bad', text || 'Failed'));
    try { if (window.HubNotifCenter) HubNotifCenter.captureFile(c, false, text); } catch (_) { /* H66 history only */ }
    startTimer(c);
  }

  /* H26: a plain notice card (icon, title, one text line, ✕). */
  let seq = 0;
  function notice(o) {
    if (typeof o === 'string') o = { text: o };
    o = o || {};
    // H66: save to the Notification Centre; Do Not Disturb → no card, a quiet handle instead
    const NC = window.HubNotifCenter;
    let rec = null;
    try { rec = NC && NC.capture ? NC.capture(o) : null; } catch (_) { rec = null; }
    if (rec && rec.mute) {
      const q = el('div', 'hn-card hn-notice hn-quiet');
      q.appendChild(el('div', 'hn-body'));
      return { close: () => {}, update: (t) => { try { NC.update(rec.id, t); } catch (_) { /* gone */ } }, node: q, quiet: true };
    }
    ensureHost();
    const c = { id: 'notice-' + (++seq), name: '', kind: 'notice', left: null, timer: 0, finished: true, hover: false,
      ms: o.timeoutMs != null ? o.timeoutMs : null };
    const n = el('div', 'hn-card hn-notice');
    n.setAttribute('role', 'status');
    if (o.icon) n.appendChild(el('div', 'hn-icon', o.icon));
    const body = el('div', 'hn-body');
    if (o.title) body.appendChild(el('div', 'hn-name', o.title));
    if (o.text) body.appendChild(el('div', 'hn-text', o.text));
    const x = el('button', 'hn-close', '✕');
    x.type = 'button'; x.title = 'Close'; x.setAttribute('aria-label', 'Close notification');
    x.addEventListener('click', (e) => { e.stopPropagation(); close(c); });
    n.append(body, x);
    if (typeof o.onClick === 'function') n.addEventListener('click', () => { close(c); o.onClick(); });
    else n.classList.add('static');
    n.addEventListener('mouseenter', () => { c.hover = true; stopTimer(c); });
    n.addEventListener('mouseleave', () => { c.hover = false; startTimer(c); });
    c.node = n;
    // c.update = (t) => { const tx = n.querySelector('.hn-text'); if (tx) tx.textContent = t; };   (before H66)
    c.update = (t) => { const tx = n.querySelector('.hn-text'); if (tx) tx.textContent = t; if (rec && NC) { try { NC.update(rec.id, t); } catch (_) { /* gone */ } } };   // H66: history follows
    byId.set(c.id, c);
    cards.unshift(c);
    host.insertBefore(n, host.firstChild);
    layout();
    return { close: () => close(c), update: c.update, node: n };
  }
  window.hubToast = (text, opts) => notice(Object.assign({ text: String(text) }, opts || {}));

  window.HubNotify = { start, progress, done, fail, notice, timeoutMs, fmtSize, kindOf, get count() { return cards.length; } };
})();
