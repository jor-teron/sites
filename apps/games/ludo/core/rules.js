/*
 * Ludo — rules (LUDO-1a; house rules LUDO-1c). Pure functions on a plain state object, no page code (1b's computer
 * seats call legalMoves / move the same way a tap does; 1c reads the returned events to animate).
 *
 * State: { players: ['red', 'yellow', ...] (turn order), seats: { color: 'human' }, tokens: { color: [p, p, p, p] },
 *          turn: color, die: 0 | 1..6, sixes: 6s rolled in a row this turn, phase: 'roll' | 'move' | 'over',
 *          finished: [colors in finishing order], moves: number of moves made }
 * Token progress p: -1 = in the yard, 0..50 = track steps from its start square, 51..55 = home column, 56 = home.
 * Rules for a game live in state.rules (LD_CONFIG.rules + the New game house rules, LUDO-1c):
 *   a 6 brings a token out onto its start square; a 6 earns another roll; a third 6 in a row loses the turn;
 *   landing on a lone opponent on a square that is not safe sends it back to its yard and earns another roll;
 *   reaching home needs the exact number and earns another roll; any number of tokens may share a safe square
 *   (start squares and stars); with no legal move the turn passes; the first to get all 4 home wins and the
 *   rest play on for the places until one is left.
 * House rules: exactHome off = any roll that reaches the centre finishes; outOn1 = a 1 also brings a token out;
 *   captureBonus off = no extra roll for a capture; blocks = 2+ tokens of one colour on a track square stop
 *   every rival from passing or landing there (the owner's own tokens may pass).
 */
const LDRules = (() => {
  const C = LD_CONFIG, B = LDBoard;
  const rulesOf = (s) => Object.assign({}, C.rules, (s && s.rules) || {});

  function create(players, seats, rules) {
    const order = C.colors.filter((c) => players.indexOf(c) >= 0);
    if (order.length < 2 || order.length > 4) throw new Error('2 to 4 players');
    if (order.length === 2 && C.opposite[order[0]] !== order[1]) throw new Error('2 players sit opposite');
    const tokens = {}, st = {};
    order.forEach((c) => { tokens[c] = [-1, -1, -1, -1]; st[c] = (seats && seats[c]) || C.seats.human; });
    return { players: order, seats: st, tokens, turn: order[0], die: 0, sixes: 0, phase: 'roll', finished: [], moves: 0, rules: rulesOf({ rules }) };
  }
  const clone = (s) => JSON.parse(JSON.stringify(s));
  const done = (s, c) => s.tokens[c].every((p) => p === C.goal);

  /** Opponent tokens on track square i: [{ color, k }]. */
  function at(s, i, except) {
    const out = [];
    for (const c of s.players) if (c !== except) s.tokens[c].forEach((p, k) => { if (B.abs(c, p) === i) out.push({ color: c, k }); });
    return out;
  }
  /** A rival block (2+ tokens of one colour other than c) on track square i? */
  function blockAt(s, i, c) {
    if (i < 0) return false;
    for (const q of s.players) if (q !== c) { let n = 0; for (const p of s.tokens[q]) if (B.abs(q, p) === i) n++; if (n >= 2) return true; }
    return false;
  }
  /** Does colour c's token going from progress a to b pass or land on a rival block (track squares only)? */
  function blockedPath(s, c, a, b) {
    for (let q = Math.max(a + 1, 0); q <= Math.min(b, B.lastTrack); q++) if (blockAt(s, B.abs(c, q), c)) return true;
    return false;
  }
  /** Legal moves for the current player and die: [{ k, from, to, capture: [{ color, k }], home }]. */
  function legalMoves(s) {
    if (s.phase !== 'move' || !s.die) return [];
    const c = s.turn, out = [], RU = rulesOf(s);
    s.tokens[c].forEach((p, k) => {
      let to;
      if (p < 0) { if (s.die !== 6 && !(RU.outOn1 && s.die === 1)) return; to = 0; }
      else if (p === C.goal) return;
      else { to = p + s.die; if (to > C.goal) { if (RU.exactHome) return; to = C.goal; } }   // exact roll for home (house rule)
      if (RU.blocks && blockedPath(s, c, p < 0 ? -1 : p, to)) return;
      const capture = [];
      const i = B.abs(c, to);
      if (i >= 0 && !B.isSafe(i)) {
        const opp = at(s, i, c), by = {};
        opp.forEach((o) => { (by[o.color] = by[o.color] || []).push(o); });
        for (const col in by) if (by[col].length === 1) capture.push(by[col][0]);   // only a lone token is sent home
      }
      out.push({ k, from: p, to, capture, home: to === C.goal });
    });
    return out;
  }
  function nextPlayer(s, c) {
    const n = s.players.length, i = s.players.indexOf(c);
    for (let d = 1; d <= n; d++) { const q = s.players[(i + d) % n]; if (s.finished.indexOf(q) < 0) return q; }
    return c;
  }
  function passTurn(s) { s.turn = nextPlayer(s, s.turn); s.die = 0; s.sixes = 0; s.phase = 'roll'; }
  function again(s) { s.die = 0; s.phase = 'roll'; }

  /**
   * Roll the die for the current player with face v (1..6; the page picks it at random).
   * Returns an event: { type: 'roll' (choose a move) | 'three6' (turn lost) | 'nomove' (turn passes / 6 = roll again), color, die, moves }.
   */
  function roll(s, v) {
    if (s.phase !== 'roll') return null;
    const c = s.turn, RU = rulesOf(s);
    s.die = v; s.sixes = v === 6 ? s.sixes + 1 : 0;
    if (v === 6 && RU.threeSixes && s.sixes >= 3) { passTurn(s); return { type: 'three6', color: c, die: v }; }
    s.phase = 'move';
    const moves = legalMoves(s);
    if (!moves.length) {
      if (v === 6) again(s); else passTurn(s);
      return { type: 'nomove', color: c, die: v, again: v === 6 };
    }
    return { type: 'roll', color: c, die: v, moves };
  }

  /** Move token k of the current player by the rolled die. Returns { type: 'move', color, k, from, to, capture, home, finished, again, over } or null. */
  function move(s, k) {
    const m = legalMoves(s).find((x) => x.k === k);
    if (!m) return null;
    const c = s.turn, die = s.die, RU = rulesOf(s);
    s.tokens[c][k] = m.to; s.moves++;
    m.capture.forEach((o) => { s.tokens[o.color][o.k] = -1; });
    let finished = false, over = false;
    if (done(s, c)) {
      finished = true; s.finished.push(c);
      const left = s.players.filter((q) => s.finished.indexOf(q) < 0);
      if (left.length <= 1) { s.finished.push(...left); s.phase = 'over'; s.die = 0; over = true; }
    }
    let bonus = false;
    if (!over) {
      bonus = !finished && (die === 6 || (RU.captureBonus && m.capture.length > 0) || (RU.homeBonus && m.home));
      if (bonus) again(s); else passTurn(s);
      if (bonus && die !== 6) s.sixes = 0;   // a capture / home bonus starts a fresh run of 6s
    }
    return { type: 'move', color: c, k, from: m.from, to: m.to, capture: m.capture, home: m.home, finished, again: bonus, over };
  }

  function valid(s) {
    try {
      if (!s || !Array.isArray(s.players) || !s.tokens) return false;
      for (const c of s.players) if (!Array.isArray(s.tokens[c]) || s.tokens[c].length !== 4 || s.tokens[c].some((p) => !(p >= -1 && p <= C.goal))) return false;
      if (s.rules && typeof s.rules !== 'object') return false;
      return s.players.indexOf(s.turn) >= 0 && ['roll', 'move', 'over'].indexOf(s.phase) >= 0 && Array.isArray(s.finished);
    } catch (_) { return false; }
  }
  return { create, clone, legalMoves, roll, move, nextPlayer, done, at, valid, rulesOf, blockAt, blockedPath };
})();
