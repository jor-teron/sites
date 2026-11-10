// Run: node apps/games/sudoku/tests/print.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const gen = require('../core/gen.js');
const sheets = require('../core/print.js');
function validate(p) {
  assert.equal(gen.countSolutions(p.puzzle.slice(), 2), 1);
  assert.equal(p.solution.length, 81);
  for (let i = 0; i < 81; i++) if (p.puzzle[i]) assert.equal(p.puzzle[i], p.solution[i]);
  for (let i = 0; i < 9; i++) {
    const row = p.solution.slice(i * 9, i * 9 + 9);
    const col = Array.from({ length: 9 }, (_, j) => p.solution[j * 9 + i]);
    const box = Array.from({ length: 9 }, (_, j) => p.solution[(Math.floor(i / 3) * 3 + Math.floor(j / 3)) * 9 + i % 3 * 3 + j % 3]);
    for (const group of [row, col, box]) assert.equal(group.slice().sort().join(''), '123456789');
  }
  assert.equal(p.band, gen.band(p.level));
}
for (const difficulty of sheets.bands.concat('Mixed')) test(difficulty + ': 120 unique valid reproducible puzzles', () => {
  const options = { seed: 'paper-2026', perPage: 6, pages: 20, difficulty };
  const a = sheets.create(options);
  assert.deepEqual(a, sheets.create(options));
  assert.deepEqual(a, sheets.create(sheets.readId(a.id)));
  assert.equal(new Set(a.puzzles.map(p => p.puzzle.join(''))).size, 120);
  a.puzzles.forEach(validate);
  if (difficulty === 'Mixed') assert.equal(new Set(a.puzzles.map(p => p.band)).size, 5);
  else a.puzzles.forEach(p => assert.equal(p.band, difficulty));
});
test('all 1000 current puzzles preserve exact in-game givens and solutions', () => {
  for (let level = 0; level < 1000; level++) {
    const current = sheets.create({ current: level });
    const p = current.puzzles[0], original = gen.generate(level);
    assert.deepEqual(p.puzzle, original.puzzle); assert.deepEqual(p.solution, original.solution);
    assert.equal(current.id, 'L1:' + level); validate(p);
  }
});
test('all layouts; limits; safe IDs and different seeds', () => {
  for (const perPage of [1,2,4,6]) {
    const a = sheets.create({ seed: 'abc', perPage, pages: 2 });
    assert.equal(a.puzzles.length, 2 * perPage);
    assert.notDeepEqual(a.puzzles, sheets.create({ seed: 'xyz', perPage, pages: 2 }).puzzles);
  }
  assert.equal(sheets.create({ pages: 99 }).pages, 20);
  assert.equal(sheets.create({ pages: -5, perPage: 3 }).perPage, 1);
  assert.equal(sheets.create({ seed: '<script>' }).seed, '-script-');
  assert.equal(sheets.readId('S1:abc:6:21:5'), null);
  assert.deepEqual(sheets.readId('L1:999'), { current: 999 });
});
