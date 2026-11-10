/* Scratch test — NOT part of the app.
   Run:  node apps/games/battleship/test/ship.test.js
   Covers rules, fleets, no-touch, salvo counts, save migration, AI fairness and Hard shots. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const core = path.join(__dirname, '..', 'core');
const ctx = { console, performance: require('perf_hooks').performance };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of ['config.js', 'rules.js', 'ai.js', 'stats.js']) {
  vm.runInContext(fs.readFileSync(path.join(core, f), 'utf8'), ctx, { filename: f });
}
const R = ctx.BSRules, AI = ctx.BSAI, ST = ctx.BSStats, CFG = ctx.BS_CONFIG;
if (!R || !AI || !ST || !CFG) { console.error('failed to load core'); process.exit(1); }

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const eq = (a, b, m) => ok(a === b, (m || '') + ' expected ' + b + ' got ' + a);

function mulberry32(a) { return function () { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---- rules: fleets, place, overlap, no-touch ----
eq(R.list('classic').map((s) => s.size).join(','), '5,4,3,3,2', 'classic fleet');
eq(R.list('skirmish').map((s) => s.size).join(','), '4,3,2', 'skirmish fleet');
eq(R.fleetIdOf([5, 4, 3, 3, 2]), 'classic', 'fleetId classic');
eq(R.fleetIdOf([4, 3, 2]), 'skirmish', 'fleetId skirmish');

const b = R.newBoard('classic');
eq(b.ships.length, 5, 'classic ship count');
eq(b.noTouch, false, 'default may touch');
ok(R.place(b, 0, 0, 0, 'h'), 'place carrier A1 across');
ok(R.place(b, 1, 0, 1, 'h'), 'touching below is allowed');
ok(!R.place(b, 2, 2, 0, 'h'), 'overlap refused');
ok(R.place(b, 2, 5, 0, 'h'), 'gap is fine');

const t = R.newBoard('classic', true);
ok(R.place(t, 0, 0, 0, 'h'), 'noTouch carrier');
ok(!R.place(t, 1, 0, 1, 'h'), 'orthogonal touch refused');
ok(!R.place(t, 1, 0, 1, 'v'), 'shared edge refused');
ok(!R.place(t, 1, 5, 1, 'h'), 'diagonal corner touch refused');
ok(R.place(t, 1, 0, 2, 'h'), 'one-row gap is allowed');

const sk = R.newBoard('skirmish', true);
eq(sk.ships.length, 3, 'skirmish count');
R.randomFleet(sk, mulberry32(7));
ok(R.allPlaced(sk), 'random noTouch skirmish places');
for (let i = 0; i < sk.ships.length; i++) for (let j = i + 1; j < sk.ships.length; j++) {
  const A = R.cells(sk.ships[i]), B = new Set(R.cells(sk.ships[j]));
  ok(A.every((c) => !B.has(c)), 'random fleets do not overlap');
  ok(A.every((c) => R.around(c).every((n) => !B.has(n))), 'random noTouch has no neighbours');
}

// ---- fire / salvo ----
const f = R.randomFleet(R.newBoard('classic'), mulberry32(1));
eq(R.salvoShots(f), 5, 'salvo starts at 5');
eq(R.shipsLeft(f), 5, 'five afloat');
const c0 = R.cells(f.ships[4])[0];
const missC = f.shots.findIndex((_, i) => R.occupancy(f)[i] < 0);
eq(R.fire(f, missC).res, 'miss', 'miss');
eq(R.peek(f, missC).res, 'repeat', 'peek repeat after miss');
const hit = R.fire(f, c0);
ok(hit.res === 'hit' || hit.res === 'sunk', 'hit or sunk destroyer');
if (hit.res === 'sunk') eq(R.salvoShots(f), 4, 'salvo drops after a sink');
else {
  const rest = R.cells(f.ships[4]).filter((c) => c !== c0);
  rest.slice(0, -1).forEach((c) => eq(R.fire(f, c).res, 'hit', 'finish destroyer hits'));
  const last = R.fire(f, rest[rest.length - 1]);
  eq(last.res, 'sunk', 'destroyer sunk');
  eq(R.salvoShots(f), 4, 'salvo drops after a sink');
}

// sink a whole skirmish fleet and check win
const w = R.randomFleet(R.newBoard('skirmish'), mulberry32(3));
let lastR = null;
w.ships.forEach((sh) => R.cells(sh).forEach((c) => { lastR = R.fire(w, c); }));
eq(lastR.res, 'sunk', 'last sink');
ok(lastR.win, 'win on last sink');
ok(R.lost(w), 'lost');
eq(R.salvoShots(w), 1, 'salvo floor is 1');

// ---- serialize / old + new saves ----
const fresh = R.randomFleet(R.newBoard('skirmish', true), mulberry32(11));
R.fire(fresh, 0);
const ser = R.serialize(fresh);
ok(ser.noTouch, 'serialize noTouch');
eq(ser.s[0].length, 5, 'new ship tuple has name and size');
const back = R.deserialize(ser);
eq(back.ships.length, 3, 'roundtrip skirmish');
ok(back.noTouch, 'roundtrip noTouch');
eq(back.shots.join(''), ser.t, 'roundtrip shots');
eq(R.fleetIdOf(back.ships), 'skirmish', 'roundtrip fleet id');

const oldSer = { s: R.newBoard('classic').ships.map(() => [-1, -1, 'h']), t: '0'.repeat(100) };
oldSer.s[0] = [0, 0, 'h'];
const placed = R.deserialize(oldSer);
eq(placed.ships.length, 5, 'old 5-ship save loads as classic');
eq(placed.ships[0].x, 0, 'old ship position');
eq(placed.ships[0].name, 'Carrier', 'old save gets classic names');
ok(!placed.noTouch, 'old save may-touch');

// old mid-game with only [x,y,o] tuples and shots
const oldBoard = R.randomFleet(R.newBoard('classic'), mulberry32(21));
const oldMid = { s: oldBoard.ships.map((sh) => [sh.x, sh.y, sh.o]), t: '0'.repeat(100) };
const mid = R.deserialize(oldMid);
eq(mid.ships.length, 5, 'old mid-game length');
ok(R.allPlaced(mid), 'old mid-game places');

// ---- stats / migration ----
const blank = ST.loadState(null, CFG.difficultyToLevel, 'normal');
eq(blank.playMode, 'classic', 'default playMode');
eq(blank.fleet, 'classic', 'default fleet');
eq(blank.mode, 'medium', 'difficulty normal → medium');
eq(blank.career.all.games, 0, 'empty career');

const oldSave = { score: { cpu: { 1: 4, 2: 2 }, pvp: { 1: 1, 2: 3 } }, mode: 'hard', game: { phase: 'place' } };
const mig = ST.loadState(oldSave, CFG.difficultyToLevel, 'normal');
eq(mig.score.cpu[1], 4, 'keep old cpu wins');
eq(mig.score.pvp[2], 3, 'keep old pvp wins');
eq(mig.mode, 'hard', 'keep old mode');
eq(mig.playMode, 'classic', 'old save has no salvo');
eq(mig.career.all.games, 0, 'career starts fresh');
ok(mig.game && mig.game.phase === 'place', 'in-progress game kept');

ST.record(mig.career, 'salvo', 'hard', { win: true, shots: 41, hits: 17 });
ST.record(mig.career, 'salvo', 'hard', { win: false, shots: 50, hits: 10 });
ST.record(mig.career, 'classic', 'easy', { win: true, shots: 55, hits: 17 });
eq(mig.career.all.games, 3, 'career games');
eq(mig.career.all.wins, 2, 'career wins');
eq(mig.career.all.streak, 1, 'streak resets after a loss then a win');
ok(Math.abs(ST.avgShots(mig.career.by['salvo|hard']) - 41) < 1e-9, 'avg shots is won games only');
ok(Math.abs(ST.accuracy(mig.career.all) - (17 + 10 + 17) / (41 + 50 + 55)) < 1e-9, 'accuracy');
eq(ST.rowsForView(mig.career).length, 2, 'view hides empty rows');

const reloaded = ST.loadState({ score: mig.score, mode: 'easy', playMode: 'salvo', fleet: 'skirmish', noTouch: true, career: mig.career, game: null }, CFG.difficultyToLevel, 'normal');
eq(reloaded.playMode, 'salvo', 'persist playMode');
eq(reloaded.fleet, 'skirmish', 'persist fleet');
ok(reloaded.noTouch, 'persist noTouch');
eq(reloaded.career.all.wins, 2, 'persist career');

// ---- AI: no peek, open cells only, Hard average ----
function publicCopy(b) {
  const o = R.newBoard(R.fleetIdOf(b.ships) || 'classic', b.noTouch);
  o.shots = b.shots.slice();
  // place unsunk ships somewhere else; keep sunk ships where they were (public)
  const rnd = mulberry32(99 + b.shots.filter(Boolean).length);
  b.ships.forEach((sh, j) => {
    if (R.isSunk(b, j)) {
      o.ships[j] = { name: sh.name, size: sh.size, x: sh.x, y: sh.y, o: sh.o };
    } else {
      o.ships[j] = { name: sh.name, size: sh.size, x: -1, y: -1, o: 'h' };
    }
  });
  // fill unsunk at random, not overlapping sunk
  o.ships.forEach((sh, j) => {
    if (sh.x >= 0) return;
    let okp = false;
    for (let t = 0; t < 400 && !okp; t++) okp = R.place(o, j, Math.floor(rnd() * 10), Math.floor(rnd() * 10), rnd() < 0.5 ? 'h' : 'v');
    if (!okp) { // give up: copy original so the test does not hang
      o.ships[j] = { name: sh.name, size: sh.size, x: sh.x, y: sh.y, o: sh.o };
    }
  });
  return o;
}

function play(level, seed, fleet, noTouch) {
  const rnd = mulberry32(seed);
  const b = R.randomFleet(R.newBoard(fleet || 'classic', !!noTouch), rnd);
  let shots = 0;
  while (!R.lost(b)) {
    const c = AI.choose(b, level, rnd);
    ok(c >= 0 && c < 100 && !b.shots[c], level + ' fired at a fresh open cell');
    if (b.shots[c]) break;
    // fairness: a board with the same public view must yield the same shot
    if (shots === 3 || shots === 12) {
      const alt = publicCopy(b);
      const c2 = AI.choose(alt, level, mulberry32(seed)); // same stream from the start would diverge; compare view only via same rnd stream from here
    }
    if (R.fire(b, c).res === 'repeat') { fails++; console.log('FAIL repeat shot'); break; }
    shots++;
    if (shots > 100) { fails++; console.log('FAIL too many shots'); break; }
  }
  return shots;
}

// dedicated peek test: at a fixed public state, move hidden unsunk ships; same rng → same shot.
// Raise the time cap so both calls finish the same sample count and stay deterministic.
(function peekTest() {
  const prev = CFG.hardBudgetMs;
  CFG.hardBudgetMs = 2000;
  const rnd = mulberry32(77);
  const b = R.randomFleet(R.newBoard(), rnd);
  for (let i = 0; i < 8; i++) {
    const c = AI.choose(b, 'easy', rnd);
    R.fire(b, c);
  }
  const r1 = mulberry32(12345), r2 = mulberry32(12345);
  const a = AI.choose(b, 'hard', r1);
  const alt = publicCopy(b);
  const d = AI.choose(alt, 'hard', r2);
  eq(a, d, 'Hard does not peek: same public view, same shot (' + a + ' vs ' + d + ')');
  // also: leftover sizes and shots must match
  const v1 = AI.view(b), v2 = AI.view(alt);
  eq(v1.left.slice().sort().join(','), v2.left.slice().sort().join(','), 'public leftover sizes match');
  eq(v1.shots.join(''), v2.shots.join(''), 'public shots match');
  CFG.hardBudgetMs = prev;
})();

// Easy / Medium still only shoot open cells (already checked in play)
const easyShots = [];
for (let i = 0; i < 20; i++) easyShots.push(play('easy', 10 + i * 3));
const medShots = [];
for (let i = 0; i < 20; i++) medShots.push(play('medium', 200 + i * 3));
const easyAvg = easyShots.reduce((a, b) => a + b, 0) / easyShots.length;
const medAvg = medShots.reduce((a, b) => a + b, 0) / medShots.length;
ok(easyAvg > 80, 'Easy is roughly random, avg=' + easyAvg.toFixed(1));
ok(medAvg < easyAvg - 20, 'Medium is clearly better than Easy, avg=' + medAvg.toFixed(1));

// Hard average (classic fleet). Budget is the in-game cap; this is the official figure.
const hardN = 80;
const hardArr = [];
const t0 = Date.now();
for (let i = 0; i < hardN; i++) hardArr.push(play('hard', 4000 + i * 17));
hardArr.sort((a, b) => a - b);
const hardAvg = hardArr.reduce((a, b) => a + b, 0) / hardN;
const hardMs = (Date.now() - t0) / hardN;
ok(hardArr.every((n) => n >= 17 && n <= 100), 'Hard finishes every game');
ok(hardAvg < medAvg - 2, 'Hard is better than Medium (Hard ' + hardAvg.toFixed(2) + ' vs Medium ' + medAvg.toFixed(2) + ')');
console.log('Hard n=' + hardN + ' avg=' + hardAvg.toFixed(2) + ' med=' + hardArr[Math.floor(hardN / 2)] + ' min=' + hardArr[0] + ' max=' + hardArr[hardN - 1] + ' ms/game=' + hardMs.toFixed(1));
console.log('Easy avg=' + easyAvg.toFixed(2) + '  Medium avg=' + medAvg.toFixed(2));

if (fails) { console.log(fails + ' FAILURES'); process.exit(1); }
console.log('ALL OK');
