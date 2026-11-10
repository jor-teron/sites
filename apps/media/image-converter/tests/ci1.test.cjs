/* Image Converter CI1 — pure helper tests (no browser / no DOM). */
'use strict';

var path = require('path');
var H = require(path.join(__dirname, '..', 'ic_helpers.js'));
var Z = require(path.join(__dirname, '..', 'ic_zip.js'));
var E = require(path.join(__dirname, '..', 'ic_exif.js'));

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

/* ---------- resize math ---------- */
var same = H.computeSize(1920, 1080, 'none', {});
assert(same.width === 1920 && same.height === 1080, 'none keeps size');

var long = H.computeSize(4000, 3000, 'longest', { longest: 2000, noEnlarge: true });
assert(long.width === 2000 && long.height === 1500, 'longest side 2000 downscales 4:3');

var noUp = H.computeSize(800, 600, 'longest', { longest: 2000, noEnlarge: true });
assert(noUp.width === 800 && noUp.height === 600, 'longest does not enlarge by default');

var yesUp = H.computeSize(800, 600, 'longest', { longest: 1600, noEnlarge: false });
assert(yesUp.width === 1600 && yesUp.height === 1200, 'longest can enlarge when allowed');

var half = H.computeSize(1000, 500, 'percent', { percent: 50 });
assert(half.width === 500 && half.height === 250, 'percent 50');

var exactFit = H.computeSize(2000, 1000, 'exact', { width: 800, height: 800, keepAspect: true, noEnlarge: true });
assert(exactFit.width === 800 && exactFit.height === 400, 'exact keep-aspect fits inside box');

var stretch = H.computeSize(2000, 1000, 'exact', { width: 100, height: 50, keepAspect: false });
assert(stretch.width === 100 && stretch.height === 50, 'exact stretch ignores aspect');

var tiny = H.computeSize(10, 10, 'percent', { percent: 1 });
assert(tiny.width === 1 && tiny.height === 1, 'sizes clamp to at least 1');

/* ---------- format / names ---------- */
assert(H.formatOf('JPG') === 'jpeg', 'formatOf JPG');
assert(H.mimeOf('jpeg') === 'image/jpeg', 'mimeOf jpeg');
assert(H.extOfFormat('jpeg') === 'jpg', 'ext jpg');
assert(H.extOfFormat('webp') === 'webp', 'ext webp');
assert(H.isImageFile({ type: 'image/png', name: 'a.bin' }) === true, 'isImageFile by type');
assert(H.isImageFile({ type: '', name: 'shot.JPEG' }) === true, 'isImageFile by ext');
assert(H.isImageFile({ type: 'video/mp4', name: 'a.mp4' }) === false, 'rejects video');
assert(H.isHeicFile({ type: 'image/heic', name: 'a.heic' }) === true, 'heic by type');
assert(H.isHeicFile({ name: 'IMG_0001.HEIF' }) === true, 'heic by ext');
assert(H.isImageFile({ name: 'IMG_0001.HEIC', type: 'image/heic' }) === false, 'heic is not a supported image');
assert(H.stemOf('holiday.photo.jpg') === 'holiday.photo', 'stem keeps inner dots');
assert(H.basename('C\\\\pics\\\\a.png') === 'a.png', 'basename strips windows path');

assert(H.applyPattern('{name}_{n}', 'trip.jpg', 1, 12, 'jpg') === 'trip_01.jpg', 'pattern pads to 2 for 12 files');
assert(H.applyPattern('{name}_{n}', 'trip.jpg', 3, 150, 'webp') === 'trip_003.webp', 'pattern pads to 3 for 150 files');
assert(H.applyPattern('trip_{nnn}', 'x.png', 7, 9, 'jpg') === 'trip_007.jpg', 'fixed {nnn} width');
assert(H.applyPattern('{name}', 'cat.png', 1, 1, 'webp') === 'cat.webp', 'pattern adds/replaces extension');
assert(H.applyPattern('', 'x.jpg', 1, 1, 'png') === 'x_01.png', 'empty pattern falls back');
assert(H.applyPattern('a/b:{name}', 'z.jpg', 1, 1, 'jpg') === 'a_b_z.jpg', 'sanitize path chars');

var uniq = H.uniqueNames(['a.jpg', 'a.jpg', 'b.png']);
assert(uniq[0] === 'a.jpg' && uniq[1] === 'a_2.jpg' && uniq[2] === 'b.png', 'uniqueNames suffixes collisions');

assert(H.formatBytes(512) === '512 B', 'formatBytes bytes');
assert(H.formatBytes(2048) === '2.0 KB', 'formatBytes KB');
assert(H.kbToBytes(100) === 100 * 1024, '100 KB in bytes');
assert(H.savedLabel(1000, 250).indexOf('saved') === 0, 'saved label');
assert(H.savedLabel(100, 200).indexOf('grew') === 0, 'grew label');

/* ---------- quality search ---------- */
function linearEncode(q) {
  /* size 2000 at q=0, 12000 at q=1 */
  return Math.round(2000 + q * 10000);
}

return H.findQuality(linearEncode, 7000, { maxTries: 8 }).then(function (r) {
  assert(r.overTarget === false, 'search fits a mid target');
  assert(r.size <= 7000, 'search size is under target');
  assert(r.quality > 0.4 && r.quality < 0.6, 'search quality near 0.5 for 7000: got ' + r.quality);
  assert(r.tries >= 2 && r.tries <= 8, 'search attempt count');
  return H.findQuality(linearEncode, 20000, { maxTries: 8 });
}).then(function (r) {
  assert(r.quality === 1 && r.overTarget === false, 'already under at max quality');
  return H.findQuality(linearEncode, 100, { maxTries: 8 });
}).then(function (r) {
  assert(r.overTarget === true && r.quality === 0.01, 'over target even at min quality');
  return H.findQuality(function (q) {
    return Promise.resolve({ size: Math.round(1000 / q), payload: 'q' + q });
  }, 2500, { maxTries: 8 });
}).then(function (r) {
  assert(r.size <= 2500, 'async encoder under target');
  assert(r.payload && String(r.payload).indexOf('q') === 0, 'payload is kept');

  /* ---------- zip store ---------- */
  var hello = new TextEncoder().encode('hello zip');
  var pngish = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
  var zip = Z.writeStoreZip([
    { name: 'folder/hello.txt', data: hello },
    { name: 'pic.png', data: pngish }
  ], new Date('2026-01-15T12:30:00'));
  assert(zip[0] === 0x50 && zip[1] === 0x4b && zip[2] === 0x03 && zip[3] === 0x04, 'zip local header signature');
  var endSig = zip.length - 22;
  var dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  assert(dv.getUint32(endSig, true) === 0x06054b50, 'zip end-of-central signature');
  assert(dv.getUint16(endSig + 8, true) === 2, 'zip entry count');
  var entries = Z.readStoreZip(zip);
  assert(entries.length === 2, 'read two entries');
  assert(entries[0].name === 'folder/hello.txt', 'utf8 path kept');
  assert(Buffer.from(entries[0].data).toString() === 'hello zip', 'stored payload round-trips');
  assert(entries[1].name === 'pic.png' && entries[1].data.length === pngish.length, 'second entry bytes');
  assert(Z.crc32(hello) === entries[0].crc, 'crc32 matches stored crc');
  assert(Z.crc32(new Uint8Array(0)) === 0, 'crc32 of empty is 0');

  /* known CRC of "123456789" is 0xCBF43926 */
  var nine = new TextEncoder().encode('123456789');
  assert(Z.crc32(nine) === 0xCBF43926, 'crc32 of 123456789');

  /* ---------- EXIF orientation ---------- */
  var jpeg6 = makeJpegWithExif(6, 40, 20);
  assert(E.isJpeg(jpeg6), 'fixture is jpeg');
  var parsed = E.parseJpeg(jpeg6);
  assert(parsed && parsed.orientation === 6, 'orientation 6 from EXIF');
  assert(parsed.width === 40 && parsed.height === 20, 'SOF dimensions');
  assert(E.jpegOrientation(jpeg6) === 6, 'jpegOrientation 6');
  var swapped = E.sizeAfterOrientation(40, 20, 6);
  assert(swapped.width === 20 && swapped.height === 40, 'orientation 6 swaps sides');
  var jpeg1 = makeJpegWithExif(1, 8, 8);
  assert(E.jpegOrientation(jpeg1) === 1, 'orientation 1');
  assert(E.parseJpeg(new Uint8Array([0x89, 0x50])) === null, 'non-jpeg parse is null');
  var plain = makePlainJpeg(16, 10);
  assert(E.parseJpeg(plain).orientation === 1, 'jpeg with no EXIF defaults to 1');
  assert(E.jpegDimensions(plain).width === 16, 'SOF-only dimensions');

  /* applyOrientation matrix: just check it returns swapped size and does not throw */
  var calls = [];
  var fakeCtx = { transform: function () { calls.push(Array.prototype.slice.call(arguments)); } };
  var outSz = E.applyOrientation(fakeCtx, 40, 20, 6);
  assert(outSz.width === 20 && outSz.height === 40, 'applyOrientation 6 output size');
  assert(calls.length === 1 && calls[0][0] === 0 && calls[0][1] === 1, 'applyOrientation 6 matrix');

  if (failed) {
    console.error('\n' + failed + ' test(s) failed');
    process.exit(1);
  }
  console.log('\nAll CI1 helper tests passed');
}).catch(function (err) {
  console.error('ERROR:', err && err.stack || err);
  process.exit(1);
});

/* Minimal JPEG + APP1 Exif with Orientation, plus SOF0 dimensions. Not a
 * displayable image; enough for the parser. */
function makeJpegWithExif(orient, width, height) {
  var tiff = [];
  function pushU16(arr, v, le) {
    if (le) { arr.push(v & 0xFF, (v >> 8) & 0xFF); }
    else { arr.push((v >> 8) & 0xFF, v & 0xFF); }
  }
  function pushU32(arr, v, le) {
    if (le) { arr.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF); }
    else { arr.push((v >> 24) & 0xFF, (v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF); }
  }
  /* TIFF header II, magic 0x002A, IFD0 at 8 */
  tiff.push(0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00);
  pushU16(tiff, 1, true); /* one tag */
  pushU16(tiff, 0x0112, true);
  pushU16(tiff, 3, true); /* SHORT */
  pushU32(tiff, 1, true);
  pushU16(tiff, orient, true);
  pushU16(tiff, 0, true); /* pad value */
  pushU32(tiff, 0, true); /* next IFD */

  var exifBody = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00].concat(tiff);
  var app1Len = exifBody.length + 2;
  var sof = [
    0xFF, 0xC0, 0x00, 0x0B,
    0x08,
    (height >> 8) & 0xFF, height & 0xFF,
    (width >> 8) & 0xFF, width & 0xFF,
    0x01, 0x01, 0x11, 0x00
  ];
  var bytes = [0xFF, 0xD8, 0xFF, 0xE1, (app1Len >> 8) & 0xFF, app1Len & 0xFF]
    .concat(exifBody)
    .concat(sof)
    .concat([0xFF, 0xD9]);
  return new Uint8Array(bytes);
}

function makePlainJpeg(width, height) {
  var sof = [
    0xFF, 0xC0, 0x00, 0x0B,
    0x08,
    (height >> 8) & 0xFF, height & 0xFF,
    (width >> 8) & 0xFF, width & 0xFF,
    0x01, 0x01, 0x11, 0x00
  ];
  return new Uint8Array([0xFF, 0xD8].concat(sof).concat([0xFF, 0xD9]));
}
