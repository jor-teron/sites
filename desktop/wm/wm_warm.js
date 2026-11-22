/*
 * H168 app warm-up (desktop/wm/wm_warm.js) — faster app opens, part (a).
 * Resting the mouse ~150 ms on an app row / tile / flyout entry (anything with data-entry-url:
 * Start menu rows, category flyout apps, home tiles, the Settings row), or pressing it (pointerdown:
 * touch, pen, long-press, mouse), fetches the app's entry page at low priority, so the service
 * worker (RUNTIME, network first) and the HTTP cache already hold it when the click opens the app.
 * Once the page arrives, up to 6 of its same-origin <script src> / <link rel=stylesheet> files are
 * warmed too (read straight from the HTML; nothing is run or parsed as a document).
 * Never: over file://, offline, with Save-Data on, on a hidden page, for other origins, for
 * new-tab apps (data-new-tab="1") or for an app whose window is already open. Each URL once per
 * page load (dedupe), at most 2 fetches at a time, a short queue (newest first), 60 URLs a session.
 * Turn off: localStorage 'sites-hub.warmApps' = '0'.
 * Test hook: window.__hubWarm = { warm(entry), urls() }.
 */
(function () {
  'use strict';
  if (window.__hubWarm) return;
  const HOVER_MS = 150, MAX_RUN = 2, MAX_QUEUE = 6, MAX_TOTAL = 60, MAX_SUB = 6;
  const seen = new Set();     // every URL ever queued (dedupe)
  const queue = [];
  let running = 0, hoverT = 0, hoverEl = null;

  const on = () => {
    try { if (localStorage.getItem('sites-hub.warmApps') === '0') return false; } catch (_) { /* blocked */ }
    if (!/^https?:$/.test(location.protocol)) return false;
    if (typeof navigator !== 'undefined') {
      if (navigator.onLine === false) return false;
      const c = navigator.connection;
      if (c && (c.saveData || /(^|-)2g$/.test(String(c.effectiveType || '')))) return false;
    }
    return !document.hidden;
  };

  function absUrl(u, base) {
    try {
      const x = new URL(u, base || document.baseURI);
      if (x.origin !== location.origin) return '';
      x.hash = '';
      return x.href;
    } catch (_) { return ''; }
  }

  function isOpen(entry) {
    try { return !!(window.HubWM && window.HubWM.list().some((w) => w.key === entry)); } catch (_) { return false; }
  }

  function add(href, html) {
    if (!href || seen.has(href) || seen.size >= MAX_TOTAL) return;
    seen.add(href);
    queue.unshift({ href, html });             // newest first: the icon under the finger wins
    while (queue.length > MAX_QUEUE) queue.pop();
    pump();
  }

  /** Same-origin script / stylesheet URLs named in an HTML page (no DOM parse, nothing runs). */
  function subUrls(text, base) {
    const out = [];
    const re = /<(script|link)\b([^>]*)>/gi;
    let m;
    while ((m = re.exec(text)) && out.length < MAX_SUB) {
      const attrs = m[2];
      if (/^link$/i.test(m[1]) && !/\brel\s*=\s*["']?stylesheet\b/i.test(attrs)) continue;
      const a = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(attrs);
      if (!a || /^(data|blob|javascript):/i.test(a[1])) continue;
      const u = absUrl(a[1], base);
      if (u && out.indexOf(u) < 0) out.push(u);
    }
    return out;
  }

  function pump() {
    while (running < MAX_RUN && queue.length) {
      const job = queue.shift();
      if (!on()) { queue.length = 0; return; }
      running++;
      let p;
      try { p = fetch(job.href, { credentials: 'same-origin', priority: 'low' }); } catch (_) { p = Promise.reject(); }
      p.then((res) => {
        if (!res || !res.ok || !job.html) return null;
        const ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
        if (ct && !/html/i.test(ct)) return null;
        return res.text().then((t) => subUrls(t, res.url || job.href).forEach((u) => add(u, false)));
      }).catch(() => { /* offline / gone: the click opens it the normal way */ })
        .then(() => { running--; pump(); });
    }
  }

  /** Warm one app by its entry URL (as in data-entry-url / the CSV). */
  function warm(entry) {
    entry = String(entry || '');
    if (!entry || !on() || isOpen(entry)) return false;
    let url = entry;
    try { if (window.__hubFrameUrl) url = window.__hubFrameUrl(entry); } catch (_) { url = entry; }
    const href = absUrl(url);
    if (!href || seen.has(href)) return false;
    add(href, true);
    return true;
  }

  const SEL = '[data-entry-url]';
  const entryEl = (t) => (t && t.closest ? t.closest(SEL) : null);
  const want = (el) => el && el.dataset.newTab !== '1' && el.dataset.entryUrl;

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;   // touch / pen: pointerdown below
    const el = entryEl(e.target);
    if (el === hoverEl) return;
    clearTimeout(hoverT);
    hoverEl = el;
    if (!want(el)) return;
    hoverT = setTimeout(() => { if (hoverEl === el) warm(el.dataset.entryUrl); }, HOVER_MS);
  }, true);
  document.addEventListener('pointerout', (e) => {
    if (hoverEl && !(e.relatedTarget && hoverEl.contains(e.relatedTarget))) { clearTimeout(hoverT); hoverEl = null; }
  }, true);
  // Touch / long-press / mouse press: warm at once (the open follows on release)
  document.addEventListener('pointerdown', (e) => {
    const el = entryEl(e.target);
    if (want(el)) warm(el.dataset.entryUrl);
  }, { capture: true, passive: true });

  window.__hubWarm = { warm, urls: () => Array.from(seen) };
})();
