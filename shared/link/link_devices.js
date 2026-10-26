/*
  Project: sites (shared)
  File: shared/link/link_devices.js
  Role: This device's name for SharedLink. Saved in localStorage
  'shared-link-device-name'; default is a guess from the user agent
  ('Android phone', 'Windows PC', 'iPhone', 'Mac', 'Linux PC', 'Device').
  Renaming sends {t:'name', name} to the host, which re-broadcasts the list.
  H19: id() = a permanent random device id ('d-' + 12 chars), created once and saved in
  localStorage 'shared-link-device-id'. Chat uses it as the sender (from). Two tabs of the
  same browser share it (same device) and both show those messages as "You".
*/
(function () {
  'use strict';
  var KEY = 'shared-link-device-name';

  function guess() {
    var ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android phone' : 'Android tablet';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Windows/i.test(ua)) return 'Windows PC';
    if (/Macintosh/i.test(ua)) return 'Mac';
    if (/CrOS/i.test(ua)) return 'Chromebook';
    if (/Linux/i.test(ua)) return 'Linux PC';
    return 'Device';
  }

  function name() {
    try { return localStorage.getItem(KEY) || guess(); } catch (_) { return guess(); }
  }

  var ID_KEY = 'shared-link-device-id';
  var memId = '';
  function id() {
    var v = '';
    try { v = localStorage.getItem(ID_KEY) || ''; } catch (_) { /* blocked */ }
    if (/^d-[a-z0-9]{6,}$/.test(v)) return v;
    if (memId) return memId;
    var r = '';
    try { var a = new Uint8Array(9); crypto.getRandomValues(a); a.forEach(function (x) { r += (x % 36).toString(36); }); } catch (_) { r = Math.random().toString(36).slice(2, 11); }
    memId = 'd-' + r + Date.now().toString(36).slice(-3);
    try { localStorage.setItem(ID_KEY, memId); } catch (_) { /* blocked: per-page id */ }
    return memId;
  }

  function setName(n) {
    n = String(n || '').trim().slice(0, 40);
    try { if (n) localStorage.setItem(KEY, n); else localStorage.removeItem(KEY); } catch (_) { /* blocked */ }
    var L = window.SharedLink;
    if (L) {
      L._targets().forEach(function (c) { L._safeSend(c, { t: 'name', name: name() }); });
      if (L.role === 'host') L.broadcastDevices();
    }
    return name();
  }

  window.SharedLinkDevices = { id: id, name: name, setName: setName, guess: guess };
})();
