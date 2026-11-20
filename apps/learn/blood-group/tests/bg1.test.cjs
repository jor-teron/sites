// Blood Group BG-1 — groups, markers and antibodies (core/blood.js, no DOM). Run: node --test apps/learn/blood-group/tests/*.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../core/blood.js'), 'utf8'), ctx);
const B = ctx.window.BG, same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);

test('there are 8 groups, each ABO group with + and -', () => {
  assert.strictEqual(B.groups.length, 8);
  assert.strictEqual(new Set(B.groups).size, 8);
  for (const a of ['O', 'A', 'B', 'AB']) for (const r of ['+', '-']) assert.ok(B.groups.includes(a + r), a + r);
});
test('parse splits ABO and Rh', () => {
  same(B.parse('AB-'), { abo: 'AB', rh: '-' });
  same(B.parse('o+'), { abo: 'O', rh: '+' });
  same(B.parse('A'), { abo: 'A', rh: null });
  same(B.parse('B\u2212'), { abo: 'B', rh: '-' });
  assert.strictEqual(B.parse('C+'), null);
  assert.strictEqual(B.parse(''), null);
});
test('antigens (markers) for each ABO group', () => {
  same(B.antigens('A-'), ['A']); same(B.antigens('B-'), ['B']);
  same(B.antigens('AB-'), ['A', 'B']); same(B.antigens('O-'), []);
});
test('antibodies in the plasma for each ABO group', () => {
  same(B.antibodies('A+'), ['anti-B']); same(B.antibodies('B+'), ['anti-A']);
  same(B.antibodies('AB+'), []); same(B.antibodies('O+'), ['anti-A', 'anti-B']);
});
test('Rh: positive groups carry RhD, negative do not', () => {
  for (const g of B.groups) {
    const pos = g.endsWith('+');
    assert.strictEqual(B.rhPositive(g), pos, g);
    assert.strictEqual(B.antigens(g).includes('RhD'), pos, g);
  }
  same(B.antigens('AB+'), ['A', 'B', 'RhD']);
});
test('India frequencies cover all 8 groups and sum to about 100', () => {
  for (const g of B.groups) assert.ok(B.india[g] > 0, g);
  assert.ok(Math.abs(B.indiaTotal() - 100) <= 0.5, 'total ' + B.indiaTotal());
  assert.strictEqual(B.byCommon()[0], 'O+');
});
