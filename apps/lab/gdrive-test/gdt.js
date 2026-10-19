/*
 * Google Drive test page logic (apps/lab/gdrive-test/gdt.js).
 * - Config card: the Hub web client id (GOOGLE_CONFIG.hubWebClientId, project "monorepo"), the
 *   scopes, this page's origin, signed in or not (+ the Google address, the method).
 * - Sign in: GoogleGis.token() (Google's sign-in window, full Drive) → GoogleAuth.setToken(…, 'popup')
 *   → lists the first 10 Drive files. The same client is used by "Phone as a key" on the phone page.
 * - Find "hub" folder: GDriveFs.hubRoot() (finds or creates My Drive/hub) and lists it.
 * - Test CORS: a request to the Drive API without a token. A readable 401 answer means the browser
 *   may call Drive directly from this origin; a TypeError means CORS / network blocked it.
 * - Every request and answer goes to the log (tokens hidden); CORS / network errors in yellow.
 * (The old QR / device-flow test is gone: that method is off, see shared/google/google_config.js.)
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const A = window.GoogleAuth, G = window.GoogleGis, C = window.GOOGLE_CONFIG || {};
  const logEl = $('log');

  function log(t, cls) {
    const line = document.createElement('span');
    if (cls) line.className = cls;
    line.textContent = new Date().toLocaleTimeString() + '  ' + t + '\n';
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function logErr(e) {
    if (e && (e.code === 'network' || e instanceof TypeError)) log('CORS / NETWORK ERROR: ' + e.message, 'c');
    else log('ERROR ' + (e && e.code ? '[' + e.code + '] ' : '') + (e && e.message || e), 'e');
  }
  A.onLog((t) => log(t));
  const setState = (t, cls) => { $('state').textContent = t; $('state').className = 'state ' + (cls || ''); };

  function cfgCard() {
    const id = C.hubWebClientId || '';
    const u = A.user();
    const rows = [
      ['Hub web client', id ? '\u2713 ' + id.split('-')[0] + '-\u2026 (project monorepo)' : '\u2717 empty', !!id],
      ['Scopes', C.fullScopes || '(none)', !!C.fullScopes],
      ['This page', location.origin, true],
      ['Signed in', A.signedIn() ? '\u2713 ' + (u.email || 'yes') + ' \u00B7 ' + (u.method || '?') : (A.expired() ? 'ran out (sign in again)' : 'no'), A.signedIn()]
    ];
    const g = document.createElement('div');
    g.className = 'cfg';
    rows.forEach(([k, v, ok]) => {
      const a = document.createElement('span'); a.className = 'muted'; a.textContent = k;
      const b = document.createElement('span'); b.className = ok ? 'ok' : 'bad'; b.textContent = v;
      g.append(a, b);
    });
    const kids = [g];
    if (!id) {
      const p = document.createElement('p');
      p.className = 'setup';
      p.textContent = 'Set up first: put the Web application client id (project "monorepo") into hubWebClientId in shared/google/google_config.js. Steps: README.md in this folder.';
      kids.push(p);
    }
    $('cfg').replaceChildren(...kids);
    $('start').disabled = !id;
    $('list').disabled = $('hub').disabled = $('signout').disabled = !A.signedIn();
  }

  async function start() {
    $('start').disabled = true;
    setState('Google\u2019s sign-in window is open\u2026');
    log('Sign in: Google Identity Services token client from ' + location.origin, 's');
    try {
      const r = await G.token();
      log('\u2190 token for ' + (r.email || '(no email)') + ', expires in ' + r.expires_in + ' s' + (r.partial ? ' \u2014 Drive NOT granted (tick the Drive box)' : ''), r.partial ? 'e' : 's');
      A.setToken(r, 'popup');
      setState('Signed in \u2713 ' + (r.email || ''), 'ok');
      await listFiles();
    } catch (e) { logErr(e); setState(e && e.message || String(e), 'bad'); }
    finally { cfgCard(); }
  }

  function showFiles(files, empty) {
    $('files').replaceChildren(...(files.length ? files.map((f) => {
      const li = document.createElement('li');
      li.textContent = (f.mimeType === 'application/vnd.google-apps.folder' ? '\uD83D\uDCC1 ' : '\uD83D\uDCC4 ') + f.name +
        (f.size ? '  (' + Math.round(f.size / 1024) + ' KB)' : '') + (f.modifiedTime ? '  \u00B7 ' + new Date(f.modifiedTime).toLocaleString() : '');
      return li;
    }) : [Object.assign(document.createElement('li'), { className: 'muted', textContent: empty })]));
  }
  async function listFiles() {
    const p = new URLSearchParams({ pageSize: '10', orderBy: 'modifiedTime desc', fields: 'files(id,name,mimeType,size,modifiedTime)', q: 'trashed = false' });
    log('GET https://www.googleapis.com/drive/v3/files?' + p);
    try {
      const j = await GDriveFs.api('files?' + p);
      log('\u2190 200 ' + (j.files || []).length + ' file(s)', 's');
      showFiles(j.files || [], 'No files in this Drive.');
    } catch (e) { logErr(e); }
  }
  async function hubFolder() {
    log('Find or create My Drive/hub');
    try {
      const d = await GDriveFs.hubRoot();
      log('\u2190 ' + (d.crumb || 'hub') + ' (id ' + String(d.id).slice(0, 8) + '\u2026)', 's');
      const out = [];
      for await (const [name, h] of d.entries()) out.push({ name, mimeType: h.kind === 'directory' ? 'application/vnd.google-apps.folder' : '' });
      showFiles(out, 'The hub folder is empty.');
    } catch (e) { logErr(e); }
  }

  async function corsTest() {
    const url = 'https://www.googleapis.com/drive/v3/about?fields=user';
    log('CORS test: GET ' + url + ' without a token from ' + location.origin);
    try {
      const r = await fetch(url);
      log('\u2190 ' + r.status + ' ' + (await r.text()).replace(/\s+/g, ' ').slice(0, 120));
      log('CORS OK: the browser could read Google\u2019s answer (401 without a token is expected).', 's');
      setState('CORS OK from ' + location.origin, 'ok');
    } catch (e) {
      log('CORS / NETWORK ERROR: ' + (e && e.message || e) + ' \u2014 the browser blocked the call (or you are offline).', 'c');
      setState('CORS blocked or offline', 'bad');
    }
  }

  $('start').addEventListener('click', start);
  $('list').addEventListener('click', listFiles);
  $('hub').addEventListener('click', hubFolder);
  $('cors').addEventListener('click', corsTest);
  $('signout').addEventListener('click', async () => { await A.signOut(); log('Signed out (token revoked, storage cleared)', 's'); setState(''); cfgCard(); });
  $('clear').addEventListener('click', () => logEl.replaceChildren());
  $('copy').addEventListener('click', () => { try { navigator.clipboard.writeText(logEl.textContent); } catch (_) { /* ignore */ } });
  A.onChange(cfgCard);
  cfgCard();
  log('Page ready. Hub web client ' + (C.hubWebClientId ? 'set' : 'missing (setup needed)') + '; ' + (A.signedIn() ? 'signed in' : 'signed out') + '.');
})();
