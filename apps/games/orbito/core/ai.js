/*
 * Orbito — computer player (ORB-1). OrbAI.choose(s, level, rnd) → a turn { mv, place } for s.toPlay.
 * Pure: works on copies. Every turn is judged on the board after it turns, as the rules do.
 *   easy   — any legal turn at random, but it takes a win lying right there half the time.
 *   medium — takes a win; otherwise the best-looking board (lines filling up with its own marbles,
 *            counted both now and after the next turn of the board, minus the rival's).
 *   hard   — takes a win; never leaves the rival a winning reply when it can help it (looks one full
 *            rival turn ahead, board turns included); then the best-looking board, preferring turns
 *            that leave two ways to win. Time-capped by ORB_CONFIG.aiCapMs.
 */
const OrbAI = (() => {
  const C = ORB_CONFIG, R = OrbRules;
  const W = [0, 1, 6, 30, 0];

  function after(s, t) { const x = R.clone(s); return R.play(x, t) ? x : null; }
  const wins = (x, me) => x.over && x.winner === me;
  /** Line potential for `me` on board b and on b turned once more (where the rival's turn leaves it). */
  function score(b, me) {
    let v = 0;
    for (const bb of [b, R.rotate(b)]) for (const L of R.LINES) {
      let m = 0, o = 0; for (const i of L) { if (bb[i] === me) m++; else if (bb[i]) o++; }
      if (!o) v += W[m]; else if (!m) v -= W[o] * 1.25;
    }
    return v;
  }
  /** Can the player to move in x win this turn? Returns how many winning turns (stops at `cap`). */
  function winCount(x, cap) {
    if (x.over) return 0;
    let n = 0; const me = x.toPlay;
    for (const t of R.turns(x)) { const y = after(x, t); if (y && wins(y, me) && ++n >= cap) break; }
    return n;
  }
  function finalScore(x, me) { return x.over ? (x.winner === me ? 1e6 : x.draw ? 0 : -1e6) : score(x.b, me); }

  function choose(s, level, rnd) {
    rnd = rnd || Math.random;
    const me = s.toPlay, all = R.turns(s);
    if (!all.length) return null;
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const res = all.map((t) => ({ t, x: after(s, t) }));
    const winning = res.filter((r) => wins(r.x, me));
    if (level === 'easy') return (winning.length && rnd() < 0.5 ? pick(winning) : pick(res)).t;
    if (winning.length) return pick(winning).t;
    if (level === 'medium') {
      let best = -Infinity, top = [];
      for (const r of res) { const v = finalScore(r.x, me) + rnd() * 0.5; if (v > best) { best = v; top = [r]; } }
      return top[0].t;
    }
    // hard: drop turns that lose at once (or hand the rival a win), rank the rest
    const t0 = Date.now();
    const ranked = res.map((r) => ({ ...r, v: finalScore(r.x, me) + rnd() * 0.5 })).sort((a, b) => b.v - a.v);
    let best = null, bestV = -Infinity;
    for (const r of ranked) {
      if (r.x.over) { if (r.x.draw && 0 > bestV) { best = r; bestV = 0; } continue; }   // a loss / draw now
      if (Date.now() - t0 > C.aiCapMs) break;
      let v = r.v;
      if (winCount(r.x, 1)) v -= 5e5;                                                     // the rival could win next
      else {
        // threats for my next turn: from where the rival's turn leaves the board, roughly (skip their move)
        const y = R.clone(r.x); y.toPlay = me; y.b = R.rotate(y.b);
        if (y.left[me] > 0) v += Math.min(2, winCount(y, 2)) * 40;
      }
      if (v > bestV) { bestV = v; best = r; }
    }
    return (best || ranked[0]).t;
  }
  return { choose, score };
})();
