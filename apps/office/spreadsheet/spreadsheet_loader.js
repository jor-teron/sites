/*
 * spreadsheet_loader.js
 * SH58: lazy loader for non-core Spreadsheet modules and feature stylesheets
 * (DW26 pattern: script async=false + link tags, file://-safe and deduplicated).
 * Every entry point (ribbon, menus, keys, drag-drop, hash, formulas) awaits this loader.
 */
(function (root) {
  'use strict';

  var L = root.SHEET_LOADER || {};
  L.pending = L.pending || {};
  L.pendingCss = L.pendingCss || {};

  L.LAZY_MODULES = [
    '../shared/office-page.js',
    '../shared/office-colour.js',
    'spreadsheet_spellnumber.js?v=SH31',
    'spreadsheet_fx.js?v=SH58',
    'spreadsheet_page.js?v=SH58',
    'spreadsheet_charts.js?v=SH58',
    'spreadsheet_sort.js?v=SH58',
    'spreadsheet_data.js?v=SH58',
    'spreadsheet_lazy.js?v=SH47',
    'spreadsheet_xlsm.js?v=SH33',
    'spreadsheet_xlsx.js?v=SH58',
    'spreadsheet_saveformat.js?v=SH49'
  ];

  L.LAZY_CSS = [
    '../shared/office-settings.css',
    '../shared/office-colour.css',
    'spreadsheet_page.css?v=HO3'
  ];

  L.load = function load(src) {
    if (L.pending[src]) return L.pending[src];
    var doc = root.document;
    if (!doc || !doc.head) return Promise.resolve();
    L.pending[src] = new Promise(function (resolve, reject) {
      var s = doc.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        delete L.pending[src];
        reject(new Error('Could not load ' + src));
      };
      doc.head.appendChild(s);
    });
    return L.pending[src];
  };

  L.loadCss = function loadCss(href) {
    if (L.pendingCss[href]) return L.pendingCss[href];
    var doc = root.document;
    if (!doc || !doc.head) return Promise.resolve();
    if (doc.querySelector) {
      var existing = doc.querySelector('link[rel="stylesheet"][href="' + href + '"]');
      if (existing) {
        L.pendingCss[href] = Promise.resolve();
        return L.pendingCss[href];
      }
    }
    L.pendingCss[href] = new Promise(function (resolve, reject) {
      var link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = function () { resolve(); };
      link.onerror = function () {
        delete L.pendingCss[href];
        reject(new Error('Could not load ' + href));
      };
      doc.head.appendChild(link);
    });
    return L.pendingCss[href];
  };

  L.loadAll = function loadAll(list) {
    return Promise.all((list || []).map(function (src) { return L.load(src); }));
  };

  L.isWorkbookOrCsvName = function isWorkbookOrCsvName(name) {
    return /\.(xlsx|xlsm|xls|ods|csv)$/i.test(String(name || '').trim());
  };

  L.needsXlsxForHash = function needsXlsxForHash(hash) {
    var h = String(hash || '');
    if (!h) return false;
    try {
      if (root.FsRef && typeof root.FsRef.parse === 'function') {
        var ref = root.FsRef.parse(h);
        if (ref && ref.name && L.isWorkbookOrCsvName(ref.name)) return true;
      }
    } catch (e) {}
    return /(?:^|[#&])file=[^&]*\.(xlsx|xlsm|xls|ods|csv)(?:&|$)/i.test(h);
  };

  L.ensureXlsx = function ensureXlsx() {
    if (typeof root.importXlsxFile === 'function' && root.SHEET_SAVEFMT) return Promise.resolve();
    return L.loadAll([
      'spreadsheet_lazy.js?v=SH47',
      'spreadsheet_xlsm.js?v=SH33',
      'spreadsheet_xlsx.js?v=SH58',
      'spreadsheet_saveformat.js?v=SH49'
    ]).then(function () {
      if (root.SHEET_SAVEFMT && root.SHEET_SAVEFMT.install && root.SHEET_HOS) {
        root.SHEET_SAVEFMT.install(root.SHEET_HOS);
      }
      if (root.SHEET_EMPTY && root.SHEET_EMPTY.install) {
        root.SHEET_EMPTY.install(root);
      }
    });
  };

  L.ensureCharts = function ensureCharts() {
    if (typeof root.renderCharts === 'function') return Promise.resolve();
    return L.load('spreadsheet_charts.js?v=SH58');
  };

  L.ensureData = function ensureData() {
    if (typeof root.dataOpenFind === 'function' && typeof root.sortSelection === 'function') return Promise.resolve();
    return L.loadAll([
      'spreadsheet_sort.js?v=SH58',
      'spreadsheet_data.js?v=SH58'
    ]);
  };

  L.ensureFx = function ensureFx() {
    if (typeof root.fxOpenPicker === 'function') return Promise.resolve();
    return L.load('spreadsheet_fx.js?v=SH58');
  };

  L.ensureSpellnumber = function ensureSpellnumber() {
    if (root.SPELLNUMBER && typeof root.SPELLNUMBER.spell === 'function') return Promise.resolve();
    return L.load('spreadsheet_spellnumber.js?v=SH31');
  };

  L.ensurePage = function ensurePage() {
    var tasks = [L.loadCss('spreadsheet_page.css?v=HO3')];
    if (typeof root.initPageSetup !== 'function') {
      tasks.push(L.loadAll(['../shared/office-page.js', 'spreadsheet_page.js?v=SH58']).then(function () {
        if (typeof root.initPageSetup === 'function' && !root._sheetPageInited) {
          root.initPageSetup();
        }
      }));
    }
    return Promise.all(tasks);
  };

  L.ensureColour = function ensureColour() {
    var tasks = [L.loadCss('../shared/office-colour.css')];
    if (typeof root.OfficeColour === 'undefined') {
      tasks.push(L.load('../shared/office-colour.js'));
    }
    return Promise.all(tasks).then(function () {
      if (typeof root.wireColours === 'function') root.wireColours();
    });
  };

  L.ensureSettingsCss = function ensureSettingsCss() {
    return L.loadCss('../shared/office-settings.css');
  };

  function onBtnLazy(doc, id, fn) {
    var el = doc.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  L.bindLazy = function bindLazy() {
    var doc = root.document;
    if (!doc || L._bound) return;
    L._bound = true;

    /* Export XLSX / ODS */
    onBtnLazy(doc, 'btn-export-xlsx', function () {
      if (typeof root.exportXlsx === 'function') return;
      L.ensureXlsx().then(function () { if (typeof root.exportXlsx === 'function') root.exportXlsx(); });
    });
    onBtnLazy(doc, 'btn-export-ods', function () {
      if (typeof root.exportOds === 'function') return;
      L.ensureXlsx().then(function () { if (typeof root.exportOds === 'function') root.exportOds(); });
    });

    /* Charts */
    [['btn-chart-col', 'column'], ['btn-chart-bar', 'bar'], ['btn-chart-line', 'line'], ['btn-chart-pie', 'pie']].forEach(function (pair) {
      onBtnLazy(doc, pair[0], function () {
        if (typeof root.addChart === 'function') return;
        L.ensureCharts().then(function () { if (typeof root.addChart === 'function') root.addChart(pair[1]); });
      });
    });

    /* Sort & Data tools */
    onBtnLazy(doc, 'btn-sort-asc', function () {
      if (typeof root.sortSelection === 'function') return;
      L.ensureData().then(function () { if (typeof root.sortSelection === 'function') root.sortSelection(false); });
    });
    onBtnLazy(doc, 'btn-sort-desc', function () {
      if (typeof root.sortSelection === 'function') return;
      L.ensureData().then(function () { if (typeof root.sortSelection === 'function') root.sortSelection(true); });
    });
    [
      ['btn-find', 'dataOpenFind'],
      ['btn-filter', 'dataToggleFilter'],
      ['btn-filter-clear', 'dataClearFilter'],
      ['btn-sort-more', 'dataOpenSort'],
      ['btn-dups', 'dataOpenDups'],
      ['btn-valid', 'dataOpenValid']
    ].forEach(function (pair) {
      onBtnLazy(doc, pair[0], function () {
        if (typeof root[pair[1]] === 'function') return;
        L.ensureData().then(function () { if (typeof root[pair[1]] === 'function') root[pair[1]](); });
      });
    });
    var validArrow = doc.getElementById('data-valid-arrow');
    if (validArrow) {
      validArrow.addEventListener('click', function (ev) {
        if (typeof root.dataOpenValidList === 'function') return;
        ev.preventDefault();
        ev.stopPropagation();
        L.ensureData().then(function () { if (typeof root.dataOpenValidList === 'function') root.dataOpenValidList(); });
      });
    }
    doc.addEventListener('keydown', function (ev) {
      if (typeof root.dataOpenFind === 'function') return;
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      var k = String(ev.key || '').toLowerCase();
      if (k !== 'f' && k !== 'h') return;
      ev.preventDefault();
      L.ensureData().then(function () {
        if (typeof root.dataOpenFind !== 'function') return;
        root.dataOpenFind();
        if (k === 'h') {
          var r = doc.getElementById('data-find-r');
          if (r && r.focus) r.focus();
        }
      });
    });

    /* fx picker and formula hint */
    var fxBtn = doc.getElementById('btn-fx');
    if (fxBtn) {
      fxBtn.addEventListener('click', function (ev) {
        if (typeof root.fxOpenPicker === 'function') return;
        ev.preventDefault();
        var active = doc.activeElement;
        var saved = (active && active.id === 'formula-bar')
          ? active
          : ((root.inpGrid && root.inpGrid[root.selR] && root.inpGrid[root.selR][root.selC]) || doc.getElementById('formula-bar'));
        L.ensureFx().then(function () {
          if (root.FX_UI) root.FX_UI.input = saved;
          if (typeof root.fxOpenPicker === 'function') root.fxOpenPicker();
        });
      });
    }
    var fbar = doc.getElementById('formula-bar');
    if (fbar) {
      fbar.addEventListener('input', function () {
        if (typeof root.fxShowHint === 'function') return;
        if (fbar.value && fbar.value.charAt(0) === '=') {
          L.ensureFx().then(function () { if (typeof root.fxShowHint === 'function') root.fxShowHint(fbar); });
        }
      });
    }
    var wrap = doc.getElementById('sheet-wrap');
    if (wrap) {
      wrap.addEventListener('input', function (ev) {
        if (typeof root.fxShowHint === 'function') return;
        var t = ev.target;
        if (t && t.dataset && t.dataset.r != null && t.value && t.value.charAt(0) === '=') {
          L.ensureFx().then(function () {
            if (typeof root.fxBindInput === 'function') root.fxBindInput(t);
            if (typeof root.fxShowHint === 'function') root.fxShowHint(t);
          });
        }
      });
    }

    /* Page tab panel */
    var pagePanel = doc.getElementById('of-panel-page');
    if (pagePanel) {
      pagePanel.addEventListener('click', function (ev) {
        if (typeof root.initPageSetup === 'function') return;
        var btn = ev.target && ev.target.closest ? ev.target.closest('button') : null;
        if (!btn) return;
        L.ensurePage().then(function () {
          if (btn.id === 'page-print') {
            if (typeof root.printSheet === 'function') root.printSheet();
            return;
          }
          var d = btn.dataset;
          if (!d || typeof root.setPage !== 'function') return;
          if (d.pageOrientation) root.setPage({ orientation: d.pageOrientation });
          else if (d.pagePaper) root.setPage({ paper: d.pagePaper });
          else if (d.pageMargins === 'custom' && root.OfficePage && root.pageSetup) {
            root.OfficePage.customMarginsDialog(root.OfficePage.margins(root.pageSetup.margins, root.pageSetup.custom)).then(function (m) {
              if (m) root.setPage({ margins: 'custom', custom: m });
            });
          } else if (d.pageMargins) root.setPage({ margins: d.pageMargins });
          else if (d.pageToggle && root.pageSetup) {
            var c = {};
            c[d.pageToggle] = !root.pageSetup[d.pageToggle];
            root.setPage(c);
          }
        });
      });
    }

    /* Colour split buttons */
    [
      ['fill-colour-btn', 'fill', false],
      ['fill-colour-arrow', 'fill', true],
      ['text-colour-btn', 'text', false],
      ['text-colour-arrow', 'text', true]
    ].forEach(function (item) {
      var btn = doc.getElementById(item[0]);
      if (!btn) return;
      btn.addEventListener('mousedown', function (ev) {
        if (typeof root.OfficeColour !== 'undefined') return;
        ev.preventDefault();
      });
      btn.addEventListener('click', function () {
        if (typeof root.OfficeColour !== 'undefined') return;
        L.ensureColour().then(function () {
          var p = root.SHEET_COLOUR && root.SHEET_COLOUR[item[1]];
          if (!p) return;
          if (item[2]) p.open();
          else if (p.o && p.o.onPick) p.o.onPick(p.last());
        });
      });
      if (item[2]) {
        btn.addEventListener('keydown', function (ev) {
          if (typeof root.OfficeColour !== 'undefined') return;
          if (ev.key !== 'ArrowDown') return;
          ev.preventDefault();
          L.ensureColour().then(function () {
            var p = root.SHEET_COLOUR && root.SHEET_COLOUR[item[1]];
            if (p) p.open();
          });
        });
      }
    });

    /* Hash changes for xlsx/xlsm/xls/ods/csv */
    if (typeof root.addEventListener === 'function') {
      root.addEventListener('hashchange', function () {
        if (typeof root.openXlsxFromHash === 'function') return;
        if (L.needsXlsxForHash(root.location && root.location.hash)) {
          L.ensureXlsx().then(function () {
            if (typeof root.openXlsxFromHash === 'function') root.openXlsxFromHash();
          });
        }
      });
    }

    /* Drag-and-drop for xlsx/xlsm/xls/ods/csv */
    doc.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1) e.preventDefault();
    });
    doc.addEventListener('drop', function (e) {
      if (typeof root.importXlsxFile === 'function' && root.SHEET_SAVEFMT) return;
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!f || !L.isWorkbookOrCsvName(f.name)) return;
      e.preventDefault();
      var item = e.dataTransfer.items && e.dataTransfer.items[0];
      var inHub = !!(root.OfficeNative && root.OfficeNative.inHub && root.OfficeNative.inHub());
      var hp = null;
      if (item && item.getAsFileSystemHandle && !inHub) {
        try { hp = item.getAsFileSystemHandle(); } catch (err) { hp = null; }
      }
      Promise.all([L.ensureXlsx(), Promise.resolve(hp).catch(function () { return null; })]).then(function (res) {
        var h = res[1];
        var opts = (h && h.kind === 'file') ? { handle: h } : {};
        if (/\.csv$/i.test(f.name || '') && root.SHEET_SAVEFMT && root.SHEET_SAVEFMT.openCsvFile) {
          root.SHEET_SAVEFMT.openCsvFile(f, opts);
        } else if (typeof root.importXlsxFile === 'function') {
          root.importXlsxFile(f, opts);
        }
      });
    });
  };

  if (typeof module === 'object' && module.exports) module.exports = L;
  root.SHEET_LOADER = L;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
