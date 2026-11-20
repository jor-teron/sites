// Blood Group BG-2 — who can give red cells to whom, donor data (core/blood.js, no DOM). Run: node --test apps/learn/blood-group/tests/*.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../core/blood.js'), 'utf8'), ctx);
const B = ctx.window.BG, same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);

// independent statement of the red cell rule: donor ABO markers all on the recipient, and donor Rh- or recipient Rh+
const ABO_MARK = { O: [], A: ['A'], B: ['B'], AB: ['A', 'B'] };
const split = g => ({ abo: g.slice(0, -1), rh: g.slice(-1) });
const expectGive = (d, r) => { const a = split(d), b = split(r); return ABO_MARK[a.abo].every(m => ABO_MARK[b.abo].includes(m)) && (a.rh === '-' || b.rh === '+'); };

test('full 8x8 red cell compatibility matrix matches the rules', () => {
  let yes = 0;
  for (const d of B.groups) for (const r of B.groups) { const ok = B.canGive(d, r); assert.strictEqual(ok, expectGive(d, r), d + ' -> ' + r); if (ok) yes++; }
  assert.strictEqual(yes, 27);   // known count of compatible pairs
});
test('spot checks', () => {
  assert.ok(B.canGive('A-', 'AB+')); assert.ok(B.canGive('B+', 'AB+')); assert.ok(B.canGive('O+', 'A+'));
  assert.ok(!B.canGive('A+', 'A-')); assert.ok(!B.canGive('B-', 'A-')); assert.ok(!B.canGive('AB-', 'O-')); assert.ok(!B.canGive('O+', 'O-'));
  assert.ok(!B.canGive('A', 'AB+')); assert.ok(!B.canGive('C+', 'O+'));
});
test('O- gives to all 8, AB+ receives from all 8', () => {
  same(B.givesTo('O-'), JSON.parse(JSON.stringify(B.groups))); same(B.receivesFrom('AB+'), JSON.parse(JSON.stringify(B.groups)));
});
test('AB- receives from 4, O- receives only from O-', () => {
  same(B.receivesFrom('AB-'), ['O-', 'A-', 'B-', 'AB-']); same(B.receivesFrom('O-'), ['O-']);
  same(B.givesTo('AB+'), ['AB+']); same(B.givesTo('A+'), ['A+', 'AB+']);
});
test('givesTo and receivesFrom are inverse of each other', () => {
  for (const a of B.groups) for (const b of B.groups) assert.strictEqual(B.givesTo(a).includes(b), B.receivesFrom(b).includes(a), a + ' / ' + b);
});
test('compatText sentences', () => {
  assert.strictEqual(B.compatText('O-', 'give'), 'O\u2212 can give red cells to all 8 groups.');
  assert.strictEqual(B.compatText('AB+', 'receive'), 'AB+ can receive red cells from all 8 groups.');
  assert.strictEqual(B.compatText('O-', 'receive'), 'O\u2212 can receive red cells from only O\u2212.');
  assert.strictEqual(B.compatText('A+', 'give'), 'A+ can give red cells to A+ and AB+ (2 groups).');
  assert.strictEqual(B.compatText('X', 'give'), '');
});
test('donor data: rules, why and 4 steps', () => {
  const d = B.donor;
  same([d.minAge, d.maxAge, d.minKg, d.minHb, d.gapDays.men, d.gapDays.women], [18, 65, 45, 12.5, 90, 120]);
  same(d.rules.map(r => r.id), ['age', 'weight', 'well', 'hb', 'gap']);
  assert.strictEqual(d.why.length, 3); assert.strictEqual(d.steps.length, 4);
  for (const x of [...d.rules, ...d.why, ...d.steps]) assert.ok(x.title && x.text, JSON.stringify(x));
});
