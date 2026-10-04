/**
 * Hub — received-file cards (top-right, under the hub bar).
 * API (used by hub_receive.js):
 *   HubNotify.start(id, {name, type, size})   card with a progress bar
 *   HubNotify.progress(id, bytes)
 *   HubNotify.done(id, {url, blob})            preview (images) or type icon, "Received ✓", auto-hide
 *   HubNotify.fail(id, text)
 * Tap a finished card = open the file (blob URL, new tab); ✕ closes. Hover pauses the timer.
 * At most notify.maxStack cards show (newest on top); the rest wait behind "+N more" and appear
 * as cards close. Blob URLs are revoked notify.revokeAfterMs after their card closes.
 * Settings: HUB_CTRL_CONFIG.notify. prefers-reduced-motion: no slide / fade (hub_ctrl.css).
 */
(function () {
  'use strict';

  const CFG = Object.assign({
    durationMs: 5000, maxStack: 3, previewSize: 56, showPreviews: true, insetPx: 12, revokeAfterMs: 600000,
  }, (window.HUB_CTRL_CONFIG || {}).notify || {});
  const reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  const cards = [];          // newest first
  const byId = new Map();
  let host = null;
  let more = null;

  function ensureHost() {
    if (host) return host;
    host = document.createElement('div');
    host.id = 'hub-notify';
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
    if (c.timer || !c.finished || c.hover || c.hiddenInStack || !(CFG.durationMs > 0)) return;
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
      kind: kindOf(info.type, info.name), left: CFG.durationMs, timer: 0, finished: false, hover: false,
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
    startTimer(c);
  }

  window.HubNotify = { start, progress, done, fail, fmtSize, kindOf, get count() { return cards.length; } };
})();
