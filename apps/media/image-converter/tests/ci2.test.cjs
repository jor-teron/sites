/* Image Converter CI2 — pure helper tests (no browser / no DOM). */
'use strict';

var path = require('path');
var P = require(path.join(__dirname, '..', 'ic_presets.js'));
var E = require(path.join(__dirname, '..', 'ic_edit.js'));

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

/* ---------- ratios and crop ---------- */
assert(E.parseRatio('1:1') === 1, 'ratio 1:1');
assert(Math.abs(E.parseRatio('4:5') - 0.8) < 1e-12, 'ratio 4:5');
assert(Math.abs(E.parseRatio('16:9') - 16 / 9) < 1e-12, 'ratio 16:9');
assert(Math.abs(E.parseRatio('passport') - 7 / 9) < 1e-12, 'passport is 7:9');
assert(E.parseRatio('none') === null, 'none is no ratio');
assert(E.parseRatio('') === null, 'empty ratio');

var c = E.centerCrop(2000, 1000, 1);
assert(Math.abs(c.w - 1000) < 1e-9 && Math.abs(c.h - 1000) < 1e-9, '1:1 crop on 2:1 image is 1000 square');
assert(Math.abs(c.x - 500) < 1e-9 && c.y === 0, '1:1 crop is centred');

var tall = E.centerCrop(1000, 2000, 16 / 9);
assert(tall.x === 0 && tall.w === 1000, 'wide crop in a tall image uses full width');
assert(tall.h > 500 && tall.h < 600, '16:9 height from 1000 width');

var full = E.centerCrop(100, 80, null);
assert(full.x === 0 && full.y === 0 && full.w === 100 && full.h === 80, 'no ratio is full frame');

var clamped = E.clampCrop({ x: -20, y: -10, w: 500, h: 500 }, 200, 100, 1);
assert(clamped.w === 100 && clamped.h === 100, 'clamp 1:1 shrinks to the short side');
assert(clamped.x >= 0 && clamped.y >= 0 && clamped.x + clamped.w <= 200 + 1e-9, 'clamp stays in bounds');

var moved = E.clampCrop({ x: 180, y: 0, w: 50, h: 50 }, 200, 100, 1);
assert(moved.x + moved.w <= 200 + 1e-9, 'clamp nudges a right-overflowing square back');

var frac = E.cropToFrac({ x: 50, y: 0, w: 100, h: 100 }, 200, 100);
assert(frac.x === 0.25 && frac.w === 0.5 && frac.h === 1, 'pixel crop to fractions');
var back = E.fracToCrop(frac, 200, 100);
assert(back.x === 50 && back.w === 100 && back.h === 100, 'fractions back to pixels');

var resolved = E.resolveCrop(2000, 1000, { cropRatio: '1:1' });
assert(Math.abs(resolved.w - 1000) < 1e-9, 'resolveCrop uses centred ratio');
var custom = E.resolveCrop(2000, 1000, { cropRatio: '1:1', crop: { x: 0, y: 0, w: 0.2, h: 0.4 } });
assert(Math.abs(custom.x) < 1e-9 && Math.abs(custom.w - 400) < 1e-6, 'resolveCrop honours a custom frac');

var rot = E.sizeAfterRotate(4000, 3000, 90);
assert(rot.width === 3000 && rot.height === 4000, 'rotate 90 swaps sides');
assert(E.sizeAfterRotate(4000, 3000, 180).width === 4000, 'rotate 180 keeps sides');
assert(E.sizeAfterRotate(10, 20, 270).width === 20, 'rotate 270 swaps');
assert(E.sizeAfterRotate(10, 20, -90).width === 20, 'negative 90 normalises to 270');

/* ---------- watermark placement ---------- */
var br = E.watermarkPosition(1000, 800, 200, 40, 'bottom-right', 20);
assert(br.x === 780 && br.y === 740, 'watermark bottom-right');
var tl = E.watermarkPosition(1000, 800, 200, 40, 'top-left', 20);
assert(tl.x === 20 && tl.y === 20, 'watermark top-left');
var mid = E.watermarkPosition(1000, 800, 200, 40, 'center', 20);
assert(mid.x === 400 && mid.y === 380, 'watermark centre');

var mark = E.watermarkSize(1000, 800, 400, 200, 20);
assert(mark.width === 200 && mark.height === 100, 'logo scale 20% of canvas width');

/* ---------- presets ---------- */
var list = P.builtinList();
assert(list.length === 5, 'five built-in presets');
var names = list.map(function (p) { return p.id; }).sort().join(',');
assert(names === 'email,instagram,passport,signature,whatsapp', 'builtin ids');

var pass = P.findBuiltin('passport');
assert(pass.width === 413 && pass.height === 531, 'passport 413x531');
assert(pass.cropRatio === 'passport' && pass.targetKb === 40, 'passport crop and 40 KB target');
assert(Math.abs(413 / 531 - 7 / 9) < 1e-6, 'passport pixels match 7:9');

var sig = P.findBuiltin('signature');
assert(sig.width === 300 && sig.height === 80 && sig.targetKb === 30, 'signature 300x80 under 30 KB');
assert(P.findBuiltin('whatsapp').longest === 1600, 'WhatsApp 1600');
assert(P.findBuiltin('instagram').cropRatio === '1:1', 'Instagram 1:1');
assert(P.findBuiltin('email').targetKb === 200, 'Email 200 KB target');

var applied = P.applyTo(pass, { format: 'png', quality: 10, pattern: '{name}' });
assert(applied.format === 'jpeg' && applied.width === 413, 'applyTo overwrites format and size');
assert(applied.pattern === '{name}', 'applyTo keeps unset keys');

var snap = P.snapshotSettings({ format: 'webp', quality: 60, cropRatio: '16:9' }, 'Trip');
assert(snap.name === 'Trip' && snap.builtin === false && snap.format === 'webp', 'snapshot stores name and keys');

var customList = P.sanitizeCustom([
  { name: '  Mine  ', format: 'png' },
  { name: '', format: 'jpeg' },
  { id: 'whatsapp', name: 'Clash' }
]);
assert(customList.length === 2, 'sanitize drops empty names');
assert(customList[0].name === 'Mine' && customList[0].id.indexOf('custom-') === 0, 'sanitize id and trim');
assert(customList[1].id !== 'whatsapp', 'sanitize will not reuse a built-in id');

if (failed) {
  console.error('\n' + failed + ' test(s) failed');
  process.exit(1);
}
console.log('\nAll CI2 helper tests passed');
