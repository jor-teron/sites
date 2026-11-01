/*
 * Hub — SharedLink state in the 🎮 Devices popover + bar (2026-10-13). Loaded after hub_link.js.
 *   Host Hub:  a count badge on the 🎮 icon (devices really online, heartbeat-checked), and a
 *              H92: "Number 12345 · Pad 67890 · ↻ New pad code" (only the Gamepad pairs again). Before:
 *              "Code 1234 · ↻ New code" row: fresh random 5-digit code (H83; was 4-digit), re-registers the peer,
 *              saved, QR tiles redrawn (hub-controller.js newCode). Joined devices must pair again.
 *   Phone (joined, window.__hubRemote): "⏏ Disconnect from Hub" button in the same popover
 *              (moved out of the Menu). H31: no "Hub 1234 · Connected" state line; the dot on 🎮 shows it.
 */
(function () {
  'use strict';
  if (!window.SharedLink) return;
  const pop = document.getElementById('ctrl-popover');
  const ctrlBtn = document.getElementById('ctrl-btn');
  if (!pop) return;

  const row = document.createElement('div');
  row.className = 'ls-row';
  const info = document.createElement('span');
  info.className = 'ls-info';
  const act = document.createElement('button');
  act.type = 'button';
  act.className = 'ls-btn';
  row.append(info, act);
  pop.appendChild(row);

  if (window.__hubRemote) {
    act.textContent = '⏏ Disconnect from Hub';
    act.classList.add('ls-disc');
    act.addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.__hubRemoteApi) window.__hubRemoteApi.disconnect();
    });
    // H31: no "Hub 1234 · Connected" line; the state is the dot on 🎮 (hub_remote.js)
    info.hidden = true;
    info.style.display = 'none';
    return;
  }

  /* host */
  // H92: the link code is the Hub's number (fixed); this button only renews the Gamepad's private pad code.
  act.textContent = '↻ New pad code';
  act.title = 'New Gamepad pairing code (joined devices stay connected)';
  act.addEventListener('click', async (e) => {
    e.stopPropagation();
    const hc = window.__hubController;
    if (!hc || !(hc.newPadCode || hc.newCode)) return;
    if (hc.connected) {   // R26: the Hub's own dialog (browser confirm only as a fallback)
      const ok = window.UiDialog
        ? await window.UiDialog.confirm('New pad code?', 'The Gamepad must pair again.', 'New pad code', true)
        : confirm('New pad code: the Gamepad must pair again. Continue?');
      if (!ok) return;
    }
    if (hc.newPadCode) hc.newPadCode(); else hc.newCode();
    paint();
  });
  const badge = document.createElement('span');
  badge.className = 'ls-count';
  badge.hidden = true;
  if (ctrlBtn) ctrlBtn.appendChild(badge);
  function paint() {
    const n = SharedLink.devices.filter((d) => d.online).length;
    const code = (window.__hubController && window.__hubController.code) || SharedLink.code || '——';
    const pad = window.__hubController && window.__hubController.padCode;   // H92
    info.textContent = 'Number ' + code + (pad ? ' · Pad ' + pad : '') + ' · ' + n + ' device' + (n === 1 ? '' : 's');
    badge.textContent = String(n);
    badge.hidden = !n;
  }
  ['devices', 'status', 'open', 'close'].forEach((ev) => SharedLink.on(ev, paint));
  window.addEventListener('hub-ctrl-link', paint);
  paint();
})();
