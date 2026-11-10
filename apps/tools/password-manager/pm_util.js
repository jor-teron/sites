/* Password Manager PW1 — small pure helpers (escape, ids, dates, URLs). */
(function (root) {
  'use strict';

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid() {
    var c = root.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    var a = new Uint8Array(16);
    if (c && c.getRandomValues) c.getRandomValues(a);
    else for (var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
    a[6] = (a[6] & 0x0f) | 0x40;
    a[8] = (a[8] & 0x3f) | 0x80;
    var hex = [];
    for (var j = 0; j < 16; j++) hex.push(('0' + a[j].toString(16)).slice(-2));
    return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' +
      hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10).join('');
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function fmtWhen(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    try {
      return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_) {
      return d.toISOString().replace('T', ' ').slice(0, 16);
    }
  }

  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) u = 'https://' + u;
    try {
      var x = new URL(u);
      if (x.protocol !== 'http:' && x.protocol !== 'https:') return '';
      return x.href;
    } catch (_) {
      return '';
    }
  }

  function maskCard(num) {
    var digits = String(num || '').replace(/\D/g, '');
    if (digits.length < 4) return digits ? '••••' : '';
    return '•••• ' + digits.slice(-4);
  }

  function typeLabel(t) {
    if (t === 'card') return 'Card';
    if (t === 'note') return 'Note';
    if (t === 'wifi') return 'Wi-Fi';
    return 'Login';
  }

  function entryTitle(e) {
    if (!e) return 'Untitled';
    var t = String(e.title || '').trim();
    if (t) return t;
    if (e.type === 'wifi' && e.ssid) return e.ssid;
    if (e.type === 'login' && e.username) return e.username;
    if (e.type === 'card' && e.cardholder) return e.cardholder;
    return 'Untitled';
  }

  function entrySub(e) {
    if (!e) return '';
    if (e.type === 'login') return e.username || e.url || '';
    if (e.type === 'card') return maskCard(e.number) || e.cardholder || '';
    if (e.type === 'wifi') return e.ssid || e.security || '';
    if (e.type === 'note') {
      var text = String(e.text || '').replace(/\s+/g, ' ').trim();
      return text.length > 60 ? text.slice(0, 57) + '…' : text;
    }
    return '';
  }

  var api = {
    escapeHtml: escapeHtml,
    uid: uid,
    nowIso: nowIso,
    fmtWhen: fmtWhen,
    safeUrl: safeUrl,
    maskCard: maskCard,
    typeLabel: typeLabel,
    entryTitle: entryTitle,
    entrySub: entrySub
  };

  root.PMUtil = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
