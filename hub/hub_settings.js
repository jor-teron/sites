/*
 * Hub settings (hub/hub_settings.js) — "⚙ Hub settings" row at the bottom of the Hub menu,
 * opening a small sheet. Settings (all saved in localStorage):
 *   - Screen mode Auto / Desktop / Phone (window.HubMode.setPref, wm_mode.js)
 *   - Open menu on hover (Desktop mode Start button, wm_taskbar.js; 'sites-hub.startHover',
 *     default on, '0' = off)
 * Look in wm.css (.hub-set-*).
 */
(function () {
  'use strict';
  const menu = document.getElementById('menu');
  if (!menu || !window.HubMode) return;

  const MODES = [
    { id: 'auto', label: 'Auto', hint: 'Windows on a big screen with a mouse, else Phone' },
    { id: 'desktop', label: 'Desktop', hint: 'Apps open in windows with a taskbar' },
    { id: 'phone', label: 'Phone', hint: 'One app at a time, full screen' }
  ];

  const back = document.createElement('div');
  back.className = 'hub-set-back';
  back.hidden = true;
  const sheet = document.createElement('div');
  sheet.className = 'hub-set';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Hub settings');
  sheet.innerHTML = '<div class="hub-set-head"><strong>Hub settings</strong>' +
    '<button type="button" class="hub-set-x" aria-label="Close">\u00D7</button></div>' +
    '<div class="hub-set-title">Screen mode</div><div class="hub-set-modes"></div>' +
    '<div class="hub-set-note"></div>' +
    '<div class="hub-set-title">Desktop mode</div>' +
    '<button type="button" class="hub-set-switch" role="switch" aria-checked="true">' +
    '<span class="hub-set-sw-text"><b>Open menu on hover</b><small>Point at Start to open the menu</small></span>' +
    '<span class="hub-set-sw" aria-hidden="true"><i></i></span></button>';
  back.appendChild(sheet);
  document.body.appendChild(back);
  const modesEl = sheet.querySelector('.hub-set-modes');
  const note = sheet.querySelector('.hub-set-note');
  const HOVER_KEY = 'sites-hub.startHover';
  const sw = sheet.querySelector('.hub-set-switch');
  const hoverOn = () => { try { return localStorage.getItem(HOVER_KEY) !== '0'; } catch (_) { return true; } };
  sw.addEventListener('click', () => {
    const on = !hoverOn();
    try { if (on) localStorage.removeItem(HOVER_KEY); else localStorage.setItem(HOVER_KEY, '0'); } catch (_) { /* blocked */ }
    sync();
  });

  MODES.forEach((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hub-set-mode';
    b.dataset.mode = m.id;
    b.innerHTML = '<b></b><small></small>';
    b.querySelector('b').textContent = m.label;
    b.querySelector('small').textContent = m.hint;
    b.addEventListener('click', () => { HubMode.setPref(m.id); sync(); });
    modesEl.appendChild(b);
  });

  function sync() {
    modesEl.querySelectorAll('.hub-set-mode').forEach((b) => {
      const on = b.dataset.mode === HubMode.pref;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    sw.setAttribute('aria-checked', hoverOn() ? 'true' : 'false');
    sw.classList.toggle('on', hoverOn());
    note.textContent = 'Now: ' + (HubMode.isDesktop() ? 'Desktop' : 'Phone') +
      (HubMode.pref === 'auto' ? ' (Auto picks Desktop at ' + HubMode.minWidth + ' px wide or more with a mouse)' : '');
  }
  function show() {
    sync();
    back.hidden = false;
    const on = modesEl.querySelector('.on') || modesEl.firstChild;
    try { on.focus(); } catch (_) { /* ignore */ }
  }
  function hide() { back.hidden = true; }
  sheet.querySelector('.hub-set-x').addEventListener('click', hide);
  back.addEventListener('click', (e) => { if (e.target === back) hide(); });
  document.addEventListener('keydown', (e) => { if (!back.hidden && e.key === 'Escape') { e.stopPropagation(); hide(); } }, true);
  window.addEventListener('hub-wm-mode', () => { if (!back.hidden) sync(); });

  // Menu row (hub.js has drawn the menu already; .home-item keeps it in the keyboard rows)
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'app home-item hub-set-item';
  row.setAttribute('role', 'menuitem');
  row.innerHTML = '<span class="icon home-icon" aria-hidden="true">\u2699</span>';
  const t = document.createElement('span');
  t.textContent = 'Hub settings';
  row.appendChild(t);
  row.addEventListener('click', () => {
    document.getElementById('cat-btn').click();   // close the menu
    show();
  });
  menu.appendChild(row);
})();
