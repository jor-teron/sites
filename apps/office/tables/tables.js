/*
 * Tables TB1 — grid, tabs, filters, CSV and local save.
 * Data rules live in tables_model.js. Dialogs are in-app (shared OfficeDialog
 * plus a small <dialog> for import and choice lists). No alert/confirm/prompt.
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
    banner: ''
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
    return M.visibleRows(table, st.search, filtersOf(table), st.sort[table.id] || null);
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
    saveTimer = setTimeout(persist, 180);
  }

  function persist() {
    if (!dirty) return;
    try {
      localStorage.setItem(M.STORAGE_KEY, M.serialize(db));
      dirty = false;
      var cur = $('status').textContent;
      if (!cur || cur === 'Loaded from this device' || cur === 'Saved on this device') setStatus('Saved on this device');
    } catch (e) {
      setStatus('Could not save. Storage is full or blocked.');
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
    if (st.edit && st.edit.rowId === row.id && st.edit.colId === col.id && typed == null) return;
    if (!commitEdit({ silent: true })) return;
    st.active = { rowId: row.id, colId: col.id };
    if (col.type === 'yesno') {
      render({ focus: true });
      return;
    }
    if (typed != null && col.type !== 'text' && col.type !== 'number') typed = null;
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
    var n = M.deleteRows(table, ids);
    st.selected = {};
    st.active = null;
    st.anchor = null;
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
    OfficeDialog.confirm({
      title: 'Delete rows',
      message: ids.length === 1 ? 'Delete this row?' : 'Delete ' + ids.length + ' rows?',
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
    closePop();
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
    OfficeDialog.confirm({
      title: 'Delete table',
      message: 'Delete "' + table.name + '"? Its columns and rows will be removed from this device.',
      okLabel: 'Delete table',
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      M.deleteTable(db, table.id);
      st.selected = {};
      st.active = null;
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

  function applyType(col, type, options) {
    var table = current();
    var cleared = M.countRetypeClears(table, col.id, type, options);
    function go() {
      var res = M.setColumnType(table, col.id, type, options);
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
      if (v.type === col.type && v.type !== 'choice') return;
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
    var items = [
      { label: 'Rename', run: function () { renameColumn(col); } },
      { label: 'Change type', run: function () { changeType(col); } }
    ];
    if (col.type === 'choice') items.push({ label: 'Edit choices', run: function () { editChoices(col); } });
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
      input.placeholder = 'YYYY-MM-DD or DD/MM/YYYY';
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

  function headerCell(table, col) {
    var th = el('th');
    th.scope = 'col';
    var sort = st.sort[table.id];
    var dir = sort && sort.colId === col.id ? sort.dir : '';
    th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none');
    var wrap = el('div', 'col-head');
    var sortBtn = el('button', 'col-name');
    sortBtn.type = 'button';
    sortBtn.title = 'Sort ' + col.name;
    sortBtn.appendChild(el('span', null, col.name));
    sortBtn.appendChild(el('small', null, M.TYPE_LABELS[col.type] + (dir === 'asc' ? '  ▲' : dir === 'desc' ? '  ▼' : '')));
    sortBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    sortBtn.addEventListener('click', function () { toggleSort(col.id); });
    var filterBtn = el('button', 'icon-btn' + (filterIsOn(table, col) ? ' on' : ''), '▾');
    filterBtn.type = 'button';
    filterBtn.title = 'Filter ' + col.name;
    filterBtn.setAttribute('aria-label', 'Filter ' + col.name);
    filterBtn.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    filterBtn.addEventListener('click', function () {
      if (pop && pop.getAttribute('data-for') === 'filter:' + col.id) { closePop(); return; }
      openFilter(col, filterBtn);
    });
    var more = el('button', 'icon-btn', '⋯');
    more.type = 'button';
    more.title = 'Column options';
    more.setAttribute('aria-label', 'Options for ' + col.name);
    more.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    more.addEventListener('click', function () {
      if (pop && pop.getAttribute('data-for') === 'menu:' + col.id) { closePop(); return; }
      columnMenu(col, more);
    });
    wrap.appendChild(sortBtn);
    wrap.appendChild(filterBtn);
    wrap.appendChild(more);
    th.appendChild(wrap);
    return th;
  }

  function fillCell(td, row, col) {
    var editing = st.edit && st.edit.rowId === row.id && st.edit.colId === col.id;
    var active = st.active && st.active.rowId === row.id && st.active.colId === col.id;
    if (active) td.classList.add('active');
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
      } else if (col.type === 'date') {
        field = document.createElement('input');
        field.type = 'date';
        field.value = /^\d{4}-\d{2}-\d{2}$/.test(st.edit.draft || '') ? st.edit.draft : '';
        field.setAttribute('aria-label', col.name);
      } else {
        field = document.createElement('input');
        field.type = 'text';
        field.value = st.edit.draft == null ? '' : st.edit.draft;
        field.autocomplete = 'off';
        field.spellcheck = false;
        field.setAttribute('aria-label', col.name);
        if (col.type === 'number') field.inputMode = 'decimal';
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
    var corner = el('th', 'rowh', '#');
    corner.scope = 'col';
    head.appendChild(corner);
    for (var c = 0; c < table.columns.length; c++) head.appendChild(headerCell(table, table.columns[c]));
    thead.appendChild(head);
    if (!table.columns.length) {
      var noCol = el('tr', 'hint-row');
      var noColTd = el('td', null, 'Add a column to start. Each column has one type: Text, Number, Date, Yes/No or Choice.');
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
        var rh = el('td', 'rowh');
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
          var cell = el('td');
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
        var button = el('button', 'tab', table.name);
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
    $('search').disabled = !table;
  }

  function render(opts) {
    renderBanner();
    renderTabs();
    renderGrid(opts);
    renderCount();
    paintActions();
    applyTheme();
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
    var csv = '\uFEFF' + M.toCsv(table);
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

  function bind() {
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
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        if (e.target && e.target.tagName === 'TEXTAREA') return;
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

  function boot() {
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
