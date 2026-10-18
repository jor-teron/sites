/*
 * Hub settings entry (hub/hub_settings.js) — the "⚙ Settings" row at the bottom of the Hub
 * menu. It opens the Settings app (apps/settings/, a window in Desktop mode, the frame in
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
  row.dataset.entryUrl = 'apps/settings/';   // active highlight like other app rows
  const img = document.createElement('img');
  img.className = 'icon'; img.alt = ''; img.src = 'apps/settings/settings_icon.png';
  img.addEventListener('error', () => img.classList.add('missing'));
  const t = document.createElement('span');
  t.textContent = 'Settings';
  row.append(img, t);
  row.addEventListener('click', () => { if (window.__hubOpenApp) window.__hubOpenApp('apps/settings/'); });
  menu.appendChild(row);
})();
