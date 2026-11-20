// LearnHubBar BG-3a — pure helpers for optional title-bar tabs (no DOM).
// Run: node --test apps/learn/shared/learn-hubbar.test.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} };
ctx.window.parent = ctx.window;   // standalone: attach must not run the Hub path
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'learn-hubbar.js'), 'utf8'), ctx);
const HB = ctx.LearnHubBar;
const TABS = [
  { id: 'home', label: 'Groups', short: 'Groups', hash: '' },
  { id: 'donate', label: 'Donation', short: 'Donate', hash: '#donate' },
  { id: 'family', label: 'Family', short: 'Family', hash: '#family' }
];

test('tabSelector keeps the old string / default path for every existing app', () => {
  assert.strictEqual(HB.tabSelector(), '.lrn-mode');
  assert.strictEqual(HB.tabSelector({}), '.lrn-mode');
  assert.strictEqual(HB.tabSelector({ buttons: '.lrn-qc' }), '.lrn-mode');
  assert.strictEqual(HB.tabSelector({ tabs: '.lrn-mode', buttons: '.lrn-qc' }), '.lrn-mode');
  assert.strictEqual(HB.tabSelector({ tabs: '.hb-modes', buttons: '.hb-flip' }), '.hb-modes');
  assert.strictEqual(HB.tabSelector({ tabs: '' }), '.lrn-mode');
  assert.strictEqual(HB.tabSelector({ tabs: [] }), '.lrn-mode');   // empty array is not the new form
});

test('tabSelector uses .lrn-hubtabs only when tabs is a non-empty array', () => {
  assert.strictEqual(HB.tabSelector({ tabs: TABS }), '.lrn-hubtabs');
  assert.strictEqual(HB.tabSelector({ tabs: [{ id: 'home', label: 'Groups' }] }), '.lrn-hubtabs');
});

test('normHash treats empty, #, donate and #donate the same way', () => {
  assert.strictEqual(HB.normHash(''), '');
  assert.strictEqual(HB.normHash('#'), '');
  assert.strictEqual(HB.normHash(null), '');
  assert.strictEqual(HB.normHash('#donate'), '#donate');
  assert.strictEqual(HB.normHash('donate'), '#donate');
  assert.strictEqual(HB.normHash(' #family '), '#family');
});

test('tabFromHash maps "" / #donate / #family and falls back to Groups', () => {
  assert.strictEqual(HB.tabFromHash(TABS, '').id, 'home');
  assert.strictEqual(HB.tabFromHash(TABS, '#').id, 'home');
  assert.strictEqual(HB.tabFromHash(TABS, '#donate').id, 'donate');
  assert.strictEqual(HB.tabFromHash(TABS, 'donate').id, 'donate');
  assert.strictEqual(HB.tabFromHash(TABS, '#family').id, 'family');
  assert.strictEqual(HB.tabFromHash(TABS, '#quiz').id, 'home');   // unknown hash, not yet a Quiz tab
  assert.strictEqual(HB.tabFromHash([], '#donate'), null);
  assert.strictEqual(HB.tabHash(TABS[0]), '');
  assert.strictEqual(HB.tabHash(TABS[1]), '#donate');
});

test('tabCaption prefers short or icon when compact, full label otherwise', () => {
  assert.strictEqual(HB.tabCaption(TABS[1], false), 'Donation');
  assert.strictEqual(HB.tabCaption(TABS[1], true), 'Donate');
  assert.strictEqual(HB.tabCaption({ id: 'x', label: 'Groups' }, true), 'Groups');
  assert.strictEqual(HB.tabCaption({ id: 'x', icon: 'G' }, true), 'G');
  assert.strictEqual(HB.tabCaption({ id: 'x', icon: 'G', short: 'Grp', label: 'Groups' }, true), 'Grp');
  assert.strictEqual(HB.tabCaption(null, false), '');
});

test('attach without array tabs returns null when not in a Hub frame (old behaviour)', () => {
  assert.strictEqual(ctx.LearnHubBar.inFrame, false);
  assert.strictEqual(HB.attach({}), null);
  assert.strictEqual(HB.attach(null), null);
  assert.strictEqual(HB.attach({}, { tabs: '.lrn-mode', buttons: '.lrn-qc' }), null);
});
