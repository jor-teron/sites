/*
 * Settings → Screen lock (apps/system/settings/sec_lock.js), H142. Right after Do Not Disturb.
 * The Hub's PIN lock screen (hub/core/hub_lock.js, Desktop mode only). Uses the Hub's window.HubLock when
 * Settings runs inside the Hub page, else hub/core/hub_lock_core.js on the same keys.
 *   - Set / Change PIN: exactly 4 digits, typed twice; changing needs the current PIN. Never turns the lock on.
 *   - Activate: OFF by default and greyed out until a PIN exists; turning it off needs the current PIN.
 *     When on, the Hub locks each time it opens (no idle auto-lock).
 *   - Lock now: locks the Hub at once (only while Activate is on and Settings is inside the Hub).
 *   - Remove PIN: needs the current PIN; the lock goes off with it.
 * Keys hub-lock.pin / hub-lock.on: this device only (never synced, never in a profile). No attempt limit in H142.
 */
(function () {
  'use strict';
  const ui = Settings.ui;
  const hubLock = () => { try { return (window.parent !== window && window.parent.HubLock) || null; } catch (_) { return null; } };
  let own = null;
  const lockApi = () => hubLock() || own || (own = window.HubLockCore ? window.HubLockCore.create() : null);
  const ERR = {
    'bad-pin': 'The PIN must be exactly 4 digits.',
    'need-current': 'Type your current PIN in the Current PIN box first.',
    'wrong-current': 'The current PIN is wrong.',
    'no-pin': 'Set a PIN first.',
    'no-webcrypto': 'This browser cannot protect the PIN on this address. Open the Hub from its https web address.',
    'hash-failed': 'Could not save the PIN. Please try again.',
    storage: 'Could not save on this device (browser storage is blocked).',
    mismatch: 'The two new PINs do not match.'
  };
  let flash = null;   // { text, ok } shown once after a re-render
  function pinInput(label, auto) {
    const i = ui.el('input', 'key-input');
    i.type = 'password';
    i.inputMode = 'numeric';
    i.maxLength = 4;
    i.autocomplete = auto || 'off';
    i.placeholder = label;
    i.setAttribute('aria-label', label);
    i.addEventListener('input', () => { const v = i.value.replace(/\D/g, '').slice(0, 4); if (v !== i.value) i.value = v; });
    return i;
  }
  Settings.add({
    id: 'lock', title: 'Screen lock', icon: '\uD83D\uDD12',
    render(pane) {
      const L = lockApi();
      if (!L) { pane.append(ui.note('Screen lock is not available in this browser.')); return; }
      const has = L.hasPin(), on = L.isOn(), inHub = !!hubLock();
      const status = ui.note(!has ? 'Off. Set a PIN first, then switch Activate on.'
        : on ? 'On. The Hub asks for the PIN each time it opens on this computer.'
          : 'Off. A PIN is set, but the Hub does not lock until you switch Activate on.');
      const out = ui.el('p', 'key-out');
      out.setAttribute('role', 'status');
      const tell = (text, ok) => { out.textContent = text || ''; out.className = 'key-out' + (text ? (ok ? ' ok' : ' bad') : ''); };
      const done = (text) => { flash = { text, ok: true }; Settings.open('lock'); };
      let working = false;
      const run = async (fn) => {
        if (working) return;
        working = true; tell('Working\u2026', true); out.className = 'key-out';
        try { await fn(); } catch (_) { tell(ERR['hash-failed'], false); } finally { working = false; }
      };

      // current PIN (one box for Change, Turn off and Remove)
      const card = ui.el('div', 'card key-row');
      const cur = has ? pinInput('Current PIN', 'current-password') : null;
      if (cur) {
        card.append(ui.el('p', 'key-hint', 'Current PIN: needed to change the PIN, turn the lock off or remove the PIN.'));
        const l0 = ui.el('div', 'key-line'); l0.append(cur); card.append(l0);
      }
      const p1 = pinInput(has ? 'New 4-digit PIN' : '4-digit PIN', 'new-password');
      const p2 = pinInput('Type it again', 'new-password');
      const save = ui.el('button', 'key-btn key-save', has ? 'Change PIN' : 'Set PIN');
      save.type = 'button';
      card.append(ui.el('p', 'key-hint', has ? 'Change PIN: type a new 4-digit PIN twice.' : 'Set PIN: type a 4-digit PIN twice. This does not turn the lock on.'));
      const l1 = ui.el('div', 'key-line'); l1.append(p1, p2, save); card.append(l1);
      save.addEventListener('click', () => run(async () => {
        const a = p1.value, b = p2.value;
        if (!/^\d{4}$/.test(a)) { tell(ERR['bad-pin']); return; }
        if (a !== b) { tell(ERR.mismatch); return; }
        const r = await L.setPin(a, cur ? cur.value : '');
        if (!r.ok) { tell(ERR[r.error] || ERR['hash-failed']); return; }
        done(has ? 'PIN changed.' : 'PIN set. Switch Activate on when you want the lock.');
      }));

      // Activate (off by default; greyed out without a PIN)
      const act = ui.switch('Activate', 'Lock the Hub each time it opens on this computer (Desktop mode)', on, (v) => { if (working) { act.set(!v); return; } run(async () => {
        if (v && !L.hasPin()) { act.set(false); tell(ERR['no-pin']); return; }
        const r = await L.setOn(v, cur ? cur.value : '');
        if (!r.ok) { act.set(!v); tell(ERR[r.error] || ERR['hash-failed']); return; }
        done(v ? 'Lock on. The Hub locks the next time it opens, or now with Lock now.' : 'Lock off.');
      }); });
      act.dataset.key = 'lockOn';
      if (!has) { act.setAttribute('aria-disabled', 'true'); act.style.opacity = '0.45'; act.title = 'Set a PIN first'; }

      // Lock now + Remove PIN
      const row = ui.el('div', 'key-line');
      const now = ui.el('button', 'key-btn', 'Lock now');
      now.type = 'button';
      now.disabled = !(on && inHub && typeof hubLock().lockNow === 'function');
      now.title = !on ? 'Switch Activate on first' : (!inHub ? 'Open Settings from the Hub to lock it' : 'Lock the Hub now');
      now.addEventListener('click', () => { const H = hubLock(); if (H && H.lockNow && !H.lockNow()) tell(ERR['no-pin']); });
      const del = ui.el('button', 'key-btn key-del', 'Remove PIN');
      del.type = 'button';
      del.disabled = !has;
      del.addEventListener('click', () => run(async () => {
        const r = await L.removePin(cur ? cur.value : '');
        if (!r.ok) { tell(ERR[r.error] || ERR['hash-failed']); return; }
        done('PIN removed. The lock is off.');
      }));
      row.append(now, del);
      const card2 = ui.el('div', 'card key-row');
      card2.append(row, out);
      if (flash) { tell(flash.text, flash.ok); flash = null; }

      pane.append(status, card, act, card2,
        ui.note('Unlock with the keypad on the lock screen, or scan its QR code with your phone and type the PIN there (needs internet). Each QR code works once.'),
        ui.note('Desktop mode only. This computer only: not sent with Send profile or sync. There is no limit on wrong tries yet. This is a casual lock: someone who knows browser tools can get past it.'));
    }
  });
  // keep the open pane in step with another tab
  window.addEventListener('storage', (e) => {
    if (!e.key || e.key.indexOf('hub-lock.') !== 0) return;
    if (location.hash.replace('#', '').split('/')[0] === 'lock') Settings.open('lock');
  });
})();
