/*
 * Settings → Screen lock (apps/system/settings/sec_lock.js), H142. Right after Do Not Disturb.
 * The Hub's PIN lock screen (hub/core/hub_lock.js, Desktop mode only). Uses the Hub's window.HubLock when
 * Settings runs inside the Hub page, else hub/core/hub_lock_core.js on the same keys.
 *   - Set / Change PIN: exactly 4 digits, typed twice; changing needs the current PIN. Never turns the lock on.
 *   - Activate: OFF by default and greyed out until a PIN exists; turning it off needs the current PIN.
 *     When on, the Hub locks each time it opens (no idle auto-lock).
 *   - Lock now: locks the Hub at once (only while Activate is on and Settings is inside the Hub).
 *   - Remove PIN: needs the current PIN; the lock goes off with it.
 *   - H143 Unlock with: PIN only / Fingerprint only / Both (hub-lock.method; needs the current PIN). Fingerprint
 *     needs a phone; fingerprint only keeps the PIN as a hidden recovery ('Use PIN' on the lock screen).
 *   - H143 Phones: Add phone (needs the current PIN) shows a QR to unlock.html#r:<id>; the phone makes a passkey and
 *     sends its public key over PeerJS; HubLockCore.verifyRegistration checks it, then it is saved (hub-lock.keys).
 *     Remove needs the PIN; removing the last phone while the method uses the fingerprint falls back to PIN only.
 *     Adding a phone never turns Activate on. PeerJS + qrcode.js load only when Add phone is used.
 * Keys hub-lock.*: this device only (never synced, never in a profile). No attempt limit in H142 / H143.
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
    mismatch: 'The two new PINs do not match.',
    // H143
    'no-phone': 'Add a phone first (Phones below).',
    'not-ready': 'Set up the chosen unlock method first.',
    'bad-method': 'Pick PIN, Fingerprint or Both.',
    'dup-key': 'This phone is already added.',
    'too-many': 'Up to 10 phones can be added.',
    'bad-key': 'The phone sent a key the Hub cannot use.',
    'no-key': 'That phone is not in the list.',
    'bad-type': 'The phone answer was not a registration.',
    'bad-challenge': 'The phone answered an old code. Try Add phone again.',
    'bad-origin': 'The phone page was opened from a different address. Open the Hub from its github.io address and try again.',
    'no-peer': 'Could not start the phone link (needs internet). Try again.',
    'no-https': 'Fingerprint needs the Hub opened from its https web address (jor-teron.github.io).'
  };
  /* H143: PeerJS + qrcode.js only when Add phone is used (same files the Hub uses) */
  const loaded = {};
  function loadScript(rel, test) {
    if (test()) return Promise.resolve();
    if (loaded[rel]) return loaded[rel];
    loaded[rel] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../../../' + rel, location.href).href;
      s.onload = () => (test() ? resolve() : reject(new Error(rel)));
      s.onerror = () => { loaded[rel] = null; reject(new Error(rel)); };
      document.head.appendChild(s);
    });
    return loaded[rel];
  }
  let reg = null;   // the running Add phone session
  function stopReg() { if (reg) { try { reg.stop(true); } catch (_) { /* gone */ } reg = null; } }
  const fmtDay = (t) => { try { return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch (_) { return ''; } };
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
      stopReg();   // H143: a re-render ends a waiting Add phone
      const L = lockApi();
      if (!L) { pane.append(ui.note('Screen lock is not available in this browser.')); return; }
      const has = L.hasPin(), on = L.isOn(), inHub = !!hubLock();
      const phones = L.keys ? L.keys() : [], method = L.method ? L.method() : 'pin';
      const status = ui.note(!has ? 'Off. Set a PIN first, then switch Activate on.'
        : on ? (method === 'pin' ? 'On. The Hub asks for the PIN each time it opens on this computer.'
          : method === 'finger' ? 'On. The Hub asks for your phone\u2019s fingerprint each time it opens on this computer.'
            : 'On. The Hub asks for the PIN or your phone\u2019s fingerprint each time it opens on this computer.')
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
        card.append(ui.el('p', 'key-hint', 'Current PIN: needed to change the PIN, turn the lock off, remove the PIN, pick the unlock method, or add / remove a phone.'));
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

      // H143: Unlock with (PIN only / Fingerprint only / Both)
      const mTitle = ui.title('Unlock with');
      const mPick = ui.choice([
        { value: 'pin', label: 'PIN', hint: 'Keypad or phone PIN' },
        { value: 'finger', label: 'Fingerprint', hint: 'Phone fingerprint; PIN hidden as recovery' },
        { value: 'both', label: 'Both', hint: 'Either one unlocks' }
      ], method, (v) => { if (working) { mPick.repaint(L.method()); return; } run(async () => {
        if (!L.setMethod) { mPick.repaint('pin'); return; }
        const r = await L.setMethod(v, cur ? cur.value : '');
        if (!r.ok) { mPick.repaint(L.method()); tell(ERR[r.error] || ERR['hash-failed']); return; }
        done(v === 'pin' ? 'Unlock with: PIN.' : v === 'finger' ? 'Unlock with: fingerprint. The PIN stays as a hidden recovery (Use PIN on the lock screen).' : 'Unlock with: PIN or fingerprint.');
      }); });
      mPick.dataset.key = 'lockMethod';
      if (!has) { mPick.setAttribute('aria-disabled', 'true'); mPick.style.opacity = '0.45'; mPick.title = 'Set a PIN first'; }

      // H143: Phones (public keys of phone passkeys, this device only)
      const card3 = ui.el('div', 'card key-row');
      card3.append(ui.el('p', 'key-hint', phones.length ? 'Phones that can unlock this Hub with a fingerprint:' : 'No phone added yet. Add one to unlock with its fingerprint.'));
      phones.forEach((k) => {
        const line = ui.el('div', 'key-line');
        line.append(ui.el('span', 'key-name', '\uD83D\uDCF1 ' + k.name + (k.added ? ', added ' + fmtDay(k.added) : '')));
        const rm = ui.el('button', 'key-btn key-del', 'Remove');
        rm.type = 'button';
        rm.addEventListener('click', () => run(async () => {
          const r = await L.removeKey(k.credId, cur ? cur.value : '');
          if (!r.ok) { tell(ERR[r.error] || ERR['hash-failed']); return; }
          done(r.fellBack ? 'Phone removed. No phone left, so the Hub unlocks with the PIN again.' : 'Phone removed.');
        }));
        line.append(rm);
        card3.append(line);
      });
      const add = ui.el('button', 'key-btn key-save', 'Add phone');
      add.type = 'button';
      add.disabled = !has || !L.addKey;
      add.title = has ? 'Needs the current PIN' : 'Set a PIN first';
      const qrWrap = ui.el('div', 'lock-reg');
      qrWrap.hidden = true;
      const qrBox = ui.el('div', 'lock-reg-qr');
      qrBox.style.cssText = 'display:inline-block;background:#fff;border-radius:10px;padding:6px;line-height:0;width:240px;height:240px;box-sizing:border-box';
      const qrNote = ui.el('p', 'key-hint');
      qrNote.setAttribute('aria-live', 'polite');
      const cancel = ui.el('button', 'key-btn', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', () => { stopReg(); qrWrap.hidden = true; add.disabled = !has; tell(''); });
      qrWrap.append(qrBox, qrNote, cancel);
      add.addEventListener('click', () => run(async () => {
        if (location.protocol !== 'https:' || !(window.crypto && window.crypto.subtle)) { tell(ERR['no-https']); return; }
        const pin = cur ? cur.value : '';
        if (!/^\d{4}$/.test(pin)) { tell(ERR['need-current']); return; }
        if (!(await L.verify(pin))) { tell(ERR['wrong-current']); return; }
        try {
          await loadScript('shared/vendor/peerjs.min.js', () => !!window.Peer);
          await loadScript('shared/vendor/qrcode.js', () => typeof window.qrcode === 'function');
        } catch (_) { tell(ERR['no-peer']); return; }
        stopReg();
        add.disabled = true;
        qrWrap.hidden = false;
        tell('');
        const C = window.HubLockCore;
        const site = new URL('../../../', location.href).href;
        const draw = (url) => {
          qrBox.textContent = '';
          if (!url) return;
          try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); qrBox.innerHTML = q.createSvgTag(6, 24); qrBox.dataset.link = url; } catch (_) { qrNote.textContent = 'QR code unavailable.'; }
        };
        const s = C.createRegSession({
          Peer: window.Peer,
          exclude: () => L.keys().map((k) => k.credId),
          onCred: async (msg, challenge) => {
            const v = await C.verifyRegistration(msg, { challenge, origin: location.origin });
            if (!v.ok) return v;
            return L.addKey(v.rec, pin);   // never turns Activate on
          },
          onDone: () => { reg = null; done('Phone added. Pick Fingerprint or Both under Unlock with to use it.'); },
          onState: (st, info) => {
            if (reg !== s) return;
            if (st === 'ready' && info && info.id) { draw(C.regUrl(site, info.id)); qrNote.textContent = 'Scan with your phone camera, tap Register this phone, then touch the fingerprint sensor.'; }
            else if (st === 'starting') { draw(''); qrNote.textContent = 'Getting the phone code ready\u2026'; }
            else if (st === 'checking') qrNote.textContent = 'Checking the phone\u2026';
            else if (st === 'wrong') { draw(''); tell(ERR[info && info.reason] || 'The phone was not added. Scan the new code to try again.'); }
            else if (st === 'error') { draw(''); qrNote.textContent = 'Phone link not available right now (needs internet). Retrying\u2026'; }
          }
        });
        reg = s;
        s.start();
        setTimeout(() => { if (reg === s) { stopReg(); qrWrap.hidden = true; add.disabled = !has; tell('Add phone timed out. Try again.'); } }, 5 * 60000);   // not left open forever
      }));
      const addLine = ui.el('div', 'key-line');
      addLine.append(add);
      card3.append(addLine, qrWrap);

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
        done('PIN removed. The lock is off' + (phones.length ? ' and the phones were removed too.' : '.'));
      }));
      row.append(now, del);
      const card2 = ui.el('div', 'card key-row');
      card2.append(row, out);
      if (flash) { tell(flash.text, flash.ok); flash = null; }

      pane.append(status, card, act, mTitle, mPick, card3, card2,
        ui.note('Unlock with the keypad on the lock screen, or scan its QR code with your phone and type the PIN or use your fingerprint there (needs internet). Each QR code works once.'),
        ui.note('Fingerprint: your fingerprint never leaves the phone; the phone keeps a passkey and the Hub keeps only its public key. It works only on the Hub\u2019s github.io address (not a Tailscale or local copy). Adding a phone does not turn the lock on.'),
        ui.note('Desktop mode only. This computer only: not sent with Send profile or sync. There is no limit on wrong tries yet. This is a casual lock: someone who knows browser tools can get past it.'));
    }
  });
  // keep the open pane in step with another tab
  window.addEventListener('storage', (e) => {
    if (!e.key || e.key.indexOf('hub-lock.') !== 0) return;
    if (location.hash.replace('#', '').split('/')[0] === 'lock') Settings.open('lock');
  });
})();
