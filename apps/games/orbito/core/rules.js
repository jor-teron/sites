/*
 * Orbito — rules (ORB-1). Pure functions on a plain state object, no page code.
 * state = { b: [16] (0 empty, 1 Black, 2 White), toPlay: 1 | 2, left: { 1: n, 2: n } marbles in hand,
 *           over: bool, winner: 0 | 1 | 2, draw: bool, line: [cells] | null, extra: final turns used, turns: n }
 * A turn = { mv: [from, to] | null, place: square }:
 *   1. optional: move one rival marble to an empty square next to it (up, down, left or right);
 *   2. place one of your own marbles on an empty square;
 *   3. the board turns: outer ring of 12 and inner ring of 4 each shift one step counter-clockwise;
 *   4. check for 4 in a row (rows, columns, both diagonals). Both players have one = draw.
 * When all 16 marbles are down with no winner, the board turns up to 5 more times, checking after each;
 * still nobody = draw.
 */
const OrbRules = (() => {
  const C = ORB_CONFIG, N = C.n, SZ = N * N;
  // ROT[i] = where the marble on square i goes when the board turns
  const ROT = new Array(SZ).fill(-1);
  for (const ring of [C.outer, C.inner]) ring.forEach((sq, k) => { ROT[sq] = ring[(k - 1 + ring.length) % ring.length]; });
  const LINES = [];
  for (let y = 0; y < N; y++) LINES.push([0, 1, 2, 3].map((x) => y * N + x));
  for (let x = 0; x < N; x++) LINES.push([0, 1, 2, 3].map((y) => y * N + x));
  LINES.push([0, 5, 10, 15], [3, 6, 9, 12]);
  const NB = [];
  for (let i = 0; i < SZ; i++) { const x = i % N, y = (i / N) | 0, a = []; if (y > 0) a.push(i - N); if (y < N - 1) a.push(i + N); if (x > 0) a.push(i - 1); if (x < N - 1) a.push(i + 1); NB.push(a); }

  function create() { return { b: new Array(SZ).fill(0), toPlay: 1, left: { 1: C.marbles, 2: C.marbles }, over: false, winner: 0, draw: false, line: null, extra: 0, turns: 0 }; }
  const clone = (s) => JSON.parse(JSON.stringify(s));
  function rotate(b) { const o = new Array(SZ).fill(0); for (let i = 0; i < SZ; i++) if (b[i]) o[ROT[i]] = b[i]; return o; }
  /** Players with 4 in a row: { 1: line | null, 2: line | null }. */
  function lines(b) {
    const out = { 1: null, 2: null };
    for (const L of LINES) { const v = b[L[0]]; if (v && !out[v] && b[L[1]] === v && b[L[2]] === v && b[L[3]] === v) out[v] = L; }
    return out;
  }
  /** Squares a rival marble on `from` may move to. */
  const moveTargets = (b, from) => NB[from].filter((j) => b[j] === 0);
  /** Every legal turn for the player to play (move options x places). */
  function turns(s) {
    if (s.over || s.left[s.toPlay] <= 0) return [];
    const me = s.toPlay, opp = 3 - me, out = [], mvs = [null];
    for (let i = 0; i < SZ; i++) if (s.b[i] === opp) for (const j of moveTargets(s.b, i)) mvs.push([i, j]);
    for (const mv of mvs) {
      const b = s.b.slice(); if (mv) { b[mv[1]] = opp; b[mv[0]] = 0; }
      for (let p = 0; p < SZ; p++) if (b[p] === 0) out.push({ mv, place: p });
    }
    return out;
  }
  /** Why a turn is not allowed ('' = fine). */
  function whyIllegal(s, t) {
    if (s.over) return 'over';
    if (!t || !(t.place >= 0 && t.place < SZ)) return 'place';
    const me = s.toPlay, opp = 3 - me, b = s.b.slice();
    if (t.mv) {
      const [f, to] = t.mv;
      if (b[f] !== opp) return 'notRival';
      if (NB[f].indexOf(to) < 0 || b[to] !== 0) return 'notNext';
      b[to] = opp; b[f] = 0;
    }
    if (b[t.place] !== 0) return 'full';
    if (s.left[me] <= 0) return 'none';
    return '';
  }
  /** Check a board after a turn of the board; sets over / winner / draw / line. */
  function judge(s) {
    const w = lines(s.b);
    if (w[1] && w[2]) { s.over = true; s.draw = true; s.winner = 0; s.line = w[1].concat(w[2]); return true; }
    if (w[1] || w[2]) { const p = w[1] ? 1 : 2; s.over = true; s.winner = p; s.line = w[p]; return true; }
    return false;
  }
  /**
   * Play one turn for s.toPlay. Returns null if illegal, else an event:
   * { mv, place, color, boards: [board after the move + place (before turning), board after turn 1, ...], winner, draw, over }
   */
  function play(s, t) {
    if (whyIllegal(s, t)) return null;
    const me = s.toPlay, opp = 3 - me;
    if (t.mv) { s.b[t.mv[1]] = opp; s.b[t.mv[0]] = 0; }
    s.b[t.place] = me; s.left[me]--; s.turns++;
    const boards = [s.b.slice()];
    s.b = rotate(s.b); boards.push(s.b.slice());
    if (!judge(s) && s.left[1] === 0 && s.left[2] === 0) {
      while (s.extra < C.finalTurns && !s.over) { s.b = rotate(s.b); s.extra++; boards.push(s.b.slice()); judge(s); }
      if (!s.over) { s.over = true; s.draw = true; s.winner = 0; }
    }
    if (!s.over) s.toPlay = opp;
    return { mv: t.mv ? t.mv.slice() : null, place: t.place, color: me, boards, winner: s.winner, draw: s.draw, over: s.over };
  }
  function valid(s) {
    try {
      return !!s && Array.isArray(s.b) && s.b.length === SZ && s.b.every((v) => v === 0 || v === 1 || v === 2) && (s.toPlay === 1 || s.toPlay === 2) &&
        s.left && s.left[1] >= 0 && s.left[2] >= 0 && s.left[1] + s.b.filter((v) => v === 1).length === C.marbles && s.left[2] + s.b.filter((v) => v === 2).length === C.marbles;
    } catch (_) { return false; }
  }
  return { create, clone, rotate, lines, moveTargets, turns, whyIllegal, play, valid, ROT, LINES, NB, SZ };
})();
