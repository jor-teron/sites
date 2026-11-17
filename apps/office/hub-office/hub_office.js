/* Hub Office Suite Start Center — hub_office.js */
(function (root) {
  'use strict';

  const SUITES = [
    {
      id: 'writer',
      name: 'Writer',
      tagline: 'Word Processor & Documents',
      desc: 'Full-featured word processor with A4 page layout, rich typography, tables, and native .how file support.',
      icon: '../writer/writer_icon.png',
      url: 'apps/office/writer/',
      formats: ['.how', '.docx', '.odt', '.txt', '.pdf'],
      templates: [
        { label: 'Blank Document', hash: '' },
        { label: 'Meeting Notes', hash: 'template=notes' },
        { label: 'Project Proposal', hash: 'template=proposal' },
        { label: 'Business Letter', hash: 'template=letter' }
      ]
    },
    {
      id: 'spreadsheet',
      name: 'Spreadsheet',
      tagline: 'Calculations & Analysis',
      desc: 'Formulas, multi-sheet calculation, cell styling, CSV/XLSX import and export with native .hos files.',
      icon: '../spreadsheet/spreadsheet_icon.png',
      url: 'apps/office/spreadsheet/',
      formats: ['.hos', '.xlsx', '.csv', '.tsv'],
      templates: [
        { label: 'Blank Workbook', hash: '' },
        { label: 'Monthly Budget', hash: 'template=budget' },
        { label: 'Invoice Sheet', hash: 'template=invoice' },
        { label: 'Expense Tracker', hash: 'template=expenses' }
      ]
    },
    {
      id: 'slides',
      name: 'Slides',
      tagline: 'Presentations & Slide Decks',
      desc: 'Create 16:9 slide decks with rich formatting, full-screen presentation mode, and .hslides export.',
      icon: '../slides/slides_icon.png',
      url: 'apps/office/slides/',
      formats: ['.hslides', '.pptx'],
      templates: [
        { label: 'Blank Presentation', hash: '' },
        { label: 'Pitch Deck', hash: 'template=pitch' },
        { label: 'Project Review', hash: 'template=review' }
      ]
    },
    {
      id: 'base',
      name: 'Base',
      tagline: 'Relational Database',
      desc: 'Structured database application: tables, forms, and queries with relationships like Microsoft Access.',
      icon: '../base/base_icon.png',
      url: 'apps/office/base/',
      formats: ['Tables', 'Forms', 'Queries'],
      templates: [
        { label: 'Blank Database', hash: '' },
        { label: 'Contacts Database', hash: 'sample=contacts' },
        { label: 'Inventory System', hash: 'sample=inventory' }
      ]
    },
    {
      id: 'tables',
      name: 'Tables',
      tagline: 'Structured Data Grid',
      desc: 'Lightweight spreadsheet-style database with typed columns, sorting, filtering, and native .hot files.',
      icon: '../tables/tables_icon.png',
      url: 'apps/office/tables/',
      formats: ['.hot', '.csv'],
      templates: [
        { label: 'Blank Table', hash: '' },
        { label: 'Task Tracker', hash: 'template=tasks' },
        { label: 'Product Catalog', hash: 'template=products' }
      ]
    }
  ];

  const EXT_MAP = {
    how: 'writer',
    docx: 'writer',
    odt: 'writer',
    txt: 'writer',
    md: 'writer',
    markdown: 'writer',
    hos: 'spreadsheet',
    xlsx: 'spreadsheet',
    xls: 'spreadsheet',
    csv: 'spreadsheet',
    tsv: 'spreadsheet',
    hslides: 'slides',
    pptx: 'slides',
    ppt: 'slides',
    hot: 'tables',
    db: 'base',
    sqlite: 'base',
    base: 'base'
  };

  const RECENT_KEY = 'sites-hub.recent-office-docs';

  // Launcher helper: inside Hub OS uses window.parent.__hubOpenApp or postMessage; standalone opens tab/window
  function openApp(appId, options) {
    options = options || {};
    const app = SUITES.find((s) => s.id === appId);
    if (!app) return;
    const hash = options.hash ? String(options.hash).replace(/^#/, '') : '';
    const fullUrl = app.url + (hash ? '#' + hash : '');
    const absUrl = new URL('../../' + fullUrl, location.href).href;

    try {
      const p = window.parent;
      if (p && p !== window && typeof p.__hubOpenApp === 'function') {
        p.__hubOpenApp(app.url, { hash: hash, newInstance: true });
        return;
      }
    } catch (_) {}

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'hub-open-app',
          url: absUrl,
          name: app.name,
          newInstance: true
        }, location.origin === 'null' ? '*' : location.origin);
        return;
      }
    } catch (_) {}

    // Standalone fallback
    window.open(absUrl, '_blank', 'noopener');
  }

  // File extension extractor
  function getExt(filename) {
    const m = /\.([^./\\]+)$/.exec(String(filename || ''));
    return m ? m[1].toLowerCase() : '';
  }

  // Route file to corresponding suite app
  function routeFile(file) {
    if (!file) return;
    const ext = getExt(file.name);
    const appId = EXT_MAP[ext];
    if (!appId) {
      if (window.OfficeNotify) {
        window.OfficeNotify.show('Unrecognized office file format: .' + ext);
      } else {
        alert('Unrecognized office file format: .' + ext);
      }
      return;
    }

    const app = SUITES.find((s) => s.id === appId);
    trackRecent({
      name: file.name,
      appId: appId,
      time: Date.now(),
      size: file.size
    });

    if (window.OfficeNotify) {
      window.OfficeNotify.show('Opening ' + file.name + ' in ' + app.name + '…');
    }

    // Launch app
    openApp(appId, { hash: 'file=' + encodeURIComponent(file.name) });
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
    const D = window.FsDrives;
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
          const ext = getExt(name);
          const appId = EXT_MAP[ext];
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

  // Format relative time
  function formatTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    if (m < 2) return 'Just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    const d = Math.floor(h / 24);
    if (d < 7) return d + 'd ago';
    return new Date(ts).toLocaleDateString();
  }

  // Format file size
  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  // UI rendering
  let currentFilter = 'all';
  let searchQuery = '';

  function renderSuites() {
    const grid = document.getElementById('suites-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const filtered = SUITES.filter((app) => {
      if (currentFilter !== 'all' && currentFilter !== 'recent' && currentFilter !== app.id) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = app.name.toLowerCase().includes(q);
        const matchesTag = app.tagline.toLowerCase().includes(q);
        const matchesDesc = app.desc.toLowerCase().includes(q);
        const matchesFmt = app.formats.some((f) => f.toLowerCase().includes(q));
        if (!matchesName && !matchesTag && !matchesDesc && !matchesFmt) return false;
      }
      return true;
    });

    if (currentFilter === 'recent') {
      document.getElementById('section-suites').style.display = 'none';
      return;
    } else {
      document.getElementById('section-suites').style.display = '';
    }

    filtered.forEach((app) => {
      const card = document.createElement('div');
      card.className = 'ho-card';
      card.dataset.id = app.id;

      // Header
      const header = document.createElement('div');
      header.className = 'ho-card-header';

      const icon = document.createElement('img');
      icon.className = 'ho-card-icon';
      icon.src = app.icon;
      icon.alt = app.name;
      icon.onerror = () => { icon.style.display = 'none'; };

      const info = document.createElement('div');
      info.className = 'ho-card-info';

      const name = document.createElement('span');
      name.className = 'ho-card-name';
      name.textContent = app.name;

      const tag = document.createElement('span');
      tag.className = 'ho-card-tag';
      tag.textContent = app.tagline;

      info.append(name, tag);
      header.append(icon, info);

      // Description
      const desc = document.createElement('p');
      desc.className = 'ho-card-desc';
      desc.textContent = app.desc;

      // Formats
      const fmts = document.createElement('div');
      fmts.className = 'ho-card-formats';
      app.formats.forEach((f) => {
        const b = document.createElement('span');
        b.className = 'ho-fmt-badge';
        b.textContent = f;
        fmts.appendChild(b);
      });

      // Actions
      const actions = document.createElement('div');
      actions.className = 'ho-card-actions';

      const btnNew = document.createElement('button');
      btnNew.className = 'ho-btn-new';
      btnNew.innerHTML = '<span>➕</span> <span>New ' + (app.id === 'spreadsheet' ? 'Sheet' : app.name) + '</span>';
      btnNew.addEventListener('click', () => openApp(app.id));

      const btnTpl = document.createElement('button');
      btnTpl.className = 'ho-btn-tpl';
      btnTpl.innerHTML = '<span>▾</span>';
      btnTpl.title = 'Templates & Starters';

      const tplMenu = document.createElement('div');
      tplMenu.className = 'ho-tpl-menu';
      tplMenu.hidden = true;

      app.templates.forEach((tpl) => {
        const item = document.createElement('button');
        item.className = 'ho-tpl-item';
        item.textContent = tpl.label;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          tplMenu.hidden = true;
          openApp(app.id, { hash: tpl.hash });
        });
        tplMenu.appendChild(item);
      });

      btnTpl.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close other menus
        document.querySelectorAll('.ho-tpl-menu').forEach((m) => { if (m !== tplMenu) m.hidden = true; });
        tplMenu.hidden = !tplMenu.hidden;
      });

      actions.append(btnNew, btnTpl, tplMenu);
      card.append(header, desc, fmts, actions);
      grid.appendChild(card);
    });
  }

  async function renderRecents() {
    const listEl = document.getElementById('recent-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const localRecents = getLocalRecents();
    const driveRecents = await scanHubDocuments();

    // Merge and deduplicate by filename
    const map = new Map();
    driveRecents.forEach((d) => map.set(d.name, d));
    localRecents.forEach((l) => { if (!map.has(l.name)) map.set(l.name, l); });

    let merged = Array.from(map.values()).sort((a, b) => (b.time || 0) - (a.time || 0));

    if (currentFilter !== 'all' && currentFilter !== 'recent') {
      merged = merged.filter((item) => item.appId === currentFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      merged = merged.filter((item) => item.name.toLowerCase().includes(q));
    }

    if (!merged.length) {
      const empty = document.createElement('div');
      empty.className = 'ho-empty-recent';
      empty.textContent = 'No recent documents found. Create a new document or drop a file to start.';
      listEl.appendChild(empty);
      return;
    }

    merged.forEach((item) => {
      const app = SUITES.find((s) => s.id === item.appId) || { name: 'Office', icon: 'hub_office_icon.png' };
      const row = document.createElement('div');
      row.className = 'ho-recent-row';
      row.tabIndex = 0;
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', 'Open ' + item.name + ' in ' + app.name);

      const left = document.createElement('div');
      left.className = 'ho-recent-left';

      const icon = document.createElement('span');
      icon.className = 'ho-recent-icon';
      icon.textContent = item.appId === 'writer' ? '📝' :
                         item.appId === 'spreadsheet' ? '📊' :
                         item.appId === 'slides' ? '📽️' :
                         item.appId === 'base' ? '🗄️' : '📋';

      const info = document.createElement('div');
      info.className = 'ho-recent-info';

      const name = document.createElement('span');
      name.className = 'ho-recent-name';
      name.textContent = item.name;

      const sub = document.createElement('span');
      sub.className = 'ho-recent-sub';
      const parts = [];
      if (item.time) parts.push(formatTime(item.time));
      if (item.size) parts.push(formatSize(item.size));
      sub.textContent = parts.join(' · ');

      info.append(name, sub);
      left.append(icon, info);

      const badge = document.createElement('span');
      badge.className = 'ho-recent-badge';
      badge.textContent = app.name;

      row.append(left, badge);

      const launch = () => {
        if (item.driveRef && window.FsRef && window.FsRef.openIn) {
          window.FsRef.openIn(app.url, item.driveRef);
        } else {
          openApp(item.appId, { hash: 'file=' + encodeURIComponent(item.name) });
        }
      };

      row.addEventListener('click', launch);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); launch(); }
      });

      listEl.appendChild(row);
    });
  }

  function initDropzone() {
    const dz = document.getElementById('ho-dropzone');
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

    if (dz) {
      dz.addEventListener('click', () => { if (input) input.click(); });

      const has = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
      let depth = 0;

      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('dragenter', (e) => {
          if (!has(e)) return;
          e.preventDefault();
          depth++;
          dz.classList.add('dragging');
        });

        window.addEventListener('dragover', (e) => {
          if (has(e)) e.preventDefault();
        });

        window.addEventListener('dragleave', () => {
          if (--depth <= 0) {
            depth = 0;
            dz.classList.remove('dragging');
          }
        });

        window.addEventListener('drop', (e) => {
          if (!has(e)) return;
          e.preventDefault();
          depth = 0;
          dz.classList.remove('dragging');
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            routeFile(e.dataTransfer.files[0]);
          }
        });
      }
    }
  }

  function initNav() {
    const navItems = document.querySelectorAll('.ho-nav-item');
    navItems.forEach((btn) => {
      btn.addEventListener('click', () => {
        navItems.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter || 'all';
        renderSuites();
        renderRecents();
      });
    });
  }

  function initSearch() {
    const searchInput = document.getElementById('ho-search');
    if (!searchInput) return;
    searchInput.addEventListener('input', () => {
      searchQuery = String(searchInput.value || '').trim();
      renderSuites();
      renderRecents();
    });
  }

  function initShortcuts() {
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && !e.altKey && (e.key === 'o' || e.key === 'O')) {
          e.preventDefault();
          const input = document.getElementById('file-input');
          if (input) input.click();
        }
      });
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('click', () => {
        document.querySelectorAll('.ho-tpl-menu').forEach((m) => { m.hidden = true; });
      });
    }

    const btnRefresh = document.getElementById('btn-refresh-recent');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => renderRecents());
    }
  }

  function init() {
    initDropzone();
    initNav();
    initSearch();
    initShortcuts();
    renderSuites();
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
    SUITES,
    EXT_MAP,
    openApp,
    routeFile,
    getExt,
    formatTime,
    formatSize
  };

})(typeof window !== 'undefined' ? window : this);
