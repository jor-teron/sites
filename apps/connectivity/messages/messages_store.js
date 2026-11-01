/* Messages MS2 — the one save module (pure logic + localStorage). Key 'messages-history':
   {convs:{<num>:{num, name, unread, msgs:[{id, dir:'in'|'out', text, ts, st:'queued'|'sent'|'delivered'|''  (MS1 'unsent' is read as queued)}]}}}.
   Caps: 500 messages per conversation, 3000 in total (oldest conversations trimmed first). */
(function (root) {
  'use strict';
  var KEY = 'messages-history', SET = 'messages-settings-v1', CAP = 500, TOTAL = 3000, NUM = /^[1-9]\d{4}$/;
  function ls() { try { return root.localStorage; } catch (_) { return null; } }
  function load() { try { var s = ls(); var o = JSON.parse((s && s.getItem(KEY)) || '{}'); return o && o.convs ? o : { convs: {} }; } catch (_) { return { convs: {} }; } }
  var H = load(), S = {};
  try { var s0 = ls(); S = JSON.parse((s0 && s0.getItem(SET)) || '{}') || {}; } catch (_) { S = {}; }
  function save() { try { var s = ls(); s && s.setItem(KEY, JSON.stringify(H)); } catch (_) { /* full / blocked */ } }
  function conv(num, name) {
    var c = H.convs[num] || (H.convs[num] = { num: num, name: '', unread: 0, msgs: [] });
    if (name) c.name = String(name).slice(0, 40);
    return c;
  }
  function last(c) { return c.msgs.length ? c.msgs[c.msgs.length - 1].ts : 0; }
  function caps() {
    Object.keys(H.convs).forEach(function (k) { var m = H.convs[k].msgs; if (m.length > CAP) m.splice(0, m.length - CAP); });
    var list = list0(), n = list.reduce(function (a, c) { return a + c.msgs.length; }, 0);
    for (var i = list.length - 1; i >= 0 && n > TOTAL; i--) { var c = list[i], cut = Math.min(c.msgs.length, n - TOTAL); c.msgs.splice(0, cut); n -= cut; if (!c.msgs.length) delete H.convs[c.num]; }
  }
  function list0() { return Object.keys(H.convs).map(function (k) { return H.convs[k]; }).sort(function (a, b) { return last(b) - last(a); }); }
  function find(c, id) { for (var i = c.msgs.length - 1; i >= 0; i--) if (c.msgs[i].id === id) return c.msgs[i]; return null; }
  var M = {
    NUM: NUM, CAP: CAP, TOTAL: TOTAL,
    validNum: function (n) { return NUM.test(String(n || '')); },
    validText: function (t) { t = String(t == null ? '' : t); return t.trim().length > 0 && t.length <= 2000; },
    list: list0, conv: function (n) { return H.convs[n] || null; },
    /* incoming {t:'msg', id, from, name, text, ts}; returns false on a duplicate or bad shape */
    addIn: function (m, open) {
      if (!m || m.t !== 'msg' || !NUM.test(String(m.from)) || !M.validText(m.text) || !m.id) return false;
      var c = conv(String(m.from), m.name), id = String(m.id).slice(0, 80);
      if (find(c, id)) return false;
      c.msgs.push({ id: id, dir: 'in', text: String(m.text), ts: +m.ts || Date.now(), st: '' });
      if (!open) c.unread++;
      caps(); save(); return true;
    },
    addOut: function (num, name, text, id, st) {
      var c = conv(num, name), e = { id: id, dir: 'out', text: text, ts: Date.now(), st: st || 'sent' };
      c.msgs.push(e); caps(); save(); return e;
    },
    setSt: function (num, id, st) { var c = H.convs[num], e = c && find(c, id); if (!e || e.dir !== 'out') return false; if (e.st === 'delivered' && st !== 'delivered') return false; e.st = st; save(); return true; },
    /* MS2 queue: outgoing messages not yet delivered, oldest first: [{num, msg}] */
    pending: function () { var o = []; Object.keys(H.convs).forEach(function (k) { H.convs[k].msgs.forEach(function (m) { if (m.dir === 'out' && m.st !== 'delivered') o.push({ num: k, msg: m }); }); }); return o.sort(function (a, b) { return a.msg.ts - b.msg.ts; }); },
    ack: function (num, id) { return M.setSt(num, id, 'delivered'); },
    read: function (num) { var c = H.convs[num]; if (c && c.unread) { c.unread = 0; save(); } },
    unread: function () { return list0().reduce(function (a, c) { return a + (c.unread || 0); }, 0); },
    remove: function (num) { delete H.convs[num]; save(); },
    set: function (k, v) { S[k] = v; try { var s = ls(); s && s.setItem(SET, JSON.stringify(S)); } catch (_) { /* */ } },
    get: function (k) { return S[k]; },
    /* Telephone's saved contacts, read-only ('telephone-contacts-v1', TPSave's CON key) */
    contactName: function (num) {
      try { var s = ls(), a = JSON.parse((s && s.getItem('telephone-contacts-v1')) || '[]'); for (var i = 0; i < a.length; i++) if (a[i] && String(a[i].num) === num && a[i].name) return String(a[i].name).slice(0, 40); } catch (_) { /* */ }
      return '';
    },
    /* FC5 code order: URL #code= (5 digits only) > Hub private mesh > public lobby */
    pickCode: function (hash, hml, pub) {
      var m = /[#&?]code=(\d+)/.exec(String(hash || '')); if (m && /^\d{5}$/.test(m[1])) return { code: m[1], fixed: true };
      try { if (hml && hml.isPrivate()) { var c = String(hml.privateCode() || ''); if (/^\d{5}$/.test(c)) return { code: c, fixed: false }; } } catch (_) { /* */ }
      return { code: /^\d{5}$/.test(String(pub || '')) ? String(pub) : '00000', fixed: false };
    },
    dot: function (st) { return st === 'online' ? { cls: 'on', t: 'Online' } : st === 'connecting' ? { cls: 'wait', t: 'Connecting…' } : { cls: 'off', t: 'Offline' }; },
    _reset: function () { H = { convs: {} }; S = {}; }
  };
  root.MSStore = M;
})(typeof window !== 'undefined' ? window : globalThis);
