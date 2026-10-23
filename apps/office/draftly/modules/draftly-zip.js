/* ============================================================
   FILE: modules/draftly-zip.js
   PROJECT: Draftly
   ROLE: Tiny ZIP writer (method 0 = stored, no compression) for "Export all".
         DOCX files are already compressed, so storing them costs nothing.
   API:  Draftly.zip.build([{ name, data: Uint8Array | ArrayBuffer }]) → Blob
         Draftly.zip.crc32(Uint8Array) → unsigned int
   Names are written as UTF-8 (flag bit 11). Up to 65535 files, < 4 GB.
   No DOM, no storage. Works from file://.
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.zip = {};

Draftly.zip.table = (function () {
  var t = new Uint32Array(256), n, k, c;
  for (n = 0; n < 256; n++) {
    c = n;
    for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

Draftly.zip.crc32 = function crc32(bytes) {
  var c = 0xFFFFFFFF, t = Draftly.zip.table, i;
  for (i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

/* MS-DOS date / time of "now". */
Draftly.zip.dosStamp = function dosStamp(d) {
  d = d || new Date();
  var year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
};

Draftly.zip.build = function build(entries) {
  var enc = new TextEncoder(), parts = [], central = [], offset = 0, stamp = Draftly.zip.dosStamp();
  if (entries.length > 65535) throw new Error('Too many files for a ZIP');
  entries.forEach(function (e) {
    var data = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
    var name = enc.encode(e.name);
    var crc = Draftly.zip.crc32(data);
    var lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);              /* version needed */
    lh.setUint16(6, 0x0800, true);          /* UTF-8 names */
    lh.setUint16(8, 0, true);               /* stored */
    lh.setUint16(10, stamp.time, true);
    lh.setUint16(12, stamp.date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, data);
    var ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);              /* version made by */
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, stamp.time, true);
    ch.setUint16(14, stamp.date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);
    offset += 30 + name.length + data.length;
  });
  var cdSize = 0;
  central.forEach(function (c) { cdSize += c.byteLength !== undefined ? c.byteLength : c.length; });
  var end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
};
