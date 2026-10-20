/*
 * Settings → About (apps/settings/sec_about.js). A plain About page: what the Hub is,
 * Credit, Version and Current release (both from hub/version.txt: line 1 'v0.299', line 2
 * 'YYYY-MM-DD'; '—' when it can't be read), the first Release date, and a real
 * "Check for update". Inside the Hub that uses the Hub's own updater (HubUpdate.check in
 * hub/hub_update.js: clears the hub-shell caches and reloads the Hub when a newer build is
 * live); opened on its own it reads the live hub.html / version.txt and updates the service
 * worker itself. Contact / Feedback link to the public GitHub repo (no other contact details).
 * R16c: "Last refreshed" (localStorage 'sites-hub.lastRefresh', the Hub's daily 09:00 refresh) and
 * "Clear cache now" (confirm → HubUpdate.clearCache(): Hub caches + cached Start list, reload).
 * The technical notes that used to be here live in How-to (sec_howto.js).
 */
(function () {
  'use strict';
  const S = window.SettingsStore, ui = window.Settings.ui;
  const ROOT = '../../';
  const FIRST_RELEASE = '23 Sep 2026';
  const REPO = 'https://github.com/jor-teron/sites';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** 'v0.299\n2026-10-19' → { version: 'v0.299', date: '2026-10-19' } (blank when unreadable). */
  function parseVersion(text) {
    const l = String(text || '').split(/\r?\n/).map((x) => x.trim());
    const v = /^v?\d[\w.-]*$/.test(l[0] || '') ? (l[0][0] === 'v' ? l[0] : 'v' + l[0]) : '';
    return { version: v, date: /^\d{4}-\d{2}-\d{2}$/.test(l[1] || '') ? l[1] : '' };
  }
  function readVersion(mode) {
    return fetch(ROOT + 'hub/version.txt', { cache: mode || 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(parseVersion).catch(() => ({ version: '', date: '' }));
  }
  /** '2026-10-19' → '19 Oct 2026' ('—' when blank). */
  function niceDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? +m[3] + ' ' + MONTHS[+m[2] - 1] + ' ' + m[1] : '\u2014';
  }

  /** Build tag (?v=…) of the running Hub page, or '' when Settings is opened on its own. */
  function runningBuild() {
    const h = S.hub();
    const s = h && h.document.querySelector('script[src*="hub/hub.js?v="]');
    const m = s && s.getAttribute('src').match(/\?v=([\w.-]+)/);
    return m ? m[1] : '';
  }

  async function standaloneCheck() {
    const html = await fetch(ROOT + 'hub.html', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); });
    const build = (html.match(/hub\/hub\.js\?v=([\w.-]+)/) || [])[1] || '';
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
    try { r = hub && hub.HubUpdate ? await hub.HubUpdate.check({ manual: true }) : await standaloneCheck(); }
    catch (_) { r = { state: 'error' }; }
    if (r.state === 'error') {
      out.className = 'upd-out bad';
      out.textContent = 'Could not check (offline?)';
      btn.disabled = false;
      return;
    }
    out.className = 'upd-out ok';
    out.textContent = r.state === 'updated'
      ? 'Updated to ' + (r.version || '\u2014') + ' \u2014 reloading\u2026'
      : 'Up to date \u2014 ' + (r.version || '\u2014') + (r.build ? ' (build ' + r.build + ')' : '');
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

  Settings.add({
    id: 'about', title: 'About', icon: '\u2139\uFE0F',
    render(pane) {
      const card = ui.el('section', 'card ver-card');
      const head = ui.el('div', 'ver-head');
      const img = document.createElement('img'); img.src = 'settings_icon.png'; img.alt = '';
      const txt = ui.el('div');
      const vline = ui.el('b', 'ver-num', 'Sites Hub');
      txt.append(vline, ui.el('small', '', 'A web desktop for Jor\u2019s apps'));
      head.append(img, txt);
      card.append(head, ui.el('p', 'about-blurb',
        'Sites Hub is a small desktop that runs in your browser. It opens Jor\u2019s games, tools and ' +
        'lab experiments from one place, on GitHub Pages \u2014 nothing to install.'));
      const verRow = row('Version', '\u2026');
      const curRow = row('Current release', '\u2026');
      card.append(row('Credit', 'Jor Teron'), verRow, row('Release date', FIRST_RELEASE), curRow);
      const btn = ui.el('button', 'big-btn', 'Check for update');
      btn.type = 'button';
      const out = ui.el('p', 'upd-out', '');
      out.setAttribute('aria-live', 'polite');
      btn.addEventListener('click', () => checkUpdate(btn, out));
      card.append(btn, out);
      let last = 0;
      try { last = +localStorage.getItem('sites-hub.lastRefresh') || 0; } catch (_) { /* blocked */ }
      card.appendChild(row('Last refreshed', niceTime(last)));
      const clr = ui.el('button', 'big-btn', 'Clear cache now');
      clr.type = 'button';
      clr.id = 'clear-cache';
      clr.addEventListener('click', () => clearCache(clr));
      card.appendChild(clr);
      const build = runningBuild();
      if (build) card.appendChild(ui.el('p', 'opt-note', 'Running build ' + build));

      const hub = S.hub();
      const vp = hub && hub.HubUpdate && hub.HubUpdate.version ? hub.HubUpdate.version() : readVersion();
      Promise.resolve(vp).then((v) => {
        verRow.lastChild.textContent = v.version || '\u2014';
        curRow.lastChild.textContent = niceDate(v.date);
        if (v.version) vline.textContent = 'Sites Hub ' + v.version;
      }).catch(() => { verRow.lastChild.textContent = '\u2014'; curRow.lastChild.textContent = '\u2014'; });

      const contact = ui.el('section', 'card');
      contact.id = 'contact';
      contact.append(ui.el('h3', '', 'Contact'), link(REPO, 'GitHub: jor-teron/sites', 'The project on GitHub'));
      const fb = ui.el('section', 'card');
      fb.id = 'feedback';
      fb.append(ui.el('h3', '', 'Feedback'), ui.el('p', '', 'Found a bug or have an idea? Open an issue on GitHub.'),
        link(REPO + '/issues', 'GitHub Issues', 'Report a problem or suggest something'));
      pane.append(card, contact, fb);
    }
  });
})();
