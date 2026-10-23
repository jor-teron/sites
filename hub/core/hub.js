/**
 * sites hub — menu from hub_apps.js (window.HUB_APPS_CSV), apps open in the iframe.
 * R33a: hub_apps.js keeps only the categories ("<Category> Page" rows) + hidden system rows.
 *   Every app is read from its category CSV via hub_flyout.js (window.HubStartList) and
 *   registered in HUB_CAT_CSV order (hash ids, last app, session restore, __hubOpenApp). Start
 *   (hash / last app / session) runs as soon as hub_flyout.js is in ('hub-startlist-ready';
 *   DOMContentLoaded fallback): at once when every list is cached (sites-hub.startList), else
 *   (R33b) all CSVs load in parallel and start runs as soon as the lists that hold the hash /
 *   last app / saved windows are registered (in order); 4 s cap. __hubOpenApp(path) before
 *   that waits for them; a non-path match ('pooh-chat') needs the lists in.
 *
 * hub_apps.js (loaded by hub.html before this file; no fetch, so file:// works too):
 *   CSV text, columns read BY HEADER NAME:
 *   CATEGORY,NAME,ENTRY_URL,ICON_URL,NEW_TAB,HIDDEN,ORDER
 * ENTRY_URL can be either:
 *   - a folder:  tv/  or  games/browser-fps/   (served via its index.html)
 *   - a file:    tools/calculator.html          (used exactly as written)
 *   - a text file: about/contact.txt            (shown in the dark viewer script/txt-view.html)
 * ICON_URL: optional; empty = derived icon:
 *   - folder xxx/            -> xxx/xxx_icon.png
 *   - file   dir/name.ext    -> dir/name_icon.png   (e.g. about/contact.txt -> about/contact_icon.png)
 * NEW_TAB: 1 = window.open(url, '_blank', 'noopener'); 0 / empty = open in the hub iframe.
 * If HUB_APPS_CSV is missing or has no usable rows, the menu and the home screen say
 * "hub_apps.js failed to load or has an error".
 * Home screen: quick-access tiles from hub_tiles.js (window.HUB_TILES; types qr / app).
 * App links + last-app memory: an app opened in the hub frame puts a short id in the hash
 *   (hub.html#snake, #tv, #webcam, #caption-for-nei; id = folder name or file name without
 *   extension, see appIdFor) and in localStorage ('sites-hub.lastApp'). On load the hash wins,
 *   else the saved app opens; an unknown hash shows home. Back / Forward switch apps (Back to
 *   an empty hash = home, clears both). NEW_TAB apps are never remembered.
 *   The frame is navigated with location.replace so only the hub adds history entries.
 * Focus: the app iframe gets keyboard focus after it loads, after an app is picked and when the
 * menu closes, so real keys reach the game without clicking into it first (never while the
 * menu or the controller popover is open).
 * Menu label: window.HUB_MENU_LABEL from hub_config.js (one place to rename 'Home').
 * Category rows show the category icon (<folder>/<folder>_icon.png of its CAT_PAGES entry);
 * on a real mouse hub_flyout.js adds the GNOME 2 style app flyout (window.__hubFly hooks below).
 * Desktop mode (wm_mode.js, body.wm-desktop): apps open in windows (wm_windows.js, HubWM)
 *   instead of the frame; the hash / last-app memory follow the focused window; goHome / Show
 *   Desktop (taskbar) minimise all windows. Switching mode moves the open app between frame
 *   and window. Shift+click / middle-click a menu row = new instance (HubWM newInstance);
 *   category-page tiles in a window open their app in its own window ('hub-open-app' message).
 */
(function () {
  const HEADER_DEFAULT = window.HUB_MENU_LABEL || 'Home';   // hub_config.js
  const catBtn = document.getElementById('cat-btn');
  const catLabel = document.getElementById('cat-label');
  const menu = document.getElementById('menu');
  const frame = document.getElementById('app-frame');
  const empty = document.getElementById('empty');
  const labLabel = document.getElementById('lab-label');
  const labLabelName = document.getElementById('lab-label-name');
  const gamebarEl = document.getElementById('gamebar');
  /** Categories whose menu header opens a tiles page instead of expanding (CATEGORY → ENTRY_URL). */
  const CAT_PAGES = {
    // tiles pages live in apps/<cat>/<cat>.html (their index.html only redirects there)
    Favorite: 'apps/favorite/favorite.html', Games: 'apps/games/games.html', Media: 'apps/media/media.html',
    Office: 'apps/office/office.html', Connectivity: 'apps/connectivity/connectivity.html',
    Tools: 'apps/tools/tools.html', Lab: 'apps/lab/lab.html', Learn: 'apps/learn/learn.html', System: 'apps/system/system.html'   // R53
    // R58: the dead Desktop (apps/tools/vDesktop/) and About entries are gone: no menu category uses them
  };
  /** R58: old deep links / last-app values whose hidden rows left hub_apps.js (R33a). Contact and
   *  Feedback open their apps/system/about/ pages (→ Settings → About); '' = gone, so the Hub
   *  just shows home (Transcribe, vDesktop). A real app with the same id still wins. */
  const OLD_IDS = { contact: '~apps/system/about/contact.html', feedback: '~apps/system/about/feedback.html',
    transcribe: '', vdesktop: '' };
  const oldId = (id) => (Object.prototype.hasOwnProperty.call(OLD_IDS, String(id).toLowerCase()) ? OLD_IDS[String(id).toLowerCase()] : null);

  const emptyText = document.getElementById('empty-text');
  catLabel.textContent = HEADER_DEFAULT;
  if (emptyText) emptyText.textContent = "Open '" + HEADER_DEFAULT + "' and pick an App";
  const tilesEl = document.getElementById('tiles');

  const TXT_VIEWER = 'shared/script/txt-view.html';
  const LOAD_ERROR = 'hub_apps.js failed to load or has an error';
  const QR_CELL = 4;                  // px per module in the tile QR (SVG, scaled by CSS)
  const QR_QUIET_MODULES = 4;         // white quiet zone; createSvgTag's margin is in px

  let currentEntry = '';     // entryUrl of the app in the iframe (for the active highlight)
  let apps = [];             // parsed HUB_APPS_CSV (hidden rows included)
  const LAST_KEY = 'sites-hub.lastApp';
  // R33c (see earlyFromIndex): the app index, and apps taken from it before registration
  const IDX = window.HUB_APP_INDEX || {};
  const early = new Map(), earlyId = new Map();   // id / entryUrl → app; entryUrl → index id
  const idToApp = new Map(); // hash id → app (first row wins)
  const entryToId = new Map(); // entryUrl → hash id

  /** True when ENTRY_URL points at a file (last segment has an extension) rather than a folder. */
  function isFileUrl(url) {
    const path = url.split(/[?#]/)[0];
    return /\.[a-z0-9]+$/i.test(path);
  }

  function isTxtUrl(url) {
    return /\.txt$/i.test(url.split(/[?#]/)[0]);
  }

  const IS_FILE = location.protocol === 'file:';

  /**
   * What the iframe / new tab should load: .txt files go through the dark text viewer.
   * Over file:// a folder shows a directory listing, so folders get index.html there.
   */
  function frameUrlFor(entryUrl) {
    if (isTxtUrl(entryUrl)) return TXT_VIEWER + '?file=' + encodeURIComponent(entryUrl);
    if (IS_FILE && !isFileUrl(entryUrl) && !/^[a-z][a-z0-9+.-]*:/i.test(entryUrl)) {
      return entryUrl.replace(/\/?([?#]|$)/, '/index.html$1');
    }
    return entryUrl;
  }

  // file:// pages have opaque origins, so the iframe's default allow scope ('src') does not
  // match; widen camera / microphone there only (http keeps the attribute from hub.html).
  if (IS_FILE && frame && !frame.dataset.allowFile) {
    frame.dataset.allowFile = '1';
    frame.setAttribute('allow', (frame.getAttribute('allow') || '')
      .replace(/\bcamera\b(?! \*)/, 'camera *').replace(/\bmicrophone\b(?! \*)/, 'microphone *'));
  }

  /** Folders get a trailing slash; file paths are left untouched. */
  function normalizeEntryUrl(raw) {
    let u = String(raw || '').trim().replace(/\\/g, '/');
    if (!u) return '';
    if (!isFileUrl(u) && !u.endsWith('/')) u += '/';
    return u;
  }

  function iconPathFor(entryUrl) {
    const path = entryUrl.split(/[?#]/)[0];
    if (isFileUrl(path)) {
      // tools/calculator.html -> tools/calculator_icon.png, about/contact.txt -> about/contact_icon.png
      return path.replace(/\.[a-z0-9]+$/i, '_icon.png');
    }
    const parts = path.replace(/\/+$/, '').split('/').filter(Boolean);
    const folder = parts[parts.length - 1];
    return folder ? path + folder + '_icon.png' : '';
  }

  /** 1 / true / yes / y (and 'hidden' for HIDDEN) → true; empty → false. */
  function parseFlag(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'hidden';
  }

  /** Icon for an app: ICON_URL when given, else the derived xxx/xxx_icon.png. */
  function iconFor(app) {
    return (app && app.iconUrl) || iconPathFor(app.entryUrl);
  }

  /**
   * HUB_APPS_CSV → apps. Columns are found BY HEADER NAME (any order, case-insensitive,
   * spaces around cells ignored). CATEGORY, NAME and ENTRY_URL are required.
   */
  function parseCsv(text) {
    const lines = String(text || '').trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map((h) => h.trim().toUpperCase());
    const col = (name) => header.indexOf(name);
    const iCat = col('CATEGORY');
    const iName = col('NAME');
    const iUrl = col('ENTRY_URL');
    const iIcon = col('ICON_URL');
    const iNewTab = col('NEW_TAB');
    const iHidden = col('HIDDEN');
    const iOrder = col('ORDER');
    if (iCat < 0 || iName < 0 || iUrl < 0) return [];

    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      const get = (idx) => (idx >= 0 ? cols[idx] || '' : '');
      const category = get(iCat);
      const name = get(iName);
      const entryUrl = normalizeEntryUrl(get(iUrl));
      if (!category || !name || !entryUrl) continue;
      const orderRaw = get(iOrder);
      const order = orderRaw === '' ? i : Number(orderRaw);
      out.push({
        category,
        name,
        entryUrl,
        iconUrl: get(iIcon),
        newTab: parseFlag(get(iNewTab)),
        order: Number.isFinite(order) ? order : i,
        hidden: parseFlag(get(iHidden)),
      });
    }
    return out;
  }

  function visibleSorted(apps) {
    return apps
      .filter((a) => !a.hidden)
      .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name));
  }

  function groupByCategory(apps) {
    const order = [];
    const map = new Map();
    for (const app of apps) {
      if (!map.has(app.category)) {
        map.set(app.category, []);
        order.push(app.category);
      }
      map.get(app.category).push(app);
    }
    return { order, map };
  }

  function setOpen(open) {
    const was = menu.classList.contains('open');
    menu.classList.toggle('open', open);
    menu.hidden = !open;
    catBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    // While open, let clicks pass through the app iframe so "click outside" reaches the hub
    // (same idea as the Windows Start menu closing when you click the desktop).
    document.body.classList.toggle('hub-menu-open', open);
    if (open && !was) prepareMenu();
  }

  /** Desktop mode with the window manager loaded (wm_mode.js + wm_windows.js). */
  const wmOn = () => !!(window.HubMode && window.HubMode.isDesktop() && window.HubWM);

  /** Give the app iframe keyboard focus, unless the user is busy with the hub UI. */
  function focusFrame() {
    if (wmOn()) { if (!menu.classList.contains('open')) window.HubWM.focusActive(); return; }
    if (!currentEntry) return;
    if (menu.classList.contains('open')) return;
    const pop = document.getElementById('ctrl-popover');
    if (pop && !pop.hidden) return;
    const ae = document.activeElement;
    if (ae && ae !== document.body && ae !== frame && ae.matches &&
        ae.matches('input, textarea, select, [contenteditable]')) return;
    try {
      frame.focus();
      if (frame.contentWindow) frame.contentWindow.focus();
    } catch (_) { /* ignore */ }
  }

  function closeMenu() {
    const wasOpen = menu.classList.contains('open');
    setOpen(false);
    if (wasOpen) focusFrame();
  }

  /* ---------- app ids (hash links) + last-app memory ---------- */

  function slug(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /**
   * Short readable id for an ENTRY_URL: folder name (games/snake/ → snake) or file name
   * without extension (about/contact.txt → contact). If that id is taken by another entry,
   * the whole path is used (tools/caption-for-nei/ → tools-caption-for-nei).
   */
  function appIdFor(entryUrl, reg) {
    if (entryToId.has(entryUrl)) return entryToId.get(entryUrl);
    const ei = !reg && earlyId.get(entryUrl);   // R33c: opened from the index, not registered yet
    if (ei && !idToApp.has(ei)) return ei;
    const path = entryUrl.split(/[?#]/)[0].replace(/\/+$/, '');
    const last = path.split('/').pop() || '';
    let id = slug(isFileUrl(path) ? last.replace(/\.[a-z0-9]+$/i, '') : last);
    if (!id || idToApp.has(id)) id = slug(path.replace(/\.[a-z0-9]+$/i, ''));
    let n = 2;
    const base = id || 'app';
    while (!id || idToApp.has(id)) id = base + '-' + n++;
    return id;
  }

  function registerApp(app) {
    if (!app || !app.entryUrl || entryToId.has(app.entryUrl)) return;
    const id = appIdFor(app.entryUrl, true);   // reg: never the R33c index id
    entryToId.set(app.entryUrl, id);
    idToApp.set(id, app);
  }

  function storageGet() {
    try { return window.localStorage.getItem(LAST_KEY) || ''; } catch (_) { return ''; }
  }
  function storageSet(id) {
    try {
      if (id) window.localStorage.setItem(LAST_KEY, id);
      else window.localStorage.removeItem(LAST_KEY);
    } catch (_) { /* storage blocked: ignore */ }
  }

  function hashId() {
    try { return decodeURIComponent(location.hash.replace(/^#/, '')); } catch (_) { return ''; }
  }

  /** Set the hash (push = new history entry) without reloading; '' clears it. */
  function setHash(id, push) {
    if (hashId() === id) return;
    const url = location.pathname + location.search + (id ? '#' + encodeURIComponent(id) : '');
    try {
      history[push ? 'pushState' : 'replaceState'](null, '', url);
    } catch (_) {
      if (id) location.hash = id;
      else if (location.hash) location.hash = '';
    }
  }

  /**
   * Navigate the iframe without adding a history entry (the hub owns Back / Forward).
   * Chrome still adds one when the frame's very first document redirects (folder
   * index.html pages do), so the frame is primed with about:blank first (primeFrame).
   */
  let frameReady = false;
  let pendingUrl = '';
  function replaceFrame(url) {
    try {
      frame.contentWindow.location.replace(new URL(url, location.href).href);
    } catch (_) {
      frame.src = url;
    }
  }
  function navigateFrame(url) {
    frame.dataset.app = url + '#' + Date.now(); // src-like signal for gamebar / controller
    if (frameReady) replaceFrame(url);
    else pendingUrl = url;
  }
  function primeFrame() {
    const done = () => {
      if (frameReady) return;
      frameReady = true;
      frame.removeEventListener('load', done);
      if (pendingUrl) { const u = pendingUrl; pendingUrl = ''; replaceFrame(u); }
    };
    frame.addEventListener('load', done);
    setTimeout(done, 1500); // never wait forever
    replaceFrame('about:blank');
  }

  /** Open an app: NEW_TAB → new browser tab, else the hub iframe (+ hash + memory). */
  function loadApp(app, opts) {
    if (app && window.HubSettingsFresh) window.HubSettingsFresh(app.entryUrl);   // R38: stale open Settings → reload it
    opts = opts || {};
    // Phone remote Hub (hub_role.js): the Gamepad (menu row, tile, chat link) always opens IN the
    // frame so it borrows the Hub's SharedLink — never a new tab with its own connection.
    if (window.__hubRemote && /^hub\/controller\/(index\.html|controller\.html)?$/.test(app.entryUrl.split(/[?#]/)[0])) {
      const gp = idToApp.get(entryToId.get('hub/controller/controller.html'));
      if (gp && gp !== app) { loadApp(gp, Object.assign({}, opts, { forceFrame: true })); return; }
      opts = Object.assign({}, opts, { forceFrame: true });
    }
    if (app.newTab && !opts.forceFrame) {
      setOpen(false);
      window.open(frameUrlFor(app.entryUrl), '_blank', 'noopener');
      return;
    }
    const id = appIdFor(app.entryUrl);
    // opts.hash: open the app on that #hash (e.g. Settings #about; hub_ctx_menus.js); an app that
    // is already open just moves to it
    const hash = opts.hash ? '#' + String(opts.hash).replace(/^#/, '') : '';
    const toHash = (f) => {
      try { if (hash && f.contentWindow.location.hash !== hash) f.contentWindow.location.hash = hash; }
      catch (_) {   // file:// (opaque origins): the hash cannot be read, but the frame can still be pointed at the same page + hash (hashchange only, no reload)
        try { if (hash) f.contentWindow.location.replace(new URL(frameUrlFor(app.entryUrl) + hash, location.href).href); } catch (__) { /* ignore */ }
      }
    };
    if (wmOn()) {   // Desktop mode: own window (focuses the existing one; opts.newInstance = another); hash via HubWM.onActive
      setOpen(false);
      const had = !opts.newInstance && window.HubWM.list().some((x) => x.key === app.entryUrl);
      const w = window.HubWM.open({ key: app.entryUrl, name: app.name, icon: iconFor(app), url: frameUrlFor(app.entryUrl) + hash, app, newInstance: !!opts.newInstance });
      if (had && w) toHash(w.frame);
      return;
    }
    if (!opts.forceFrame) setFromCat('');
    if (!opts.fromHistory) setHash(id, !opts.replaceHash);
    storageSet(id);
    if (currentEntry !== app.entryUrl || opts.reload) navigateFrame(frameUrlFor(app.entryUrl) + hash);
    else toHash(frame);
    currentEntry = app.entryUrl;
    empty.classList.add('hidden');
    setOpen(false);
    focusFrame();
    document.title = 'Hub - ' + app.name;
    catLabel.textContent = HEADER_DEFAULT;
    menu.querySelectorAll('button.app').forEach((b) => {
      b.classList.toggle('active', b.dataset.entryUrl === app.entryUrl);
    });
    updateLabBtn();
  }

  /* ---------- in-frame navigation (e.g. a Lab tile link) is remembered too ---------- */

  // Category label (Lab / Games): shown only on a category tiles page or an app reached from it
  // (the category name survives refresh in localStorage).
  const FROM_CAT_KEY = 'sites-hub.fromCat';
  let fromCat = '';
  try { fromCat = window.localStorage.getItem(FROM_CAT_KEY) || ''; window.localStorage.removeItem('sites-hub.fromLab'); } catch (_) { /* ignore */ }
  if (fromCat && !CAT_PAGES[fromCat]) fromCat = '';
  function setFromCat(cat) {
    fromCat = cat && CAT_PAGES[cat] ? cat : '';
    try {
      if (fromCat) window.localStorage.setItem(FROM_CAT_KEY, fromCat);
      else window.localStorage.removeItem(FROM_CAT_KEY);
    } catch (_) { /* ignore */ }
  }
  /** Category whose tiles page IS this entry ('' = none). Apps are labelled by fromCat, not by
   *  folder, so e.g. Phone (apps/media/) opened from Lab says Lab, and apps/tools/learning-html
   *  opened from the Desktop menu shows no label. */
  function catOf(entry) {
    if (!entry) return '';
    const e = entry.split(/[?#]/)[0].replace(/index\.html$/i, '');
    for (const c in CAT_PAGES) if (e === CAT_PAGES[c]) return c;
    return '';
  }
  /** Bar label: the category name on its tiles page, else the app name; hidden elsewhere or when the app has its own bar. */
  function updateLabBtn() {
    if (!labLabel) return;
    const cat = currentEntry ? (catOf(currentEntry) || fromCat) : '';
    const show = !!cat && !(gamebarEl && !gamebarEl.hidden);
    labLabel.hidden = !show;
    if (!show) return;
    const name = currentEntry === CAT_PAGES[cat] ? cat : document.title.replace(/^Hub - /, '');
    labLabelName.textContent = name;
    labLabelName.title = name;
  }
  if (gamebarEl && window.MutationObserver) {
    new MutationObserver(() => updateLabBtn()).observe(gamebarEl, { attributes: true, attributeFilter: ['hidden'] });
  }

  /** Safe hub-relative path: no scheme, no "..", no leading slash. */
  function safeRel(rel) {
    return !!rel && !/^[a-z][a-z0-9+.-]*:/i.test(rel) && rel[0] !== '/' && rel.indexOf('..') < 0;
  }

  /** Id → app. "~path" ids are pages reached inside the frame that are not in hub_apps.js. */
  function appForId(id) {
    id = String(id).replace(/^~apps\/lab\/(aeroplane|island-demo|aoe-rts)\//, '~apps/games/$1/');   // R56: moved to Games
    const known = idToApp.get(id) || early.get(id);   // R33c: early = from the index, not registered yet
    if (known) return known;
    const old = oldId(id);   // R58
    if (old === '') return null;
    if (old) id = old;
    if (id[0] !== '~' || !safeRel(id.slice(1))) return null;
    const entryUrl = id.slice(1);
    const name = entryUrl.replace(/\/+$/, '').split('/').pop().replace(/\.[a-z0-9]+$/i, '') || 'App';
    const app = { category: '', name, entryUrl, newTab: false, hidden: true };
    entryToId.set(entryUrl, id);
    idToApp.set(id, app);
    return app;
  }

  /** Frame finished loading: if it moved to another page by itself, remember that page. */
  function trackFrame() {
    if (!currentEntry) return;
    let loc, doc;
    // R59: read the fields inside the try; on file:// every page is origin 'null' and reading a
    // frame's location.protocol throws (an uncaught SecurityError at every frame load before).
    try { const l = frame.contentWindow.location; loc = { protocol: l.protocol, pathname: l.pathname }; doc = frame.contentDocument; } catch (_) { return; }
    if (!loc || (loc.protocol !== 'http:' && loc.protocol !== 'https:' && loc.protocol !== 'file:')) return;
    const base = location.pathname.replace(/[^/]*$/, '');
    if (loc.pathname.indexOf(base) !== 0) return;
    let rel;
    try { rel = decodeURI(loc.pathname.slice(base.length)).replace(/index\.html$/i, ''); } catch (_) { return; }
    if (!safeRel(rel) || rel === TXT_VIEWER) return;
    const dir = rel.replace(/[^/]*$/, '');
    const cur = currentEntry.split(/[?#]/)[0];
    if (cur === rel || cur === dir) { updateLabBtn(); return; } // still the opened app
    let app = null;
    for (const a of apps) {
      const e = a.entryUrl.split(/[?#]/)[0];
      if (!a.newTab && (e === rel || e === dir)) { app = a; break; }
    }
    if (app) registerApp(app);
    const id = app ? appIdFor(app.entryUrl) : '~' + rel;
    if (!app) app = appForId(id);
    if (!app) return;
    setFromCat(catOf(currentEntry) || fromCat);
    currentEntry = app.entryUrl;
    setHash(id, false);
    storageSet(id);
    const t = app.hidden && doc && doc.title ? doc.title : app.name;
    document.title = 'Hub - ' + t;
    menu.querySelectorAll('button.app').forEach((b) => {
      b.classList.toggle('active', b.dataset.entryUrl === app.entryUrl);
    });
    updateLabBtn();
  }

  /** Back to the home screen: clears the hash, the saved app and the frame. */
  function goHome(opts) {
    opts = opts || {};
    if (wmOn()) {   // Desktop mode: show the home screen = minimise every window
      setOpen(false);
      window.HubWM.minimiseAll();
      return;
    }
    if (!opts.fromHistory) setHash('', true);
    storageSet('');
    setFromCat('');
    if (currentEntry) navigateFrame('about:blank');
    currentEntry = '';
    empty.classList.remove('hidden');
    setOpen(false);
    document.title = 'Hub';
    catLabel.textContent = HEADER_DEFAULT;
    menu.querySelectorAll('button.app').forEach((b) => b.classList.remove('active'));
    updateLabBtn();
  }

  /** Hash (or, at start-up only, the saved app) → open it; unknown / empty → home. */
  function applyHash(fromStart) {
    const id = hashId();
    const restored = fromStart && wmOn() && restoreWm();   // Desktop mode: saved windows first
    let app = id ? appForId(id) : null;
    if (!id && fromStart) {
      if (restored) return;   // the session already focused its window
      const saved = storageGet();
      app = saved ? appForId(saved) : null;
      if (app) { loadApp(app, { forceFrame: true, replaceHash: true }); return; }
      if (saved) storageSet('');
    }
    if (app) loadApp(app, { forceFrame: true, fromHistory: true });
    else if (fromStart) { if (id) setHash('', false); }
    else { goHome({ fromHistory: true }); if (id) setHash('', false); }   // R58: an unknown / gone id leaves no stale hash
  }

  /* ---------- menu: collapsible categories (accordion, one open) ---------- */
  // (No "Home screen" row any more: Desktop mode has Show Desktop on the taskbar; Phone
  //  mode goes home with Back / an empty hash.)

  /** Shift+click or middle-click on a menu / tile row = a new window (Desktop mode). */
  function onOpenClick(btn, open) {
    btn.addEventListener('click', (e) => open({ newInstance: !!e.shiftKey }));
    btn.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });   // no autoscroll
    btn.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); open({ newInstance: true }); } });
  }

  /** AH2: a category (menu header, ctx menu) opens the App Hub on that category's page
   *  (apps/system/apphub/#cat=<Category>): a window in Desktop mode, the frame in Phone mode.
   *  The legacy pages in CAT_PAGES still load for old deep links / saved sessions (hash id, last app). */
  const APPHUB_ENTRY = 'apps/system/apphub/';
  function openCat(cat, o) {
    let app = apps.find((a) => a.entryUrl === APPHUB_ENTRY);
    if (!app) { app = { category: 'System', name: 'App Hub', entryUrl: APPHUB_ENTRY, newTab: false, hidden: true }; registerApp(app); }
    loadApp(app, Object.assign({}, o, { hash: 'cat=' + encodeURIComponent(cat) }));
  }

  function renderMenu(apps) {
    menu.innerHTML = '';
    const { order, map } = groupByCategory(visibleSorted(apps));
    order.forEach((cat, i) => {
      const list = map.get(cat);
      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'menu-cat';
      head.setAttribute('role', 'menuitem');
      head.setAttribute('aria-expanded', 'false');
      head.setAttribute('aria-controls', 'menu-sub-' + i);
      head.dataset.cat = cat;
      const pageApp = CAT_PAGES[cat] ? apps.find((a) => a.entryUrl === CAT_PAGES[cat]) : null;
      if (pageApp) {
        // Page category (e.g. Lab): the header opens its tiles page in the frame, no app list.
        head.removeAttribute('aria-expanded');
        head.removeAttribute('aria-controls');
        head.dataset.page = '1';
        const cimg = document.createElement('img');
        cimg.className = 'cat-icon';
        cimg.alt = '';
        cimg.src = iconPathFor(CAT_PAGES[cat]);
        cimg.addEventListener('error', () => cimg.classList.add('missing'));
        const cname = document.createElement('span');
        cname.className = 'cat-name';
        cname.textContent = cat;
        head.append(cimg, cname);
        onOpenClick(head, (o) => openCat(cat, o));   // AH2: the App Hub's category page, not the legacy apps/<cat>/<cat>.html
        menu.appendChild(head);
        return;
      }
      head.textContent = cat + ' (' + list.length + ')';
      head.addEventListener('click', () => toggleCat(head));
      menu.appendChild(head);

      const sub = document.createElement('div');
      sub.className = 'menu-sub';
      sub.id = 'menu-sub-' + i;
      sub.setAttribute('role', 'group');
      sub.setAttribute('aria-label', cat);
      const inner = document.createElement('div');
      inner.className = 'menu-sub-inner';
      inner.inert = true;
      for (const app of list) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'app';
        btn.setAttribute('role', 'menuitem');
        btn.dataset.entryUrl = app.entryUrl;
        if (app.entryUrl === currentEntry) btn.classList.add('active');

        const img = document.createElement('img');
        img.className = 'icon';
        img.alt = '';
        img.loading = 'lazy';
        img.src = iconFor(app);
        img.addEventListener('error', () => img.classList.add('missing'));

        const span = document.createElement('span');
        span.textContent = app.name;

        btn.append(img, span);
        if (app.newTab) btn.title = 'Opens in a new tab';
        onOpenClick(btn, (o) => loadApp(app, o));
        inner.appendChild(btn);
      }
      sub.appendChild(inner);
      menu.appendChild(sub);
    });
  }

  const subOf = (head) => head && document.getElementById(head.getAttribute('aria-controls'));
  const headOf = (btn) => {
    const sub = btn && btn.closest('.menu-sub');
    return sub ? menu.querySelector('.menu-cat[aria-controls="' + sub.id + '"]') : null;
  };

  /** Open one category (null = all closed). instant: no animation (menu just opened). */
  function expandCat(head, instant) {
    menu.classList.toggle('no-anim', !!instant);
    menu.querySelectorAll('.menu-cat').forEach((h) => {
      const on = h === head;
      h.setAttribute('aria-expanded', on ? 'true' : 'false');
      const sub = subOf(h);
      if (!sub) return;
      sub.classList.toggle('open', on);
      sub.firstChild.inert = !on;
    });
    if (instant) { void menu.offsetHeight; menu.classList.remove('no-anim'); }
    if (head && !instant) setTimeout(() => keepVisible(head, subOf(head)), 170);
  }
  function toggleCat(head) {
    expandCat(head.getAttribute('aria-expanded') === 'true' ? null : head);
  }
  /** Scroll the menu so the header (and as much of its list as fits) is visible. */
  function keepVisible(head, sub) {
    const m = menu.getBoundingClientRect();
    const h = head.getBoundingClientRect();
    const bottom = sub ? sub.getBoundingClientRect().bottom : h.bottom;
    if (bottom > m.bottom) menu.scrollTop += Math.min(bottom - m.bottom + 6, h.top - m.top - 6);
    else if (h.top < m.top) menu.scrollTop -= m.top - h.top + 6;
  }

  /** Menu just opened: all folded on the home screen; else the current app's category open. */
  function prepareMenu() {
    menu.querySelectorAll('.kfocus').forEach((b) => b.classList.remove('kfocus'));
    const active = currentEntry ? menu.querySelector('button.app.active') : null;
    const head = active ? headOf(active) : null;
    expandCat(head, true);
    menu.scrollTop = 0;
    const target = active || menu.querySelector('.menu-cat, button.app');
    if (target) {
      if (active) active.scrollIntoView({ block: 'nearest' });
      try { target.focus({ preventScroll: !!active }); } catch (_) { target.focus(); }
    }
  }

  /** Keyboard / phone D-pad inside the open menu. Returns true when the key was used. */
  function menuRows() {
    return Array.from(menu.querySelectorAll('.home-item, .menu-cat, .menu-sub.open button.app'));
  }
  function focusRow(el) {
    if (!el) return;
    menu.querySelectorAll('.kfocus').forEach((b) => b.classList.remove('kfocus'));
    el.classList.add('kfocus');
    try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
    el.scrollIntoView({ block: 'nearest' });
  }
  function menuKey(key) {
    if (!menu.classList.contains('open')) return false;
    const rows = menuRows();
    if (!rows.length) return false;
    const ae = document.activeElement;
    const cur = rows.indexOf(ae) >= 0 ? ae : null;
    const isHead = !!(cur && cur.classList.contains('menu-cat'));
    const isOpen = isHead && cur.getAttribute('aria-expanded') === 'true';
    switch (key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!cur) { focusRow(menu.querySelector('button.app.active') || rows[0]); return true; }
        const i = rows.indexOf(cur) + (key === 'ArrowDown' ? 1 : -1);
        focusRow(rows[Math.max(0, Math.min(rows.length - 1, i))]);
        return true;
      }
      case 'Enter':
      case ' ':
        if (!cur) { focusRow(rows[0]); return true; }
        if (isHead && cur.dataset.page) { cur.click(); return true; }
        if (isHead) { toggleCat(cur); focusRow(cur); return true; }
        cur.click();
        return true;
      case 'ArrowRight':
        if (isHead && cur.dataset.page) { cur.click(); return true; }
        if (isHead) {
          if (!isOpen) expandCat(cur);
          const first = subOf(cur).querySelector('button.app');
          focusRow(first || cur);
          return true;
        }
        return !!cur;
      case 'ArrowLeft':
        if (cur && !isHead && cur.closest('.menu-sub')) {
          const head = headOf(cur);
          expandCat(null);
          focusRow(head);
          return true;
        }
        if (isOpen) { expandCat(null); focusRow(cur); return true; }
        closeMenu();
        return true;
      case 'Escape':
        if (isOpen) { expandCat(null); focusRow(cur); return true; }
        closeMenu();
        return true;
    }
    return false;
  }
  const MENU_KEYS = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, Enter: 1, ' ': 1, Escape: 1 };

  // The phone controller (hub-controller.js) dispatches its keys into the app frame's document.
  // While the menu is open, catch them there first (capture) so they drive the menu instead.
  function hookFrameKeys() {
    let w;
    try { w = frame.contentWindow; if (!w || !w.document || w.__hubMenuKeys) return; } catch (_) { return; }
    w.__hubMenuKeys = true;
    const grab = (e) => {
      if (!menu.classList.contains('open') || !MENU_KEYS[e.key]) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === 'keydown') menuKey(e.key);
    };
    w.addEventListener('keydown', grab, true);
    w.addEventListener('keyup', grab, true);
    w.addEventListener('keypress', grab, true);
  }

  catBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !menu.classList.contains('open');
    if (open) setOpen(true);
    else closeMenu();
  });
  // Click / tap outside the menu (or the Hub Menu button) closes it — like Windows Start.
  // Capture phase so it still runs when a child stops bubbling; iframe is pointer-events:none
  // while open (see .hub-menu-open in hub_main.css).
  document.addEventListener('pointerdown', (e) => {
    if (!menu.classList.contains('open')) return;
    if (menu.contains(e.target) || catBtn.contains(e.target)) return;
    if (e.target.closest && e.target.closest('#wm-start')) return;   // taskbar Start (wm_taskbar.js)
    if (e.target.closest && e.target.closest('#menu-fly')) return;   // desktop flyout (hub_flyout.js)
    closeMenu();
  }, true);
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('keydown', (e) => {
    if (menu.classList.contains('open')) {
      if (MENU_KEYS[e.key] && menuKey(e.key)) e.preventDefault();
      return;
    }
    // A key pressed while the hub itself has focus: move focus into the app so the
    // following keys reach it (this first key is not forwarded).
    if (document.activeElement === document.body) focusFrame();
  });

  // Hide scrollbars inside same-origin apps; give the new page keyboard focus.
  hookFrameKeys();
  frame.addEventListener('load', () => {
    hookFrameKeys();
    trackFrame();
    if (window.__hubInjectCtx) window.__hubInjectCtx(frame);   // our right-click menu inside the app (hub_ctx.js)
    try {
      const doc = frame.contentDocument;
      // Hide scrollbars only (scrolling by touch / wheel / D-pad still works); once per doc.
      if (doc && doc.head && !doc.getElementById('hub-noscrollbar')) {
        const st = doc.createElement('style');
        st.id = 'hub-noscrollbar';
        st.textContent = 'html,body{scrollbar-width:none;-ms-overflow-style:none} ::-webkit-scrollbar{width:0;height:0;display:none}';
        doc.head.appendChild(st);
      }
    } catch (_) { /* cross-origin: ignore */ }
    focusFrame();
  });

  /** Menu + home screen message when hub_apps.js is missing / broken. */
  function showLoadError(why) {
    console.error('hub: ' + LOAD_ERROR + (why ? ' (' + why + ')' : ''));
    menu.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'menu-error';
    msg.textContent = LOAD_ERROR;
    menu.appendChild(msg);
    if (emptyText) {
      emptyText.textContent = LOAD_ERROR;
      emptyText.classList.add('error');
    }
  }

  /** Menu from window.HUB_APPS_CSV (hub_apps.js). */
  function loadApps() {
    const text = window.HUB_APPS_CSV;
    if (typeof text !== 'string') { showLoadError('HUB_APPS_CSV missing'); return false; }
    try {
      apps = parseCsv(text);
    } catch (err) {
      apps = [];
    }
    if (!apps.length) { showLoadError('no usable rows'); return false; }
    window.HUB_APPS = apps;
    apps.forEach(registerApp);
    renderMenu(apps);
    return true;
  }

  /* ---------- home screen tiles (hub_tiles.js) ---------- */

  /** This hub's own link (no query / hash) for the QR tile. */
  function hubUrl() {
    return location.href.split('#')[0].split('?')[0];
  }

  function findApp(entryUrl) {
    return apps.filter((a) => a.entryUrl === entryUrl)[0] || null;
  }

  function drawQr(box, url) {
    box.innerHTML = '';
    if (!url) { box.textContent = 'Starting…'; return; }
    try {
      if (typeof qrcode !== 'function') throw new Error('qrcode.js missing');
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      box.innerHTML = qr.createSvgTag(QR_CELL, QR_CELL * QR_QUIET_MODULES);
    } catch (err) {
      box.textContent = 'QR unavailable';
      console.warn('hub tile QR', err);
    }
  }

  /** QR + title only (no caption, no link). pair: 1 = the live phone-controller link with
   *  the hub's pairing code (hub-controller.js), so it matches the gamepad icon's QR. */
  function qrTile(t) {
    const tile = document.createElement('div');
    tile.className = 'tile tile-qr';   // data-link = the QR's link (right-click menu: hub_ctx_menus.js)
    const box = document.createElement('div');
    box.className = 'tile-qr-box';
    if (parseFlag(t.pair)) {
      // Connect QR: hub.html?join=CODE (phone remote Hub: the code it is joined to, hub_remote.js)
      drawQr(box, window.HubCtrlLink ? window.HubCtrlLink.connectUrl : '');
      tile.dataset.link = (window.HubCtrlLink && window.HubCtrlLink.connectUrl) || '';
      let last = '';
      window.addEventListener('hub-ctrl-link', (e) => {
        const url = (e.detail && e.detail.connectUrl) || '';
        if (url && url !== last) { last = url; drawQr(box, url); tile.dataset.link = url; }
      });
      // Connected devices (SharedLink) under the Gamepad QR: name + green online dot
      setTimeout(() => {   // link_ui.js loads after hub.js
        if (!window.SharedLinkUI) return;
        const devs = document.createElement('div');
        devs.className = 'tile-devices';
        SharedLinkUI.mountDevices(devs);
        tile.appendChild(devs);
      }, 0);
    } else {
      drawQr(box, hubUrl());
      tile.dataset.link = hubUrl();
    }
    const label = document.createElement('span');
    label.className = 'tile-label';
    label.textContent = t.label || 'This hub';
    tile.append(box, label);
    return tile;
  }

  function appTile(t) {
    const entryUrl = normalizeEntryUrl(t.url);
    if (!entryUrl) return null;
    const known = findApp(entryUrl);
    const newTabRaw = t.NEW_TAB !== undefined ? t.NEW_TAB : t.newTab;
    const app = {
      name: t.label || (known && known.name) || entryUrl,
      entryUrl: entryUrl,
      iconUrl: t.icon || (known ? iconFor(known) : ''),
      // (tile label only; the menu keeps the hub_apps.js NAME)
      newTab: newTabRaw === undefined || newTabRaw === '' ? !!(known && known.newTab) : parseFlag(newTabRaw),
    };
    // Phone remote Hub (hub_role.js): the Gamepad tile is a frame app (remembered across reloads).
    let gpApp = null;
    if (parseFlag(t.pair) && window.__hubRemote) {
      gpApp = { name: app.name, entryUrl: 'hub/controller/controller.html', iconUrl: app.iconUrl, newTab: false };
      registerApp(gpApp);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile tile-app';
    btn.dataset.entryUrl = entryUrl;
    if (app.newTab) btn.dataset.newTab = '1';
    if (parseFlag(t.pair)) btn.dataset.pair = '1';
    if (!known) registerApp(app);    // tile-only app: still gets a hash id
    const img = document.createElement('img');
    img.className = 'tile-icon';
    img.alt = '';
    img.src = iconFor(app);
    img.addEventListener('error', () => img.classList.add('missing'));
    const label = document.createElement('span');
    label.className = 'tile-label';
    label.textContent = app.name;
    btn.append(img, label);
    if (app.newTab) btn.title = 'Opens in a new tab';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Phone remote Hub: the controller opens IN the app frame (same tab, borrowed link).
      if (gpApp) { loadApp(gpApp, { forceFrame: true }); return; }
      // pair: 1 = open the controller already carrying this hub's pairing code
      if (parseFlag(t.pair) && window.HubCtrlLink) {
        const url = window.HubCtrlLink.ensure();
        if (url) { window.open(url, '_blank', 'noopener'); return; }
      }
      loadApp(app);
    });
    return btn;
  }

  function renderTiles() {
    if (!tilesEl) return;
    tilesEl.innerHTML = '';
    const list = Array.isArray(window.HUB_TILES) ? window.HUB_TILES : [];
    list.forEach((t) => {
      if (!t || typeof t !== 'object') return;
      const el = t.type === 'qr' ? qrTile(t) : t.type === 'app' ? appTile(t) : null;
      if (el) tilesEl.appendChild(el);
    });
    tilesEl.hidden = !tilesEl.children.length;
  }

  window.__hubFocusFrame = focusFrame;
  // hub_ctx_menus.js: an app's page url (Open in new tab / Copy link)
  window.__hubFrameUrl = (entry) => frameUrlFor(normalizeEntryUrl(entry) || entry);
  window.__hubGoHome = goHome;
  // AH1-F1: what the Home button does (Settings → Desktop, key 'homeBtn': '' = Home screen,
  // 'apphub' = App Hub). Only the Phone mode #home-btn (hub-gamebar.js) calls __hubHome
  // (H6-B1: the Desktop Show desktop button no longer does; it only minimises / restores).
  // Read at click time, so a change applies at once.
  window.__hubHomeAppHub = () => { try { return localStorage.getItem('sites-hub.homeBtn') === 'apphub'; } catch (_) { return false; } };
  window.__hubHome = () => {
    if (!window.__hubHomeAppHub() || (!wmOn() && currentEntry === APPHUB_ENTRY)) { goHome(); return; }   // App Hub already showing → the real home
    window.__hubOpenApp(APPHUB_ENTRY);
  };
  window.__hubCurrentEntry = () => currentEntry;   // R56: Phone mode 'an app is open' signal (hub_update.js idleNow)
  // hub_link.js: "Open in…" a receiver app — the frame in Phone mode; in Desktop mode that
  // app's window (opened or focused), which then is the focused window the file goes to.
  window.__hubOpenUrl = (url) => {
    if (!wmOn()) { navigateFrame(url); return; }
    const rel = String(url || '').replace(/index\.html$/i, '');
    const app = findApp(normalizeEntryUrl(rel)) || (safeRel(rel) ? appForId('~' + rel) : null);
    if (app) loadApp(app, { forceFrame: true });
  };
  // hub_chat.js (release 4): open a Hub app by part of its entry url ('pooh-chat').
  window.__hubOpenApp = (match, opts) => {
    const find = () => (window.HUB_APPS || []).find((x) => String(x.entryUrl || '').indexOf(match) >= 0);
    const a = find();
    if (a) loadApp(a, opts);
    if (a) return true;
    // R33a: a path asked for before the CSV lists are in → wait for them (else open it by path)
    const rel = normalizeEntryUrl(match);
    if (String(match).indexOf('/') < 0 || !safeRel(rel)) return false;
    csvReady.then(() => { const b = find() || appForId('~' + rel); if (b) loadApp(b, opts); });
    return true;
  };
  /** hub_flyout.js: open an app picked in a category's flyout, as if from that category page. */
  window.__hubFly = {
    catPages: CAT_PAGES,
    openCat,
    /** AH2: page url of a category in the App Hub (new tab / copy link); not for loadApp. */
    catUrl: (cat) => frameUrlFor(APPHUB_ENTRY) + '#cat=' + encodeURIComponent(cat),
    openFromCat(cat, entryUrl, name, newTab, opts) {
      entryUrl = normalizeEntryUrl(entryUrl);
      if (!entryUrl) return;
      let app = apps.find((a) => a.entryUrl === entryUrl);
      if (!app) {
        app = { category: '', name: name || entryUrl, entryUrl, newTab: !!newTab, hidden: true };
        registerApp(app);
      }
      loadApp(app, opts);
      if (currentEntry === entryUrl) { setFromCat(cat); updateLabBtn(); }   // opened in the frame
    }
  };
  // Category page in a Desktop-mode window (shared/tiles/tiles.js): a tile asks the Hub to open
  // its app in its OWN window {type:'hub-open-app', url, name, newInstance}; the category window
  // stays on its list. Only accepted from a Hub window of this origin, for a page of this site.
  // T1: in Phone mode the app frame may ask too (Terminal's open on file://, where it cannot call
  // __hubOpenApp); it opens like __hubOpenApp(path).
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (!d || d.type !== 'hub-open-app') return;
    if (!IS_FILE && e.origin !== location.origin) return;
    const phone = !wmOn();
    if (phone && e.source !== frame.contentWindow) return;
    const from = phone ? null : window.HubWM.list().find((w) => { try { return w.frame.contentWindow === e.source; } catch (_) { return false; } });
    if (!phone && !from) return;
    let u;
    try { u = new URL(String(d.url || ''), location.href); } catch (_) { return; }
    if (u.protocol !== location.protocol || (!IS_FILE && u.origin !== location.origin)) return;
    const base = location.pathname.replace(/[^/]*$/, '');
    if (u.pathname.indexOf(base) !== 0) return;
    let rel;
    try { rel = decodeURI(u.pathname.slice(base.length)).replace(/index\.html$/i, ''); } catch (_) { return; }
    if (!safeRel(rel)) return;
    if (phone) { window.__hubOpenApp(rel); return; }
    window.__hubFly.openFromCat(catOf(from.key), rel, String(d.name || '').slice(0, 80), false, { newInstance: !!d.newInstance });
  });
  /* ---------- Desktop mode: windows (wm_windows.js) ---------- */
  if (window.HubWM) {
    // Focused window → hash, last-app memory, title and the menu's active row (no history entry).
    window.HubWM.onActive = (w) => {
      if (!wmOn()) return;
      const id = w ? appIdFor(w.key) : '';
      setHash(id, false);
      storageSet(id);
      document.title = w ? 'Hub - ' + w.name : 'Hub';
      menu.querySelectorAll('button.app').forEach((b) => b.classList.toggle('active', !!w && b.dataset.entryUrl === w.key));
    };
  }
  /** Desktop session (wm_windows.js) → windows again. Apps no longer listed are skipped;
   *  pages known only by path (category CSV apps) are checked with a HEAD request. */
  function restoreWm() {
    if (!window.HubWM) return false;
    const check = [];
    const ok = window.HubWM.restoreSession((e) => {
      let key = normalizeEntryUrl(e.key);
      if (!key || !safeRel(key)) return null;
      // R53: Settings / About moved under apps/system/ (old folders are legacy redirect pages)
      // R53b: Files / Viewer / System Monitor / Device Benchmark moved from apps/tools/ too
      const moved = /^apps\/((?:tools\/)?)(settings|about|files|viewer|sysmon|devbench)\//.exec(key);
      if (moved && (moved[1] ? !/^(settings|about)$/.test(moved[2]) : /^(settings|about)$/.test(moved[2]))) {
        const from = 'apps/' + moved[1] + moved[2] + '/', to = 'apps/system/' + moved[2] + '/';
        key = to + key.slice(from.length);
        if (typeof e.url === 'string') e.url = e.url.replace(from, to);
      }
      // R56: Aeroplane / Island Game Demo (56d15a2) and AoE RTS (earlier) moved from apps/lab/ to
      //  apps/games/; apps/lab/<id>/ keeps a legacy redirect page for old links
      const lab = /^apps\/lab\/(aeroplane|island-demo|aoe-rts)\//.exec(key);
      if (lab) {
        const from = 'apps/lab/' + lab[1] + '/', to = 'apps/games/' + lab[1] + '/';
        key = to + key.slice(from.length);
        if (typeof e.url === 'string') e.url = e.url.replace(from, to);
      }
      // sessions saved before R8: a category page was its folder (apps/office/) → apps/office/office.html
      const m = /^apps\/([a-z]+)\/$/.exec(key);
      if (m && findApp(key + m[1] + '.html')) key = key + m[1] + '.html';
      const app = findApp(key) || idToApp.get(entryToId.get(key) || '') || early.get(key);   // R33c
      // the saved url may carry the app's #hash (same page only), e.g. Files' drive + folder
      const withHash = (base) => (typeof e.url === 'string' && e.url.indexOf(base.split('#')[0] + '#') === 0 ? e.url : base);
      if (app) {
        if (app.newTab) return null;
        return { key, name: app.name, icon: iconFor(app), url: withHash(frameUrlFor(app.entryUrl)), app };
      }
      check.push(key);
      const name = String(e.name || '').slice(0, 80) || key.replace(/\/+$/, '').split('/').pop();
      const extra = { category: '', name, entryUrl: key, newTab: false, hidden: true };
      registerApp(extra);   // so its hash id resolves again
      return { name, icon: iconPathFor(key), url: withHash(frameUrlFor(key)), app: extra };
    });
    check.forEach((key) => {
      if (IS_FILE) return;
      fetch(frameUrlFor(key), { method: 'HEAD', cache: 'no-cache' }).then((r) => {
        if (r.ok) return;
        window.HubWM.list().filter((x) => x.key === key).forEach((w) => window.HubWM.close(w));
      }).catch(() => { /* offline: keep it */ });
    });
    return ok;
  }
  window.addEventListener('hub-wm-mode', (e) => {
    if (!window.HubWM) return;
    if (e.detail.mode === 'desktop') {
      restoreWm();
      // The app in the frame moves into a window
      const app = currentEntry ? appForId(appIdFor(currentEntry)) || findApp(currentEntry) : null;
      if (currentEntry) navigateFrame('about:blank');
      currentEntry = '';
      setFromCat('');
      empty.classList.remove('hidden');
      updateLabBtn();
      if (app) loadApp(app, { forceFrame: true });
    } else {
      // The focused window's app moves into the frame; the other windows close
      // (onActive is a no-op now: the mode is already Phone)
      const w = window.HubWM.active;
      window.HubWM.closeAll();
      if (w) loadApp(w.app || { name: w.name, entryUrl: w.key, newTab: false }, { forceFrame: true, replaceHash: true });
      else { setHash('', false); goHome({ fromHistory: true }); }
    }
  });

  /* ---------- R33a: apps from the category CSVs ---------- */
  // hub_apps.js keeps only the categories + hidden system rows; every app comes from
  // apps/<cat>/<cat>-apps.csv, read by hub_flyout.js (window.HubStartList, cached in
  // sites-hub.startList). Registered in HUB_CAT_CSV order, so hash ids stay the same.
  const catNames = () => Object.keys(window.HUB_CAT_CSV || {});
  function addCsvApps(cat, list) {
    (list || []).forEach((a) => {
      const entryUrl = normalizeEntryUrl(a && a.entryUrl);
      if (!entryUrl || !a.name || findApp(entryUrl)) return;
      const app = { category: cat, name: a.name, entryUrl, iconUrl: a.icon || '', newTab: !!a.newTab, order: 0, hidden: false, csv: true };
      apps.push(app);
      registerApp(app);
    });
  }
  /** Every category CSV (loaded / refreshed) → registered. All loads start at once; the lists
   *  are registered strictly in HUB_CAT_CSV order (hash ids stay the same) as soon as each one
   *  and all before it are in; step() runs after each. Resolves when done (never rejects). */
  function loadCsvApps(step) {
    const S = window.HubStartList, cats = catNames();
    if (!S) return Promise.resolve();
    const loads = cats.map((c) => S.load(c).catch(() => null));
    return cats.reduce((p, c, i) => p.then(() => loads[i]).then((l) => { addCsvApps(c, l); if (step) step(); }),
      Promise.resolve());
  }
  /** R33b: what start-up needs: the hash id (else the last app id) and, in Desktop mode, the
   *  saved windows' entry paths. Ready = all of them are known (or need no list). */
  function startNeeds() {
    const ids = [], keys = [];
    const id = hashId() || storageGet();
    if (id && id[0] !== '~' && oldId(id) === null) ids.push(id);   // R58: old ids need no list
    if (wmOn()) {
      try {
        const s = JSON.parse(localStorage.getItem('sites-hub.wmSession') || 'null');
        (s && Array.isArray(s.wins) ? s.wins : []).forEach((w) => { if (w && w.key) keys.push(normalizeEntryUrl(w.key)); });
      } catch (_) { /* none */ }
    }
    const ready = () => ids.every((i) => idToApp.has(i) || early.has(i)) &&
      keys.every((k) => findApp(k) || entryToId.has(k) || early.has(k));
    return Object.assign(ready, { ids, keys });
  }

  /* ---------- R33c: app index (hub/core/hub_appindex.js) for a first visit ---------- */
  // HUB_APP_INDEX = { id: [category, entryUrl, name, icon, newTab] } for every CSV app, made from
  // the real ids (hub/core/hub_appindex_gen.py). On a first visit the hash / last app / saved
  // windows found there open at once, without waiting for any CSV. Those apps are NOT registered
  // (registration stays in HUB_CAT_CSV order, so ids never change). Stale index: an id / entry not
  // in it = the R33b wait as before; an id that now means another app is re-opened right once
  // the CSVs are in (checkIndex).
  function earlyFromIndex(ready) {
    const byEntry = {};
    Object.keys(IDX).forEach((i) => { byEntry[IDX[i][1]] = i; });
    const mk = (i) => { const r = IDX[i]; return { category: r[0], name: r[2], entryUrl: r[1], iconUrl: r[3] || '', newTab: !!r[4], order: 0, hidden: false, csv: true }; };
    ready.ids.forEach((i) => { if (IDX[i]) { early.set(i, mk(i)); earlyId.set(IDX[i][1], i); } });
    ready.keys.forEach((k) => { if (byEntry[k] != null) early.set(k, mk(byEntry[k])); });
  }
  /** The index the registered CSV apps really give (hub_appindex_gen.py writes it to the file). */
  window.__hubAppIndex = () => {
    const o = {};
    apps.forEach((a) => { if (a.csv && entryToId.has(a.entryUrl)) o[entryToId.get(a.entryUrl)] = [a.category, a.entryUrl, a.name, a.iconUrl || '', a.newTab ? 1 : 0]; });
    return o;
  };
  function checkIndex() {   // after all CSVs: a stale index only costs the R33b wait; say so
    const id = hashId(), e = early.get(id), now = idToApp.get(id);
    early.clear(); earlyId.clear();
    if (e && (!now || now.entryUrl !== e.entryUrl)) applyHash(false);   // the id means another app now
    if (!window.HUB_APP_INDEX) return;
    const real = window.__hubAppIndex(), ks = Object.keys(real);
    if (ks.length !== Object.keys(IDX).length || ks.some((k) => String(IDX[k]) !== String(real[k]))) console.info('Hub: hub/core/hub_appindex.js is out of date (run hub/core/hub_appindex_gen.py)');
  }
  let csvReady = Promise.resolve(), started = false;
  function start() {
    if (started) return;
    started = true;
    const S = window.HubStartList, cats = catNames();
    const cached = S ? cats.map((c) => S.cached(c)) : [];
    if (S && cached.every(Boolean)) {   // all lists cached: hash / last app / session at once
      cached.forEach((l, i) => addCsvApps(cats[i], l));
      csvReady = loadCsvApps();
      applyHash(true);
      return;
    }
    // first visit (or a changed list): open the hash / last app / session as soon as the lists
    // that hold them are in (R33b), at the latest when all are read or after 4 s
    const ready = startNeeds();
    earlyFromIndex(ready);   // R33c
    let ran = false;
    const run = () => { if (!ran) { ran = true; applyHash(true); } };
    if (ready()) run();
    csvReady = loadCsvApps(() => { if (!ran && ready()) run(); });
    csvReady.then(checkIndex);
    Promise.race([csvReady, new Promise((r) => setTimeout(r, 4000))]).then(run);
  }
  window.addEventListener('hub-startlist', (e) => {   // a CSV changed: register its new apps
    const S = window.HubStartList, cat = e.detail && e.detail.cat;
    if (S && cat) S.load(cat).then((l) => addCsvApps(cat, l));
  });

  primeFrame();
  loadApps();
  renderTiles();
  // hub_flyout.js (the CSV lists) loads after this file: start the moment it is in (R33b,
  // 'hub-startlist-ready'), DOMContentLoaded as the fallback (no flyout, e.g. no matchMedia)
  if (window.HubStartList) start();
  else {
    window.addEventListener('hub-startlist-ready', start, { once: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
  // Back / Forward (and hand-edited hashes): switch apps without adding entries.
  window.addEventListener('popstate', () => applyHash(false));
  window.addEventListener('hashchange', () => applyHash(false));
})();
