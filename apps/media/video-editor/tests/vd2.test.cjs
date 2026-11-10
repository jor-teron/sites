/* Video Editor VD3 — sequence tests still pass at 1× speed (no browser / no DOM). */
'use strict';

var fs = require('fs');
var path = require('path');
var H = require(path.join(__dirname, '..', 've_helpers.js'));
var E = require(path.join(__dirname, '..', 've_edits.js'));
global.VEEdits = E;
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

function clip(id, duration, segments) {
  return {
    id: id,
    fileId: 'f-' + id,
    name: id + '.mp4',
    duration: duration,
    width: 640,
    height: 360,
    thumb: '',
    segments: segments || E.initialSegments(duration)
  };
}

// helpers added in VD2
assert(typeof H.uid === 'function' && H.uid('c').indexOf('c') === 0, 'uid prefix');
assert(H.uid() !== H.uid(), 'uid unique');
assert(H.formatBytes(0) === '0 B', 'formatBytes 0');
assert(H.formatBytes(1536) === '1.5 KB', 'formatBytes KB');
assert(H.formatBytes(2 * 1024 * 1024) === '2.0 MB', 'formatBytes MB');
assert(H.escapeHtml('<a & "b">') === '&lt;a &amp; &quot;b&quot;&gt;', 'escapeHtml');

// sequence timing
var a = clip('a', 10);
var b = clip('b', 6, E.cutRange(E.initialSegments(6), 0, 2)); // kept 2..6 = 4s
var c = clip('c', 5, E.keepRange(E.initialSegments(5), 1, 3)); // kept 2s
var list = [a, b, c];
assert(Math.abs(S.clipKept(a) - 10) < 1e-9, 'clipKept full');
assert(Math.abs(S.clipKept(b) - 4) < 1e-9, 'clipKept after cut');
assert(Math.abs(S.sequenceDuration(list) - 16) < 1e-9, 'sequenceDuration 10+4+2');

var layout = S.sequenceLayout(list);
assert(layout.total === 16 && layout.items.length === 3, 'layout items');
assert(layout.items[0].start === 0 && layout.items[0].end === 10, 'layout clip A');
assert(layout.items[1].start === 10 && layout.items[1].end === 14, 'layout clip B');
assert(layout.items[2].start === 14 && layout.items[2].end === 16, 'layout clip C');

var g0 = S.globalToLocal(0, list);
assert(g0.index === 0 && g0.sourceTime === 0, 'global 0 → A@0');
var g10 = S.globalToLocal(10, list);
assert(g10.index === 1 && Math.abs(g10.sourceTime - 2) < 1e-9, 'global 10 → B@2 (start of kept)');
var g12 = S.globalToLocal(12, list);
assert(g12.index === 1 && Math.abs(g12.sourceTime - 4) < 1e-9, 'global 12 → B@4');
var g14 = S.globalToLocal(14, list);
assert(g14.index === 2 && Math.abs(g14.sourceTime - 1) < 1e-9, 'global 14 → C@1');
var gEnd = S.globalToLocal(16, list);
assert(gEnd.atEnd && gEnd.index === 2, 'global at end stays on last clip');
assert(Math.abs(S.localToGlobal(1, 4, list) - 12) < 1e-9, 'local B@4 → global 12');
assert(Math.abs(S.localToGlobal(0, 10, list) - 10) < 1e-9, 'local A@end → 10');

// split
var mid = S.splitClip(a, 4, 'a2');
assert(mid && mid.left.id === 'a' && mid.right.id === 'a2', 'split keeps left id, new right id');
assert(Math.abs(S.clipKept(mid.left) - 4) < 1e-9, 'split left 4s');
assert(Math.abs(S.clipKept(mid.right) - 6) < 1e-9, 'split right 6s');
assert(S.splitClip(a, 0, 'x') === null, 'cannot split at start');
assert(S.splitClip(a, 10, 'x') === null, 'cannot split at end');
assert(S.splitSegments(b.segments, 1) === null, 'cannot split inside a removed range');
var bsplit = S.splitSegments(b.segments, 4);
assert(bsplit && Math.abs(E.keptDuration(bsplit.left) - 2) < 1e-9, 'split B at 4: left 2s kept');
assert(Math.abs(E.keptDuration(bsplit.right) - 2) < 1e-9, 'split B at 4: right 2s kept');

// reorder
var moved = S.moveClip(list, 0, 2);
assert(moved[0].id === 'b' && moved[1].id === 'c' && moved[2].id === 'a', 'move first to last');
assert(S.sequenceDuration(moved) === S.sequenceDuration(list), 'reorder keeps duration');
var lefted = S.moveBy(list, 2, -1);
assert(lefted[0].id === 'a' && lefted[1].id === 'c' && lefted[2].id === 'b', 'move last left');
var same = S.moveClip(list, 1, 1);
assert(same[0].id === 'a' && same[1].id === 'b', 'move no-op');
assert(S.findIndex(list, 'c') === 2, 'findIndex');
assert(S.findIndex(list, 'nope') === -1, 'findIndex missing');

// fade through black: duration unchanged, alpha 0 at the cut, 1 in the middle
assert(S.fadeAlpha(5, 10, 0, 0, 2) === 1, 'no fade is opaque');
assert(S.fadeAlpha(0, 10, 0.5, 1, 3) === 0, 'fade in at start of middle clip');
assert(Math.abs(S.fadeAlpha(0.25, 10, 0.5, 1, 3) - 0.5) < 1e-9, 'fade in halfway');
assert(S.fadeAlpha(1, 10, 0.5, 1, 3) === 1, 'opaque after fade in');
assert(S.fadeAlpha(10, 10, 0.5, 1, 3) === 0, 'fade out at end of middle clip');
assert(S.fadeAlpha(0, 10, 0.5, 0, 3) === 1, 'first clip has no fade-in');
assert(S.fadeAlpha(10, 10, 0.5, 2, 3) === 1, 'last clip has no fade-out');
// fade longer than the clip is capped at half
assert(Math.abs(S.fadeAlpha(0.5, 1, 5, 1, 3) - 1) < 1e-9, 'short clip fade capped at half (mid is opaque)');
assert(S.fadeAlpha(0, 1, 5, 1, 3) === 0, 'short clip still fades in from 0');

// project history covers add, split, reorder, fade, delete
var hist = S.createHistory({ fade: 0, clips: [a] });
hist.set({ fade: 0, clips: [a, b] }, true);
assert(hist.get().clips.length === 2 && hist.canUndo(), 'add clip is undoable');
var splitA = S.splitClip(hist.get().clips[0], 4, 'a2');
hist.set({ fade: 0, clips: [splitA.left, splitA.right, b] }, true);
assert(hist.get().clips.length === 3, 'after split: 3 clips');
hist.set({ fade: 0, clips: S.moveBy(hist.get().clips, 0, 1) }, true);
assert(hist.get().clips[0].id === 'a2', 'after reorder');
hist.set({ fade: 0.5, clips: hist.get().clips }, true);
assert(hist.get().fade === 0.5, 'fade change recorded');
hist.set({ fade: 0.5, clips: hist.get().clips.slice(0, 2) }, true);
assert(hist.get().clips.length === 2, 'delete clip recorded');
hist.undo();
assert(hist.get().clips.length === 3, 'undo delete');
hist.undo();
assert(hist.get().fade === 0, 'undo fade');
hist.redo();
assert(hist.get().fade === 0.5, 'redo fade');
assert(hist.fileIds().indexOf('f-a') >= 0, 'history keeps file ids for undo');

// export size helper is testable
var X = require(path.join(__dirname, '..', 've_export.js'));
var size = X.chooseSize([{ width: 1920, height: 1080 }, { width: 640, height: 360 }]);
assert(size.width === 1280 && size.height === 720, 'export size caps 1080p at 1280 long side');
var odd = X.chooseSize([{ width: 333, height: 111 }]);
assert(odd.width % 2 === 0 && odd.height % 2 === 0, 'export size is even');

// HTML / CSS sanity
var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
var base = fs.readFileSync(path.join(__dirname, '..', 've_base.css'), 'utf8');
var main = fs.readFileSync(path.join(__dirname, '..', 've_main.js'), 'utf8');
assert(/<title>Video Editor VD3<\/title>/.test(html), 'title VD3');
assert((html.match(/\?v=VD3/g) || []).length >= 13, 'assets use ?v=VD3');
assert(/var RELEASE = 'VD3'/.test(main), 'RELEASE VD3');
assert(/id="clipStrip"/.test(html), 'clip strip in html');
assert(/id="seqTrack"/.test(html), 'sequence seek in html');
assert(/id="projectsBtn"/.test(html), 'Projects button');
assert(/id="fadeSeg"/.test(html), 'fade setting');
assert(/id="splitBtn"/.test(html), 'split button');
assert(/clip-block/.test(base) && /clip-strip/.test(base), 'clip strip styles');
assert(/indexedDB/.test(fs.readFileSync(path.join(__dirname, '..', 've_store.js'), 'utf8')), 'store uses IndexedDB');
assert(/videoeditor/.test(fs.readFileSync(path.join(__dirname, '..', 've_store.js'), 'utf8')), 'db name videoeditor');
assert(/captureStream/.test(fs.readFileSync(path.join(__dirname, '..', 've_export.js'), 'utf8')), 'export uses captureStream');
assert(/createMediaElementSource/.test(fs.readFileSync(path.join(__dirname, '..', 've_ui.js'), 'utf8')), 'audio hook per element');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('All VD2 tests passed');
