/*
 * Hub chrome menus (hub/menu/hub_ctx_menus.js) — the right-click / long-press menus of the desktop
 * background, the home tiles and the Hub menu, registered with HubCtx (hub/menu/hub_ctx.js).
 * (The taskbar, window title bars and drive tiles register theirs in their own modules.)
 *   Desktop background  Show desktop / Restore windows, Open Files, Settings (Wallpaper),
 *                       Refresh, Close all windows (asks first, shared/dialog), About
 *   QR tile             Open (its link, new tab), Copy link
 *   App tile            Open, Open in new window, Open in new tab, Copy link
 *   Menu / flyout rows  Open, Open in new window, Open in new tab, Add to / Remove from Favorites
 *                       (category page rows: no Favorites)
 * "Open in new window" = Desktop mode only, not for apps that always open in their own tab.
 */
(function () {
  'use strict';
  const C = window.HubCtx;
  if (!C) return;
  const W = () => window.HubWM;
  const abs = (u) => new URL(u, location.href).href;

  /* ---------- desktop background ---------- */
  C.add('#wm-desk, #empty, #frame-wrap', (el, e) => {
    if (e.target.closest && e.target.closest('.wm-win, .tile, .drv, .drv-wrap, button, a, input')) return null;
    const desk = C.isDesk() && W();
    const sd = document.getElementById('wm-showdesk');
    const n = desk ? W().list().length : 0;
    const shown = !!(sd && sd.getAttribute('aria-pressed') === 'true');
    return [
      desk && { label: shown ? 'Restore windows' : 'Show desktop', icon: '\uD83D\uDDA5', disabled: !n || !sd, action: () => sd.click() },
      { label: 'Open Files', icon: '\uD83D\uDCC2', action: () => C.openApp(C.FILES) },
      { label: 'Settings (Wallpaper)', icon: '\uD83D\uDDBC', action: () => C.openApp(C.SETTINGS, { hash: 'wallpaper' }) },
      { label: 'Refresh', icon: '\u21BB', action: () => location.reload() },
      desk && { sep: true },
      desk && { label: 'Close all windows', icon: '\u2715', danger: true, disabled: !n, action: async () => {
        const ok = window.UiDialog
          ? await UiDialog.confirm('Close all windows?', n === 1 ? '1 window closes. Unsaved work in it may be lost.' : n + ' windows close. Unsaved work in them may be lost.', 'Close all', true)
          : false;
        if (ok) W().closeAll();
      } },
      { sep: true },
      { label: 'About', icon: '\u2139', action: () => C.openApp(C.SETTINGS, { hash: 'about' }) }
    ];
  });

  /* ---------- home tiles ---------- */
  C.add('.tile-qr', (el) => {
    const link = el.dataset.link || '';
    return [
      { label: 'Open', icon: '\u2197', disabled: !link, action: () => window.open(link, '_blank', 'noopener') },
      { label: 'Copy link', icon: '\uD83D\uDD17', disabled: !link, action: () => CtxInApp.copyText(link) }
    ];
  }, { touch: true });
  C.add('.tile-app', (el) => {
    const entry = el.dataset.entryUrl || '';
    const pair = el.dataset.pair === '1', ownTab = el.dataset.newTab === '1';
    return [
      { label: 'Open', icon: '\u2197', action: () => el.click() },
      !pair && !ownTab && C.isDesk() && { label: 'Open in new window', icon: '\u29C9', action: () => C.openApp(entry, { newInstance: true }) },
      !pair && { label: 'Open in new tab', icon: '\u2934', action: () => C.newTab(entry) },
      !pair && { sep: true },
      !pair && { label: 'Copy link', icon: '\uD83D\uDD17', action: () => CtxInApp.copyText(abs(window.__hubFrameUrl ? window.__hubFrameUrl(entry) : entry)) }
    ];
  }, { touch: true });

  /* ---------- Hub menu rows, category pages, flyout apps ---------- */
  /** Add to / Remove from Favorites for an app row (shared/favorites/favorites.js). */
  function favItem(el, entry, ownTab) {
    const F = window.HubFavorites;
    if (!F || !entry) return null;
    if (F.has(entry)) return { label: 'Remove from Favorites', icon: '\u2606', action: () => F.remove(entry) };
    const img = el.querySelector('img');
    const name = (el.querySelector('span:not(.icon)') || el).textContent.trim();
    return { label: 'Add to Favorites', icon: '\u2605', action: () => F.add({ name: name, path: entry, icon: img ? img.src : '', newTab: ownTab }) };
  }
  function rowItems(el, entry, ownTab, noFav) {
    const fav = noFav ? null : favItem(el, entry, ownTab);
    return [
      { label: 'Open', icon: '\u2197', action: () => el.click() },
      !ownTab && C.isDesk() && { label: 'Open in new window', icon: '\u29C9', action: () => C.shiftClick(el) },
      entry && { label: 'Open in new tab', icon: '\u2934', action: () => C.newTab(entry) },
      fav && { sep: true },
      fav
    ];
  }
  C.add('#menu button.app', (el) => rowItems(el, el.dataset.entryUrl, !!el.title), { touch: true });
  C.add('#menu .menu-cat[data-page]', (el) => {
    const pages = (window.__hubFly && window.__hubFly.catPages) || {};
    return rowItems(el, pages[el.dataset.cat] || '', false, true);
  }, { touch: true });
  C.add('.fly-app', (el) => rowItems(el, el.dataset.entryUrl || '', el.dataset.newTab === '1'), { touch: true });
})();
