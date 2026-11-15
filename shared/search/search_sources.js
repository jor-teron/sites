/*
 * Hub search sources (shared/search/search_sources.js), H151 — the lists Hub Search looks in, moved out
 * of apps/system/search/search.js (H48) so Settings (H152) and the App Hub (H153) reuse them.
 * Reads the page's globals when called (load hub_config.js, hub_apps.js, hub_appindex.js, hub_catalog.js
 * and shared/tiles/tiles.js first, as apps/system/search/index.html does).
 *
 * window.HubSearchSources:
 *   joinPath(dir, rel)       as hub_flyout.js / apphub.js: resolve '..', folders end in '/'
 *   apps({ root, isFile })   an app store: { map, put(a), fromIndex(), fromCsvs() → Promise, list() }
 *                            map: entryUrl → { name, entryUrl, cat, section, icon, newTab, desc }.
 *                            fromIndex(): hub/core/hub_appindex.js (instant); fromCsvs(): every category
 *                            CSV (HUB_CAT_CSV, read with TilesCsv.parse; hub_catalog.js SITES_CSV on
 *                            file:// and as the fallback) for sections and descriptions. One row per entry;
 *                            an app listed in Favorite keeps its real category.
 *   categories()             hub_apps.js "<Category> Page" rows (not hidden, not Favorite), by ORDER:
 *                            [{ name, order, icon }]
 *   settingsItems()          window.HUB_SEARCH_ITEMS (apps/system/search/search_items.js) or empty lists
 *   loadSettingsItems(root)  Promise of settingsItems(); adds the search_items.js script when the page
 *                            has not loaded it (root = path to the site root, e.g. '../../../').
 */
(function () {
  'use strict';
  if (window.HubSearchSources) return;
  const FAV = 'Favorite';
  const ITEMS_JS = 'apps/system/search/search_items.js';

  function joinPath(dir, rel) {
    const o = [];
    (dir + rel).split('/').forEach((p, i, all) => {
      if (p === '..') o.pop();
      else if (p !== '.' && (p !== '' || i === all.length - 1)) o.push(p);
    });
    let u = o.join('/');
    if (!/\.[a-z0-9]+$/i.test(u) && !u.endsWith('/')) u += '/';
    return u;
  }

  function apps(opts) {
    const ROOT = (opts && opts.root) || '';
    const IS_FILE = opts && 'isFile' in opts ? !!opts.isFile : (window.location && location.protocol === 'file:');
    const map = new Map();   // entryUrl → { name, entryUrl, cat, section, icon, newTab, desc }
    function put(a) {
      const old = map.get(a.entryUrl);
      if (!old) { map.set(a.entryUrl, a); return; }
      // keep the real category over Favorite; fill section / description / icon when missing
      if (old.cat === FAV && a.cat !== FAV) { old.cat = a.cat; old.section = a.section || old.section; }
      else if (!old.section && a.section && a.cat === old.cat) old.section = a.section;
      if (!old.desc && a.desc) old.desc = a.desc;
      if (!old.icon && a.icon) old.icon = a.icon;
    }
    function fromIndex() {
      const idx = window.HUB_APP_INDEX || {};
      Object.keys(idx).forEach((id) => {
        const r = idx[id];
        if (!Array.isArray(r) || !r[1] || !r[2]) return;
        put({ name: String(r[2]), entryUrl: String(r[1]), cat: String(r[0] || ''), section: '', icon: String(r[3] || ''), newTab: !!r[4], desc: String(r[5] || '') });
      });
    }
    function csvText(cat, path) {
      const fallback = () => (window.SITES_CSV && window.SITES_CSV[cat]) || '';
      if (IS_FILE || !window.fetch) return Promise.resolve(fallback());
      return window.fetch(ROOT + path, { cache: 'no-cache' })
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .catch(fallback);
    }
    function fromCsvs() {
      const cmap = window.HUB_CAT_CSV || {}, T = window.TilesCsv;
      if (!T) return Promise.resolve();
      // real categories first, Favorite last, so a favourite keeps its own category and section
      const cats = Object.keys(cmap).sort((a, b) => (a === FAV) - (b === FAV));
      return Promise.all(cats.map((cat) => csvText(cat, cmap[cat]).then((text) => ({ cat, text }))))
        .then((all) => all.forEach(({ cat, text }) => {
          if (!text) return;
          const dir = cmap[cat].replace(/[^/]*$/, '');
          T.parse(text).forEach((a) => {
            if (!a.name || !a.path) return;
            const entryUrl = joinPath(dir, a.path);
            put({ name: a.name, entryUrl, cat, section: a.section || '', newTab: !!a.newTab,
              icon: a.icon ? joinPath(dir, a.icon) : T.defaultIcon(entryUrl), desc: a.description || '' });   // description: H48c (optional)
          });
        }))
        .catch(() => { /* keep the index list */ });
    }
    return { map, put, fromIndex, fromCsvs, list: () => Array.from(map.values()) };
  }

  function categories() {
    const rows = String(window.HUB_APPS_CSV || '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && l[0] !== '#');
    const head = (rows.shift() || '').split(',').map((s) => s.trim().toUpperCase());
    const ix = (k) => head.indexOf(k);
    const out = [];
    rows.forEach((l) => {
      const c = l.split(',').map((s) => s.trim());
      const cat = c[ix('CATEGORY')], name = c[ix('NAME')], page = c[ix('ENTRY_URL')] || '';
      if (!cat || name !== cat + ' Page' || c[ix('HIDDEN')] === '1' || cat === FAV) return;
      out.push({ name: cat, order: +c[ix('ORDER')] || 0, icon: page.replace(/\.html$/i, '_icon.png') });
    });
    return out.sort((a, b) => a.order - b.order);
  }

  function settingsItems() { return window.HUB_SEARCH_ITEMS || { settings: [], actions: [] }; }
  function loadSettingsItems(root) {
    if (window.HUB_SEARCH_ITEMS || typeof document === 'undefined' || !document.createElement) return Promise.resolve(settingsItems());
    return new Promise((done) => {
      const s = document.createElement('script');
      s.src = (root || '') + ITEMS_JS;
      s.onload = s.onerror = () => done(settingsItems());
      (document.head || document.documentElement).appendChild(s);
    });
  }

  window.HubSearchSources = { joinPath, apps, categories, settingsItems, loadSettingsItems };
})();
