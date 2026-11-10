/* There is no move choice in Snakes & Ladders. Do NOT bias the die to fake skill.
   CPU levels change thinking time and board-aware coaching only, never the odds. */
const SNLCPU = (() => {
  function plan(state, level = 'medium') {
    const player = state.players[state.turn];
    const delay = { easy: 1200, medium: 850, hard: 500 }[level] || 850;
    if (level === 'easy') return { delay, message: 'Let’s see what the die brings.' };
    const possible = [];
    for (let die = 1; die <= 6; die++) {
      const target = Rules.targetOf(player, die, state.rules);
      if (target !== null) possible.push({ die, ...Rules.applyJump(target, state.jumpMap), target });
    }
    if (!player.onBoard) return { delay, message: 'Waiting for a six to enter at square 1.' };
    const winning = possible.find((m) => m.cell === CONFIG.FINISH_CELL);
    if (winning) return { delay, message: `A ${winning.die} can reach 100.` };
    const ladder = possible.find((m) => m.jump?.kind === 'ladder');
    if (ladder) return { delay, message: `A ${ladder.die} could climb to ${ladder.cell + 1}.` };
    if (level === 'hard') {
      const snakes = possible.filter((m) => m.jump?.kind === 'snake').length;
      return { delay, message: `${snakes} of six rolls lead to a snake; the die stays fair.` };
    }
    return { delay, message: 'Rolling towards 100.' };
  }
  return { plan };
})();
