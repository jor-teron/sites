/*
 * Hub — phone remote mode (one-connection release, 2026-10-12). Runs only when hub_role.js
 * set window.__hubRemote (opened from the desktop's Connect QR, or a saved join code on a
 * touch device). Then this Hub never hosts: it JOINS the desktop Hub through SharedLink
 * (meta pad:1, so Gamepad keys sent over it count as the controller) and
 *   - shows the state in the bar: green dot + "Hub 1234" (tap = re-scan / type a code);
 *   - the 🎮 bar button opens the Devices popover (name + connected list) via
 *     hub-controller.js — never the Gamepad (that is the home tile, next release);
 *   - while the Gamepad is open in the frame the bar gets ⛶ Full screen and ⚙ Gamepad
 *     settings (posted into the frame as {type:'ctrl-settings'});
 *   - Disconnect (button in the 🎮 Devices popover, hub_linkstate.js): manual Disconnect (bye, forget code),
 *     then reload as a normal host Hub. Reloads otherwise rejoin from the saved code.
 */
(function () {
  'use strict';
  const R = window.__hubRemote;
  if (!R || !window.SharedLink) return;

  const frame = document.getElementById('app-frame');
  const right = document.querySelector('.header-right');
  const ctrlBtn = document.getElementById('ctrl-btn');

  function btn(id, text, label) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = id; b.className = 'ctrl-btn rm-btn'; b.textContent = text;
    b.title = label; b.setAttribute('aria-label', label);
    return b;
  }

  /* ---------- bar: state chip + Gamepad extras ---------- */
  const chip = btn('rm-hub', '', 'Connected Hub — tap to scan another code');
  chip.classList.add('rm-hub');
  const dot = document.createElement('span'); dot.className = 'rm-dot';
  const txt = document.createElement('span'); txt.textContent = 'Hub ' + R.code;
  chip.append(dot, txt);
  const fsBtn = btn('rm-fs', '⛶', 'Full screen');
  const setBtn = btn('rm-set', '⚙', 'Gamepad settings');
  fsBtn.hidden = setBtn.hidden = true;
  if (right) right.prepend(chip, fsBtn, setBtn);

  function paint() {
    const on = SharedLink.connected;
    chip.classList.toggle('connected', on);
    if (ctrlBtn) ctrlBtn.classList.toggle('connected', on);
    txt.textContent = 'Hub ' + R.code + (on ? '' : ' …');
  }
  ['open', 'close', 'status', 'devices'].forEach((ev) => SharedLink.on(ev, paint));

  chip.addEventListener('click', () => {
    if (!window.SharedLinkScan) return;
    SharedLinkScan.ask({ title: 'Join a Hub' }).then((c) => {
      if (!c || !/^\d{4}$/.test(c) || c === R.code) return;
      location.replace(location.pathname + '?join=' + c);
    });
  });

  function gamepadOpen() { return !!frame && /hub\/controller\//.test(frame.dataset.app || frame.getAttribute('src') || ''); }
  function paintExtras() { fsBtn.hidden = setBtn.hidden = !gamepadOpen(); }
  if (frame) new MutationObserver(paintExtras).observe(frame, { attributes: true, attributeFilter: ['src', 'data-app'] });
  paintExtras();

  fsBtn.addEventListener('click', () => {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) { (d.exitFullscreen || d.webkitExitFullscreen).call(d); return; }
    const el = d.documentElement;
    const p = (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
    if (p && p.then) p.then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (_) { /* no lock */ } }).catch(() => {});
  });
  setBtn.addEventListener('click', () => {
    try { frame.contentWindow.postMessage({ type: 'ctrl-settings' }, '*'); } catch (_) { /* gone */ }
  });

  // 🎮 click → Devices popover (hub-controller.js remote branch). Do not open Gamepad here.

  /* ---------- manual Disconnect (button lives in the 🎮 popover: hub_linkstate.js) ---------- */
  function disconnect() {
    SharedLink.stop();   // bye + forget 'shared-link-join-code'
    setTimeout(() => location.replace(location.pathname), 300);
  }

  /* ---------- join ---------- */
  SharedLink.join({ prefix: 'jtsites-', code: R.code, meta: { pad: 1 } });
  window.addEventListener('pagehide', () => SharedLink.pause());   // quiet: the desktop keeps us
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !SharedLink.connected && SharedLink.role === 'join') SharedLink.restart();
  });
  paint();

  window.__hubRemoteApi = { disconnect: disconnect, get code() { return R.code; } };
})();
