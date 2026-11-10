/* node apps/games/snake-ladder/test/game.test.js — rules / CPU / save / async sessions */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const values = new Map();
const storage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const context = vm.createContext({ console, localStorage: storage, setTimeout: (fn) => queueMicrotask(fn) });
for (const file of ['config', 'board', 'rules', 'ai', 'save', 'engine'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../core', `${file}.js`), 'utf8'), context);
vm.runInContext('globalThis.api = { CONFIG, Board, Rules, SNLCPU, SNLSave, Engine }', context);
const { CONFIG, Board, Rules, SNLCPU, SNLSave, Engine } = context.api;
let checks = 0;
const check = (value, message) => {
  checks++;
  assert.ok(value, message);
};
const equal = (a, b, message) => {
  checks++;
  assert.equal(a, b, message);
};
const plain = (o) => JSON.parse(JSON.stringify(o));
async function test() {
  let p = Rules.createPlayer(0);
  equal(Rules.targetOf(p, 1), 1);
  equal(Rules.targetOf(p, 6), 6);
  for (const exact of [true, false])
    for (const sixStart of [true, false])
      for (const sixAgain of [true, false]) {
        const rules = Rules.normalize({ exact, sixStart, sixAgain });
        p = Rules.createPlayer(0, {}, rules);
        for (let die = 1; die <= 6; die++)
          equal(Rules.targetOf(p, die, rules), sixStart ? (die === 6 ? 0 : null) : die);
        p.onBoard = true;
        p.pos = 97;
        equal(Rules.targetOf(p, 2, rules), 99);
        equal(Rules.targetOf(p, 3, rules), exact ? null : 99);
      }
  equal(Rules.targetOf(p, 7), null);
  equal(Rules.targetOf(p, 0), null);
  const jumpMap = new Map([
    [4, 50],
    [50, 3],
  ]);
  equal(Rules.applyJump(4, jumpMap).cell, 50, 'single connector; no chaining');
  check(!Rules.hasWon({ pos: 99, onBoard: false }));
  check(Rules.hasWon({ pos: 99, onBoard: true }));
  Engine.reset({
    seed: 7,
    seats: [
      { id: 1, kind: 'human' },
      { id: 3, kind: 'cpu', level: 'hard' },
    ],
  });
  equal(Engine.state.players[0].id, 1, 'sparse seat ids supported');
  const initial = Engine.snapshot();
  check(SNLSave.store(initial));
  assert.deepEqual(plain(SNLSave.load()), plain(initial));
  checks++;
  check(Engine.restore(SNLSave.load()));
  assert.deepEqual(plain(Engine.snapshot()), plain(initial));
  checks++;
  for (const invalid of [
    null,
    {},
    { ...initial, version: 1 },
    { ...initial, seed: 100 },
    { ...initial, turn: 3 },
    { ...initial, players: [initial.players[0]] },
    { ...initial, players: [initial.players[0], initial.players[0]] },
    { ...initial, players: [{ ...initial.players[0], pos: NaN }, initial.players[1]] },
    { ...initial, players: [{ ...initial.players[0], kind: 'hacked' }, initial.players[1]] },
    { ...initial, players: [{ ...initial.players[0], rolls: -1 }, initial.players[1]] },
  ])
    check(!SNLSave.clean(invalid), 'reject invalid save');
  values.set(SNLSave.KEY, '{bad');
  equal(SNLSave.load(), null);
  values.set(SNLSave.KEY, 'null');
  equal(SNLSave.load(), null);
  for (const level of ['easy', 'medium', 'hard']) {
    const s = Engine.state,
      before = JSON.stringify(SNLSave.snapshot(s));
    const plan = SNLCPU.plan(s, level);
    check(plan.delay >= 500 && plan.delay <= 1200);
    check(typeof plan.message === 'string');
    equal(JSON.stringify(SNLSave.snapshot(s)), before, 'CPU planning never mutates state');
  }
  vm.runInContext('Math.random = () => .999', context); // fair engine roll always 6 in this fixture
  Engine.reset({ seed: 7, playerCount: 2, rules: { sixAgain: true, sixStart: true } });
  await Engine.roll();
  equal(Engine.state.turn, 0);
  check(Engine.state.players[0].onBoard);
  equal(Engine.state.players[0].pos, 0);
  Engine.reset({ seed: 7, playerCount: 2, rules: { sixAgain: false } });
  await Engine.roll();
  equal(Engine.state.turn, 1);
  Engine.reset({ seed: 7, playerCount: 2 });
  const beforeRoll = JSON.stringify(Engine.snapshot()),
    pending = Engine.roll();
  Engine.cancel();
  await pending;
  equal(JSON.stringify(Engine.snapshot()), beforeRoll, 'Quit during dice rolls back');
  check(!Engine.state.rolling);
  Engine.reset({ seed: 7, playerCount: 2 });
  const old = Engine.roll();
  Engine.reset({ seed: 9, playerCount: 3 });
  const replacement = JSON.stringify(Engine.snapshot());
  await old;
  equal(JSON.stringify(Engine.snapshot()), replacement, 'old roll cannot change a new game');
  check(!Engine.state.rolling);
  let release,
    hold = false;
  Engine.on('step', () => (hold ? new Promise((r) => (release = r)) : undefined));
  Engine.reset({ seed: 7, playerCount: 2 });
  hold = true;
  const moving = Engine.roll();
  for (let i = 0; i < 12 && !release; i++) await Promise.resolve();
  check(release, 'reached a hop await');
  Engine.cancel();
  const rolledBack = JSON.stringify(Engine.snapshot());
  hold = false;
  release();
  await moving;
  equal(JSON.stringify(Engine.snapshot()), rolledBack, 'Quit during hop cannot resume the old operation');
  let rideRelease,
    rideHold = true;
  Engine.on('jump-start', () => (rideHold ? new Promise((r) => (rideRelease = r)) : undefined));
  Engine.reset({ seed: 7, playerCount: 2 });
  const foot = Engine.state.board.ladders.find((l) => l.from > 6).from;
  Engine.state.players[0].pos = foot - 6;
  const riding = Engine.roll();
  for (let i = 0; i < 100 && !rideRelease; i++) await Promise.resolve();
  check(rideRelease, 'reached connector await');
  Engine.reset({ seed: 8, playerCount: 2 });
  const fresh = JSON.stringify(Engine.snapshot());
  rideHold = false;
  rideRelease();
  await riding;
  equal(JSON.stringify(Engine.snapshot()), fresh, 'new Start cancels an old connector ride');
  // One completed all-CPU game per seed, all three levels. No biased/selected die values.
  let totalRolls = 0,
    longest = 0;
  for (let seed = 0; seed < 100; seed++) {
    vm.runInContext(`Math.random = Board.rng(${seed + 1200})`, context);
    Engine.reset({
      seed,
      seats: [
        { id: 0, kind: 'cpu', level: 'easy' },
        { id: 1, kind: 'cpu', level: 'medium' },
        { id: 2, kind: 'cpu', level: 'hard' },
      ],
    });
    let turns = 0;
    while (!Engine.state.over && turns < 5000) {
      const s = Engine.state,
        player = s.players[s.turn];
      check(SNLCPU.plan(s, player.level).delay > 0);
      await Engine.roll();
      turns++;
      if (!Engine.state.over) {
        check(SNLSave.store(Engine.snapshot()));
        check(!!SNLSave.load());
        if (turns % 13 === 0) check(Engine.restore(SNLSave.load()), 'midgame resume');
      }
    }
    check(Engine.state.over, `all-CPU seed ${seed} finishes`);
    equal(Engine.state.players.filter(Rules.hasWon).length, 1);
    totalRolls += turns;
    longest = Math.max(longest, turns);
  }
  SNLSave.clear();
  equal(SNLSave.load(), null);
  console.log(
    `PASS ${checks} checks; 100 all-CPU games completed in ${totalRolls} rolls (longest ${longest}); rules; save/resume; dice/hop/ride cancellation.`,
  );
}
test().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
