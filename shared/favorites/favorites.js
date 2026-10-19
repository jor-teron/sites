/*
 * Favorites store (shared/favorites/favorites.js) — the apps you add yourself with
 * "Add to Favorites" (right-click an app tile on a category page, a Start menu row or a flyout app).
 * Loaded by hub.html; category pages reach it through the Hub (window.parent.HubFavorites).
 * They show in the Start menu Favorite flyout (hub/hub_flyout.js) and on the Favorite tiles
 * page (shared/tiles/tiles.js reads the same key), under "My favorites", after the fixed
 * apps of apps/favorite/favorite-apps.csv.
 * localStorage 'sites-hub.favorites' = JSON [{ name, path, icon, newTab }]
 *   path / icon are relative to the site root (the folder of this repo: 'apps/games/snake/').
 * API window.HubFavorites: list(), has(urlOrPath), add({ name, href|path, icon, newTab }),
 *   remove(urlOrPath), toPath(url). Fires 'hub-favorites' on window after a change; other
 *   documents (category pages in windows) get the normal 'storage' event.
 */
(function () {
  'use strict';
  if (window.HubFavorites) return;
  const KEY = 'sites-hub.favorites';
  const me = document.currentScript;
  // site root = two folders up from shared/favorites/
  const ROOT = new URL('../../', (me && me.src) || location.href).href;

  /** Absolute or relative url → path from the site root ('apps/x/'), or '' when outside it. */
  function toPath(u) {
    if (!u) return '';
    let abs;
    try { abs = new URL(u, ROOT).href.replace(/[?#].*$/, ''); } catch (_) { return ''; }
    if (abs.indexOf(ROOT) !== 0) return '';
    return abs.slice(ROOT.length).replace(/index\.html$/, '');
  }
  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(v) ? v.filter((a) => a && typeof a.name === 'string' && typeof a.path === 'string') : [];
    } catch (_) { return []; }
  }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) { /* private mode */ }
    window.dispatchEvent(new CustomEvent('hub-favorites', { detail: { list: list.slice() } }));
  }
  const list = () => read();
  const has = (u) => { const p = toPath(u) || u; return !!p && read().some((a) => a.path === p); };
  function add(o) {
    const path = toPath(o.href || o.path);
    if (!path || !o.name) return false;
    const all = read().filter((a) => a.path !== path);
    all.push({ name: String(o.name).slice(0, 80), path: path, icon: toPath(o.icon) || '', newTab: !!o.newTab });
    write(all);
    return true;
  }
  function remove(u) {
    const p = toPath(u) || u;
    const all = read();
    const left = all.filter((a) => a.path !== p);
    if (left.length !== all.length) write(left);
  }
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) window.dispatchEvent(new CustomEvent('hub-favorites', { detail: { list: read() } }));
  });

  window.HubFavorites = { KEY: KEY, ROOT: ROOT, list: list, has: has, add: add, remove: remove, toPath: toPath };
})();
