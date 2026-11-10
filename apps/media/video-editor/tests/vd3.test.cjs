/* Video Editor VD3 — pure helper tests (no browser / no DOM).
   Speed-adjusted sequence timing, crop/rotate output size, overlay visibility. */
'use strict';

var fs = require('fs');
var path = require('path');
var E = require(path.join(__dirname, '..', 've_edits.js'));
global.VEEdits = E;
var F = require(path.join(__dirname, '..', 've_fx.js'));
global.VEFx = F;
var S = require(path.join(__dirname, '..', 've_seq.js'));

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function clip(id, duration, extra) {
  var c = {
    id: id,
    fileId: 'f-' + id,
    name: id + '.mp4',
    duration: duration,
    width: 1920,
    height: 1080,
    thumb: '',
    segments: E.initialSegments(duration)
  };
  if (extra) Object.keys(extra).forEach(function (k) { c[k] = extra[k]; });
  return F.migrateClip(c);
}

// --- speed-adjusted sequence timing ---
var a = clip('a', 10, { speed: 2 });       // 10s source → 5s play
var b = clip('b', 8, { speed: 0.5 });      // 8s source → 16s play
b.segments = E.cutRange(E.initialSegments(8), 0, 2); // kept 6s source → 12s play
b = F.migrateClip(b);
var c = clip('c', 4, { speed: 1 });        // 4s play
var list = [a, b, c];

assert(Math.abs(S.clipKept(a) - 10) < 1e-9, 'clipKept is still source kept duration');
assert(Math.abs(S.clipPlayDuration(a) - 5) < 1e-9, '2× clip plays in half the kept time');
assert(Math.abs(S.clipPlayDuration(b) - 12) < 1e-9, '0.5× of 6s kept is 12s play');
assert(Math.abs(S.sequenceDuration(list) - 21) < 1e-9, 'sequenceDuration 5+12+4');

var layout = S.sequenceLayout(list);
assert(layout.total === 21 && layout.items[0].end === 5, 'layout A ends at 5s play');
assert(layout.items[1].start === 5 && layout.items[1].end === 17, 'layout B is 12s play');
assert(layout.items[2].start === 17 && layout.items[2].end === 21, 'layout C at the end');

var g0 = S.globalToLocal(0, list);
assert(g0.index === 0 && Math.abs(g0.sourceTime - 0) < 1e-9, 'global 0 → A@0');
var g2 = S.globalToLocal(2.5, list);
assert(g2.index === 0 && Math.abs(g2.sourceTime - 5) < 1e-9, '2×: 2.5s play → source 5');
var gB = S.globalToLocal(5, list);
assert(gB.index === 1 && Math.abs(gB.sourceTime - 2) < 1e-9, 'global 5 → B kept start @2');
var gBmid = S.globalToLocal(9, list);
assert(gBmid.index === 1 && Math.abs(gBmid.sourceTime - 4) < 1e-9, '0.5×: 4s play into B → +2s source');
var gC = S.globalToLocal(17, list);
assert(gC.index === 2 && Math.abs(gC.sourceTime - 0) < 1e-9, 'global 17 → C@0');
var gEnd = S.globalToLocal(21, list);
assert(gEnd.atEnd && gEnd.index === 2 && Math.abs(gEnd.sourceTime - 4) < 1e-9, 'end maps to last clip source end');
assert(Math.abs(S.localToGlobal(0, 5, list) - 2.5) < 1e-9, 'A source 5 → global 2.5 at 2×');
assert(Math.abs(S.localToGlobal(1, 4, list) - 9) < 1e-9, 'B source 4 → global 9 at 0.5×');

assert(F.normalizeSpeed(1.5) === 1.5, '1.5× is allowed');
assert(F.normalizeSpeed(3) === 1, 'unknown speed falls back to 1×');
assert(F.normalizeSpeed(0) === 1, '0 falls back to 1×');

// --- crop / rotate output size ---
var full = clip('full', 5, { width: 1920, height: 1080 });
var auto1080 = F.outputSize([full], 'auto');
assert(auto1080.width === 1280 && auto1080.height === 720, 'Auto 1080p caps at 1280 long side');

var rot90 = clip('r90', 5, { width: 1920, height: 1080, rotate: 90 });
var rotSize = F.outputSize([rot90], 'auto');
assert(rotSize.width === 720 && rotSize.height === 1280, 'Auto after 90° rotate is 720×1280');
assert(F.rotatedSize(1920, 1080, 90).width === 1080 && F.rotatedSize(1920, 1080, 90).height === 1920, 'rotatedSize swaps sides');
assert(F.rotatedSize(1920, 1080, 180).width === 1920, '180° keeps width');

var cropped = clip('cr', 5, { width: 1920, height: 1080, crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } });
var cropSize = F.clipCroppedSize(cropped);
assert(cropSize.width === 960 && cropSize.height === 540, 'half crop of 1920×1080 is 960×540');
var autoCrop = F.outputSize([cropped], 'auto');
assert(autoCrop.width === 960 && autoCrop.height === 540, 'Auto follows first-clip crop when under the cap');

var rotCrop = clip('rc', 5, { width: 1920, height: 1080, rotate: 90, crop: { x: 0, y: 0, w: 0.5, h: 1 } });
var rc = F.clipCroppedSize(rotCrop);
assert(rc.width === 540 && rc.height === 1920, 'crop is in post-rotate space (half of 1080×1920)');

var fixed = F.outputSize([full], '1080x1080');
assert(fixed.width === 1080 && fixed.height === 1080, '1080×1080 setting stays under the cap');
var wide = F.outputSize([rot90], '1280x720');
assert(wide.width === 1280 && wide.height === 720, 'fixed 1280×720 ignores the first clip');
var tall = F.outputSize([full], '720x1280');
assert(tall.width === 720 && tall.height === 1280, 'fixed 720×1280');
assert(F.normalizeOutput('nope') === 'auto', 'unknown output falls back to Auto');
assert(F.normalizeRotate(-90) === 270, 'rotate wraps');
assert(F.normalizeCrop({ x: -1, y: 0.9, w: 2, h: 0.01 }).w >= 0.02, 'crop min size 0.02');
assert(F.normalizeCrop({ x: 0.9, y: 0, w: 0.5, h: 1 }).x + F.normalizeCrop({ x: 0.9, y: 0, w: 0.5, h: 1 }).w <= 1 + 1e-9, 'crop stays in bounds');

// letterbox / even cap of an odd cropped size
var odd = clip('odd', 1, { width: 333, height: 111, crop: { x: 0, y: 0, w: 1, h: 1 } });
var oddOut = F.outputSize([odd], 'auto');
assert(oddOut.width % 2 === 0 && oddOut.height % 2 === 0, 'output size is even');

// --- overlay visibility timing ---
var o = F.migrateOverlay({
  id: 't1', text: 'Hello', start: 2, end: 6, fadeIn: 1, fadeOut: 1, preset: 'center'
});
assert(F.overlayAlpha(o, 1.9) === 0, 'before start is hidden');
assert(F.overlayAlpha(o, 6) === 0, 'at end is hidden');
assert(F.overlayAlpha(o, 2) === 0, 'at start fade-in is 0');
assert(Math.abs(F.overlayAlpha(o, 2.5) - 0.5) < 1e-9, 'fade in halfway');
assert(F.overlayAlpha(o, 4) === 1, 'middle is fully visible');
assert(Math.abs(F.overlayAlpha(o, 5.5) - 0.5) < 1e-9, 'fade out halfway');
assert(F.visibleOverlays([o], 4).length === 1, 'visibleOverlays includes mid');
assert(F.visibleOverlays([o], 0).length === 0, 'visibleOverlays empty outside');

var noFade = F.migrateOverlay({ id: 't2', start: 0, end: 2, fadeIn: 0, fadeOut: 0, text: 'X' });
assert(F.overlayAlpha(noFade, 0) === 1, 'no fade: visible at start');
assert(F.overlayAlpha(noFade, 1.999) === 1, 'no fade: visible just before end');

// migrate VD2 project (no fx / overlays) into version 3
var migrated = F.migrateState({
  fade: 0.5,
  clips: [{ id: 'old', fileId: 'f', name: 'old.mp4', duration: 5, width: 640, height: 360, segments: E.initialSegments(5) }]
});
assert(migrated.version === 3, 'project format version bumps to 3');
assert(migrated.outputSize === 'auto', 'missing outputSize becomes Auto');
assert(Array.isArray(migrated.overlays) && migrated.overlays.length === 0, 'missing overlays become []');
assert(migrated.clips[0].speed === 1 && migrated.clips[0].volume === 100, 'VD2 clip gets default speed and volume');
assert(migrated.clips[0].crop.w === 1 && migrated.clips[0].rotate === 0, 'VD2 clip gets full crop and 0 rotate');
assert(F.cssFilter(migrated.clips[0]).indexOf('brightness(1)') >= 0, 'default css filter is identity');
assert(F.hasFilter(migrated.clips[0]) === false, 'defaults have no colour filter');
assert(F.hasFilter(clip('fx', 1, { brightness: 120 })) === true, 'raised brightness is a filter');
assert(F.audioGain({ volume: 200, mute: false }, 1) === 2, 'volume 200% → gain 2');
assert(F.audioGain({ volume: 50, mute: true }, 1) === 0, 'mute zeros the gain');
assert(Math.abs(F.audioGain({ volume: 100, mute: false }, 0.5) - 0.5) < 1e-9, 'gain follows fade alpha');

var bigSize = F.migrateOverlay({ size: 72 });
assert(Math.abs(bigSize.size - 72 / 720) < 1e-9, 'size > 1 treated as px / 720');

// HTML sanity for VD3 controls
var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var main = fs.readFileSync(path.join(__dirname, '..', 've_main.js'), 'utf8');
assert(/<title>Video Editor VD3<\/title>/.test(html), 'title VD3');
assert((html.match(/\?v=VD3/g) || []).length >= 13, 'every asset uses ?v=VD3');
assert(/var RELEASE = 'VD3'/.test(main), 'RELEASE VD3');
assert(/id="fxBrightness"/.test(html) && /id="cropLayer"/.test(html), 'filter sliders and crop layer');
assert(/id="speedSeg"/.test(html) && /id="fxVolume"/.test(html), 'speed and volume controls');
assert(/id="addTitleBtn"/.test(html) && /id="overlayLayer"/.test(html), 'title overlays');
assert(/id="snapBtn"/.test(html) && /id="helpBtn"/.test(html), 'save frame and shortcuts');
assert(/id="outputSize"/.test(html), 'output size setting');
assert(!/\?v=VD2/.test(html) && !/\?v=VD1/.test(html), 'no leftover older ?v= tags');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('All VD3 tests passed');
