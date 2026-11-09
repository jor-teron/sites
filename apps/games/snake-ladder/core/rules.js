/* rules.js — pure game rules. No DOM, no state mutation outside its args. */

const Rules = (() => {

  function createPlayer(id) {
    return {
      id,                                  // 0-based
      name: CONFIG.PLAYER_NAMES[id],
      color: CONFIG.PLAYER_COLORS[id],
      pos: CONFIG.START_CELL,
      onBoard: !CONFIG.REQUIRED_TO_START,
      rolls: 0,
      finished: false
    };
  }

  /* returns the cell the player would occupy after rolling `roll`.
     null => move not allowed (overshoot when exact finish is required). */
  function targetOf(player, roll) {
    if (!player.onBoard) return CONFIG.START_CELL + roll;
    const t = player.pos + roll;
    if (t > CONFIG.FINISH_CELL) {
      return CONFIG.EXACT_ROLL_TO_FINISH ? null : CONFIG.FINISH_CELL;
    }
    return t;
  }

  /* applies a connector at `cell` once (no chaining), returns {cell, jump} */
  function applyJump(cell, jumpMap) {
    if (!jumpMap.has(cell)) return { cell, jump: null };
    const to = jumpMap.get(cell);
    const kind = to > cell ? 'ladder' : 'snake';
    return { cell: to, jump: { from: cell, to, kind } };
  }

  function hasWon(player) {
    return player.pos === CONFIG.FINISH_CELL;
  }

  function nextIndex(current, players) {
    return (current + 1) % players.length;
  }

  return { createPlayer, targetOf, applyJump, hasWon, nextIndex };
})();
