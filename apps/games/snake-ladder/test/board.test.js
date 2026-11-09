/* Scratch test — NOT part of the app.
   Run:  cd games/snake-ladder && node test/board.test.js   */

const fs = require('fs');
const path = require('path');
const core = path.join(__dirname, '..', 'core');

// core/*.js are browser scripts that expect CONFIG etc. as globals.
function loadGlobal(file) {
  const code = fs.readFileSync(path.join(core, file), 'utf8');
  (0, eval)(code);                       // indirect eval => global scope
}
loadGlobal('config.js');
loadGlobal('board.js');
loadGlobal('rules.js');

let deficient = 0, minL = 99, minS = 99, problems = 0;

for (let seed = 0; seed < 100; seed++) {
  const b = Board.generate(seed);
  minL = Math.min(minL, b.ladders.length);
  minS = Math.min(minS, b.snakes.length);

  if (b.ladders.length !== CONFIG.LADDERS || b.snakes.length !== CONFIG.SNAKES) {
    deficient++;
    console.log(`seed ${seed}: ${b.ladders.length} L / ${b.snakes.length} S`);
  }

  const ends = new Set();
  const claim = c => {
    if (ends.has(c)) { console.log('DUP end', seed, c); problems++; }
    ends.add(c);
  };

  for (const { from, to } of b.ladders) {
    if (!(from < to)) { console.log('BAD ladder order', seed, from, to); problems++; }
    if (to - from < CONFIG.MIN_JUMP) { console.log('BAD ladder span', seed, from, to); problems++; }
    claim(from); claim(to);
  }
  for (const { from, to } of b.snakes) {
    if (!(from > to)) { console.log('BAD snake order', seed, from, to); problems++; }
    if (from - to < CONFIG.MIN_JUMP) { console.log('BAD snake span', seed, from, to); problems++; }
    claim(from); claim(to);
  }

  if (ends.has(CONFIG.START_CELL) || ends.has(CONFIG.FINISH_CELL)) {
    console.log('end on start/finish', seed); problems++;
  }

  if (JSON.stringify(b) !== JSON.stringify(Board.generate(seed))) {
    console.log('NOT DETERMINISTIC', seed); problems++;
  }
}

console.log(`\nmin ladders ${minL}/${CONFIG.LADDERS}  min snakes ${minS}/${CONFIG.SNAKES}`);
console.log(`deficient seeds: ${deficient}/100   other problems: ${problems}`);

/* ---------- geometry ---------- */
const seen = new Set();
let geoOk = true;
for (let c = 0; c < 100; c++) {
  const { row, col } = Board.coords(c);
  const key = `${row},${col}`;
  if (seen.has(key)) { console.log('GEOMETRY COLLISION', c); geoOk = false; }
  seen.add(key);
  if (Board.cellAt(row, col) !== c) { console.log('INVERSE MISMATCH', c); geoOk = false; }
}
console.log(geoOk ? 'geometry: 100 unique cells, inverse OK' : 'geometry: FAILED');

/* ---------- rules ---------- */
const p = Rules.createPlayer(0);
console.log('\nstart pos:', p.pos, '| 0 + 6 =>', Rules.targetOf(p, 6));

p.onBoard = true;
p.pos = 97;
console.log('97 + 3 (overshoot) =>', Rules.targetOf(p, 3), '(null = blocked)');
console.log('97 + 2 =>', Rules.targetOf(p, 2));

p.pos = CONFIG.FINISH_CELL;
console.log('on 99 => won:', Rules.hasWon(p));
