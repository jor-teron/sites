/*
 * Hub Photo Studio (HPS2) — ps_zip.js, a tiny ZIP writer + reader (no library, ~3 KB).
 * Used by the .hps project file and the .ora (OpenRaster) export, both plain ZIPs.
 *  - Write: entries in the order given. 'store' (method 0) or 'deflate' (method 8) through the
 *    browser's own CompressionStream('deflate-raw'); without it, deflate falls back to store.
 *    No extra fields, no data descriptors, so a stored first entry 'mimetype' sits at byte 30
 *    exactly as OpenRaster requires. CRC-32 for every entry. No ZIP64 (entries < 4 GB).
 *  - Read: central directory → entries; methods 0 and 8 (DecompressionStream). CRC checked.
 * API: PSZip.write([{ name, data: Uint8Array|Blob|string, method: 'store'|'deflate' }]) → Promise<Blob>
 *      PSZip.read(blob) → Promise<Map<name, { method, size, bytes(): Promise<Uint8Array>, text(), blob(type) }>>
 */
(function () {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  let table = null;
  function crc32(u8) {
    if (!table) {
      table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = table[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const canDeflate = () => typeof CompressionStream === 'function';
  async function pipe(u8, Stream, mode) {
    const s = new Blob([u8]).stream().pipeThrough(new Stream(mode));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function toU8(d) {
    if (d instanceof Uint8Array) return d;
    if (typeof d === 'string') return enc.encode(d);
    if (d instanceof ArrayBuffer) return new Uint8Array(d);
    return new Uint8Array(await d.arrayBuffer());
  }
  function dosTime(dt) {
    return {
      time: (dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds() >> 1),
      date: ((Math.max(1980, dt.getFullYear()) - 1980) << 9) | ((dt.getMonth() + 1) << 5) | dt.getDate()
    };
  }

  async function write(entries) {
    const parts = [], central = [], now = dosTime(new Date());
    let off = 0;
    for (const e of entries) {
      const raw = await toU8(e.data), name = enc.encode(e.name);
      let method = 0, body = raw;
      if (e.method === 'deflate' && canDeflate() && raw.length > 64) {
        try { const z = await pipe(raw, CompressionStream, 'deflate-raw'); if (z.length < raw.length) { body = z; method = 8; } } catch (_) { /* store */ }
      }
      const crc = crc32(raw);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);   // UTF-8 names
      h.setUint16(8, method, true); h.setUint16(10, now.time, true); h.setUint16(12, now.date, true);
      h.setUint32(14, crc, true); h.setUint32(18, body.length, true); h.setUint32(22, raw.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, body);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, method, true); c.setUint16(12, now.time, true); c.setUint16(14, now.date, true);
      c.setUint32(16, crc, true); c.setUint32(20, body.length, true); c.setUint32(24, raw.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + body.length;
    }
    const cdSize = central.reduce((n, u) => n + u.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  }

  async function read(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(buf.buffer);
    let e = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('not a zip file');
    const count = dv.getUint16(e + 10, true);
    let p = dv.getUint32(e + 16, true);
    const out = new Map();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip directory');
      const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true);
      const csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const lo = dv.getUint32(p + 42, true);
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nl));
      p += 46 + nl + xl + cl;
      const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      const comp = buf.subarray(start, start + csize);
      let cache = null;
      const bytes = async () => {
        if (cache) return cache;
        let u;
        if (method === 0) u = comp;
        else if (method === 8) {
          if (typeof DecompressionStream !== 'function') throw new Error('this browser cannot unzip');
          u = await pipe(comp, DecompressionStream, 'deflate-raw');
        } else throw new Error('unsupported zip method ' + method);
        if (u.length !== size || crc32(u) !== crc) throw new Error('damaged entry ' + name);
        return (cache = u);
      };
      out.set(name, { name, method, size, offset: lo, bytes, text: async () => dec.decode(await bytes()), blob: async (type) => new Blob([await bytes()], { type: type || '' }) });
    }
    return out;
  }

  window.PSZip = { write, read, crc32, canDeflate };
})();
