/*
 * Phone as a key — the Hub side (hub/hub_phonekey.js). Loaded after hub-controller.js (the Hub
 * hosts SharedLink with its 4-digit code) and the shared/google scripts.
 * A phone that opened apps/tools/phonekey/?hub=<code>&k=<room> (QR from the Google Drive tile or
 * Files, shared/google/phonekey.js) joins the Hub's SharedLink and sends
 *   {type:'phonekey', k, access_token, expires_in, email, scope}
 * Here: the room must be valid (PhoneKey.take: single-use, 10 min) → GoogleAuth.setToken(…,'phone')
 * (shared state: every Hub window and Files update) → answer that phone only with
 *   {type:'phonekey-ok', email, next} (next = a fresh room valid 3 h for "Send again"), or
 *   {type:'phonekey-bad', reason}.
 * hub_link.js does not pass 'phonekey' messages on to app frames.
 */
(function () {
  'use strict';
  if (!window.SharedLink || !window.PhoneKey || !window.GoogleAuth) return;
  const NEXT_MS = 3 * 60 * 60 * 1000;
  SharedLink.on('message', (m, from) => {
    if (!m || m.type !== 'phonekey' || SharedLink.role !== 'host') return;
    const reply = (o) => { try { SharedLink.send(o, from); } catch (_) { /* gone */ } };
    const tok = typeof m.access_token === 'string' ? m.access_token : '';
    if (!PhoneKey.take(m.k)) { reply({ type: 'phonekey-bad', reason: 'This QR was used or ran out. Show a new one on the computer.' }); return; }
    if (tok.length < 20 || tok.length > 4096) { reply({ type: 'phonekey-bad', reason: 'No usable token' }); return; }
    try {
      GoogleAuth.setToken({ access_token: tok, expires_in: m.expires_in, email: m.email, scope: m.scope }, 'phone');
    } catch (e) { reply({ type: 'phonekey-bad', reason: String(e && e.message || e) }); return; }
    reply({ type: 'phonekey-ok', email: String(m.email || ''), next: PhoneKey.room(NEXT_MS).k });
  });
})();
