/*
 * Hub settings entry (hub/menu/hub_settings.js) — the "⚙ Settings" row at the bottom of the Hub
 * menu. It opens the Settings app (apps/system/settings/ since R53, a window in Desktop mode, the frame in
 * Phone mode) the normal Hub way (window.__hubOpenApp). All options live in that app;
 * hub_prefs.js applies them to the Hub live.
 */
(function () {
  'use strict';
  const menu = document.getElementById('menu');
  if (!menu) return;
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'app home-item hub-set-item';
  row.setAttribute('role', 'menuitem');
  row.dataset.entryUrl = 'apps/system/settings/';   // active highlight like other app rows
  const img = document.createElement('img');
  img.className = 'icon'; img.alt = ''; img.src = 'apps/system/settings/settings_icon.png';
  img.addEventListener('error', () => img.classList.add('missing'));
  const t = document.createElement('span');
  t.textContent = 'Settings';
  row.append(img, t);
  /* R38: an open Settings window (or Phone frame) draws each section from the prefs at load time
   * and does not redraw when the Hub changes one (taskbar menu → top, Desktop/Phone switch, …).
   * So: remember the prefs when Settings loads or reports its own change ({type:'hub-prefs'});
   * when Settings is opened again or clicked into and the prefs differ, reload it (same #section). */
  const SET = '/apps/system/settings/';   // R53 (was /apps/settings/, now a legacy redirect)
  const PREFS = ['wallpaper', 'taskH', 'titleH', 'taskPos', 'accent', 'theme', 'motion', 'wmMode', 'startHover', 'trayMeter', 'showFiles', 'homeBtn',
    'hoverFocus', 'snapEdges', 'snapMagnet', 'snapMagnetPx', 'workspaces', 'filesClick', 'filesThumbs'];
  const snap = () => PREFS.map((k) => { try { return localStorage.getItem('sites-hub.' + k) || ''; } catch (_) { return ''; } }).join('|');
  let seen = snap();
  const frames = () => [...document.querySelectorAll('iframe')].filter((f) => { try { return f.contentWindow.location.pathname.indexOf(SET) >= 0; } catch (_) { return false; } });
  function fresh() {
    if (snap() === seen) return;
    seen = snap();
    frames().forEach((f) => { try { f.contentWindow.location.reload(); } catch (_) { /* gone */ } });
  }
  window.HubSettingsFresh = (entryUrl) => { if (String(entryUrl || '').indexOf('apps/system/settings/') === 0) fresh(); };
  /* R57: same-origin senders only (the hub_prefs.js check). file://: every file page has the opaque
   * origin 'null', so there the sender must also be this page or one of its own iframes. */
  const trusted = (e) => (e.origin === location.origin || (location.protocol === 'file:' && e.origin === 'null')) &&
    (location.protocol !== 'file:' || e.source === window || [...document.querySelectorAll('iframe')].some((f) => f.contentWindow === e.source));
  window.addEventListener('message', (e) => { if (trusted(e) && e.data && e.data.type === 'hub-prefs') seen = snap(); });
  document.addEventListener('load', (e) => { if (e.target.tagName === 'IFRAME' && frames().indexOf(e.target) >= 0) seen = snap(); }, true);
  window.addEventListener('blur', () => setTimeout(() => { if (frames().indexOf(document.activeElement) >= 0) fresh(); }, 0));
  row.addEventListener('click', () => { if (window.__hubOpenApp) window.__hubOpenApp('apps/system/settings/'); });
  menu.appendChild(row);
})();
