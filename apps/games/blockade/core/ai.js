/*
 * Blockade — computer player (BLKD-1). Shortest-path heuristics, time-capped (BK_CONFIG.aiCapMs ≈ 600 ms).
 *   Easy:   often takes the move that shortens its path, sometimes a random one; random walls now and then.
 *   Medium: always wins at once if it can; otherwise the move that shortens its own path most, then the
 *           wall that lengthens the other side's path most (only walls on the other side's shortest paths).
 *   Hard:   tries Medium's best few moves x best few walls, looks one reply ahead (the other side's best
 *           move + best wall) and keeps the plan that leaves it furthest ahead. Stops at the time budget.
 * Returns { pawn, to, wall: [cx, cy, o] | null }. Uses BKRules + BK_CONFIG. No DOM.
 */
const BKAI = (() => {
  const R = BKRules, CFG = BK_CONFIG;
  const now = () => (window.performance ? performance.now() : Date.now());
  const pawnsOf = (p) => (p === 1 ? [0, 1] : [2, 3]);

  /** All pawn moves for p: [{ pawn, to, d (own distance after), win }], best first. */
  function moves(s, p) {
    const out = [];
    for (const i of pawnsOf(p)) for (const q of R.pawnMoves(s, i)) {
      if (R.isTarget(p, q)) { out.push({ pawn: i, to: q, d: 0, win: true }); continue; }
      const t = R.clone(s); R.movePawn(t, i, q);
      out.push({ pawn: i, to: q, d: R.dist(t, p), win: false });
    }
    out.sort((a, b) => a.d - b.d || Math.random() - 0.5);
    return out;
  }

  /** Walls that cut a shortest path of player `victim`'s pawns, unique. */
  function pathWalls(s, victim) {
    const d = R.distField(s, victim), seen = {}, out = [];
    const stack = pawnsOf(victim).map((i) => s.pawns[i]), visited = {};
    while (stack.length) {
      const a = stack.pop(); if (visited[a] || d[a] <= 0) continue; visited[a] = 1;
      for (const b of R.NB[a]) if (d[b] === d[a] - 1 && R.open(s, a, b)) {
        for (const w of R.wallsOnEdge(a, b)) { const k = w.join(); if (!seen[k]) { seen[k] = 1; out.push(w); } }
        stack.push(b);
      }
    }
    return out;
  }

  /** Best walls for p to place now: [{ w, gain }], best first (gain = their path longer minus ours). */
  function bestWalls(s, p, limit, deadline) {
    const o = 3 - p, myD = R.dist(s, p), opD = R.dist(s, o), out = [];
    for (const w of pathWalls(s, o)) {
      if (deadline && now() > deadline) break;
      if (!R.legalWall(s, w[0], w[1], w[2], p)) continue;
      const t = R.clone(s); R.placeWall(t, w[0], w[1], w[2], p);
      out.push({ w, gain: (R.dist(t, o) - opD) - (R.dist(t, p) - myD) });
    }
    out.sort((a, b) => b.gain - a.gain || Math.random() - 0.5);
    return limit ? out.slice(0, limit) : out;
  }

  /** Should p spend a wall with this gain? Spend more freely when the other side is close or ahead. */
  function worthIt(s, p, gain) {
    const myD = R.dist(s, p), opD = R.dist(s, 3 - p);
    if (opD <= 2) return gain >= 1;
    if (opD <= myD) return gain >= 2;
    return gain >= 3;
  }

  function easy(s, p) {
    const list = moves(s, p); if (!list.length) return null;
    const m = list[0].win || Math.random() < CFG.easyBest ? list[0] : list[(Math.random() * list.length) | 0];
    let wall = null;
    if (!m.win && Math.random() < CFG.easyWall) {
      const t = R.clone(s); R.movePawn(t, m.pawn, m.to);
      for (let k = 0; k < 40 && !wall; k++) {
        const w = [1 + ((Math.random() * (R.W - 1)) | 0), 1 + ((Math.random() * (R.H - 1)) | 0), Math.random() < 0.5 ? 'h' : 'v'];
        if (R.legalWall(t, w[0], w[1], w[2], p)) wall = w;
      }
    }
    return { pawn: m.pawn, to: m.to, wall };
  }

  function medium(s, p) {
    const list = moves(s, p); if (!list.length) return null;
    const m = list[0];
    if (m.win) return { pawn: m.pawn, to: m.to, wall: null };
    const t = R.clone(s); R.movePawn(t, m.pawn, m.to);
    const bw = bestWalls(t, p, 1)[0];
    return { pawn: m.pawn, to: m.to, wall: bw && worthIt(t, p, bw.gain) ? bw.w : null };
  }

  /** Lead for p after the other side's best greedy reply (move + one wall on p's path). */
  function afterReply(t, p, deadline) {
    const o = 3 - p, rep = moves(t, o);
    if (rep.length && rep[0].win) return -1000;
    let u = t;
    if (rep.length) { u = R.clone(t); R.movePawn(u, rep[0].pawn, rep[0].to); }
    const bw = bestWalls(u, o, 1, deadline)[0];
    if (bw && worthIt(u, o, bw.gain)) { u = R.clone(u); R.placeWall(u, bw.w[0], bw.w[1], bw.w[2], o); }
    const myD = R.dist(u, p), opD = R.dist(u, o);
    return (opD - myD) + 0.15 * (u.left[p].v + u.left[p].h - u.left[o].v - u.left[o].h) + (myD <= 2 ? 3 : 0);
  }

  function hard(s, p, t0) {
    const deadline = t0 + CFG.hardBudgetMs, all = moves(s, p);
    if (!all.length) return null;
    if (all[0].win) return { pawn: all[0].pawn, to: all[0].to, wall: null };
    const fallback = medium(s, p), list = all.slice(0, CFG.hardMoves);
    let best = null, bestV = -Infinity;
    for (const m of list) {
      if (now() > deadline) break;
      const t = R.clone(s); R.movePawn(t, m.pawn, m.to);
      const opts = [null].concat(bestWalls(t, p, CFG.hardWalls, deadline).filter((x) => x.gain > 0).map((x) => x.w));
      for (const w of opts) {
        if (now() > deadline) break;
        let u = t; if (w) { u = R.clone(t); R.placeWall(u, w[0], w[1], w[2], p); }
        const v = afterReply(u, p, deadline) - (w ? 0.6 : 0); // a wall has to earn its keep
        if (v > bestV) { bestV = v; best = { pawn: m.pawn, to: m.to, wall: w }; }
      }
    }
    return best || fallback;
  }

  /** Choose a full turn for s.turn. level: 'easy' | 'medium' | 'hard'. */
  function choose(s, level) {
    const p = s.turn, t0 = now();
    if (level === 'easy') return easy(s, p);
    if (level === 'hard') return hard(s, p, t0);
    return medium(s, p);
  }

  return { choose, moves, bestWalls };
})();
