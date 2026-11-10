/* Node tests for Password Manager PW2 health check.
   Run: node apps/tools/password-manager/tests/pm_health_test.js */
'use strict';

var path = require('path');
var dir = path.join(__dirname, '..');
var PMGen = require(path.join(dir, 'pm_gen.js'));
var PMUtil = require(path.join(dir, 'pm_util.js'));
var PMHealth = require(path.join(dir, 'pm_health.js'));

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

var now = Date.parse('2026-11-10T00:00:00.000Z');
var entries = [
  { id: '1', type: 'login', title: 'Weak one', password: 'abc', passwordChanged: '2026-01-01T00:00:00.000Z' },
  { id: '2', type: 'login', title: 'Reused A', password: 'SamePass1!', passwordChanged: '2026-01-01T00:00:00.000Z' },
  { id: '3', type: 'wifi', title: 'Reused B', ssid: 'Home', password: 'SamePass1!', passwordChanged: '2026-01-01T00:00:00.000Z' },
  { id: '4', type: 'login', title: 'Old strong', password: 'A-quite-long-unique-password-99', passwordChanged: '2025-10-01T00:00:00.000Z' },
  { id: '5', type: 'login', title: 'Empty', password: '', created: '2026-01-01T00:00:00.000Z' },
  { id: '6', type: 'note', title: 'Just a note', text: 'hello' },
  { id: '7', type: 'login', title: 'Deleted weak', password: 'abc', deleted: true, passwordChanged: '2020-01-01T00:00:00.000Z' }
];

var r = PMHealth.check(entries, now, PMHealth.YEAR_MS);
eq('weak includes short and empty', r.weak.map(function (x) { return x.id; }).sort(), ['1', '5']);
eq('empty reason', r.weak.filter(function (x) { return x.id === '5'; })[0].reason, 'empty');
eq('reused pair', r.reused.map(function (x) { return x.id; }).sort(), ['2', '3']);
ok('reused also names', r.reused[0].also.indexOf('Reused B') !== -1 || r.reused[0].also.indexOf('Reused A') !== -1, JSON.stringify(r.reused[0]));
eq('old only the aged one', r.old.map(function (x) { return x.id; }), ['4']);
ok('old age days ~405', r.old[0].ageDays > 400 && r.old[0].ageDays < 420, String(r.old[0].ageDays));
ok('deleted ignored', r.weak.every(function (x) { return x.id !== '7'; }) && r.old.every(function (x) { return x.id !== '7'; }));
ok('notes ignored', r.weak.every(function (x) { return x.id !== '6'; }));
eq('checked count excludes deleted? live entries counted', r.counts.checked, 6);

var clean = PMHealth.check([
  { id: 'a', type: 'login', title: 'Fine', password: 'A-quite-long-unique-password-99', passwordChanged: '2026-06-01T00:00:00.000Z' }
], now);
eq('clean weak', clean.counts.weak, 0);
eq('clean reused', clean.counts.reused, 0);
eq('clean old', clean.counts.old, 0);

if (fails.length) {
  console.error('\nFAILED ' + fails.length);
  fails.forEach(function (f) { console.error(' -', f); });
  process.exit(1);
}
console.log('\nAll tests passed.');
