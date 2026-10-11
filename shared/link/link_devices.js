/*
  Project: sites (shared)
  File: shared/link/link_devices.js
  Role: This device's name for SharedLink. Saved in localStorage
  'shared-link-device-name'; default is a guess from the user agent
  ('Android phone', 'Windows PC', 'iPhone', 'Mac', 'Linux PC', 'Device').
  Renaming sends {t:'name', name} to the host, which re-broadcasts the list.
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

  window.SharedLinkDevices = { name: name, setName: setName, guess: guess };
})();
