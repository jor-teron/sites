/*
 * Google sign-in by QR (shared/google/google_auth.js) — OAuth 2.0 Device Authorization flow
 * ("TVs and Limited Input devices"), plain fetch, no Google library. Config: google_config.js.
 *
 *   1. start()  POST https://oauth2.googleapis.com/device/code {client_id, scope}
 *               → { device_code, user_code, verification_url, [verification_url_complete],
 *                   expires_in, interval }
 *   2. Show a QR of the verification URL + the user code (gdrive_connect.js does that).
 *   3. poll()   POST https://oauth2.googleapis.com/token {client_id, client_secret, device_code,
 *               grant_type=urn:ietf:params:oauth:grant-type:device_code} every `interval` s;
 *               authorization_pending = keep going, slow_down = +5 s, access_denied /
 *               expired_token = stop. Success → access + refresh token.
 *   4. token()  a valid access token; refreshes with the refresh_token (grant_type=refresh_token)
 *               a minute before it runs out. fetchApi(url, opts) adds "Authorization: Bearer",
 *               retries once after a 401.
 *   5. signOut() POST https://oauth2.googleapis.com/revoke?token=… then forgets everything.
 *
 * Storage: localStorage 'sites-hub.google' = { refresh, access, exp, email, name, scope }.
 *   RISK: any script running on this site (every app in this repo, same origin) could read the
 *   refresh token and use the Drive access (drive.file only). Fine for a personal site with no
 *   third-party scripts; sign out (revokes) on a shared computer.
 * All Hub windows / apps share the state: BroadcastChannel 'sites-google' + the storage event.
 * Network / CORS failures throw an Error with .code = 'network' and a clear message.
 *
 * API window.GoogleAuth: configured(), signedIn(), user() → {email, name}, start(), poll(dev, o),
 *   connect({onCode, onStatus}) → { done: Promise, cancel() }, token(), fetchApi(url, opts),
 *   signOut(), onChange(fn) → off(), onLog(fn) (every step as text, for the Lab test page).
 */
(function () {
  'use strict';
  const KEY = 'sites-hub.google', CH = 'sites-google';
  const DEVICE = 'https://oauth2.googleapis.com/device/code';
  const TOKEN = 'https://oauth2.googleapis.com/token';
  const REVOKE = 'https://oauth2.googleapis.com/revoke';
  const GRANT = 'urn:ietf:params:oauth:grant-type:device_code';
  const cfg = () => window.GOOGLE_CONFIG || {};
  const logs = [], fns = [];
  const log = (t) => logs.forEach((f) => { try { f(t); } catch (_) { /* ignore */ } });

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (_) { return {}; } }
  function save(v, quiet) {
    try { if (v && v.refresh) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (_) { /* blocked */ }
    if (!quiet) { local(); try { bc && bc.postMessage({ type: 'google' }); } catch (_) { /* ignore */ } }
  }
  const local = () => fns.slice().forEach((f) => { try { f(); } catch (_) { /* ignore */ } });
  let bc = null;
  try { bc = new BroadcastChannel(CH); bc.onmessage = () => local(); } catch (_) { bc = null; }
  window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) local(); });

  function err(code, msg, status) { const e = new Error(msg || code); e.code = code; e.status = status; return e; }
  async function post(url, params) {
    let r;
    try {
      r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
    } catch (e) {
      throw err('network', 'Network or CORS error calling ' + url + ' (' + (e && e.message || e) + '). If you are online, the browser blocked the call.');
    }
    let j = {};
    try { j = await r.json(); } catch (_) { j = {}; }
    return { ok: r.ok, status: r.status, j };
  }
  /** id_token (openid) → {email, name}; no extra request. */
  function who(idToken) {
    try {
      const p = idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const j = JSON.parse(decodeURIComponent(escape(atob(p + '==='.slice((p.length + 3) % 4)))));
      return { email: j.email || '', name: j.name || '' };
    } catch (_) { return { email: '', name: '' }; }
  }

  async function start() {
    const c = cfg();
    if (!c.tvClientId) throw err('no_config', 'No TV client id in shared/google/google_config.js');
    log('POST ' + DEVICE + ' (scope: ' + c.deviceScopes + ')');
    const { ok, status, j } = await post(DEVICE, { client_id: c.tvClientId, scope: c.deviceScopes || 'openid email profile' });
    log('\u2190 ' + status + ' ' + JSON.stringify(Object.assign({}, j, j.device_code ? { device_code: '(hidden)' } : {})));
    if (!ok || !j.device_code) throw err(j.error || j.error_code || 'device_code_failed', (j.error_description || j.error || j.error_code || 'Could not get a code') + ' (HTTP ' + status + ')', status);
    j.interval = Math.max(1, +j.interval || 5);
    j.expiresAt = Date.now() + (+j.expires_in || 1800) * 1000;
    return j;
  }
  const wait = (ms, sig) => new Promise((res, rej) => {
    const t = setTimeout(res, ms);
    if (sig) sig.addEventListener('abort', () => { clearTimeout(t); rej(err('cancelled', 'Cancelled')); }, { once: true });
  });
  /** Poll until signed in. o: { signal, onStatus(text) }. Resolves with the user. */
  async function poll(dev, o) {
    o = o || {};
    const c = cfg();
    let every = dev.interval * 1000;
    for (;;) {
      await wait(every, o.signal);
      if (o.signal && o.signal.aborted) throw err('cancelled', 'Cancelled');
      if (Date.now() > dev.expiresAt) throw err('expired_token', 'The code expired. Start again.');
      log('POST ' + TOKEN + ' (device_code grant)');
      const { status, j } = await post(TOKEN, { client_id: c.tvClientId, client_secret: c.tvClientSecret || '', device_code: dev.device_code, grant_type: GRANT });
      if (j.access_token) {
        log('\u2190 ' + status + ' signed in (scope: ' + (j.scope || '') + ')');
        const u = who(j.id_token || '');
        save({ refresh: j.refresh_token || '', access: j.access_token, exp: Date.now() + (+j.expires_in || 3600) * 1000, email: u.email, name: u.name, scope: j.scope || '' });
        if (!j.refresh_token) log('Note: no refresh_token in the answer; you will need to sign in again in an hour.');
        return u;
      }
      log('\u2190 ' + status + ' ' + (j.error || '?') + (j.error_description ? ' (' + j.error_description + ')' : ''));
      if (j.error === 'authorization_pending') { if (o.onStatus) o.onStatus('Waiting for you to approve\u2026'); continue; }
      if (j.error === 'slow_down') { every += 5000; if (o.onStatus) o.onStatus('Waiting\u2026 (asked to slow down)'); continue; }
      if (j.error === 'access_denied') throw err('access_denied', 'Access was denied on the phone.');
      if (j.error === 'expired_token') throw err('expired_token', 'The code expired. Start again.');
      throw err(j.error || 'token_failed', (j.error_description || j.error || 'Sign-in failed') + ' (HTTP ' + status + ')', status);
    }
  }
  /** start + poll in one go. */
  function connect(o) {
    o = o || {};
    const ac = new AbortController();
    const done = (async () => {
      const dev = await start();
      if (o.onCode) o.onCode(dev);
      return poll(dev, { signal: ac.signal, onStatus: o.onStatus });
    })();
    return { done, cancel: () => ac.abort() };
  }

  let refreshing = null;
  async function token() {
    const s = load();
    if (!s.refresh && !s.access) throw err('signed_out', 'Not signed in to Google');
    if (s.access && s.exp > Date.now() + 60000) return s.access;
    if (!s.refresh) { save(null); throw err('signed_out', 'Sign-in ran out. Connect again.'); }
    if (!refreshing) {
      refreshing = (async () => {
        const c = cfg();
        log('POST ' + TOKEN + ' (refresh_token grant)');
        const { status, j } = await post(TOKEN, { client_id: c.tvClientId, client_secret: c.tvClientSecret || '', refresh_token: s.refresh, grant_type: 'refresh_token' });
        log('\u2190 ' + status + (j.access_token ? ' new access token' : ' ' + (j.error || '?')));
        if (!j.access_token) {
          if (j.error === 'invalid_grant' || j.error === 'unauthorized_client') save(null);
          throw err(j.error || 'refresh_failed', (j.error_description || j.error || 'Could not refresh the sign-in') + ' (HTTP ' + status + ')', status);
        }
        const n = Object.assign(load(), { access: j.access_token, exp: Date.now() + (+j.expires_in || 3600) * 1000 });
        save(n, true);   // same user: no redraw needed
        return n.access;
      })().finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  /** fetch with the Bearer token; one retry after a 401 (refreshed token). */
  async function fetchApi(url, opts) {
    opts = Object.assign({}, opts);
    for (let tries = 0; ; tries++) {
      const h = new Headers(opts.headers || {});
      h.set('Authorization', 'Bearer ' + await token());
      let r;
      try { r = await fetch(url, Object.assign({}, opts, { headers: h })); }
      catch (e) { throw err('network', 'Network or CORS error calling ' + url.split('?')[0] + ' (' + (e && e.message || e) + ')'); }
      if (r.status === 401 && tries === 0) { const s = load(); s.exp = 0; save(s, true); continue; }
      return r;
    }
  }
  async function signOut() {
    const s = load();
    const t = s.refresh || s.access;
    save(null);
    if (!t) return;
    try {
      log('POST ' + REVOKE);
      const r = await fetch(REVOKE + '?token=' + encodeURIComponent(t), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      log('\u2190 ' + r.status + ' revoke');
    } catch (e) { log('revoke failed: ' + (e && e.message || e)); }
  }

  window.GoogleAuth = {
    configured: () => !!cfg().tvClientId,
    signedIn: () => !!(load().refresh || (load().access && load().exp > Date.now())),
    user: () => { const s = load(); return { email: s.email || '', name: s.name || '' }; },
    start, poll, connect, token, fetchApi, signOut,
    onChange(f) { fns.push(f); return () => { const i = fns.indexOf(f); if (i >= 0) fns.splice(i, 1); }; },
    onLog(f) { logs.push(f); }
  };
})();
