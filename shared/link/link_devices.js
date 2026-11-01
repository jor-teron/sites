/*
  Project: sites (shared)
  File: shared/link/link_devices.js
  Role: This device's name for SharedLink. Saved in localStorage
  'shared-link-device-name'; default is a guess from the user agent (H57: now a random 'Adjective Noun' like
  'Brave Mango', saved on first start; the old guessed names count as unset; roll() picks a new one)
  ('Android phone', 'Windows PC', 'iPhone', 'Mac', 'Linux PC', 'Device').
  Renaming sends {t:'name', name} to the host, which re-broadcasts the list.
  H19: id() = a permanent random device id ('d-' + 12 chars), created once and saved in
  localStorage 'shared-link-device-id'. Chat uses it as the sender (from). Two tabs of the
  same browser share it (same device) and both show those messages as "You".
  H50a (Jor): new 16-char id format 'hub-' + 8 random + '-' + 3 from the clock, lowercase [a-z0-9],
  e.g. hub-k3x9p0qa-m2f (regex ^hub-[a-z0-9]{8}-[a-z0-9]{3}$). Random part: crypto.getRandomValues with
  rejection sampling (bytes >= 252 dropped, so every one of the 36 characters is equally likely; no modulo
  bias); clock part: the last 3 characters of Date.now().toString(36). A device that still has an old
  'd-…' id is converted ONCE on first load: the new id goes to 'shared-link-device-id', the old one to
  'shared-link-device-id-old' (kept, never deleted; a comma list, max 5), so oldIds() / isMe(id) still know it and Pooh Chat
  keeps showing this device's old messages as "You". The id is per browser and must never be copied or
  synced to another device (two devices would become clones): it is not a 'sites-hub.*' key, so the Hub
  profile, export file and H29 sync never carry it (hub_profile.js collect() only reads 'sites-hub.*' and
  the listed app keys). Clearing browser data makes a new id (the device then looks new to the others).
  API: id(), oldIds() → [old ids], isMe(id) → true for the current or an old id of this device,
  ID_RE (the new format).
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

  // (before H57)
  // function name() {
  //   try { return localStorage.getItem(KEY) || guess(); } catch (_) { return guess(); }
  // }
  /* H57: random friendly names (like LocalSend). A device with no name, or with one of the old guessed
     defaults below (an untouched device), gets a random 'Adjective Noun' on first start, saved under KEY.
     Every name fits the 16-character public mesh limit. A name the user typed is kept. */
  var ADJ = ['Brave', 'Quiet', 'Happy', 'Sunny', 'Lucky', 'Clever', 'Gentle', 'Jolly', 'Swift', 'Calm',
    'Bright', 'Cosy', 'Merry', 'Kind', 'Bold', 'Witty', 'Zesty', 'Fuzzy', 'Breezy', 'Cheery',
    'Dandy', 'Eager', 'Fancy', 'Giddy', 'Humble', 'Jazzy', 'Keen', 'Lively', 'Mellow', 'Nimble',
    'Plucky', 'Proud', 'Rosy', 'Snappy', 'Spry', 'Tidy', 'Peppy', 'Vivid', 'Warm', 'Zippy'];
  var NOUN = ['Mango', 'Panda', 'Kiwi', 'Otter', 'Peach', 'Koala', 'Lemon', 'Tiger', 'Plum', 'Falcon',
    'Cherry', 'Dolphin', 'Apple', 'Rabbit', 'Melon', 'Fox', 'Banana', 'Penguin', 'Grape', 'Owl',
    'Papaya', 'Turtle', 'Lime', 'Parrot', 'Fig', 'Hedgehog', 'Guava', 'Badger', 'Pear', 'Squirrel',
    'Lychee', 'Beaver', 'Apricot', 'Robin', 'Coconut', 'Gecko', 'Berry', 'Llama', 'Orange', 'Zebra'];
  var OLD_DEFAULTS = ['Android phone', 'Android tablet', 'iPhone', 'iPad', 'Windows PC', 'Mac', 'Chromebook', 'Linux PC', 'Device', 'Hub', 'Phone'];
  function pick(a) {
    var i;
    try { var b = new Uint32Array(1); crypto.getRandomValues(b); i = b[0] % a.length; } catch (_) { i = Math.floor(Math.random() * a.length); }
    return a[i];
  }
  function randomName(not) {
    for (var k = 0; k < 10; k++) { var n = pick(ADJ) + ' ' + pick(NOUN); if (n !== not && n.length <= 16) return n; }
    return 'Happy Panda';
  }
  function isUnset(v) { v = String(v || '').trim(); return !v || OLD_DEFAULTS.indexOf(v) >= 0; }
  var memName = '';
  function name() {
    var v = '';
    try { v = localStorage.getItem(KEY) || ''; } catch (_) { /* blocked */ }
    if (!isUnset(v)) return v;
    if (!memName) memName = randomName();
    try { localStorage.setItem(KEY, memName); var back = localStorage.getItem(KEY); if (back && !isUnset(back)) memName = back; } catch (_) { /* blocked: per-page name */ }
    return memName;
  }
  function roll() { return setName(randomName(name())); }   // H57: the 🎲 button

  var ID_KEY = 'shared-link-device-id';
  var memId = '';
  // (before H50a)
  // function id() {
  //   var v = '';
  //   try { v = localStorage.getItem(ID_KEY) || ''; } catch (_) { /* blocked */ }
  //   if (/^d-[a-z0-9]{6,}$/.test(v)) return v;
  //   if (memId) return memId;
  //   var r = '';
  //   try { var a = new Uint8Array(9); crypto.getRandomValues(a); a.forEach(function (x) { r += (x % 36).toString(36); }); } catch (_) { r = Math.random().toString(36).slice(2, 11); }
  //   memId = 'd-' + r + Date.now().toString(36).slice(-3);
  //   try { localStorage.setItem(ID_KEY, memId); } catch (_) { /* blocked: per-page id */ }
  //   return memId;
  // }
  /* H50a: new format + one-time migration of an old 'd-…' id */
  var OLD_KEY = 'shared-link-device-id-old';
  var ID_RE = /^hub-[a-z0-9]{8}-[a-z0-9]{3}$/;
  var OLD_RE = /^d-[a-z0-9]{6,}$/;
  function rand8() {
    var r = '';
    try {
      while (r.length < 8) {
        var a = new Uint8Array(16);
        crypto.getRandomValues(a);
        for (var i = 0; i < a.length && r.length < 8; i++) if (a[i] < 252) r += (a[i] % 36).toString(36);   // 252 = 7 × 36: no bias
      }
    } catch (_) {
      while (r.length < 8) r += Math.random().toString(36).slice(2);   // very old browser without crypto
      r = r.slice(0, 8);
    }
    return r;
  }
  function clock3() { var c = Date.now().toString(36); return ('000' + c).slice(-3); }
  function makeId() { return 'hub-' + rand8() + '-' + clock3(); }
  function lsGet(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }
  function id() {
    var v = lsGet(ID_KEY);
    if (ID_RE.test(v)) return v;
    if (memId) return memId;
    if (OLD_RE.test(v)) {
      // one-time migration: keep the old id first (another tab may convert at the same moment; the last
      // write wins and every later id() call re-reads the key, so all tabs settle on one id).
      // A page still running a cached pre-H50a link_devices.js could write a fresh 'd-…' id once more;
      // that one is added too (list, newest last, max 5), so its chat messages also stay "You".
      var olds = oldIds();
      if (olds.indexOf(v) < 0) { olds.push(v); lsSet(OLD_KEY, olds.slice(-5).join(',')); }
    }
    memId = makeId();
    if (lsSet(ID_KEY, memId)) { var back = lsGet(ID_KEY); if (ID_RE.test(back)) memId = back; }   // blocked storage: per-page id
    return memId;
  }
  /* H83: this device's own 5-digit number (10000–99999, never the lobby 00000), made once and kept in the
     device-local key 'shared-link-device-code' (not synced). Telephone uses it as the phone number. A saved value
     that is not 5 digits (e.g. an old 4-digit one) is replaced. */
  var CODE_KEY = 'shared-link-device-code', CODE_NUM_RE = /^[1-9]\d{4}$/, memCode = '';
  function code() {
    var v = lsGet(CODE_KEY);
    if (CODE_NUM_RE.test(v)) return v;
    if (memCode) return memCode;
    var n = 0;
    try { var a = new Uint32Array(1); crypto.getRandomValues(a); n = a[0] % 90000; } catch (_) { n = Math.floor(Math.random() * 90000); }
    memCode = String(10000 + n);
    if (lsSet(CODE_KEY, memCode)) { var back = lsGet(CODE_KEY); if (CODE_NUM_RE.test(back)) memCode = back; }
    return memCode;
  }
  function oldIds() { return lsGet(OLD_KEY).split(',').filter(function (x) { return OLD_RE.test(x); }); }   // comma list
  function isMe(x) { x = String(x || ''); return !!x && (x === id() || oldIds().indexOf(x) >= 0); }

  function setName(n) {
    n = String(n || '').trim().slice(0, 40);
    // try { if (n) localStorage.setItem(KEY, n); else localStorage.removeItem(KEY); } catch (_) { /* blocked */ }   (before H57)
    try { if (n) localStorage.setItem(KEY, n); else { localStorage.removeItem(KEY); memName = ''; } } catch (_) { /* blocked */ }   // H57: empty = a new random name (name() below)
    var L = window.SharedLink;
    if (L) {
      L._targets().forEach(function (c) { L._safeSend(c, { t: 'name', name: name() }); });
      if (L.role === 'host') L.broadcastDevices();
    }
    return name();
  }

  id();   // H50a: convert an old 'd-…' id on first load (not only when Chat first asks)
  // window.SharedLinkDevices = { id: id, name: name, setName: setName, guess: guess };   // (before H50a)
  // window.SharedLinkDevices = { id: id, oldIds: oldIds, isMe: isMe, ID_RE: ID_RE, name: name, setName: setName, guess: guess };   // (before H57)
  code();   // H83: make this device's number on first load
  name();   // H57: give an unnamed device its random name on first start
  // window.SharedLinkDevices = { id: id, oldIds: oldIds, isMe: isMe, ID_RE: ID_RE, name: name, ...   (before H83)
  window.SharedLinkDevices = { id: id, code: code, CODE_KEY: CODE_KEY, oldIds: oldIds, isMe: isMe, ID_RE: ID_RE, name: name, setName: setName, guess: guess, roll: roll, randomName: randomName, isUnset: isUnset, ADJ: ADJ, NOUN: NOUN };
})();
