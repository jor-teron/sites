/* Image Converter — ic_ico.js: ICO writer with PNG entries (no library). CI3 */
(function (root) {
  'use strict';

  function toU8(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView && ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    throw new Error('icon data must be bytes');
  }

  function isPng(u8) {
    return !!(u8 && u8.length >= 8 &&
      u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47 &&
      u8[4] === 0x0D && u8[5] === 0x0A && u8[6] === 0x1A && u8[7] === 0x0A);
  }

  /**
   * Write an ICO that stores each image as a PNG (Vista+ style).
   * entries: [{ width, height, data: Uint8Array }]
   * Width/height 256 are stored as 0, per the ICO format. No ICO greater
   * than 4 GB (offsets are 32-bit).
   */
  function writeIco(entries) {
    var list = Array.isArray(entries) ? entries : [];
    if (!list.length) throw new Error('no icon images');
    var count = list.length;
    var headerLen = 6 + 16 * count;
    var offset = headerLen;
    var bodies = [];
    var dir = new Uint8Array(headerLen);
    var dv = new DataView(dir.buffer);
    dv.setUint16(0, 0, true);
    dv.setUint16(2, 1, true);
    dv.setUint16(4, count, true);
    var i;
    for (i = 0; i < count; i++) {
      var e = list[i] || {};
      var data = toU8(e.data == null ? new Uint8Array(0) : e.data);
      var w = Math.max(0, Math.round(Number(e.width) || 0));
      var h = Math.max(0, Math.round(Number(e.height) || 0));
      var o = 6 + i * 16;
      dir[o] = w >= 256 ? 0 : w;
      dir[o + 1] = h >= 256 ? 0 : h;
      dir[o + 2] = 0;
      dir[o + 3] = 0;
      dv.setUint16(o + 4, 1, true);
      dv.setUint16(o + 6, e.bitCount || 32, true);
      dv.setUint32(o + 8, data.length, true);
      dv.setUint32(o + 12, offset, true);
      bodies.push(data);
      offset += data.length;
    }
    var out = new Uint8Array(offset);
    out.set(dir, 0);
    var p = headerLen;
    for (i = 0; i < bodies.length; i++) {
      out.set(bodies[i], p);
      p += bodies[i].length;
    }
    return out;
  }

  /**
   * Read an ICO written by writeIco (or another PNG-in-ICO file).
   * Returns [{ width, height, data, isPng }].
   */
  function readIco(buf) {
    var u8 = toU8(buf);
    if (u8.length < 6) throw new Error('not an ico');
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (dv.getUint16(0, true) !== 0 || dv.getUint16(2, true) !== 1) {
      throw new Error('not an ico');
    }
    var count = dv.getUint16(4, true);
    var out = [];
    for (var i = 0; i < count; i++) {
      var o = 6 + i * 16;
      if (o + 16 > u8.length) throw new Error('truncated ico directory');
      var w = u8[o] || 256;
      var h = u8[o + 1] || 256;
      var size = dv.getUint32(o + 8, true);
      var off = dv.getUint32(o + 12, true);
      if (off < 0 || off + size > u8.length) throw new Error('truncated ico image');
      var data = new Uint8Array(size);
      data.set(u8.subarray(off, off + size));
      out.push({ width: w, height: h, data: data, isPng: isPng(data) });
    }
    return out;
  }

  var DEFAULT_SIZES = [16, 32, 48, 64, 128, 256];

  var api = {
    DEFAULT_SIZES: DEFAULT_SIZES,
    isPng: isPng,
    writeIco: writeIco,
    readIco: readIco
  };

  root.ICIco = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
