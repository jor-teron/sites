/* Image Converter — ic_zip.js: tiny store-only ZIP writer (no library). CI1 */
(function (root) {
  'use strict';

  var enc = new TextEncoder();
  var table = null;

  function crc32(u8) {
    if (!table) {
      table = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) crc = table[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function toU8(data) {
    if (data instanceof Uint8Array) return data;
    if (typeof data === 'string') return enc.encode(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView && ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    throw new Error('zip entry data must be bytes or text');
  }

  function dosTime(dt) {
    dt = dt || new Date();
    var year = dt.getFullYear();
    return {
      time: (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1),
      date: ((Math.max(1980, year) - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate()
    };
  }

  /**
   * Write a store-only (method 0) zip. No ZIP64 (entries and archive < 4 GB).
   * entries: [{ name, data: Uint8Array|string|ArrayBuffer, date? }]
   * Returns Uint8Array.
   */
  function writeStoreZip(entries, date) {
    var list = Array.isArray(entries) ? entries : [];
    var parts = [];
    var central = [];
    var now = dosTime(date);
    var off = 0;
    var i;
    for (i = 0; i < list.length; i++) {
      var e = list[i] || {};
      var raw = toU8(e.data == null ? '' : e.data);
      var nameStr = String(e.name || ('file-' + (i + 1)));
      nameStr = nameStr.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!nameStr) nameStr = 'file-' + (i + 1);
      var name = enc.encode(nameStr);
      var when = e.date ? dosTime(e.date) : now;
      var crc = crc32(raw);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(6, 0x0800, true);
      h.setUint16(8, 0, true);
      h.setUint16(10, when.time, true);
      h.setUint16(12, when.date, true);
      h.setUint32(14, crc, true);
      h.setUint32(18, raw.length, true);
      h.setUint32(22, raw.length, true);
      h.setUint16(26, name.length, true);
      h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, raw);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true);
      c.setUint16(4, 20, true);
      c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true);
      c.setUint16(12, when.time, true);
      c.setUint16(14, when.date, true);
      c.setUint32(16, crc, true);
      c.setUint32(20, raw.length, true);
      c.setUint32(24, raw.length, true);
      c.setUint16(28, name.length, true);
      c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + raw.length;
    }
    var cdSize = 0;
    for (i = 0; i < central.length; i++) cdSize += central[i].length;
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, list.length, true);
    end.setUint16(10, list.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, off, true);
    parts = parts.concat(central, [new Uint8Array(end.buffer)]);
    var total = 0;
    for (i = 0; i < parts.length; i++) total += parts[i].length;
    var out = new Uint8Array(total);
    var p = 0;
    for (i = 0; i < parts.length; i++) {
      out.set(parts[i], p);
      p += parts[i].length;
    }
    return out;
  }

  /**
   * Read a store-only (or already-known method 0) zip built by writeStoreZip.
   * Returns [{ name, data: Uint8Array, crc, size }].
   * Throws on deflate entries or a damaged directory.
   */
  function readStoreZip(buf) {
    var u8 = toU8(buf);
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var e = -1;
    var start = Math.max(0, u8.length - 65557);
    for (var i = u8.length - 22; i >= start; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    }
    if (e < 0) throw new Error('not a zip file');
    var count = dv.getUint16(e + 10, true);
    var p = dv.getUint32(e + 16, true);
    var dec = new TextDecoder();
    var out = [];
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip directory');
      var method = dv.getUint16(p + 10, true);
      var crc = dv.getUint32(p + 16, true);
      var csize = dv.getUint32(p + 20, true);
      var size = dv.getUint32(p + 24, true);
      var nl = dv.getUint16(p + 28, true);
      var xl = dv.getUint16(p + 30, true);
      var cl = dv.getUint16(p + 32, true);
      var lo = dv.getUint32(p + 42, true);
      var name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + xl + cl;
      if (method !== 0) throw new Error('unsupported zip method ' + method);
      var nameLen = dv.getUint16(lo + 26, true);
      var extraLen = dv.getUint16(lo + 28, true);
      var startData = lo + 30 + nameLen + extraLen;
      var data = u8.subarray(startData, startData + csize);
      var copy = new Uint8Array(data.length);
      copy.set(data);
      if (copy.length !== size || crc32(copy) !== crc) throw new Error('damaged entry ' + name);
      out.push({ name: name, data: copy, crc: crc, size: size });
    }
    return out;
  }

  var api = {
    crc32: crc32,
    writeStoreZip: writeStoreZip,
    readStoreZip: readStoreZip
  };

  root.ICZip = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
