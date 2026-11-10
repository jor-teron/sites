/* Image Converter — ic_exif.js: JPEG EXIF walk (orientation now; tags for CI3). CI1 */
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

  var api = {
    isJpeg: isJpeg,
    parseJpeg: parseJpeg,
    jpegOrientation: jpegOrientation,
    jpegDimensions: jpegDimensions,
    sizeAfterOrientation: sizeAfterOrientation,
    applyOrientation: applyOrientation,
    tagVal: tagVal
  };

  root.ICExif = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
