/* engine.js — game state machine. Async because moves animate.
   Emits simple events; Ui/Render subscribe. No rendering code here. */

const Engine = (() => {

  let state = null;
  const listeners = {};

  function on(evt, fn) {
    (listeners[evt] ||= []).push(fn);
  }
  function emit(evt, payload) {
    for (const fn of listeners[evt] || []) fn(payload);
  }

  function reset({ seed, playerCount }) {
    const board = Board.generate(seed);
    state = {
      seed,
      board,
      jumpMap: Board.buildJumpMap(board),
      players: Array.from({ length: playerCount }, (_, i) => Rules.createPlayer(i)),
      turn: 0,
      rolling: false,
      over: false
    };
    emit('reset', state);
    return state;
  }

  function current() {
    return state.players[state.turn];
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function roll() {
    // guard re-entry: an animation in progress blocks a second roll
    if (!state || state.over || state.rolling) return;
    state.rolling = true;

    try {
      const player = current();
      player.rolls++;

      const value = 1 + Math.floor(Math.random() * 6);
      emit('roll-start', { player, value });
      await sleep(CONFIG.DICE_MS);
      emit('rolled', { player, value });

      const target = Rules.targetOf(player, value);

      if (target === null) {
        // overshoot: cannot move, turn passes
        emit('blocked', {
          player,
          value,
          from: player.pos,
          needed: CONFIG.FINISH_CELL - player.pos
        });
        await sleep(320);
      } else {
        const from = player.onBoard ? player.pos : null;
        player.onBoard = true;

        if (from === null || target - from <= 1) {
          // quick hop in from the start square, or a single-cell nudge
          player.pos = target;
          emit('hop', { player, cell: target });
          await sleep(CONFIG.HOP_MS * 2);
        } else {
          // walk one cell at a time
          for (let c = from + 1; c <= target; c++) {
            player.pos = c;
            emit('step', { player, cell: c });
            await sleep(CONFIG.HOP_MS);
          }
        }

        // connector (applied once — no chaining, see CONFIG.MAX_CHAIN)
        const { cell, jump } = Rules.applyJump(player.pos, state.jumpMap);
        if (jump) {
          await sleep(120);
          player.pos = cell;
          emit('jump', { player, ...jump });
          await sleep(360);
        }

        if (Rules.hasWon(player)) {
          player.finished = true;
          state.over = true;
          emit('win', { player });
          await sleep(300);
          emit('gameover', { player, state });
          return;
        }
      }

      if (CONFIG.SIX_ROLLS_AGAIN && value === 6) {
        emit('extra-turn', { player });
      } else {
        state.turn = Rules.nextIndex(state.turn, state.players);
      }

      emit('turn', { player: current() });

    } finally {
      state.rolling = false;
    }
  }

  return { reset, roll, on, get state() { return state; } };
})();
