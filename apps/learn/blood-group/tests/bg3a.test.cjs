// Blood Group BG-3a — title-bar tab routing (LearnHubBar helpers, no DOM).
// Run: node --test apps/learn/blood-group/tests/*.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} };
ctx.window.parent = ctx.window;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../../shared/learn-hubbar.js'), 'utf8'), ctx);
const HB = ctx.LearnHubBar;
const TABS = [
  { id: 'home', label: 'Groups', short: 'Groups', hash: '' },
  { id: 'donate', label: 'Donation', short: 'Donate', hash: '#donate' },
  { id: 'family', label: 'Family', short: 'Family', hash: '#family' }
];

test('Blood Group tabs are Groups, Donation and Family only (no Quiz yet)', () => {
  assert.deepStrictEqual(TABS.map(t => t.label), ['Groups', 'Donation', 'Family']);
  assert.ok(!TABS.some(t => /quiz/i.test(t.id + t.label)));
});

test('Blood Group hashes map to home, donate and family', () => {
  assert.strictEqual(HB.tabFromHash(TABS, '').id, 'home');
  assert.strictEqual(HB.tabFromHash(TABS, '#donate').id, 'donate');
  assert.strictEqual(HB.tabFromHash(TABS, '#family').id, 'family');
  assert.strictEqual(HB.tabHash(TABS[0]), '');
  assert.strictEqual(HB.tabHash(TABS[1]), '#donate');
  assert.strictEqual(HB.tabHash(TABS[2]), '#family');
});

test('deep links and unknown hashes stay on a real Blood Group view', () => {
  assert.strictEqual(HB.tabFromHash(TABS, 'donate').id, 'donate');
  assert.strictEqual(HB.tabFromHash(TABS, '#').id, 'home');
  assert.strictEqual(HB.tabFromHash(TABS, '#nope').id, 'home');
});
