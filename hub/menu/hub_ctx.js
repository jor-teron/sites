/*
 * Hub right-click menus (hub/menu/hub_ctx.js) — replaces the browser's menu everywhere in the Hub
 * with the shared one (shared/ctxmenu/ctxmenu.js). Loaded before wm_windows.js so the other
 * Hub modules can register their own menus:
 *   HubCtx.add(selector, fn(el, e) → items | null, { touch })
 *     The nearest element under the pointer that matches a registered selector wins; fn gets
 *     that element. touch: true = also on a touch long-press (Hub chrome only: menu rows,
 *     tiles, drives, taskbar — never text, so phones keep their own text menu).
 *     items may carry items.opts = { anchor: DOMRect } (taskbar menus open above / below it).
 *   HubCtx.open(x, y, items, opts), HubCtx.btnRect(el)
 *   HubCtx.openApp(entryUrl, { hash, newInstance }) — via hub.js (__hubOpenApp)
 *   HubCtx.newTab(entryUrl) — the app's page in a browser tab
 * Anything else in the Hub: text fields get Cut / Copy / Paste / Select all, the rest
 * Copy (with a selection) / Refresh Hub / About (shared/ctxmenu/ctx_in_app.js).
 * Shift + right-click = the browser's own menu (escape hatch).
 * Menus stay off the taskbar (CtxMenu.bounds), whether it sits at the top or the bottom.
 * Same-origin apps (Phone-mode frame + Desktop windows) get ctx_in_app.js injected:
 *   window.__hubInjectCtx(iframe) — called by hub.js / wm_windows.js on every frame load.
 */
(function () {
  'use strict';
  if (!window.CtxMenu || !window.CtxInApp) return;
  const V = '20261027a';
  const reg = [];
  const isDesk = () => !!(window.HubMode && window.HubMode.isDesktop());

  // Keep menus off the taskbar (Desktop mode)
  CtxMenu.bounds = () => {
    const b = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const bar = document.getElementById('wm-taskbar');
    if (!bar || !isDesk() || bar.offsetParent === null) return b;
    const r = bar.getBoundingClientRect();
    if (r.top < innerHeight / 2) b.top = r.bottom; else b.bottom = r.top;
    return b;
  };

  function add(sel, fn, o) { reg.push({ sel, fn, touch: !!(o && o.touch) }); }
  /** Nearest registered match for target t (touch: only touch-enabled ones). */
  function find(t, touch) {
    for (let n = t && t.nodeType === 1 ? t : t && t.parentElement; n && n !== document; n = n.parentElement) {
      for (const r of reg) {
        if ((!touch || r.touch) && n.matches(r.sel)) return { r, el: n };
      }
    }
    return null;
  }
  function run(m, e) {
    let list = null;
    try { list = m.r.fn(m.el, e); } catch (err) { console.warn('hub ctx', err); }
    return list && list.length ? list : null;
  }
  const btnRect = (el) => el.getBoundingClientRect();

  /* ---------- touch long-press on Hub chrome ---------- */
  let lp = null, lastOpen = 0;
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) return;
    const m = find(e.target, true);
    if (!m) return;
    const sx = e.clientX, sy = e.clientY;
    clearTimeout(lp && lp.t);
    lp = { sx, sy, fired: false, t: setTimeout(() => {
      const list = run(m, e);
      if (!list) return;
      lp.fired = true; lastOpen = Date.now();
      CtxMenu.open(sx, sy, list, list.opts);
    }, 500) };
  }, true);
  document.addEventListener('pointermove', (e) => { if (lp && !lp.fired && Math.hypot(e.clientX - lp.sx, e.clientY - lp.sy) > 10) { clearTimeout(lp.t); lp = null; } }, true);
  ['pointerup', 'pointercancel'].forEach((n) => document.addEventListener(n, () => { if (lp && !lp.fired) { clearTimeout(lp.t); lp = null; } }, true));
  document.addEventListener('click', (e) => { if (lp && lp.fired) { lp = null; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  window.addEventListener('scroll', () => { if (lp && !lp.fired) { clearTimeout(lp.t); lp = null; } }, true);

  /* ---------- right-click (and Android long-press, which fires contextmenu) ---------- */
  window.__ctxInAppManual = true;
  CtxInApp.install({
    page: false,
    resolve(t, e, touch) {
      const m = find(t, touch);
      if (!m) return touch ? null : undefined;
      if (touch && Date.now() - lastOpen < 900) return [];             // the long-press already opened it
      const list = run(m, e);
      if (list && touch) { lastOpen = Date.now(); if (lp) lp.fired = true; }
      return list || (touch ? null : undefined);
    },
    extra: () => [
      { sep: true },
      { label: 'Refresh Hub', icon: '\u21BB', action: () => location.reload() },
      { label: 'About', icon: '\u2139', action: () => openApp(SETTINGS, { hash: 'about' }) }
    ]
  });

  /* ---------- helpers for the menus ---------- */
  const SETTINGS = 'apps/system/settings/', FILES = 'apps/system/files/';
  function openApp(entry, o) {
    if (window.__hubOpenApp) window.__hubOpenApp(entry, o || {});
  }
  function newTab(entry) {
    const u = window.__hubFrameUrl ? window.__hubFrameUrl(entry) : entry;
    window.open(new URL(u, location.href).href, '_blank', 'noopener');
  }
  const shiftClick = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));

  /** Inject the in-app menu into a same-origin frame (once per document). */
  window.__hubInjectCtx = (frame) => {
    let doc;
    try { doc = frame.contentDocument; } catch (_) { return; }
    if (!doc || !doc.documentElement || doc.getElementById('hub-ctx-in-app')) return;
    try { if (frame.contentWindow.location.protocol === 'about:') return; } catch (_) { return; }
    const s = doc.createElement('script');
    s.id = 'hub-ctx-in-app';
    s.src = new URL('shared/ctxmenu/ctx_in_app.js?v=' + V, location.href).href;
    (doc.head || doc.documentElement).appendChild(s);
  };

  window.HubCtx = { add, open: (x, y, items, o) => CtxMenu.open(x, y, items, o), btnRect, openApp, newTab, shiftClick, SETTINGS, FILES, isDesk };
})();
