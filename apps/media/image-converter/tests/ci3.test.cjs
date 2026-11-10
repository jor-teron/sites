/* Image Converter CI3 — pure helper tests (no browser / no DOM). */
'use strict';

var path = require('path');
var E = require(path.join(__dirname, '..', 'ic_exif.js'));
var I = require(path.join(__dirname, '..', 'ic_ico.js'));

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
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

/* 1x1 red RGBA PNG generated with Pillow */
var PNG1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cfc0f01f00050001ff89993d1d0000000049454e44ae426082',
  'hex'
);
/* another tiny PNG (same pixels is fine; we only check packing) */
var PNG16 = new Uint8Array(PNG1); /* used as a stand-in body for a 16 px entry */

/* ---------- dates / GPS helpers ---------- */
assert(E.toExifDate('2024-11-10T15:04:00') === '2024:11:10 15:04:00', 'toExifDate from ISO');
assert(E.toExifDate('2024:11:10 15:04:00') === '2024:11:10 15:04:00', 'toExifDate already EXIF');
assert(E.formatExifDate('2024:11:10 15:04:00') === '2024-11-10 15:04:00', 'formatExifDate');
assert(E.formatGpsText(26.1445, 91.7362) === '26.14450° N, 91.73620° E', 'GPS text NE');
assert(E.formatGpsText(-33.86, -151.2).indexOf('S') > 0 && E.formatGpsText(-33.86, -151.2).indexOf('W') > 0, 'GPS text SW');

var dms = E.decToDms(-33.8688);
assert(dms.neg === true && dms.rats[0].num === 33, 'decToDms south degrees');
var dec = E.dmsToDec(dms.rats, 'S');
assert(Math.abs(dec + 33.8688) < 1e-6, 'dmsToDec round-trip south');

/* ---------- write / parse round-trip ---------- */
var src = makePlainJpeg(32, 20);
var written = E.writeJpegExif(src, {
  date: '2024:11:10 15:04:00',
  make: 'Canon',
  model: 'EOS 80D',
  gps: { lat: 26.1445, lon: 91.7362, alt: 54.2 }
});
assert(E.isJpeg(written), 'written file is jpeg');
var info = E.describe(written);
assert(info && info.make === 'Canon' && info.model === 'EOS 80D', 'camera written');
assert(info.camera === 'Canon EOS 80D', 'camera display name');
assert(info.dateRaw === '2024:11:10 15:04:00', 'date written');
assert(info.width === 32 && info.height === 20, 'SOF size preserved');
assert(info.hasGps === true, 'GPS present');
assert(Math.abs(info.gps.lat - 26.1445) < 1e-6, 'lat round-trip');
assert(Math.abs(info.gps.lon - 91.7362) < 1e-6, 'lon round-trip');
assert(Math.abs(info.gps.alt - 54.2) < 1e-6, 'alt round-trip');

var south = E.writeJpegExif(src, { gps: { lat: -33.8688, lon: 151.2093 } });
var southInfo = E.describe(south);
assert(southInfo.hasGps && southInfo.gps.lat < 0 && southInfo.gps.lon > 0, 'southern hemisphere');
assert(Math.abs(southInfo.gps.lat + 33.8688) < 1e-5, 'south lat value');

var west = E.writeJpegExif(src, { gps: { lat: 40.7, lon: -74.0 } });
var westInfo = E.describe(west);
assert(westInfo.gps.lon < 0, 'western hemisphere');

var onlyDate = E.writeJpegExif(src, E.keepFromDescribe(info, { date: true }));
var only = E.describe(onlyDate);
assert(only.dateRaw === '2024:11:10 15:04:00' && !only.camera && !only.hasGps, 'keep only the date');

var keepCam = E.keepFromDescribe(info, { camera: true });
assert(keepCam.make === 'Canon' && keepCam.model === 'EOS 80D' && !keepCam.date, 'keep only camera');

var stripped = E.writeJpegExif(written, {});
var gone = E.describe(stripped);
assert(gone && !gone.camera && !gone.date && !gone.hasGps, 'empty opts strips EXIF');
assert(gone.width === 32, 'strip keeps SOF');

/* Replacing an existing EXIF block */
var replaced = E.writeJpegExif(written, { date: '2020:01:02 03:04:05', make: 'Nikon' });
var rinfo = E.describe(replaced);
assert(rinfo.dateRaw === '2020:01:02 03:04:05' && rinfo.make === 'Nikon' && !rinfo.hasGps, 'replace existing EXIF');

assert(E.describe(new Uint8Array([1, 2, 3])) === null, 'describe non-jpeg is null');
assert(E.buildExifPayload({}) === null, 'empty payload is null');

/* ---------- ICO with PNG entries ---------- */
assert(I.isPng(PNG1) === true, 'fixture is PNG');
assert(I.DEFAULT_SIZES.join(',') === '16,32,48,64,128,256', 'default icon sizes');

var ico = I.writeIco([
  { width: 1, height: 1, data: PNG1 },
  { width: 16, height: 16, data: PNG16 },
  { width: 256, height: 256, data: PNG1 }
]);
assert(ico[0] === 0 && ico[1] === 0 && ico[2] === 1 && ico[3] === 0, 'ico reserved+type');
assert(ico[4] === 3 && ico[5] === 0, 'ico count 3');
assert(ico[6] === 1 && ico[7] === 1, 'first entry 1x1');
assert(ico[6 + 16] === 16, 'second entry width 16');
assert(ico[6 + 32] === 0 && ico[6 + 33] === 0, '256 stored as 0 in the directory');

var read = I.readIco(ico);
assert(read.length === 3, 'read three icon images');
assert(read[0].width === 1 && read[0].isPng === true, '1x1 png entry');
assert(read[1].width === 16 && read[1].data.length === PNG16.length, '16 px body');
assert(read[2].width === 256 && read[2].height === 256, '0 in directory means 256');
assert(Buffer.from(read[0].data).equals(Buffer.from(PNG1)), 'png payload round-trips');

var one = I.writeIco([{ width: 32, height: 32, data: PNG1 }]);
var oneRead = I.readIco(one);
assert(oneRead.length === 1 && oneRead[0].width === 32 && oneRead[0].isPng, 'single 32 px ico');

var threw = false;
try { I.writeIco([]); } catch (e) { threw = true; }
assert(threw, 'writeIco rejects an empty list');

if (failed) {
  console.error('\n' + failed + ' test(s) failed');
  process.exit(1);
}
console.log('\nAll CI3 helper tests passed');
