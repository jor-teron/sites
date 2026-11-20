// Blood Group BG-3 — inheritance: parents to child, genotypes, Punnett and guess (core/blood.js, no DOM).
// Run: node --test apps/learn/blood-group/tests/*.cjs
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../core/blood.js'), 'utf8'), ctx);
const B = ctx.window.BG, same = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);

test('O x O gives only O', () => {
  same(B.childABO('O', 'O'), ['O']);
  same(B.childGroups('O+', 'O+'), ['O-', 'O+']);
  same(B.childGroups('O-', 'O+'), ['O-', 'O+']);
  assert.ok(B.canHaveChild('O+', 'O-', 'O+'));
  assert.ok(!B.canHaveChild('O+', 'O+', 'A+'));
  assert.ok(!B.canHaveChild('O+', 'O+', 'B-'));
  assert.ok(!B.canHaveChild('O+', 'O+', 'AB+'));
});

test('A x B can give A, B, AB and O', () => {
  same(B.childABO('A', 'B'), ['O', 'A', 'B', 'AB']);
  same(B.childABO('B', 'A'), ['O', 'A', 'B', 'AB']);
  for (const abo of B.ABO) for (const rh of ['+', '-']) {
    assert.ok(B.canHaveChild('A+', 'B+', abo + rh), abo + rh);
  }
});

test('AB x O gives A or B only', () => {
  same(B.childABO('AB', 'O'), ['A', 'B']);
  same(B.childABO('O', 'AB'), ['A', 'B']);
  same(B.childGroups('AB-', 'O+'), ['A-', 'A+', 'B-', 'B+']);
  assert.ok(B.canHaveChild('AB+', 'O-', 'A+'));
  assert.ok(B.canHaveChild('O+', 'AB+', 'B-'));
  assert.ok(!B.canHaveChild('AB+', 'O+', 'O+'));
  assert.ok(!B.canHaveChild('AB+', 'O+', 'AB+'));
});

test('Rh- x Rh- gives Rh- only', () => {
  same(B.childRh('-', '-'), ['-']);
  same(B.childRh('+', '-'), ['+', '-']);
  same(B.childRh('+', '+'), ['+', '-']);
  assert.ok(B.canHaveChild('A-', 'B-', 'AB-'));
  assert.ok(!B.canHaveChild('A-', 'B-', 'AB+'));
  assert.ok(!B.canHaveChild('O-', 'O-', 'O+'));
  assert.ok(B.canHaveChild('O+', 'O-', 'O-'));   // + parent can hide a d
});

test('AB can never come from an O parent', () => {
  for (const other of B.groups) for (const rh of ['+', '-']) {
    assert.ok(!B.canHaveChild('O+', other, 'AB' + rh), 'O+ x ' + other + ' -> AB' + rh);
    assert.ok(!B.canHaveChild('O-', other, 'AB' + rh), 'O- x ' + other);
    assert.ok(!B.canHaveChild(other, 'O+', 'AB' + rh), other + ' x O+');
  }
});

test('more ABO possibility tables', () => {
  same(B.childABO('A', 'A'), ['O', 'A']);
  same(B.childABO('B', 'B'), ['O', 'B']);
  same(B.childABO('A', 'O'), ['O', 'A']);
  same(B.childABO('B', 'O'), ['O', 'B']);
  same(B.childABO('A', 'AB'), ['A', 'B', 'AB']);
  same(B.childABO('B', 'AB'), ['A', 'B', 'AB']);
  same(B.childABO('AB', 'AB'), ['A', 'B', 'AB']);
  assert.ok(!B.canHaveChild('A+', 'A+', 'B+'));
  assert.ok(!B.canHaveChild('A+', 'A+', 'AB-'));
  assert.ok(!B.canHaveChild('AB+', 'AB+', 'O+'));
  assert.ok(B.canHaveChild('A+', 'A+', 'O-'));
});

test('genotype helpers', () => {
  same(B.aboGenos('A'), ['AA', 'AO']); same(B.aboGenos('B'), ['BB', 'BO']);
  same(B.aboGenos('O'), ['OO']); same(B.aboGenos('AB'), ['AB']);
  same(B.rhGenos('+'), ['DD', 'Dd']); same(B.rhGenos('-'), ['dd']);
  same(B.aboGenos('X'), []); same(B.rhGenos(''), []);
  assert.strictEqual(B.aboPheno('AA'), 'A'); assert.strictEqual(B.aboPheno('AO'), 'A');
  assert.strictEqual(B.aboPheno('OA'), 'A'); assert.strictEqual(B.aboPheno('BO'), 'B');
  assert.strictEqual(B.aboPheno('AB'), 'AB'); assert.strictEqual(B.aboPheno('BA'), 'AB');
  assert.strictEqual(B.aboPheno('OO'), 'O'); assert.strictEqual(B.aboPheno('XX'), null);
  assert.strictEqual(B.rhPheno('DD'), '+'); assert.strictEqual(B.rhPheno('Dd'), '+');
  assert.strictEqual(B.rhPheno('dD'), '+'); assert.strictEqual(B.rhPheno('dd'), '-');
  assert.strictEqual(B.rhPheno('D'), null);
});

test('Punnett square for AO x BO and Dd x dd', () => {
  const abo = B.punnett('AO', 'BO');
  same(abo.rows, ['A', 'O']); same(abo.cols, ['B', 'O']);
  same(abo.cells, [['AB', 'AO'], ['BO', 'OO']]);
  const rh = B.punnett('Dd', 'dd');
  same(rh.cells, [['Dd', 'Dd'], ['dd', 'dd']]);
  assert.strictEqual(B.punnett('A', 'OO'), null);
  assert.strictEqual(B.punnett('', 'Dd'), null);
});

test('known-genotype odds', () => {
  const pct = (odds, g) => odds.rows.find(r => r.group === g);
  const aoOo = B.childOdds('AO', 'OO', 'dd', 'dd');
  assert.strictEqual(aoOo.total, 16);
  assert.strictEqual(pct(aoOo, 'A-').n, 8); assert.strictEqual(pct(aoOo, 'O-').n, 8);
  assert.strictEqual(pct(aoOo, 'A-').pct, 50); assert.strictEqual(pct(aoOo, 'A+').n, 0);
  const aaOo = B.childOdds('AA', 'OO', 'DD', 'dd');
  assert.strictEqual(pct(aaOo, 'A+').n, 16); assert.strictEqual(pct(aaOo, 'A+').pct, 100);
  const aoBo = B.childOdds('AO', 'BO', 'DD', 'DD');
  for (const g of ['A+', 'B+', 'AB+', 'O+']) assert.strictEqual(pct(aoBo, g).n, 4, g);
  const het = B.childOdds('AO', 'OO', 'Dd', 'dd');
  for (const g of ['A+', 'A-', 'O+', 'O-']) assert.strictEqual(pct(het, g).pct, 25, g);
  const rec = B.childOdds('AO', 'AO', 'Dd', 'Dd');
  assert.strictEqual(pct(rec, 'A+').n, 9);   // 3/4 ABO A * 3/4 Rh+ = 9/16
  assert.strictEqual(pct(rec, 'A-').n, 3);
  assert.strictEqual(pct(rec, 'O+').n, 3);
  assert.strictEqual(pct(rec, 'O-').n, 1);
  assert.strictEqual(B.childOdds('AX', 'OO', 'dd', 'dd'), null);
  assert.strictEqual(B.childOdds('AO', 'OO', 'D', 'dd'), null);
});

test('childGroups needs full groups; bad input is empty or false', () => {
  same(B.childGroups('A', 'B+'), []);
  same(B.childGroups('X+', 'O+'), []);
  same(B.childGroups('', ''), []);
  assert.ok(!B.canHaveChild('A+', 'B+', 'A'));
  assert.ok(!B.canHaveChild('A+', 'B+', 'C+'));
  assert.ok(!B.canHaveChild('', 'O+', 'O+'));
  assert.strictEqual(B.inheritWhy('A+', 'B+', 'C+'), '');
});

test('inheritWhy explains yes and no', () => {
  const yesAB = B.inheritWhy('A+', 'B+', 'AB-');
  assert.ok(yesAB.startsWith('Yes.'), yesAB);
  assert.ok(/A from one parent and B from the other/i.test(yesAB), yesAB);
  const yesO = B.inheritWhy('A+', 'B+', 'O+');
  assert.ok(/hidden O/i.test(yesO), yesO);
  const noO = B.inheritWhy('O+', 'O-', 'A+');
  assert.ok(noO.startsWith('No.'), noO);
  assert.ok(/only be group O/i.test(noO), noO);
  const noAB = B.inheritWhy('O+', 'A+', 'AB+');
  assert.ok(/O parent can only pass O/i.test(noAB), noAB);
  const noRh = B.inheritWhy('A-', 'B-', 'A+');
  assert.ok(/always Rh negative/i.test(noRh), noRh);
  const noABxO = B.inheritWhy('AB+', 'O+', 'O+');
  assert.ok(/AB parent has no O/i.test(noABxO), noABxO);
});

test('makeGuess: exactly one parent pair can have the child', () => {
  // 40 draws with a seeded-style Math.random stand-in and with Math.random
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 40; i++) {
    const q = B.makeGuess(i < 20 ? rnd : Math.random);
    assert.ok(q && B.groups.includes(q.child), JSON.stringify(q));
    assert.strictEqual(q.pairs.length, 2);
    assert.ok(q.answer === 0 || q.answer === 1);
    const ok0 = B.canHaveChild(q.pairs[0].mum, q.pairs[0].dad, q.child);
    const ok1 = B.canHaveChild(q.pairs[1].mum, q.pairs[1].dad, q.child);
    assert.strictEqual(ok0, q.answer === 0, JSON.stringify(q));
    assert.strictEqual(ok1, q.answer === 1, JSON.stringify(q));
    assert.ok(ok0 !== ok1);
    const why = B.inheritWhy(q.pairs[q.answer].mum, q.pairs[q.answer].dad, q.child);
    assert.ok(why.startsWith('Yes.'), why);
    const no = B.inheritWhy(q.pairs[1 - q.answer].mum, q.pairs[1 - q.answer].dad, q.child);
    assert.ok(no.startsWith('No.'), no);
  }
});
