/*
 * Settings → About (apps/settings/sec_about.js). Hub version + build and a real
 * "Check for update": fetch hub.html / hub_config.js fresh (no-store) to read the latest
 * build tag (?v=…) and HUB_VERSION, ask the service worker to update, and if the build is
 * newer than the running Hub, clear the 'hub-shell-*' caches and reload the Hub.
 * Below: the About / Contact / Feedback cards (moved from apps/about/about.html, which now
 * redirects here). Contact / feedback details are still name-only (../about/*.txt).
 */
(function () {
  'use strict';
  const S = window.SettingsStore, ui = window.Settings.ui;
  const ROOT = '../../';

  /** Build tag (?v=…) of the running Hub page, or '' when Settings is opened on its own. */
  function runningBuild() {
    const h = S.hub();
    const s = h && h.document.querySelector('script[src*="hub/hub.js?v="]');
    const m = s && s.getAttribute('src').match(/\?v=([\w.-]+)/);
    return m ? m[1] : '';
  }
  function runningVersion() { const h = S.hub(); return (h && h.HUB_VERSION) || ''; }

  async function latest() {
    const html = await fetch(ROOT + 'hub.html', { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); });
    const build = (html.match(/hub\/hub\.js\?v=([\w.-]+)/) || [])[1] || '';
    let version = '';
    try {
      const cfg = await fetch(ROOT + 'hub/hub_config.js?v=' + build + '&t=' + Date.now(), { cache: 'no-store' }).then((r) => r.text());
      version = (cfg.match(/HUB_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || '';
    } catch (_) { /* version stays blank */ }
    return { build, version };
  }

  async function checkUpdate(btn, out) {
    btn.disabled = true;
    out.className = 'upd-out';
    out.textContent = 'Checking\u2026';
    try {
      const cur = runningBuild();
      const nw = await latest();
      let reg = null;
      try { reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(ROOT); } catch (_) { /* none */ }
      if (reg) { try { await reg.update(); } catch (_) { /* offline */ } }
      if (nw.build && cur && nw.build !== cur) {
        if (window.caches) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((k) => k.indexOf('hub-shell-') === 0).map((k) => caches.delete(k)));
        }
        out.className = 'upd-out ok';
        out.textContent = 'Updated to v' + (nw.version || '?') + ' (build ' + nw.build + ') \u2014 reloading\u2026';
        setTimeout(() => { try { (S.hub() || window).location.reload(); } catch (_) { location.reload(); } }, 1200);
        return;
      }
      out.className = 'upd-out ok';
      out.textContent = 'Up to date \u2014 v' + (nw.version || runningVersion() || '?') + ' (build ' + (nw.build || cur || '?') + ')';
    } catch (e) {
      out.className = 'upd-out bad';
      out.textContent = 'Could not check (offline?)';
    }
    btn.disabled = false;
  }

  const CARDS = `
  <section class="card" id="about-card">
    <h3>About</h3>
    <p>This is a lightweight, browser-based collection of games, tools, and media apps \u2014 all built
      with plain HTML, CSS, and JavaScript. No installs, no accounts, no trackers.</p>
    <p>It runs entirely in your browser, works offline once loaded, and is designed to be simple
      enough for kids and fast enough for everyone.</p>
    <h4>What's inside</h4>
    <ul>
      <li><span class="badge">Games</span> Playable in the browser</li>
      <li><span class="badge">Tools</span> Calculator, Notepad, Weather</li>
      <li><span class="badge">Media</span> Gallery, Paint, Photo Editor, Webcam</li>
      <li><span class="badge">TV</span> Channels &amp; kids' playlists</li>
    </ul>
    <h4>For kids &amp; parents</h4>
    <p>The kids section is designed for ages 5\u201315. No ads, no tracking, no external accounts.
      Progress and scores are stored locally on your device using <code>localStorage</code>.</p>
    <p>A phone can be used as a D-pad controller for tablet-based games through the
      <strong>Controller</strong> module.</p>
    <h4>Privacy</h4>
    <p>Nothing is uploaded. Nothing is shared. Everything stays on your device unless you explicitly
      export or share it.</p>
    <h4>Tech</h4>
    <ul>
      <li>Vanilla HTML, CSS, JavaScript</li>
      <li>No build step, no framework</li>
      <li>Works offline (static files)</li>
      <li>Optional: WebSocket relay for phone-as-remote</li>
    </ul>
    <h4>Links</h4>
    <a class="tap" href="../../misc/T&amp;C.html">Terms &amp; Conditions</a>
    <a class="tap" href="../../misc/privatedns.html">Private DNS</a>
  </section>
  <section class="card" id="contact">
    <h3>Contact</h3>
    <a class="tap" href="../about/contact.txt">Jor Teron<small>Name</small></a>
  </section>
  <section class="card" id="feedback">
    <h3>Feedback</h3>
    <p>Send feedback to the contact below.</p>
    <a class="tap" href="../about/feedback.txt">Jor Teron<small>Name</small></a>
  </section>
  <p class="opt-note center">Made with plain JavaScript. No frameworks harmed.</p>`;

  Settings.add({
    id: 'about', title: 'About', icon: '\u2139\uFE0F',
    render(pane) {
      const ver = ui.el('section', 'card ver-card');
      const head = ui.el('div', 'ver-head');
      const img = document.createElement('img'); img.src = 'settings_icon.png'; img.alt = '';
      const txt = ui.el('div');
      const vline = ui.el('b', 'ver-num', 'Sites Hub' + (runningVersion() ? ' v' + runningVersion() : ''));
      const bline = ui.el('small', '', runningBuild() ? 'Build ' + runningBuild() : 'Open from the Hub to see the running build');
      txt.append(vline, bline);
      head.append(img, txt);
      const btn = ui.el('button', 'big-btn', 'Check for update');
      btn.type = 'button';
      const out = ui.el('p', 'upd-out', '');
      out.setAttribute('aria-live', 'polite');
      btn.addEventListener('click', () => checkUpdate(btn, out));
      ver.append(head, btn, out);
      if (!runningVersion()) latest().then((n) => { if (n.version) vline.textContent = 'Sites Hub v' + n.version; }).catch(() => {});
      const cards = ui.el('div');
      cards.innerHTML = CARDS;
      pane.append(ver, cards);
    }
  });
})();
