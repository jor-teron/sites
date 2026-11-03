/*
 * Ludo — computer seats (LUDO-1b). LDAI.choose(s, level, rnd) → the token index k to move for the
 * current player and rolled die (or -1 if there is no legal move). Pure: reads the state, never changes it.
 *   easy   — any legal move at random.
 *   medium — prefers a capture, then bringing a token out, getting home, landing safe (stars, start
 *            squares, own home column), then the longest step; ties broken at random.
 *   hard   — scores every move: captures (worth more the further the victim had come), danger from
 *            rival tokens up to 6 squares behind the landing square (and escaping danger where it stands
 *            now), progress, getting home, coming out, forming a two-token block (a pair can't be captured),
 *            and threatening rivals just ahead.
 * Weights live in LD_CONFIG.ai so 1c can tune them. Needs LD_CONFIG, LDBoard, LDRules.
 */
const LDAI = (() => {
  const C = LD_CONFIG, B = LDBoard, R = LDRules, W = C.ai;
  const onTrack = (p) => p >= 0 && p <= B.lastTrack;

  /** Rival tokens that could land on track square i with one roll: number of distinct distances 1..6 that hit, as a chance 0..1. */
  function threat(s, c, i) {
    if (i < 0 || B.isSafe(i)) return 0;
    const hit = new Set();
    for (const q of s.players) {
      if (q === c || s.finished.indexOf(q) >= 0) continue;
      s.tokens[q].forEach((pe) => {
        if (!onTrack(pe)) return;
        const d = (i - B.abs(q, pe) + C.trackLen) % C.trackLen;
        if (d >= 1 && d <= 6 && pe + d <= B.lastTrack) hit.add(q + d);   // it can still reach i before turning home
      });
    }
    return Math.min(1, hit.size / 6);
  }
  /** Own tokens (besides k) on track square i. */
  function mates(s, c, k, i) { let n = 0; s.tokens[c].forEach((p, j) => { if (j !== k && B.abs(c, p) === i) n++; }); return n; }
  /** Rival tokens 1..6 squares ahead of track square i (targets for the next roll). */
  function targets(s, c, i) {
    if (i < 0) return 0;
    let n = 0;
    for (const q of s.players) if (q !== c) s.tokens[q].forEach((pe) => {
      if (!onTrack(pe)) return; const j = B.abs(q, pe); if (B.isSafe(j)) return;
      const d = (j - i + C.trackLen) % C.trackLen; if (d >= 1 && d <= 6) n++;
    });
    return n;
  }

  function medium(s, m) {
    const c = s.turn, i = B.abs(c, m.to);
    let v = 0;
    if (m.capture.length) v += 100;
    if (m.from < 0) v += 60;
    if (m.home) v += 50;
    if (m.to > B.lastTrack || B.isSafe(i)) v += 30;
    return v + (m.to - Math.max(m.from, 0)) / 10;
  }

  function hard(s, m) {
    const c = s.turn, k = m.k, i = B.abs(c, m.to), f = B.abs(c, m.from);
    let v = 0;
    m.capture.forEach((o) => { v += W.capture + W.captureProgress * s.tokens[o.color][o.k]; });
    if (m.from < 0) v += W.exit;
    if (m.home) v += W.home;
    if (m.to > B.lastTrack && m.from <= B.lastTrack) v += W.enterColumn;   // out of reach for good
    v += W.progress * (m.to - Math.max(m.from, 0));
    // danger where it lands vs where it stands now (pairs are safe: only a lone token is captured)
    const after = R.clone(s); after.tokens[c][k] = m.to; m.capture.forEach((o) => { after.tokens[o.color][o.k] = -1; });
    const pairAfter = i >= 0 && mates(after, c, k, i) > 0, pairBefore = f >= 0 && mates(s, c, k, f) > 0;
    const riskAfter = pairAfter ? 0 : threat(after, c, i), riskBefore = pairBefore ? 0 : threat(s, c, f);
    v -= W.danger * riskAfter * (m.to + W.dangerBase);
    v += W.escape * riskBefore * (m.from + W.dangerBase);
    if (pairAfter && !B.isSafe(i)) v += W.block;
    if (pairBefore && !B.isSafe(f)) v -= W.block / 2;   // breaking a block
    // leaving a team-mate alone (it was paired with this token) exposes it
    if (pairBefore && mates(s, c, k, f) === 1) v -= W.danger * threat(after, c, f) * W.dangerBase;
    if (i >= 0) v += W.threaten * targets(after, c, i);
    return v;
  }

  function choose(s, level, rnd) {
    rnd = rnd || Math.random;
    const moves = R.legalMoves(s);
    if (!moves.length) return -1;
    if (level === 'easy' || moves.length === 1) return moves[Math.floor(rnd() * moves.length)].k;
    const score = level === 'hard' ? hard : medium;
    let best = -Infinity, pick = [];
    for (const m of moves) {
      const v = score(s, m);
      if (v > best + 1e-9) { best = v; pick = [m]; } else if (Math.abs(v - best) <= 1e-9) pick.push(m);
    }
    return pick[Math.floor(rnd() * pick.length)].k;
  }
  return { choose, threat };
})();
