/*
 * Hub — phone remote mode (one-connection release, 2026-10-12). Runs only when hub_role.js
 * set window.__hubRemote (opened from the desktop's Connect QR, or a saved join code on a
 * touch device). Then this Hub never hosts: it JOINS the desktop Hub through SharedLink
 * (meta pad:1, so Gamepad keys sent over it count as the controller) and
 *   - H31: no "Hub 1234" chip in the bar any more; the state is the small dot on 🎮 (green = connected,
 *     red = reconnecting, none = retries stopped (H25)). Joining another Hub: Devices → Join with code (hub_panels.js);
 *   - the 🎮 bar button opens the Devices popover (name + connected list) via
 *     hub-controller.js — never the Gamepad (that is the home tile, next release);
 *   - while the Gamepad is open in the frame the bar gets ⛶ Full screen and ⚙ Gamepad
 *     settings (posted into the frame as {type:'ctrl-settings'});
 *   - Disconnect (button in the 🎮 Devices popover, hub_linkstate.js): manual Disconnect (bye, forget code),
 *     then reload as a normal host Hub. Reloads otherwise rejoin from the saved code.
 * H25: retries stop after 5 minutes without the Hub (GIVE_UP_MS; window.HUB_REMOTE_GIVEUP_MS overrides it for
 *   tests): SharedLink.pause() (no bye, the saved code stays) and the 🎮 dot goes out (H31). Tapping 🎮,
 *   scanning / typing the same code (Connect QR = hub.html?join=, or Devices → Join) and coming back to the
 *   tab (visibilitychange) rejoin straight away with a fresh backoff; the 5-minute clock starts again.
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

  /* ---------- bar: Gamepad extras (H31: the state is the dot on 🎮, no "Hub 1234" chip) ---------- */
  const fsBtn = btn('rm-fs', '⛶', 'Full screen');
  const setBtn = btn('rm-set', '⚙', 'Gamepad settings');
  fsBtn.hidden = setBtn.hidden = true;
  if (right) right.prepend(fsBtn, setBtn);

  /* H25: give up after 5 minutes without the Hub; 🎮 / scan / tab visible rejoins */
  const GIVE_UP_MS = +window.HUB_REMOTE_GIVEUP_MS || 5 * 60 * 1000;
  let downSince = Date.now(), gaveUp = false;
  function giveUp() {
    if (gaveUp || SharedLink.connected) return;
    gaveUp = true;
    SharedLink.pause();   // quiet: no bye, 'shared-link-join-code' stays
    paint();
    document.documentElement.classList.add('hub-remote-idle');
  }
  function rejoinNow() {
    gaveUp = false;
    downSince = Date.now();
    document.documentElement.classList.remove('hub-remote-idle');
    if (SharedLink.connected) { paint(); return; }
    SharedLink.join({ prefix: 'jtsites-', code: R.code, meta: { pad: 1 } });   // fresh backoff
    paint();
  }
  setInterval(() => {
    if (SharedLink.connected) { downSince = 0; return; }
    if (!downSince) downSince = Date.now();
    if (!gaveUp && Date.now() - downSince >= GIVE_UP_MS) giveUp();
  }, Math.min(10000, Math.max(250, GIVE_UP_MS / 4)));

  function paint() {
    const on = SharedLink.connected;
    if (on) { downSince = 0; if (gaveUp) { gaveUp = false; document.documentElement.classList.remove('hub-remote-idle'); } }
    else if (!downSince) downSince = Date.now();
    if (ctrlBtn) {   // H31: dot on 🎮 — green connected, red reconnecting, none after give-up
      ctrlBtn.classList.toggle('connected', on);
      ctrlBtn.classList.toggle('rm-down', !on && !gaveUp);
      ctrlBtn.title = on ? 'Devices · connected to Hub ' + R.code : gaveUp ? 'Devices · not connected (tap to reconnect)' : 'Devices · reconnecting…';
      ctrlBtn.setAttribute('aria-label', ctrlBtn.title);
    }
  }
  ['open', 'close', 'status', 'devices'].forEach((ev) => SharedLink.on(ev, paint));

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
  // H25: the tap also rejoins straight away when the link is down (retrying or given up).
  if (ctrlBtn) ctrlBtn.addEventListener('click', () => { if (!SharedLink.connected) rejoinNow(); }, true);

  /* ---------- manual Disconnect (button lives in the 🎮 popover: hub_linkstate.js) ---------- */
  function disconnect() {
    SharedLink.stop();   // bye + forget 'shared-link-join-code'
    setTimeout(() => location.replace(location.pathname), 300);
  }

  /* ---------- join ---------- */
  SharedLink.join({ prefix: 'jtsites-', code: R.code, meta: { pad: 1 } });
  window.addEventListener('pagehide', () => SharedLink.pause());   // quiet: the desktop keeps us
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !SharedLink.connected && SharedLink.role === 'join') rejoinNow();   // H25
  });
  paint();

  window.__hubRemoteApi = { disconnect: disconnect, rejoin: rejoinNow, get code() { return R.code; }, get gaveUp() { return gaveUp; } };
})();
