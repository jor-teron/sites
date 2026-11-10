/* Node tests for Password Manager PW2 merge / tombstones.
   Run: node apps/tools/password-manager/tests/pm_merge_test.js */
'use strict';

var path = require('path');
var PMMerge = require(path.join(__dirname, '..', 'pm_merge.js'));
var PMStore = require(path.join(__dirname, '..', 'pm_store.js'));

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

function e(id, updated, title) {
  return { id: id, type: 'login', title: title || id, updated: updated, created: updated };
}

var local = {
  version: 2,
  settings: { autoLockMin: 5, clipboardSec: 30, lockHiddenMin: 0 },
  entries: [
    e('keep', '2026-01-02T00:00:00.000Z', 'Keep local'),
    e('newer-remote', '2026-01-01T00:00:00.000Z', 'Stale local'),
    e('only-local', '2026-01-01T00:00:00.000Z', 'Only local')
  ],
  tombstones: [{ id: 'gone', updated: '2026-02-01T00:00:00.000Z', deleted: true }]
};
var incoming = {
  version: 2,
  settings: { autoLockMin: 15, clipboardSec: 10, lockHiddenMin: 1 },
  entries: [
    e('keep', '2026-01-01T00:00:00.000Z', 'Older remote'),
    e('newer-remote', '2026-03-01T00:00:00.000Z', 'Fresh remote'),
    e('only-remote', '2026-01-01T00:00:00.000Z', 'Only remote'),
    e('gone', '2026-01-15T00:00:00.000Z', 'Should stay deleted')
  ],
  tombstones: []
};

var merged = PMMerge.mergeVaults(local, incoming, 'merge');
var byId = {};
merged.vault.entries.forEach(function (x) { byId[x.id] = x; });
eq('merge settings kept', merged.vault.settings.autoLockMin, 5);
eq('kept local when newer', byId.keep.title, 'Keep local');
eq('took remote when newer', byId['newer-remote'].title, 'Fresh remote');
ok('only local kept', !!byId['only-local']);
ok('only remote added', !!byId['only-remote']);
ok('tombstone wins over older live', !byId.gone);
eq('summary added', merged.summary.added, 1);
eq('summary updated', merged.summary.updated, 1);
ok('summary kept >= 2', merged.summary.kept >= 2, String(merged.summary.kept));
ok('summary removed the tombstoned one', merged.summary.removed >= 1);
eq('summary text mentions added', PMMerge.summaryText(merged.summary).indexOf('added') !== -1, true);

var replaced = PMMerge.mergeVaults(local, incoming, 'replace');
eq('replace settings from incoming', replaced.vault.settings.autoLockMin, 15);
eq('replace entry count', replaced.vault.entries.length, 4);
ok('replace includes gone (no tombstone on incoming-only replace? incoming has gone as live, no tombstones)', !!replaced.vault.entries.filter(function (x) { return x.id === 'gone'; }).length);

// Newer tombstone on incoming deletes a local entry
var incDel = {
  version: 2,
  settings: {},
  entries: [],
  tombstones: [{ id: 'only-local', updated: '2026-06-01T00:00:00.000Z', deleted: true }]
};
var afterDel = PMMerge.mergeVaults(local, incDel, 'merge');
ok('newer incoming tombstone removes local', afterDel.vault.entries.every(function (x) { return x.id !== 'only-local'; }));

// Store mergeHeader prev / dropPrev (pure, no IndexedDB)
var header = { v: 1, kdf: 'PBKDF2-SHA256', iter: 10, salt: 's', iv: 'i', ct: 'c' };
var oldH = { v: 1, kdf: 'PBKDF2-SHA256', iter: 10, salt: 's0', iv: 'i0', ct: 'c0' };
var rec = PMStore.mergeHeader(null, header, { hint: 'h', fails: 0, prev: oldH });
eq('prev kept', rec.prev.ct, 'c0');
eq('hint kept', rec.hint, 'h');
var rec2 = PMStore.mergeHeader(rec, header, { fails: 0 });
eq('prev persists until dropped', rec2.prev.ct, 'c0');
var rec3 = PMStore.mergeHeader(rec2, header, { dropPrev: true, fails: 0, hint: 'h' });
eq('prev dropped', rec3.prev, undefined);
ok('hasVault', PMStore.hasVault(rec3));

if (fails.length) {
  console.error('\nFAILED ' + fails.length);
  fails.forEach(function (f) { console.error(' -', f); });
  process.exit(1);
}
console.log('\nAll tests passed.');
