/*
 * PDF Tools — tiny ZIP writer (method 0 = stored, no compression).
 * Adapted from Draftly's stored-zip writer. No new library.
 * API: PTZip.build([{ name, data: Uint8Array | ArrayBuffer }]) → Blob
 * Names are UTF-8 (flag bit 11). Up to 65535 files, each under 4 GB.
 * No DOM. Works from file:// and Node (module.exports).
 */
const PTZip = (() => {
  const table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosStamp(d) {
    d = d || new Date();
    const year = Math.max(1980, d.getFullYear());
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }

  function build(entries) {
    if (entries.length > 65535) throw new Error('Too many files for a ZIP');
    const enc = new TextEncoder();
    const parts = [];
    const central = [];
    let offset = 0;
    const stamp = dosStamp();
    entries.forEach((e) => {
      const data = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
      const name = enc.encode(e.name);
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true);
      lh.setUint16(10, stamp.time, true);
      lh.setUint16(12, stamp.date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, data);
      const ch = new DataView(new ArrayBuffer(46));
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
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);
      offset += 30 + name.length + data.length;
    });
    let cdSize = 0;
    central.forEach((c) => { cdSize += c.byteLength !== undefined ? c.byteLength : c.length; });
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
  }

  /* Node helper: same bytes as build(), returned as one Uint8Array (no Blob). */
  function buildBytes(entries) {
    const blobParts = [];
    // Mirror build() but collect buffers for Node tests.
    if (entries.length > 65535) throw new Error('Too many files for a ZIP');
    const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : { encode: (s) => Buffer.from(s, 'utf8') };
    const parts = [];
    const central = [];
    let offset = 0;
    const stamp = dosStamp();
    entries.forEach((e) => {
      const data = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
      const name = enc.encode(e.name);
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true);
      lh.setUint16(8, 0, true);
      lh.setUint16(10, stamp.time, true);
      lh.setUint16(12, stamp.date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
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
      ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    let cdSize = 0;
    central.forEach((c) => { cdSize += c.byteLength !== undefined ? c.byteLength : c.length; });
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, entries.length, true);
    end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    const all = parts.concat(central, [new Uint8Array(end.buffer)]);
    let total = 0;
    all.forEach((a) => { total += a.length; });
    const out = new Uint8Array(total);
    let o = 0;
    all.forEach((a) => { out.set(a, o); o += a.length; });
    return out;
  }

  return { crc32, build, buildBytes, dosStamp };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PTZip;
