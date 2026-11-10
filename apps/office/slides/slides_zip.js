/* Hub Office Slides SL9 — tiny ZIP helper (SLZip). No DOM, safe to load in Node.
   Store (method 0) pack / unpack, used for .pptx export and PNG zip. PPTX files from
   PowerPoint are usually deflated: unpack() reports needsInflate, and loadJSZip() lazy-loads
   a JSZip already vendored in this repo (no CDN, no copy). */
(function (root) {
  'use strict';
  var JSPATHS = ['../../../shared/vendor/jszip.min.js', '../ocr/vendor/jszip.min.js'];
  var table = (function () {
    var t = new Uint32Array(256), n, k, c;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF, i;
    for (i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u8(x) {
    if (!x) return new Uint8Array(0);
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (typeof x === 'string') {
      if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(x);
      var out = [], i;
      for (i = 0; i < x.length; i++) {
        var c = x.charCodeAt(i);
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
        else { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
      }
      return new Uint8Array(out);
    }
    return new Uint8Array(x);
  }
  function str(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
    var s = '', i;
    for (i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(s)); } catch (_) { return s; }
  }
  function dosStamp(d) {
    d = d || new Date();
    var year = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }
  /* files: { path: string|Uint8Array } → Uint8Array (store only) */
  function pack(files) {
    var names = Object.keys(files || {}), parts = [], central = [], offset = 0, stamp = dosStamp(), i;
    if (names.length > 65535) throw new Error('Too many files for a ZIP');
    for (i = 0; i < names.length; i++) {
      var name = names[i].replace(/^\/+/, '').replace(/\\/g, '/');
      var data = u8(files[names[i]]);
      var nb = u8(name), crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true);
      lh.setUint16(10, stamp.time, true);
      lh.setUint16(12, stamp.date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, nb.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nb, data);
      var ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, stamp.time, true);
      ch.setUint16(14, stamp.date, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true);
      ch.setUint32(24, data.length, true);
      ch.setUint16(28, nb.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), nb);
      offset += 30 + nb.length + data.length;
    }
    var cdSize = 0;
    for (i = 0; i < central.length; i++) cdSize += central[i].length;
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, names.length, true);
    end.setUint16(10, names.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    parts = parts.concat(central, [new Uint8Array(end.buffer)]);
    var total = 0;
    for (i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total), o = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
    return out;
  }
  function u16(b, i) { return b[i] | (b[i + 1] << 8); }
  function u32(b, i) { return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0; }
  /* returns { files } or { error, needsInflate } */
  function unpack(buf) {
    var b = u8(buf), files = {}, i = 0, needs = false, saw = 0;
    while (i + 30 <= b.length) {
      var sig = u32(b, i);
      if (sig === 0x02014b50 || sig === 0x06054b50) break;
      if (sig !== 0x04034b50) {
        if (saw) break;
        return { error: 'This is not a ZIP file.' };
      }
      var flag = u16(b, i + 6), method = u16(b, i + 8);
      var csz = u32(b, i + 18), usz = u32(b, i + 22);
      var nlen = u16(b, i + 26), elen = u16(b, i + 28);
      var name = str(b.subarray(i + 30, i + 30 + nlen)).replace(/\\/g, '/');
      var start = i + 30 + nlen + elen;
      if (flag & 0x8) return { error: 'deflate', needsInflate: true };
      if (method === 8) needs = true;
      if (method === 0 && !needs) {
        files[name] = b.subarray(start, start + usz);
        saw++;
        i = start + csz;
        continue;
      }
      if (needs) return { error: 'deflate', needsInflate: true };
      i = start + csz;
    }
    if (!saw && !needs) return { error: 'This ZIP is empty or is not a ZIP file.' };
    return { files: files };
  }
  var loading = null;
  function loadJSZip() {
    if (root.JSZip) return Promise.resolve(root.JSZip);
    if (loading) return loading;
    if (typeof document === 'undefined' || !document.createElement) {
      return Promise.reject(new Error('JSZip is not available here.'));
    }
    loading = new Promise(function (res, rej) {
      var i = 0;
      function next() {
        if (root.JSZip) { res(root.JSZip); return; }
        if (i >= JSPATHS.length) { loading = null; rej(new Error('Could not load the zip library.')); return; }
        var s = document.createElement('script');
        s.src = JSPATHS[i++];
        s.onload = function () { if (root.JSZip) res(root.JSZip); else next(); };
        s.onerror = function () { next(); };
        (document.head || document.documentElement).appendChild(s);
      }
      next();
    });
    return loading;
  }
  function unpackSmart(buf) {
    var r = unpack(buf);
    if (!r.needsInflate) return Promise.resolve(r);
    return loadJSZip().then(function (JSZip) {
      return JSZip.loadAsync(buf).then(function (zip) {
        var names = Object.keys(zip.files), jobs = [];
        names.forEach(function (n) {
          if (zip.files[n].dir) return;
          jobs.push(zip.files[n].async('uint8array').then(function (data) { return [n, data]; }));
        });
        return Promise.all(jobs).then(function (pairs) {
          var files = {};
          pairs.forEach(function (p) { files[p[0].replace(/\\/g, '/')] = p[1]; });
          return { files: files };
        });
      });
    }).catch(function (e) {
      return { error: 'This PowerPoint file is compressed and the zip library could not be loaded. ' + (e && e.message ? e.message : '') };
    });
  }
  function asText(x) {
    if (typeof x === 'string') return x;
    return str(u8(x));
  }

  var API = { pack: pack, unpack: unpack, unpackSmart: unpackSmart, loadJSZip: loadJSZip, crc32: crc32, u8: u8, str: str, asText: asText, JSPATHS: JSPATHS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SLZip = API;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
