/* Image Converter — ic_exif.js: JPEG EXIF parse, describe, and a minimal writer. CI3 */
(function (root) {
  'use strict';

  var TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  function isJpeg(u8) {
    return !!(u8 && u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xD8);
  }

  function readU16(u8, off, le) {
    return le ? u8[off] | (u8[off + 1] << 8) : (u8[off] << 8) | u8[off + 1];
  }

  function readU32(u8, off, le) {
    if (le) return (u8[off] | (u8[off + 1] << 8) | (u8[off + 2] << 16) | (u8[off + 3] << 24)) >>> 0;
    return ((u8[off] << 24) | (u8[off + 1] << 16) | (u8[off + 2] << 8) | u8[off + 3]) >>> 0;
  }

  function readI32(u8, off, le) {
    return readU32(u8, off, le) | 0;
  }

  /* Walk JPEG markers. Returns { app1: [Uint8Array slices without the 4-byte header], sof: {width,height} } */
  function walkJpeg(u8) {
    var out = { app1: [], sof: null };
    if (!isJpeg(u8)) return out;
    var i = 2;
    var len = u8.length;
    while (i < len - 1) {
      if (u8[i] !== 0xFF) { i += 1; continue; }
      var marker = u8[i + 1];
      if (marker === 0x00 || marker === 0xFF) { i += 1; continue; }
      if (marker === 0xD9 || marker === 0xDA) break;
      if ((marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) { i += 2; continue; }
      if (i + 3 >= len) break;
      var seglen = (u8[i + 2] << 8) | u8[i + 3];
      if (seglen < 2 || i + 2 + seglen > len) break;
      if (marker === 0xE1) out.app1.push(u8.subarray(i + 4, i + 2 + seglen));
      if (marker >= 0xC0 && marker <= 0xC3 && seglen >= 7 && !out.sof) {
        out.sof = {
          height: (u8[i + 5] << 8) | u8[i + 6],
          width: (u8[i + 7] << 8) | u8[i + 8]
        };
      }
      i += 2 + seglen;
    }
    return out;
  }

  function valueAt(u8, base, off, type, count, le) {
    var size = TYPE_SIZE[type] || 1;
    var nbytes = size * count;
    var valOff = nbytes <= 4 ? off : readU32(u8, off, le);
    var p = nbytes <= 4 ? off : base + valOff;
    if (p < 0 || p + nbytes > u8.length) return null;
    if (type === 2) {
      var end = p;
      var max = p + count;
      while (end < max && u8[end] !== 0) end += 1;
      var s = '';
      for (var i = p; i < end; i++) s += String.fromCharCode(u8[i]);
      return s;
    }
    if (type === 5 || type === 10) {
      var rats = [];
      var signed = type === 10;
      for (var r = 0; r < count; r++) {
        var a = signed ? readI32(u8, p + r * 8, le) : readU32(u8, p + r * 8, le);
        var b = signed ? readI32(u8, p + r * 8 + 4, le) : readU32(u8, p + r * 8 + 4, le);
        rats.push({ num: a, den: b || 1 });
      }
      return count === 1 ? rats[0] : rats;
    }
    if (type === 1 || type === 7) {
      if (count === 1) return u8[p];
      var bytes = [];
      for (var b = 0; b < count; b++) bytes.push(u8[p + b]);
      return bytes;
    }
    var nums = [];
    for (var n = 0; n < count; n++) {
      var v;
      if (type === 3) v = readU16(u8, p + n * 2, le);
      else if (type === 9) v = readI32(u8, p + n * 4, le);
      else v = readU32(u8, p + n * 4, le);
      nums.push(v);
    }
    return count === 1 ? nums[0] : nums;
  }

  function readIfd(u8, base, offset, le) {
    if (offset < 0 || base + offset + 2 > u8.length) return { tags: {}, next: 0 };
    var p = base + offset;
    var count = readU16(u8, p, le);
    var tags = {};
    var i;
    for (i = 0; i < count; i++) {
      var e = p + 2 + i * 12;
      if (e + 12 > u8.length) break;
      var tag = readU16(u8, e, le);
      var type = readU16(u8, e + 2, le);
      var cnt = readU32(u8, e + 4, le);
      var val = valueAt(u8, base, e + 8, type, cnt, le);
      tags[tag] = { tag: tag, type: type, count: cnt, value: val };
    }
    var nextOff = p + 2 + count * 12;
    var next = nextOff + 4 <= u8.length ? readU32(u8, nextOff, le) : 0;
    return { tags: tags, next: next };
  }

  function parseExifPayload(payload) {
    if (!payload || payload.length < 12) return null;
    /* "Exif\0\0" then TIFF */
    var start = 0;
    if (payload[0] === 0x45 && payload[1] === 0x78 && payload[2] === 0x69 && payload[3] === 0x66) {
      start = 6;
    }
    if (start + 8 > payload.length) return null;
    var b0 = payload[start];
    var b1 = payload[start + 1];
    var le;
    if (b0 === 0x49 && b1 === 0x49) le = true;
    else if (b0 === 0x4D && b1 === 0x4D) le = false;
    else return null;
    var magic = readU16(payload, start + 2, le);
    if (magic !== 0x002A) return null;
    var ifd0off = readU32(payload, start + 4, le);
    var ifd0 = readIfd(payload, start, ifd0off, le);
    var exif = { tags: {} };
    var gps = { tags: {} };
    var exifPtr = ifd0.tags[0x8769];
    if (exifPtr && exifPtr.value != null) exif = readIfd(payload, start, exifPtr.value, le);
    var gpsPtr = ifd0.tags[0x8825];
    if (gpsPtr && gpsPtr.value != null) gps = readIfd(payload, start, gpsPtr.value, le);
    return { little: le, ifd0: ifd0.tags, exif: exif.tags, gps: gps.tags };
  }

  function tagVal(ifd, tag) {
    return ifd && ifd[tag] ? ifd[tag].value : null;
  }

  /**
   * Parse a JPEG byte array. Returns null when the data is not a JPEG.
   * Fields used in CI1: isJpeg, width, height, orientation (1–8, default 1).
   * ifd0 / exif / gps tag maps are included for later releases.
   */
  function parseJpeg(u8) {
    if (!isJpeg(u8)) return null;
    var walked = walkJpeg(u8);
    var orientation = 1;
    var parsed = null;
    var i;
    for (i = 0; i < walked.app1.length; i++) {
      parsed = parseExifPayload(walked.app1[i]);
      if (parsed) break;
    }
    if (parsed) {
      var o = tagVal(parsed.ifd0, 0x0112);
      if (typeof o === 'number' && o >= 1 && o <= 8) orientation = o;
    }
    return {
      isJpeg: true,
      width: walked.sof ? walked.sof.width : 0,
      height: walked.sof ? walked.sof.height : 0,
      orientation: orientation,
      exif: parsed
    };
  }

  function jpegOrientation(u8) {
    var p = parseJpeg(u8);
    return p ? p.orientation : 0;
  }

  function jpegDimensions(u8) {
    var p = parseJpeg(u8);
    if (!p || !p.width) return null;
    return { width: p.width, height: p.height };
  }

  /** Swap width/height for orientations 5–8. */
  function sizeAfterOrientation(w, h, orient) {
    if (orient >= 5 && orient <= 8) return { width: h, height: w };
    return { width: w, height: h };
  }

  /**
   * Set a 2D context transform so (0,0)–(srcW,srcH) of the unoriented
   * pixels are drawn correctly. Returns the output size.
   */
  function applyOrientation(ctx, srcW, srcH, orient) {
    var w = srcW;
    var h = srcH;
    switch (orient) {
      case 2:
        ctx.transform(-1, 0, 0, 1, srcW, 0);
        break;
      case 3:
        ctx.transform(-1, 0, 0, -1, srcW, srcH);
        break;
      case 4:
        ctx.transform(1, 0, 0, -1, 0, srcH);
        break;
      case 5:
        ctx.transform(0, 1, 1, 0, 0, 0);
        w = srcH; h = srcW;
        break;
      case 6:
        ctx.transform(0, 1, -1, 0, srcH, 0);
        w = srcH; h = srcW;
        break;
      case 7:
        ctx.transform(0, -1, -1, 0, srcH, srcW);
        w = srcH; h = srcW;
        break;
      case 8:
        ctx.transform(0, -1, 1, 0, 0, srcW);
        w = srcH; h = srcW;
        break;
      default:
        break;
    }
    return { width: w, height: h };
  }

  function valOf(ifd, tag) {
    return tagVal(ifd, tag);
  }

  function rationalNum(v) {
    if (v && typeof v === 'object' && !Array.isArray(v) && v.num != null) {
      return v.den ? v.num / v.den : 0;
    }
    return Number(v) || 0;
  }

  function dmsToDec(arr, ref) {
    if (arr == null) return null;
    var a = Array.isArray(arr) ? arr : [arr];
    var d = rationalNum(a[0]);
    var m = rationalNum(a.length > 1 ? a[1] : 0);
    var s = rationalNum(a.length > 2 ? a[2] : 0);
    var dec = d + m / 60 + s / 3600;
    if (ref === 'S' || ref === 'W') dec = -Math.abs(dec);
    return dec;
  }

  function decToDms(dec) {
    var neg = Number(dec) < 0;
    var x = Math.abs(Number(dec) || 0);
    var d = Math.floor(x);
    var minF = (x - d) * 60;
    var m = Math.floor(minF);
    var s = (minF - m) * 60;
    return {
      neg: neg,
      rats: [
        { num: d, den: 1 },
        { num: m, den: 1 },
        { num: Math.round(s * 1000), den: 1000 }
      ]
    };
  }

  function hemi(latOrLon, kind) {
    if (kind === 'lat') return latOrLon < 0 ? 'S' : 'N';
    return latOrLon < 0 ? 'W' : 'E';
  }

  function formatCoord(dec, kind) {
    if (dec == null || !isFinite(dec)) return '';
    var h = hemi(dec, kind);
    return Math.abs(dec).toFixed(5) + '° ' + h;
  }

  function formatGpsText(lat, lon) {
    if (lat == null || lon == null) return '';
    return formatCoord(lat, 'lat') + ', ' + formatCoord(lon, 'lon');
  }

  function formatExifDate(raw) {
    var s = String(raw || '').trim();
    var m = s.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
    if (!m) return s;
    return m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6];
  }

  function toExifDate(value) {
    if (!value) return '';
    if (value instanceof Date && isFinite(value.getTime())) {
      function z(n) { n = String(n); return n.length < 2 ? '0' + n : n; }
      return value.getFullYear() + ':' + z(value.getMonth() + 1) + ':' + z(value.getDate()) +
        ' ' + z(value.getHours()) + ':' + z(value.getMinutes()) + ':' + z(value.getSeconds());
    }
    var s = String(value).trim();
    if (/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 19);
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (m) return m[1] + ':' + m[2] + ':' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6];
    return '';
  }

  /**
   * Friendly summary of a parseJpeg() result (or of JPEG bytes).
   */
  function describe(input) {
    var parsed = input && input.isJpeg ? input : (input ? parseJpeg(input) : null);
    if (!parsed) return null;
    var ex = parsed.exif || {};
    var ifd0 = ex.ifd0 || {};
    var exif = ex.exif || {};
    var gps = ex.gps || {};
    var make = valOf(ifd0, 0x010F);
    var model = valOf(ifd0, 0x0110);
    make = typeof make === 'string' ? make.trim() : '';
    model = typeof model === 'string' ? model.trim() : '';
    var camera = [make, model].filter(Boolean).join(' ');
    if (model && make && model.indexOf(make) === 0) camera = model;
    var dateRaw = valOf(exif, 0x9003) || valOf(ifd0, 0x0132) || valOf(exif, 0x9004) || '';
    if (typeof dateRaw !== 'string') dateRaw = '';
    var latRef = valOf(gps, 0x0001);
    var lonRef = valOf(gps, 0x0003);
    var lat = dmsToDec(valOf(gps, 0x0002), typeof latRef === 'string' ? latRef.charAt(0) : latRef);
    var lon = dmsToDec(valOf(gps, 0x0004), typeof lonRef === 'string' ? lonRef.charAt(0) : lonRef);
    var hasGps = lat != null && lon != null && isFinite(lat) && isFinite(lon);
    var alt = null;
    if (hasGps && valOf(gps, 0x0006) != null) {
      alt = rationalNum(valOf(gps, 0x0006));
      if (valOf(gps, 0x0005) === 1) alt = -alt;
    }
    return {
      make: make,
      model: model,
      camera: camera,
      dateRaw: String(dateRaw || '').trim(),
      date: formatExifDate(dateRaw),
      orientation: parsed.orientation || 1,
      width: parsed.width || 0,
      height: parsed.height || 0,
      hasGps: hasGps,
      gps: hasGps ? { lat: lat, lon: lon, alt: alt, text: formatGpsText(lat, lon) } : null,
      iso: valOf(exif, 0x8827),
      parsed: parsed
    };
  }

  function pushBytes(arr, bytes) {
    for (var i = 0; i < bytes.length; i++) arr.push(bytes[i] & 0xFF);
  }

  function le16(n) { return [n & 0xFF, (n >> 8) & 0xFF]; }
  function le32(n) {
    n = n >>> 0;
    return [n & 0xFF, (n >> 8) & 0xFF, (n >> 16) & 0xFF, (n >> 24) & 0xFF];
  }

  function packAscii(s) {
    var str = String(s == null ? '' : s);
    var out = [];
    for (var i = 0; i < str.length; i++) out.push(str.charCodeAt(i) & 0xFF);
    out.push(0);
    return out;
  }

  function packAsciiFixed(s, len) {
    var out = packAscii(s);
    while (out.length < len) out.push(0);
    if (out.length > len) {
      out = out.slice(0, len);
      out[len - 1] = 0;
    }
    return out;
  }

  function packRats(rats) {
    var out = [];
    for (var i = 0; i < rats.length; i++) {
      pushBytes(out, le32(rats[i].num >>> 0));
      pushBytes(out, le32(rats[i].den >>> 0));
    }
    return out;
  }

  /**
   * Build a TIFF Exif payload (including the "Exif\0\0" header) from
   * { date, make, model, gps?: {lat, lon, alt} }.
   * Returns null when there is nothing to write.
   */
  function buildExifPayload(opts) {
    opts = opts || {};
    var date = toExifDate(opts.date);
    var make = opts.make ? String(opts.make).slice(0, 64) : '';
    var model = opts.model ? String(opts.model).slice(0, 64) : '';
    var gps = opts.gps && isFinite(Number(opts.gps.lat)) && isFinite(Number(opts.gps.lon)) ? opts.gps : null;
    if (!date && !make && !model && !gps) return null;

    function tag(list, id, type, bytes) {
      list.push({ tag: id, type: type, count: type === 2 ? bytes.length : (type === 5 ? bytes.length / 8 : (type === 1 || type === 7 ? bytes.length : (type === 3 ? 1 : 1))), bytes: bytes });
    }
    /* Fix counts properly per type after we know bytes. */
    function add(list, id, type, bytes, count) {
      list.push({ tag: id, type: type, count: count, bytes: bytes });
    }

    var ifd0 = [];
    var exif = [];
    var gpsIfd = [];

    if (make) add(ifd0, 0x010F, 2, packAscii(make), packAscii(make).length);
    if (model) add(ifd0, 0x0110, 2, packAscii(model), packAscii(model).length);
    if (date) add(ifd0, 0x0132, 2, packAsciiFixed(date, 20), 20);
    add(ifd0, 0x0112, 3, le16(1).concat([0, 0]), 1); /* already-oriented output */

    if (date) {
      add(exif, 0x9000, 7, [0x30, 0x32, 0x33, 0x30], 4); /* ExifVersion 0230 */
      add(exif, 0x9003, 2, packAsciiFixed(date, 20), 20);
      add(exif, 0x9004, 2, packAsciiFixed(date, 20), 20);
    }

    if (gps) {
      add(gpsIfd, 0x0000, 1, [2, 3, 0, 0], 4);
      var lat = decToDms(gps.lat);
      var lon = decToDms(gps.lon);
      add(gpsIfd, 0x0001, 2, packAscii(lat.neg ? 'S' : 'N'), 2);
      add(gpsIfd, 0x0002, 5, packRats(lat.rats), 3);
      add(gpsIfd, 0x0003, 2, packAscii(lon.neg ? 'W' : 'E'), 2);
      add(gpsIfd, 0x0004, 5, packRats(lon.rats), 3);
      if (gps.alt != null && isFinite(Number(gps.alt))) {
        var alt = Number(gps.alt);
        add(gpsIfd, 0x0005, 1, [alt < 0 ? 1 : 0, 0, 0, 0], 1);
        add(gpsIfd, 0x0006, 5, packRats([{ num: Math.round(Math.abs(alt) * 100), den: 100 }]), 1);
      }
    }

    /* Pointers are added after we know offsets. */
    function ifdSize(tags) { return 2 + tags.length * 12 + 4; }
    function heapSize(tags) {
      var n = 0;
      for (var i = 0; i < tags.length; i++) if (tags[i].bytes.length > 4) n += tags[i].bytes.length;
      return n;
    }

    var tiffHeader = 8;
    var off = tiffHeader;
    var ifd0Off = off;
    off += ifdSize(ifd0) + 12 * ((exif.length ? 1 : 0) + (gpsIfd.length ? 1 : 0)); /* extra pointer tags */
    /* Recount: we will push ExifOffset / GPSOffset onto ifd0 before sizing. */
    /* Rebuild offsets properly below. */

    if (exif.length) add(ifd0, 0x8769, 4, [0, 0, 0, 0], 1); /* placeholder */
    if (gpsIfd.length) add(ifd0, 0x8825, 4, [0, 0, 0, 0], 1);

    off = tiffHeader;
    ifd0Off = off;
    var ifd0Heap = heapSize(ifd0);
    off += ifdSize(ifd0) + ifd0Heap;
    var exifOff = 0;
    var exifHeap = 0;
    if (exif.length) {
      exifOff = off;
      exifHeap = heapSize(exif);
      off += ifdSize(exif) + exifHeap;
    }
    var gpsOff = 0;
    if (gpsIfd.length) {
      gpsOff = off;
    }

    /* Fill pointer values (4-byte longs, inline). */
    for (var i = 0; i < ifd0.length; i++) {
      if (ifd0[i].tag === 0x8769) ifd0[i].bytes = le32(exifOff);
      if (ifd0[i].tag === 0x8825) ifd0[i].bytes = le32(gpsOff);
    }

    function writeIfd(tags, baseOff) {
      var bytes = [];
      /* sort tags as most cameras do */
      tags = tags.slice().sort(function (a, b) { return a.tag - b.tag; });
      pushBytes(bytes, le16(tags.length));
      var heap = [];
      var heapOff = baseOff + ifdSize(tags);
      for (var t = 0; t < tags.length; t++) {
        var g = tags[t];
        pushBytes(bytes, le16(g.tag));
        pushBytes(bytes, le16(g.type));
        pushBytes(bytes, le32(g.count));
        if (g.bytes.length <= 4) {
          var inline = g.bytes.slice();
          while (inline.length < 4) inline.push(0);
          pushBytes(bytes, inline);
        } else {
          pushBytes(bytes, le32(heapOff));
          pushBytes(heap, g.bytes);
          heapOff += g.bytes.length;
        }
      }
      pushBytes(bytes, le32(0)); /* next IFD */
      pushBytes(bytes, heap);
      return bytes;
    }

    var out = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
    pushBytes(out, [0x49, 0x49, 0x2A, 0x00]);
    pushBytes(out, le32(ifd0Off));
    pushBytes(out, writeIfd(ifd0, ifd0Off));
    if (exif.length) pushBytes(out, writeIfd(exif, exifOff));
    if (gpsIfd.length) pushBytes(out, writeIfd(gpsIfd, gpsOff));
    return new Uint8Array(out);
  }

  /**
   * Return a new JPEG with existing Exif APP1 removed and, if payload is
   * given, a new APP1 inserted right after SOI. Other segments are kept.
   */
  function spliceApp1(u8, payload) {
    if (!isJpeg(u8)) throw new Error('not a jpeg');
    var out = [0xFF, 0xD8];
    if (payload && payload.length) {
      var len = payload.length + 2;
      if (len > 0xFFFF) throw new Error('EXIF is too large');
      out.push(0xFF, 0xE1, (len >> 8) & 0xFF, len & 0xFF);
      pushBytes(out, payload);
    }
    var i = 2;
    var n = u8.length;
    while (i < n) {
      if (u8[i] !== 0xFF) {
        for (; i < n; i++) out.push(u8[i]);
        break;
      }
      var marker = u8[i + 1];
      if (marker === 0xDA || marker === 0xD9) {
        for (; i < n; i++) out.push(u8[i]);
        break;
      }
      if (marker === 0x00 || marker === 0xFF) { out.push(u8[i]); i += 1; continue; }
      if ((marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) {
        out.push(u8[i], u8[i + 1]);
        i += 2;
        continue;
      }
      if (i + 3 >= n) { out.push(u8[i], u8[i + 1]); break; }
      var seglen = (u8[i + 2] << 8) | u8[i + 3];
      var isExif = false;
      if (marker === 0xE1 && i + 9 < n) {
        isExif = u8[i + 4] === 0x45 && u8[i + 5] === 0x78 && u8[i + 6] === 0x69 && u8[i + 7] === 0x66;
      }
      if (isExif) {
        i += 2 + seglen;
        continue;
      }
      for (var j = 0; j < 2 + seglen && i + j < n; j++) out.push(u8[i + j]);
      i += 2 + seglen;
    }
    return new Uint8Array(out);
  }

  /**
   * Write a minimal EXIF block into a JPEG. Only date, camera (make/model)
   * and GPS are supported. Other original tags (MakerNote, lens, ICC, preview
   * thumbnail) are not copied. Pass an empty opts object to strip EXIF.
   * Returns a new Uint8Array.
   */
  function writeJpegExif(u8, opts) {
    var payload = buildExifPayload(opts || {});
    return spliceApp1(u8, payload);
  }

  function keepFromDescribe(info, keep) {
    keep = keep || {};
    if (!info) return {};
    var opts = {};
    if (keep.date && info.dateRaw) opts.date = info.dateRaw;
    if (keep.camera) {
      if (info.make) opts.make = info.make;
      if (info.model) opts.model = info.model;
    }
    if (keep.gps && info.gps) {
      opts.gps = { lat: info.gps.lat, lon: info.gps.lon, alt: info.gps.alt };
    }
    return opts;
  }

  var api = {
    isJpeg: isJpeg,
    parseJpeg: parseJpeg,
    jpegOrientation: jpegOrientation,
    jpegDimensions: jpegDimensions,
    sizeAfterOrientation: sizeAfterOrientation,
    applyOrientation: applyOrientation,
    tagVal: tagVal,
    describe: describe,
    formatExifDate: formatExifDate,
    toExifDate: toExifDate,
    formatGpsText: formatGpsText,
    dmsToDec: dmsToDec,
    decToDms: decToDms,
    buildExifPayload: buildExifPayload,
    writeJpegExif: writeJpegExif,
    keepFromDescribe: keepFromDescribe
  };

  root.ICExif = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
