/*
 * Files drives (apps/tools/files/files_drives.js) — the drives list (Local + added folders,
 * "Allow access", remove ✕ with the app's own dialog, "Add folder"), opening a drive / a path,
 * the clickable path (breadcrumb) and the hash: #drive=<id>&path=<a/b> (kept up to date with
 * replaceState so a Hub window session reopens the same drive + folder).
 * Drives and path crumbs are drop targets (drag items onto them = move, Ctrl = copy).
 * API FX.drives: draw(), open(id, fromClick, path), go(depth), up(), fromHash().
 */
(function () {
  'use strict';
  const { $, el, btn, st, say, fail } = FX;
  const D = window.FsDrives, Dlg = window.UiDialog;

  async function draw() {
    const list = await D.list();
    const rows = [];
    for (const d of list) {
      const r = el('div', 'drive' + (d.id === st.driveId ? ' on' : ''));
      r.setAttribute('role', 'listitem');
      const open = btn('drive-open', '', 'Open ' + d.name, () => openDrive(d.id, true));
      open.append(el('span', 'drive-ico', d.kind === 'local' ? '\uD83D\uDCBE' : '\uD83D\uDCC2'), el('span', 'drive-name', d.name));
      r.appendChild(open);
      FX.view.dropTarget(open, () => D.handle(d.id), d.id);
      if (d.kind === 'folder') {
        if ((await D.access(d.id)) !== 'granted') {
          r.appendChild(btn('drive-allow', 'Allow access', 'Allow access to ' + d.name, async () => { if (await D.allow(d.id)) { await draw(); openDrive(d.id, true); } }));
        }
        r.appendChild(btn('drive-x', '\u00D7', 'Remove ' + d.name + ' from the list (files stay)', async () => {
          if (!(await Dlg.confirm('Remove \u201c' + d.name + '\u201d?', 'It is only removed from this list. No files are deleted.', 'Remove'))) return;
          await D.remove(d.id);
          if (st.driveId === d.id) { st.driveId = ''; st.stack = []; FX.view.load(); }
          draw();
        }));
      }
      rows.push(r);
    }
    if (D.canAddFolder) {
      rows.push(btn('drive-add', '\uFF0B Add folder', 'Add a folder from this computer', async () => {
        const d = await D.addFolder();
        if (d) { await draw(); openDrive(d.id, true); }
      }));
    }
    if (!list.length) rows.unshift(el('p', 'drive-none', 'This browser has no file storage for web pages.'));
    $('drives').replaceChildren(...rows);
  }

  function setHash() {
    const p = st.stack.slice(1).map((s) => s.name).join('/');
    const h = st.driveId ? '#drive=' + encodeURIComponent(st.driveId) + (p ? '&path=' + encodeURIComponent(p) : '') : '';
    if (location.hash !== h) { history.replaceState(null, '', location.pathname + location.search + h); FX.hubSave(); }
  }
  function fromHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    return { id: q.get('drive') || '', path: q.get('path') || '' };
  }

  async function openDrive(id, fromClick, path) {
    say('');
    const h = await D.handle(id);
    if (!h) { fail(new Error('Drive not found')); return; }
    if ((await D.access(id)) !== 'granted' && (!fromClick || !(await D.allow(id)))) {
      st.driveId = id; st.stack = []; draw(); FX.view.load();
      say('Click \u201cAllow access\u201d to open this folder.');
      return;
    }
    const d = (await D.list()).find((x) => x.id === id);
    st.driveId = id; st.driveName = d ? d.name : h.name;
    st.stack = [{ name: st.driveName, handle: h }];
    // walk into the saved path as far as it still exists
    for (const part of String(path || '').split('/').filter(Boolean)) {
      try { st.stack.push({ name: part, handle: await st.stack[st.stack.length - 1].handle.getDirectoryHandle(part) }); } catch (_) { break; }
    }
    draw();
    go(st.stack.length - 1);
  }

  function crumbs() {
    const out = [];
    st.stack.forEach((s, i) => {
      if (i) out.push(el('span', 'crumb-sep', '\u203A'));
      const b = btn('crumb', s.name, null, () => go(i));
      if (i === st.stack.length - 1) b.setAttribute('aria-current', 'page');
      else FX.view.dropTarget(b, () => s.handle);
      out.push(b);
    });
    $('crumbs').replaceChildren(...out);
    $('up').disabled = st.stack.length < 2;
  }
  /** Show folder number `depth` of the path (0 = drive root). */
  function go(depth) {
    st.stack = st.stack.slice(0, depth + 1);
    st.sel.clear(); st.anchor = ''; st.q = '';
    $('search').value = '';
    crumbs();
    setHash();
    FX.view.load();
  }
  function up() { if (st.stack.length > 1) go(st.stack.length - 2); }
  /** Into a sub-folder of the open one. */
  function into(entry) { st.stack.push({ name: entry.name, handle: entry.handle }); go(st.stack.length - 1); }

  D.onChange(draw);
  FX.drives = { draw, open: openDrive, go, up, into, fromHash, crumbs };
})();
