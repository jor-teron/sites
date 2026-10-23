/*
 * Desktop Files pane (hub/drives/hub_drives.js; "Drives" until R54b) — Desktop mode only. The desktop (home, seen when
 * no window covers it) is split in two: left 60% = Drives, right 40% = the QR / link tiles
 * (hub_tiles.js, see hub_drives.css). Phone mode hides this pane (Files is in Tools).
 * Drives come from shared/fs/fs_drives.js:
 *   Local       the browser's private storage for this site (OPFS), always there
 *   folders     added with "Add folder" (Chrome / Edge on a computer); after a reload they show
 *               "Allow access" (one click); ✕ only removes the folder from the list (asks with
 *               the shared dialog, shared/dialog/dialog.js)
 * Clicking a drive opens the Files app (apps/system/files/#drive=<id>) in a window, or points the
 * open Files window at it; Shift+click = a new Files window. Redraws when drives change
 * (also from the Files app, BroadcastChannel).
 * Right-click / long-press on a drive (hub_ctx.js): Open, Open in new window, Allow access (when
 * needed), Remove (added folders only).
 * Google Drive (R9a, kind 'gdrive', shared/google/*): not connected → the tile itself holds the
 * sign-in panel (gdrive_connect.js: Phone as a key / Sign in on this computer (QR method hidden); the QR
 * fills the tile, minimal padding; "Renew from phone" when a phone sign-in ran out); no client id yet
 * → "Set up Google Drive (see How-to)" (opens Settings → How-to); connected → a normal tile
 * (your Google address underneath) that opens Files, right-click → Sign out (revokes).
 * H7 (lean desktop icons): the pane is just the drive icons + names on the wallpaper (no "Files" label row, no tile
 * boxes, no "Manage drives" tile; drive management is in the Disk app: Start menu / App Hub / right-click
 * "Manage in Disk"). They flow like desktop icons (CSS: top-left, down, then the next column). A folder that needs
 * "Allow access" is greyed with a small lock, title / aria-label "Click to allow access"; the click asks as before.
 * Settings → Desktop "Show Files on the desktop" (key sites-hub.showFiles, default on, '0' = off): when off the pane
 * is empty and hidden and nothing is read (no FsDrives.list); hub_prefs.js calls HubDrives.sync() on every change (live).
 * The Google Drive sign-in panel of R9a is no longer part of this pane (Disk app); the older code is in git history.
 */
(function () {
  'use strict';
  const pane = document.getElementById('desk-drives');
  const D = window.FsDrives;
  if (!pane || !D) return;
  const FILES = 'apps/system/files/';
  const ICON = FILES + 'files_icon.png';

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function openFiles(id, newInstance) {
    const hash = 'drive=' + encodeURIComponent(id);
    const wm = window.HubWM;
    if (wm && window.HubMode && window.HubMode.isDesktop()) {
      const w = !newInstance && wm.list().find((x) => x.key === FILES);
      if (w) {
        try { w.frame.contentWindow.location.hash = hash; } catch (_) { /* not loaded yet */ }
        wm.focus(w);
        return;
      }
      const app = (window.HUB_APPS || []).find((a) => a.entryUrl === FILES) || { name: 'Files', entryUrl: FILES, newTab: false };
      wm.open({ key: FILES, name: app.name || 'Files', icon: ICON, url: FILES + '#' + hash, app, newInstance: !!newInstance });
      return;
    }
    if (window.__hubOpenApp) window.__hubOpenApp(FILES);
  }

  async function allowDrive(d) {
    if (await D.allow(d.id)) { draw(); openFiles(d.id); }
  }

  /* R54b: the pane is "Files": only CONNECTED drives (Local always; added folders with access;
   * Google Drive when signed in; R56: added folders that need access again show greyed, click = Allow access).
   * Managing drives (Add folder, Allow access, Remove, Google sign-in / sign-out) is in the Disk app
   * (apps/system/disk/); the right-click "Manage in Disk" opens it (H7: the "Manage drives" tile is gone). */
  const DISK = 'apps/system/disk/';
  const openDisk = () => { if (window.__hubOpenApp) window.__hubOpenApp(DISK); };
  const known = new Map();   // drive id → d (menus are built synchronously)
  const locked = new Set();  // R56: added folders that need "Allow access" again (after every reload)
  if (window.HubCtx) {
    window.HubCtx.add('.drv[data-drive]', (t) => {
      const d = known.get(t.dataset.drive);
      if (!d) return null;
      const desk = window.HubMode && window.HubMode.isDesktop();
      if (locked.has(d.id)) {
        return [
          { label: 'Allow access', icon: '\uD83D\uDD13', action: () => allowDrive(d) },
          { sep: true },
          { label: 'Manage in Disk', icon: '\uD83D\uDDB4', action: openDisk }
        ];
      }
      return [
        { label: 'Open', icon: '\u2197', action: () => openFiles(d.id) },
        desk && { label: 'Open in new window', icon: '\u29C9', action: () => openFiles(d.id, true) },
        { sep: true },
        { label: 'Manage in Disk', icon: '\uD83D\uDDB4', action: openDisk }
      ];
    }, { touch: true });
  }
  function tile(cls, ico, name, onClick) {
    const b = el('button', 'drv ' + cls);
    b.type = 'button';
    b.append(el('span', 'drv-ico', ico), el('span', 'drv-name', name));
    b.addEventListener('click', onClick);
    return b;
  }
  /** H7: Settings → Desktop "Show Files on the desktop" (default on; '0' = off). */
  const enabled = () => { try { return localStorage.getItem('sites-hub.showFiles') !== '0'; } catch (_) { return true; } };
  let seq = 0;
  async function draw() {
    if (!enabled()) { seq++; known.clear(); locked.clear(); pane.replaceChildren(); pane.hidden = true; return; }   // off: nothing rendered, nothing read
    const my = ++seq;
    const list = await D.list();
    const items = [];
    for (const d of list) {
      if (d.kind === 'gdrive' && D.gdriveState() !== 'ok') continue;
      let tip = '', lock = false;
      if (d.kind === 'gdrive') { const u = window.GoogleAuth.user() || {}; tip = u.email ? 'Google Drive \u2014 ' + u.email : 'Google Drive'; }
      else if (d.kind === 'local') tip = d.name + ' \u2014 in this browser';
      else if ((await D.access(d.id)) !== 'granted') { lock = true; tip = 'Click to allow access'; }   // R56: was hidden
      else tip = d.name + ' \u2014 folder';
      items.push({ d, lock, tip });
    }
    if (my !== seq || !enabled()) return;   // a newer draw (or Files switched off) overtook this one
    known.clear();
    locked.clear();
    const grid = el('div', 'drv-grid');
    for (const { d, lock, tip } of items) {
      if (lock) locked.add(d.id);
      // R56: a folder that needs access again (the browser forgets it on reload) stays as a greyed tile;
      //  the click is the user gesture requestPermission (FsDrives.allow) needs, then Files opens it.
      const t = tile('drv-' + d.kind, d.kind === 'local' ? '\uD83D\uDCBE' : d.kind === 'gdrive' ? '\u2601\uFE0F' : '\uD83D\uDCC2', d.name,
        lock ? () => allowDrive(d) : (e) => openFiles(d.id, e.shiftKey));
      t.title = lock ? 'Click to allow access (' + d.name + ')' : tip;
      if (lock) {
        t.classList.add('drv-locked');
        t.setAttribute('aria-label', d.name + ', click to allow access');
        t.querySelector('.drv-ico').appendChild(el('span', 'drv-lock', '\uD83D\uDD12'));
      } else t.setAttribute('aria-label', d.name);
      t.dataset.drive = d.id;
      known.set(d.id, d);
      grid.appendChild(t);
    }
    const out = [grid];
    if (!list.length) out.push(el('p', 'drv-note', 'This browser has no file storage for web pages.'));
    pane.replaceChildren(...out);
    pane.hidden = false;
  }

  D.onChange(draw);
  window.HubDrives = { sync: draw };   // H7: hub_prefs.js calls it when the Settings switch changes
  draw();
})();
