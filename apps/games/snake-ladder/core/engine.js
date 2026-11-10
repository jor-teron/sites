/* Async state machine. Every await is guarded by both session identity and epoch.
   Observers return animation promises. Cancelling always rolls back to a settled turn. */
const Engine = (() => {
  let state = null,
    epoch = 0,
    stable = null;
  const listeners = {};
  const on = (event, fn) => {
    (listeners[event] ||= []).push(fn);
  };
  const emit = (event, payload) => Promise.all((listeners[event] || []).map((fn) => fn(payload)));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function hydrate(data) {
    const board = Board.generate(data.seed);
    return {
      ...data,
      players: data.players.map((p) => ({ ...p })),
      rules: { ...data.rules },
      board,
      jumpMap: Board.buildJumpMap(board),
      rolling: false,
    };
  }
  function settle() {
    stable = SNLSave.snapshot(state);
    emit('settled', state);
  }
  function reset({ seed, playerCount = 2, seats, rules = Rules.defaults }) {
    rules = Rules.normalize(rules);
    const selected = seats || Array.from({ length: playerCount }, (_, id) => ({ id, kind: 'human' }));
    if (
      !Number.isInteger(seed) ||
      seed < 0 ||
      seed > 99 ||
      selected.length < 2 ||
      selected.length > 4 ||
      new Set(selected.map((p) => p.id)).size !== selected.length ||
      selected.some((p) => !Number.isInteger(p.id) || p.id < 0 || p.id > 3)
    )
      throw new Error('Choose 2–4 seats and a seed 0–99');
    epoch++;
    state = hydrate({
      seed,
      players: selected.map((p) => Rules.createPlayer(p.id, p, rules)),
      rules,
      turn: 0,
      over: false,
    });
    emit('reset', state);
    settle();
    emit('turn', { player: state.players[state.turn] });
    return state;
  }
  function restore(data) {
    const safe = SNLSave.clean(data);
    if (!safe) return false;
    epoch++;
    state = hydrate(safe);
    stable = SNLSave.snapshot(state);
    emit('reset', state);
    emit('turn', { player: state.players[state.turn] });
    return true;
  }
  function cancel() {
    epoch++;
    if (stable) state = hydrate(stable);
    emit('cancel', state);
    return state;
  }
  async function roll() {
    if (!state || state.over || state.rolling) return;
    const s = state,
      token = epoch,
      alive = () => state === s && token === epoch;
    s.rolling = true;
    try {
      const player = s.players[s.turn];
      player.rolls++;
      const value = 1 + Math.floor(Math.random() * 6);
      emit('roll-start', { player, value });
      await sleep(CONFIG.DICE_MS);
      if (!alive()) return;
      emit('rolled', { player, value });
      const target = Rules.targetOf(player, value, s.rules);
      if (target === null) {
        emit('blocked', {
          needed: !player.onBoard ? 6 : CONFIG.FINISH_CELL - player.pos,
          entry: !player.onBoard,
        });
      } else {
        const from = player.pos;
        player.onBoard = true;
        // Entry on a six stays at square 1; ordinary moves hop along every cell.
        if (target === from) {
          await emit('hop', { player, from, cell: target });
          if (!alive()) return;
        }
        for (let cell = from + 1; cell <= target; cell++) {
          player.pos = cell;
          await emit('step', { player, from: cell - 1, cell });
          if (!alive()) return;
        }
        const { cell, jump } = Rules.applyJump(player.pos, s.jumpMap);
        if (jump) {
          await emit('jump-start', { player, ...jump });
          if (!alive()) return;
          player.pos = cell;
          emit('jump', { player, ...jump });
        }
        if (Rules.hasWon(player)) {
          player.finished = true;
          s.over = true;
          s.rolling = false;
          emit('win', { player });
          settle();
          await sleep(200);
          if (!alive()) return;
          emit('gameover', { player, state: s });
          return;
        }
      }
      if (s.rules.sixAgain && value === 6) emit('extra-turn', { player });
      else s.turn = Rules.nextIndex(s.turn, s.players);
      s.rolling = false;
      settle();
      emit('turn', { player: s.players[s.turn] });
    } finally {
      // An older operation must never unlock or mutate a replacement game.
      if (alive()) s.rolling = false;
    }
  }
  return {
    reset,
    restore,
    cancel,
    roll,
    on,
    get state() {
      return state;
    },
    snapshot: () => (stable ? JSON.parse(JSON.stringify(stable)) : null),
  };
})();
