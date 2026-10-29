/* Music Player MP1 — light tag reader. Reads only a few small slices of each file, never decodes audio.
   ID3v2.2 / 2.3 / 2.4 (TIT2 TPE1 TALB TRCK + TT2 TP1 TAL TRK), then ID3v1 (last 128 bytes), then the file name:
   "Artist - Title.mp3" → artist + title, "01 Title.mp3" → title. Album falls back to the parent folder name.
   MPTags.read(entry) -> Promise<{title, artist, album, track, tagged}>; MPTags.guess(entry) is the synchronous
   file-name fallback used until a tag is read. */
(function () {
  'use strict';
  var WANT = { TIT2: 'title', TPE1: 'artist', TALB: 'album', TRCK: 'track', TT2: 'title', TP1: 'artist', TAL: 'album', TRK: 'track' };
  var MAX_TAG = 4 * 1024 * 1024, WIN = 64 * 1024;
  function buf(file, a, b) { return file.slice(a, b).arrayBuffer ? file.slice(a, b).arrayBuffer() : new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsArrayBuffer(file.slice(a, b)); }); }
  function ss(b, i) { return ((b[i] & 127) << 21) | ((b[i + 1] & 127) << 14) | ((b[i + 2] & 127) << 7) | (b[i + 3] & 127); }
  function be(b, i, n) { var v = 0; for (var k = 0; k < n; k++) v = v * 256 + b[i + k]; return v; }
  function deunsync(b) { var o = [], z = false; for (var i = 0; i < b.length; i++) { if (z && b[i] === 0) { z = false; continue; } o.push(b[i]); z = b[i] === 255; } return new Uint8Array(o); }
  var dec = {};
  function td(enc) { try { return dec[enc] || (dec[enc] = new TextDecoder(enc)); } catch (_) { return dec['utf-8'] || (dec['utf-8'] = new TextDecoder('utf-8')); } }
  function text(b) {
    if (!b.length) return '';
    var e = b[0], d = b.subarray(1), s;
    if (e === 1 || e === 2) {
      var le = e === 1 ? !(d[0] === 0xFE && d[1] === 0xFF) : false;
      if (e === 1 && ((d[0] === 0xFF && d[1] === 0xFE) || (d[0] === 0xFE && d[1] === 0xFF))) d = d.subarray(2);
      if (d.length % 2) d = d.subarray(0, d.length - 1);
      s = td(le ? 'utf-16le' : 'utf-16be').decode(d);
    } else s = td(e === 3 ? 'utf-8' : 'windows-1252').decode(d);
    s = s.split('\u0000').filter(Boolean)[0] || '';
    return s.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 200);
  }
  function folderOf(p) { var a = String(p || '').split('/'); return a.length > 1 ? a[a.length - 2] : ''; }
  function guess(e) {
    var n = String(e.name || '').replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim(), r = { title: n, artist: '', album: folderOf(e.path), track: 0, tagged: false };
    var m = n.match(/^\s*(\d{1,3})[\s.\-_)]+(.+)$/); if (m) { r.track = +m[1]; n = m[2]; r.title = n; }
    var p = n.split(/\s+[-–]\s+/);
    if (p.length >= 2) { r.artist = p[0].trim(); r.title = p.slice(1).join(' - ').trim(); }
    if (!r.title) r.title = e.name || 'Untitled';
    return r;
  }
  async function id3v2(file) {
    var h = new Uint8Array(await buf(file, 0, 10));
    if (h.length < 10 || h[0] !== 0x49 || h[1] !== 0x44 || h[2] !== 0x33) return null;
    var ver = h[3], flags = h[5], size = Math.min(ss(h, 6), MAX_TAG, file.size - 10);
    if (ver < 2 || ver > 4 || size <= 0) return null;
    /* read the tag in windows so a big cover picture (APIC) is skipped, not read */
    var out = {}, found = 0, off = 10, end = 10 + size, cache = null, cs = 0;
    async function at(a, n) {
      if (!cache || a < cs || a + n > cs + cache.length) { cs = a; cache = new Uint8Array(await buf(file, a, Math.min(end, a + Math.max(n, WIN)))); }
      return cache.subarray(a - cs, a - cs + n);
    }
    var wholeUnsync = (flags & 0x80) && ver < 4;
    if (flags & 0x40 && ver === 3) { var x = await at(off, 4); off += 4 + be(x, 0, 4); }
    else if (flags & 0x40 && ver === 4) { var y = await at(off, 4); off += ss(y, 0); }
    var hl = ver === 2 ? 6 : 10;
    while (off + hl <= end && found < 4) {
      var fh = await at(off, hl); if (fh.length < hl || fh[0] === 0) break;
      var id = String.fromCharCode.apply(null, fh.subarray(0, ver === 2 ? 3 : 4));
      if (!/^[A-Z0-9]+$/.test(id)) break;
      var fs = ver === 2 ? be(fh, 3, 3) : ver === 4 ? ss(fh, 4) : be(fh, 4, 4);
      if (ver === 4 && fs > end) fs = be(fh, 4, 4); /* some v2.4 writers use plain sizes */
      var body = off + hl; off = body + fs;
      if (fs <= 0 || fs > 4096 || !WANT[id] || out[WANT[id]]) continue;
      var fb = await at(body, fs), ff = ver === 4 ? fh[9] : 0;
      if (ver === 4 && (ff & 0x01)) fb = fb.subarray(4); /* data length indicator */
      if ((ver === 4 && (ff & 0x02)) || wholeUnsync) fb = deunsync(fb);
      if (ver === 4 && (ff & 0x0C)) continue; /* compressed / encrypted */
      var v = text(fb); if (v) { out[WANT[id]] = v; found++; }
    }
    return out;
  }
  async function id3v1(file) {
    if (file.size < 128) return null;
    var b = new Uint8Array(await buf(file, file.size - 128, file.size));
    if (b[0] !== 0x54 || b[1] !== 0x41 || b[2] !== 0x47) return null;
    var d = td('windows-1252'), f = function (a, n) { return d.decode(b.subarray(a, a + n)).split('\u0000')[0].trim(); };
    return { title: f(3, 30), artist: f(33, 30), album: f(63, 30), track: b[125] === 0 && b[126] ? String(b[126]) : '' };
  }
  async function read(e) {
    var g = guess(e), f = e.file; if (!f) return g;
    var t = null;
    try { t = await id3v2(f); } catch (_) { t = null; }
    if (!t || (!t.title && !t.artist)) { try { var v1 = /\.mp3$/i.test(e.name) ? await id3v1(f) : null; if (v1 && (v1.title || v1.artist)) t = Object.assign(v1, t || {}); } catch (_) { /* */ } }
    if (!t) return g;
    return { title: t.title || g.title, artist: t.artist || g.artist, album: t.album || g.album, track: parseInt(t.track, 10) || g.track, tagged: !!(t.title || t.artist || t.album) };
  }
  window.MPTags = { read: read, guess: guess };
})();
