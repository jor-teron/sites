/*
 * Google Identity Services token client (shared/google/google_gis.js) — used by the phone page
 * ("Phone as a key", apps/tools/phonekey/) and by "Sign in on this computer" (popup) on the PC.
 * Loads https://accounts.google.com/gsi/client on first use, then asks for an access token with
 * GOOGLE_CONFIG.webClientId (Mail's web client) and the given scope (default fullScopes =
 * drive + openid email). No refresh token (GIS token model): about an hour.
 * Must be called from a click (Google opens a popup).
 * API window.GoogleGis: load() → Promise, token({ scope, prompt }) → Promise<{access_token,
 *   expires_in, scope, email}>, email(accessToken) → Promise<string> (openid userinfo).
 */
(function () {
  'use strict';
  const SRC = 'https://accounts.google.com/gsi/client';
  let loading = null;
  function load() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (!loading) {
      loading = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = SRC; s.async = true;
        s.onload = () => res();
        s.onerror = () => { loading = null; rej(new Error('Google sign-in script could not load (offline or blocked)')); };
        document.head.appendChild(s);
      });
    }
    return loading;
  }
  async function email(at) {
    try {
      const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + at } });
      return r.ok ? ((await r.json()).email || '') : '';
    } catch (_) { return ''; }
  }
  async function token(o) {
    o = o || {};
    const c = window.GOOGLE_CONFIG || {};
    if (!c.webClientId) throw new Error('No webClientId in shared/google/google_config.js');
    await load();
    const resp = await new Promise((res, rej) => {
      const tc = google.accounts.oauth2.initTokenClient({
        client_id: c.webClientId,
        scope: o.scope || c.fullScopes || 'https://www.googleapis.com/auth/drive openid email',
        callback: (r) => (r && r.access_token ? res(r) : rej(new Error('Google sign-in: ' + ((r && (r.error_description || r.error)) || 'no token')))),
        error_callback: (e) => rej(new Error('Google sign-in: ' + ((e && (e.message || e.type)) || 'closed')))
      });
      tc.requestAccessToken(o.prompt != null ? { prompt: o.prompt } : {});
    });
    if (window.google.accounts.oauth2.hasGrantedAllScopes && !google.accounts.oauth2.hasGrantedAllScopes(resp, 'https://www.googleapis.com/auth/drive')) {
      resp.partial = true;   // the person unticked Drive on the consent screen
    }
    resp.email = await email(resp.access_token);
    return resp;
  }
  window.GoogleGis = { load, token, email };
})();
