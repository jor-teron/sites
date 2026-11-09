/* DB Browser — db_main.js: wire open/new, browse, query, CSV, save. DB1+DB2 */
(function () {
  'use strict';

  var H = window.DBHelpers;
  var Eng = window.DBEngine;
  var Save = window.DBSave;
  var UI = window.DBUI;
  var $ = UI.$;

  var selected = '';
  var page = 1;
  var sortCol = '';
  var sortDir = 'ASC';
  var viewMode = 'table'; // 'table' | 'query'
  var lastGrid = { columns: [], rows: [] }; // for CSV of current view
  var busy = false;

  function refreshChrome() {
    UI.setModifiedBadge(Eng.isModified());
    UI.setDbLabel(Eng.getOpenedName(), Eng.getOpenedSize());
    var has = Eng.hasDb();
    UI.showWelcome(!has);
    $('btn-save').disabled = !has;
    $('btn-csv').disabled = !has;
    $('btn-run').disabled = !has;
    $('query-box').disabled = !has;
  }

  function refreshObjects(keepSelection) {
    var objs = Eng.listObjects();
    if (!keepSelection || !objs.some(function (o) { return o.name === selected; })) {
      selected = objs.length ? objs[0].name : '';
    }
    UI.renderObjectList(objs, selected, pickObject);
    if (selected) {
      UI.renderSchema(Eng.getSchema(selected));
    } else {
      UI.renderSchema('');
    }
  }

  function pickObject(name) {
    selected = name;
    page = 1;
    sortCol = '';
    sortDir = 'ASC';
    viewMode = 'table';
    UI.showError('');
    refreshObjects(true);
    loadTablePage();
  }

  function loadTablePage() {
    if (!Eng.hasDb() || !selected) {
      UI.renderGrid({ columns: [], rows: [], note: 'Pick a table' });
      UI.renderPager(null);
      lastGrid = { columns: [], rows: [] };
      return;
    }
    try {
      var data = Eng.fetchTablePage(selected, page, H.PAGE_SIZE, sortCol, sortDir);
      page = data.info.page;
      lastGrid = { columns: data.columns, rows: data.rows, source: 'table:' + selected };
      UI.renderGrid({
        columns: data.columns,
        rows: data.rows,
        sortCol: sortCol,
        sortDir: sortDir,
        onSort: function (col) {
          if (sortCol === col) {
            sortDir = sortDir === 'ASC' ? 'DESC' : 'ASC';
          } else {
            sortCol = col;
            sortDir = 'ASC';
          }
          page = 1;
          loadTablePage();
        },
        note: data.info.totalRows === 0 ? 'Empty table' : ''
      });
      UI.renderPager(data.info, function (p) {
        page = p;
        loadTablePage();
      });
      UI.setStatus(selected + ': ' + data.info.totalRows + ' rows', 'ok');
    } catch (err) {
      UI.showError(H.friendlySqlError(err));
      UI.setStatus('Could not read table', 'error');
    }
  }

  async function afterOpen(meta, warned) {
    refreshChrome();
    refreshObjects(false);
    if (selected) loadTablePage();
    else {
      UI.renderGrid({ columns: [], rows: [], note: 'Database is empty — run CREATE TABLE or open another file' });
      UI.renderPager(null);
    }
    UI.renderHistory(H.loadQueryHistory(), fillQuery);
    var msg = 'Opened ' + meta.name;
    if (meta.size) msg += ' (' + H.formatBytes(meta.size) + ')';
    if (warned) msg += ' — large file loaded into memory';
    UI.setStatus(msg, warned ? 'warn' : 'ok');
  }

  async function openFile(file) {
    if (!file || busy) return;
    busy = true;
    UI.setStatus('Opening…', 'busy');
    UI.showError('');
    try {
      var warned = H.shouldWarnFileSize(file.size);
      if (warned) {
        var ok = window.confirm(
          'This file is ' + H.formatBytes(file.size) + '.\n' +
          'The whole database is loaded into memory. On a 4 GB PC that can be slow or crash the tab.\n\nOpen anyway?'
        );
        if (!ok) {
          UI.setStatus('Open cancelled', 'warn');
          return;
        }
      }
      await Eng.ensureEngine();
      var meta = await Eng.openFile(file);
      await afterOpen(meta, warned);
    } catch (err) {
      UI.setStatus(String(err && err.message || err), 'error');
      UI.showError(H.friendlySqlError(err));
    } finally {
      busy = false;
      refreshChrome();
    }
  }

  async function newDb() {
    if (busy) return;
    if (Eng.isModified()) {
      var ok = window.confirm('You have unsaved changes. Create a new empty database anyway?');
      if (!ok) return;
    }
    busy = true;
    UI.showError('');
    try {
      await Eng.ensureEngine();
      var meta = await Eng.newEmpty('untitled.db');
      await afterOpen(meta, false);
      UI.setStatus('New empty database', 'ok');
    } catch (err) {
      UI.setStatus(String(err && err.message || err), 'error');
    } finally {
      busy = false;
      refreshChrome();
    }
  }

  function fillQuery(sql) {
    $('query-box').value = sql;
    $('query-box').focus();
  }

  function runQuery() {
    if (!Eng.hasDb() || busy) return;
    var sql = $('query-box').value;
    if (!H.trim(sql)) {
      UI.setStatus('Type a SQL statement first', 'warn');
      return;
    }
    UI.showError('');
    viewMode = 'query';
    var result = Eng.runSql(sql);
    H.pushQueryHistory(sql);
    UI.renderHistory(H.loadQueryHistory(), fillQuery);
    refreshChrome();

    if (result.error) {
      UI.showError(H.friendlySqlError(result.error));
      UI.setStatus('Query failed', 'error');
      return;
    }

    // Refresh object list if schema may have changed
    if (result.changed) refreshObjects(true);

    // Find last SELECT result to show in grid; otherwise show exec summary
    var selects = result.results.filter(function (r) { return r.kind === 'select'; });
    var execs = result.results.filter(function (r) { return r.kind === 'exec'; });

    if (selects.length) {
      var last = selects[selects.length - 1];
      lastGrid = { columns: last.columns, rows: last.rows, source: 'query' };
      var note = '';
      if (last.truncated) {
        note = 'Showing first ' + last.totalShown + ' rows (result capped)';
      } else if (selects.length > 1) {
        note = selects.length + ' SELECT results — showing the last one';
      }
      UI.renderGrid({
        columns: last.columns,
        rows: last.rows,
        note: note,
        onSort: null
      });
      UI.renderPager({
        page: 1,
        pageSize: last.rows.length || 1,
        totalRows: last.rows.length,
        totalPages: 1,
        offset: 0,
        from: last.rows.length ? 1 : 0,
        to: last.rows.length
      }, function () {});
      UI.setStatus(
        'Query OK · ' + last.rows.length + ' row' + (last.rows.length === 1 ? '' : 's') +
        (last.truncated ? ' (capped)' : '') +
        (result.changed ? ' · modified' : ''),
        'ok'
      );
    } else {
      var changes = 0;
      execs.forEach(function (e) { changes += Number(e.changes) || 0; });
      lastGrid = { columns: [], rows: [], source: 'exec' };
      UI.renderGrid({
        columns: [],
        rows: [],
        note: execs.length
          ? ('Done · ' + execs.length + ' statement' + (execs.length === 1 ? '' : 's') +
            (changes ? ' · ' + changes + ' row change' + (changes === 1 ? '' : 's') : ''))
          : 'Done'
      });
      UI.renderPager(null);
      // If a table is still selected, refresh its page
      if (selected) {
        page = 1;
        loadTablePage();
      }
      UI.setStatus(
        'Executed' + (result.changed ? ' · database modified — Save as new .db to keep changes' : ''),
        result.changed ? 'warn' : 'ok'
      );
    }
  }

  async function exportCsv() {
    if (!Eng.hasDb()) return;
    try {
      var columns;
      var rows;
      var name;
      if (viewMode === 'query' && lastGrid.columns && lastGrid.columns.length) {
        columns = lastGrid.columns;
        rows = lastGrid.rows;
        name = 'query-result.csv';
      } else if (selected) {
        var data = Eng.fetchAllForCsv(selected, 100000);
        columns = data.columns;
        rows = data.rows;
        name = selected + '.csv';
        if (data.truncated) {
          UI.setStatus('CSV capped at 100000 rows', 'warn');
        }
      } else {
        UI.setStatus('Nothing to export', 'warn');
        return;
      }
      if (!columns.length) {
        UI.setStatus('Nothing to export', 'warn');
        return;
      }
      var csv = H.rowsToCsv(columns, rows);
      var saved = await Save.saveCsvText(csv, name);
      UI.setStatus('CSV saved as ' + saved.name, 'ok');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      UI.setStatus(String(err && err.message || err), 'error');
    }
  }

  async function saveDb() {
    if (!Eng.hasDb()) return;
    try {
      var bytes = Eng.exportBytes();
      var suggested = H.suggestSaveName(Eng.getOpenedName());
      var saved = await Save.saveDbBytes(bytes, suggested);
      UI.setStatus('Saved as ' + saved.name + ' (' + H.formatBytes(bytes.length) + ')', 'ok');
      // Keep modified badge — original file was never overwritten; user may still want another save.
      // But in-memory matches what was written, so clear modified.
      // Actually the brief says "Never overwrite the original file silently: always save as a new file."
      // Clearing modified after a successful Save as is fine UX.
      // We don't have a setter; mark via re-open? Simpler: leave badge; user knows they saved a copy.
      // Clear by exporting doesn't change modified flag. Let's add a soft clear:
      if (Eng.isModified()) {
        // soft: reload same bytes to reset flag without losing state — overkill.
        // Just leave badge; status says saved.
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      UI.setStatus(String(err && err.message || err), 'error');
    }
  }

  function wireDrop() {
    var dragDepth = 0;
    var overlay = $('drop-overlay');
    function hasFiles(e) {
      var dt = e.dataTransfer;
      if (!dt) return false;
      if (dt.types && (dt.types.indexOf('Files') !== -1 || (dt.types.contains && dt.types.contains('Files')))) return true;
      return !!(dt.files && dt.files.length);
    }
    window.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth++;
      if (overlay) overlay.hidden = false;
    });
    window.addEventListener('dragleave', function (e) {
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0 && overlay) overlay.hidden = true;
    });
    window.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
    });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      dragDepth = 0;
      if (overlay) overlay.hidden = true;
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      var file = null;
      for (var i = 0; i < files.length; i++) {
        if (H.isDbFileName(files[i].name)) { file = files[i]; break; }
      }
      if (!file) file = files[0];
      openFile(file);
    });
  }

  function init() {
    $('btn-open').addEventListener('click', function () { $('file-input').click(); });
    $('welcome-open').addEventListener('click', function () { $('file-input').click(); });
    $('file-input').addEventListener('change', function () {
      var f = $('file-input').files && $('file-input').files[0];
      $('file-input').value = '';
      if (f) openFile(f);
    });
    $('btn-new').addEventListener('click', newDb);
    $('welcome-new').addEventListener('click', newDb);
    $('btn-run').addEventListener('click', runQuery);
    $('btn-csv').addEventListener('click', exportCsv);
    $('btn-save').addEventListener('click', saveDb);
    $('btn-refresh').addEventListener('click', function () {
      if (!Eng.hasDb()) return;
      refreshObjects(true);
      if (viewMode === 'table') loadTablePage();
      UI.setStatus('Refreshed', 'ok');
    });

    $('query-box').addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runQuery();
      }
    });

    wireDrop();
    UI.renderHistory(H.loadQueryHistory(), fillQuery);
    refreshChrome();
    UI.setStatus('Ready — open a .db file or create a new one');

    // Warm the engine in the background
    Eng.ensureEngine().then(function () {
      if (!Eng.hasDb()) UI.setStatus('Ready — open a .db file or create a new one');
    }).catch(function (err) {
      UI.setStatus('SQL engine failed to load: ' + (err && err.message || err), 'error');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
