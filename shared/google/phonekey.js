/*
 * Phone as a key — pairing rooms (shared/google/phonekey.js). Any Hub window (the Google Drive
 * tile, Files) makes a room; the Hub page (hub/hub_phonekey.js) checks it when the phone sends.
 * Transport = the Hub's existing SharedLink (PeerJS, shared/link/link_core.js): the Hub is the
 * host with its 4-digit code (localStorage 'jtsites-hub-ctrl-code'), the phone page
 * (apps/tools/phonekey/?hub=<code>&k=<room>) joins it and sends {type:'phonekey', k, access_token,
 * expires_in, email, scope} as a normal SharedLink message. The token never goes in a URL.
 * Room = 16 random characters, single-use, valid 10 minutes (QR) — stored in localStorage
 * 'sites-hub.phonekeyRooms' so every Hub window sees it. After a good send the Hub answers with a
 * "next" room (valid 3 h) so the still-open phone page can "Send again" to renew quickly.
 * API window.PhoneKey: room(ttlMs) → { k, url, code } (url '' when the Hub has no link code),
 *   take(k) → true once for a valid room (then it is gone), hubCode(), pageUrl(k).
 */
(function () {
  'use strict';
  const KEY = 'sites-hub.phonekeyRooms', CODE_KEY = 'jtsites-hub-ctrl-code';
  const QR_MS = 10 * 60 * 1000;
  const PAGE = new URL('../../apps/tools/phonekey/', (document.currentScript && document.currentScript.src) || location.href).href;
  const read = () => { try { return (JSON.parse(localStorage.getItem(KEY) || '[]') || []).filter((r) => r && r.exp > Date.now()); } catch (_) { return []; } };
  const write = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l.slice(-8))); } catch (_) { /* blocked */ } };
  function rnd() {
    const a = new Uint8Array(12);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('').slice(0, 16);
  }
  const hubCode = () => { try { return localStorage.getItem(CODE_KEY) || ''; } catch (_) { return ''; } };
  const pageUrl = (k) => { const c = hubCode(); return c ? PAGE + '?hub=' + encodeURIComponent(c) + '&k=' + k : ''; };
  function room(ttl) {
    const k = rnd();
    write(read().concat({ k, exp: Date.now() + (ttl || QR_MS) }));
    return { k, url: pageUrl(k), code: hubCode() };
  }
  function take(k) {
    const l = read();
    const i = l.findIndex((r) => r.k === String(k || ''));
    if (i < 0) { write(l); return false; }
    l.splice(i, 1);
    write(l);
    return true;
  }
  window.PhoneKey = { room, take, hubCode, pageUrl };
})();
