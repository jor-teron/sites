/*
 * File Drop — filedrop_proto.js
 * Pure helpers shared by every module (and by filedrop_test.js under node): links, ids,
 * frames, names/types, formatting, received-file assembly, a tiny event bus. No DOM.
 *
 * Wire protocol — one PeerJS data connection, serialization 'raw', ordered + reliable.
 * Strings are JSON control messages, ArrayBuffers are file frames.
 *   dialer → listener   {t:'hello', token, client, name}     first message, else the link is closed
 *   listener → dialer   {t:'welcome', client, name} | {t:'bad'} | {t:'refused'}
 *   code id (4 digits): {t:'hello', code, client} → {t:'invite', id, token} | {t:'refused'}
 *   either way          {t:'ping'} → {t:'pong'}               heartbeat; any message counts as alive
 *   sender → receiver   {t:'offer', id, tid, name, type, size}
 *   receiver → sender   {t:'go', id, from} | {t:'no', id, reason}   from = bytes it already has (resume)
 *   sender → receiver   frames [u32 tid][f64 offset][payload] …, then {t:'end', id}
 *   receiver → sender   {t:'ack', id, bytes} about every MB; {t:'got', id} | {t:'go', id, from} (gap → resend)
 *   either way          {t:'cancel', id}   ·   {t:'bye'}  user pressed Disconnect (no reconnect)
 */
(function (root) {
  'use strict';
  const FD = root.FD = root.FD || {};
  const P = FD.proto = {};
  const HEAD = 12;
  P.HEAD = HEAD;

  // ----- ids -----
  P.rand = (len, abc) => {
    abc = abc || 'abcdefghijkmnpqrstuvwxyz23456789';
    const a = new Uint8Array(len);
    root.crypto.getRandomValues(a);
    let s = '';
    for (let i = 0; i < len; i++) s += abc[a[i] % abc.length];
    return s;
  };
  P.code4 = () => {
    const a = new Uint32Array(1);
    root.crypto.getRandomValues(a);
    return String(a[0] % 10000).padStart(4, '0');
  };
  P.tid = () => {
    const a = new Uint32Array(1);
    root.crypto.getRandomValues(a);
    return a[0] || 1;
  };

  // ----- links: <base>filedrop.html#<peerId>.<token> -----
  P.isLocalHost = (h) => !h || h === 'localhost' || h === '[::1]' || /^127\./.test(h) || /\.local$/i.test(h) ||
    /^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h);

  P.baseFor = (loc, cfg) => {
    if (!loc || loc.protocol === 'file:' || P.isLocalHost(loc.hostname)) return new URL(cfg.page, cfg.publicBaseUrl).href;
    return new URL(cfg.page, loc.href).href.split('#')[0].split('?')[0];
  };
  P.makeLink = (base, id, token) => base.split('#')[0] + '#' + id + '.' + token;

  // Accepts a full link, a bare "#id.token" or "id.token". Returns {id, token} or null.
  P.parseLink = (text, cfg) => {
    const s = String(text || '').trim();
    const hash = s.indexOf('#') >= 0 ? s.slice(s.lastIndexOf('#') + 1) : s;
    let h;
    try { h = decodeURIComponent(hash); } catch (_) { return null; }
    const m = /^([a-z0-9-]{8,64})\.([a-z0-9]{6,40})$/i.exec(h);
    if (!m || m[1].indexOf(cfg.peerPrefix) !== 0 || m[1].indexOf(cfg.codePrefix) === 0) return null;
    return { id: m[1], token: m[2] };
  };

  // ----- frames -----
  P.frame = (tid, offset, payload) => {
    const u = new Uint8Array(HEAD + payload.byteLength);
    const dv = new DataView(u.buffer);
    dv.setUint32(0, tid);
    dv.setFloat64(4, offset);
    u.set(new Uint8Array(payload.buffer || payload, payload.byteOffset || 0, payload.byteLength), HEAD);
    return u.buffer;
  };
  P.unframe = (buf) => {
    if (ArrayBuffer.isView(buf)) buf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    if (!buf || buf.byteLength < HEAD) return null;
    const dv = new DataView(buf);
    return { tid: dv.getUint32(0), offset: dv.getFloat64(4), data: buf.slice(HEAD) };
  };
  P.chunkSize = (maxMessage, cfg) => {
    const m = Number(maxMessage) > 0 ? Number(maxMessage) : cfg.chunkMin;
    return Math.max(cfg.chunkMin, Math.min(cfg.chunkMax, m)) - HEAD;
  };

  // ----- control messages -----
  P.encode = (m) => JSON.stringify(m);
  P.decode = (s) => {
    if (typeof s !== 'string' || s.length > 4096) return null;
    try { const m = JSON.parse(s); return m && typeof m === 'object' && typeof m.t === 'string' ? m : null; } catch (_) { return null; }
  };

  // ----- names / types (anything from the other device is untrusted) -----
  P.cleanLabel = (x) => String(x || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 40) || 'device';
  P.cleanName = (x) => {
    const s = String(x || '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/^\.+/, '').trim();
    return s.slice(-120) || 'file';
  };
  // Never let a peer pick a type the browser might run as a page (html, svg, xml …).
  P.safeMime = (x) => {
    const s = String(x || '').toLowerCase().trim();
    return /^(image\/(png|jpeg|gif|webp|heic|heif|avif|bmp)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf|application\/zip|text\/plain)$/.test(s)
      ? s : 'application/octet-stream';
  };
  P.kind = (mime, name) => {
    if (/^image\//.test(mime)) return 'image';
    if (/^video\//.test(mime)) return 'video';
    if (/^audio\//.test(mime)) return 'audio';
    if (mime === 'application/pdf') return 'pdf';
    if (mime === 'text/plain' || /\.(txt|md|csv|log|json)$/i.test(name || '')) return 'text';
    return 'file';
  };
  P.icon = (kind) => ({ image: '🖼️', video: '🎬', audio: '🎵', pdf: '📄', text: '📝', file: '📦' })[kind] || '📦';

  // ----- formatting -----
  P.bytes = (n) => {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n >= 100 ? n.toFixed(0) : n.toFixed(1)).replace(/\.0$/, '') + ' ' + u[i];
  };
  P.eta = (sec) => {
    if (!isFinite(sec) || sec < 0) return '';
    sec = Math.ceil(sec);
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ' + String(sec % 60).padStart(2, '0') + 's';
    return Math.floor(sec / 3600) + 'h ' + String(Math.floor(sec % 3600 / 60)).padStart(2, '0') + 'm';
  };
  P.clock = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  P.deviceLabel = (ua) => {
    ua = ua || '';
    const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
      : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook'
      : /Linux/.test(ua) ? 'Linux' : 'Device';
    const br = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
      : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
    return br ? os + ' · ' + br : os;
  };
  P.isIOS = (ua, touchMac) => /iPhone|iPad|iPod/.test(ua || '') || !!touchMac;

  // ----- speed meter (smoothed) -----
  P.meter = () => {
    const m = { t: null, b: 0, rate: 0 };
    m.add = (bytesNow, now) => {
      if (m.t === null) { m.t = now; m.b = bytesNow; return m.rate; }
      const dt = (now - m.t) / 1000;
      if (dt < 0.4) return m.rate;
      const r = Math.max(0, (bytesNow - m.b) / dt);
      m.rate = m.rate ? m.rate * 0.6 + r * 0.4 : r;
      m.t = now; m.b = bytesNow;
      return m.rate;
    };
    m.reset = () => { m.t = null; m.b = 0; m.rate = 0; };
    return m;
  };

  // ----- received-file assembly: small chunks folded into ~8 MB Blob parts -----
  P.assembler = (size, partBytes) => {
    const a = { size: size, have: 0, parts: [], pend: [], pendBytes: 0 };
    a.push = (offset, data) => {            // false = out of order / overflow (ignored)
      if (offset !== a.have || a.have + data.byteLength > a.size) return false;
      a.pend.push(data); a.pendBytes += data.byteLength; a.have += data.byteLength;
      if (a.pendBytes >= partBytes) a.fold();
      return true;
    };
    a.fold = () => {
      if (!a.pend.length) return;
      a.parts.push(new Blob(a.pend)); a.pend = []; a.pendBytes = 0;
    };
    a.done = () => a.have === a.size;
    a.blob = (type) => { a.fold(); const b = new Blob(a.parts, { type: type || '' }); a.parts = []; return b; };
    return a;
  };

  // ----- tiny event bus -----
  const subs = {};
  FD.on = (ev, fn) => { (subs[ev] = subs[ev] || []).push(fn); };
  FD.emit = (ev, a, b) => { (subs[ev] || []).slice().forEach((fn) => { try { fn(a, b); } catch (e) { console.error('[fd]', ev, e); } }); };

  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
