/*
 * Files view (apps/tools/files/files_view.js) — draws the open folder as big-icon grid or
 * list (toggle remembered), sorted by name / size / date modified (asc / desc, folders first,
 * remembered) and filtered by the search box. Selection: click = select, double-click / Enter
 * = open, Ctrl/Cmd-click = add / remove, Shift-click = range, click empty space = none;
 * touch: tap opens, the round checkbox (or a long-press) selects, and while something is
 * selected a tap adds / removes. Right-click / long-press = FX.menu.
 * Drag & drop: drag items onto a folder, a path crumb or a drive = move (Ctrl = copy);
 * drop files from the computer into the folder (or onto a sub-folder) = upload.
 * API FX.view: load(), render(), dropTarget(el, getDir, driveId), selectAll(), clear(), focusFirst().
 */
(function () {
  'use strict';
  const { $, el, st, size, icon, cur, fail } = FX;
  const list = $('list');
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  let lastPointer = 'mouse';
  FX.drag = null;

  async function load() {
    const dir = cur();
    if (!dir) { st.items = []; render(); return; }
    try { const items = await FsOps.list(dir); if (dir !== cur()) return; st.items = items; }
    catch (e) { st.items = []; fail(e); }
    render();
  }

  function sorted() {
    const q = st.q.trim().toLowerCase();
    const arr = st.items.filter((e) => !q || e.name.toLowerCase().indexOf(q) >= 0);
    const k = st.sort, d = st.dir;
    return arr.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
      let r = 0;
      if (k === 'size') r = a.size - b.size;
      else if (k === 'modified') r = a.modified - b.modified;
      if (!r) r = coll.compare(a.name, b.name);
      return r * d;
    });
  }

  function dateText(t) {
    if (!t) return '';
    const d = new Date(t);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function item(e) {
    const it = el('div', 'item' + (st.sel.has(e.name) ? ' sel' : '') + (st.clip && st.clip.mode === 'cut' && st.clip.dir === cur() && st.clip.entries.some((c) => c.name === e.name) ? ' cut' : ''));
    it.dataset.name = e.name;
    it.tabIndex = 0;
    it.setAttribute('role', 'option');
    it.setAttribute('aria-selected', st.sel.has(e.name) ? 'true' : 'false');
    it.draggable = true;
    const chk = el('span', 'chk'); chk.setAttribute('aria-hidden', 'true');
    it.append(chk, el('span', 'item-ico', icon(e)), el('span', 'item-name', e.name));
    if (st.view === 'list') {
      it.append(el('span', 'item-date', e.kind === 'file' ? dateText(e.modified) : ''),
        el('span', 'item-size', e.kind === 'file' ? size(e.size) : ''));
    }
    it.title = e.name + (e.kind === 'file' ? '\n' + size(e.size) + (e.modified ? '\n' + dateText(e.modified) : '') : '');
    if (e.kind === 'directory') dropTarget(it, () => e.handle);
    return it;
  }

  function render() {
    st.shown = sorted();
    // drop selections that are no longer shown
    Array.from(st.sel).forEach((n) => { if (!st.shown.some((e) => e.name === n)) st.sel.delete(n); });
    list.className = 'list v-' + st.view + (st.sel.size ? ' selecting' : '');
    $('view').textContent = st.view === 'grid' ? '\u2630 List' : '\u25A6 Grid';
    $('sort').value = st.sort + (st.dir === 1 ? '-asc' : '-desc');
    const keep = list.scrollTop;
    if (!cur()) list.replaceChildren(el('p', 'empty', 'Pick a drive on the left.'));
    else if (!st.items.length) list.replaceChildren(el('p', 'empty', 'This folder is empty. Drop files here, or use \uFF0B Folder / \u21EA Upload.'));
    else if (!st.shown.length) list.replaceChildren(el('p', 'empty', 'Nothing matches \u201c' + st.q + '\u201d.'));
    else list.replaceChildren(...st.shown.map(item));
    list.scrollTop = keep;
    paintSel();
  }
  function paintSel() {
    list.querySelectorAll('.item').forEach((it) => {
      const on = st.sel.has(it.dataset.name);
      it.classList.toggle('sel', on);
      it.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    list.classList.toggle('selecting', st.sel.size > 0);
    const n = st.sel.size;
    $('selinfo').textContent = n ? n + ' selected' : (cur() ? st.shown.length + (st.shown.length === 1 ? ' item' : ' items') : '');
  }

  const entryOf = (it) => st.shown.find((e) => e.name === it.dataset.name);
  function pick(name, how) {
    if (how === 'toggle') { if (st.sel.has(name)) st.sel.delete(name); else st.sel.add(name); st.anchor = name; }
    else if (how === 'range' && st.anchor) {
      const names = st.shown.map((e) => e.name);
      let a = names.indexOf(st.anchor), b = names.indexOf(name);
      if (a < 0) a = b;
      if (a > b) [a, b] = [b, a];
      st.sel.clear();
      names.slice(a, b + 1).forEach((n) => st.sel.add(n));
    } else { st.sel.clear(); st.sel.add(name); st.anchor = name; }
    paintSel();
  }
  function selectAll() { st.shown.forEach((e) => st.sel.add(e.name)); paintSel(); }
  function clear() { st.sel.clear(); paintSel(); }

  list.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType || 'mouse'; }, true);
  list.addEventListener('click', (e) => {
    const it = e.target.closest('.item');
    if (!it) { if (e.target === list || e.target.classList.contains('empty')) clear(); return; }
    const name = it.dataset.name;
    if (e.target.closest('.chk')) { pick(name, 'toggle'); return; }
    if (lastPointer !== 'mouse') {
      if (st.sel.size) pick(name, 'toggle'); else FX.act.open(entryOf(it));
      return;
    }
    if (e.ctrlKey || e.metaKey) pick(name, 'toggle');
    else if (e.shiftKey) pick(name, 'range');
    else pick(name, 'one');
  });
  list.addEventListener('dblclick', (e) => {
    const it = e.target.closest('.item');
    if (it && !e.target.closest('.chk') && lastPointer === 'mouse') FX.act.open(entryOf(it));
  });
  list.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const it = e.target.closest('.item');
    if (it) { if (!st.sel.has(it.dataset.name)) pick(it.dataset.name, 'one'); FX.menu.forItems(e.clientX, e.clientY); }
    else { clear(); FX.menu.forFolder(e.clientX, e.clientY); }
  });
  CtxMenu.longPress(list, (e, x, y) => {
    const it = e.target.closest && e.target.closest('.item');
    if (it) { if (!st.sel.has(it.dataset.name)) pick(it.dataset.name, 'toggle'); FX.menu.forItems(x, y); }
    else FX.menu.forFolder(x, y);
  });

  /* ---------- drag & drop ---------- */
  list.addEventListener('dragstart', (e) => {
    const it = e.target.closest('.item');
    if (!it) return;
    if (!st.sel.has(it.dataset.name)) pick(it.dataset.name, 'one');
    FX.drag = { entries: FX.selected(), dir: cur(), driveId: st.driveId };
    try { e.dataTransfer.setData('text/plain', FX.drag.entries.map((x) => x.name).join('\n')); } catch (_) { /* ignore */ }
    e.dataTransfer.effectAllowed = 'copyMove';
    list.classList.add('dragging');
  });
  document.addEventListener('dragend', () => { FX.drag = null; list.classList.remove('dragging'); document.querySelectorAll('.drop-on').forEach((x) => x.classList.remove('drop-on')); });
  const hasFiles = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0;

  /** Make el accept dropped items (move, Ctrl = copy) and files from the computer (upload). */
  function dropTarget(target, getDir) {
    let depth = 0;
    target.addEventListener('dragenter', (e) => { if (!FX.drag && !hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); depth++; target.classList.add('drop-on'); });
    target.addEventListener('dragover', (e) => {
      if (!FX.drag && !hasFiles(e)) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = FX.drag ? ((e.ctrlKey || e.metaKey) ? 'copy' : 'move') : 'copy';
    });
    target.addEventListener('dragleave', (e) => { e.stopPropagation(); if (--depth <= 0) { depth = 0; target.classList.remove('drop-on'); } });
    target.addEventListener('drop', async (e) => {
      if (!FX.drag && !hasFiles(e)) return;
      e.preventDefault(); e.stopPropagation();
      depth = 0; target.classList.remove('drop-on');
      const copy = e.ctrlKey || e.metaKey;
      const drag = FX.drag, files = hasFiles(e) ? Array.from(e.dataTransfer.files || []) : [];
      FX.drag = null;
      const dir = await getDir();
      if (!dir) return;
      if (drag) FX.act.transfer(drag.entries, drag.dir, dir, copy ? 'copy' : 'move');
      else if (files.length) FX.act.upload(files, dir);
    });
  }
  dropTarget(list, () => cur());

  function focusFirst() { const f = list.querySelector('.item.sel') || list.querySelector('.item'); if (f) f.focus(); }

  // toolbar: view / sort / search
  $('view').addEventListener('click', () => { st.view = st.view === 'grid' ? 'list' : 'grid'; FX.setPref('view', st.view); render(); });
  $('sort').addEventListener('change', () => {
    const [k, d] = $('sort').value.split('-');
    st.sort = k; st.dir = d === 'desc' ? -1 : 1;
    FX.setPref('sort', st.sort); FX.setPref('dir', String(st.dir));
    render();
  });
  $('search').addEventListener('input', () => { st.q = $('search').value; render(); });

  FX.view = { load, render, paintSel, dropTarget, selectAll, clear, pick, focusFirst, entryOf };
})();
