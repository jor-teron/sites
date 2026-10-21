/*
 * Workspaces (hub/wm/wm_workspaces.js) — Desktop mode only. Two virtual desks; the windows and
 * their state live in wm_windows.js (w.ws, HubWM.ws / setWs / moveToWs / wsCount).
 * - Taskbar switcher right after Show Desktop: two small buttons "1" "2", the current one
 *   highlighted (a workspace with windows shows brighter). Click = switch.
 * - Keys (also inside a same-origin app, via window.__hubWmKey):
 *     Ctrl+Alt+PageUp / PageDown   previous / next workspace
 *     Super(Meta)+Ctrl+← / →       the same (often taken by the operating system first)
 *   Ctrl+Alt+← / → stay the snap keys (wm_snap.js), so workspaces use PageUp / PageDown.
 * - "Move to workspace 1 / 2" in the title-bar and taskbar-button right-click menus
 *   (HubWM.wsItems). The taskbar lists only the current workspace's windows; Show Desktop
 *   works on the current workspace.
 * - Setting (Settings → Windows): localStorage 'sites-hub.workspaces' = '1' → one workspace
 *   (switcher hidden, every window moves to 1); empty = 2 (default).
 */
(function () {
  'use strict';
  const WM = window.HubWM;
  const showDesk = document.getElementById('wm-showdesk');
  if (!WM || !showDesk) return;
  const isDesk = () => !!(window.HubMode && window.HubMode.isDesktop());

  const box = document.createElement('div');
  box.className = 'wm-ws';
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', 'Workspaces');
  const btns = [1, 2].map((n) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(n);
    b.title = 'Workspace ' + n;
    b.setAttribute('aria-label', 'Workspace ' + n);
    b.addEventListener('click', () => {
      if (window.CtxMenu) CtxMenu.close();
      WM.setWs(n);
    });
    box.appendChild(b);
    return b;
  });
  // R43: right side of the taskbar, just before the tray (was showDesk.after)
  const tray = document.querySelector('#wm-taskbar .wm-tray');
  if (tray) tray.before(box); else showDesk.after(box);

  function draw() {
    const one = WM.wsCount() < 2;
    box.hidden = one;
    const list = WM.list();
    btns.forEach((b, i) => {
      const n = i + 1, on = WM.ws === n;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.classList.toggle('has', list.some((w) => w.ws === n));
    });
  }
  /** Setting changed (Settings app, another document): 1 workspace = everything on 1. */
  function sync() {
    if (WM.wsCount() < 2) {
      WM.list().forEach((w) => { if (w.ws !== 1) WM.moveToWs(w, 1); });
      if (WM.ws !== 1) WM.setWs(1);
    }
    draw();
  }

  function key(e) {
    if (!isDesk() || e.repeat || WM.wsCount() < 2) return false;
    const ca = e.ctrlKey && e.altKey && !e.metaKey && !e.shiftKey;
    const sc = e.metaKey && e.ctrlKey && !e.altKey && !e.shiftKey;
    let d = 0;
    if (ca && e.key === 'PageUp') d = -1;
    else if (ca && e.key === 'PageDown') d = 1;
    else if (sc && e.key === 'ArrowLeft') d = -1;
    else if (sc && e.key === 'ArrowRight') d = 1;
    if (!d) return false;
    WM.setWs(WM.ws + d);
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  const prev = window.__hubWmKey;
  window.__hubWmKey = (e) => { if (!key(e) && prev) prev(e); };
  document.addEventListener('keydown', key, true);

  window.addEventListener('hub-wm-change', draw);
  window.addEventListener('hub-wm-ws', draw);
  window.addEventListener('storage', (e) => { if (!e.key || e.key === 'sites-hub.workspaces') sync(); });
  window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.type === 'hub-prefs') sync(); });
  sync();
})();
