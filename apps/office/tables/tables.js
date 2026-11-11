/*
 * Tables — grid, tabs, filters, CSV and the .hot file.
 * TB1: the grid. TB2: card view, the record panel, and Link columns.
 * TB4: the grid matches Spreadsheet (borders, header, row numbers, selection,
 * compact rows, sheet tabs). Column headers are one line, "Name (Type)".
 * Date cells are plain text, not <input type="date"> (that control showed
 * year 0001). Data rules live in tables_model.js. Dialogs are in-app
 * (shared OfficeDialog plus a small <dialog> for import, choice lists and
 * link setup). No alert/confirm/prompt.
 * HOT1: Save / Save As / autosave write one .hot file (tables_hot.js).
 * (before HOT1) the copy was localStorage tables-v1. That key is not loaded.
 */
(function () {
  'use strict';

  var M = window.TablesModel;
  var CAP = 300;
  var db = null;
  var dirty = false;
  var saveTimer = 0;
  var pop = null;
  var st = {
    search: '',
    filters: {},
    sort: {},
    selected: {},
    anchor: null,
    active: null,
    edit: null,
    viewStart: 0,
    banner: '',
    viewMode: {},
    panel: null
  };

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function $(id) { return document.getElementById(id); }

  function current() { return M.activeTable(db); }

  function filtersOf(table) {
    var map = st.filters[table.id] || {};
    var keys = Object.keys(map);
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var f = map[keys[i]];
      if (!f || !f.op) continue;
      out.push({ colId: keys[i], op: f.op, value: f.value });
    }
    return out;
  }

  function matching() {
    var table = current();
    if (!table) return [];
    // (before TB2) return M.visibleRows(table, st.search, filtersOf(table), st.sort[table.id] || null);
    return M.visibleRows(table, st.search, filtersOf(table), st.sort[table.id] || null, db);
  }

  function windowed(rows) {
    if (rows.length <= CAP) {
      st.viewStart = 0;
      return { rows: rows, start: 0, total: rows.length };
    }
    var idx = -1;
    if (st.active) {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === st.active.rowId) { idx = i; break; }
      }
    }
    if (idx >= 0) {
      if (idx < st.viewStart) st.viewStart = idx;
      if (idx >= st.viewStart + CAP) st.viewStart = idx - CAP + 1;
    }
    if (st.viewStart < 0) st.viewStart = 0;
    if (st.viewStart > rows.length - CAP) st.viewStart = Math.max(0, rows.length - CAP);
    return { rows: rows.slice(st.viewStart, st.viewStart + CAP), start: st.viewStart, total: rows.length };
  }

  function setStatus(text) { $('status').textContent = text || ''; }

  function scheduleSave() {
    dirty = true;
    clearTimeout(saveTimer);
    /* (before HOT1) saveTimer = setTimeout(persist, 180); */
    saveTimer = setTimeout(persist, 800);
  }

  function persist() {
    /* (before HOT1) localStorage tables-v1 write:
    if (!dirty) return;
    try {
      localStorage.setItem(M.STORAGE_KEY, M.serialize(db));
      dirty = false;
      var cur = $('status').textContent;
      if (!cur || cur === 'Loaded from this device' || cur === 'Saved on this device') setStatus('Saved on this device');
    } catch (e) {
      setStatus('Could not save. Storage is full or blocked.');
    }
    */
    if (!dirty) return;
    if (window.TABLES_HOT && TABLES_HOT.autosave) {
      TABLES_HOT.autosave().then(function (res) {
        if (res && res.wrote) dirty = false;
      }, function () {});
    }
  }

  function applyTheme() {
    var mode = db.theme || 'auto';
    var hub = '';
    try { hub = localStorage.getItem('sites-hub.theme') || ''; } catch (e) { /* blocked */ }
    var prefersDark = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = mode === 'dark' || (mode !== 'light' && (hub === 'dark' || (hub !== 'light' && prefersDark)));
    document.documentElement.classList.toggle('tb-light', !dark);
    var buttons = document.querySelectorAll('.theme button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', buttons[i].getAttribute('data-theme') === mode ? 'true' : 'false');
    }
  }

  function closePop() {
    if (pop && pop.parentNode) pop.parentNode.removeChild(pop);
    pop = null;
  }

  function placePop(node, anchor) {
    if (window.innerWidth < 720) {
      node.classList.add('sheet');
      return;
    }
    var rect = anchor.getBoundingClientRect();
    var width = Math.max(220, node.offsetWidth || 220);
    var left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    node.style.left = left + 'px';
    var top = rect.bottom + 4;
    node.style.top = top + 'px';
    var height = node.offsetHeight;
    if (top + height > window.innerHeight - 8) {
      var above = rect.top - height - 4;
      if (above >= 8) node.style.top = above + 'px';
    }
  }

  function commitEdit(opts) {
    if (!st.edit) return true;
    var table = current();
    var res = M.setCell(table, st.edit.rowId, st.edit.colId, st.edit.draft);
    if (!res.ok) {
      st.edit.warn = res.message + ' — not saved';
      st.edit.fresh = false;
      render({ focus: true });
      setStatus(res.message + '. The previous value was kept.');
      return false;
    }
    st.edit = null;
    scheduleSave();
    if (!opts || !opts.silent) render();
    return true;
  }

  function beginEdit(row, col, typed) {
    if (col.type === 'link') {
      openLinkPickerForCell(row, col);
      return;
    }
    if (st.edit && st.edit.rowId === row.id && st.edit.colId === col.id && typed == null) return;
    if (!commitEdit({ silent: true })) return;
    st.active = { rowId: row.id, colId: col.id };
    if (col.type === 'yesno') {
      render({ focus: true });
      return;
    }
    /* (before TB4) if (typed != null && col.type !== 'text' && col.type !== 'number') typed = null; */
    if (typed != null && col.type !== 'text' && col.type !== 'number' && col.type !== 'date') typed = null;
    st.edit = {
      rowId: row.id,
      colId: col.id,
      draft: typed != null ? typed : M.display(col.type, row.cells[col.id]),
      warn: '',
      fresh: typed == null
    };
    render({ focus: true });
  }

  function move(dr, dc) {
    var table = current();
    if (!table || !table.columns.length) return;
    var rows = matching();
    if (!rows.length) return;
    var r = 0;
    var c = 0;
    if (st.active) {
      for (var i = 0; i < rows.length; i++) if (rows[i].id === st.active.rowId) r = i;
      for (var j = 0; j < table.columns.length; j++) if (table.columns[j].id === st.active.colId) c = j;
    }
    r = Math.max(0, Math.min(rows.length - 1, r + dr));
    c = Math.max(0, Math.min(table.columns.length - 1, c + dc));
    st.active = { rowId: rows[r].id, colId: table.columns[c].id };
    st.edit = null;
    render({ focus: true });
  }

  function toggleYes(row, col) {
    if (!commitEdit({ silent: true })) return;
    var next = row.cells[col.id] !== true;
    M.setCell(current(), row.id, col.id, next);
    st.active = { rowId: row.id, colId: col.id };
    scheduleSave();
    render({ focus: true });
  }

  function clearCell(row, col) {
    if (st.edit) {
      st.edit = null;
    }
    M.setCell(current(), row.id, col.id, null);
    st.active = { rowId: row.id, colId: col.id };
    scheduleSave();
    render({ focus: true });
  }

  function onEditKey(e, row, col) {
    var key = e.key;
    if (key === 'Escape') {
      e.preventDefault();
      st.edit = null;
      render({ focus: true });
      return;
    }
    if (key === 'Enter') {
      e.preventDefault();
      if (!commitEdit({ silent: true })) return;
      move(1, 0);
      return;
    }
    if (key === 'Tab') {
      e.preventDefault();
      if (!commitEdit({ silent: true })) return;
      move(0, e.shiftKey ? -1 : 1);
      return;
    }
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
      if (e.target.tagName === 'SELECT' && (key === 'ArrowUp' || key === 'ArrowDown')) return;
      e.preventDefault();
      if (!commitEdit({ silent: true })) return;
      if (key === 'ArrowUp') move(-1, 0);
      else if (key === 'ArrowDown') move(1, 0);
      else if (key === 'ArrowLeft') move(0, -1);
      else move(0, 1);
    }
  }

  function onCellKey(e, row, col) {
    var key = e.key;
    if (col.type === 'link' && (key === 'Enter' || key === 'F2' || key === ' ')) {
      e.preventDefault();
      openLinkPickerForCell(row, col);
      return;
    }
    if (key === 'Enter' || key === 'F2') {
      e.preventDefault();
      if (col.type === 'yesno') toggleYes(row, col);
      else beginEdit(row, col);
      return;
    }
    if (key === ' ') {
      e.preventDefault();
      if (col.type === 'yesno') toggleYes(row, col);
      else beginEdit(row, col, key);
      return;
    }
    if (key === 'Tab') {
      e.preventDefault();
      move(0, e.shiftKey ? -1 : 1);
      return;
    }
    if (key === 'ArrowUp') { e.preventDefault(); move(-1, 0); return; }
    if (key === 'ArrowDown') { e.preventDefault(); move(1, 0); return; }
    if (key === 'ArrowLeft') { e.preventDefault(); move(0, -1); return; }
    if (key === 'ArrowRight') { e.preventDefault(); move(0, 1); return; }
    if (key === 'Delete' || key === 'Backspace') {
      e.preventDefault();
      clearCell(row, col);
      return;
    }
    if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) beginEdit(row, col, key);
  }

  function toggleSelect(rowId, shiftKey) {
    var rows = matching();
    if (shiftKey && st.anchor) {
      var a = -1;
      var b = -1;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].id === st.anchor) a = i;
        if (rows[i].id === rowId) b = i;
      }
      if (a >= 0 && b >= 0) {
        st.selected = {};
        var lo = Math.min(a, b);
        var hi = Math.max(a, b);
        for (var j = lo; j <= hi; j++) st.selected[rows[j].id] = true;
      }
    } else if (st.selected[rowId]) {
      delete st.selected[rowId];
      st.anchor = rowId;
    } else {
      st.selected[rowId] = true;
      st.anchor = rowId;
    }
    render();
  }

  function selectedIds() {
    var table = current();
    if (!table) return [];
    var ids = [];
    for (var i = 0; i < table.rows.length; i++) {
      if (st.selected[table.rows[i].id]) ids.push(table.rows[i].id);
    }
    return ids;
  }

  function rowHasData(table, id) {
    var row = M.findRow(table, id);
    if (!row) return false;
    for (var i = 0; i < table.columns.length; i++) {
      var value = row.cells[table.columns[i].id];
      if (value != null && value !== '') return true;
    }
    return false;
  }

  function removeRows(ids) {
    var table = current();
    // (before TB2) var n = M.deleteRows(table, ids);
    var n = M.deleteRows(table, ids, db);
    st.selected = {};
    st.active = null;
    st.anchor = null;
    if (st.panel && st.panel.mode === 'edit') {
      for (var i = 0; i < ids.length; i++) {
        if (ids[i] === st.panel.rowId) {
          st.panel = null;
          $('record-panel').hidden = true;
          break;
        }
      }
    }
    scheduleSave();
    render();
    setStatus(n === 1 ? 'Row deleted.' : n + ' rows deleted.');
  }

  function deleteRows() {
    var table = current();
    if (!table) return;
    if (!commitEdit()) return;
    var ids = selectedIds();
    if (!ids.length && st.active) ids = [st.active.rowId];
    if (!ids.length) {
      setStatus('Select a row to delete.');
      return;
    }
    var messy = false;
    for (var i = 0; i < ids.length; i++) if (rowHasData(table, ids[i])) messy = true;
    if (!messy) {
      removeRows(ids);
      return;
    }
    var pointed = M.linksPointingAt(db, table.id, ids);
    var note = '';
    if (pointed === 1) note = ' 1 link to it will be cleared.';
    else if (pointed > 1) note = ' ' + pointed + ' links to these records will be cleared.';
    OfficeDialog.confirm({
      title: 'Delete rows',
      // (before TB2) message: ids.length === 1 ? 'Delete this row?' : 'Delete ' + ids.length + ' rows?',
      message: (ids.length === 1 ? 'Delete this row?' : 'Delete ' + ids.length + ' rows?') + note,
      okLabel: 'Delete',
      danger: true
    }).then(function (yes) { if (yes) removeRows(ids); });
  }

  function addRow() {
    var table = current();
    if (!table) { setStatus('Add a table first.'); return; }
    if (!table.columns.length) { setStatus('Add a column first.'); return; }
    if (!commitEdit({ silent: true })) return;
    var row = M.addRow(table, {});
    var visible = false;
    var rows = matching();
    for (var i = 0; i < rows.length; i++) if (rows[i].id === row.id) visible = true;
    if (!visible) {
      st.search = '';
      $('search').value = '';
      st.filters[table.id] = {};
      setStatus('Search and filters were cleared so the new row is visible.');
    }
    st.active = { rowId: row.id, colId: table.columns[0].id };
    st.selected = {};
    scheduleSave();
    if (table.columns[0].type === 'yesno') render({ focus: true });
    else beginEdit(row, table.columns[0]);
  }

  function switchTable(id) {
    if (db.activeId === id) return;
    if (!commitEdit({ silent: true })) return;
    if (st.panel && st.panel.mode === 'edit' && !commitPanel()) return;
    closePop();
    if (st.panel) {
      st.panel = null;
      $('record-panel').hidden = true;
    }
    db.activeId = id;
    st.search = '';
    $('search').value = '';
    st.selected = {};
    st.anchor = null;
    st.active = null;
    st.viewStart = 0;
    scheduleSave();
    render();
  }

  function addTable() {
    if (!commitEdit()) return;
    OfficeDialog.prompt({
      title: 'New table',
      label: 'Table name',
      value: M.nextTableName(db),
      okLabel: 'Add table'
    }).then(function (name) {
      if (!name) return;
      M.addTable(db, name);
      st.search = '';
      $('search').value = '';
      st.selected = {};
      st.active = null;
      st.viewStart = 0;
      scheduleSave();
      render();
    });
  }

  function renameTable() {
    var table = current();
    if (!table || !commitEdit()) return;
    OfficeDialog.prompt({
      title: 'Rename table',
      label: 'Table name',
      value: table.name,
      okLabel: 'Rename'
    }).then(function (name) {
      if (!name) return;
      var res = M.renameTable(db, table.id, name);
      if (!res.ok) { setStatus(res.message); return; }
      scheduleSave();
      render();
    });
  }

  function deleteTable() {
    var table = current();
    if (!table || !commitEdit()) return;
    var rowIds = [];
    for (var i = 0; i < table.rows.length; i++) rowIds.push(table.rows[i].id);
    var pointed = M.linksPointingAt(db, table.id, rowIds);
    var message = 'Delete "' + table.name + '"? Its columns and rows will be removed from this device.';
    if (pointed === 1) message += ' 1 link to its records will be cleared.';
    else if (pointed > 1) message += ' ' + pointed + ' links to its records will be cleared.';
    OfficeDialog.confirm({
      title: 'Delete table',
      message: message,
      okLabel: 'Delete table',
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      M.deleteTable(db, table.id);
      st.selected = {};
      st.active = null;
      closePanel();
      st.search = '';
      $('search').value = '';
      scheduleSave();
      render();
      setStatus('Table deleted.');
    });
  }

  function typeOptions() {
    var opts = [];
    for (var i = 0; i < M.TYPES.length; i++) {
      opts.push({ value: M.TYPES[i], label: M.TYPE_LABELS[M.TYPES[i]] });
    }
    return opts;
  }

  /* (before TB2)
  function applyType(col, type, options) {
    var table = current();
    var cleared = M.countRetypeClears(table, col.id, type, options);
  */
  function applyType(col, type, options, extra) {
    var table = current();
    var cleared = M.countRetypeClears(table, col.id, type, options, extra, db);
    function go() {
      // (before TB2) var res = M.setColumnType(table, col.id, type, options);
      var res = M.setColumnType(table, col.id, type, options, extra, db);
      scheduleSave();
      render();
      if (res.cleared) {
        setStatus(res.cleared === 1
          ? '1 value was cleared because it did not fit the column.'
          : res.cleared + ' values were cleared because they did not fit the column.');
      }
    }
    if (!cleared) { go(); return; }
    OfficeDialog.confirm({
      title: 'Change type',
      message: cleared + (cleared === 1 ? ' value does not fit ' : ' values do not fit ') + M.TYPE_LABELS[type] + ' and will be cleared.',
      okLabel: 'Change type',
      danger: true
    }).then(function (yes) { if (yes) go(); });
  }

  function addColumn() {
    var table = current();
    if (!table) { setStatus('Add a table first.'); return; }
    if (!commitEdit()) return;
    OfficeDialog.form({
      title: 'Add column',
      okLabel: 'Add column',
      fields: [
        { key: 'name', label: 'Name', value: 'Column ' + (table.columns.length + 1) },
        { key: 'type', label: 'Type', type: 'select', value: 'text', options: typeOptions() }
      ],
      validate: function (v) { return String(v.name || '').trim() ? '' : 'Please enter a name.'; }
    }).then(function (v) {
      if (!v) return;
      if (v.type === 'choice') {
        OfficeDialog.prompt({
          title: 'Choices',
          label: 'Choices, separated by commas',
          value: '',
          okLabel: 'Add column'
        }).then(function (text) {
          if (!text) return;
          M.addColumn(table, v.name, 'choice', text.split(/[\n,]/));
          scheduleSave();
          render();
        });
        return;
      }
      if (v.type === 'link') {
        askLink(null).then(function (spec) {
          if (!spec) return;
          M.addColumn(table, v.name, 'link', null, spec);
          scheduleSave();
          render();
        });
        return;
      }
      M.addColumn(table, v.name, v.type);
      scheduleSave();
      render();
    });
  }

  function renameColumn(col) {
    OfficeDialog.prompt({
      title: 'Rename column',
      label: 'Column name',
      value: col.name,
      okLabel: 'Rename'
    }).then(function (name) {
      if (!name) return;
      var res = M.renameColumn(current(), col.id, name);
      if (!res.ok) { setStatus(res.message); return; }
      scheduleSave();
      render();
    });
  }

  function changeType(col) {
    OfficeDialog.form({
      title: 'Column type',
      okLabel: 'Change type',
      fields: [
        { key: 'type', label: col.name, type: 'select', value: col.type, options: typeOptions() }
      ]
    }).then(function (v) {
      if (!v) return;
      if (v.type === col.type && v.type !== 'choice' && v.type !== 'link') return;
      if (v.type === 'link') {
        askLink(col.type === 'link' ? col : null).then(function (spec) {
          if (!spec) return;
          applyType(col, 'link', [], spec);
        });
        return;
      }
      if (v.type === 'choice') {
        OfficeDialog.prompt({
          title: 'Choices',
          label: 'Choices, separated by commas',
          value: (col.options || []).join(', '),
          okLabel: 'Save'
        }).then(function (text) {
          if (!text) return;
          applyType(col, 'choice', text.split(/[\n,]/));
        });
        return;
      }
      applyType(col, v.type, []);
    });
  }

  function editChoices(col) {
    openLines({
      title: 'Choices',
      message: 'One choice per line. A comma can be part of a choice.',
      value: (col.options || []).join('\n'),
      okLabel: 'Save choices'
    }).then(function (text) {
      if (text == null) return;
      var options = M.cleanOptions(text);
      if (!options.length) { setStatus('Add at least one choice.'); return; }
      applyType(col, 'choice', options);
    });
  }

  function removeColumn(col) {
    OfficeDialog.confirm({
      title: 'Delete column',
      message: 'Delete the column "' + col.name + '"? Values in it will be removed.',
      okLabel: 'Delete column',
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      M.deleteColumn(current(), col.id);
      if (st.active && st.active.colId === col.id) st.active = null;
      if (st.edit && st.edit.colId === col.id) st.edit = null;
      var map = st.filters[current().id];
      if (map) delete map[col.id];
      var sort = st.sort[current().id];
      if (sort && sort.colId === col.id) delete st.sort[current().id];
      scheduleSave();
      render();
    });
  }

  function openMenu(anchor, items) {
    closePop();
    var menu = el('div', 'pop');
    menu.setAttribute('role', 'menu');
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var button = el('button', 'pop-item' + (item.danger ? ' danger' : ''), item.label);
        button.type = 'button';
        button.setAttribute('role', 'menuitem');
        button.addEventListener('click', function () {
          closePop();
          item.run();
        });
        menu.appendChild(button);
      })(items[i]);
    }
    menu.setAttribute('data-for', 'menu:' + (items.colId || ''));
    document.body.appendChild(menu);
    placePop(menu, anchor);
    pop = menu;
    var first = menu.querySelector('button');
    if (first) first.focus();
  }

  function columnMenu(col, anchor) {
    var table = current();
    var items = [
      { label: table && filterIsOn(table, col) ? 'Filter (on)' : 'Filter', run: function () { openFilter(col, anchor); } },
      { label: 'Rename', run: function () { renameColumn(col); } },
      { label: 'Change type', run: function () { changeType(col); } }
    ];
    if (col.type === 'choice') items.push({ label: 'Edit choices', run: function () { editChoices(col); } });
    if (col.type === 'link') {
      items.push({
        label: 'Link settings',
        run: function () {
          askLink(col).then(function (spec) {
            if (!spec) return;
            applyType(col, 'link', [], spec);
          });
        }
      });
    }
    items.push({ label: 'Delete column', danger: true, run: function () { removeColumn(col); } });
    items.colId = col.id;
    openMenu(anchor, items);
  }

  function filterIsOn(table, col) {
    var f = (st.filters[table.id] || {})[col.id];
    if (!f || !f.op) return false;
    if (f.op === 'checked' || f.op === 'unchecked') return true;
    return String(f.value || '').trim() !== '';
  }

  function openFilter(col, anchor) {
    closePop();
    var table = current();
    var ops = M.opsFor(col.type);
    var currentFilter = (st.filters[table.id] || {})[col.id] || { op: ops[0].op, value: '' };
    var box = el('div', 'pop filter-pop');
    box.appendChild(el('div', 'pop-title', 'Filter ' + col.name));
    var sel = el('select');
    sel.setAttribute('aria-label', 'How to filter ' + col.name);
    for (var i = 0; i < ops.length; i++) {
      var opt = el('option', null, ops[i].label);
      opt.value = ops[i].op;
      if (ops[i].op === currentFilter.op) opt.selected = true;
      sel.appendChild(opt);
    }
    var input = el('input');
    input.value = currentFilter.value || '';
    input.setAttribute('aria-label', 'Filter value');
    if (col.type === 'number') {
      input.inputMode = 'decimal';
      input.placeholder = 'Number';
    } else if (col.type === 'date') {
      /* (before TB4) input.placeholder = 'YYYY-MM-DD or DD/MM/YYYY'; */
      input.placeholder = '2026-11-11, 11/11/2026 or 11 Nov 2026';
    } else {
      input.placeholder = 'Text';
    }
    function sync() {
      input.hidden = sel.value === 'checked' || sel.value === 'unchecked';
    }
    sel.addEventListener('change', sync);
    box.appendChild(sel);
    box.appendChild(input);
    sync();
    var actions = el('div', 'pop-actions');
    var clear = el('button', null, 'Clear');
    clear.type = 'button';
    clear.addEventListener('click', function () {
      if (st.filters[table.id]) delete st.filters[table.id][col.id];
      closePop();
      st.viewStart = 0;
      render();
    });
    var apply = el('button', null, 'Apply');
    apply.type = 'button';
    apply.addEventListener('click', function () {
      if (!st.filters[table.id]) st.filters[table.id] = {};
      st.filters[table.id][col.id] = { op: sel.value, value: input.hidden ? '' : input.value };
      closePop();
      st.viewStart = 0;
      render();
    });
    actions.appendChild(clear);
    actions.appendChild(apply);
    box.appendChild(actions);
    box.setAttribute('data-for', 'filter:' + col.id);
    document.body.appendChild(box);
    placePop(box, anchor);
    pop = box;
    (input.hidden ? sel : input).focus();
  }

  function toggleSort(colId) {
    closePop();
    if (!commitEdit({ silent: true })) return;
    var table = current();
    var cur = st.sort[table.id];
    if (!cur || cur.colId !== colId) st.sort[table.id] = { colId: colId, dir: 'asc' };
    else st.sort[table.id] = { colId: colId, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
    st.viewStart = 0;
    render();
  }

  function columnLabel(col, dir) {
    var label = el('span', 'col-label');
    label.appendChild(el('span', 'col-title', col.name));
    label.appendChild(el('span', 'col-type', ' (' + (M.TYPE_LABELS[col.type] || 'Text') + ')'));
    if (dir === 'asc') label.appendChild(el('span', 'col-sort', ' ▲'));
    else if (dir === 'desc') label.appendChild(el('span', 'col-sort', ' ▼'));
    return label;
  }

  function headerCell(table, col) {
    var th = el('th');
    th.scope = 'col';
    var sort = st.sort[table.id];
    var dir = sort && sort.colId === col.id ? sort.dir : '';
    th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none');
    var wrap = el('div', 'col-head');
    var sortBtn = el('button', 'col-name');
    sortBtn.type = 'button';
    var full = M.headerLabel(col);
    sortBtn.title = 'Sort ' + full;
    sortBtn.setAttribute('aria-label', 'Sort ' + full);
    /* (before TB4)
    sortBtn.appendChild(el('span', null, col.name));
    sortBtn.appendChild(el('small', null, M.TYPE_LABELS[col.type] + (dir === 'asc' ? '  ▲' : dir === 'desc' ? '  ▼' : '')));
    */
    sortBtn.appendChild(columnLabel(col, dir));
    var held = false;
    var hold = 0;
    sortBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    sortBtn.addEventListener('click', function () {
      if (held) { held = false; return; }
      toggleSort(col.id);
    });
    sortBtn.addEventListener('touchstart', function () {
      held = false;
      hold = setTimeout(function () {
        held = true;
        columnMenu(col, sortBtn);
      }, 550);
    });
    sortBtn.addEventListener('touchend', function () { clearTimeout(hold); });
    sortBtn.addEventListener('touchmove', function () { clearTimeout(hold); });
    /* (before TB4) a separate ▾ filter button sat beside ⋯, which stacked the name and the type. */
    var more = el('button', 'icon-btn col-menu' + (filterIsOn(table, col) ? ' on' : ''), '⋯');
    more.type = 'button';
    more.title = filterIsOn(table, col) ? 'Column options (filter on)' : 'Column options';
    more.setAttribute('aria-label', 'Options for ' + full);
    more.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    more.addEventListener('click', function () {
      if (pop && pop.getAttribute('data-for') === 'menu:' + col.id) { closePop(); return; }
      columnMenu(col, more);
    });
    th.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      columnMenu(col, more);
    });
    wrap.appendChild(sortBtn);
    wrap.appendChild(more);
    th.appendChild(wrap);
    applyColWidth(th, col);
    th.appendChild(resizeGrip(th, col));
    return th;
  }

  /* HOT1: a stored column width, in px. Null keeps the default column. */
  function applyColWidth(th, col) {
    if (!col || col.width == null) return;
    var px = col.width + 'px';
    th.style.width = px;
    th.style.minWidth = px;
    var head = th.querySelector('.col-head');
    if (head) head.style.minWidth = px;
    var name = th.querySelector('.col-name');
    if (name) name.style.maxWidth = 'none';
  }

  function resizeGrip(th, col) {
    var grip = el('span', 'col-resize');
    grip.title = 'Drag to resize';
    grip.setAttribute('role', 'separator');
    grip.setAttribute('aria-orientation', 'vertical');
    grip.setAttribute('aria-label', 'Resize ' + (col.name || 'column'));
    if (!window.PointerEvent) return grip;
    grip.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      var startX = e.clientX;
      var startW = th.getBoundingClientRect().width;
      var moved = false;
      function move(ev) {
        var dx = ev.clientX - startX;
        if (!moved && Math.abs(dx) < 2) return;
        moved = true;
        var w = Math.round(startW + dx);
        if (w < 72) w = 72;
        if (w > 480) w = 480;
        col.width = w;
        applyColWidth(th, col);
      }
      function up(ev) {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        try { grip.releasePointerCapture(ev.pointerId); } catch (err) { /* already released */ }
        if (moved) scheduleSave();
      }
      try { grip.setPointerCapture(e.pointerId); } catch (err) { /* no capture */ }
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
    return grip;
  }

  function fillCell(td, row, col) {
    var editing = st.edit && st.edit.rowId === row.id && st.edit.colId === col.id;
    var active = st.active && st.active.rowId === row.id && st.active.colId === col.id;
    if (col.type === 'link') {
      fillLinkCell(td, row, col, active);
      return;
    }
    if (active) {
      td.classList.add('active');
      td.classList.add('selected');
    }
    td.setAttribute('aria-selected', active ? 'true' : 'false');
    if (col.type === 'yesno' && !editing) {
      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = row.cells[col.id] === true;
      if (row.cells[col.id] == null) box.indeterminate = true;
      box.tabIndex = -1;
      box.setAttribute('aria-label', col.name);
      td.appendChild(box);
      td.tabIndex = active ? 0 : -1;
      td.addEventListener('click', function () { toggleYes(row, col); });
      td.addEventListener('keydown', function (e) { onCellKey(e, row, col); });
      return;
    }
    if (editing) {
      td.classList.add('editing');
      var field;
      if (col.type === 'choice') {
        field = document.createElement('select');
        field.setAttribute('aria-label', col.name);
        var blank = el('option', null, '—');
        blank.value = '';
        field.appendChild(blank);
        var options = col.options || [];
        for (var i = 0; i < options.length; i++) {
          var opt = el('option', null, options[i]);
          opt.value = options[i];
          field.appendChild(opt);
        }
        field.value = st.edit.draft || '';
      /* (before TB4) native date input. The year segment starts at 0001, and
         new Date(1, month, day) is year 1901, so the check failed and the
         cell showed "07/05/0001" with "not saved".
      } else if (col.type === 'date') {
        field = document.createElement('input');
        field.type = 'date';
        field.value = /^\d{4}-\d{2}-\d{2}$/.test(st.edit.draft || '') ? st.edit.draft : '';
        field.setAttribute('aria-label', col.name);
      */
      } else {
        field = document.createElement('input');
        field.type = 'text';
        field.value = st.edit.draft == null ? '' : st.edit.draft;
        field.autocomplete = 'off';
        field.spellcheck = false;
        field.setAttribute('aria-label', col.name);
        if (col.type === 'number') field.inputMode = 'decimal';
        if (col.type === 'date') {
          field.placeholder = '2026-11-11, 11/11/2026 or 11 Nov 2026';
          field.setAttribute('inputmode', 'text');
        }
      }
      td.appendChild(field);
      if (st.edit.warn) {
        td.classList.add('warn');
        td.appendChild(el('span', 'hint', st.edit.warn));
      }
      field.addEventListener('input', function () {
        if (!st.edit) return;
        st.edit.draft = field.value;
          if (st.edit.warn) {
            st.edit.warn = '';
            td.classList.remove('warn');
            var hint = td.querySelector('.hint');
            if (hint && hint.parentNode) hint.parentNode.removeChild(hint);
          }
      });
      field.addEventListener('keydown', function (e) { onEditKey(e, row, col); });
      if (field.tagName === 'SELECT' || field.type === 'date') {
        field.addEventListener('change', function () {
          if (!st.edit || st.edit.rowId !== row.id || st.edit.colId !== col.id) return;
          st.edit.draft = field.value;
          if (commitEdit()) render({ focus: true });
        });
      }
      return;
    }
    td.tabIndex = active ? 0 : -1;
    td.appendChild(el('span', 'val', M.display(col.type, row.cells[col.id])));
    td.addEventListener('click', function (e) {
      if (e.target && e.target.tagName === 'INPUT') return;
      beginEdit(row, col);
    });
    td.addEventListener('keydown', function (e) { onCellKey(e, row, col); });
  }

  function renderGrid(opts) {
    var wrap = $('grid-wrap');
    var top = wrap.scrollTop;
    var left = wrap.scrollLeft;
    var thead = $('thead');
    var tbody = $('tbody');
    thead.textContent = '';
    tbody.textContent = '';
    var table = current();
    if (!table) {
      var empty = el('tr', 'hint-row');
      empty.appendChild(el('td', null, 'No tables yet. Add a table to start.'));
      tbody.appendChild(empty);
      return;
    }
    var head = el('tr');
    /* (before TB4) var corner = el('th', 'rowh', '#'); */
    var corner = el('th', 'rowh corner');
    corner.setAttribute('aria-label', 'Row numbers');
    corner.scope = 'col';
    head.appendChild(corner);
    for (var c = 0; c < table.columns.length; c++) head.appendChild(headerCell(table, table.columns[c]));
    thead.appendChild(head);
    if (!table.columns.length) {
      var noCol = el('tr', 'hint-row');
      // (before TB2) var noColTd = el('td', null, 'Add a column to start. Each column has one type: Text, Number, Date, Yes/No or Choice.');
      var noColTd = el('td', null, 'Add a column to start. Each column has one type: Text, Number, Date, Yes/No, Choice or Link.');
      noColTd.colSpan = 1;
      noCol.appendChild(noColTd);
      tbody.appendChild(noCol);
      return;
    }
    var all = matching();
    var view = windowed(all);
    if (view.start > 0) tbody.appendChild(pagerRow(table.columns.length + 1, 'Show earlier rows', -1));
    if (!view.rows.length) {
      var hint = el('tr', 'hint-row');
      var msg = table.rows.length
        ? 'No rows match. Change the search or clear a column filter.'
        : 'This table is empty. Add a row, or import a CSV. Click a cell and type. Enter moves down, Tab moves across, and the arrow keys move.';
      var td = el('td', null, msg);
      td.colSpan = table.columns.length + 1;
      hint.appendChild(td);
      tbody.appendChild(hint);
    }
    for (var r = 0; r < view.rows.length; r++) {
      (function (row, index) {
        var tr = el('tr');
        if (st.selected[row.id]) tr.className = 'on';
        /* (before TB4) var rh = el('td', 'rowh'); */
        var rh = el('td', 'rowh row-num');
        var pick = el('div', 'row-pick');
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!st.selected[row.id];
        cb.setAttribute('aria-label', 'Select row ' + (view.start + index + 1));
        cb.addEventListener('mousedown', function (e) { e.stopPropagation(); });
        cb.addEventListener('click', function (e) {
          e.stopPropagation();
          if (!commitEdit({ silent: true })) {
            cb.checked = !!st.selected[row.id];
            return;
          }
          toggleSelect(row.id, e.shiftKey);
        });
        pick.appendChild(cb);
        pick.appendChild(el('span', null, String(view.start + index + 1)));
        rh.appendChild(pick);
        tr.appendChild(rh);
        for (var i = 0; i < table.columns.length; i++) {
          /* (before TB4) var cell = el('td'); */
          var cell = el('td', 'cell');
          fillCell(cell, row, table.columns[i]);
          tr.appendChild(cell);
        }
        tbody.appendChild(tr);
      })(view.rows[r], r);
    }
    if (view.start + view.rows.length < view.total) {
      tbody.appendChild(pagerRow(table.columns.length + 1, 'Show later rows', 1));
    }
    wrap.scrollTop = top;
    wrap.scrollLeft = left;
    if (opts && opts.focus) focusActive();
  }

  function pagerRow(span, label, dir) {
    var tr = el('tr', 'more-row');
    var td = el('td');
    td.colSpan = span;
    var button = el('button', null, label);
    button.type = 'button';
    button.addEventListener('click', function () {
      if (!commitEdit({ silent: true })) return;
      var total = matching().length;
      st.viewStart = Math.max(0, Math.min(Math.max(0, total - CAP), st.viewStart + dir * CAP));
      st.active = null;
      render();
    });
    td.appendChild(button);
    tr.appendChild(td);
    return tr;
  }

  function focusActive() {
    var td = document.querySelector('#tbody td.active');
    if (!td) return;
    var field = td.querySelector('input, select');
    if (field) {
      field.focus();
      if (st.edit && st.edit.fresh && field.select) {
        try { field.select(); } catch (e) { /* date inputs may refuse */ }
        st.edit.fresh = false;
      }
    } else {
      td.focus();
    }
    try { td.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    catch (e) { td.scrollIntoView(false); }
  }

  function renderTabs() {
    var host = $('tabs');
    host.textContent = '';
    for (var i = 0; i < db.tables.length; i++) {
      (function (table) {
        /* (before TB4) var button = el('button', 'tab', table.name); */
        var button = el('button', 'tab sheet-tab' + (table.id === db.activeId ? ' on' : ''), table.name);
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.title = table.name;
        button.setAttribute('aria-selected', table.id === db.activeId ? 'true' : 'false');
        button.addEventListener('click', function () { switchTable(table.id); });
        button.addEventListener('dblclick', function () {
          if (db.activeId === table.id) renameTable();
        });
        host.appendChild(button);
      })(db.tables[i]);
    }
    var active = host.querySelector('[aria-selected="true"]');
    if (!active) return;
    var left = active.offsetLeft;
    var right = left + active.offsetWidth;
    if (left < host.scrollLeft) host.scrollLeft = left;
    else if (right > host.scrollLeft + host.clientWidth) host.scrollLeft = right - host.clientWidth;
  }

  function renderCount() {
    var table = current();
    var node = $('count');
    if (!table) { node.textContent = 'No tables'; return; }
    var all = table.rows.length;
    var shown = matching();
    var text = !all ? 'No rows' : (shown.length === all
      ? (all === 1 ? '1 row' : all + ' rows')
      : shown.length + ' of ' + all + ' rows');
    if (shown.length > CAP) {
      var start = st.viewStart + 1;
      var end = Math.min(shown.length, st.viewStart + CAP);
      text += ' · showing ' + start + '–' + end;
    }
    node.textContent = text;
  }

  function renderBanner() {
    var banner = $('banner');
    banner.textContent = '';
    if (!st.banner) { banner.hidden = true; return; }
    banner.hidden = false;
    banner.appendChild(el('span', null, st.banner));
    var close = el('button', null, '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.addEventListener('click', function () {
      st.banner = '';
      renderBanner();
    });
    banner.appendChild(close);
  }

  function paintActions() {
    var table = current();
    $('btn-add-row').disabled = !table || !table.columns.length;
    $('btn-del-row').disabled = !table || !table.rows.length;
    $('btn-add-col').disabled = !table;
    $('btn-rename').disabled = !table;
    $('btn-del-table').disabled = !table;
    $('btn-export').disabled = !table;
    $('btn-new-record').disabled = !table || !table.columns.length;
    $('btn-view-grid').disabled = !table;
    $('btn-view-cards').disabled = !table;
    $('search').disabled = !table;
  }

  /* (before TB2)
  function render(opts) {
    renderBanner();
    renderTabs();
    renderGrid(opts);
    renderCount();
    paintActions();
    applyTheme();
  }
  */
  function render(opts) {
    renderBanner();
    renderTabs();
    var cards = modeOf() === 'cards';
    $('grid-wrap').hidden = cards;
    $('cards-wrap').hidden = !cards;
    $('btn-view-grid').setAttribute('aria-pressed', cards ? 'false' : 'true');
    $('btn-view-cards').setAttribute('aria-pressed', cards ? 'true' : 'false');
    var showFocus = !!(opts && opts.focus) && !st.panel;
    if (cards) renderCards({ focus: showFocus });
    else renderGrid({ focus: showFocus });
    renderCount();
    paintActions();
    applyTheme();
    if (st.panel && !(opts && opts.keepPanel)) {
      var body = $('record-body');
      var typing = body && document.activeElement && body.contains(document.activeElement);
      if (!typing) fillPanel();
    }
  }

  function openDialog(o) {
    return new Promise(function (resolve) {
      var host = el('dialog', 'dlg-modal' + (o.wide ? ' tb-wide' : ''));
      var box = el('div', 'dlg');
      box.setAttribute('role', 'dialog');
      var title = el('div', 'dlg-title', o.title || '');
      title.id = 'tbDlgTitle';
      box.setAttribute('aria-labelledby', 'tbDlgTitle');
      box.appendChild(title);
      if (o.message) box.appendChild(el('div', 'dlg-message', o.message));
      if (o.body) box.appendChild(o.body);
      var err = el('div', 'dlg-error', '');
      err.hidden = true;
      err.setAttribute('role', 'alert');
      box.appendChild(err);
      var actions = el('div', 'dlg-actions');
      var cancel = el('button', 'dlg-btn dlg-cancel', 'Cancel');
      cancel.type = 'button';
      var ok = el('button', 'dlg-btn dlg-ok', o.okLabel || 'OK');
      ok.type = 'button';
      actions.appendChild(cancel);
      actions.appendChild(ok);
      box.appendChild(actions);
      host.appendChild(box);
      document.body.appendChild(host);
      if (typeof host.showModal === 'function') {
        try { host.showModal(); } catch (e) { host.setAttribute('open', ''); }
      } else host.setAttribute('open', '');
      var done = false;
      function finish(value) {
        if (done) return;
        done = true;
        try { if (host.close) host.close(); } catch (e) { /* already closed */ }
        if (host.parentNode) host.parentNode.removeChild(host);
        resolve(value);
      }
      function accept() {
        var problem = o.onOk ? o.onOk() : '';
        if (problem) {
          err.textContent = problem;
          err.hidden = false;
          return;
        }
        finish(true);
      }
      cancel.addEventListener('click', function () { finish(null); });
      ok.addEventListener('click', accept);
      host.addEventListener('cancel', function (e) { e.preventDefault(); finish(null); });
      host.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); finish(null); return; }
        if (e.key === 'Enter' && (!e.target || e.target.tagName !== 'TEXTAREA')) {
          e.preventDefault();
          if (document.activeElement === cancel) finish(null);
          else accept();
        }
      });
      var first = box.querySelector('input, select, textarea');
      if (first) first.focus();
      else ok.focus();
    });
  }

  function openLines(o) {
    var area = el('textarea', 'tb-lines');
    area.value = o.value || '';
    var body = el('div');
    body.appendChild(area);
    return openDialog({
      title: o.title,
      message: o.message,
      body: body,
      okLabel: o.okLabel,
      onOk: function () { return ''; }
    }).then(function (ok) { return ok ? area.value : null; });
  }

  function fileTitle(name) {
    var base = String(name || 'Imported').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim();
    return base || 'Imported';
  }

  function openImport(preview, fileName) {
    var body = el('div');
    var nameWrap = el('label', 'dlg-label imp-name');
    nameWrap.appendChild(el('span', null, 'Table name'));
    var nameInput = el('input', 'dlg-input');
    nameInput.value = fileTitle(fileName);
    nameWrap.appendChild(nameInput);
    body.appendChild(nameWrap);
    var list = el('div', 'imp-list');
    var fields = [];
    for (var i = 0; i < preview.columns.length; i++) {
      (function (col) {
        var row = el('div', 'imp-row');
        var name = el('input');
        name.value = col.name;
        name.setAttribute('aria-label', 'Column name');
        var type = el('select');
        type.setAttribute('aria-label', 'Type for ' + col.name);
        for (var t = 0; t < M.TYPES.length; t++) {
          if (M.TYPES[t] === 'link') continue;
          var opt = el('option', null, M.TYPE_LABELS[M.TYPES[t]]);
          opt.value = M.TYPES[t];
          type.appendChild(opt);
        }
        type.value = col.type;
        var opts = el('input');
        opts.placeholder = 'Choices, separated by commas';
        opts.value = (col.options || []).join(', ');
        opts.setAttribute('aria-label', 'Choices for ' + col.name);
        function sync() { opts.hidden = type.value !== 'choice'; }
        type.addEventListener('change', sync);
        sync();
        row.appendChild(name);
        row.appendChild(type);
        row.appendChild(opts);
        if (col.sample) row.appendChild(el('div', 'imp-sample', 'e.g. ' + col.sample));
        list.appendChild(row);
        fields.push({ name: name, type: type, opts: opts });
      })(preview.columns[i]);
    }
    body.appendChild(list);
    body.appendChild(el('div', 'imp-sample', preview.rows.length + ' data rows. Types are a guess — change any of them before creating the table.'));
    openDialog({
      title: 'Import CSV',
      wide: true,
      body: body,
      okLabel: 'Create table',
      onOk: function () {
        var tableName = nameInput.value.trim();
        if (!tableName) return 'Please enter a table name.';
        var columns = [];
        for (var n = 0; n < fields.length; n++) {
          var type = fields[n].type.value;
          var options = type === 'choice' ? fields[n].opts.value.split(/[\n,]/) : [];
          if (type === 'choice' && !M.cleanOptions(options).length) return 'Each Choice column needs at least one choice.';
          columns.push({ name: fields[n].name.value, type: type, options: options });
        }
        var built = M.tableFromPreview(preview, { name: tableName, columns: columns });
        db.tables.push(built.table);
        db.activeId = built.table.id;
        st.search = '';
        $('search').value = '';
        st.selected = {};
        st.active = null;
        st.edit = null;
        st.viewStart = 0;
        scheduleSave();
        render();
        var msg = 'Imported ' + built.table.rows.length + ' rows into ' + built.table.name + '.';
        if (built.skipped) msg += ' ' + built.skipped + (built.skipped === 1 ? ' value did not fit and was left blank.' : ' values did not fit and were left blank.');
        if (built.droppedRows) msg += ' ' + built.droppedRows + ' extra rows were left out (limit 5000).';
        setStatus(msg);
        return '';
      }
    });
  }

  function onFile(file) {
    if (!file || !commitEdit()) return;
    if (file.size > 2000000) {
      OfficeDialog.alert({ title: 'File too big', message: 'That CSV is over 2 MB. Split it and import a smaller file.' });
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var preview = M.previewCsv(String(reader.result || ''));
      if (!preview.ok) {
        OfficeDialog.alert({ title: 'Could not import', message: preview.message || 'That file has no rows.' });
        return;
      }
      openImport(preview, file.name);
    };
    reader.onerror = function () {
      OfficeDialog.alert({ title: 'Could not read file', message: 'The file could not be read on this device.' });
    };
    reader.readAsText(file);
  }

  function exportCsv() {
    var table = current();
    if (!table || !commitEdit()) return;
    // (before TB2) var csv = '\uFEFF' + M.toCsv(table);
    var csv = '\uFEFF' + M.toCsv(table, db);
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = el('a');
    var name = String(table.name || 'table').replace(/[^\w\- ]+/g, '').trim() || 'table';
    a.href = URL.createObjectURL(blob);
    a.download = name.replace(/\s+/g, '-') + '.csv';
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
    setStatus('Exported ' + table.name + '.');
  }

  function modeOf() {
    var table = current();
    if (!table) return 'grid';
    return st.viewMode[table.id] === 'cards' ? 'cards' : 'grid';
  }

  function setMode(mode) {
    var table = current();
    if (!table) return;
    if (!commitEdit({ silent: true })) return;
    if (st.panel && st.panel.mode === 'edit' && !commitPanel()) return;
    closePop();
    st.viewMode[table.id] = mode === 'cards' ? 'cards' : 'grid';
    st.viewStart = 0;
    render({ focus: true });
    scheduleSave();
  }

  function fillLinkCell(td, row, col, active) {
    if (active) {
      td.classList.add('active');
      td.classList.add('selected');
    }
    td.setAttribute('aria-selected', active ? 'true' : 'false');
    td.tabIndex = active ? 0 : -1;
    var text = M.display('link', row.cells[col.id], col, db);
    td.appendChild(el('span', 'val' + (text ? '' : ' muted'), text || 'Choose'));
    td.addEventListener('click', function () { openLinkPickerForCell(row, col, td); });
    td.addEventListener('keydown', function (e) { onCellKey(e, row, col); });
  }

  function openLinkPickerForCell(row, col, anchor) {
    if (st.edit && !commitEdit({ silent: true })) return;
    st.active = { rowId: row.id, colId: col.id };
    var hold = anchor && anchor.getBoundingClientRect ? anchor : $('grid-wrap');
    openLinkPicker(col, row.cells[col.id], hold, function (value) {
      var res = M.setCell(current(), row.id, col.id, value, db);
      if (!res.ok) {
        setStatus(res.message + '. The previous value was kept.');
        render({ focus: true });
        return;
      }
      scheduleSave();
      render({ focus: true });
    });
  }

  function openLinkPicker(col, selected, anchor, onPick) {
    closePop();
    var target = M.findTable(db, col.linkTable);
    var box = el('div', 'pop filter-pop link-pop');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', col.multiple ? 'Choose records' : 'Choose a record');
    var heading = col.multiple ? 'Choose records' : 'Choose a record';
    if (target) heading += ' from ' + target.name;
    box.appendChild(el('div', 'pop-title', heading));
    if (!target) {
      box.appendChild(el('p', 'hint-block', 'The linked table is missing. Use Link settings to pick a table.'));
      var shut = el('button', null, 'Close');
      shut.type = 'button';
      shut.addEventListener('click', closePop);
      box.appendChild(shut);
    } else {
      var search = el('input');
      search.type = 'search';
      search.placeholder = 'Search ' + target.name;
      search.setAttribute('aria-label', 'Search ' + target.name);
      search.autocomplete = 'off';
      var list = el('div', 'link-list');
      var chosen = {};
      var initial = selected == null || selected === '' ? [] : (Array.isArray(selected) ? selected.slice() : [selected]);
      for (var i = 0; i < initial.length; i++) chosen[initial[i]] = 1;
      function paint() {
        list.textContent = '';
        var choices = M.linkChoices(db, col, search.value);
        var cap = 80;
        var shown = choices.slice(0, cap);
        if (!shown.length) {
          list.appendChild(el('p', 'hint-block', target.rows.length ? 'No records match.' : 'No records in ' + target.name + ' yet.'));
          return;
        }
        for (var n = 0; n < shown.length; n++) {
          (function (choice) {
            var button = el('button', 'pop-item' + (chosen[choice.id] ? ' on' : ''), choice.label);
            button.type = 'button';
            button.setAttribute('aria-pressed', chosen[choice.id] ? 'true' : 'false');
            button.addEventListener('click', function () {
              if (!col.multiple) {
                closePop();
                onPick(choice.id);
                return;
              }
              if (chosen[choice.id]) delete chosen[choice.id];
              else chosen[choice.id] = 1;
              button.classList.toggle('on', !!chosen[choice.id]);
              button.setAttribute('aria-pressed', chosen[choice.id] ? 'true' : 'false');
            });
            list.appendChild(button);
          })(shown[n]);
        }
        if (choices.length > cap) {
          list.appendChild(el('p', 'hint-block', 'Showing ' + cap + ' of ' + choices.length + '. Type to narrow.'));
        }
      }
      search.addEventListener('input', paint);
      search.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowDown') return;
        var first = list.querySelector('button');
        if (!first) return;
        e.preventDefault();
        first.focus();
      });
      box.appendChild(search);
      box.appendChild(list);
      paint();
      var actions = el('div', 'pop-actions');
      var clear = el('button', null, 'Clear');
      clear.type = 'button';
      clear.addEventListener('click', function () {
        closePop();
        onPick(null);
      });
      actions.appendChild(clear);
      if (col.multiple) {
        var done = el('button', null, 'Done');
        done.type = 'button';
        done.addEventListener('click', function () {
          var out = [];
          var seen = {};
          for (var p = 0; p < initial.length; p++) {
            if (chosen[initial[p]] && !seen[initial[p]]) {
              out.push(initial[p]);
              seen[initial[p]] = 1;
            }
          }
          var all = M.linkChoices(db, col, '');
          for (var k = 0; k < all.length; k++) {
            if (chosen[all[k].id] && !seen[all[k].id]) out.push(all[k].id);
          }
          closePop();
          onPick(out.length ? out : null);
        });
        actions.appendChild(done);
      }
      box.appendChild(actions);
      box._focus = search;
    }
    box.setAttribute('data-for', 'link:' + col.id);
    document.body.appendChild(box);
    placePop(box, anchor || $('grid-wrap'));
    pop = box;
    if (box._focus) box._focus.focus();
    else {
      var fallback = box.querySelector('button');
      if (fallback) fallback.focus();
    }
  }

  function askLink(existing) {
    var body = el('div');
    var label = el('label', 'dlg-label');
    label.appendChild(el('span', null, 'Table this column links to'));
    var sel = el('select', 'dlg-input');
    for (var i = 0; i < db.tables.length; i++) {
      var opt = el('option', null, db.tables[i].name);
      opt.value = db.tables[i].id;
      sel.appendChild(opt);
    }
    if (existing && existing.linkTable) sel.value = existing.linkTable;
    label.appendChild(sel);
    body.appendChild(label);
    var multiLab = el('label', 'dlg-label check-line');
    var multi = document.createElement('input');
    multi.type = 'checkbox';
    multi.checked = !!(existing && existing.multiple);
    multiLab.appendChild(multi);
    multiLab.appendChild(el('span', null, 'Allow more than one link'));
    body.appendChild(multiLab);
    return openDialog({
      title: 'Link column',
      message: 'A cell stores the other record’s id and shows that table’s first column.',
      body: body,
      okLabel: 'Save',
      onOk: function () { return sel.value ? '' : 'Choose a table.'; }
    }).then(function (ok) {
      if (!ok) return null;
      return { linkTable: sel.value, multiple: !!multi.checked };
    });
  }

  function renderCards(opts) {
    var tools = $('card-tools');
    var host = $('cards');
    var top = host.scrollTop;
    tools.textContent = '';
    host.textContent = '';
    var table = current();
    if (!table) {
      host.appendChild(el('p', 'hint-block', 'No tables yet. Add a table to start.'));
      return;
    }
    for (var c = 0; c < table.columns.length; c++) tools.appendChild(cardTool(table, table.columns[c]));
    if (!table.columns.length) {
      host.appendChild(el('p', 'hint-block', 'Add a column to start. Each column has one type: Text, Number, Date, Yes/No, Choice or Link.'));
      return;
    }
    var all = matching();
    var view = windowed(all);
    if (view.start > 0) host.appendChild(pagerButton('Show earlier records', -1));
    if (!view.rows.length) {
      host.appendChild(el('p', 'hint-block', table.rows.length
        ? 'No records match. Change the search or clear a column filter.'
        : 'This table is empty. New record adds one. Search, filters and sort apply to these cards.'));
    }
    for (var r = 0; r < view.rows.length; r++) host.appendChild(recordCard(table, view.rows[r], view.start + r));
    if (view.start + view.rows.length < view.total) host.appendChild(pagerButton('Show later records', 1));
    host.scrollTop = top;
    if (opts && opts.focus) {
      var cards = host.querySelectorAll('.record-card');
      var target = null;
      for (var i = 0; i < cards.length; i++) {
        if (st.active && cards[i].getAttribute('data-row') === st.active.rowId) target = cards[i];
      }
      if (!target && cards[0]) target = cards[0];
      if (target) target.focus();
    }
  }

  function cardTool(table, col) {
    var sort = st.sort[table.id];
    var dir = sort && sort.colId === col.id ? sort.dir : '';
    var wrap = el('div', 'card-tool');
    var sortBtn = el('button', 'col-name');
    sortBtn.type = 'button';
    sortBtn.title = 'Sort ' + M.headerLabel(col);
    /* (before TB4)
    sortBtn.appendChild(el('span', null, col.name));
    sortBtn.appendChild(el('small', null, M.TYPE_LABELS[col.type] + (dir === 'asc' ? ' ▲' : dir === 'desc' ? ' ▼' : '')));
    */
    sortBtn.appendChild(columnLabel(col, dir));
    sortBtn.addEventListener('click', function () { toggleSort(col.id); });
    var filterBtn = el('button', 'icon-btn' + (filterIsOn(table, col) ? ' on' : ''), '▾');
    filterBtn.type = 'button';
    filterBtn.title = 'Filter ' + col.name;
    filterBtn.setAttribute('aria-label', 'Filter ' + col.name);
    filterBtn.addEventListener('click', function () {
      if (pop && pop.getAttribute('data-for') === 'filter:' + col.id) { closePop(); return; }
      openFilter(col, filterBtn);
    });
    wrap.appendChild(sortBtn);
    wrap.appendChild(filterBtn);
    return wrap;
  }

  function recordCard(table, row, index) {
    var card = el('article', 'record-card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('data-row', row.id);
    card.setAttribute('aria-label', 'Open record ' + (index + 1));
    if ((st.panel && st.panel.rowId === row.id) || (st.active && st.active.rowId === row.id)) card.classList.add('on');
    for (var i = 0; i < table.columns.length; i++) {
      var col = table.columns[i];
      var line = el('div', 'fld');
      line.appendChild(el('b', null, col.name));
      var text = M.display(col.type, row.cells[col.id], col, db);
      line.appendChild(el('span', text ? null : 'muted', text || '—'));
      card.appendChild(line);
    }
    function open() {
      if (table.columns.length) st.active = { rowId: row.id, colId: table.columns[0].id };
      openRecord(row.id);
    }
    card.addEventListener('click', open);
    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var cards = $('cards').querySelectorAll('.record-card');
        var idx = 0;
        for (var n = 0; n < cards.length; n++) if (cards[n] === card) idx = n;
        var step = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
        var next = cards[idx + step];
        if (next) next.focus();
      }
    });
    return card;
  }

  function pagerButton(label, dir) {
    var button = el('button', 'more-btn', label);
    button.type = 'button';
    button.addEventListener('click', function () {
      if (!commitEdit({ silent: true })) return;
      var total = matching().length;
      st.viewStart = Math.max(0, Math.min(Math.max(0, total - CAP), st.viewStart + dir * CAP));
      st.active = null;
      render();
    });
    return button;
  }

  function openRecord(rowId) {
    if (!commitEdit()) return;
    closePop();
    st.panel = { mode: 'edit', rowId: rowId, editors: [] };
    render();
    showPanel();
  }

  function openNewRecord() {
    var table = current();
    if (!table) { setStatus('Add a table first.'); return; }
    if (!table.columns.length) { setStatus('Add a column first.'); return; }
    if (!commitEdit()) return;
    if (st.panel && st.panel.mode === 'edit' && !commitPanel()) return;
    closePop();
    st.panel = { mode: 'new', rowId: null, drafts: {}, editors: [] };
    render();
    showPanel();
  }

  function closePanel() {
    st.panel = null;
    var host = $('record-panel');
    if (host) host.hidden = true;
  }

  function showPanel() {
    var host = $('record-panel');
    if (!host || !st.panel) return;
    host.hidden = false;
    fillPanel();
    var first = $('record-body').querySelector('input, select, textarea, button');
    if (first) first.focus();
    else $('record-close').focus();
  }

  function panelRow() {
    if (!st.panel || st.panel.mode !== 'edit') return null;
    var table = current();
    return table ? M.findRow(table, st.panel.rowId) : null;
  }

  function fieldValue(col) {
    if (!st.panel) return null;
    if (st.panel.mode === 'new') {
      if (st.panel.drafts && Object.prototype.hasOwnProperty.call(st.panel.drafts, col.id)) return st.panel.drafts[col.id];
      return null;
    }
    var row = panelRow();
    return row ? row.cells[col.id] : null;
  }

  function fillPanel() {
    var table = current();
    var body = $('record-body');
    body.textContent = '';
    if (!table || !st.panel) { closePanel(); return; }
    if (st.panel.mode === 'edit' && !panelRow()) {
      closePanel();
      setStatus('That record is no longer in this table.');
      return;
    }
    var rows = matching();
    var editing = st.panel.mode === 'edit';
    $('record-save').hidden = editing;
    $('record-delete').hidden = !editing;
    $('record-prev').hidden = !editing;
    $('record-next').hidden = !editing;
    if (!editing) $('record-title').textContent = 'New record';
    else {
      var idx = -1;
      for (var i = 0; i < rows.length; i++) if (rows[i].id === st.panel.rowId) idx = i;
      $('record-title').textContent = idx === -1 ? 'Record' : 'Record ' + (idx + 1) + ' of ' + rows.length;
      $('record-prev').disabled = !rows.length || idx === 0;
      $('record-next').disabled = !rows.length || (idx >= 0 && idx >= rows.length - 1);
    }
    st.panel.editors = [];
    if (!table.columns.length) {
      body.appendChild(el('p', 'hint-block', 'Add a column before editing this record.'));
      return;
    }
    for (var c = 0; c < table.columns.length; c++) body.appendChild(panelField(table.columns[c]));
    if (editing) body.appendChild(backlinkSection(table, panelRow()));
  }

  function panelField(col) {
    var wrap = el('div', 'record-field');
    var lab = el('label', null, col.name);
    lab.appendChild(el('small', null, ' · ' + (M.TYPE_LABELS[col.type] || col.type)));
    wrap.appendChild(lab);
    var value = fieldValue(col);
    var hint = el('div', 'hint');
    hint.hidden = true;
    var editor = { col: col, hint: hint, read: function () { return null; }, focus: function () {} };
    if (col.type === 'yesno') {
      var box = document.createElement('input');
      box.type = 'checkbox';
      var state = value === true ? true : (value === false ? false : null);
      box.checked = state === true;
      box.indeterminate = state == null;
      box.setAttribute('aria-label', col.name);
      box.addEventListener('click', function (e) {
        e.preventDefault();
        state = state !== true;
        box.checked = state === true;
        box.indeterminate = false;
        commitEditor(editor);
      });
      editor.read = function () { return state; };
      editor.focus = function () { box.focus(); };
      wrap.appendChild(box);
    } else if (col.type === 'choice') {
      var sel = document.createElement('select');
      sel.setAttribute('aria-label', col.name);
      var blank = el('option', null, '—');
      blank.value = '';
      sel.appendChild(blank);
      var options = col.options || [];
      for (var i = 0; i < options.length; i++) {
        var opt = el('option', null, options[i]);
        opt.value = options[i];
        sel.appendChild(opt);
      }
      sel.value = value || '';
      editor.read = function () { return sel.value; };
      editor.focus = function () { sel.focus(); };
      sel.addEventListener('change', function () { commitEditor(editor); });
      wrap.appendChild(sel);
    } else if (col.type === 'link') {
      var currentLink = value;
      var button = el('button', 'link-pick', M.display('link', currentLink, col, db) || 'Choose');
      button.type = 'button';
      button.addEventListener('click', function () {
        openLinkPicker(col, currentLink, button, function (picked) {
          currentLink = picked;
          button.textContent = M.display('link', currentLink, col, db) || 'Choose';
          commitEditor(editor);
        });
      });
      editor.read = function () { return currentLink; };
      editor.focus = function () { button.focus(); };
      wrap.appendChild(button);
    } else if (col.type === 'text') {
      var area = el('textarea');
      area.value = value == null ? '' : String(value);
      area.setAttribute('aria-label', col.name);
      editor.read = function () { return area.value; };
      editor.focus = function () { area.focus(); };
      area.addEventListener('blur', function () { commitEditor(editor); });
      wrap.appendChild(area);
    } else {
      var input = el('input');
      /* (before TB4)
      input.type = col.type === 'date' ? 'date' : 'text';
      if (col.type === 'number') input.inputMode = 'decimal';
      if (col.type === 'date') input.value = /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : '';
      else input.value = value == null ? '' : M.display(col.type, value, col, db);
      */
      input.type = 'text';
      if (col.type === 'number') input.inputMode = 'decimal';
      if (col.type === 'date') {
        input.placeholder = '2026-11-11, 11/11/2026 or 11 Nov 2026';
        input.autocomplete = 'off';
        input.spellcheck = false;
      }
      input.value = value == null ? '' : M.display(col.type, value, col, db);
      input.setAttribute('aria-label', col.name);
      input.autocomplete = 'off';
      editor.read = function () { return input.value; };
      editor.focus = function () { input.focus(); };
      input.addEventListener('change', function () { commitEditor(editor); });
      input.addEventListener('blur', function () { commitEditor(editor); });
      wrap.appendChild(input);
    }
    wrap.appendChild(hint);
    st.panel.editors.push(editor);
    return wrap;
  }

  function commitEditor(editor) {
    if (!st.panel || !editor) return false;
    var table = current();
    if (!table) return false;
    var res = M.validate(editor.col.type, editor.read(), editor.col.options, {
      db: db,
      linkTable: editor.col.linkTable,
      multiple: !!editor.col.multiple
    });
    if (!res.ok) {
      editor.hint.hidden = false;
      editor.hint.textContent = res.message + ' — not saved';
      setStatus(res.message + '. The previous value was kept.');
      return false;
    }
    editor.hint.hidden = true;
    editor.hint.textContent = '';
    if (st.panel.mode === 'new') {
      if (!st.panel.drafts) st.panel.drafts = {};
      st.panel.drafts[editor.col.id] = res.value;
      return true;
    }
    var row = panelRow();
    if (!row) return false;
    if (JSON.stringify(row.cells[editor.col.id]) === JSON.stringify(res.value)) return true;
    var set = M.setCell(table, row.id, editor.col.id, res.value, db);
    if (!set.ok) {
      editor.hint.hidden = false;
      editor.hint.textContent = set.message + ' — not saved';
      setStatus(set.message + '. The previous value was kept.');
      return false;
    }
    scheduleSave();
    render({ keepPanel: true });
    return true;
  }

  function commitPanel() {
    var table = current();
    if (!st.panel || !table) return false;
    var editors = st.panel.editors || [];
    var planned = [];
    var bad = false;
    for (var i = 0; i < editors.length; i++) {
      var ed = editors[i];
      var res = M.validate(ed.col.type, ed.read(), ed.col.options, {
        db: db,
        linkTable: ed.col.linkTable,
        multiple: !!ed.col.multiple
      });
      if (!res.ok) {
        bad = true;
        ed.hint.hidden = false;
        ed.hint.textContent = res.message + ' — not saved';
      } else {
        ed.hint.hidden = true;
        ed.hint.textContent = '';
        planned.push({ col: ed.col, value: res.value });
      }
    }
    if (bad) return false;
    if (st.panel.mode === 'new') {
      var drafts = {};
      for (var d = 0; d < planned.length; d++) drafts[planned[d].col.id] = planned[d].value;
      st.panel.drafts = drafts;
      return true;
    }
    var row = panelRow();
    if (!row) return false;
    for (var p = 0; p < planned.length; p++) {
      var set = M.setCell(table, row.id, planned[p].col.id, planned[p].value, db);
      if (!set.ok) {
        setStatus(set.message + '. The previous value was kept.');
        return false;
      }
    }
    scheduleSave();
    return true;
  }

  function focusPanelError() {
    var editors = (st.panel && st.panel.editors) || [];
    for (var i = 0; i < editors.length; i++) {
      if (!editors[i].hint.hidden) {
        editors[i].focus();
        return;
      }
    }
  }

  function saveNewRecord() {
    if (!st.panel || st.panel.mode !== 'new') return;
    if (!commitPanel()) { focusPanelError(); return; }
    var table = current();
    var row = M.addRow(table, st.panel.drafts, db);
    var rows = matching();
    var visible = false;
    for (var i = 0; i < rows.length; i++) if (rows[i].id === row.id) visible = true;
    if (!visible) {
      st.search = '';
      $('search').value = '';
      st.filters[table.id] = {};
      setStatus('Search and filters were cleared so the new record is visible.');
    }
    st.panel = { mode: 'edit', rowId: row.id, editors: [] };
    if (table.columns.length) st.active = { rowId: row.id, colId: table.columns[0].id };
    scheduleSave();
    render();
    showPanel();
    if (visible) setStatus('Record added.');
  }

  function stepRecord(dir) {
    if (!st.panel || st.panel.mode !== 'edit') return;
    if (!commitPanel()) { focusPanelError(); return; }
    var rows = matching();
    var idx = -1;
    for (var i = 0; i < rows.length; i++) if (rows[i].id === st.panel.rowId) idx = i;
    var next = idx === -1 ? (dir > 0 ? rows[0] : rows[rows.length - 1]) : rows[idx + dir];
    if (!next) return;
    st.panel = { mode: 'edit', rowId: next.id, editors: [] };
    var table = current();
    if (table && table.columns.length) st.active = { rowId: next.id, colId: table.columns[0].id };
    render();
    showPanel();
  }

  function deleteOpenRecord() {
    if (!st.panel || st.panel.mode !== 'edit') return;
    var table = current();
    var row = panelRow();
    if (!table || !row) return;
    var pointed = M.linksPointingAt(db, table.id, [row.id]);
    var message = 'Delete this record?';
    if (pointed === 1) message += ' 1 link to it will be cleared.';
    else if (pointed > 1) message += ' ' + pointed + ' links to it will be cleared.';
    var rowId = row.id;
    OfficeDialog.confirm({
      title: 'Delete record',
      message: message,
      okLabel: 'Delete record',
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      var rows = matching();
      var idx = -1;
      for (var i = 0; i < rows.length; i++) if (rows[i].id === rowId) idx = i;
      M.deleteRows(table, [rowId], db);
      scheduleSave();
      var after = matching();
      var neighbor = after[idx] || after[idx - 1] || null;
      if (neighbor) {
        st.panel = { mode: 'edit', rowId: neighbor.id, editors: [] };
        if (table.columns.length) st.active = { rowId: neighbor.id, colId: table.columns[0].id };
        render();
        showPanel();
      } else {
        closePanel();
        st.active = null;
        render();
      }
      setStatus('Record deleted.');
    });
  }

  function backlinkSection(table, row) {
    var section = el('section', 'backlinks');
    section.appendChild(el('h3', null, 'Linked from'));
    var items = row ? M.backlinks(db, table.id, row.id) : [];
    if (!items.length) {
      section.appendChild(el('p', 'muted', 'No other records link here.'));
      return section;
    }
    var list = el('ul', 'back-list');
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var li = el('li');
        var button = el('button', 'back-link', item.tableName + ' · ' + item.columnName + ' — ' + item.label);
        button.type = 'button';
        button.addEventListener('click', function () { jumpTo(item.tableId, item.rowId); });
        li.appendChild(button);
        list.appendChild(li);
      })(items[i]);
    }
    section.appendChild(list);
    return section;
  }

  function jumpTo(tableId, rowId) {
    if (st.panel && st.panel.mode === 'edit' && !commitPanel()) { focusPanelError(); return; }
    if (db.activeId !== tableId) {
      db.activeId = tableId;
      st.search = '';
      $('search').value = '';
      st.selected = {};
      st.anchor = null;
      st.viewStart = 0;
      scheduleSave();
    }
    st.panel = { mode: 'edit', rowId: rowId, editors: [] };
    var table = current();
    if (table && table.columns.length) st.active = { rowId: rowId, colId: table.columns[0].id };
    render();
    showPanel();
  }

  function trapPanelTab(e) {
    if (e.key !== 'Tab' || $('record-panel').hidden) return;
    var nodes = $('record-panel').querySelectorAll('button, input, select, textarea');
    var list = [];
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].disabled || nodes[i].hidden) continue;
      if (nodes[i].offsetParent === null) continue;
      list.push(nodes[i]);
    }
    if (!list.length) return;
    if (e.shiftKey && document.activeElement === list[0]) {
      e.preventDefault();
      list[list.length - 1].focus();
    } else if (!e.shiftKey && document.activeElement === list[list.length - 1]) {
      e.preventDefault();
      list[0].focus();
    }
  }

  function bind() {
    $('btn-view-grid').addEventListener('click', function () { setMode('grid'); });
    $('btn-view-cards').addEventListener('click', function () { setMode('cards'); });
    $('btn-new-record').addEventListener('click', openNewRecord);
    $('record-close').addEventListener('click', function () {
      if (st.panel && st.panel.mode === 'edit' && !commitPanel()) return;
      closePanel();
      render({ focus: true });
    });
    $('record-prev').addEventListener('click', function () { stepRecord(-1); });
    $('record-next').addEventListener('click', function () { stepRecord(1); });
    $('record-delete').addEventListener('click', deleteOpenRecord);
    $('record-save').addEventListener('click', saveNewRecord);
    $('record-panel').addEventListener('mousedown', function (e) {
      if (e.target !== $('record-panel')) return;
      if (st.panel && st.panel.mode === 'edit' && !commitPanel()) return;
      closePanel();
      render({ focus: true });
    });
    $('record-panel').addEventListener('keydown', trapPanelTab);
    $('cards').addEventListener('keydown', function (e) {
      if (e.target !== $('cards')) return;
      var card = $('cards').querySelector('.record-card');
      if (!card) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        card.focus();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        card.click();
      }
    });
    $('btn-add-row').addEventListener('click', addRow);
    $('btn-del-row').addEventListener('click', deleteRows);
    $('btn-add-col').addEventListener('click', addColumn);
    $('btn-rename').addEventListener('click', renameTable);
    $('btn-del-table').addEventListener('click', deleteTable);
    $('btn-add-table').addEventListener('click', addTable);
    $('btn-import').addEventListener('click', function () { $('file-import').click(); });
    $('btn-export').addEventListener('click', exportCsv);
    $('file-import').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (file) onFile(file);
    });
    $('search').addEventListener('focus', function () {
      if (st.edit && !commitEdit()) $('search').blur();
      if (st.panel && !commitPanel()) {
        $('search').blur();
        focusPanelError();
      }
    });
    $('search').addEventListener('input', function (e) {
      if (st.edit) return;
      st.search = e.target.value;
      st.viewStart = 0;
      render();
    });
    var themes = document.querySelectorAll('.theme button');
    for (var i = 0; i < themes.length; i++) {
      themes[i].addEventListener('click', function (e) {
        db.theme = e.currentTarget.getAttribute('data-theme');
        applyTheme();
        scheduleSave();
      });
    }
    document.addEventListener('mousedown', function (e) {
      if (pop && !pop.contains(e.target)) closePop();
    });
    $('grid-wrap').addEventListener('keydown', function (e) {
      if (e.target !== $('grid-wrap')) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Enter') return;
      var table = current();
      var rows = matching();
      if (!table || !table.columns.length || !rows.length) return;
      e.preventDefault();
      var index = Math.min(st.viewStart, rows.length - 1);
      var row = rows[index];
      var col = table.columns[0];
      st.active = { rowId: row.id, colId: col.id };
      if (e.key === 'Enter') beginEdit(row, col);
      else render({ focus: true });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && pop) {
        e.preventDefault();
        closePop();
        return;
      }
      if (e.key === 'Escape' && st.panel && !$('record-panel').hidden) {
        if (document.querySelector('dialog[open]')) return;
        e.preventDefault();
        if (st.panel.mode === 'edit' && !commitPanel()) return;
        closePanel();
        render({ focus: true });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S') && !e.altKey) {
        if (document.querySelector('dialog[open]')) return;
        e.preventDefault();
        if (st.edit && !commitEdit()) return;
        clearTimeout(saveTimer);
        if (window.TABLES_HOT) TABLES_HOT.save({ explicit: true, saveAs: !!e.shiftKey });
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        if (e.target && e.target.tagName === 'TEXTAREA' && !$('record-panel').contains(e.target)) return;
        if (document.querySelector('dialog[open]')) return;
        e.preventDefault();
        if (st.edit && !commitEdit()) return;
        $('search').focus();
        var field = $('search');
        if (field.select) field.select();
      }
    });
    window.addEventListener('pagehide', persist);
    if (window.matchMedia) {
      var mq = matchMedia('(prefers-color-scheme: dark)');
      var onScheme = function () { if ((db.theme || 'auto') === 'auto') applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onScheme);
      else if (mq.addListener) mq.addListener(onScheme);
    }
    window.addEventListener('storage', function (e) {
      if (e.key === 'sites-hub.theme' && (db.theme || 'auto') === 'auto') applyTheme();
    });
  }

  function captureHot(session) {
    var tables = [];
    var i;
    for (i = 0; i < db.tables.length; i++) {
      var t = db.tables[i];
      tables.push({
        id: t.id,
        name: t.name,
        view: st.viewMode[t.id] === 'cards' ? 'cards' : 'grid',
        columns: t.columns,
        rows: t.rows
      });
    }
    return {
      created: session && session.created ? session.created : 0,
      activeId: db.activeId,
      settings: { theme: db.theme || 'auto' },
      tables: tables
    };
  }

  function applyHot(doc) {
    var built = window.TablesHot && TablesHot.toDb ? TablesHot.toDb(doc) : null;
    if (!built || !built.db) return;
    db = built.db;
    st.viewMode = built.views || {};
    st.search = '';
    st.filters = {};
    st.sort = {};
    st.selected = {};
    st.anchor = null;
    st.active = null;
    st.edit = null;
    st.viewStart = 0;
    st.banner = '';
    closePanel();
    closePop();
    var search = $('search');
    if (search) search.value = '';
    render();
  }

  function boot() {
    /* (before HOT1) localStorage tables-v1 load. HOT1 does not migrate that key.
    var loaded;
    try { loaded = M.loadFrom(localStorage); }
    catch (e) { loaded = { db: M.blankDb(), error: 'blocked' }; }
    db = loaded.db;
    if (loaded.error === 'damaged') {
      st.banner = 'Saved tables could not be read. This is a new blank table. The old save stays put until you edit.';
    } else if (loaded.error === 'blocked') {
      st.banner = 'Storage is blocked in this browser. Tables will work in this tab only.';
    }
    bind();
    render();
    if (!loaded.error && !loaded.empty) setStatus('Loaded from this device');
    */
    db = M.blankDb();
    bind();
    render();
    if (window.TablesHot && TablesHot.install) {
      TablesHot.install({
        capture: captureHot,
        apply: applyHot,
        toast: setStatus,
        noteSaved: function (res) { setStatus(res && res.verb ? res.verb : 'Saved'); },
        noteFailed: function () { setStatus('Could not save.'); },
        beforeSave: function () { clearTimeout(saveTimer); }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
