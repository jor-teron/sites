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
 * H29.2b: the Device name, Profile and Send profile cards (H46 / H30.x / H29.1 / H29.2) moved to the new Devices
 *   section (sec_devices.js, #devices/device, #devices/profile, #devices/sync; old #about/… anchors redirect in
 *   settings.js). Their notes moved with them. About keeps the Hub card (release, Update, Last refreshed, Clear
 *   Cache), Contact and Feedback.
 * H52: new "Auto update" card (#about/autoupdate) after the Hub card: "Auto update every" 1 day (default) / 7 / 15 /
 *   30 days (key 'updEvery', '' = 1; hub_update.js re-plans live), Last auto update ('lastRefresh', moved here from
 *   the Hub card's "Last refreshed" row), Next auto update (HubUpdate.dueAt: last + N days, or 06:00 on the morning
 *   the interval ends, whichever is first) and Last updated ('lastUpdated' + 'lastBuild': when this device first ran
 *   the current build).
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
        // const rel = /^[RH]\w+$/.test(l[2] || '') ? l[2] : '';   // H46: H-numbered Hub releases too (was R only)
        const rel = /^[RH][\w.+]+$/.test(l[2] || '') ? l[2] : '';   // H29.1: dotted ids like H29.1 too
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

  /* ---------- H52: Auto update card ---------- */
  const EVERY = [1, 7, 15, 30], DAY = 24 * 3600 * 1000;
  const everyNow = () => { const n = +S.get('updEvery', '1') || 1; return EVERY.indexOf(n) >= 0 ? n : 1; };
  /** Same rule as hub_update.js dueAt (used when Settings is opened on its own): last + n days, or the next
   *  6 AM window (06:00 after max(last + n − 1 days, now − 1 h)), whichever is first; 0 = now. */
  function dueAtLocal(last, n, now) {
    if (!last) return 0;
    const t = Math.max(last + (n - 1) * DAY, now - 3600 * 1000), d = new Date(t);
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 6, 0, 0, 0);
    if (x.getTime() <= t) x.setDate(x.getDate() + 1);
    return Math.min(last + n * DAY, x.getTime());
  }
  function autoCard(sub) {
    const card = ui.el('section', 'card');
    card.id = 'autoupdate';
    card.appendChild(ui.el('h3', '', 'Auto update'));
    card.appendChild(ui.el('p', 'opt-note', 'The Hub updates itself when the last auto update is older than the interval below, ' +
      'or at 6 AM on the morning the interval ends (every morning for 1 day), whichever comes first. It only reloads when no window or app is open; ' +
      // 'otherwise it waits, and Update (or a dot on Start) shows that a new build is ready.'));   (H52 / H52b)
      'otherwise it waits, and the Update icon (if shown in Hub bar) or Check for update here shows that a new build is ready.'));   // H52c: no dot
    const hubUpd = () => { const h = S.hub(); return h && h.HubUpdate ? h.HubUpdate : null; };
    const lastAuto = () => { try { return +localStorage.getItem('sites-hub.lastRefresh') || 0; } catch (_) { return 0; } };
    const nextRow = row('Next auto update', '\u2026');
    const paintNext = () => {
      const u = hubUpd(), n = everyNow(), last = lastAuto();
      const now = Date.now(), at = u && u.dueAt ? u.dueAt(last, n, now) : dueAtLocal(last, n, now);
      nextRow.lastChild.textContent = IS_FILE ? '\u2014' : (at <= now ? 'Now (when the Hub is idle)' : niceTime(at));
    };
    const pick = ui.choice(EVERY.map((n) => ({ value: n, label: n === 1 ? '1 day' : n + ' days' })), everyNow(), (v) => {
      S.set('updEvery', +v === 1 ? '' : String(v));
      try { const u = hubUpd(); if (u && u.schedule) u.schedule(); } catch (_) { /* older Hub */ }
      paintNext();
    });
    pick.id = 'upd-every';
    let upd = 0, build = '';
    try { upd = +localStorage.getItem('sites-hub.lastUpdated') || 0; build = localStorage.getItem('sites-hub.lastBuild') || ''; } catch (_) { /* blocked */ }
    card.append(ui.el('h4', '', 'Auto update every'), pick,
      row('Last auto update', niceTime(lastAuto())), nextRow,
      row('Last updated', upd ? niceTime(upd) + (build ? ' (build ' + build + ')' : '') : 'Never'));
    paintNext();
    if (sub === 'autoupdate') setTimeout(() => card.scrollIntoView({ block: 'start' }), 50);
    return card;
  }

  /* H29.2b: profileCard (H30.x), syncCard (H29.1 / H29.2) and deviceCard (H46) moved to sec_devices.js with
   * their constants (STATE_TEXT, EVERY_OPTS, everyText, TSTATE, GROUP_NAME, WHAT_OPTS, short, NAME_KEY). */

  Settings.add({
    id: 'about', title: 'About', icon: '\u2139\uFE0F',
    render(pane, sub) {   // H52: + sub ('autoupdate')
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
      // card.appendChild(row('Last refreshed', niceTime(last)));   // H52: now 'Last auto update' in the Auto update card
      void last;
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
      // pane.append(card, deviceCard(sub), profileCard(sub), contact, fb);   // H46: Device name after the About card
      // pane.append(card, deviceCard(sub), profileCard(sub), syncCard(sub), contact, fb);   // H29.1: Send profile after Profile
      // pane.append(card, contact, fb);   // H29.2b: Device name / Profile / Send profile moved to Devices (sec_devices.js)
      pane.append(card, autoCard(sub), contact, fb);   // H52: + Auto update
    }
  });
})();
