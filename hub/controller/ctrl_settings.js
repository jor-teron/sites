/*
 * Gamepad Controller — Settings page (one-connection release, 2026-10-12).
 * A full page (not a drop-down), opened from ☰ (#set-btn) when the controller runs on its
 * own, or from the Hub bar's ⚙ button when it is embedded in a phone Hub (the Hub posts
 * {type:'ctrl-settings'} into the frame). Sections:
 *   Input method — big tiles (Gamepad / PC keyboard / Phone keyboard / Trackpad); a tap
 *                  switches straight to it (last used is remembered by controller_logic.js).
 *   Vibration on / off · Theme light / dark · Device name (SharedLink) · Disconnect.
 * Uses window.__ctrlApi from controller_logic.js (loaded before this file).
 */
(function () {
  'use strict';
  const api = window.__ctrlApi;
  if (!api) return;
  const ORDER = ['pad', 'pc', 'phone', 'trackpad'];
  let page = null;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function build() {
    page = el('div', 'set-page');
    page.id = 'set-page';
    page.hidden = true;
    page.setAttribute('role', 'dialog');
    page.setAttribute('aria-label', 'Gamepad settings');
    const head = el('div', 'set-head');
    const back = el('button', 'set-back', '←');
    back.type = 'button';
    back.setAttribute('aria-label', 'Back');
    back.addEventListener('click', close);
    head.append(back, el('h2', '', 'Gamepad settings'));
    page.appendChild(head);

    page.appendChild(el('h3', '', 'Input method'));
    const tiles = el('div', 'set-tiles');
    ORDER.map((id) => api.modes.find((m) => m.id === id)).filter(Boolean).forEach((m) => {
      const b = el('button', 'set-tile');
      b.type = 'button';
      b.dataset.mode = m.id;
      b.append(el('span', 'set-ico', m.icon || ''), el('span', '', m.label));
      b.addEventListener('click', () => { api.setMode(m.id); close(); });
      tiles.appendChild(b);
    });
    page.appendChild(tiles);

    const rows = el('div', 'set-rows');
    const vib = el('button', 'set-row'); vib.type = 'button'; vib.id = 'set-vib';
    vib.addEventListener('click', () => { api.setHaptics(!api.hapticsOn); paint(); });
    const theme = el('button', 'set-row'); theme.type = 'button'; theme.id = 'set-theme';
    theme.addEventListener('click', () => { api.toggleTheme(); paint(); });
    const nameRow = el('label', 'set-row set-name');
    const name = el('input'); name.id = 'set-name'; name.maxLength = 40; name.autocomplete = 'off';
    name.addEventListener('change', () => { if (window.SharedLinkDevices) SharedLinkDevices.setName(name.value.trim()); paint(); });
    nameRow.append(el('span', '', 'Device name'), name);
    const disc = el('button', 'set-row set-disc', 'Disconnect'); disc.type = 'button';
    disc.addEventListener('click', () => { close(); api.disconnect(); });
    rows.append(vib, theme, nameRow, disc);
    page.appendChild(rows);
    page.appendChild(el('p', 'set-status')).id = 'set-status';
    document.body.appendChild(page);
  }

  function paint() {
    if (!page) return;
    const cur = api.getMode();
    page.querySelectorAll('.set-tile').forEach((b) => b.classList.toggle('on', b.dataset.mode === cur));
    const vib = page.querySelector('#set-vib');
    vib.textContent = 'Vibration: ' + (api.canVibrate ? (api.hapticsOn ? 'On' : 'Off') : 'not supported');
    vib.disabled = !api.canVibrate;
    page.querySelector('#set-theme').textContent = 'Theme: ' + (api.isDark() ? 'Dark' : 'Light');
    const name = page.querySelector('#set-name');
    if (document.activeElement !== name && window.SharedLinkDevices) name.value = SharedLinkDevices.name();
    page.querySelector('#set-status').textContent = api.statusText();
  }

  function open() {
    if (!page) build();
    api.releaseAll();
    paint();
    page.hidden = false;
  }
  function close() { if (page) page.hidden = true; }

  const btn = document.getElementById('set-btn');
  if (btn) btn.addEventListener('click', open);
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || !e.data || e.data.type !== 'ctrl-settings') return;
    if (page && !page.hidden) close(); else open();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  window.CtrlSettings = { open: open, close: close };
})();
