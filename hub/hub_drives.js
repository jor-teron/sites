/*
 * Desktop drives pane (hub/hub_drives.js) — Desktop mode only. The desktop (home, seen when
 * no window covers it) is split in two: left 60% = Drives, right 40% = the QR / link tiles
 * (hub_tiles.js, see hub_drives.css). Phone mode hides this pane (Files is in Tools).
 * Drives come from shared/fs/fs_drives.js:
 *   Local       the browser's private storage for this site (OPFS), always there
 *   folders     added with "Add folder" (Chrome / Edge on a computer); after a reload they show
 *               "Allow access" (one click); ✕ only removes the folder from the list
 * Clicking a drive opens the Files app (apps/tools/files/#drive=<id>) in a window, or points the
 * open Files window at it; Shift+click = a new Files window. Redraws when drives change
 * (also from the Files app, BroadcastChannel).
 */
(function () {
  'use strict';
  const pane = document.getElementById('desk-drives');
  const D = window.FsDrives;
  if (!pane || !D) return;
  const FILES = 'apps/tools/files/';
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

  function tile(cls, ico, name, sub, onClick) {
    const b = el('button', 'drv ' + cls);
    b.type = 'button';
    b.append(el('span', 'drv-ico', ico), el('span', 'drv-name', name));
    if (sub) b.appendChild(el('span', 'drv-sub', sub));
    b.addEventListener('click', onClick);
    return b;
  }

  async function draw() {
    const list = await D.list();
    const grid = el('div', 'drv-grid');
    for (const d of list) {
      if (d.kind === 'local') {
        grid.appendChild(tile('drv-local', '\uD83D\uDCBE', 'Local', 'In this browser', (e) => openFiles('local', e.shiftKey)));
        continue;
      }
      const ok = (await D.access(d.id)) === 'granted';
      const wrap = el('div', 'drv-wrap');
      const t = tile('drv-folder', '\uD83D\uDCC2', d.name, ok ? 'Folder' : 'Click to allow access', async (e) => {
        if (!ok && !(await D.allow(d.id))) return;
        if (!ok) draw();
        openFiles(d.id, e.shiftKey);
      });
      if (!ok) t.classList.add('drv-locked');
      const x = el('button', 'drv-x', '\u00D7');
      x.type = 'button';
      x.title = 'Remove ' + d.name + ' from Drives (no files are deleted)';
      x.setAttribute('aria-label', x.title);
      x.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (window.confirm('Remove "' + d.name + '" from Drives?\nNo files are deleted.')) await D.remove(d.id);
      });
      wrap.append(t, x);
      if (!ok) {
        const allow = el('button', 'drv-allow', 'Allow access');
        allow.type = 'button';
        allow.addEventListener('click', async (e) => { e.stopPropagation(); if (await D.allow(d.id)) { draw(); openFiles(d.id); } });
        wrap.appendChild(allow);
      }
      grid.appendChild(wrap);
    }
    if (D.canAddFolder) {
      grid.appendChild(tile('drv-add', '\uFF0B', 'Add folder', 'From this computer', async () => {
        const d = await D.addFolder();
        if (d) openFiles(d.id);
      }));
    }
    const head = el('h2', 'drv-title', 'Drives');
    const out = [head, grid];
    if (!list.length) out.push(el('p', 'drv-note', 'This browser has no file storage for web pages.'));
    else if (!D.canAddFolder) out.push(el('p', 'drv-note', 'Adding a folder from this computer needs Chrome or Edge on a computer.'));
    pane.replaceChildren(...out);
    pane.hidden = false;
  }
  D.onChange(draw);
  draw();
})();
