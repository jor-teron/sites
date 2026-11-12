/*
 * Files view (apps/system/files/files_view.js) — draws the open folder as big-icon grid or
 * list (toggle remembered), sorted by name / size / date modified (asc / desc, folders first,
 * remembered) and filtered by the search box. Selection: click = select, double-click / Enter
 * = open (single-click mode, FX.singleClick(): click = open; Ctrl / Shift still select),
 * Ctrl/Cmd-click = add / remove, Shift-click = range, click empty space = none;
 * touch: tap opens, a long-press selects, and while something is selected a tap adds / removes.
 * Right-click / long-press = FX.menu.
 * H123: no select ticks — the round checkbox (.chk) is gone; the highlight alone shows selection.
 * H124: mouse / pen drag on blank space = selection box (files_marquee.js; Ctrl = toggle, Shift = add).
 * Drag & drop: drag items onto a folder, a path crumb or a drive = move (Ctrl = copy);
 * drop files from the computer into the folder (or onto a sub-folder) = upload.
 * H107: status bar (#status: count, total size, selection) + sticky list column header (click = sort).
 * API FX.view: load(), render(), dropTarget(el, getDir, driveId), selectAll(), clear(), focusFirst().
 */
(function () {
  'use strict';
  const { $, el, st, size, iconEl, cur, fail } = FX;
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
    if (FX.drives && FX.drives.meter) FX.drives.meter();   // H109: usage may have changed
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

  /** H105: empty folder: big icon, text, hint, New folder + Upload (same as the toolbar buttons). */
  function emptyBox() {
    const box = el('div', 'empty empty-box');
    box.append(el('div', 'empty-ico', '\uD83D\uDCC2'), el('p', 'empty-title', 'This folder is empty'), el('p', 'empty-hint', 'Drop files here'));
    const row = el('div', 'empty-btns');
    const mk = el('button', 'btn primary', '\uFF0B New folder'); mk.type = 'button';
    mk.addEventListener('click', () => document.getElementById('mkdir').click());
    const up = el('button', 'btn', '\u21EA Upload'); up.type = 'button';
    up.addEventListener('click', () => document.getElementById('upload').click());
    row.append(mk, up); box.append(row); return box;
  }

  /* H109: a small coloured type label (TXT, PDF, PNG ...) on the file icon in grid view.
     H148: .how / .hos / .hot get their own Writer / Spreadsheet / Tables colours (Base and Slides are not in this release). */
  /* (before H148) const BADGE = [
    [/^(txt|log|rtf)$/, 'doc'], [/^(md|markdown)$/, 'md'], [/^(csv|tsv|xlsx?|ods)$/, 'sheet'], [/^pdf$/, 'pdf'],
    [/^(png|jpe?g|gif|webp|bmp|ico|avif|svg|heic)$/, 'img'], [/^(mp3|wav|ogg|m4a|flac|aac|opus)$/, 'audio'],
    [/^(mp4|webm|mkv|mov|avi|m4v)$/, 'video'], [/^(zip|7z|rar|gz|tgz|tar|bz2|xz)$/, 'zip'],
    [/^(js|mjs|cjs|ts|py|sh|c|h|cpp|java|rs|go|sql|css)$/, 'code'], [/^(html?|xml)$/, 'web'], [/^(json|ya?ml|toml|ini|cfg|conf)$/, 'data'],
    [/^(docx?|odt|pptx?|odp)$/, 'office']
  ]; */
  const BADGE = [
    [/^how$/, 'how'], [/^hos$/, 'hos'], [/^hot$/, 'hot'],   // H148
    [/^(txt|log|rtf)$/, 'doc'], [/^(md|markdown)$/, 'md'], [/^(csv|tsv|xlsx?|ods)$/, 'sheet'], [/^pdf$/, 'pdf'],
    [/^(png|jpe?g|gif|webp|bmp|ico|avif|svg|heic)$/, 'img'], [/^(mp3|wav|ogg|m4a|flac|aac|opus)$/, 'audio'],
    [/^(mp4|webm|mkv|mov|avi|m4v)$/, 'video'], [/^(zip|7z|rar|gz|tgz|tar|bz2|xz)$/, 'zip'],
    [/^(js|mjs|cjs|ts|py|sh|c|h|cpp|java|rs|go|sql|css)$/, 'code'], [/^(html?|xml)$/, 'web'], [/^(json|ya?ml|toml|ini|cfg|conf)$/, 'data'],
    [/^(docx?|odt|pptx?|odp)$/, 'office']
  ];
  function badge(name) {
    const m = /\.([a-z0-9]{1,5})$/i.exec(name);
    if (!m) return null;
    const ext = m[1].toLowerCase();
    const hit = BADGE.find((b) => b[0].test(ext));
    const b = el('span', 'badge b-' + (hit ? hit[1] : 'other'), ext === 'jpeg' ? 'JPG' : ext.slice(0, 4).toUpperCase());
    b.setAttribute('aria-hidden', 'true');
    return b;
  }

  function item(e) {
    const it = el('div', 'item' + (st.sel.has(e.name) ? ' sel' : '') + (st.clip && st.clip.mode === 'cut' && st.clip.dir === cur() && st.clip.entries.some((c) => c.name === e.name) ? ' cut' : ''));
    it.dataset.name = e.name;
    it.tabIndex = 0;
    it.setAttribute('role', 'option');
    it.setAttribute('aria-selected', st.sel.has(e.name) ? 'true' : 'false');
    it.draggable = true;
    // H123: no select tick — was: const chk = el('span', 'chk'); chk.setAttribute('aria-hidden', 'true'); it.append(chk, ...)
    // (before H148) const ico = el('span', 'item-ico', icon(e));
    const ico = iconEl(e);
    it.append(ico, el('span', 'item-name', e.name));
    if (FX.thumbs) FX.thumbs.attach(ico, e);   // R12b: preview instead of the icon (lazy)
    const bd = e.kind === 'file' ? badge(e.name) : null;   // H109: file-type label (sibling: thumbs replace ico's children)
    if (bd) it.appendChild(bd);
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
    $('view').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === st.view ? 'true' : 'false'));   // H106: lit = current view
    $('sort').value = st.sort + (st.dir === 1 ? '-asc' : '-desc');
    const keep = list.scrollTop;
    if (FX.thumbs) FX.thumbs.reset();
    if (!cur()) list.replaceChildren(el('p', 'empty', 'Pick a drive on the left.'));
    else if (!st.items.length) list.replaceChildren(emptyBox());   // H105: centred, with real buttons
    else if (!st.shown.length) list.replaceChildren(el('p', 'empty', 'Nothing matches \u201c' + st.q + '\u201d.'));
    else list.replaceChildren(...(st.view === 'list' ? [head()] : []), ...st.shown.map(item));   // H107: sticky column header
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
    $('selinfo').textContent = '';   // H107: counts moved to the status bar
    status();
    if (FX.menu && FX.menu.selBar) FX.menu.selBar();   // H108b: phone selection bar
  }

  /* H107: status bar — item count (+ files' total size), selection count + size.
     H108a: on phone hide it unless something is selected. H108b: on phone always hidden (the selection bar shows the count). */
  function status() {
    const sb = $('status');
    if (!sb) return;
    if (!cur()) { sb.hidden = true; return; }
    // if (window.matchMedia('(max-width: 639px)').matches && !st.sel.size) { sb.hidden = true; return; }   (H108a)
    if (window.matchMedia('(max-width: 639px)').matches) { sb.hidden = true; return; }   // H108b
    sb.hidden = false;
    const all = st.shown, n = all.length;
    const sum = (arr) => arr.reduce((t, e) => t + (e.kind === 'file' ? (e.size || 0) : 0), 0);
    const files = all.filter((e) => e.kind === 'file');
    let left = n + (n === 1 ? ' item' : ' items');
    if (files.length) left += ' \u00b7 ' + size(sum(all));
    sb.children[0].textContent = left;
    const sel = all.filter((e) => st.sel.has(e.name));
    const sf = sel.filter((e) => e.kind === 'file');
    sb.children[1].textContent = sel.length ? sel.length + ' selected' + (sf.length ? ' \u00b7 ' + size(sum(sel)) : '') : '';
  }

  /* H107: list-view column header (Name | Date modified | Size); click = sort, again = flip. Same state as #sort. */
  const COLS = [['name', 'Name', 'h-name'], ['modified', 'Date modified', 'h-date'], ['size', 'Size', 'h-size']];
  function head() {
    const h = el('div', 'lhead'); h.setAttribute('role', 'presentation');
    COLS.forEach(([k, label, cls]) => {
      const b = el('button', 'hcol ' + cls + (st.sort === k ? ' on' : ''));
      b.type = 'button'; b.dataset.k = k;
      b.append(el('span', '', label));
      if (st.sort === k) {
        b.insertAdjacentHTML('beforeend', '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="' + (st.dir === 1 ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6') + '"/></svg>');
        b.setAttribute('aria-sort', st.dir === 1 ? 'ascending' : 'descending');
      }
      b.title = 'Sort by ' + label.toLowerCase();
      h.appendChild(b);
    });
    return h;
  }
  function sortBy(k, d) {
    st.sort = k; st.dir = d;
    FX.setPref('sort', st.sort); FX.setPref('dir', String(st.dir));
    render();
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
    const hc = e.target.closest('.hcol');
    if (hc) { const k = hc.dataset.k; sortBy(k, st.sort === k ? -st.dir : (k === 'name' ? 1 : -1)); return; }
    if (e.target.closest('.lhead')) return;
    const it = e.target.closest('.item');
    if (!it) { if (e.target === list || e.target.classList.contains('empty')) clear(); return; }
    const name = it.dataset.name;
    // H123: no tick to click — was: if (e.target.closest('.chk')) { pick(name, 'toggle'); return; }
    if (lastPointer !== 'mouse') {
      if (st.sel.size) pick(name, 'toggle'); else FX.act.open(entryOf(it));
      return;
    }
    if (e.ctrlKey || e.metaKey) pick(name, 'toggle');
    else if (e.shiftKey) pick(name, 'range');
    else { pick(name, 'one'); if (FX.singleClick()) FX.act.open(entryOf(it)); }   // single-click mode opens
  });
  // H123: was `it && !e.target.closest('.chk') && ...` (the tick is gone)
  list.addEventListener('dblclick', (e) => {
    const it = e.target.closest('.item');
    if (it && lastPointer === 'mouse' && !FX.singleClick()) FX.act.open(entryOf(it));
  });
  list.addEventListener('contextmenu', (e) => {
    if (e.shiftKey) return;   // Shift + right-click = the browser's own menu
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
  // H106: segmented Grid | List (a click on the lit one does nothing; FX.view.toggle flips, for the menu)
  function setView(v) { if (v === st.view) return; st.view = v; FX.setPref('view', st.view); render(); }
  $('view').addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) setView(b.dataset.v); });
  $('sort').addEventListener('change', () => {
    const [k, d] = $('sort').value.split('-');
    sortBy(k, d === 'desc' ? -1 : 1);
  });
  $('search').addEventListener('input', () => { st.q = $('search').value; render(); });

  FX.view = { toggle: () => setView(st.view === 'grid' ? 'list' : 'grid'), load, render, paintSel, dropTarget, selectAll, clear, pick, focusFirst, entryOf };
})();
