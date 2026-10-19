/*
 * Google Drive test page logic (apps/lab/gdrive-test/gdt.js).
 * - Config card: is a TV client id / secret in shared/google/google_config.js, the scopes, this
 *   page's origin, signed in or not (+ the Google address).
 * - Start: GoogleAuth.start() (device code) → big QR (verification_url_complete if Google sends it,
 *   else verification_url, with the code shown big) → GoogleAuth.poll() at Google's interval
 *   (authorization_pending / slow_down / access_denied / expired_token handled there) → then
 *   lists the first 10 Drive files (files.list).
 * - Test CORS: a request with a dummy client id. A readable "invalid_client" answer means the
 *   browser may call Google directly from this origin; a TypeError means CORS / network blocked it.
 * - Every request and answer goes to the log (tokens hidden); CORS / network errors in yellow.
 */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const A = window.GoogleAuth, C = window.GOOGLE_CONFIG || {};
  const logEl = $('log');
  let flow = null;

  function log(t, cls) {
    const line = document.createElement('span');
    if (cls) line.className = cls;
    line.textContent = new Date().toLocaleTimeString() + '  ' + t + '\n';
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function logErr(e) {
    if (e && e.code === 'network') log('CORS / NETWORK ERROR: ' + e.message, 'c');
    else log('ERROR ' + (e && e.code ? '[' + e.code + '] ' : '') + (e && e.message || e), 'e');
  }
  A.onLog((t) => log(t));
  const setState = (t, cls) => { $('state').textContent = t; $('state').className = 'state ' + (cls || ''); };

  function cfgCard() {
    const rows = [
      ['TV client id', C.tvClientId ? '\u2713 set (' + C.tvClientId.slice(0, 12) + '\u2026)' : '\u2717 empty', !!C.tvClientId],
      ['TV client secret', C.tvClientSecret ? '\u2713 set' : '\u2717 empty', !!C.tvClientSecret],
      ['Scopes', C.deviceScopes || '(none)', true],
      ['This page', location.origin, true],
      ['Signed in', A.signedIn() ? '\u2713 ' + (A.user().email || 'yes') : 'no', A.signedIn()]
    ];
    const g = document.createElement('div');
    g.className = 'cfg';
    rows.forEach(([k, v, ok]) => {
      const a = document.createElement('span'); a.className = 'muted'; a.textContent = k;
      const b = document.createElement('span'); b.className = ok ? 'ok' : 'bad'; b.textContent = v;
      g.append(a, b);
    });
    const kids = [g];
    if (!A.configured()) {
      const p = document.createElement('p');
      p.className = 'setup';
      p.textContent = 'Set up first: create a "TVs and Limited Input devices" OAuth client and paste its id + secret into shared/google/google_config.js. Steps: README.md in this folder, or Hub \u2192 Settings \u2192 How-to \u2192 Google Drive. "Test CORS" works already.';
      kids.push(p);
    }
    $('cfg').replaceChildren(...kids);
    $('start').disabled = !A.configured();
    $('list').disabled = $('refresh').disabled = $('signout').disabled = !A.signedIn();
  }

  function showCode(dev) {
    const url = dev.verification_url_complete || dev.verification_url;
    const box = document.createElement('div');
    box.className = 'box';
    try { const q = qrcode(0, 'M'); q.addData(url); q.make(); box.innerHTML = q.createSvgTag(5, 15); } catch (e) { box.textContent = 'QR failed: ' + e.message; }
    const code = document.createElement('div'); code.className = 'code'; code.textContent = dev.user_code;
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = url;
    const hint = document.createElement('p'); hint.className = 'muted';
    hint.textContent = (dev.verification_url_complete ? 'verification_url_complete sent: the QR includes the code. ' : 'No verification_url_complete: scan / open the address, then type the code. ') +
      'Code valid ' + Math.round((+dev.expires_in || 1800) / 60) + ' min, polling every ' + dev.interval + ' s.';
    $('qr').replaceChildren(box, code, a, hint);
    $('qr').hidden = false;
  }

  async function start() {
    if (flow) flow.cancel();
    $('cancel').hidden = false; $('start').disabled = true;
    setState('Asking Google for a code\u2026');
    log('Start: device flow from ' + location.origin, 's');
    flow = A.connect({ onCode: (dev) => { showCode(dev); setState('Waiting for you to approve on your phone\u2026'); }, onStatus: (t) => setState(t) });
    try {
      const u = await flow.done;
      log('Signed in as ' + (u.email || '(no email)'), 's');
      setState('Signed in \u2713 ' + (u.email || ''), 'ok');
      $('qr').hidden = true;
      await listFiles();
    } catch (e) {
      if (e && e.code === 'cancelled') { log('Cancelled'); setState(''); } else { logErr(e); setState(e.message, 'bad'); }
    } finally {
      flow = null; $('cancel').hidden = true; cfgCard();
    }
  }

  async function listFiles() {
    const p = new URLSearchParams({ pageSize: '10', orderBy: 'modifiedTime desc', fields: 'files(id,name,mimeType,size,modifiedTime)', q: 'trashed = false' });
    log('GET https://www.googleapis.com/drive/v3/files?' + p);
    try {
      const j = await GDriveFs.api('files?' + p);
      const files = j.files || [];
      log('\u2190 200 ' + files.length + ' file(s)', 's');
      const ol = $('files');
      ol.replaceChildren(...(files.length ? files.map((f) => {
        const li = document.createElement('li');
        li.textContent = (f.mimeType === 'application/vnd.google-apps.folder' ? '\uD83D\uDCC1 ' : '\uD83D\uDCC4 ') + f.name +
          (f.size ? '  (' + Math.round(f.size / 1024) + ' KB)' : '') + '  \u00B7 ' + new Date(f.modifiedTime).toLocaleString();
        return li;
      }) : [Object.assign(document.createElement('li'), { className: 'muted', textContent: 'No files visible. With drive.file the Hub only sees files it created (try Files \u2192 Google Drive \u2192 Upload).' })]));
    } catch (e) { logErr(e); }
  }

  async function corsTest() {
    const url = 'https://oauth2.googleapis.com/device/code';
    log('CORS test: POST ' + url + ' with a dummy client id from ' + location.origin);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'client_id=cors-test.apps.googleusercontent.com&scope=openid' });
      const t = await r.text();
      log('\u2190 ' + r.status + ' ' + t.replace(/\s+/g, ' ').slice(0, 160));
      log('CORS OK: the browser could read Google\u2019s answer (an error about the dummy client is expected).', 's');
      setState('CORS OK from ' + location.origin, 'ok');
    } catch (e) {
      log('CORS / NETWORK ERROR: ' + (e && e.message || e) + ' \u2014 the browser blocked the call (or you are offline).', 'c');
      setState('CORS blocked or offline', 'bad');
    }
  }

  $('start').addEventListener('click', start);
  $('cancel').addEventListener('click', () => { if (flow) flow.cancel(); $('qr').hidden = true; });
  $('list').addEventListener('click', listFiles);
  $('refresh').addEventListener('click', async () => {
    try { const s = JSON.parse(localStorage.getItem('sites-hub.google') || '{}'); s.exp = 0; localStorage.setItem('sites-hub.google', JSON.stringify(s)); await A.token(); log('Token refreshed', 's'); } catch (e) { logErr(e); }
    cfgCard();
  });
  $('cors').addEventListener('click', corsTest);
  $('signout').addEventListener('click', async () => { await A.signOut(); log('Signed out (token revoked, storage cleared)', 's'); setState(''); cfgCard(); });
  $('clear').addEventListener('click', () => logEl.replaceChildren());
  $('copy').addEventListener('click', () => { try { navigator.clipboard.writeText(logEl.textContent); } catch (_) { /* ignore */ } });
  A.onChange(cfgCard);
  cfgCard();
  log('Page ready. Config: ' + (A.configured() ? 'TV client id set' : 'no TV client id yet (setup needed)') + '; ' + (A.signedIn() ? 'signed in' : 'signed out') + '.');
})();
