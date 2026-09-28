/**
 * sites hub — menu from hub_apps.js (window.HUB_APPS_CSV), apps open in the iframe.
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
 * Focus: the app iframe gets keyboard focus after it loads, after an app is picked and when the
 * menu closes, so real keys reach the game without clicking into it first (never while the
 * menu or the controller popover is open).
 */
(function () {
  const HEADER_DEFAULT = 'Home';
  const catBtn = document.getElementById('cat-btn');
  const catLabel = document.getElementById('cat-label');
  const menu = document.getElementById('menu');
  const frame = document.getElementById('app-frame');
  const empty = document.getElementById('empty');

  const emptyText = document.getElementById('empty-text');
  const tilesEl = document.getElementById('tiles');

  const TXT_VIEWER = 'script/txt-view.html';
  const LOAD_ERROR = 'hub_apps.js failed to load or has an error';
  const QR_CELL = 4;                  // px per module in the tile QR (SVG, scaled by CSS)
  const QR_QUIET_MODULES = 4;         // white quiet zone; createSvgTag's margin is in px

  let currentEntry = '';     // entryUrl of the app in the iframe (for the active highlight)
  let apps = [];             // parsed HUB_APPS_CSV (hidden rows included)

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
    menu.classList.toggle('open', open);
    menu.hidden = !open;
    catBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /** Give the app iframe keyboard focus, unless the user is busy with the hub UI. */
  function focusFrame() {
    if (!frame.getAttribute('src')) return;
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

  /** Open an app: NEW_TAB → new browser tab, else the hub iframe. */
  function loadApp(app) {
    if (app.newTab) {
      setOpen(false);
      window.open(frameUrlFor(app.entryUrl), '_blank', 'noopener');
      return;
    }
    currentEntry = app.entryUrl;
    frame.src = frameUrlFor(app.entryUrl);
    empty.classList.add('hidden');
    setOpen(false);
    focusFrame();
    document.title = app.name + ' — sites hub';
    catLabel.textContent = HEADER_DEFAULT;
    menu.querySelectorAll('button.app').forEach((b) => {
      b.classList.toggle('active', b.dataset.entryUrl === app.entryUrl);
    });
  }

  function renderMenu(apps) {
    menu.innerHTML = '';
    const { order, map } = groupByCategory(visibleSorted(apps));
    for (const cat of order) {
      const label = document.createElement('div');
      label.className = 'menu-group';
      label.textContent = cat;
      menu.appendChild(label);
      for (const app of map.get(cat)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'app';
        btn.setAttribute('role', 'menuitem');
        btn.dataset.entryUrl = app.entryUrl;
        if (app.entryUrl === currentEntry) btn.classList.add('active');

        const img = document.createElement('img');
        img.className = 'icon';
        img.alt = '';
        img.src = iconFor(app);
        img.addEventListener('error', () => img.classList.add('missing'));

        const span = document.createElement('span');
        span.textContent = app.name;

        btn.append(img, span);
        if (app.newTab) btn.title = 'Opens in a new tab';
        btn.addEventListener('click', () => loadApp(app));
        menu.appendChild(btn);
      }
    }
  }

  catBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !menu.classList.contains('open');
    if (open) setOpen(true);
    else closeMenu();
  });
  // A click anywhere else in the hub closes the menu and hands focus back to the app.
  document.addEventListener('click', () => { setOpen(false); focusFrame(); });
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('open')) { closeMenu(); return; }
    // A key pressed while the hub itself has focus: move focus into the app so the
    // following keys reach it (this first key is not forwarded).
    if (document.activeElement === document.body) focusFrame();
  });

  // Hide scrollbars inside same-origin apps; give the new page keyboard focus.
  frame.addEventListener('load', () => {
    try {
      const doc = frame.contentDocument;
      if (doc && doc.documentElement) {
        doc.documentElement.style.overflow = 'hidden';
        if (doc.body) doc.body.style.overflow = 'hidden';
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

  function qrTile(t) {
    const url = hubUrl();
    const tile = document.createElement('div');
    tile.className = 'tile tile-qr';
    const box = document.createElement('div');
    box.className = 'tile-qr-box';
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
    const label = document.createElement('span');
    label.className = 'tile-label';
    label.textContent = t.label || 'This hub';
    const cap = document.createElement('a');
    cap.className = 'tile-caption';
    cap.href = url;
    cap.target = '_blank';
    cap.rel = 'noopener';
    cap.textContent = t.caption || url;
    tile.append(box, label, cap);
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
      newTab: newTabRaw === undefined || newTabRaw === '' ? !!(known && known.newTab) : parseFlag(newTabRaw),
    };
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile tile-app';
    btn.dataset.entryUrl = entryUrl;
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
  loadApps();
  renderTiles();
})();
