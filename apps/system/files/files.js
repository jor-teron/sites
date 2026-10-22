/*
 * Files app start-up (apps/system/files/files.js) — wires the toolbar (⇧ Up, ＋ Folder,
 * ⇪ Upload, ↻ Refresh, Select, view, sort, search) and opens the drive from the hash
 * (#drive=<id>&path=<a/b>, set by the Hub's drive tiles and kept by a window session), else Local.
 * Modules (load order): files_core, files_view, files_drives, files_actions, files_viewer, files_thumbs, files_menu.
 */
(function () {
  'use strict';
  const { $, st } = FX;
  $('up').addEventListener('click', () => FX.drives.up());
  $('refresh').addEventListener('click', () => { FX.say(''); FX.view.load(); });
  $('mkdir').addEventListener('click', () => FX.act.newFolder());
  $('upload').addEventListener('click', () => $('file-in').click());
  $('more').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (st.sel.size) FX.menu.forItems(r.left, r.bottom + 4); else FX.menu.forFolder(r.left, r.bottom + 4);
  });
  $('file-in').addEventListener('change', () => {
    const files = Array.from($('file-in').files || []);
    $('file-in').value = '';
    if (files.length) FX.act.upload(files);
  });
  window.addEventListener('hashchange', () => {
    const h = FX.drives.fromHash();
    const p = st.stack.slice(1).map((s) => s.name).join('/');
    if (h.id && (h.id !== st.driveId || h.path !== p)) FX.drives.open(h.id, false, h.path);
  });
  (async () => {
    await FX.drives.draw();
    const h = FX.drives.fromHash();
    const id = h.id || (FsDrives.hasLocal ? 'local' : '');
    if (id) FX.drives.open(id, false, h.path); else FX.view.load();
  })();
})();
