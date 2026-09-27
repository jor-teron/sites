/**
 * sites hub — loads WebApps from hub-apps.csv into the iframe.
 *
 * CSV: CATEGORY,NAME,ENTRY_URL,ORDER,HIDDEN
 * ENTRY_URL can be either:
 *   - a folder:  tv/  or  games/browser-fps/   (served via its index.html)
 *   - a file:    tools/calculator.html          (used exactly as written)
 *   - a text file: about/contact.txt            (shown in the dark viewer script/txt-view.html)
 * Loading: hub-apps.csv is fetched with cache:'no-store' plus a ?t= buster and a timeout.
 * The built-in FALLBACK_APPS list is shown only when that fetch really fails (network error,
 * HTTP error, timeout, empty/unparsable CSV); the hub then retries a few times (and when the
 * browser comes back online / the menu is opened) and re-renders the menu once the CSV arrives.
 * Focus: the app iframe gets keyboard focus after it loads, after an app is picked and when the
 * menu closes, so real keys reach the game without clicking into it first (never while the
 * menu or the controller popover is open).
 * Icons are derived, never listed in the CSV:
 *   - folder xxx/            -> xxx/xxx_icon.png
 *   - file   dir/name.ext    -> dir/name_icon.png   (e.g. about/contact.txt -> about/contact_icon.png)
 */
(function () {
  const HEADER_DEFAULT = 'Home';
  const catBtn = document.getElementById('cat-btn');
  const catLabel = document.getElementById('cat-label');
  const menu = document.getElementById('menu');
  const frame = document.getElementById('app-frame');
  const empty = document.getElementById('empty');

  const FALLBACK_APPS = [
    { category: 'Games', name: 'Browser FPS', entryUrl: 'games/browser-fps/', order: 10, hidden: false },
    { category: 'Tools', name: 'NE-India Dictionary', entryUrl: 'tools/nei-dict/', order: 20, hidden: false },
    { category: 'Tools', name: 'MS Word Diff', entryUrl: 'tools/msword_diff/', order: 30, hidden: false },
    { category: 'Tools', name: 'Calculator', entryUrl: 'tools/calculator.html', order: 40, hidden: false },
    { category: 'vDesktop', name: 'vDesktop', entryUrl: 'vDesktop/', order: 50, hidden: false },
    { category: 'Media', name: 'Phone', entryUrl: 'media/phone/', order: 60, hidden: false },
    { category: 'Media', name: 'TV', entryUrl: 'tv/', order: 110, hidden: false },
  ];

  const TXT_VIEWER = 'script/txt-view.html';
  const CSV_URL = 'hub-apps.csv';
  const CSV_TIMEOUT_MS = 8000;               // abort a hanging CSV fetch after this
  const CSV_RETRY_MS = [1500, 4000, 10000];  // retry delays after a failed CSV load

  let currentEntry = '';     // entryUrl of the app in the iframe (for the active highlight)
  let usingFallback = false; // true while the built-in list is on screen
  let menuRendered = false;
  let csvInFlight = false;
  let csvAttempt = 0;
  let csvRetryTimer = 0;

  /** True when ENTRY_URL points at a file (last segment has an extension) rather than a folder. */
  function isFileUrl(url) {
    const path = url.split(/[?#]/)[0];
    return /\.[a-z0-9]+$/i.test(path);
  }

  function isTxtUrl(url) {
    return /\.txt$/i.test(url.split(/[?#]/)[0]);
  }

  /** What the iframe should load: .txt files go through the dark text viewer. */
  function frameUrlFor(entryUrl) {
    return isTxtUrl(entryUrl) ? TXT_VIEWER + '?file=' + encodeURIComponent(entryUrl) : entryUrl;
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

  function parseHidden(v) {
    const s = String(v == null ? '' : v).trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes' || s === 'y' || s === 'hidden';
  }

  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map((h) => h.trim().toUpperCase());
    const iCat = header.indexOf('CATEGORY');
    const iName = header.indexOf('NAME');
    const iUrl = header.indexOf('ENTRY_URL');
    const iOrder = header.indexOf('ORDER');
    const iHidden = header.indexOf('HIDDEN');
    if (iCat < 0 || iName < 0 || iUrl < 0) return [];

    const apps = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const category = (cols[iCat] || '').trim();
      const name = (cols[iName] || '').trim();
      const entryUrl = normalizeEntryUrl(cols[iUrl]);
      if (!category || !name || !entryUrl) continue;
      const order = iOrder >= 0 ? Number(cols[iOrder]) : i;
      apps.push({
        category,
        name,
        entryUrl,
        order: Number.isFinite(order) ? order : i,
        hidden: iHidden >= 0 ? parseHidden(cols[iHidden]) : false,
      });
    }
    return apps;
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

  function loadApp(app) {
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
    menuRendered = true;
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
        img.src = iconPathFor(app.entryUrl);
        img.addEventListener('error', () => img.classList.add('missing'));

        const span = document.createElement('span');
        span.textContent = app.name;

        btn.append(img, span);
        btn.addEventListener('click', () => loadApp(app));
        menu.appendChild(btn);
      }
    }
  }

  catBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !menu.classList.contains('open');
    if (open && usingFallback && !csvInFlight) loadApps(); // still on the built-in list: try again
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

  /** Fetch + parse hub-apps.csv (fresh copy, with a timeout). Throws on any failure. */
  async function fetchApps() {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), CSV_TIMEOUT_MS) : 0;
    try {
      const res = await fetch(CSV_URL + '?t=' + Date.now(), {
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const parsed = parseCsv(await res.text());
      if (!parsed.length) throw new Error('empty or unparsable CSV');
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Load the menu from the CSV; on failure show the built-in list and retry. */
  async function loadApps() {
    clearTimeout(csvRetryTimer);
    csvInFlight = true;
    try {
      const apps = await fetchApps();
      usingFallback = false;
      renderMenu(apps);
    } catch (err) {
      const more = csvAttempt < CSV_RETRY_MS.length;
      console.warn('hub: could not load ' + CSV_URL + ' (' + ((err && err.message) || err) + ')' +
        (more ? ', retrying' : '') + '; showing the built-in app list');
      if (!menuRendered || usingFallback) {
        usingFallback = true;
        renderMenu(FALLBACK_APPS);
      }
      if (more) csvRetryTimer = setTimeout(loadApps, CSV_RETRY_MS[csvAttempt++]);
    } finally {
      csvInFlight = false;
    }
  }

  window.addEventListener('online', () => { if (usingFallback && !csvInFlight) loadApps(); });

  window.__hubFocusFrame = focusFrame;
  loadApps();
})();
