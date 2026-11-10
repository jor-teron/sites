/* Pure rules. Cell indices remain 0..99; all UI labels add one. */
const Rules = (() => {
  const defaults = { exact: true, sixAgain: false, sixStart: false };
  function normalize(value = {}) {
    value = value && typeof value === 'object' ? value : {};
    return Object.fromEntries(
      Object.entries(defaults).map(([k, v]) => [k, typeof value[k] === 'boolean' ? value[k] : v]),
    );
  }
  function createPlayer(id, seat = {}, rules = defaults) {
    return {
      id,
      name: CONFIG.PLAYER_NAMES[id],
      color: CONFIG.PLAYER_COLORS[id],
      kind: seat.kind === 'cpu' ? 'cpu' : 'human',
      level: ['easy', 'medium', 'hard'].includes(seat.level) ? seat.level : 'medium',
      pos: CONFIG.START_CELL,
      onBoard: !rules.sixStart,
      rolls: 0,
      finished: false,
    };
  }
  function targetOf(player, roll, rules = defaults) {
    if (!Number.isInteger(roll) || roll < 1 || roll > 6) return null;
    // Six opens the gate; entry consumes that roll and places the pawn on square 1.
    if (!player.onBoard) return !rules.sixStart || roll === 6 ? CONFIG.START_CELL : null;
    const target = player.pos + roll;
    return target > CONFIG.FINISH_CELL ? (rules.exact ? null : CONFIG.FINISH_CELL) : target;
  }
  function applyJump(cell, map) {
    if (!map.has(cell)) return { cell, jump: null };
    const to = map.get(cell);
    return { cell: to, jump: { from: cell, to, kind: to > cell ? 'ladder' : 'snake' } };
  }
  const hasWon = (p) => p.onBoard && p.pos === CONFIG.FINISH_CELL;
  const nextIndex = (index, players) => (index + 1) % players.length;
  return { defaults, normalize, createPlayer, targetOf, applyJump, hasWon, nextIndex };
})();
