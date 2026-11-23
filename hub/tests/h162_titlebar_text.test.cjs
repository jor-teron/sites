// H162: Hub title-bar text item (kind:'text'). Pure logic + wiring checks.
// Run: node --test hub/tests/h162_titlebar_text.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const T = require('../core/hub_titlebar.js');

test('H162: node --check on new and touched JavaScript', () => {
  const files = [
    'hub/core/hub_titlebar.js',
    'desktop/gamebar/hub-gamebar.js',
    'hub/tests/h162_titlebar_text.test.cjs'
  ];
  files.forEach((rel) => {
    const r = spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], { encoding: 'utf8' });
    assert.equal(r.status, 0, rel + ' ' + (r.stderr || r.stdout));
  });
});

test('H162: a text item is non-clickable, keeps normal contrast fields, and caps the label', () => {
  const item = T.normalizeItem({
    id: 'count',
    kind: 'text',
    label: '42 words · 120 characters and then some extra padding!!',
    title: '42 words · 120 characters — the full tooltip text goes here and is also capped at sixty',
    enabled: false,
    icon: 'xx'
  }, true);
  assert.equal(item.kind, 'text');
  assert.equal(T.isText(item), true);
  assert.equal(T.kindOf(item), 'text');
  assert.equal(item.label.length, T.TEXT_LABEL_MAX);
  assert.equal(item.label, '42 words · 120 characters and then some extra padding!!'.slice(0, T.TEXT_LABEL_MAX));
  assert.equal(item.title.length, T.TITLE_MAX);
  assert.equal(item.enabled, undefined);
  assert.equal(item.icon, undefined);
  assert.equal(T.isClickable(item), false);
  assert.equal(T.isClickable({ id: 'count', kind: 'text', label: '1 word', enabled: true }), false);
});

test('H162: existing buttons stay buttons, including a faded disabled one', () => {
  const open = T.normalizeItem({ id: 'open', label: 'Open', icon: '📂', title: 'Open a file' }, true);
  assert.equal(open.kind, 'button');
  assert.equal(open.enabled, true);
  assert.equal(open.label, 'Open');
  assert.equal(open.icon, '📂');
  assert.equal(T.isClickable(open), true);
  assert.equal(T.isText(open), false);

  const faded = T.normalizeItem({ id: 'count', label: '42 words', enabled: false, title: '42 words' }, true);
  assert.equal(faded.kind, 'button');
  assert.equal(faded.enabled, false);
  assert.equal(T.isClickable(faded), false);
  assert.equal(T.isText(faded), false);

  const longBtn = T.normalizeItem({ id: 'x', label: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' }, true);
  assert.equal(longBtn.label.length, T.LABEL_MAX);
  assert.equal(longBtn.label, 'ABCDEFGHIJKLMNOPQRSTUVWX');

  const statusKind = T.normalizeItem({ id: 'count', kind: 'status', label: '42 words', enabled: false }, true);
  assert.equal(statusKind.kind, 'button', "only kind:'text' is special; Notely's old kind:'status' stays a button");
});

test('H162: set keeps mixed order, caps at 8, drops invalid rows, default align is right', () => {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const raw = [
    { id: 'count', kind: 'text', label: '12 words' },
    { id: 'open', label: 'Open' },
    { id: 'download', label: 'Download', enabled: true },
    null,
    { label: 'no-id' },
    ...Array.from({ length: 8 }, (_, i) => ({ id: 'b' + i, label: letters[i] }))
  ];
  const tb = T.normalizeSet({ buttons: raw, tabs: [{ id: 'home', label: 'Home' }], activeTab: 'home' });
  assert.equal(tb.buttons.length, T.TB_MAX_BUTTONS);
  assert.equal(tb.buttons[0].kind, 'text');
  assert.equal(tb.buttons[0].label, '12 words');
  assert.equal(tb.buttons[1].kind, 'button');
  assert.equal(tb.buttons[1].id, 'open');
  assert.equal(tb.buttons[2].id, 'download');
  assert.equal(tb.align, 'right');
  assert.equal(tb.activeTab, 'home');
  assert.equal(tb.tabs.length, 1);

  const left = T.normalizeSet({ align: 'left', buttons: [{ id: 'a', label: 'A' }] });
  assert.equal(left.align, 'left');
  const other = T.normalizeSet({ align: 'centre' });
  assert.equal(other.align, 'right');
  assert.deepEqual(other.buttons, []);
});

test('H162: update patches a text label by id and leaves unknown ids and kind alone', () => {
  const tb = T.normalizeSet({
    buttons: [
      { id: 'count', kind: 'text', label: '1 word', title: '1 word' },
      { id: 'open', label: 'Open', enabled: true }
    ]
  });
  const changed = T.applyUpdate(tb, {
    buttons: [
      { id: 'count', label: '200 words', title: '200 words · 900 characters' },
      { id: 'nope', label: 'ghost' },
      { id: 'open', kind: 'text', label: 'Open', enabled: false }
    ]
  });
  assert.equal(changed.length, 2);
  assert.equal(tb.buttons[0].kind, 'text');
  assert.equal(tb.buttons[0].label, '200 words');
  assert.equal(tb.buttons[0].title, '200 words · 900 characters');
  assert.equal(T.isClickable(tb.buttons[0]), false);
  assert.equal(tb.buttons[1].kind, 'button', 'update must not convert a button into text');
  assert.equal(tb.buttons[1].enabled, false);
  assert.equal(T.isClickable(tb.buttons[1]), false);
});

test('H162: desktop.html, gamebar, CSS and the technical readme wire in the text kind', () => {
  // (before H174) titlebar and gamebar were blocking tags in desktop.html
  // const desk = fs.readFileSync(path.join(ROOT, 'desktop/desktop.html'), 'utf8');
  // const iCore = desk.indexOf('hub/core/hub_titlebar.js');
  // const iBar = desk.indexOf('desktop/gamebar/hub-gamebar.js');
  // assert.ok(iCore !== -1 && iBar !== -1 && iCore < iBar, 'hub_titlebar.js must load before hub-gamebar.js');
  const loader = fs.readFileSync(path.join(ROOT, 'hub/core/hub_loader.js'), 'utf8');
  const iConn = loader.indexOf('connect:');
  const iCore = loader.indexOf("'hub/core/hub_titlebar.js'");
  const iBar = loader.indexOf("'desktop/gamebar/hub-gamebar.js'");
  assert.ok(iConn !== -1 && iCore > iConn && iBar > iCore, 'hub_titlebar.js must load before hub-gamebar.js (connect batch)');

  const bar = fs.readFileSync(path.join(ROOT, 'desktop/gamebar/hub-gamebar.js'), 'utf8');
  assert.ok(bar.includes('HubTitleBarItems'), 'hub-gamebar.js uses the H162 helper');
  assert.ok(bar.includes("kind === 'text'") || bar.includes('kind === "text"'), 'hub-gamebar.js draws kind:text');
  assert.ok(bar.includes('gb-qtext'), 'hub-gamebar.js uses the .gb-qtext class');
  assert.ok(bar.includes('(before H162)'), 'old title-bar mapping is commented, not deleted');

  const css = fs.readFileSync(path.join(ROOT, 'desktop/wm/wm.css'), 'utf8');
  const m = css.match(/\.gb-qtext\s*\{[^}]+\}/);
  assert.ok(m, '.gb-qtext rule exists');
  assert.ok(m[0].includes('text-overflow: ellipsis') || m[0].includes('text-overflow:ellipsis'), 'text truncates with ellipsis');
  assert.ok(!/\bopacity\s*:\s*0\./.test(m[0]), 'text item is not faded');

  const doc = fs.readFileSync(path.join(ROOT, 'hub/docs/README_technical.txt'), 'utf8');
  assert.ok(doc.includes("kind:'text'") || doc.includes('kind: \'text\'') || doc.includes('kind: "text"'), 'API is documented');
  const log = fs.readFileSync(path.join(ROOT, 'hub/docs/hub_readme.md'), 'utf8');
  assert.ok(log.includes('H162'), 'change log mentions H162');
});
