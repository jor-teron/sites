/* Video Editor VD1 — pure helper tests (no browser / no DOM). */
'use strict';

var fs = require('fs');
var path = require('path');
var H = require(path.join(__dirname, '..', 've_helpers.js'));
var E = require(path.join(__dirname, '..', 've_edits.js'));

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

// formatTime / parseTime
assert(H.formatTime(0) === '0:00.0', 'formatTime 0');
assert(H.formatTime(5) === '0:05.0', 'formatTime 5s');
assert(H.formatTime(65.3) === '1:05.3', 'formatTime 65.3');
assert(H.formatTime(125.9) === '2:05.9', 'formatTime 125.9');
assert(H.formatTime(-1) === '0:00.0', 'formatTime negative clamps');
assert(H.formatTime(3600) === '1:00:00.0', 'formatTime 1 hour');
assert(H.formatTime(3723.4) === '1:02:03.4', 'formatTime 1:02:03.4');
assert(H.parseTime('0:05.0') === 5, 'parse mm:ss.s');
assert(H.parseTime('1:05.3') === 65.3, 'parse 1:05.3');
assert(H.parseTime('65.3') === 65.3, 'parse plain seconds');
assert(H.parseTime('2:00') === 120, 'parse mm:ss');
assert(H.parseTime('1:02:03.4') === 3723.4, 'parse h:mm:ss.s');
assert(isNaN(H.parseTime('')), 'parse empty NaN');
assert(isNaN(H.parseTime('1:99')), 'parse bad seconds NaN');
assert(H.formatTime(H.parseTime('0:05.5')) === '0:05.5', 'round-trip');
assert(H.formatTime(H.parseTime('1:02:03.4')) === '1:02:03.4', 'hour round-trip');

// clampRange
var c1 = H.clampRange(10, 10, 60, 0.1, 'start');
assert(c1.start <= c1.end - 0.1 + 1e-9, 'start cannot cross end');
var c3 = H.clampRange(-5, 100, 40, 0.1, 'both');
assert(c3.start === 0 && c3.end === 40, 'clamp to duration');
assert(H.timeToRatio(30, 60) === 0.5, 'timeToRatio mid');
assert(H.pixelToTime(100, 200, 40) === 20, 'pixelToTime mid');
assert(Math.abs(H.frameStep(30) - 1 / 30) < 1e-12, 'frameStep 30 fps');
assert(H.frameStep(0) === 1 / 30, 'frameStep falls back to 30');

// exportName / isVideoFile
assert(H.exportName('holiday.mp4', 'video/webm;codecs=vp9,opus') === 'holiday_edited.webm', 'exportName webm');
assert(H.exportName('holiday.mov', 'video/mp4') === 'holiday_edited.mp4', 'exportName mp4');
assert(H.exportName('/tmp/path/clip.webm', 'video/webm') === 'clip_edited.webm', 'exportName strips path');
assert(H.exportName('', 'video/webm') === 'video_edited.webm', 'exportName default');
assert(H.isVideoFile({ type: 'video/mp4', name: 'a.bin' }) === true, 'isVideoFile by type');
assert(H.isVideoFile({ type: '', name: 'a.webm' }) === true, 'isVideoFile by extension');
assert(H.isVideoFile({ type: 'image/png', name: 'a.png' }) === false, 'isVideoFile rejects images');

// cut / keep / removed
var full = E.initialSegments(10);
assert(full.length === 1 && full[0].start === 0 && full[0].end === 10, 'initial 0..10');
var cutMid = E.cutRange(full, 3, 5);
assert(cutMid.length === 2, 'cut mid splits into 2');
assert(cutMid[0].start === 0 && cutMid[0].end === 3, 'cut left piece');
assert(cutMid[1].start === 5 && cutMid[1].end === 10, 'cut right piece');
assert(Math.abs(E.keptDuration(cutMid) - 8) < 1e-9, 'kept duration after mid cut');
var gone = E.removedRanges(cutMid, 10);
assert(gone.length === 1 && gone[0].start === 3 && gone[0].end === 5, 'removed mid range');

var keptOnly = E.keepRange(full, 2, 7);
assert(keptOnly.length === 1 && keptOnly[0].start === 2 && keptOnly[0].end === 7, 'keep mid');
var gone2 = E.removedRanges(keptOnly, 10);
assert(gone2.length === 2 && gone2[0].end === 2 && gone2[1].start === 7, 'removed both sides after keep');

var emptyKeep = E.keepRange(cutMid, 3.2, 4.8);
assert(emptyKeep.length === 0, 'keep only a removed range is empty');
var noChange = E.cutRange(cutMid, 3.2, 4.8);
assert(E.sameSegs(noChange, cutMid), 'cutting an already-removed range is a no-op');

var head = E.cutRange(full, 0, 2);
assert(head.length === 1 && head[0].start === 2 && head[0].end === 10, 'cut from start');
var tail = E.cutRange(full, 8, 10);
assert(tail.length === 1 && tail[0].start === 0 && tail[0].end === 8, 'cut from end');

// playback mapping
assert(E.containingSegment(4, cutMid) === null, '4 is in the cut');
assert(E.containingSegment(2, cutMid).end === 3, '2 is in the first piece');
assert(E.nextKeptTime(4, cutMid) === 5, 'next kept after the cut is 5');
assert(E.nextKeptTime(1, cutMid) === 1, 'already kept stays');
assert(E.nextKeptTime(10, cutMid) === 10, 'exact last end is kept');
assert(E.nextKeptTime(10.1, cutMid) === null, 'past the end is null');
assert(Math.abs(E.sourceToEdited(6, cutMid) - 4) < 1e-9, 'source 6 = edited 4 (skipped 2s)');
assert(Math.abs(E.editedToSource(4, cutMid) - 6) < 1e-9, 'edited 4 = source 6');
assert(Math.abs(E.exportedSoFar(cutMid, 1, 7) - 5) < 1e-9, 'progress: 3s first + 2s into second');

// undo / redo
var hist = E.createHistory(E.initialSegments(10));
hist.set(E.cutRange(hist.get(), 3, 5), true);
assert(hist.canUndo() && !hist.canRedo(), 'after cut: can undo');
assert(hist.get().length === 2, 'history has two segments');
hist.undo();
assert(hist.get().length === 1 && hist.get()[0].end === 10, 'undo restores full');
assert(!hist.canUndo() && hist.canRedo(), 'after undo: can redo');
hist.redo();
assert(hist.get().length === 2, 'redo restores cut');
hist.set(E.keepRange(hist.get(), 0, 3), true);
assert(hist.get().length === 1 && hist.get()[0].end === 3, 'keep after cut');
hist.undo();
assert(hist.get().length === 2, 'undo keep');
hist.set(E.cutRange(hist.get(), 8, 10), true);
assert(!hist.canRedo(), 'new edit clears redo');

// CSS / HTML sanity (no DOM)
var base = fs.readFileSync(path.join(__dirname, '..', 've_base.css'), 'utf8');
var range = fs.readFileSync(path.join(__dirname, '..', 've_range.css'), 'utf8');
var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var main = fs.readFileSync(path.join(__dirname, '..', 've_main.js'), 'utf8');
assert(/100dvh/.test(base), 've_base has 100dvh');
assert(/100vh/.test(base), 've_base has 100vh fallback');
assert(/overflow:\s*hidden/.test(base), 've_base overflow hidden');
assert(/safe-area-inset/.test(base), 've_base safe-area insets');
assert(/object-fit:\s*contain/.test(base), 'video object-fit contain');
assert(/min-width:\s*900px/.test(base) && /orientation:\s*landscape/.test(base),
  'wide landscape side-panel media query');
assert(/max-height:\s*420px/.test(base), 'short landscape compact query');
assert(/<title>Video Editor VD1<\/title>/.test(html), 'title has VD1');
assert(/\?v=VD1/.test(html), 'assets use ?v=VD1');
assert(/var RELEASE = 'VD1'/.test(main), 'RELEASE constant VD1');
assert(/class="app"/.test(html), 'html uses .app shell');
assert(/id="themeSeg"/.test(html), 'theme Auto/Light/Dark');
assert(/id="dlg"/.test(html), 'in-app dialog');
assert(/range-removed/.test(range), 'removed-range styles');
assert(/playhead/.test(range) && /playhead/.test(html), 'playhead on timeline');
assert(/min-height:\s*48px/.test(range), 'time-chip 48px target');
assert(!/\balert\s*\(/.test(html), 'no alert in html');

['ve_helpers.js', 've_edits.js', 've_theme.js', 've_dlg.js', 've_range.js',
  've_export.js', 've_ui.js', 've_main.js'].forEach(function (f) {
  var src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert(!/\balert\s*\(/.test(src), f + ' has no alert(');
  assert(!/\bconfirm\s*\(/.test(src), f + ' has no confirm(');
  assert(!/\bprompt\s*\(/.test(src), f + ' has no prompt(');
});

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('All VD1 tests passed');
