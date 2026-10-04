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
 * App links + last-app memory: an app opened in the hub frame puts a short id in the hash
 *   (hub.html#snake, #tv, #webcam, #caption-for-nei; id = folder name or file name without
 *   extension, see appIdFor) and in localStorage ('sites-hub.lastApp'). On load the hash wins,
 *   else the saved app opens; an unknown hash shows home. Back / Forward switch apps. The
 *   "Home screen" menu item clears both. NEW_TAB apps are never remembered.
 *   The frame is navigated with location.replace so only the hub adds history entries.
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

  const TXT_VIEWER = 'shared/script/txt-view.html';
  const LOAD_ERROR = 'hub_apps.js failed to load or has an error';
  const QR_CELL = 4;                  // px per module in the tile QR (SVG, scaled by CSS)
  const QR_QUIET_MODULES = 4;         // white quiet zone; createSvgTag's margin is in px

  let currentEntry = '';     // entryUrl of the app in the iframe (for the active highlight)
  let apps = [];             // parsed HUB_APPS_CSV (hidden rows included)
  const LAST_KEY = 'sites-hub.lastApp';
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
    if (open && !was) prepareMenu();
  }

  /** Give the app iframe keyboard focus, unless the user is busy with the hub UI. */
  function focusFrame() {
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
  function appIdFor(entryUrl) {
    if (entryToId.has(entryUrl)) return entryToId.get(entryUrl);
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
    const id = appIdFor(app.entryUrl);
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
    opts = opts || {};
    if (app.newTab && !opts.forceFrame) {
      setOpen(false);
      window.open(frameUrlFor(app.entryUrl), '_blank', 'noopener');
      return;
    }
    const id = appIdFor(app.entryUrl);
    if (!opts.fromHistory) setHash(id, !opts.replaceHash);
    storageSet(id);
    if (currentEntry !== app.entryUrl || opts.reload) navigateFrame(frameUrlFor(app.entryUrl));
    currentEntry = app.entryUrl;
    empty.classList.add('hidden');
    setOpen(false);
    focusFrame();
    document.title = app.name + ' — sites hub';
    catLabel.textContent = HEADER_DEFAULT;
    menu.querySelectorAll('button.app').forEach((b) => {
      b.classList.toggle('active', b.dataset.entryUrl === app.entryUrl);
    });
  }

  /** Back to the home screen: clears the hash, the saved app and the frame. */
  function goHome(opts) {
    opts = opts || {};
    if (!opts.fromHistory) setHash('', true);
    storageSet('');
    if (currentEntry) navigateFrame('about:blank');
    currentEntry = '';
    empty.classList.remove('hidden');
    setOpen(false);
    document.title = 'Main — sites hub';
    catLabel.textContent = HEADER_DEFAULT;
    menu.querySelectorAll('button.app').forEach((b) => b.classList.remove('active'));
  }

  /** Hash (or, at start-up only, the saved app) → open it; unknown / empty → home. */
  function applyHash(fromStart) {
    const id = hashId();
    let app = id ? idToApp.get(id) : null;
    if (!id && fromStart) {
      const saved = storageGet();
      app = saved ? idToApp.get(saved) : null;
      if (app) { loadApp(app, { forceFrame: true, replaceHash: true }); return; }
      if (saved) storageSet('');
    }
    if (app) loadApp(app, { forceFrame: true, fromHistory: true });
    else if (fromStart) { if (id) setHash('', false); }
    else goHome({ fromHistory: true });
  }

  /* ---------- menu: Home screen + collapsible categories (accordion, one open) ---------- */

  function renderMenu(apps) {
    menu.innerHTML = '';
    const homeBtn = document.createElement('button');
    homeBtn.type = 'button';
    homeBtn.className = 'app home-item';
    homeBtn.setAttribute('role', 'menuitem');
    homeBtn.innerHTML = '<span class="icon home-icon" aria-hidden="true">\u2302</span>';
    const homeLabel = document.createElement('span');
    homeLabel.textContent = 'Home screen';
    homeBtn.appendChild(homeLabel);
    homeBtn.addEventListener('click', () => goHome());
    menu.appendChild(homeBtn);
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
        btn.addEventListener('click', () => loadApp(app));
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
    const target = active || menu.querySelector('.home-item');
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
        if (isHead) { toggleCat(cur); focusRow(cur); return true; }
        cur.click();
        return true;
      case 'ArrowRight':
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
  // A click anywhere else in the hub closes the menu and hands focus back to the app.
  document.addEventListener('click', () => { setOpen(false); focusFrame(); });
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
      // (tile label only; the menu keeps the hub_apps.js NAME)
      newTab: newTabRaw === undefined || newTabRaw === '' ? !!(known && known.newTab) : parseFlag(newTabRaw),
    };
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tile tile-app';
    btn.dataset.entryUrl = entryUrl;
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
  window.__hubGoHome = goHome;
  primeFrame();
  loadApps();
  renderTiles();
  applyHash(true);
  // Back / Forward (and hand-edited hashes): switch apps without adding entries.
  window.addEventListener('popstate', () => applyHash(false));
  window.addEventListener('hashchange', () => applyHash(false));
})();
