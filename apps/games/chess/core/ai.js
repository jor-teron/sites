/* Chess computer. Beginner: 1-ply eval, noise, and occasional random blunders.
   Medium: iterative alpha-beta to 3 ply. Root moves are searched in slices so
   the UI can paint between them (setTimeout yields). */
(function (root) {
  const Chess = root.Chess = root.Chess || {};
  const VAL = [0, 100, 320, 330, 500, 900, 0];
  /* Piece-square tables, index 0 = a8, white's view (rank 8 down to rank 1). */
  const PST = {
    1: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
    2: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
    3: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
    4: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
    5: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
    6: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  };
  const MATE = 100000;

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function evalWhite(st, pstW) {
    let s = 0;
    const b = st.b;
    let wk = -1, bk = -1, wm = 0, bm = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const t = Math.abs(p), sign = p > 0 ? 1 : -1;
      if (t === 6) { if (p > 0) wk = i; else bk = i; }
      else if (p > 0) wm += VAL[t]; else bm += VAL[t];
      const idx = p > 0 ? (i ^ 56) : i;
      s += sign * (VAL[t] + pstW * PST[t][idx]);
    }
    if (bm === 0 && wm >= 500 && wk >= 0 && bk >= 0) s += edge(bk) + close(wk, bk);
    if (wm === 0 && bm >= 500 && wk >= 0 && bk >= 0) s -= edge(wk) + close(bk, wk);
    return s;
  }
  function edge(sq) {
    const f = sq & 7, r = sq >> 3;
    return (3 - Math.min(f, 7 - f)) * 14 + (3 - Math.min(r, 7 - r)) * 14;
  }
  function close(a, b) {
    return (14 - Math.abs((a & 7) - (b & 7)) - Math.abs((a >> 3) - (b >> 3))) * 8;
  }
  function evalSTM(st, pstW) {
    const w = evalWhite(st, pstW);
    return st.wtm ? w : -w;
  }
  function order(moves) {
    moves.sort(function (a, b) { return scoreMove(b) - scoreMove(a); });
    return moves;
  }
  function scoreMove(m) {
    let s = 0;
    if (m.c) s += VAL[Math.abs(m.c)] * 8 - VAL[Math.abs(m.p)];
    if (m.pr) s += VAL[Math.abs(m.pr)] + 500;
    if (m.fl === 3 || m.fl === 4) s += 40;
    return s;
  }
  function negamax(st, depth, alpha, beta, ply, ctrl) {
    if (ctrl.stop) return 0;
    if ((++ctrl.nodes & 63) === 0 && (performance.now() > ctrl.deadline || ctrl.halt())) ctrl.stop = true;
    if (ctrl.stop) return 0;
    if (st.hm >= 100 || (st.rep && (st.rep[Chess.rules.posKey(st)] || 0) >= 3) || Chess.rules.insufficient(st)) {
      if (depth === 0) return 0;
    }
    if (depth === 0) return evalSTM(st, 1);
    const moves = Chess.rules.legalMoves(st);
    if (!moves.length) return Chess.rules.inCheck(st) ? -MATE + ply : 0;
    if (st.hm >= 100 || (st.rep && (st.rep[Chess.rules.posKey(st)] || 0) >= 3) || Chess.rules.insufficient(st)) return 0;
    order(moves);
    let best = -Infinity;
    for (let i = 0; i < moves.length; i++) {
      Chess.rules.make(st, moves[i]);
      const sc = -negamax(st, depth - 1, -beta, -alpha, ply + 1, ctrl);
      Chess.rules.unmake(st, moves[i]);
      if (ctrl.stop) return 0;
      if (sc > best) best = sc;
      if (sc > alpha) alpha = sc;
      if (alpha >= beta) break;
    }
    return best;
  }
  function hang(st, m) {
    const piece = Math.abs(st.b[m.t]);
    if (!piece || piece === 6) return 0;
    const R = Chess.rules;
    if (!R.attacked(st, m.t, st.wtm)) return 0;
    return R.attacked(st, m.t, !st.wtm) ? VAL[piece] * 0.45 : VAL[piece];
  }
  function beginnerPick(st) {
    const cfg = Chess.config.ai.beginner;
    const moves = Chess.rules.legalMoves(st);
    if (!moves.length) return null;
    if (moves.length > 1 && Math.random() < cfg.blunder) return moves[(Math.random() * moves.length) | 0];
    let best = -Infinity;
    const scored = [];
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      Chess.rules.make(st, m);
      let sc = -evalSTM(st, cfg.pst) - hang(st, m);
      Chess.rules.unmake(st, m);
      sc += (Math.random() - 0.5) * 2 * cfg.noise;
      scored.push({ m: m, sc: sc });
      if (sc > best) best = sc;
    }
    const pool = scored.filter(function (s) { return s.sc >= best - cfg.band; });
    return pool[(Math.random() * pool.length) | 0].m;
  }
  async function rootSearch(st, depth, band, ctrl, prev) {
    const moves = order(Chess.rules.legalMoves(st).slice());
    if (!moves.length) return { complete: true, move: null };
    if (prev) {
      const i = moves.findIndex(function (m) { return m.f === prev.f && m.t === prev.t && m.pr === prev.pr; });
      if (i > 0) moves.unshift(moves.splice(i, 1)[0]);
    }
    const scores = [];
    let alpha = -Infinity, sliceStart = performance.now();
    for (let i = 0; i < moves.length; i++) {
      if (ctrl.halt()) return { complete: false, move: null };
      const m = moves[i];
      Chess.rules.make(st, m);
      const sc = depth === 1 ? -evalSTM(st, 1) : -negamax(st, depth - 1, -Infinity, -alpha, 1, ctrl);
      Chess.rules.unmake(st, m);
      if (ctrl.stop) return { complete: false, move: scores.length ? bestOf(scores, 0) : null };
      scores.push({ m: m, sc: sc });
      if (sc > alpha) alpha = sc;
      if (performance.now() - sliceStart > 12) {
        await delay(0);
        sliceStart = performance.now();
      }
    }
    return { complete: true, move: bestOf(scores, band) };
  }
  function bestOf(scores, band) {
    let best = -Infinity, move = scores[0].m;
    for (let i = 0; i < scores.length; i++) if (scores[i].sc > best) { best = scores[i].sc; move = scores[i].m; }
    if (!band || best > 50000 || best < -50000) return move;
    const pool = scores.filter(function (s) { return s.sc >= best - band; });
    return pool[(Math.random() * pool.length) | 0].m;
  }

  Chess.ai = {
    /* Think on a private copy. shouldStop() aborts between slices. */
    think: async function (state, level, shouldStop) {
      const halt = shouldStop || function () { return false; };
      const t0 = performance.now();
      await delay(0);
      if (halt()) return null;
      const st = Chess.rules.clone(state);
      let move = null;
      if (level === 'beginner') move = beginnerPick(st);
      else {
        const cfg = Chess.config.ai[level] || Chess.config.ai.medium;
        const ctrl = { stop: false, nodes: 0, deadline: performance.now() + cfg.budget, halt: halt };
        for (let d = 1; d <= cfg.depth; d++) {
          ctrl.stop = false;
          const res = await rootSearch(st, d, cfg.band, ctrl, move);
          if (halt()) return null;
          if (!res.complete) break;
          if (res.move) move = res.move;
          if (performance.now() > ctrl.deadline) break;
        }
      }
      const wait = (Chess.config.ai.minThink || 0) - (performance.now() - t0);
      if (level !== 'hint' && wait > 0) await delay(wait);
      return halt() ? null : move;
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
