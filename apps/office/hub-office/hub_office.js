/* Hub Office Suite Start Center — hub_office.js */
/* HO6: minimalist Start Page. Suite cards, sidebar filters, search and
   the drop-zone Supported: line were removed (before HO6). Tabbed
   document iframes are unchanged. */
(function (root) {
  'use strict';

  /* (before HO6) const was implicit; Start Center was unversioned as HO-SC2 in HTML only. */
  const VERSION = 'HO6';

  const SUITES = [
    {
      id: 'writer',
      name: 'Writer',
      /* (before HO6) tagline, desc, formats, btnLabel used by suite cards */
      icon: '../writer/writer_icon.png',
      url: '../writer/',
      rootUrl: 'apps/office/writer/'
    },
    {
      id: 'spreadsheet',
      name: 'Spreadsheet',
      icon: '../spreadsheet/spreadsheet_icon.png',
      url: '../spreadsheet/',
      rootUrl: 'apps/office/spreadsheet/'
    },
    {
      id: 'slides',
      name: 'Presentation',
      icon: '../slides/slides_icon.png',
      url: '../slides/',
      rootUrl: 'apps/office/slides/'
    },
    {
      id: 'base',
      name: 'Base',
      icon: '../base/base_icon.png',
      url: '../base/',
      rootUrl: 'apps/office/base/'
    },
    {
      id: 'tables',
      name: 'Tables',
      icon: '../tables/tables_icon.png',
      url: '../tables/',
      rootUrl: 'apps/office/tables/'
    }
  ];

  /* Truthful open / save / export lists, checked against each app's
     file-input accept lists and File-menu export items in HO6.
     Corrections from the planned lists:
       Writer open dropped .txt and .md (no file picker or drop handler).
       Spreadsheet open dropped .tsv (accept is .xlsx .xls .ods .csv only).
       Presentation export added .pdf (File → Export PDF is in the menu).
       Base open added .tsv .txt .xls .sqlite3 (in accept + base-files.js open()).
       Tables export is .csv. */
  const FORMAT_TABLE = [
    { id: 'writer', open: ['.how', '.docx', '.odt'], save: ['.how'], export: ['.docx', '.odt', '.pdf'] },
    { id: 'spreadsheet', open: ['.hos', '.xlsx', '.xls', '.ods', '.csv'], save: ['.hos'], export: ['.xlsx', '.ods', '.csv'] },
    { id: 'slides', open: ['.hop', '.hslides', '.pptx', '.odp'], save: ['.hop'], export: ['.pptx', '.odp', '.png', '.pdf'] },
    { id: 'base', open: ['.hob', '.hbase', '.odb', '.csv', '.tsv', '.txt', '.xlsx', '.xls', '.json', '.sqlite', '.sqlite3', '.db'], save: ['.hob'], export: ['.odb', '.xlsx', '.csv'] },
    { id: 'tables', open: ['.hot', '.csv'], save: ['.hot'], export: ['.csv'] }
  ];

  const EXT_MAP = {
    how: 'writer',
    docx: 'writer',
    odt: 'writer',
    /* (before HO6) txt: 'writer', md: 'writer', markdown: 'writer' */
    hos: 'spreadsheet',
    xlsx: 'spreadsheet',
    xls: 'spreadsheet',
    ods: 'spreadsheet',
    csv: 'spreadsheet',
    /* (before HO6) tsv: 'spreadsheet' */
    hop: 'slides',
    hslides: 'slides',
    pptx: 'slides',
    odp: 'slides',
    /* (before HO6) ppt: 'slides' — Presentation does not open .ppt */
    hot: 'tables',
    hob: 'base',
    hbase: 'base',
    odb: 'base',
    db: 'base',
    sqlite: 'base',
    sqlite3: 'base',
    json: 'base',
    tsv: 'base',
    txt: 'base'
    /* (before HO6) base: 'base' — Base has no .base file picker */
  };

  const RECENT_KEY = 'sites-hub.recent-office-docs';
  const RECENT_LIMIT = 8;

  // State: Tab tracking
  let tabSeq = 0;
  const appCounters = Object.create(null);
  const openTabs = [
    { id: 'start', title: 'Start Page', type: 'start', icon: '🏠' }
  ];
  let activeTabId = 'start';

  function getExt(filename) {
    const m = /\.([^./\\]+)$/.exec(String(filename || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function routeByFilename(filename) {
    const ext = getExt(filename);
    return (ext && EXT_MAP[ext]) || null;
  }

  function openAcceptList() {
    const seen = Object.create(null);
    const out = [];
    FORMAT_TABLE.forEach((row) => {
      (row.open || []).forEach((fmt) => {
        const ext = fmt.charAt(0) === '.' ? fmt : ('.' + fmt);
        if (!seen[ext]) {
          seen[ext] = true;
          out.push(ext);
        }
      });
    });
    return out;
  }

  function getSuite(appId) {
    return SUITES.find((s) => s.id === appId) || null;
  }

  function getAppIcon(appId) {
    switch (appId) {
      case 'writer': return '📝';
      case 'spreadsheet': return '📊';
      case 'slides': return '📽️';
      case 'base': return '🗄️';
      case 'tables': return '📋';
      default: return '📄';
    }
  }

  function notify(message) {
    if (typeof window === 'undefined') return;
    if (window.OfficeNotify && typeof window.OfficeNotify.show === 'function') {
      window.OfficeNotify.show(message);
    } else if (window.OfficeDialog && typeof window.OfficeDialog.alert === 'function') {
      window.OfficeDialog.alert({ message: message });
    } else {
      console.warn(message);
    }
  }

  // Switch between tabs
  function switchTab(tabId) {
    if (!openTabs.some((t) => t.id === tabId)) return;
    activeTabId = tabId;

    if (typeof document !== 'undefined') {
      const allTabs = document.querySelectorAll('.ho-tab');
      allTabs.forEach((tab) => {
        const match = tab.dataset.tabId === tabId;
        tab.classList.toggle('active', match);
        tab.setAttribute('aria-selected', match ? 'true' : 'false');
      });

      const allViews = document.querySelectorAll('.ho-view');
      allViews.forEach((view) => {
        const match = view.id === 'view-' + tabId;
        view.classList.toggle('active', match);
      });
    }
  }

  // Close an active or background document tab
  function closeTab(tabId) {
    if (tabId === 'start') return; // Start page is persistent

    const idx = openTabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;

    openTabs.splice(idx, 1);

    if (typeof document !== 'undefined') {
      const tabEl = document.getElementById('tab-btn-' + tabId);
      if (tabEl) tabEl.remove();

      const viewEl = document.getElementById('view-' + tabId);
      if (viewEl) viewEl.remove();
    }

    // If closing the active tab, switch to adjacent or fallback to start
    if (activeTabId === tabId) {
      const nextTab = openTabs[Math.max(0, idx - 1)] || openTabs[0];
      switchTab(nextTab.id);
    }
  }

  // Create and mount a new document tab running the suite app
  function createDocTab(appId, options) {
    options = options || {};
    const app = getSuite(appId);
    if (!app) return null;

    tabSeq++;
    const tabId = 'doc-' + tabSeq;
    appCounters[appId] = (appCounters[appId] || 0) + 1;

    const title = options.title || (app.name + ' ' + appCounters[appId]);
    const hash = options.hash ? ('#' + String(options.hash).replace(/^#/, '')) : '';
    const icon = getAppIcon(appId);

    const tabRecord = {
      id: tabId,
      appId: appId,
      title: title,
      icon: icon,
      url: app.url + hash,
      type: 'doc'
    };
    openTabs.push(tabRecord);

    if (typeof document !== 'undefined') {
      const tabsList = document.getElementById('ho-tabs-list');
      const viewsContainer = document.getElementById('ho-views-container');

      if (tabsList && viewsContainer) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ho-tab';
        btn.id = 'tab-btn-' + tabId;
        btn.dataset.tabId = tabId;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', 'false');

        const ico = document.createElement('span');
        ico.className = 'ho-tab-icon';
        ico.textContent = icon;

        const lbl = document.createElement('span');
        lbl.className = 'ho-tab-title';
        lbl.textContent = title;
        lbl.title = title;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'ho-tab-close';
        closeBtn.setAttribute('aria-label', 'Close ' + title);
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeTab(tabId);
        });

        btn.append(ico, lbl, closeBtn);
        btn.addEventListener('click', () => switchTab(tabId));
        tabsList.appendChild(btn);

        const view = document.createElement('div');
        view.className = 'ho-view';
        view.id = 'view-' + tabId;
        view.setAttribute('role', 'tabpanel');
        view.setAttribute('aria-labelledby', 'tab-btn-' + tabId);

        const iframe = document.createElement('iframe');
        iframe.className = 'ho-doc-frame';
        iframe.title = title;
        iframe.src = app.url + hash;

        view.appendChild(iframe);
        viewsContainer.appendChild(view);
      }
    }

    switchTab(tabId);
    return tabRecord;
  }

  function findDriveRef(filename) {
    const D = typeof window !== 'undefined' ? window.FsDrives : null;
    if (!D || typeof D.handle !== 'function' || !filename) return Promise.resolve(null);
    return D.handle('local').then((root) => {
      if (!root) return null;
      return root.getDirectoryHandle('Documents').then((docDir) => {
        return docDir.getFileHandle(filename).then(() => {
          return { drive: 'local', path: 'Documents', name: filename };
        });
      });
    }).catch(() => null);
  }

  function hashForRef(ref) {
    if (!ref) return '';
    if (typeof window !== 'undefined' && window.FsRef && typeof window.FsRef.hash === 'function') {
      return window.FsRef.hash(ref);
    }
    const p = String(ref.path || '').replace(/^\/+|\/+$/g, '');
    return 'drive=' + encodeURIComponent(ref.drive) + (p ? '&path=' + encodeURIComponent(p) : '') + '&file=' + encodeURIComponent(ref.name);
  }

  function openInSuite(appId, title, driveRef, showOpenNote) {
    const app = getSuite(appId);
    const hash = driveRef ? hashForRef(driveRef) : '';
    createDocTab(appId, { title: title, hash: hash });
    if (showOpenNote && !driveRef) {
      const name = app ? app.name : 'the app';
      notify(name + ' is open. Use File → Open to choose ' + title + '.');
    }
  }

  // Open file routing: Hub Documents use #drive=&file=; a dropped File
  // on a standalone page cannot be handed to the iframe, so the suite
  // opens blank with a short in-app note.
  function routeFile(file, driveRef) {
    if (!file) return null;
    const name = file.name || '';
    const appId = routeByFilename(name);
    if (!appId) {
      const ext = getExt(name);
      notify(ext ? ('Hub Office cannot open .' + ext + ' files.') : 'Hub Office cannot open that file.');
      return null;
    }

    trackRecent({
      name: name,
      appId: appId,
      time: Date.now(),
      size: file.size,
      driveRef: driveRef || undefined
    });

    if (driveRef) {
      openInSuite(appId, name, driveRef, false);
      return appId;
    }

    findDriveRef(name).then((found) => {
      if (found) openInSuite(appId, name, found, false);
      else openInSuite(appId, name, null, true);
    });
    return appId;
  }

  function openRecent(item) {
    if (!item || !item.name) return;
    const appId = item.appId || routeByFilename(item.name);
    if (!appId) {
      notify('Hub Office cannot open ' + item.name + '.');
      return;
    }
    if (item.driveRef) {
      openInSuite(appId, item.name, item.driveRef, false);
      return;
    }
    findDriveRef(item.name).then((found) => {
      if (found) openInSuite(appId, item.name, found, false);
      else openInSuite(appId, item.name, null, true);
    });
  }

  // Recent files tracking
  function getLocalRecents() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function trackRecent(entry) {
    try {
      let list = getLocalRecents();
      list = list.filter((item) => item.name !== entry.name);
      list.unshift(entry);
      if (list.length > 25) list = list.slice(0, 25);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
      renderRecents();
    } catch (_) {}
  }

  // Scan Hub Local Drive Documents folder if FsDrives is supported
  async function scanHubDocuments() {
    const D = typeof window !== 'undefined' ? window.FsDrives : null;
    if (!D || !D.handle) return [];
    try {
      const root = await D.handle('local');
      if (!root) return [];
      let docDir = null;
      try {
        docDir = await root.getDirectoryHandle('Documents');
      } catch (_) {
        return [];
      }
      if (!docDir) return [];

      const found = [];
      for await (const [name, handle] of docDir.entries()) {
        if (handle.kind === 'file') {
          const appId = routeByFilename(name);
          if (appId) {
            const file = await handle.getFile();
            found.push({
              name: name,
              appId: appId,
              time: file.lastModified || Date.now(),
              size: file.size,
              driveRef: { drive: 'local', path: 'Documents', name: name }
            });
          }
        }
      }
      return found;
    } catch (_) {
      return [];
    }
  }

  function formatTime(ts, now) {
    if (!ts) return '';
    const diff = (now || Date.now()) - ts;
    const m = Math.floor(diff / 60000);
    if (m < 2) return 'Just now';
    if (m < 60) return m + ' m ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' h ago';
    const d = Math.floor(h / 24);
    if (d < 7) return d + ' d ago';
    return new Date(ts).toLocaleDateString();
  }

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function renderNewRow() {
    const row = document.getElementById('new-row');
    if (!row) return;
    row.innerHTML = '';
    SUITES.forEach((app) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ho-new-app';
      btn.dataset.id = app.id;
      btn.setAttribute('aria-label', 'New ' + app.name + ' document');

      const icon = document.createElement('img');
      icon.className = 'ho-new-icon';
      icon.src = app.icon;
      icon.alt = '';
      icon.onerror = () => { icon.style.display = 'none'; };

      const label = document.createElement('span');
      label.textContent = app.name;

      btn.append(icon, label);
      btn.addEventListener('click', () => createDocTab(app.id));
      row.appendChild(btn);
    });
  }

  async function renderRecents() {
    const listEl = document.getElementById('recent-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const localRecents = getLocalRecents();
    const driveRecents = await scanHubDocuments();

    const map = new Map();
    driveRecents.forEach((d) => map.set(d.name, d));
    localRecents.forEach((l) => { if (!map.has(l.name)) map.set(l.name, l); });

    const merged = Array.from(map.values())
      .sort((a, b) => (b.time || 0) - (a.time || 0))
      .slice(0, RECENT_LIMIT);

    if (!merged.length) {
      const empty = document.createElement('div');
      empty.className = 'ho-empty-recent';
      empty.textContent = 'No recent files.';
      listEl.appendChild(empty);
      return;
    }

    merged.forEach((item) => {
      const app = getSuite(item.appId) || { name: 'Office', icon: 'hub_office_icon.png' };
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ho-recent-row';
      row.setAttribute('aria-label', 'Open ' + item.name);

      const icon = document.createElement('img');
      icon.className = 'ho-recent-icon';
      icon.src = app.icon;
      icon.alt = '';
      icon.onerror = () => {
        const span = document.createElement('span');
        span.className = 'ho-recent-icon';
        span.textContent = getAppIcon(item.appId);
        icon.replaceWith(span);
      };

      const name = document.createElement('span');
      name.className = 'ho-recent-name';
      name.textContent = item.name;

      const time = document.createElement('span');
      time.className = 'ho-recent-time';
      time.textContent = item.time ? formatTime(item.time) : '';

      row.append(icon, name, time);
      row.addEventListener('click', () => openRecent(item));
      listEl.appendChild(row);
    });
  }

  function renderFormatsPanel() {
    const body = document.getElementById('formats-body');
    if (!body) return;
    body.innerHTML = '';
    FORMAT_TABLE.forEach((row) => {
      const app = getSuite(row.id);
      const block = document.createElement('div');
      block.className = 'ho-formats-suite';

      const title = document.createElement('div');
      title.className = 'ho-formats-suite-name';
      if (app && app.icon) {
        const img = document.createElement('img');
        img.src = app.icon;
        img.alt = '';
        title.appendChild(img);
      }
      const nm = document.createElement('span');
      nm.textContent = app ? app.name : row.id;
      title.appendChild(nm);

      function line(label, list) {
        const p = document.createElement('div');
        p.className = 'ho-formats-row';
        const strong = document.createElement('strong');
        strong.textContent = label + ': ';
        p.appendChild(strong);
        p.appendChild(document.createTextNode((list || []).join('  ')));
        return p;
      }

      block.append(title, line('Open', row.open), line('Save', row.save), line('Export', row.export));
      body.appendChild(block);
    });
  }

  function setFormatsOpen(open) {
    const backdrop = document.getElementById('formats-backdrop');
    if (!backdrop) return;
    backdrop.hidden = !open;
    if (open) {
      const closeBtn = document.getElementById('btn-formats-close');
      if (closeBtn) closeBtn.focus();
    }
  }

  function initFormatsPanel() {
    const btn = document.getElementById('btn-formats');
    const closeBtn = document.getElementById('btn-formats-close');
    const backdrop = document.getElementById('formats-backdrop');
    renderFormatsPanel();
    if (btn) btn.addEventListener('click', () => setFormatsOpen(true));
    if (closeBtn) closeBtn.addEventListener('click', () => setFormatsOpen(false));
    if (backdrop) {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) setFormatsOpen(false);
      });
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setFormatsOpen(false);
      });
    }
  }

  function initOpenFile() {
    const input = document.getElementById('file-input');
    const btnOpen = document.getElementById('btn-open-file');

    if (btnOpen && input) {
      btnOpen.addEventListener('click', () => input.click());
    }

    if (input) {
      input.addEventListener('change', () => {
        if (input.files && input.files[0]) {
          routeFile(input.files[0]);
          input.value = '';
        }
      });
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && !e.altKey && (e.key === 'o' || e.key === 'O')) {
          e.preventDefault();
          if (input) input.click();
        }
      });
    }
  }

  function initDropOverlay() {
    const overlay = document.getElementById('ho-drop-overlay');
    const has = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    let depth = 0;

    function showOverlay(on) {
      if (!overlay) return;
      overlay.hidden = !on;
    }

    function onStartPage() {
      return activeTabId === 'start';
    }

    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    window.addEventListener('dragenter', (e) => {
      if (!has(e) || !onStartPage()) return;
      e.preventDefault();
      depth++;
      showOverlay(true);
    });

    window.addEventListener('dragover', (e) => {
      if (!has(e) || !onStartPage()) return;
      e.preventDefault();
    });

    window.addEventListener('dragleave', () => {
      if (!onStartPage()) return;
      if (--depth <= 0) {
        depth = 0;
        showOverlay(false);
      }
    });

    window.addEventListener('drop', (e) => {
      if (!has(e) || !onStartPage()) {
        depth = 0;
        showOverlay(false);
        return;
      }
      e.preventDefault();
      depth = 0;
      showOverlay(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        routeFile(e.dataTransfer.files[0]);
      }
    });
  }

  function initShortcuts() {
    const btnStart = document.getElementById('tab-btn-start');
    if (btnStart) {
      btnStart.addEventListener('click', () => switchTab('start'));
    }

    const btnAddTab = document.getElementById('btn-add-tab');
    if (btnAddTab) {
      btnAddTab.addEventListener('click', () => createDocTab('writer'));
    }
  }

  function init() {
    initOpenFile();
    initDropOverlay();
    initFormatsPanel();
    initShortcuts();
    renderNewRow();
    renderRecents();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // Export for testing
  root.HubOffice = {
    VERSION,
    SUITES,
    FORMAT_TABLE,
    EXT_MAP,
    RECENT_LIMIT,
    openTabs,
    getActiveTabId: () => activeTabId,
    createDocTab,
    switchTab,
    closeTab,
    routeFile,
    routeByFilename,
    getExt,
    formatTime,
    formatSize,
    openAcceptList
  };

})(typeof window !== 'undefined' ? window : this);
