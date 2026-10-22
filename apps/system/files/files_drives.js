/*
 * Files drives (apps/system/files/files_drives.js) — the drives list (R54b: connected drives only +
 * "Manage drives" → Disk; until R54b also "Allow access", remove ✕, "Add folder"), opening a drive / a path,
 * the clickable path (breadcrumb) and the hash: #drive=<id>&path=<a/b> (kept up to date with
 * replaceState so a Hub window session reopens the same drive + folder).
 * Drives and path crumbs are drop targets (drag items onto them = move, Ctrl = copy).
 * Google Drive (kind 'gdrive'): ☁ row with "Connect" (or "Set up") until signed in; opening it
 * then shows the QR sign-in panel (#gd-panel, shared/google/gdrive_connect.js) instead of files;
 * signed in → a normal drive (Drive adapter, shared/google/gdrive_fs.js) with a ⏏ Sign out button,
 * opened at the "hub" folder of My Drive (crumb "Google Drive › hub"); "Renew" when a phone sign-in ran out.
 * API FX.drives: draw(), open(id, fromClick, path), go(depth), up(), fromHash().
 */
(function () {
  'use strict';
  const { $, el, btn, st, say, fail } = FX;
  const D = window.FsDrives, Dlg = window.UiDialog;

  /* R54b: Files only browses. The list shows CONNECTED drives (Local; added folders with access;
   * Google Drive when signed in) plus a small "Manage drives" link to Disk (apps/system/disk/), which
   * now does Add folder / Allow access / Remove / Google sign-in and sign-out. Old draw(): LEGACY below. */
  const DISK = '../disk/';
  function openDisk() {
    let hub = null;
    try { hub = window.parent !== window && window.parent.__hubOpenApp ? window.parent : null; } catch (_) { hub = null; }
    if (!(hub && hub.__hubOpenApp('apps/system/disk/') !== false)) location.href = DISK;
  }
  async function draw() {
    const list = await D.list();
    const rows = [];
    for (const d of list) {
      if (d.kind === 'gdrive' && D.gdriveState() !== 'ok') continue;
      if (d.kind === 'folder' && (await D.access(d.id)) !== 'granted') continue;
      const r = el('div', 'drive' + (d.id === st.driveId ? ' on' : ''));
      r.setAttribute('role', 'listitem');
      const open = btn('drive-open', '', 'Open ' + d.name, () => openDrive(d.id, true));
      open.append(el('span', 'drive-ico', d.kind === 'local' ? '\uD83D\uDCBE' : d.kind === 'gdrive' ? '\u2601\uFE0F' : '\uD83D\uDCC2'), el('span', 'drive-name', d.name));
      r.appendChild(open);
      FX.view.dropTarget(open, () => D.handle(d.id), d.id);
      rows.push(r);
    }
    if (!list.length) rows.unshift(el('p', 'drive-none', 'This browser has no file storage for web pages.'));
    const m = el('a', 'drive-manage', '\u2699 Manage drives'); m.href = DISK; m.id = 'manage-drives';
    m.addEventListener('click', (e) => { e.preventDefault(); openDisk(); });
    rows.push(m);
    $('drives').replaceChildren(...rows);
  }
  /** R54b: a drive that is not connected → a short note + "Open Disk" instead of the QR panel / allow button. */
  function notConnected(text) {
    const p = $('gd-panel');
    $('list').hidden = true;
    const b = btn('tb drive-allow', 'Open Disk', 'Manage drives in Disk', openDisk);
    p.replaceChildren(el('p', 'nc-text', text), b);
    p.hidden = false; p.classList.add('nc');
  }

  /* ===== LEGACY (until R54b, not run): draw() with Allow access / ✕ / Add folder / Google buttons =====
  async function draw() {
    const list = await D.list();
    const rows = [];
    for (const d of list) {
      const r = el('div', 'drive' + (d.id === st.driveId ? ' on' : ''));
      r.setAttribute('role', 'listitem');
      const open = btn('drive-open', '', 'Open ' + d.name, () => openDrive(d.id, true));
      open.append(el('span', 'drive-ico', d.kind === 'local' ? '\uD83D\uDCBE' : d.kind === 'gdrive' ? '\u2601\uFE0F' : '\uD83D\uDCC2'), el('span', 'drive-name', d.name));
      r.appendChild(open);
      if (d.kind === 'gdrive') {
        const gs = D.gdriveState();
        if (gs !== 'ok') r.appendChild(btn('drive-allow', gs === 'setup' ? 'Set up' : gs === 'renew' ? 'Renew' : 'Connect', 'Google Drive: ' + (gs === 'setup' ? 'how to set it up' : gs === 'renew' ? 'the sign-in ran out \u2014 renew it from your phone' : 'sign in'), () => openDrive('gdrive', true)));
        else r.appendChild(btn('drive-x', '\u23CF', 'Sign out of Google Drive', async () => {
          if (!(await Dlg.confirm('Sign out of Google Drive?', 'Files forgets your Google sign-in and tells Google to cancel it. Your files stay in Google Drive.', 'Sign out', true))) return;
          await window.GoogleAuth.signOut();
        }));
      }
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

  ===== end LEGACY ===== */

  function setHash() {
    const p = st.stack.slice(1).map((s) => s.name).join('/');
    const h = st.driveId ? '#drive=' + encodeURIComponent(st.driveId) + (p ? '&path=' + encodeURIComponent(p) : '') : '';
    if (location.hash !== h) { history.replaceState(null, '', location.pathname + location.search + h); FX.hubSave(); }
  }
  function fromHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    return { id: q.get('drive') || '', path: q.get('path') || '' };
  }

  /** R54b: hide the "not connected" note (the Google QR panel moved to Disk; old gdPanel is LEGACY below). */
  function gdPanel(on) {
    const p = $('gd-panel');
    if (!p || on) return;
    $('list').hidden = false; p.hidden = true; p.classList.remove('nc'); p.replaceChildren();
  }
  /* ===== LEGACY (until R54b, not run): the Google sign-in panel inside Files =====
  // Google Drive not signed in yet: the QR panel instead of the file list.
  let gdMount = null;
  function gdPanel(on) {
    const p = $('gd-panel');
    if (!p) return;
    $('list').hidden = !!on;
    if (!on) { if (gdMount) gdMount.destroy(); gdMount = null; p.hidden = true; p.replaceChildren(); return; }
    p.hidden = false;
    if (!gdMount || p.dataset.state !== D.gdriveState()) {
      if (gdMount) gdMount.destroy();
      p.dataset.state = D.gdriveState();
      gdMount = window.GDriveConnect.mount(p, { onHowto: () => say('Setup steps: Hub \u2192 Settings \u2192 How-to \u2192 Google Drive (or apps/lab/gdrive-test/README.md).') });
    }
  }
  ===== end LEGACY ===== */
  async function openDrive(id, fromClick, path) {
    say('');
    if (id === 'gdrive' && D.gdriveState() !== 'ok') {
      st.driveId = id; st.driveName = 'Google Drive'; st.stack = [];
      draw(); crumbs(); setHash(); FX.view.load();
      notConnected(D.gdriveState() === 'setup' ? 'Google Drive is not set up yet.' : D.gdriveState() === 'renew' ? 'Your Google Drive sign-in ran out. Renew it in Disk.' : 'Google Drive is not connected. Connect it in Disk.');   // R54b (was gdPanel(true))
      return;
    }
    gdPanel(false);
    let h;
    try { h = await D.handle(id); } catch (e) { st.driveId = id; st.stack = []; draw(); FX.view.load(); fail(e); return; }
    if (!h) { fail(new Error('Drive not found')); return; }
    if ((await D.access(id)) !== 'granted') {   // R54b: no allow here (was: allow on click, else 'Click Allow access')
      st.driveId = id; st.stack = []; draw(); FX.view.load();
      notConnected('\u201c' + h.name + '\u201d needs access again. Allow it in Disk.');
      return;
    }
    const d = (await D.list()).find((x) => x.id === id);
    st.driveId = id; st.driveName = d ? d.name : h.name;
    st.stack = [{ name: h.crumb || st.driveName, handle: h }];   // Google Drive: "Google Drive › hub"
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

  D.onChange(() => {
    draw();
    // signed in / out while Google Drive is the open drive → show its files / the QR again
    if (st.driveId === 'gdrive' && D.gdriveState) {
      const ok = D.gdriveState() === 'ok';
      if (ok === !st.stack.length) openDrive('gdrive', false);
    }
  });
  FX.drives = { draw, open: openDrive, go, up, into, fromHash, crumbs };
})();
