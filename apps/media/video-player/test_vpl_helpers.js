/* Node tests for Video Player VPL2 helpers (video-player_helpers.js).
   Run: node test_vpl_helpers.js
   No DOM, no jsdom, no browser. */
'use strict';

var VPL = require('./video-player_helpers.js');
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

eq('ext mp4', VPL.ext('Clip.MP4'), 'mp4');
eq('ext none', VPL.ext('clip'), '');
eq('baseName path', VPL.baseName('Movies/Holiday.mp4'), 'Holiday');
eq('dirName path', VPL.dirName('Movies/Holiday.mp4'), 'Movies');
eq('dirName loose', VPL.dirName('Holiday.mp4'), '');
ok('isVideo mp4', VPL.isVideo('a.mp4'));
ok('isVideo webm', VPL.isVideo('a.WEBM'));
ok('isVideo mkv', VPL.isVideo('a.mkv'));
ok('not video srt', !VPL.isVideo('a.srt'));
ok('isSubtitle srt', VPL.isSubtitle('a.srt'));
ok('isSubtitle vtt', VPL.isSubtitle('a.VTT'));
ok('not subtitle txt', !VPL.isSubtitle('a.txt'));

ok('natural 2 before 10', VPL.naturalCmp('ep2.mp4', 'ep10.mp4') < 0);
ok('natural case', VPL.naturalCmp('B.mp4', 'a.mp4') > 0 || VPL.naturalCmp('B.mp4', 'a.mp4') < 0);
eq('sortByPath numeric', VPL.sortByPath(['e10.mp4', 'e2.mp4', 'e1.mp4']).join(','), 'e1.mp4,e2.mp4,e10.mp4');
eq('sortByPath objects', VPL.sortByPath([
  { path: 'Folder/e10.mp4' }, { path: 'Folder/e2.mp4' }
]).map(function (x) { return x.path; }).join(','), 'Folder/e2.mp4,Folder/e10.mp4');

function sub(name, path) { return { name: name, path: path || name }; }
eq('match same base srt', VPL.matchSubtitle('Holiday.mp4', [sub('Holiday.srt')]).name, 'Holiday.srt');
eq('match case', VPL.matchSubtitle('holiday.mp4', [sub('Holiday.VTT')]).name, 'Holiday.VTT');
eq('match prefer vtt', VPL.matchSubtitle('clip.mp4', [sub('clip.srt'), sub('clip.vtt')]).name, 'clip.vtt');
eq('match same folder over other', VPL.matchSubtitle('A/clip.mp4', [
  sub('clip.srt', 'B/clip.srt'), sub('clip.srt', 'A/clip.srt')
]).path, 'A/clip.srt');
eq('match no language suffix', VPL.matchSubtitle('clip.mp4', [sub('clip.en.srt')]), null);
eq('match empty', VPL.matchSubtitle('clip.mp4', []), null);
eq('match ignores other names', VPL.matchSubtitle('clip.mp4', [sub('other.srt')]), null);

eq('format 0', VPL.formatTime(0), '0:00');
eq('format 9', VPL.formatTime(9), '0:09');
eq('format 65', VPL.formatTime(65), '1:05');
eq('format 3599', VPL.formatTime(3599), '59:59');
eq('format 3600', VPL.formatTime(3600), '1:00:00');
eq('format 3723', VPL.formatTime(3723), '1:02:03');
eq('format NaN', VPL.formatTime(NaN), '0:00');
eq('format neg', VPL.formatTime(-8), '0:00');
eq('format floor', VPL.formatTime(1.9), '0:01');

eq('resumeKey', VPL.resumeKey('Holiday.mp4', 12345), 'Holiday.mp4|12345');
eq('resumeKey empty size', VPL.resumeKey('a.mp4'), 'a.mp4|0');

var srt = '1\n00:00:01,000 --> 00:00:04,250\nHello, world\n\n2\n00:00:05,000 --> 00:00:06,000\nSecond\n';
var vtt = VPL.srtToVtt(srt);
ok('srt header', vtt.indexOf('WEBVTT\n\n') === 0, vtt.slice(0, 20));
ok('srt comma to dot', vtt.indexOf('00:00:01.000 --> 00:00:04.250') >= 0, vtt);
ok('srt second cue', vtt.indexOf('00:00:05.000 --> 00:00:06.000') >= 0);
ok('srt dialogue comma kept', vtt.indexOf('Hello, world') >= 0);
ok('srt no timestamp comma', !/\d:\d\d:\d\d,/.test(vtt));

var already = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi\n';
eq('vtt passthrough', VPL.srtToVtt(already), already);
ok('vtt bom and crlf', VPL.srtToVtt('\uFEFFWEBVTT\r\n\r\n00:00:00.000 --> 00:00:01.000\r\nHi\n').indexOf('WEBVTT\n\n') === 0);
eq('srt empty', VPL.srtToVtt(''), 'WEBVTT\n\n');
eq('srt short ms padded', VPL.srtToVtt('00:00:01,5 --> 00:00:02,00\nHi\n').indexOf('00:00:01.500 --> 00:00:02.000') >= 0, true);
ok('srt cue numbers kept', VPL.srtToVtt(srt).indexOf('\n1\n') >= 0);


eq('parseTs hms', VPL.parseTs('01:02:03.250'), 3723.25);
eq('parseTs comma', VPL.parseTs('00:00:01,500'), 1.5);
eq('formatTs 0', VPL.formatTs(0), '00:00:00.000');
eq('formatTs 3723.25', VPL.formatTs(3723.25), '01:02:03.250');
eq('formatTs clamp', VPL.formatTs(-1), '00:00:00.000');

var vttIn = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.250\nHello, world\n';
eq('shift 0 identity', VPL.shiftVtt(vttIn, 0), vttIn);
ok('shift +1s start', VPL.shiftVtt(vttIn, 1).indexOf('00:00:02.000 --> 00:00:05.250') >= 0);
ok('shift +0.1s', VPL.shiftVtt(vttIn, 0.1).indexOf('00:00:01.100 --> 00:00:04.350') >= 0);
ok('shift -5s clamps', VPL.shiftVtt(vttIn, -5).indexOf('00:00:00.000 --> 00:00:00.000') >= 0);
ok('shift keeps dialogue', VPL.shiftVtt(vttIn, 1).indexOf('Hello, world') >= 0);
ok('shift srt then vtt', VPL.shiftVtt(VPL.srtToVtt('00:00:01,000 --> 00:00:02,000\nHi\n'), 0.5).indexOf('00:00:01.500 --> 00:00:02.500') >= 0);

eq('RELEASE', VPL.RELEASE, 'VPL2');
eq('VERSION', VPL.VERSION, 'VPL2');

if (fails.length) {
  console.error('\nFAILED ' + fails.length);
  fails.forEach(function (f) { console.error(' - ' + f); });
  process.exit(1);
}
console.log('\nAll', 'tests passed');
