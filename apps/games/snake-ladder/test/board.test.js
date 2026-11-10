/* Run node test/board.test.js. One VM context preserves classic-script const bindings. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ console });
for (const file of ['config', 'board', 'rules'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../core', `${file}.js`), 'utf8'), context);
vm.runInContext('globalThis.testApi = { Board, Rules, CONFIG }', context);
const { Board, Rules, CONFIG } = context.testApi;
let assertions = 0;
function check(ok) {
  assertions++;
  assert.ok(ok);
}
for (let seed = 0; seed < 100; seed++) {
  const b = Board.generate(seed),
    used = new Set();
  check(b.ladders.length === 9 && b.snakes.length === 8);
  check(JSON.stringify(b) === JSON.stringify(Board.generate(seed)));
  for (const [kind, connectors] of [
    ['ladder', b.ladders],
    ['snake', b.snakes],
  ])
    for (const j of connectors) {
      check(kind === 'ladder' ? j.to > j.from : j.to < j.from);
      const a = Board.coords(j.from),
        c = Board.coords(j.to);
      check(Math.abs(a.row - c.row) >= CONFIG.MIN_ROWS);
      check(Math.hypot(a.row - c.row, a.col - c.col) >= CONFIG.MIN_DISTANCE);
      check(Math.max(Math.abs(a.row - c.row), Math.abs(a.col - c.col)) > 1);
      for (const cell of [j.from, j.to]) {
        check(!used.has(cell) && cell !== 0 && cell !== 99);
        used.add(cell);
      }
    }
  const cells = [...used];
  for (let i = 0; i < cells.length; i++)
    for (let k = 0; k < i; k++) {
      const a = Board.coords(cells[i]),
        b = Board.coords(cells[k]);
      check(Math.abs(a.row - b.row) + Math.abs(a.col - b.col) >= 2);
    }
}
for (let c = 0; c < 100; c++) {
  const p = Board.coords(c);
  check(Board.cellAt(p.row, p.col) === c);
}
const player = Rules.createPlayer(0);
player.pos = 97;
player.onBoard = true;
check(Rules.targetOf(player, 3) === null);
check(Rules.targetOf(player, 2) === 99);
player.pos = 99;
check(Rules.hasWon(player));
console.log(`PASS ${assertions} assertions: 100 full deterministic boards; geometry; basic rules.`);
