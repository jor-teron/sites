/**
 * sites hub — loads WebApps from hub-apps.csv into the iframe.
 *
 * CSV: CATEGORY,NAME,ENTRY_URL,ORDER,HIDDEN
 * ENTRY_URL can be either:
 *   - a folder:  tv/  or  games/browser-fps/   (served via its index.html)
 *   - a file:    tools/calculator.html          (used exactly as written)
 * Icons are derived, never listed in the CSV:
 *   - folder xxx/            -> xxx/xxx_icon.png
 *   - file   dir/name.html   -> dir/name_icon.png
 */
(function () {
  const HEADER_DEFAULT = 'Main';
  const catBtn = document.getElementById('cat-btn');
  const catLabel = document.getElementById('cat-label');
  const menu = document.getElementById('menu');
  const frame = document.getElementById('app-frame');
  const empty = document.getElementById('empty');

  const FALLBACK_APPS = [
    { category: 'Tools', name: 'Nei Dict', entryUrl: 'nei-dict/', order: 10, hidden: false },
    { category: 'Tools', name: 'MS Word Diff', entryUrl: 'msword_diff/', order: 20, hidden: false },
    { category: 'Tools', name: 'Calculator', entryUrl: 'tools/calculator.html', order: 30, hidden: false },
    { category: 'Desktop', name: 'WebDesk', entryUrl: 'webdesk/', order: 50, hidden: false },
    { category: 'Media', name: 'Phone', entryUrl: 'phone/', order: 60, hidden: false },
    { category: 'Games', name: 'Browser FPS', entryUrl: 'games/browser-fps/', order: 90, hidden: false },
    { category: 'Media', name: 'TV', entryUrl: 'tv/', order: 110, hidden: false },
  ];

  /** True when ENTRY_URL points at a page file rather than a folder. */
  function isFileUrl(url) {
    const path = url.split(/[?#]/)[0];
    return /\.html?$/i.test(path);
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
      // tools/calculator.html -> tools/calculator_icon.png
      return path.replace(/\.html?$/i, '_icon.png');
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

  function loadApp(app) {
    frame.src = app.entryUrl;
    empty.classList.add('hidden');
    setOpen(false);
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
    setOpen(!menu.classList.contains('open'));
  });
  document.addEventListener('click', () => setOpen(false));
  menu.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });

  // Hide scrollbars inside same-origin apps.
  frame.addEventListener('load', () => {
    try {
      const doc = frame.contentDocument;
      if (doc && doc.documentElement) {
        doc.documentElement.style.overflow = 'hidden';
        if (doc.body) doc.body.style.overflow = 'hidden';
      }
    } catch (_) { /* cross-origin: ignore */ }
  });

  async function boot() {
    let apps = FALLBACK_APPS;
    try {
      const res = await fetch('hub-apps.csv', { cache: 'no-store' });
      if (res.ok) {
        const parsed = parseCsv(await res.text());
        if (parsed.length) apps = parsed;
      }
    } catch (_) { /* file:// or offline: use fallback */ }
    renderMenu(apps);
  }

  boot();
})();
