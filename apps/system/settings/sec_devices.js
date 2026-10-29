/*
 * Settings → Devices (apps/system/settings/sec_devices.js, H29.2b). Everything about this device and the
 * devices it is linked with, moved out of About (About was getting crowded): Device name, Connected devices
 * (new, read-only), Profile, Send profile. Listed in the nav above How-to (H56; was directly above About, after How-to) (index.html loads this file
 * before sec_about.js; Settings shows sections in the order they register). Deep links: #devices,
 * #devices/device, #devices/connected, #devices/profile, #devices/sync. The old #about/device, #about/profile
 * and #about/sync still work: settings.js (ALIASES) rewrites them to the #devices/… anchors.
 * H29.2b: "Connected devices" card (id 'connected'): this device (name, Desktop / Phone mode, Hub or joined, link
 *   state) plus every device the Connect Code link knows (HubSync.peers(): name, Hub tag for the host, Desktop /
 *   Phone mode when that device has sent a profile here, Connected / Offline). Read-only, text only
 *   (textContent); repaints on SharedLink 'devices' / 'status' / 'open' / 'close'. Empty: a hint to use
 *   🎮 Devices; opened on its own (no Hub link): a note to open Settings inside the Hub.
 * Moved here unchanged from sec_about.js (H29.2b; anchors now #devices/…):
 * H30.1: "Profile folder" card (id 'profile', deep link #about/profile): the Hub's settings saved to
 *   <connected folder>/hub/hub-profile/hub.json by hub/core/hub_profile.js (window.HubProfile in the Hub).
 *   Shows the folder (a choice when more than one is connected), status, last save, Save now / Load now.
 * H30.2: also lists the System apps whose settings go to hub/hub-profile/system/<app>.json
 *   (H30.7: and the Media / Connectivity / Tools / Office apps → hub-profile/<category>/<app>.json).
 * H30.5: 'Save profile to' — tick Google Drive and / or any connected host folder (by its real name); every ticked
 *   place gets the profile, the newest copy wins on start. Drive not signed in → 'Sign in to Google Drive' in its row.
 * H30.6: 'Save every' 30 s / 1 min (default) / 5 min / 15 min / Manual only (HubProfile.setEvery).
 * H30.3: 'Include keys in profile' switch (off by default; on = the API keys go into hub.json too) and
 *   Export profile / Import profile (one .json file, for devices without a folder; works with no folder).
 * H46: "Device name" card (id 'device', deep link #about/device; moved here from the Hub's 🎮 Devices pop-up,
 *   which now only shows 'Name: X ›' and opens this card). Text box (max 40, like SharedLinkUI.mountName) + Save.
 *   Inside the Hub (also a phone that joined a Hub, window.__hubRemote) it calls the Hub's own
 *   SharedLinkDevices.setName(): saves localStorage 'shared-link-device-name' and sends {t:'name'} over the
 *   live link (the host re-broadcasts the device list), then fires 'hub-device-name' on the Hub window so the
 *   pop-up text repaints. Opened on its own it uses its own SharedLinkDevices (shared/link/link_devices.js,
 *   no link here): the key is saved and any open Hub tab picks it up from the 'storage' event (hub_panels.js).
 *   Empty = the default name guessed from the browser (shown as the placeholder).
 * H29.1: "Send profile" card (id 'sync', deep link #about/sync; Hub side hub/link/hub_sync.js, window.HubSync).
 *   Send: pick a connected device, optional ticks 'Desktop layout' / 'Phone layout' (off), Send (no API keys).
 *   Incoming: preview grouped Shared / Desktop / Phone, each row tagged, name + This device + Incoming value,
 *   Keep mine (default) / Use incoming (default for settings this device does not have, marked New),
 *   Keep all mine / Use all incoming, Apply / Cancel; summary + Reload Hub after Apply. Text only (textContent).
 * H29.3: "Undo last sync" card (id 'undo', deep link #devices/undo, right after Send profile). Shows the backup
 *   HubSync.backup() kept at the last Apply: time, sender, how many settings and API keys (counts only, never a
 *   key value). Undo last sync asks first (UiDialog.confirm), then HubSync.undo() puts every one back exactly
 *   (settings that were new are removed again), the API Keys page repaints (HubKeys onChange), the backup is
 *   cleared, and a summary offers Reload Hub. No backup: the button is disabled with a hint. The Apply summary
 *   in Send profile has an Undo button too, and both summaries say 'Saved to profile folder' once the
 *   immediate folder save (hub_sync.js) worked.
 * H55: "Public mesh" card (id 'public', deep link #devices/public, right after Connected devices). Switch
 *   'Join public mesh' ('sites-hub.meshPublic', '0' = off, default on, H29 Shared group; the Hub's
 *   HubMeshLink.setPublic() applies it at once: off leaves 0000). Lists the devices on the public mesh 0000
 *   (HubMesh.roster() while HubMesh.me().public; short name (16), Desktop / Phone mode, device ID; at most 20)
 *   with "Invite to my code" per online device when this Hub has its own code (HubMeshLink.ownCode(): hosting,
 *   not yet paired); received invites show with Join / Dismiss (HubMeshLink.invites()). Text only. The H50
 *   Hub mesh box under Connected devices points here while this device is on 0000.
 * H55b: both mesh notes (#mesh-note private, #pub-note public; data-state = the key) show the real link state
 *   from HubMesh.me().joinState (linkState()): Linking… Ns (seconds into the 60 s wait), Lobby (you), Linked,
 *   Retrying in Ns, Refused (reason), Not linked: tap Retry (gave up after 5 minutes). A Retry button
 *   (#mesh-retry / #pub-retry → HubMesh.retry(), a fresh run) shows while retrying or given up. Redrawn every 1 s.
 */
(function () {
  'use strict';
  const S = window.SettingsStore, ui = window.Settings.ui;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];   // copy of sec_about.js
  /** ms → '20 Oct 2026, 09:00' (browser local time) or 'Never'. (copy of sec_about.js) */
  function niceTime(ms) {
    if (!ms) return 'Never';
    const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function row(label, value) {   // copy of sec_about.js
    const r = ui.el('div', 'about-row');
    r.append(ui.el('span', 'about-k', label), ui.el('b', 'about-v', value));
    return r;
  }

  /* H30.1: Profile folder */
  const STATE_TEXT = {
    none: 'No folder connected. Add a folder in Files or Disk and the Hub keeps its settings there.',
    unsupported: 'This browser cannot keep a profile folder.',
    prompt: 'The browser wants a click to use the folder again. Save now or Load now asks for it.',
    denied: 'Access to the folder was refused.',
    ready: 'Saving automatically after a change.',
  };
  /* H30.6 */
  const EVERY_OPTS = [{ value: 30, label: '30 s' }, { value: 60, label: '1 min' }, { value: 300, label: '5 min' },
    { value: 900, label: '15 min' }, { value: 0, label: 'Manual only' }];
  const everyText = (s) => !s ? 'Manual only: nothing is saved until you press Save now (or the Hub is closed with unsaved changes).'
    : 'Saving ' + (s < 60 ? s + ' s' : s / 60 + ' min') + ' after a change, only when something changed; also when the Hub is closed.';
  const TSTATE = { ready: 'Connected', prompt: 'Needs a click', denied: 'No access', signin: 'Sign in to Google Drive', error: 'Error' };
  function profileCard(sub) {
    const card = ui.el('section', 'card');
    card.id = 'profile';
    card.appendChild(ui.el('h3', '', 'Profile'));
    const hub = S.hub();
    const HP = hub && hub.HubProfile;
    if (!HP) {
      card.appendChild(ui.el('p', 'opt-note', 'Open Settings inside the Hub to save your Hub settings to your connected folder.'));
      return card;
    }
    const body = ui.el('div');
    const out = ui.el('p', 'upd-out', '');
    out.setAttribute('aria-live', 'polite');
    const saveB = ui.el('button', 'big-btn', 'Save now'); saveB.type = 'button'; saveB.id = 'profile-save';
    const loadB = ui.el('button', 'big-btn', 'Load now'); loadB.type = 'button'; loadB.id = 'profile-load';
    const btns = ui.el('div', 'profile-btns');
    btns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    btns.append(saveB, loadB);
    // H30.3: keys switch + one-file export / import
    const keyNote = ui.el('p', 'opt-note', '');
    const paintKeyNote = (on) => {
      keyNote.textContent = on
        ? 'Your API keys are saved in hub.json and in exported files as plain text. Anyone who can open the folder or the file can use them.'
        : 'API keys stay only in this browser. Sign-ins are never saved.';
    };
    const keysSw = ui.switch('Include keys in profile', 'Also save your API keys (Settings \u2192 API Keys) in the profile',
      HP.includeKeys(), (on) => { paintKeyNote(on); HP.setIncludeKeys(on).then(draw); });
    keysSw.id = 'profile-keys';
    paintKeyNote(HP.includeKeys());
    const expB = ui.el('button', 'big-btn', 'Export profile'); expB.type = 'button'; expB.id = 'profile-export';
    const impB = ui.el('button', 'big-btn', 'Import profile'); impB.type = 'button'; impB.id = 'profile-import';
    const file = document.createElement('input');
    file.type = 'file'; file.accept = '.json,application/json'; file.hidden = true; file.id = 'profile-file';
    const btns2 = ui.el('div', 'profile-btns');
    btns2.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    btns2.append(expB, impB, file);
    expB.addEventListener('click', () => {
      const data = HP.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'hub-profile-' + data.savedAt.slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      out.className = 'upd-out ok';
      out.textContent = 'Exported ' + a.download + (data.keys ? ' (with API keys)' : '');
    });
    impB.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      let r;
      try { r = await HP.importData(await f.text()); } catch (_) { r = { ok: false }; }
      out.className = 'upd-out ' + (r.ok ? 'ok' : 'bad');
      out.textContent = r.ok ? 'Imported \u2014 reloading the Hub\u2026' : 'That file is not a Hub profile';
      if (r.ok) setTimeout(() => hub.location.reload(), 400);
    });
    // H30.5: where
    const placesBox = ui.el('div', 'profile-places');
    placesBox.id = 'profile-places';
    placesBox.setAttribute('role', 'group');
    placesBox.setAttribute('aria-label', 'Save profile to');
    // H30.6: when
    const everyNote = ui.el('p', 'opt-note', everyText(HP.every ? HP.every() : 60));
    const everySeg = ui.choice(EVERY_OPTS, HP.every ? HP.every() : 60, (v) => { HP.setEvery(v); everyNote.textContent = everyText(v); });
    everySeg.id = 'profile-every';
    card.append(ui.el('h4', 'opt-title', 'Save profile to'), placesBox, ui.el('h4', 'opt-title', 'Save every'), everySeg, everyNote,
      body, btns, out, keysSw, keyNote, btns2,
      ui.el('p', 'opt-note', 'Saved as hub/hub-profile/hub.json in each ticked place (in Google Drive: hub \u203A hub-profile), as plain JSON; app settings go to hub-profile/<category>/<app>.json (system, media, connectivity, tools, office). Sign-ins, history, documents and device data are never saved. Export / Import use one .json file, for devices without a folder.'));
    function drawPlaces(st) {
      placesBox.textContent = '';
      (st.targets || []).forEach((t) => {
        const lab = ui.el('label', 'profile-place');
        lab.dataset.id = t.id;
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = !!t.ticked; cb.value = t.id;
        cb.addEventListener('change', () => {
          const ids = [...placesBox.querySelectorAll('input[type=checkbox]')].filter((x) => x.checked).map((x) => x.value);
          out.className = 'upd-out'; out.textContent = '';
          HP.setTargets(ids).then(draw);
        });
        const name = ui.el('span', 'pp-name', (t.kind === 'gdrive' ? '\u2601\uFE0F ' : '\uD83D\uDCC1 ') + t.name + (t.account ? ' (' + t.account + ')' : ''));
        const stt = ui.el('small', 'pp-state ' + t.state, t.error && t.ticked ? 'Error: ' + t.error : TSTATE[t.state] || t.state);
        lab.append(cb, name, stt);
        placesBox.appendChild(lab);
      });
      if (!(st.targets || []).some((t) => t.kind === 'folder')) placesBox.appendChild(ui.el('p', 'opt-note', 'No host folder connected (add one in Files or Disk).'));
    }
    async function draw() {
      const st = await HP.status();
      body.textContent = '';
      drawPlaces(st);
      const on = (st.targets || []).filter((t) => t.ticked);
      body.appendChild(row('Status', on.length ? on.map((t) => t.name + ': ' + (TSTATE[t.state] || t.state)).join(' \u00B7 ')
        : st.state === 'unsupported' ? 'Not supported' : 'Nowhere ticked'));
      body.appendChild(row('Last saved', niceTime(st.lastSave)));
      if (st.lastLoad) body.appendChild(row('Last loaded', niceTime(st.lastLoad)));
      on.forEach((t) => body.appendChild(row(on.length > 1 ? 'File (' + t.name + ')' : 'File', t.path)));
      if (on.length && HP.appsBy) {   // H30.2 / H30.7: app settings next to hub.json, one folder per category
        const by = HP.appsBy(), nice = (a) => (a[0].toUpperCase() + a.slice(1)).replace(/[-_]/g, ' ');
        Object.keys(by).forEach((c) => { if (by[c].length) body.appendChild(row(c[0].toUpperCase() + c.slice(1) + ' apps', by[c].map(nice).join(', '))); });
      } else if (on.length && HP.apps) body.appendChild(row('System apps', HP.apps().join(', ')));
      body.appendChild(ui.el('p', 'opt-note', st.error || (on.length ? '' : STATE_TEXT.none)));
      if (everySeg.repaint && st.every != null) { everySeg.repaint(st.every); everyNote.textContent = everyText(st.every); }
      saveB.disabled = loadB.disabled = !on.length;
      keysSw.classList.toggle('on', !!st.includeKeys); keysSw.setAttribute('aria-checked', st.includeKeys ? 'true' : 'false');
      paintKeyNote(!!st.includeKeys);
    }
    saveB.addEventListener('click', async () => {
      saveB.disabled = true; out.className = 'upd-out'; out.textContent = 'Saving\u2026';
      const r = await HP.save({ ask: true, force: true });
      out.className = 'upd-out ' + (r.ok ? 'ok' : 'bad');
      out.textContent = r.ok ? 'Saved' + (r.places > 1 ? ' to ' + r.places + ' places' : '') + (r.errors && r.errors.length ? ' (not to ' + r.errors.join('; ') + ')' : '')
        : r.reason === 'permission' ? 'No access to the ticked places' : r.reason === 'no-folder' ? 'Tick a place first' : 'Could not save';
      draw();
    });
    loadB.addEventListener('click', async () => {
      loadB.disabled = true; out.className = 'upd-out'; out.textContent = 'Loading\u2026';
      const r = await HP.load({ ask: true, force: true });
      out.className = 'upd-out ' + (r.applied ? 'ok' : 'bad');
      out.textContent = r.applied ? 'Loaded \u2014 reloading the Hub\u2026' : r.reason === 'no-file' ? 'No saved profile in the ticked places yet'
        : r.reason === 'permission' ? 'No access to the ticked places' : 'Could not load';
      if (r.applied) setTimeout(() => hub.location.reload(), 400); else draw();
    });
    const off = HP.onChange(() => { if (card.isConnected) draw(); else off(); });
    draw();
    if (sub === 'profile') setTimeout(() => card.scrollIntoView({ block: 'start' }), 50);
    return card;
  }

  /* H29.1: Send profile to a connected device + review an incoming one (Hub side: hub/link/hub_sync.js) */
  // const GROUP_NAME = { shared: 'Shared', desktop: 'Desktop', phone: 'Phone' };   // (H29.1)
  const GROUP_NAME = { shared: 'Shared', desktop: 'Desktop', phone: 'Phone', keys: 'API keys' };   // H29.2: + keys
  /* H29.2: what to send (same parts as the profile export file; Everything is the default) */
  const WHAT_OPTS = [['everything', 'Everything', 'Hub settings and every app\u2019s settings'],
    ['hub', 'Hub settings', 'Theme, accent, wallpaper, favorites, layout (Settings app choices)'],
    ['system', 'System app settings', 'Files, Viewer and Terminal settings only']];
  const short = (v) => { if (v == null) return '(not set)'; const t = String(v); return t.length > 120 ? t.slice(0, 117) + '\u2026' : t; };
  /* H29.3: 'Saved to profile folder' line for the Apply / Undo summaries */
  function folderLine(state, id) {
    const t = state === 'saved' ? 'Saved to profile folder' : state === 'pending' ? 'Saving to profile folder\u2026'
      : state === 'failed' ? 'Could not save to the profile folder; it is saved again on the next change' : '';
    if (!t) return null;
    const p = ui.el('p', 'upd-out ' + (state === 'failed' ? 'bad' : 'ok'), t); p.id = id;
    return p;
  }
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  function backupText(b) {
    return plural(b.settings, 'setting') + (b.keys ? ' and ' + plural(b.keys, 'API key') : '');
  }
  /* H29.3: confirm, then undo (shared by the Undo last sync card and the Apply summary) */
  async function askUndo(HS, hub) {
    const b = HS.backup();
    if (!b) return false;
    const D = window.UiDialog;
    const text = 'Puts back the ' + backupText(b) + ' changed by the profile from ' + b.from + ' (' + niceTime(b.at) + ') exactly as they were. ' +
      'Settings and keys that sync added are removed again.';
    const ok = D ? await D.confirm('Undo last sync?', text, 'Undo', true) : window.confirm('Undo last sync? ' + text);
    if (!ok) return false;
    const r = HS.undo();
    return !!(r && r.ok);
  }
  function undoCard(sub) {
    const card = ui.el('section', 'card sync-undo-card');
    card.id = 'undo';
    card.appendChild(ui.el('h3', '', 'Undo last sync'));
    const hub = S.hub();
    const HS = hub && hub.HubSync;
    if (!HS || !HS.backup) {
      card.appendChild(ui.el('p', 'opt-note', 'Open Settings inside the Hub to undo a profile sync.'));
      return card;
    }
    card.appendChild(ui.el('p', 'opt-note', 'Each time you press Apply on an incoming profile, the settings and API keys it changes are backed up on this device first (only the last sync). ' +
      'Undo puts them back exactly; key values are never shown.'));
    const info = ui.el('div', 'sync-undo-info'); info.id = 'undo-info';
    const btn = ui.el('button', 'big-btn', 'Undo last sync'); btn.type = 'button'; btn.id = 'undo-btn';
    const hint = ui.el('p', 'opt-note', ''); hint.id = 'undo-hint';
    const out = ui.el('div', 'sync-undo-out'); out.id = 'undo-out'; out.setAttribute('aria-live', 'polite');
    card.append(info, btn, hint, out);
    btn.addEventListener('click', () => { askUndo(HS, hub); });
    function draw() {
      if (!card.isConnected) { off(); return; }
      paint();
    }
    function paint() {   // the first paint runs before the card is in the page
      const b = HS.backup();
      info.textContent = '';
      if (b) {
        info.append(row('Last sync', niceTime(b.at)), row('From', b.from), row('Covers', backupText(b)));
        btn.disabled = false; hint.textContent = '';
      } else {
        btn.disabled = true;
        hint.textContent = 'Nothing to undo. A backup is kept when you press Apply on a profile sent from another device.';
      }
      out.textContent = '';
      const u = HS.lastUndo && HS.lastUndo();
      if (u) {
        const sm = ui.el('div', 'sync-summary'); sm.id = 'undo-summary';
        sm.append(ui.el('h4', 'opt-title', 'Last sync undone'),
          ui.el('p', '', 'Put back ' + backupText(u) + ' from before the profile from ' + u.from + '.'));
        const fl = folderLine(u.folder, 'undo-folder');
        if (fl) sm.appendChild(fl);
        const rl = ui.el('button', 'big-btn', 'Reload Hub'); rl.type = 'button'; rl.id = 'undo-reload';
        rl.addEventListener('click', () => hub.location.reload());
        sm.append(ui.el('p', 'opt-note', 'Reload the Hub to see every change.'), rl);
        out.appendChild(sm);
      }
    }
    const off = HS.onChange(draw);
    window.addEventListener('pagehide', () => off());
    paint();
    if (sub === 'undo') setTimeout(() => card.scrollIntoView({ block: 'start' }), 50);
    return card;
  }
  function syncCard(sub) {
    const card = ui.el('section', 'card sync-card');
    card.id = 'sync';
    card.appendChild(ui.el('h3', '', 'Send profile'));
    const hub = S.hub();
    const HS = hub && hub.HubSync, HP = hub && hub.HubProfile;
    if (!HS || !HP) {
      card.appendChild(ui.el('p', 'opt-note', 'Open Settings inside the Hub to send your profile to a connected device.'));
      return card;
    }
    // card.appendChild(ui.el('p', 'opt-note', 'Send this device\u2019s Hub and app settings to a device connected with the Connect Code (\uD83C\uDFAE Devices). ' +
    //   'API keys and sign-ins are never sent. Nothing changes on the other device until it reviews the list and presses Apply.'));   // (H29.1)
    card.appendChild(ui.el('p', 'opt-note', 'Send this device\u2019s Hub and app settings to a device connected with the Connect Code (\uD83C\uDFAE Devices). ' +
      'Sign-ins are never sent, and API keys only when you tick them. Nothing changes on the other device until it reviews the list and presses Apply.'));
    const devBox = ui.el('div', 'sync-devs'); devBox.id = 'sync-devs';
    devBox.setAttribute('role', 'radiogroup'); devBox.setAttribute('aria-label', 'Send to');
    let picked = '';
    const tick = (id, label, hint) => {
      const lab = ui.el('label', 'sync-tick');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id;
      const t = ui.el('span', ''); t.append(ui.el('b', '', label), ui.el('small', '', hint));
      lab.append(cb, t);
      return lab;
    };
    const tickD = tick('sync-inc-desktop', 'Desktop layout', 'Also copy Desktop settings (taskbar, windows, snapping, desktop icons) to a device in Phone mode');
    const tickP = tick('sync-inc-phone', 'Phone layout', 'Also copy Phone settings (Home button) to a device in Desktop mode');
    // H29.2: what to send + API keys
    const whatBox = ui.el('div', 'sync-what'); whatBox.id = 'sync-what';
    whatBox.setAttribute('role', 'radiogroup'); whatBox.setAttribute('aria-label', 'What to send');
    let what = 'everything';
    WHAT_OPTS.forEach((o) => {
      const lab = ui.el('label', 'sync-tick');
      const r = document.createElement('input'); r.type = 'radio'; r.name = 'sync-what'; r.value = o[0]; r.id = 'sync-what-' + o[0];
      r.checked = o[0] === what;
      r.addEventListener('change', () => { if (r.checked) { what = o[0]; layoutOn(); } });
      const t = ui.el('span', ''); t.append(ui.el('b', '', o[1]), ui.el('small', '', o[2]));
      lab.append(r, t);
      whatBox.appendChild(lab);
    });
    const tickK = tick('sync-inc-keys', 'Include API keys', 'Off by default. Keys are shown masked (last 4 characters) on the other device and never replace its own keys unless chosen there.');
    function layoutOn() {   // the layout ticks only matter when Hub settings go
      [tickD, tickP].forEach((l) => { l.firstChild.disabled = what === 'system'; l.classList.toggle('off', what === 'system'); });
    }
    const sendB = ui.el('button', 'big-btn', 'Send'); sendB.type = 'button'; sendB.id = 'sync-send';
    const out = ui.el('p', 'upd-out', ''); out.id = 'sync-out'; out.setAttribute('aria-live', 'polite');
    // const groupsNote = ui.el('p', 'opt-note', 'Always sent: Shared settings (theme, accent, wallpaper, favorites, app settings) plus the layout of the mode the other device is in. ' +
    //   'Your Screen mode choice is never sent.');   // (H29.1)
    const groupsNote = ui.el('p', 'opt-note', 'From what you pick above, the other device gets the Shared settings plus the layout of the mode it is in (the ticks add the other layout). ' +
      'Your Screen mode choice is never sent.');   // H29.2
    const prev = ui.el('div', 'sync-prev'); prev.id = 'sync-preview';
    // card.append(ui.el('h4', 'opt-title', 'Send to'), devBox, ui.el('h4', 'opt-title', 'Also include'), tickD, tickP, groupsNote, sendB, out, prev);   // (H29.1)
    card.append(ui.el('h4', 'opt-title', 'Send to'), devBox, ui.el('h4', 'opt-title', 'What to send'), whatBox,
      ui.el('h4', 'opt-title', 'Also include'), tickD, tickP, tickK, groupsNote, sendB, out, prev);   // H29.2

    const SENT = { sent: 'Sent \u2014 waiting for that device', got: 'Received \u2014 waiting for that device to review it', failed: 'Could not send (device gone?)',
      cancelled: 'Cancelled on that device. Nothing changed there.', bad: 'That device could not read the profile' };
    function drawDevs() {
      const list = HS.devices();
      devBox.textContent = '';
      if (!list.some((d) => d.id === picked)) picked = list.length ? list[0].id : '';
      list.forEach((d, i) => {
        const lab = ui.el('label', 'sync-dev');
        const r = document.createElement('input'); r.type = 'radio'; r.name = 'sync-dev'; r.value = d.id; r.id = 'sync-dev-' + i;
        r.checked = d.id === picked;
        r.addEventListener('change', () => { picked = d.id; });
        lab.append(r, ui.el('span', '', d.name));
        devBox.appendChild(lab);
      });
      if (!list.length) devBox.appendChild(ui.el('p', 'opt-note', 'No device connected. Connect one with the code in \uD83C\uDFAE Devices first.'));
      sendB.disabled = !list.length;
    }
    function drawSent() {
      const s = HS.lastSend();
      if (!s) return;
      out.className = 'upd-out ' + (s.state === 'failed' || s.state === 'bad' ? 'bad' : 'ok');
      out.textContent = s.state === 'applied' ? s.toName + ' used ' + s.applied + ' setting' + (s.applied === 1 ? '' : 's') + ' and kept ' + s.kept + ' of its own'
        : (SENT[s.state] || s.state) + ' (' + s.toName + ')';
    }
    sendB.addEventListener('click', () => {
      // const r = HS.send(picked, { desktop: tickD.firstChild.checked, phone: tickP.firstChild.checked });   // (H29.1)
      const r = HS.send(picked, { desktop: tickD.firstChild.checked, phone: tickP.firstChild.checked, what, keys: tickK.firstChild.checked });   // H29.2
      if (!r.ok) {
        out.className = 'upd-out bad';
        out.textContent = r.reason === 'too-big' ? 'The profile is too big to send over the link' : r.reason === 'no-device' ? 'Pick a connected device' : 'Could not send';
      } else drawSent();
    });

    let cancelled = false;
    function drawPrev() {
      prev.textContent = '';
      const p = HS.pending(), res = HS.lastResult();
      if (p) cancelled = false;
      if (!p) {
        if (cancelled && !res) { const c = ui.el('p', 'upd-out', 'Cancelled \u2014 nothing changed.'); c.id = 'sync-cancelled'; prev.appendChild(c); }
        if (res) {
          const sm = ui.el('div', 'sync-summary'); sm.id = 'sync-summary';
          sm.append(ui.el('h4', 'opt-title', 'Profile from ' + res.name + ' applied'),
            ui.el('p', '', 'Used ' + res.applied + ' incoming setting' + (res.applied === 1 ? '' : 's') + ', kept ' + res.kept + ' of yours' + (res.same ? ', ' + res.same + ' were already the same' : '') + '.'));
          if (res.labels && res.labels.length) sm.appendChild(ui.el('p', 'opt-note', 'Changed: ' + res.labels.slice(0, 30).join(', ') + (res.labels.length > 30 ? ' \u2026' : '')));
          const fl = folderLine(res.folder, 'sync-folder');   // H29.3
          if (fl) sm.appendChild(fl);
          const rl = ui.el('button', 'big-btn', 'Reload Hub'); rl.type = 'button'; rl.id = 'sync-reload';
          rl.addEventListener('click', () => hub.location.reload());
          // sm.append(ui.el('p', 'opt-note', 'Most changes show at once; reload the Hub to see every one.'), rl);   // (H29.2)
          sm.append(ui.el('p', 'opt-note', 'Most changes show at once; reload the Hub to see every one.' + (res.undo ? ' Undo puts back everything this sync changed.' : '')));
          const btns = ui.el('div', 'profile-btns sync-act');   // H29.3: Reload Hub + Undo
          btns.appendChild(rl);
          if (res.undo && HS.backup && HS.backup()) {
            const ub = ui.el('button', 'big-btn', 'Undo'); ub.type = 'button'; ub.id = 'sync-undo-now';
            ub.addEventListener('click', () => askUndo(HS, hub));
            btns.appendChild(ub);
          }
          sm.appendChild(btns);
          prev.appendChild(sm);
        }
        return;
      }
      prev.appendChild(ui.el('h4', 'opt-title', 'Incoming profile from ' + p.name));
      const skipTxt = ['desktop', 'phone'].filter((g) => p.skipped[g]).map((g) => p.skipped[g] + ' ' + GROUP_NAME[g] + ' layout setting' + (p.skipped[g] === 1 ? '' : 's') + ' not included');
      prev.appendChild(ui.el('p', 'opt-note', 'This device is in ' + GROUP_NAME[HS.mode()] + ' mode. Showing: ' + p.groups.map((g) => GROUP_NAME[g]).join(', ') + '. ' +
        p.items.length + ' differ, ' + p.same + ' already the same' + (skipTxt.length ? '; ' + skipTxt.join(', ') : '') + '. Nothing changes until Apply.'));
    if (p.include && p.include.keys) {   // H29.2
      const kn = ui.el('p', 'opt-note sync-keynote', 'API keys are shown masked (last 4 characters). ' + (p.keysSame ? p.keysSame + ' key' + (p.keysSame === 1 ? ' is' : 's are') + ' already the same. ' : '') +
        'Each key is chosen on its own row: \u201CKeep all mine\u201D and \u201CUse all incoming\u201D leave keys alone.');
      kn.id = 'sync-keynote';
      prev.appendChild(kn);
    }
      const choice = {};
      const rows = [];
      if (p.items.length) {
        const bulk = ui.el('div', 'profile-btns sync-bulk');
        const allMine = ui.el('button', 'key-btn', 'Keep all mine'); allMine.type = 'button'; allMine.id = 'sync-all-mine';
        const allIn = ui.el('button', 'key-btn', 'Use all incoming'); allIn.type = 'button'; allIn.id = 'sync-all-in';
        bulk.append(allMine, allIn);
        prev.appendChild(bulk);
        allMine.addEventListener('click', () => rows.forEach((r) => r.set('mine')));
        allIn.addEventListener('click', () => rows.forEach((r) => r.set('incoming')));
      }
      // ['shared', 'desktop', 'phone'].forEach((g) => {   // (H29.1)
      ['shared', 'desktop', 'phone', 'keys'].forEach((g) => {
        const its = p.items.filter((it) => it.group === g);
        if (!its.length) return;
        const sec = ui.el('div', 'sync-group'); sec.dataset.group = g;
        // sec.appendChild(ui.el('h5', 'sync-gh', GROUP_NAME[g] + (g === 'shared' ? '' : ' layout') + ' (' + its.length + ')'));   // (H29.1)
        sec.appendChild(ui.el('h5', 'sync-gh', GROUP_NAME[g] + (g === 'shared' || g === 'keys' ? '' : ' layout') + ' (' + its.length + ')'));
        its.forEach((it) => {
          const row = ui.el('div', 'sync-item'); row.dataset.id = it.id; row.dataset.group = g;
          const head = ui.el('div', 'sync-ih');
          head.append(ui.el('b', 'sync-name', it.label), ui.el('span', 'sync-tag sync-tag-' + g, GROUP_NAME[g]));
          if (it.isNew) head.appendChild(ui.el('span', 'sync-tag sync-new', 'New'));
          else if (it.isKey) head.appendChild(ui.el('span', 'sync-tag sync-conflict', 'Different'));   // H29.2
          const vals = ui.el('div', 'sync-vals');
          // H29.2: key rows only ever get the masked text from HubSync.pending() (never the key itself)
          vals.append(ui.el('span', 'sync-mine', 'This device: ' + short(it.mine)), ui.el('span', 'sync-in', 'Incoming: ' + short(it.incoming)));
          const seg = ui.el('div', 'sync-seg');
          const mk = (v, t) => { const b = ui.el('button', 'seg-btn sync-' + v, t); b.type = 'button'; b.dataset.v = v; seg.appendChild(b); return b; };
          // const bm = mk('mine', 'Keep mine'), bi = mk('incoming', 'Use incoming');   // (H29.1)
          const newKey = it.isKey && it.isNew;   // H29.2: a key this device does not have: Add (default) / Skip
          const bm = mk('mine', newKey ? 'Skip' : 'Keep mine'), bi = mk('incoming', newKey ? 'Add' : 'Use incoming');
          const set = (v) => { choice[it.id] = v; bm.classList.toggle('on', v === 'mine'); bi.classList.toggle('on', v === 'incoming'); row.dataset.choice = v; };
          bm.addEventListener('click', () => set('mine')); bi.addEventListener('click', () => set('incoming'));
          set(it.isNew ? 'incoming' : 'mine');
          // rows.push({ set });   // (H29.1)
          if (!it.isKey) rows.push({ set });   // H29.2: the bulk buttons never touch API keys
          row.append(head, vals, seg);
          sec.appendChild(row);
        });
        prev.appendChild(sec);
      });
      const act = ui.el('div', 'profile-btns sync-act');
      const ap = ui.el('button', 'big-btn', 'Apply'); ap.type = 'button'; ap.id = 'sync-apply';
      const cn = ui.el('button', 'big-btn', 'Cancel'); cn.type = 'button'; cn.id = 'sync-cancel';
      act.append(ap, cn);
      prev.appendChild(act);
      ap.addEventListener('click', () => { HS.apply(choice); });
      cn.addEventListener('click', () => { cancelled = true; HS.cancel(); });
    }
    function draw() { if (!card.isConnected) { off(); return; } drawDevs(); drawSent(); drawPrev(); }
    const off = HS.onChange(draw);
    window.addEventListener('pagehide', () => off());
    drawDevs(); drawSent(); drawPrev();
    if (sub === 'sync') setTimeout(() => card.scrollIntoView({ block: 'start' }), 50);
    return card;
  }

  /* H46: Device name (was the editable box in the Hub's 🎮 Devices pop-up) */
  const NAME_KEY = 'shared-link-device-name';
  function deviceCard(sub) {
    const card = ui.el('section', 'card');
    card.id = 'device';
    card.appendChild(ui.el('h3', '', 'Device name'));
    const hub = S.hub();
    const D = (hub && hub.SharedLinkDevices) || window.SharedLinkDevices || null;
    const stored = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch (_) { return ''; } };
    const guess = D && D.guess ? D.guess() : 'Device';
    card.appendChild(ui.el('p', 'opt-note', 'The name your other devices see in Devices and Chat. Leave it empty to use \u201C' + guess + '\u201D.'));
    const form = ui.el('form', 'key-line');
    form.autocomplete = 'off';
    const inp = ui.el('input', 'key-input device-input');
    inp.type = 'text'; inp.id = 'device-name'; inp.maxLength = 40; inp.placeholder = guess;
    inp.setAttribute('aria-label', 'Device name');
    inp.value = stored();
    const save = ui.el('button', 'key-btn key-save', 'Save');
    save.type = 'submit'; save.id = 'device-save';
    form.append(inp, save);
    const out = ui.el('p', 'key-out', '');
    out.setAttribute('aria-live', 'polite');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = inp.value.trim().slice(0, 40);
      let n = v || guess;
      try {
        if (D) n = D.setName(v);
        else if (v) localStorage.setItem(NAME_KEY, v); else localStorage.removeItem(NAME_KEY);
      } catch (_) { out.className = 'key-out bad'; out.textContent = 'Could not save the name'; return; }
      try { if (hub) hub.dispatchEvent(new hub.CustomEvent('hub-device-name', { detail: { name: n } })); } catch (_) { /* no Hub */ }
      inp.value = stored();
      out.className = 'key-out ok';
      out.textContent = 'Saved \u2014 this device is now \u201C' + n + '\u201D';
    });
    inp.addEventListener('input', () => { out.textContent = ''; });
    // renamed somewhere else (another tab, the controller pad, Chat): follow it unless typing here
    const onStore = (e) => {
      if (!card.isConnected) { window.removeEventListener('storage', onStore); return; }
      if ((e.key === NAME_KEY || e.key === null) && document.activeElement !== inp) inp.value = stored();
    };
    window.addEventListener('storage', onStore);
    card.append(form, out);
    if (sub === 'device') setTimeout(() => { card.scrollIntoView({ block: 'start' }); try { inp.focus({ preventScroll: true }); } catch (_) { /* old browser */ } }, 50);
    return card;
  }

  /* H29.2b: Connected devices (read-only list from the Connect Code link) */
  const MODE_NAME = { desktop: 'Desktop mode', phone: 'Phone mode' };
  function connectedCard(sub) {
    const card = ui.el('section', 'card conn-card');
    card.id = 'connected';
    card.appendChild(ui.el('h3', '', 'Connected devices'));
    const hub = S.hub();
    const L = hub && hub.SharedLink, HS = hub && hub.HubSync;
    if (!L) {
      card.appendChild(ui.el('p', 'opt-note', 'Open Settings inside the Hub to see the devices connected with the Connect Code.'));
      return card;
    }
    card.appendChild(ui.el('p', 'opt-note', 'Devices linked with the Connect Code (\uD83C\uDFAE Devices on the taskbar). Read-only: connect, join or leave in \uD83C\uDFAE Devices.'));
    const meBox = ui.el('ul', 'conn-list conn-me'); meBox.id = 'conn-me';
    const list = ui.el('ul', 'conn-list'); list.id = 'conn-list';
    list.setAttribute('aria-label', 'Connected devices');
    card.append(meBox, list);
    const myName = () => (hub.SharedLinkDevices ? hub.SharedLinkDevices.name() : 'This device');
    // const myMode = () => (HS && HS.mode ? HS.mode() : (hub.__hubRemote ? 'phone' : (hub.HubMode && hub.HubMode.mode === 'desktop' ? 'desktop' : 'phone')));   // (before H53)
    const myMode = () => (HS && HS.mode ? HS.mode() : (hub.HubMode && hub.HubMode.mode === 'desktop' ? 'desktop' : 'phone'));   // H53: real mode, joined or not
    function peers() {
      if (HS && HS.peers) return HS.peers();
      const me = L.id;
      return (L.devices || []).filter((d) => d && d.id && d.id !== me && !(d.legacy && d.online === false))
        .map((d) => ({ id: String(d.id), name: String(d.name || 'Device').slice(0, 40), online: d.online !== false, legacy: !!d.legacy, host: d.id === 'host', mode: '' }));
    }
    function item(name, tags, on, cls) {
      const li = ui.el('li', 'conn-dev' + (cls ? ' ' + cls : ''));
      const top = ui.el('div', 'conn-top');
      top.append(ui.el('b', 'conn-name', name), ui.el('span', 'conn-state ' + (on ? 'on' : 'off'), on ? 'Connected' : 'Offline'));
      const meta = ui.el('div', 'conn-meta');
      tags.filter(Boolean).forEach((t) => meta.appendChild(ui.el('span', 'conn-tag', t)));
      li.append(top, meta);
      return li;
    }
    function draw() {
      if (!card.isConnected && drawn) { stop(); return; }
      drawn = true;
      const role = L.role, code = L.code, up = !!L.connected;
      meBox.textContent = '';
      const meRole = role === 'join' ? 'Joined Hub ' + (code || '') : role === 'host' ? 'This Hub' + (code ? ' \u00b7 code ' + code : '') : 'Link off';
      const me = item(myName() + ' (this device)', [MODE_NAME[myMode()], meRole], up, 'conn-self');
      me.querySelector('.conn-state').textContent = up ? 'Linked' : (role ? 'Waiting' : 'Not linked');
      meBox.appendChild(me);
      list.textContent = '';
      const ps = peers();
      ps.forEach((d) => {
        const li = item(d.name, [d.host ? 'Hub' : d.legacy ? 'Old gamepad' : '', d.mode ? MODE_NAME[d.mode] : (d.legacy ? '' : 'Mode not known yet')], d.online);
        li.dataset.id = d.id;
        list.appendChild(li);
      });
      if (!ps.length) {
        const e = ui.el('li', 'conn-empty', 'No other device connected. Open \uD83C\uDFAE Devices on the taskbar to show this Hub\u2019s code, or type another Hub\u2019s code there.');
        e.id = 'conn-empty';
        list.appendChild(e);
      }
    }
    let drawn = false;
    const EVS = ['devices', 'status', 'open', 'close'];
    const onEv = () => setTimeout(draw, 0);
    EVS.forEach((ev) => L.on(ev, onEv));
    const offSync = HS && HS.onChange ? HS.onChange(onEv) : null;   // a received offer tells us that device's mode
    function stop() { EVS.forEach((ev) => { try { L.off(ev, onEv); } catch (_) { /* old link */ } }); if (offSync) offSync(); }
    window.addEventListener('pagehide', stop);
    draw();
    meshSection(card, hub);   // H50: the shared Hub mesh roster (one connection per Connect Code)
    if (sub === 'connected') setTimeout(() => card.scrollIntoView({ block: 'start' }), 50);
    return card;
  }

  /* H55b: the real link state of this device's mesh (HubMesh.me().joinState), for both mesh cards */
  function linkState(me) {
    const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
    const secs = (ms) => Math.max(0, Math.round(ms / 1000));
    const js = me.joinState || '';
    if (me.lobby || js === 'lobby') return { k: 'lobby', t: 'Lobby (you)' };
    if (js === 'linking') return { k: 'linking', t: 'Linking… ' + secs(Date.now() - (me.joinSince || Date.now())) + 's' };
    if (js === 'linked') return { k: 'linked', t: 'Linked' };
    if (js === 'retrying') return { k: 'retrying', t: me.retryAt ? 'Retrying in ' + Math.max(1, Math.ceil((me.retryAt - Date.now()) / 1000)) + 's' : 'Retrying…' };
    if (js === 'refused' || me.state === 'refused') return { k: 'refused', t: 'Refused (' + clip(me.refused || 'refused', 20) + ')' };
    if (js === 'gaveup' || me.gaveUp) return { k: 'gaveup', t: 'Not linked: tap Retry' };
    return { k: me.state, t: { starting: 'Starting…', claiming: 'Linking…', retry: 'Reconnecting…', duplicate: 'Open in another tab?', error: 'Error' }[me.state] || clip(me.state, 20) };
  }
  /** H55b: "Retry" for a mesh that gave up (or is waiting to retry) */
  function retryBtn(M, id, redraw) {
    const b = ui.el('button', 'key-btn mesh-retry', 'Retry'); b.type = 'button'; b.id = id;
    b.addEventListener('click', () => { M.retry(); setTimeout(redraw, 50); });
    return b;
  }

  /* H50: Hub mesh roster (read-only). Every field comes from other devices: textContent only. */
  function meshSection(card, hub) {
    const M = hub && hub.HubMesh;
    if (!M) return;
    const box = ui.el('div', 'mesh-box'); box.id = 'mesh-box';
    box.appendChild(ui.el('h4', 'mesh-h', 'Hub mesh'));
    const note = ui.el('p', 'opt-note mesh-note'); note.id = 'mesh-note';
    const list = ui.el('ul', 'conn-list mesh-list'); list.id = 'mesh-list';
    list.setAttribute('aria-label', 'Hub mesh devices');
    box.append(note, list);
    card.appendChild(box);
    const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
    const MODE = { desktop: 'Desktop mode', phone: 'Phone mode' };
    function draw() {
      if (!box.isConnected && drawn) { stop(); return; }
      drawn = true;
      const me = M.me();
      list.textContent = '';
      // if (!me) { note.textContent = 'Mesh off: it starts when a Connect Code link is on.'; return; }   (H50)
      if (!me) { note.textContent = 'Mesh off: it starts when a Connect Code link is on (or with Join public mesh below).'; return; }   // H55
      if (me.public) { note.textContent = 'Not in a private mesh: this device is on the public mesh ' + clip(me.code, 12) + ' (see Public mesh below).'; return; }   // H55
      // const st = { lobby: 'this device is the lobby', linked: 'linked', joining: 'joining…', takeover: 'lobby lost, taking over…', claiming: 'claiming the lobby…', refused: 'refused by the lobby (' + clip(me.refused, 20) + ')' }[me.state] || clip(me.state, 20);   (before H55b)
      // note.textContent = 'Code ' + clip(me.code, 12) + ' · term ' + me.term + ' · ' + st + '. Shared by all Hub apps (one connection per Connect Code).';   (before H55b)
      const ls = linkState(me);   // H55b: the real link state
      note.textContent = 'Code ' + clip(me.code, 12) + ' · term ' + me.term + ' · ' + ls.t + '. Shared by all Hub apps (one connection per Connect Code).';
      note.dataset.state = ls.k;
      if (ls.k === 'gaveup' || ls.k === 'retrying') list.appendChild(ui.el('li', 'conn-empty mesh-retry-row')).appendChild(retryBtn(M, 'mesh-retry', draw));
      const ros = M.roster();
      ros.forEach((r) => {
        const self = r.deviceId === me.deviceId;
        const li = ui.el('li', 'conn-dev mesh-dev' + (self ? ' conn-self' : ''));
        li.dataset.id = clip(r.deviceId, 40);
        const top = ui.el('div', 'conn-top');
        top.append(ui.el('b', 'conn-name', clip(r.name || 'Device', 40) + (self ? ' (this device)' : '')),
          ui.el('span', 'conn-state ' + (r.online ? 'on' : 'off'), r.online ? 'Online' : 'Offline'));
        const meta = ui.el('div', 'conn-meta');
        const apps = Object.keys(r.apps || {}).slice(0, 8).map((a) => clip(a, 24));
        [r.lobby ? 'Lobby' : '', self ? 'This device' : '', r.relay ? 'Relayed' : '', MODE[r.mode] || '', '#' + (r.joinOrder | 0), apps.length ? 'Apps: ' + apps.join(', ') : '']
          .filter(Boolean).forEach((t) => meta.appendChild(ui.el('span', 'conn-tag' + (t === 'Lobby' ? ' mesh-lobby' : t === 'Relayed' ? ' mesh-relay' : ''), t)));
        li.append(top, meta);
        list.appendChild(li);
      });
    }
    let drawn = false, t = 0;
    const onEv = () => { clearTimeout(t); t = setTimeout(draw, 0); };
    const EVS = ['roster', 'peers', 'lobby', 'status'];
    EVS.forEach((ev) => M.on(ev, onEv));
    // const tick = setInterval(draw, 5000);   // mesh may start after this card (Hub glue checks every 3 s)   (before H55b)
    const tick = setInterval(draw, 1000);   // H55b: 1 s, for the Linking… / Retrying in Ns counters
    function stop() { EVS.forEach((ev) => M.off(ev, onEv)); clearInterval(tick); }
    window.addEventListener('pagehide', stop);
    draw();
  }

  /* H55: the public mesh 0000 (presence + invites only; HubMesh enforces it) */
  const PUB_SHOW = 20;
  function publicCard(sub) {
    const card = ui.el('section', 'card pub-card');
    card.id = 'public';
    card.appendChild(ui.el('h3', '', 'Public mesh'));
    const hub = S.hub();
    const M = hub && hub.HubMesh, ML = hub && hub.HubMeshLink;
    const on = () => S.get('meshPublic') !== '0';
    const sw = ui.switch('Join public mesh', 'When this Hub is not in a private mesh, it joins the public mesh 0000 so nearby Hubs can see each other and invite you to their code',
      on(), (v) => { S.set('meshPublic', v ? '' : '0'); if (ML) ML.setPublic(v); setTimeout(draw, 300); });
    sw.id = 'mesh-public-sw';
    card.appendChild(sw);
    card.appendChild(ui.el('p', 'opt-note', 'Anyone’s Hub can be on 0000, so it only shares a short device name, Desktop / Phone mode and the device ID, plus invites. ' +
      'Profile sync, API keys and every app stay off the public mesh. Joining a Hub’s code leaves 0000; Disconnect comes back.'));
    if (!M || !ML) {
      card.appendChild(ui.el('p', 'opt-note', 'Open Settings inside the Hub to see the public mesh.'));
      return card;
    }
    const note = ui.el('p', 'opt-note pub-note'); note.id = 'pub-note';
    const inv = ui.el('div', 'pub-invites'); inv.id = 'pub-invites';
    const list = ui.el('ul', 'conn-list pub-list'); list.id = 'pub-list';
    list.setAttribute('aria-label', 'Devices on the public mesh');
    const out = ui.el('p', 'upd-out', ''); out.id = 'pub-out'; out.setAttribute('aria-live', 'polite');
    card.append(note, inv, list, out);
    const clip = (v, n) => String(v == null ? '' : v).slice(0, n);
    const MODE = { desktop: 'Desktop mode', phone: 'Phone mode' };
    const WHY = { rate: 'Wait a few seconds between invites', 'no-code': 'This Hub has no code of its own to invite to', 'not-public': 'Not on the public mesh', offline: 'That device is gone', public: 'Not allowed on the public mesh' };
    function draw() {
      if (!card.isConnected && drawn) { stop(); return; }
      drawn = true;
      const me = M.me(), own = ML.ownCode();
      inv.textContent = ''; list.textContent = '';
      ML.invites().forEach((v, i) => {
        const row = ui.el('div', 'pub-invite');
        row.appendChild(ui.el('span', '', clip(v.name, 16) + ' invites you to join code ' + clip(v.code, 4)));
        const j = ui.el('button', 'key-btn pub-join', 'Join'); j.type = 'button';
        j.addEventListener('click', () => ML.accept(i));
        const d = ui.el('button', 'key-btn pub-dismiss', 'Dismiss'); d.type = 'button';
        d.addEventListener('click', () => { ML.dismiss(i); draw(); });
        row.append(j, d);
        inv.appendChild(row);
      });
      if (!me || !me.public) {
        note.textContent = !on() ? 'Off: this Hub stays off the public mesh.'
          : ML.isPrivate() ? 'This Hub is in a private mesh (code ' + clip(ML.privateCode(), 12) + '), so it is not on 0000.' : 'Joining the public mesh…';
        return;
      }
      const ros = M.roster().filter((r) => r.online || r.deviceId === me.deviceId).slice(0, PUB_SHOW);
      // note.textContent = 'On the public mesh 0000 · ' + ros.length + ' online' + (own ? ' · your code ' + own : '') + '.';   (before H55b: said "on" whatever the link state)
      const ls = linkState(me);   // H55b
      note.textContent = 'Public mesh 0000 · ' + ls.t + (ls.k === 'linked' || ls.k === 'lobby' ? ' · ' + ros.length + ' online' : '') + (own ? ' · your code ' + own : '') + '.';   // count only once linked
      note.dataset.state = ls.k;
      if (ls.k === 'gaveup' || ls.k === 'retrying') inv.appendChild(retryBtn(M, 'pub-retry', draw));
      ros.forEach((r) => {
        const self = r.deviceId === me.deviceId;
        const li = ui.el('li', 'conn-dev pub-dev' + (self ? ' conn-self' : ''));
        li.dataset.id = clip(r.deviceId, 40);
        const top = ui.el('div', 'conn-top');
        top.append(ui.el('b', 'conn-name', clip(r.name || 'Device', 16) + (self ? ' (this device)' : '')), ui.el('span', 'conn-state on', 'Online'));
        const meta = ui.el('div', 'conn-meta');
        [MODE[r.mode] || '', clip(r.deviceId, 24), r.lobby ? 'Lobby' : ''].filter(Boolean).forEach((t) => meta.appendChild(ui.el('span', 'conn-tag', t)));
        li.append(top, meta);
        if (!self && own) {
          const b = ui.el('button', 'key-btn pub-inv', 'Invite to my code'); b.type = 'button';
          b.addEventListener('click', () => {
            const r2 = ML.invite(r.deviceId);
            out.className = 'upd-out ' + (r2.ok ? 'ok' : 'bad');
            out.textContent = r2.ok ? 'Invite to code ' + own + ' sent to ' + clip(r.name, 16) : (WHY[r2.reason] || 'Could not send the invite');
          });
          li.appendChild(b);
        }
        list.appendChild(li);
      });
      // if (ros.length < 2) { const e = ui.el('li', 'conn-empty', 'No other Hub on the public mesh right now.'); e.id = 'pub-empty'; list.appendChild(e); }   (before H55b)
      if (ros.length < 2) { const e = ui.el('li', 'conn-empty', ls.k === 'linked' || ls.k === 'lobby' ? 'No other Hub on the public mesh right now.' : 'Not linked to the public mesh yet.'); e.id = 'pub-empty'; list.appendChild(e); }   // H55b
    }
    let drawn = false, t = 0;
    const onEv = () => { clearTimeout(t); t = setTimeout(draw, 0); };
    const EVS = ['roster', 'peers', 'lobby', 'status'];
    EVS.forEach((ev) => M.on(ev, onEv));
    hub.addEventListener('hub-mesh-invites', onEv);
    // const tick = setInterval(draw, 3000);   (before H55b)
    const tick = setInterval(draw, 1000);   // H55b: 1 s counters
    function stop() { EVS.forEach((ev) => M.off(ev, onEv)); hub.removeEventListener('hub-mesh-invites', onEv); clearInterval(tick); }
    window.addEventListener('pagehide', stop);
    draw();
    if (sub === 'public') setTimeout(() => card.scrollIntoView({ block: 'start' }), 50);
    return card;
  }

  Settings.add({
    id: 'devices', title: 'Devices', icon: '\uD83D\uDCF2',
    render(pane, sub) {
      const end = ui.el('div', 'pane-end');   // room below the last buttons (Apply / Cancel) so Hub notification cards never cover them
      end.setAttribute('aria-hidden', 'true');
      // pane.append(deviceCard(sub), connectedCard(sub), profileCard(sub), syncCard(sub), end);   // (H29.2b)
      // pane.append(deviceCard(sub), connectedCard(sub), profileCard(sub), syncCard(sub), undoCard(sub), end);   // H29.3: + Undo last sync
      pane.append(deviceCard(sub), connectedCard(sub), publicCard(sub), profileCard(sub), syncCard(sub), undoCard(sub), end);   // H55: + Public mesh
    }
  });
})();
