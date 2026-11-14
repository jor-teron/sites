/* Video Trimmer VT1 — pure helper tests (no browser). */
'use strict';

var path = require('path');
var H = require(path.join(__dirname, '..', 'vt_helpers.js'));

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

// formatTime
assert(H.formatTime(0) === '0:00.0', 'formatTime 0');
assert(H.formatTime(5) === '0:05.0', 'formatTime 5s');
assert(H.formatTime(65.3) === '1:05.3', 'formatTime 65.3');
assert(H.formatTime(125.9) === '2:05.9', 'formatTime 125.9');
assert(H.formatTime(-1) === '0:00.0', 'formatTime negative clamps');

// parseTime
assert(H.parseTime('0:05.0') === 5, 'parse mm:ss.s');
assert(H.parseTime('1:05.3') === 65.3, 'parse 1:05.3');
assert(H.parseTime('65.3') === 65.3, 'parse plain seconds');
assert(H.parseTime('2:00') === 120, 'parse mm:ss');
assert(isNaN(H.parseTime('')), 'parse empty NaN');
assert(isNaN(H.parseTime('1:99')), 'parse bad seconds NaN');
assert(H.formatTime(H.parseTime('0:05.5')) === '0:05.5', 'round-trip');

// clampRange / no-cross
var c1 = H.clampRange(10, 10, 60, 0.1, 'start');
assert(c1.start <= c1.end - 0.1 + 1e-9, 'start cannot cross end');
assert(Math.abs(c1.end - 10) < 1e-9, 'end stays when moving start into it');

var c2 = H.clampRange(50, 50.05, 60, 0.1, 'end');
assert(c2.end >= c2.start + 0.1 - 1e-9, 'end respects min gap');

var c3 = H.clampRange(-5, 100, 40, 0.1, 'both');
assert(c3.start === 0 && c3.end === 40, 'clamp to duration');

var c4 = H.clampRange(39.95, 40, 40, 0.1, 'start');
assert(c4.start === 39.9 && c4.end === 40, 'start near end of timeline');

var c5 = H.clampRange(0, 0.05, 40, 0.1, 'end');
assert(c5.start === 0 && Math.abs(c5.end - 0.1) < 1e-9, 'end near start expands');

// ratios / pixels
assert(H.timeToRatio(30, 60) === 0.5, 'timeToRatio mid');
assert(H.timeToRatio(0, 60) === 0, 'timeToRatio 0');
assert(H.timeToRatio(90, 60) === 1, 'timeToRatio clamp');
assert(H.ratioToTime(0.25, 80) === 20, 'ratioToTime');
assert(H.pixelToTime(100, 200, 40) === 20, 'pixelToTime mid');
assert(H.pixelToTime(-10, 200, 40) === 0, 'pixelToTime left clamp');
assert(H.pixelToTime(999, 200, 40) === 40, 'pixelToTime right clamp');
assert(H.timeToPixel(20, 200, 40) === 100, 'timeToPixel');
assert(H.timeToRatio(0, 0) === 0, 'zero duration ratio');
assert(H.pixelToTime(50, 0, 40) === 0, 'zero width pixel');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('All tests passed');
