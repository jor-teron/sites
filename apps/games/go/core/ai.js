/*
 * Go — computer player (GO-1). Light and time-capped (GO_CONFIG.aiCapMs, about 600 ms).
 *   Easy:   random legal move (never fills its own eye).
 *   Medium: heuristics: capture, save own stones in atari, put the other side in atari,
 *           avoid self-atari, liberties, good lines early, stay near the action.
 *   Hard:   Medium's best few moves, each tried with quick random playouts (Monte Carlo),
 *           the move that wins most playouts is chosen.
 * All levels pass when nothing useful is left (or when the other side passed and the computer leads).
 * Uses GoRules + GO_CONFIG. No DOM.
 */
const GoAI = (() => {
  const R = GoRules, CFG = GO_CONFIG, PASS = R.PASS;
  const now = () => (window.performance ? performance.now() : Date.now());

  /** Settled-ness of each empty point for colour c: 'own' / 'theirs' small walled area, else ''. */
  function areaInfo(s) {
    const info = R.regions(s.b, s.n);
    return (pt, c) => {
      const r = info.regions[info.id[pt]]; if (!r) return '';
      if (r.mask === c) return r.size <= CFG.smallRegion ? 'own' : 'ownBig';
      if (r.mask === 3 - c) return r.size <= CFG.smallRegion ? 'theirs' : '';
      return '';
    };
  }

  /** Heuristic value of playing pt for s.toPlay, or null if illegal / pointless. */
  function evalMove(s, pt, area, last, noise) {
    const n = s.n, b = s.b, c = s.toPlay, o = 3 - c, nb = R.neighbors(n)[pt];
    if (b[pt] !== 0 || pt === s.ko || R.isEye(b, n, pt, c)) return null;
    const where = area(pt, c);
    // own atari groups next to pt (before the move)
    let saveSize = 0;
    for (const q of nb) if (b[q] === c) { const g = R.group(b, n, q); if (g.libs === 1) saveSize += g.stones.length; }
    const t = R.clone(s);
    if (!R.play(t, pt)) return null;
    const captured = t.caps[c] - s.caps[c];
    const me = R.group(t.b, n, pt);
    let v = 0;
    v += captured * 6;
    if (saveSize && me.libs >= 2) v += saveSize * 5;
    if (me.libs === 1 && !captured) v -= 8 + me.stones.length;   // self-atari
    else if (me.libs === 2) v -= 0.5;
    else v += 0.3 * Math.min(me.libs, 4);
    const seen = {};
    for (const q of nb) if (t.b[q] === o && !seen[q]) {
      const g = R.group(t.b, n, q); for (const st of g.stones) seen[st] = 1;
      if (g.libs === 1) v += 2.5 + 0.5 * g.stones.length;
      else if (g.libs === 2) v += 0.4;
    }
    if (where === 'own') v -= 4;                     // filling own small territory
    else if (where === 'ownBig') v -= 0.6;
    else if (where === 'theirs' && !captured && !saveSize) v -= 4;
    const x = pt % n, y = (pt / n) | 0, edge = Math.min(x, y, n - 1 - x, n - 1 - y);
    if (s.moves < (n * n) / 4) { if (edge === 0) v -= 1.5; else if (edge === 2 || (n > 9 && edge === 3)) v += 1; }
    else if (edge === 0 && !captured && !saveSize) v -= 0.3;
    if (last >= 0) { const lx = last % n, ly = (last / n) | 0; if (Math.abs(lx - x) + Math.abs(ly - y) <= 2) v += 0.7; }
    if (noise) v += Math.random() * noise;
    return v;
  }

  /** Rough area count (no dead stones): who leads, from colour c's view (positive = c ahead). */
  function lead(s, c) {
    const sc = R.score(s.b, s.n, null, CFG.komi), mine = c === 1 ? sc.black : sc.white;
    return mine - (c === 1 ? sc.white : sc.black);
  }

  function easy(s) {
    const N = s.n * s.n, start = (Math.random() * N) | 0;
    for (let i = 0; i < N; i++) {
      const pt = (start + i * 7919) % N; // coprime stride walks every point in a scrambled order
      if (s.b[pt] === 0 && pt !== s.ko && !R.isEye(s.b, s.n, pt, s.toPlay) && R.legal(s, pt)) return pt;
    }
    return PASS;
  }

  /** Scored candidate list, best first. */
  function ranked(s, last, noise) {
    const area = areaInfo(s), out = [];
    for (let pt = 0; pt < s.n * s.n; pt++) {
      const v = evalMove(s, pt, area, last, noise);
      if (v !== null) out.push({ pt, v });
    }
    out.sort((a, b) => b.v - a.v);
    return out;
  }

  /** Fast random game to the end; returns 1 if colour c wins it. */
  function playout(s0, c, deadline) {
    const s = R.clone(s0), n = s.n, N = n * n, maxMoves = N * 3;
    let k = 0;
    while (s.passes < 2 && k < maxMoves) {
      const start = (Math.random() * N) | 0; let played = false;
      for (let i = 0; i < N; i++) {
        const pt = (start + i) % N;
        if (s.b[pt] !== 0 || pt === s.ko || R.isEye(s.b, n, pt, s.toPlay)) continue;
        if (R.play(s, pt)) { played = true; break; }
      }
      if (!played) R.play(s, PASS);
      k++;
      if ((k & 63) === 0 && now() > deadline) break;
    }
    return lead(s, c) > 0 ? 1 : 0;
  }

  function hard(s, last, t0) {
    const c = s.toPlay, list = ranked(s, last, 0);
    if (!list.length || list[0].v < -1) return PASS;
    const K = Math.min(list.length, CFG.hardCandidates[s.n] || 10), cand = list.slice(0, K);
    if (cand.length === 1) return cand[0].pt;
    const top = cand[0].v, bottom = cand[K - 1].v, span = Math.max(1e-6, top - bottom);
    const stats = cand.map((m) => { const t = R.clone(s); R.play(t, m.pt); return { m, t, w: 0, n: 0 }; });
    const deadline = t0 + CFG.hardBudgetMs;
    for (let i = 0; now() < deadline; i++) {
      const st = stats[i % K];
      st.w += playout(st.t, c, deadline); st.n++;
    }
    let best = stats[0], bestV = -1;
    for (const st of stats) {
      const v = (st.w + 1) / (st.n + 2) + 0.08 * ((st.m.v - bottom) / span); // win rate + small prior
      if (v > bestV) { bestV = v; best = st; }
    }
    return best.m.pt;
  }

  /**
   * Choose a move for s.toPlay. level: 'easy' | 'medium' | 'hard'. last = opponent's last point (or -1).
   * oppPassed: the other side just passed. Returns a point or GoRules.PASS.
   */
  function choose(s, level, last, oppPassed) {
    const t0 = now(), c = s.toPlay;
    if (oppPassed && s.moves > 4 && lead(s, c) > 0) return PASS;  // ahead: accept the end
    if (level === 'easy') return easy(s);
    if (level === 'hard') return hard(s, last, t0);
    const list = ranked(s, last, 1);
    return list.length && list[0].v >= -1 ? list[0].pt : PASS;
  }

  return { choose, ranked };
})();
