/* DB Browser — db_ui.js: DOM helpers, object list, grid, schema, query box, status. DB1+DB2 */
(function (root) {
  'use strict';

  var H = root.DBHelpers;

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, kind) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function setModifiedBadge(on) {
    var el = $('mod-badge');
    if (!el) return;
    el.hidden = !on;
  }

  function setDbLabel(name, sizeBytes) {
    var el = $('db-label');
    if (!el) return;
    if (!name) {
      el.textContent = 'No database open';
      return;
    }
    el.textContent = name + (sizeBytes ? ' · ' + H.formatBytes(sizeBytes) : '');
  }

  function showWelcome(on) {
    var w = $('welcome');
    var m = $('main-ui');
    if (w) w.hidden = !on;
    if (m) m.hidden = !!on;
  }

  function showError(msg) {
    var box = $('error-box');
    if (!box) return;
    if (!msg) {
      box.hidden = true;
      box.textContent = '';
      return;
    }
    box.hidden = false;
    box.textContent = msg;
  }

  function renderObjectList(objects, selected, onPick) {
    var list = $('obj-list');
    var sel = $('obj-select');
    if (!list || !sel) return;

    list.innerHTML = '';
    sel.innerHTML = '';
    var items = Array.isArray(objects) ? objects : [];

    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = items.length ? 'Tables & views…' : 'No tables';
    sel.appendChild(opt0);

    items.forEach(function (obj) {
      var countLabel = obj.count < 0 ? '?' : String(obj.count);
      var label = obj.name + (obj.type === 'view' ? ' (view)' : '') + ' · ' + countLabel;

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'obj-btn' + (selected === obj.name ? ' active' : '');
      btn.textContent = label;
      btn.title = obj.type + ': ' + obj.name;
      btn.addEventListener('click', function () { onPick(obj.name); });
      list.appendChild(btn);

      var opt = document.createElement('option');
      opt.value = obj.name;
      opt.textContent = label;
      if (selected === obj.name) opt.selected = true;
      sel.appendChild(opt);
    });

    sel.onchange = function () {
      if (sel.value) onPick(sel.value);
    };
  }

  function renderSchema(sql) {
    var pre = $('schema-pre');
    var panel = $('schema-panel');
    if (!pre) return;
    pre.textContent = sql || '(no CREATE statement)';
    if (panel && sql) panel.open = panel.open; // keep state
  }

  function cellText(val) {
    if (val == null) return 'NULL';
    if (typeof val === 'object') {
      // Uint8Array / blob
      if (val.byteLength != null) return 'BLOB(' + val.byteLength + ')';
      return String(val);
    }
    return String(val);
  }

  /**
   * Render a data grid.
   * opts: { columns, rows, sortCol, sortDir, onSort, note }
   */
  function renderGrid(opts) {
    var wrap = $('grid-wrap');
    var note = $('grid-note');
    if (!wrap) return;
    opts = opts || {};
    var columns = opts.columns || [];
    var rows = opts.rows || [];

    wrap.innerHTML = '';
    if (note) {
      note.textContent = opts.note || '';
      note.hidden = !opts.note;
    }

    if (!columns.length) {
      wrap.innerHTML = '<p class="muted">No columns</p>';
      return;
    }

    var table = document.createElement('table');
    table.className = 'grid';
    var thead = document.createElement('thead');
    var hr = document.createElement('tr');
    columns.forEach(function (col) {
      var th = document.createElement('th');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'th-btn';
      var label = col;
      if (opts.sortCol === col) {
        label += opts.sortDir === 'DESC' ? ' ↓' : ' ↑';
      }
      btn.textContent = label;
      btn.addEventListener('click', function () {
        if (typeof opts.onSort === 'function') opts.onSort(col);
      });
      th.appendChild(btn);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    table.appendChild(thead);

    var tbody = document.createElement('tbody');
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      for (var i = 0; i < columns.length; i++) {
        var td = document.createElement('td');
        var v = row[i];
        td.textContent = cellText(v);
        if (v == null) td.className = 'null';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function renderPager(info, onPage) {
    var el = $('pager');
    if (!el) return;
    if (!info || info.totalRows === 0) {
      el.innerHTML = '<span class="muted">0 rows</span>';
      return;
    }
    el.innerHTML = '';
    var meta = document.createElement('span');
    meta.className = 'pager-meta';
    meta.textContent = info.from + '–' + info.to + ' of ' + info.totalRows;
    el.appendChild(meta);

    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'btn btn-tiny';
    prev.textContent = 'Prev';
    prev.disabled = info.page <= 1;
    prev.addEventListener('click', function () { onPage(info.page - 1); });
    el.appendChild(prev);

    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn-tiny';
    next.textContent = 'Next';
    next.disabled = info.page >= info.totalPages;
    next.addEventListener('click', function () { onPage(info.page + 1); });
    el.appendChild(next);

    var jump = document.createElement('input');
    jump.type = 'number';
    jump.className = 'page-jump';
    jump.min = 1;
    jump.max = info.totalPages;
    jump.value = info.page;
    jump.setAttribute('aria-label', 'Page number');
    jump.addEventListener('change', function () {
      var p = parseInt(jump.value, 10);
      if (!isFinite(p)) return;
      onPage(p);
    });
    el.appendChild(jump);

    var of = document.createElement('span');
    of.className = 'muted';
    of.textContent = '/ ' + info.totalPages;
    el.appendChild(of);
  }

  function renderHistory(list, onPick) {
    var el = $('query-history');
    if (!el) return;
    el.innerHTML = '';
    var items = Array.isArray(list) ? list : [];
    if (!items.length) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    var label = document.createElement('div');
    label.className = 'muted hist-label';
    label.textContent = 'Recent';
    el.appendChild(label);
    items.slice(0, 8).forEach(function (sql) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hist-btn';
      btn.textContent = sql.length > 80 ? sql.slice(0, 77) + '…' : sql;
      btn.title = sql;
      btn.addEventListener('click', function () { onPick(sql); });
      el.appendChild(btn);
    });
  }

  root.DBUI = {
    $: $,
    setStatus: setStatus,
    setModifiedBadge: setModifiedBadge,
    setDbLabel: setDbLabel,
    showWelcome: showWelcome,
    showError: showError,
    renderObjectList: renderObjectList,
    renderSchema: renderSchema,
    renderGrid: renderGrid,
    renderPager: renderPager,
    renderHistory: renderHistory
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
