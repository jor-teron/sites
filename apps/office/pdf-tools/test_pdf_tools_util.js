/* Node tests for PDF Tools P2/P3 helpers (pdf-tools_util.js, pdf-tools_zip.js).
   Run: node test_pdf_tools_util.js
   No DOM, no jsdom, no browser. */
'use strict';

var U = require('./pdf-tools_util.js');
var Z = require('./pdf-tools_zip.js');
var fails = [];

function eq(name, a, b) {
  var sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) fails.push(name + ' got ' + sa + ' expected ' + sb);
  else console.log('ok', name);
}

function ok(name, cond, detail) {
  if (cond) console.log('ok', name);
  else fails.push(name + (detail ? (' ' + detail) : ''));
}

// ---- names ----
eq('fileBase strips pdf', U.fileBase('Report.PDF'), 'Report');
eq('fileBase empty', U.fileBase(''), 'document');
eq('fileBase dots', U.fileBase('my.file.pdf'), 'my.file');
eq('fileBase jpg', U.fileBase('Photo.JPG'), 'Photo');
eq('fileBase png', U.fileBase('scan.png'), 'scan');
eq('shortName short', U.shortName('Notes', 10), 'Notes');
ok('shortName trims', U.shortName('AVeryLongName', 10).length === 10);
eq('color cycles', U.colorFor(8), U.colorFor(0));
eq('color 0', U.colorFor(0), '#2f6fe4');

// ---- parseRanges ----
eq('parse 1-3, 7', U.parseRanges('1-3, 7', 10).groups, [[1, 2, 3], [7]]);
eq('parse spaces', U.parseRanges('  2 - 4 ; 9  ', 9).groups, [[2, 3, 4], [9]]);
eq('parse single', U.parseRanges('5', 10).groups, [[5]]);
eq('parse swap 3-1', U.parseRanges('3-1', 10).groups, [[1, 2, 3]]);
eq('parse en-dash', U.parseRanges('1–2', 5).groups, [[1, 2]]);
ok('parse empty fails', U.parseRanges('', 10).ok === false);
ok('parse junk fails', U.parseRanges('1-3-5', 10).ok === false);
ok('parse zero fails', U.parseRanges('0, 2', 10).ok === false);
ok('parse overshoot fails', U.parseRanges('1-3, 12', 10).ok === false);
ok('parse no pages fails', U.parseRanges('1', 0).ok === false);
ok('parse letters fails', /Can.t read/.test(U.parseRanges('abc', 10).error || ''));
eq('parse all pages', U.parseRanges('1-10', 10).groups, [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]]);
eq('parse overlap allowed', U.parseRanges('1-3, 2-4', 10).groups, [[1, 2, 3], [2, 3, 4]]);

// ---- plans ----
eq('singles 3', U.planSingles(3).groups, [[1], [2], [3]]);
ok('singles 0 fails', U.planSingles(0).ok === false);
eq('every 2 of 5', U.planEvery(5, 2).groups, [[1, 2], [3, 4], [5]]);
eq('every 10 of 4', U.planEvery(4, 10).groups, [[1, 2, 3, 4]]);
ok('every 0 fails', U.planEvery(5, 0).ok === false);
ok('every 1.5 fails', U.planEvery(5, 1.5).ok === false);
ok('hint zip', /zip/.test(U.planHint([[1], [2]])));
ok('hint one file', /1 file/.test(U.planHint([[1, 2, 3]])));

// ---- part names ----
eq('part single', U.partName('Report', [7]), 'Report-p007.pdf');
eq('part range', U.partName('Report', [1, 2, 3]), 'Report-p001-003.pdf');
eq('part sparse', U.partName('Report', [1, 3, 5], 0), 'Report-part01.pdf');
eq('part wide', U.partName('A', [1000]), 'A-p1000.pdf');

// ---- sizes ----
var srcPdf = { kind: 'pdf', sizes: [{ w: 595, h: 842, baseRot: 0 }] };
eq('display upright', U.displaySize(srcPdf, { src: 0, rot: 0 }), { w: 595, h: 842 });
eq('display extra 90', U.displaySize(srcPdf, { src: 0, rot: 90 }), { w: 842, h: 595 });
var srcRot = { kind: 'pdf', sizes: [{ w: 595, h: 842, baseRot: 90 }] };
eq('display base 90', U.displaySize(srcRot, { src: 0, rot: 0 }), { w: 842, h: 595 });
eq('display base 90 + 90', U.displaySize(srcRot, { src: 0, rot: 90 }), { w: 595, h: 842 });
var blank = { kind: 'blank', width: 400, height: 300, id: 2 };
eq('display blank', U.displaySize(blank, { src: 0, rot: 0 }), { w: 400, h: 300 });
eq('neighbour last', U.neighbourSize(
  [{ id: 1, kind: 'pdf', sizes: [{ w: 200, h: 100, baseRot: 0 }] }],
  [{ id: 1, srcId: 1, src: 0, rot: 0 }],
  1
), { w: 200, h: 100 });
eq('neighbour empty is A4', U.neighbourSize([], [], 0), U.PAPER.a4);

eq('pageKey', U.pageKey({ srcId: 3, src: 4 }), '3:4');


// ---- image layout (P3) ----
ok('mm 25.4 is 72pt', Math.abs(U.ptFromMm(25.4) - 72) < 1e-9);
var a4sq = U.imagePageLayout(100, 100, { paper: 'a4', marginMm: 0, landscape: false });
ok('A4 square fits width', Math.abs(a4sq.w - U.PAPER.a4.w) < 0.01 && Math.abs(a4sq.h - U.PAPER.a4.w) < 0.01);
ok('A4 square centred', Math.abs(a4sq.x) < 0.01 && Math.abs(a4sq.y - (U.PAPER.a4.h - a4sq.h) / 2) < 0.01);
ok('A4 page size', Math.abs(a4sq.pageW - U.PAPER.a4.w) < 0.01 && Math.abs(a4sq.pageH - U.PAPER.a4.h) < 0.01);
var land = U.imagePageLayout(200, 100, { paper: 'a4', marginMm: 0, landscape: true });
ok('landscape swaps paper', Math.abs(land.pageW - U.PAPER.a4.h) < 0.01 && Math.abs(land.pageH - U.PAPER.a4.w) < 0.01);
ok('landscape wide image fills height or width', land.w <= land.pageW + 0.01 && land.h <= land.pageH + 0.01);
ok('contain keeps aspect 2:1', Math.abs(land.w / land.h - 2) < 1e-9);
var m20 = U.imagePageLayout(1000, 1000, { paper: 'a4', marginMm: 20 });
ok('20mm margin inset', Math.abs(m20.margin - U.ptFromMm(20)) < 1e-9 && m20.x >= m20.margin - 0.01);
ok('20mm image inside', m20.x + m20.w <= m20.pageW - m20.margin + 0.01);
var letter = U.imagePageLayout(100, 200, { paper: 'letter', marginMm: 0 });
ok('letter page', Math.abs(letter.pageW - U.PAPER.letter.w) < 0.01 && Math.abs(letter.pageH - U.PAPER.letter.h) < 0.01);
var fit = U.imagePageLayout(1500, 1500, { paper: 'fit', marginMm: 0, dpi: 150 });
ok('fit 150dpi 1500px is 720pt', Math.abs(fit.pageW - 720) < 0.05 && Math.abs(fit.pageH - 720) < 0.05);
ok('fit image fills page', Math.abs(fit.w - 720) < 0.05 && Math.abs(fit.x) < 0.05);
var fitM = U.imagePageLayout(1500, 1500, { paper: 'fit', marginMm: 10, dpi: 150 });
ok('fit plus margin larger page', fitM.pageW > fit.pageW && Math.abs(fitM.margin - U.ptFromMm(10)) < 1e-9);
var tall = U.imagePageLayout(100, 400, { paper: 'a4', marginMm: 0 });
ok('tall image fills height', Math.abs(tall.h - U.PAPER.a4.h) < 0.01 && tall.w < tall.pageW);
ok('wide not cover', tall.w / tall.h - 100 / 400 < 1e-9);
var cap = U.imagePageLayout(20000, 20000, { paper: 'fit', marginMm: 0, dpi: 72 });
ok('fit caps long side at 1440', cap.pageW <= 1440.01 && cap.pageH <= 1440.01);
eq('image mime png', U.imageMime({ name: 'a.PNG', type: '' }), 'image/png');
eq('image mime jpg', U.imageMime({ name: 'a.jpg', type: 'image/jpeg' }), 'image/jpeg');
ok('isImageFile png', U.isImageFile({ name: 'x.png', type: '' }));
ok('not image pdf', !U.isImageFile({ name: 'x.pdf', type: 'application/pdf' }));
eq('image part name', U.imagePartName('Report', 7, 'jpg'), 'Report-p007.jpg');
ok('renderScale caps', U.renderScale(4000, 2000, 1600) === 1600 / 4000);
ok('renderScale small up to 4', U.renderScale(100, 80, 1600) === 4);

// displaySize uses image layout page, not pixel size
eq('display image layout', U.displaySize(
  { kind: 'image', width: 3000, height: 2000, layout: { pageW: 595, pageH: 842 } },
  { src: 0, rot: 0 }
), { w: 595, h: 842 });
eq('display image layout 90', U.displaySize(
  { kind: 'image', layout: { pageW: 595, pageH: 842 } },
  { src: 0, rot: 90 }
), { w: 842, h: 595 });

// ---- zip (stored, local headers) ----
ok('crc32 empty', Z.crc32(new Uint8Array(0)) === 0);
ok('crc32 "123456" known', Z.crc32(Uint8Array.from(Buffer.from('123456'))) === 0x0972d361);
var bytes = Z.buildBytes([{ name: 'a/p001.pdf', data: Uint8Array.from([1, 2, 3, 4]) }]);
function u32(buf, off) { return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24); }
function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
ok('zip local sig', (u32(bytes, 0) >>> 0) === 0x04034b50);
ok('zip stored method', u16(bytes, 8) === 0);
ok('zip eof sig', (u32(bytes, bytes.length - 22) >>> 0) === 0x06054b50);
ok('zip one entry', u16(bytes, bytes.length - 14) === 1);
ok('zip payload inside', bytes[30 + 'a/p001.pdf'.length] === 1 && bytes[30 + 'a/p001.pdf'.length + 3] === 4);

console.log('');
if (fails.length) {
  console.error('FAILED ' + fails.length);
  fails.forEach((f) => console.error('  ', f));
  process.exit(1);
}
console.log('All checks passed.');
