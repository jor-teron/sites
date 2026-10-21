/* ============================================================
   FILE: mybookmark_logic.js
   PROJECT: MyBookmark
   ROLE: Start-up, theme, state, events: viewer (folders, search, filter, sort, keys),
         import / export, and the manager (Edit: add, edit, move, delete, multi-select, drag-drop).
   ============================================================ */
(() => {
  const C = MB_CONFIG, D = MBData, V = MBView, $ = (id) => document.getElementById(id);
  const S = { folder: D.ROOT, query: '', domain: '', sort: 'name', view: 'cards', edit: false, sel: new Set(), open: new Set(), shown: [], dupes: null };

  /* ---------- theme: hub pref (sites-hub.theme) else the system ---------- */
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function theme() {
    let v = null; try { v = localStorage.getItem(C.hubThemeKey); } catch (_) { /* blocked */ }
    const dark = v === 'dark' ? true : v === 'light' ? false : !!(mq && mq.matches);
    document.documentElement.classList.toggle('dark', dark);
  }
  theme();
  window.addEventListener('storage', (e) => { if (!e.key || e.key === C.hubThemeKey) theme(); });
  if (mq && mq.addEventListener) mq.addEventListener('change', theme);

  /* ---------- prefs ---------- */
  function loadPrefs() { try { Object.assign(S, C.defaults, JSON.parse(localStorage.getItem(C.prefsKey)) || {}); } catch (_) { Object.assign(S, C.defaults); } S.open = new Set(S.openList || []); delete S.openList; }
  function savePrefs() { try { localStorage.setItem(C.prefsKey, JSON.stringify({ view: S.view, sort: S.sort, folder: S.folder, openList: [...S.open] })); } catch (_) { /* full */ } }

  let toastT = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }
  async function guard(fn) { try { return await fn(); } catch (e) { console.warn(e); await MBDialog.notice({ title: 'Something went wrong', message: String(e && e.message || e) }); } }

  /* ---------- render ---------- */
  function render(keepFocus) {
    if (!D.node(S.folder)) S.folder = D.ROOT;
    const fi = keepFocus ? document.activeElement && document.activeElement.dataset && document.activeElement.dataset.i : null;
    S.shown = V.items(S);
    V.tree(S); V.crumbs(S); V.list(S, S.shown);
    const df = $('domainFilter');
    df.textContent = '';
    const all = document.createElement('option'); all.value = ''; all.textContent = 'All sites'; df.appendChild(all);
    S.domains.slice(0, 300).forEach(([d, n]) => { const o = document.createElement('option'); o.value = d; o.textContent = d + ' (' + n + ')'; df.appendChild(o); });
    if (S.domain && !S.domains.some(([d]) => d === S.domain)) { const o = document.createElement('option'); o.value = S.domain; o.textContent = S.domain + ' (0)'; df.appendChild(o); }
    df.value = S.domain;
    $('sort').value = S.sort;
    $('viewCards').classList.toggle('on', S.view === 'cards'); $('viewList').classList.toggle('on', S.view === 'list');
    $('info').textContent = S.total + (S.total === 1 ? ' item' : ' items') + (S.total > S.shown.length ? ' (first ' + S.shown.length + ' shown)' : '') + ' · ' + D.count(D.ROOT) + ' bookmarks in total';
    $('editBtn').setAttribute('aria-pressed', String(S.edit)); $('editBar').hidden = !S.edit;
    $('moveSel').disabled = $('delSel').disabled = !S.sel.size;
    $('selInfo').textContent = S.sel.size ? S.sel.size + ' selected' : '';
    const nd = dupCount($('dupScope').value);
    $('dupCount').textContent = nd; $('dupBtn').disabled = !nd;
    $('dupBar').hidden = !S.dupes; $('editBar').hidden = !S.edit || !!S.dupes;
    if (S.dupes) {
      const n = S.groups.reduce((a, g) => a + g.others.length, 0);
      $('dupInfo').textContent = S.groups.length + ' groups · ' + n + ' duplicates · ' + S.sel.size + ' selected to delete (the oldest of each group is kept)';
      $('dupDelSel').disabled = !S.sel.size; $('dupRemoveAll').disabled = !n;
    }
    const atRoot = S.folder === D.ROOT || !!S.query;
    $('renameFolder').hidden = $('delFolder').hidden = atRoot;
    if (fi != null) { const x = $('items').querySelector('[data-i="' + fi + '"]'); if (x) x.focus(); }
    savePrefs();
  }
  function dupCount(scope) { return D.dupGroups(scope === 'here' && S.folder !== D.ROOT ? S.folder : null).reduce((a, g) => a + g.others.length, 0); }
  function openFolder(id) {
    S.dupes = null;
    S.folder = id; S.query = ''; $('search').value = ''; S.domain = ''; S.sel.clear();
    D.path(id).forEach((n) => S.open.add(n.id));
    drawer(false); render(); $('items').scrollTop = 0;
  }

  /* ---------- drawer (phone) ---------- */
  function drawer(on) {
    document.body.classList.toggle('drawer-open', on);
    $('drawerBack').hidden = !on; $('drawerBtn').setAttribute('aria-expanded', String(on));
  }
  $('drawerBtn').onclick = () => drawer(!document.body.classList.contains('drawer-open'));
  $('drawerBack').onclick = () => drawer(false);

  /* ---------- tree + breadcrumb clicks ---------- */
  $('tree').addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (t) { const id = t.dataset.toggle; S.open.has(id) ? S.open.delete(id) : S.open.add(id); render(); return; }
    const f = e.target.closest('[data-folder]'); if (f) openFolder(f.dataset.folder);
  });
  $('crumbs').addEventListener('click', (e) => { const f = e.target.closest('[data-folder]'); if (f) openFolder(f.dataset.folder); });

  /* ---------- items ---------- */
  let lastClick = null;
  $('items').addEventListener('click', (e) => {
    const it = e.target.closest('.item'); if (!it) return;
    const id = it.dataset.id, n = D.node(id);
    const ed = e.target.closest('[data-edit]');
    if (ed) { e.preventDefault(); e.stopPropagation(); editNode(ed.dataset.edit); return; }
    if (S.edit) {
      e.preventDefault();
      if (e.shiftKey && lastClick != null) {
        const a = +lastClick, b = +it.dataset.i; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) S.sel.add(S.shown[i].id);
      } else if (n.type === 'folder' && !e.target.classList.contains('chk') && !(e.ctrlKey || e.metaKey)) { openFolder(id); return; }
      else S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id);
      lastClick = it.dataset.i; render(true); return;
    }
    if (n.type === 'folder') openFolder(id);
  });

  /* ---------- keys: / search, arrows move, Enter opens, Backspace up ---------- */
  function cols() {
    const items = $('items').querySelectorAll('.item'); if (items.length < 2 || S.view === 'list' || S.dupes) return 1;
    const top = items[0].offsetTop; let c = 0; for (const x of items) { if (x.offsetTop !== top) break; c++; } return c;
  }
  document.addEventListener('keydown', (e) => {
    if (MBDialog.isOpen()) return;
    const tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' || tag === 'select' || tag === 'textarea';
    if (e.key === '/' && !typing) { e.preventDefault(); $('search').focus(); $('search').select(); return; }
    if (e.key === 'Escape') { if (document.body.classList.contains('drawer-open')) { drawer(false); return; } if (e.target === $('search') && S.query) { $('search').value = ''; S.query = ''; render(); return; } if (S.sel.size) { S.sel.clear(); render(); } return; }
    if (typing && !(e.target === $('search') && e.key === 'ArrowDown')) return;
    const list = [...$('items').querySelectorAll('.item')]; if (!list.length) return;
    const cur = list.indexOf(document.activeElement);
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols(), ArrowUp: -cols() }[e.key];
    if (step) {
      e.preventDefault();
      const next = cur < 0 ? 0 : Math.max(0, Math.min(list.length - 1, cur + step));
      list[next].focus(); list[next].scrollIntoView({ block: 'nearest' }); return;
    }
    if (cur < 0) return;
    const n = D.node(list[cur].dataset.id);
    if (e.key === 'Enter' && n.type === 'folder') { e.preventDefault(); openFolder(n.id); setTimeout(() => { const f = $('items').querySelector('.item'); if (f) f.focus(); }); }
    else if (e.key === 'Enter' && S.edit) { e.preventDefault(); window.open(n.url, '_blank', 'noopener'); }
    else if (e.key === ' ' && S.edit) { e.preventDefault(); S.sel.has(n.id) ? S.sel.delete(n.id) : S.sel.add(n.id); render(true); }
    else if (e.key === 'Delete' && S.edit) { e.preventDefault(); if (!S.sel.size) S.sel.add(n.id); delSelected(); }
  });
  document.addEventListener('keydown', (e) => {
    if (MBDialog.isOpen() || e.key !== 'Backspace') return;
    const tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'select') return;
    const p = D.node(S.folder); if (!S.query && p && p.parent) { e.preventDefault(); openFolder(p.parent); }
  });

  /* ---------- search, filter, sort, view ---------- */
  let st = 0;
  $('search').addEventListener('input', () => { clearTimeout(st); st = setTimeout(() => { S.dupes = null; S.query = $('search').value.trim(); S.domain = ''; S.sel.clear(); render(); }, 120); });
  $('domainFilter').onchange = () => { S.domain = $('domainFilter').value; render(); };
  $('sort').onchange = () => { S.sort = $('sort').value; render(); };
  document.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { S.view = b.dataset.view; render(); });

  /* ---------- import ---------- */
  async function importFile(file) {
    if (!file) return;
    await guard(async () => {
      if (!/\.html?$/i.test(file.name) && file.type !== 'text/html') throw new Error('"' + file.name + '" is not an .html bookmarks file.');
      const tree = MBNetscape.parse(await file.text());
      let nb = 0, nf = 0; (function c(l) { l.forEach((x) => { if (x.type === 'folder') { nf++; c(x.children); } else nb++; }); })(tree.children);
      if (!nb) throw new Error('No bookmarks found in "' + file.name + '".');
      const name = C.importFolderPrefix + new Date().toISOString().slice(0, 10);
      const o = await MBDialog.form({ title: 'Import bookmarks', message: file.name + ': ' + nb + ' bookmarks in ' + nf + ' folders.', okLabel: 'Import', fields: [
        { name: 'into', label: 'Where', type: 'radio', value: 'new', options: [{ value: 'new', label: 'Into a new folder “' + name + '”' }, { value: 'merge', label: 'Merge into All bookmarks (same folder names are joined)' }] },
        { name: 'dups', label: 'Bookmarks you already have', type: 'radio', value: 'skip', options: [{ value: 'skip', label: 'Skip them' }, { value: 'flag', label: 'Import and mark as “duplicate”' }] }] });
      if (!o) return;
      const r = await D.importTree(tree, { into: o.into, dups: o.dups, name });
      if (o.into === 'new') S.open.add(r.folderId);
      openFolder(o.into === 'new' ? r.folderId : D.ROOT);
      toast('Imported ' + r.added + ' bookmarks, ' + r.folders + ' folders' + (r.skipped ? ', skipped ' + r.skipped : '') + (r.flagged ? ', ' + r.flagged + ' marked duplicate' : ''));
    });
  }
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = (e) => { importFile(e.target.files[0]); e.target.value = ''; };
  let dragDepth = 0;
  const isFileDrag = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  window.addEventListener('dragenter', (e) => { if (isFileDrag(e)) { dragDepth++; $('dropZone').hidden = false; } });
  window.addEventListener('dragleave', (e) => { if (isFileDrag(e) && --dragDepth <= 0) { dragDepth = 0; $('dropZone').hidden = true; } });
  window.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => { if (!isFileDrag(e)) return; e.preventDefault(); dragDepth = 0; $('dropZone').hidden = true; importFile(e.dataTransfer.files[0]); });

  /* ---------- export ---------- */
  $('exportBtn').onclick = () => guard(async () => {
    let id = D.ROOT;
    if (S.folder !== D.ROOT && !S.query) {
      const o = await MBDialog.form({ title: 'Export bookmarks', okLabel: 'Export', fields: [{ name: 'what', label: 'What', type: 'radio', value: 'all', options: [{ value: 'all', label: 'All bookmarks' }, { value: 'here', label: 'Only “' + D.node(S.folder).title + '”' }] }] });
      if (!o) return; if (o.what === 'here') id = S.folder;
    }
    const html = MBNetscape.build(D.exportTree(id), C.exportTitle);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    a.download = 'bookmarks_' + new Date().toISOString().slice(0, 10) + '.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Exported ' + D.count(id) + ' bookmarks');
  });

  /* ---------- manager ---------- */
  $('editBtn').onclick = () => { S.edit = !S.edit; S.dupes = null; S.sel.clear(); render(); };

  /* ---------- duplicates: keep the oldest copy of each address, select the rest ---------- */
  function showDupes() {
    S.dupes = { wasEdit: S.dupes ? S.dupes.wasEdit : S.edit, scope: $('dupScope').value === 'here' && S.folder !== D.ROOT ? 'here' : 'all' };
    S.query = ''; $('search').value = ''; S.domain = ''; S.edit = true;
    S.sel = new Set(D.dupGroups(S.dupes.scope === 'here' ? S.folder : null).flatMap((g) => g.others.map((n) => n.id)));
    render(); $('items').scrollTop = 0;
  }
  $('dupBtn').onclick = showDupes;
  $('dupScope').onchange = () => { if (S.dupes) showDupes(); else render(); };
  $('dupDone').onclick = () => { S.edit = S.dupes.wasEdit; S.dupes = null; S.sel.clear(); render(); };
  $('dupDelSel').onclick = () => delSelected();
  $('dupRemoveAll').onclick = () => { S.sel = new Set(S.groups.flatMap((g) => g.others.map((n) => n.id))); render(); delSelected(); };
  const urlCheck = (v) => { try { const u = new URL(v); return /^(https?|ftp|file|chrome|edge|about|mailto):$/.test(u.protocol) ? null : 'Use a full address such as https://example.com'; } catch (_) { return 'Use a full address such as https://example.com'; } };
  const fixUrl = (v) => (/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : 'https://' + v);
  function folderOptions(exclude) {
    const out = [];
    (function walk(id, depth) {
      if (exclude && exclude.has(id)) return;
      const n = D.node(id); out.push({ value: id, label: '\u00a0'.repeat(depth * 3) + (depth ? '📁 ' : '📚 ') + n.title });
      D.kids(id).filter((k) => k.type === 'folder').sort((a, b) => a.title.localeCompare(b.title)).forEach((k) => walk(k.id, depth + 1));
    })(D.ROOT, 0);
    return out;
  }
  $('addBm').onclick = () => guard(async () => {
    const o = await MBDialog.form({ title: 'Add bookmark', okLabel: 'Add', fields: [
      { name: 'url', label: 'Address', type: 'url', placeholder: 'https://', required: true, check: (v) => urlCheck(fixUrl(v)) },
      { name: 'title', label: 'Name (optional)' },
      { name: 'parent', label: 'Folder', type: 'select', value: S.query ? D.ROOT : S.folder, options: folderOptions() }] });
    if (!o) return;
    const url = fixUrl(o.url);
    const dup = D.all().some((n) => n.type === 'bm' && D.normUrl(n.url) === D.normUrl(url));
    await D.addBookmark(o.parent, { url, title: o.title || D.domain(url) || url });
    render(); toast(dup ? 'Added (you already had this address)' : 'Bookmark added');
  });
  $('addFolder').onclick = () => guard(async () => {
    const name = await MBDialog.prompt({ title: 'New folder', label: 'Folder name', okLabel: 'Create' });
    if (name === null) return;
    const parent = S.query ? D.ROOT : S.folder;
    await D.addFolder(parent, name); S.open.add(parent); render(); toast('Folder created');
  });
  async function editNode(id) {
    await guard(async () => {
      const n = D.node(id);
      if (n.type === 'folder') {
        const t = await MBDialog.prompt({ title: 'Rename folder', label: 'Folder name', value: n.title, okLabel: 'Rename' });
        if (t !== null && t !== n.title) { await D.update(id, { title: t }); render(); toast('Folder renamed'); }
        return;
      }
      const o = await MBDialog.form({ title: 'Edit bookmark', okLabel: 'Save', fields: [
        { name: 'title', label: 'Name', value: n.title, required: true },
        { name: 'url', label: 'Address', type: 'url', value: n.url, required: true, check: (v) => urlCheck(fixUrl(v)) },
        { name: 'parent', label: 'Folder', type: 'select', value: n.parent, options: folderOptions() }] });
      if (!o) return;
      await D.update(id, { title: o.title, url: fixUrl(o.url), dup: false });
      if (o.parent !== n.parent) await D.move([id], o.parent);
      render(); toast('Bookmark saved');
    });
  }
  async function moveIds(ids, target) {
    const n = await D.move(ids, target); S.sel.clear(); render();
    toast(n ? 'Moved ' + n + (n === 1 ? ' item' : ' items') + ' to ' + D.node(target).title : 'Nothing to move there');
  }
  $('moveSel').onclick = () => guard(async () => {
    const ids = [...S.sel], ex = new Set(ids.filter((id) => D.node(id).type === 'folder'));
    const o = await MBDialog.form({ title: 'Move ' + ids.length + (ids.length === 1 ? ' item' : ' items'), okLabel: 'Move', fields: [{ name: 'to', label: 'To folder', type: 'select', value: S.query ? D.ROOT : S.folder, options: folderOptions(ex) }] });
    if (o) await moveIds(ids, o.to);
  });
  async function delSelected() {
    await guard(async () => {
      const ids = [...S.sel]; if (!ids.length) return;
      const nf = ids.filter((id) => D.node(id).type === 'folder'), inside = nf.reduce((a, id) => a + D.count(id), 0);
      const what = S.dupes ? (ids.length === 1 ? ' duplicate' : ' duplicates') : (ids.length === 1 ? ' item' : ' items');
      const ok = await MBDialog.confirm({ title: 'Delete ' + ids.length + what + '?', danger: true, okLabel: 'Delete',
        message: (nf.length ? nf.length + ' folder(s) with ' + inside + ' bookmarks inside will be deleted too.\n' : '') + 'This cannot be undone.' });
      if (!ok) return;
      const n = await D.remove(ids); S.sel.clear(); render(); toast('Deleted ' + n + (S.dupes ? (n === 1 ? ' duplicate' : ' duplicates') + ' (empty folders are kept)' : n === 1 ? ' item' : ' items'));
    });
  }
  $('delSel').onclick = delSelected;
  $('selAll').onclick = () => { const all = S.shown.every((n) => S.sel.has(n.id)); S.shown.forEach((n) => (all ? S.sel.delete(n.id) : S.sel.add(n.id))); render(); };
  $('renameFolder').onclick = () => editNode(S.folder);
  $('delFolder').onclick = () => guard(async () => {
    const f = D.node(S.folder);
    const ok = await MBDialog.confirm({ title: 'Delete folder “' + f.title + '”?', message: 'It has ' + D.count(f.id) + ' bookmarks inside. This cannot be undone.', okLabel: 'Delete', danger: true });
    if (!ok) return;
    const parent = f.parent; await D.remove([f.id]); openFolder(parent); toast('Folder deleted');
  });

  /* drag items (or a tree folder) onto a tree folder or a folder card to move them */
  let dragIds = null;
  document.addEventListener('dragstart', (e) => {
    if (!S.edit) return;
    const it = e.target.closest && (e.target.closest('.item') || e.target.closest('.trow'));
    if (!it) return;
    const id = it.dataset.id;
    dragIds = it.classList.contains('item') && S.sel.has(id) ? [...S.sel] : [id];
    e.dataTransfer.setData('text/x-mybookmark', dragIds.join(',')); e.dataTransfer.effectAllowed = 'move';
    it.classList.add('dragging');
  });
  document.addEventListener('dragend', () => { dragIds = null; document.querySelectorAll('.dragging, .drop').forEach((x) => x.classList.remove('dragging', 'drop')); });
  const dropTarget = (e) => { const t = e.target.closest && (e.target.closest('.trow') || e.target.closest('.item')); if (!t) return null; const n = D.node(t.dataset.id); return n && n.type === 'folder' ? t : null; };
  document.addEventListener('dragover', (e) => { if (!dragIds) return; const t = dropTarget(e); document.querySelectorAll('.drop').forEach((x) => x !== t && x.classList.remove('drop')); if (t) { e.preventDefault(); t.classList.add('drop'); } });
  document.addEventListener('drop', (e) => { if (!dragIds) return; const t = dropTarget(e); if (!t) return; e.preventDefault(); const ids = dragIds; dragIds = null; guard(() => moveIds(ids, t.dataset.id)); });

  /* ---------- start ---------- */
  (async () => {
    loadPrefs();
    try { await D.load(); } catch (e) { await MBDialog.notice({ title: 'Storage is not available', message: 'MyBookmark needs IndexedDB, which this browser blocked. (' + (e && e.message || e) + ')' }); return; }
    const m = await D.migrateLegacy().catch(() => 0);
    render();
    if (m) toast('Copied ' + m + ' bookmarks from the old Bookmark Manager');
  })();
  window.MyBookmark = { state: S, render, importFile, openFolder };
})();
