/*
 * Settings → About (apps/system/settings/sec_about.js). A plain About page: what the Hub is,
 * Credit, Current release ('Release R43 · 2026-10-21 IST' from lines 3-4 of hub/build.txt, read at
 * runtime with no-cache; falls back to the hub/version.txt date, then '—'),
 * the first Release date, and a real
 * "Update" button. Inside the Hub that uses the Hub's own updater (HubUpdate.check in
 * hub/update/hub_update.js: clears the hub-shell caches and reloads the Hub when a newer build is
 * live); opened on its own it reads the live hub.html / version.txt and updates the service
 * worker itself. Contact / Feedback link to the public GitHub repo (no other contact details).
 * R16c: "Last refreshed" (localStorage 'sites-hub.lastRefresh', the Hub's daily 09:00 refresh) and
 * "Clear Cache" (confirm → HubUpdate.clearCache(): Hub caches + cached Start list, reload).
 * The technical notes that used to be here live in How-to (sec_howto.js).
 * R41: the Hub version label is not shown anywhere (Jor's request); only the release date is.
 * R59: opened as a file (file://) nothing is fetched (Chrome blocks it); Update says
 *   'Updates not available when opened as a file' and Current release shows '\u2014'.
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
 */
(function () {
  'use strict';
  const S = window.SettingsStore, ui = window.Settings.ui;
  const ROOT = '../../../';
  const IS_FILE = location.protocol === 'file:';   // R59: no fetch on file:// (Chrome blocks it, console error)
  const FILE_NOTE = 'Updates not available when opened as a file';
  const FIRST_RELEASE = '23 Sep 2026';
  const REPO = 'https://github.com/jor-teron/sites';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** version.txt text → { version, date: 'YYYY-MM-DD' } (blank when unreadable). Version is not displayed. */
  function parseVersion(text) {
    const l = String(text || '').split(/\r?\n/).map((x) => x.trim());
    const v = /^v?\d[\w.-]*$/.test(l[0] || '') ? (l[0][0] === 'v' ? l[0] : 'v' + l[0]) : '';
    return { version: v, date: /^\d{4}-\d{2}-\d{2}$/.test(l[1] || '') ? l[1] : '' };
  }
  function readVersion(mode) {
    if (IS_FILE) return Promise.resolve({ version: '', date: '' });
    return fetch(ROOT + 'hub/version.txt', { cache: mode || 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(parseVersion).catch(() => ({ version: '', date: '' }));
  }
  /** hub/build.txt → 'Release R43 · 2026-10-21 IST' (line 3 release, line 4 date), or '' when unreadable. */
  function readBuild() {
    if (IS_FILE) return Promise.resolve('');
    return fetch(ROOT + 'hub/build.txt', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then((text) => {
        const l = String(text).split(/\r?\n/).map((x) => x.trim());
        const rel = /^[RH]\w+$/.test(l[2] || '') ? l[2] : '';   // H46: H-numbered Hub releases too (was R only)
        const date = /^\d{4}-\d{2}-\d{2}/.test(l[3] || '') ? l[3] : '';
        if (!rel && !date) return '';
        return [rel ? 'Release ' + rel : '', date].filter(Boolean).join(' \u00b7 ');
      }).catch(() => '');
  }
  /** '2026-10-19' → '19 Oct 2026' ('—' when blank). */
  function niceDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? +m[3] + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : '\u2014';
  }

  /** Build tag (?v=…) of the running Hub page, or '' when Settings is opened on its own. */
  function runningBuild() {
    const h = S.hub();
    const s = h && h.document.querySelector('script[src*="hub/core/hub.js?v="]');
    const m = s && s.getAttribute('src').match(/\?v=([\w.-]+)/);
    return m ? m[1] : '';
  }

  async function standaloneCheck() {
    const html = await fetch(ROOT + 'hub.html', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); });
    const build = (html.match(/hub\/core\/hub\.js\?v=([\w.-]+)/) || [])[1] || '';
    const v = await readVersion('no-store');
    let reg = null;
    try { reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(ROOT); } catch (_) { /* none */ }
    if (reg) { try { await reg.update(); } catch (_) { /* offline */ } }
    return { state: 'current', version: v.version, build };
  }

  async function checkUpdate(btn, out) {
    btn.disabled = true;
    out.className = 'upd-out';
    out.textContent = 'Checking\u2026';
    const hub = S.hub();
    let r;
    if (IS_FILE) {   // R59
      out.className = 'upd-out';
      out.textContent = FILE_NOTE;
      btn.disabled = false;
      return;
    }
    try { r = hub && hub.HubUpdate ? await hub.HubUpdate.check({ manual: true }) : await standaloneCheck(); }
    catch (_) { r = { state: 'error' }; }
    if (r.state === 'file') {   // R59: HubUpdate.check on file://
      out.className = 'upd-out';
      out.textContent = FILE_NOTE;
      btn.disabled = false;
      return;
    }
    if (r.state === 'error') {
      out.className = 'upd-out bad';
      out.textContent = 'Could not check (offline?)';
      btn.disabled = false;
      return;
    }
    out.className = 'upd-out ok';
    out.textContent = r.state === 'updated'
      ? 'Updated \u2014 reloading\u2026'
      : 'Up to date' + (r.build ? ' (build ' + r.build + ')' : '');
    if (r.state !== 'updated') btn.disabled = false;
  }

  /** ms → '20 Oct 2026, 09:00' (browser local time) or 'Never'. */
  function niceTime(ms) {
    if (!ms) return 'Never';
    const d = new Date(ms), p = (n) => String(n).padStart(2, '0');
    return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ', ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  async function clearCache(btn) {
    const D = window.UiDialog;
    const ok = D ? await D.confirm('Clear cache?', 'Deletes the Hub\u2019s saved files and the saved Start list, then reloads the Hub. Your settings and files stay.', 'Clear cache', true)
      : window.confirm('Clear the Hub cache and reload?');
    if (!ok) return;
    btn.disabled = true;
    const hub = S.hub();
    if (hub && hub.HubUpdate && hub.HubUpdate.clearCache) { hub.HubUpdate.clearCache(); return; }
    try {
      if (window.caches) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => /^hub-(shell|rt)-/.test(k)).map((k) => caches.delete(k)));
      }
      localStorage.removeItem('sites-hub.startList');
      localStorage.removeItem('sites-hub.lastRefresh');
    } catch (_) { /* blocked */ }
    location.reload();
  }

  function row(label, value) {
    const r = ui.el('div', 'about-row');
    r.append(ui.el('span', 'about-k', label), ui.el('b', 'about-v', value));
    return r;
  }
  function link(href, text, sub) {
    const a = ui.el('a', 'tap');
    a.href = href; a.target = '_blank'; a.rel = 'noopener';
    a.textContent = text;
    a.appendChild(ui.el('small', '', sub));
    return a;
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

  Settings.add({
    id: 'about', title: 'About', icon: '\u2139\uFE0F',
    render(pane, sub) {
      const card = ui.el('section', 'card ver-card');
      const head = ui.el('div', 'ver-head');
      const img = document.createElement('img'); img.src = 'settings_icon.png'; img.alt = '';
      const txt = ui.el('div');
      txt.append(ui.el('b', 'ver-num', 'Hub'), ui.el('small', '', 'A web desktop for your apps'));
      head.append(img, txt);
      card.append(head, ui.el('p', 'about-blurb',
        'Hub is a small desktop that runs in your browser. It opens games, tools and ' +
        'lab experiments from one place, on GitHub Pages \u2014 nothing to install.'));
      const curRow = row('Current release', '\u2026');
      card.append(row('Credit', 'Jor Teron'), row('Release date', FIRST_RELEASE), curRow);
      const btn = ui.el('button', 'big-btn', 'Update');
      btn.type = 'button';
      const out = ui.el('p', 'upd-out', '');
      out.setAttribute('aria-live', 'polite');
      btn.addEventListener('click', () => checkUpdate(btn, out));
      card.append(btn, out);
      let last = 0;
      try { last = +localStorage.getItem('sites-hub.lastRefresh') || 0; } catch (_) { /* blocked */ }
      card.appendChild(row('Last refreshed', niceTime(last)));
      const clr = ui.el('button', 'big-btn', 'Clear Cache');
      clr.type = 'button';
      clr.id = 'clear-cache';
      clr.addEventListener('click', () => clearCache(clr));
      card.appendChild(clr);
      const build = runningBuild();
      if (build) card.appendChild(ui.el('p', 'opt-note', 'Running build ' + build));

      const hub = S.hub();
      const vp = hub && hub.HubUpdate && hub.HubUpdate.version ? hub.HubUpdate.version() : readVersion();
      readBuild().then((rel) => {
        if (rel) { curRow.lastChild.textContent = rel; return; }
        return Promise.resolve(vp).then((v) => { curRow.lastChild.textContent = niceDate(v.date); });
      }).catch(() => { curRow.lastChild.textContent = '\u2014'; });

      const contact = ui.el('section', 'card');
      contact.id = 'contact';
      contact.append(ui.el('h3', '', 'Contact'), link(REPO, 'GitHub: jor-teron/sites', 'The project on GitHub'));
      const fb = ui.el('section', 'card');
      fb.id = 'feedback';
      fb.append(ui.el('h3', '', 'Feedback'), ui.el('p', '', 'Found a bug or have an idea? Open an issue on GitHub.'),
        link(REPO + '/issues', 'GitHub Issues', 'Report a problem or suggest something'));
      pane.append(card, deviceCard(sub), profileCard(sub), contact, fb);   // H46: Device name after the About card
    }
  });
})();
