// Blood Group BG-5 — Myths tab data (core/blood.js, no DOM). Run: node --test apps/learn/blood-group/tests/*.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../core/blood.js'), 'utf8'), ctx);
const B = ctx.window.BG, same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
const ABO = ['A', 'B', 'O', 'AB'];

test('tab list includes Myths (#myths)', () => {
  const ids = B.views.map(t => t.id);
  const labels = B.views.map(t => t.label);
  same(ids.slice(0, 4), ['home', 'donate', 'family', 'myths']);
  same(labels.slice(0, 4), ['Groups', 'Donation', 'Family', 'Myths']);
  const myths = B.views.find(t => t.id === 'myths');
  assert.ok(myths);
  assert.strictEqual(myths.hash, '#myths');
  assert.strictEqual(myths.short, 'Myths');
  assert.ok(!B.views.some(t => /quiz/i.test(t.id + t.label + (t.hash || ''))));
});

test('four personality entries, one each for A, B, O and AB, each flagged myth', () => {
  assert.strictEqual(B.personality.length, 4);
  same(B.personality.map(p => p.abo), ABO);
  for (const p of B.personality) {
    assert.strictEqual(p.myth, true, p.abo);
    assert.ok(typeof p.text === 'string' && p.text.trim().length > 10, p.abo);
  }
  assert.match(B.personality[0].text, /calm|careful|organised|polite/i);
  assert.match(B.personality[1].text, /creative|passionate|free-spirited/i);
  assert.match(B.personality[2].text, /confident|leader|outgoing|generous/i);
  assert.match(B.personality[3].text, /rational|genius|distant/i);
});

test('myth intro has history, studies and bura-hara notes', () => {
  const i = B.mythIntro;
  assert.match(i.history, /ketsueki-gata/i);
  assert.match(i.history, /Furukawa/);
  assert.match(i.history, /1927/);
  assert.match(i.history, /Nomi/);
  assert.match(i.history, /1970/);
  assert.match(i.studies, /no link/i);
  assert.match(i.harassment, /bura-hara/i);
  assert.match(i.harassment, /harassment/i);
});

test('6-8 myth vs fact pairs with non-empty text', () => {
  const n = B.mythFacts.length;
  assert.ok(n >= 6 && n <= 8, 'count ' + n);
  const ids = new Set();
  for (const x of B.mythFacts) {
    assert.ok(x.id && typeof x.id === 'string', JSON.stringify(x));
    assert.ok(!ids.has(x.id), 'duplicate ' + x.id);
    ids.add(x.id);
    assert.ok(typeof x.myth === 'string' && x.myth.trim().length > 8, x.id + ' myth');
    assert.ok(typeof x.fact === 'string' && x.fact.trim().length > 16, x.id + ' fact');
  }
  const blob = B.mythFacts.map(x => x.myth + ' ' + x.fact).join('\n').toLowerCase();
  for (const bit of ['beetroot', 'donat', 'diet', 'rare', 'rh', 'tattoo', 'relative']) {
    assert.ok(blob.includes(bit), 'covers ' + bit);
  }
});
