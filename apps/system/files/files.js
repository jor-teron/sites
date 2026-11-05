/*
 * Files app start-up (apps/system/files/files.js) — wires the toolbar (H106: Back, Forward, Up,
 * New folder, Upload, Refresh, More; view / sort / search live in files_view.js) and opens the drive from the hash
 * (#drive=<id>&path=<a/b>, set by the Hub's drive tiles and kept by a window session), else Local.
 * H108a: phone More (#more-nav) opens FX.menu.forMore; search icon expands the search box on the nav-bar.
 * Modules (load order): files_core, files_view, files_marquee (H124), files_drives, files_actions, files_viewer, files_thumbs, files_menu, files_tabs (H126).
 */
(function () {
  'use strict';
  const { $, st } = FX;
  $('back').addEventListener('click', () => FX.drives.back());   // H106
  $('fwd').addEventListener('click', () => FX.drives.forward());
  $('up').addEventListener('click', () => FX.drives.up());
  $('refresh').addEventListener('click', () => { FX.say(''); FX.view.load(); });
  $('mkdir').addEventListener('click', () => FX.act.newFolder());
  $('upload').addEventListener('click', () => $('file-in').click());
  function openMore(e) {   // H108a: desktop = folder/items menu; phone (#more-nav or #more) = forMore
    const r = e.currentTarget.getBoundingClientRect();
    if (window.matchMedia('(max-width: 639px)').matches) FX.menu.forMore(r.left, r.bottom + 4);
    else if (st.sel.size) FX.menu.forItems(r.left, r.bottom + 4); else FX.menu.forFolder(r.left, r.bottom + 4);
  }
  $('more').addEventListener('click', openMore);
  $('more-nav').addEventListener('click', openMore);
  /* H108a: phone search icon expands the search box across the nav-bar; Escape / empty blur / × closes. */
  const nav = document.querySelector('.nav-bar');
  function searchOpen(on) {
    if (!nav) return;
    nav.classList.toggle('searching', !!on);
    if (on) { try { $('search').focus(); } catch (_) {} }
    else { $('search').value = ''; st.q = ''; if (FX.view && FX.view.render) FX.view.render(); }
  }
  $('search-tog').addEventListener('click', () => searchOpen(true));
  $('search-x').addEventListener('click', () => searchOpen(false));
  $('search').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); searchOpen(false); } });
  $('search').addEventListener('blur', () => {
    if (!window.matchMedia('(max-width: 639px)').matches) return;
    setTimeout(() => {   // let × click run first
      if (nav && nav.classList.contains('searching') && !$('search').value) searchOpen(false);
    }, 120);
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
    // (before H126) const id = h.id || (FsDrives.hasLocal ? 'local' : '');
    // (before H126) if (id) FX.drives.open(id, false, h.path); else FX.view.load();
    FX.tabs.init(h);   // H126: saved tabs come back (the hash wins for the open tab)
  })();
})();
