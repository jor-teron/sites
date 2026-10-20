/* Chess rules. Legal moves, make/unmake, draws, SAN, FEN, perft.
   Square 0 is a1, 63 is h8. Pieces: 1..6 white P N B R Q K, negatives black. */
(function (root) {
  const Chess = root.Chess = root.Chess || {};
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const FENCH = 'kqrbnp.PNBRQK';
  const FROM = {};
  for (let i = 0; i < FENCH.length; i++) if (FENCH[i] !== '.') FROM[FENCH[i]] = i - 6;
  const KNIGHT = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  const KING = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ROOK = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const BISHOP = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const QUEEN = ROOK.concat(BISHOP);

  function sqName(sq) { return 'abcdefgh'[sq & 7] + '12345678'[sq >> 3]; }
  function sqIndex(a) {
    if (!a || a === '-') return -1;
    const f = a.charCodeAt(0) - 97, r = a.charCodeAt(1) - 49;
    return (f < 0 || f > 7 || r < 0 || r > 7) ? -1 : r * 8 + f;
  }
  function keyOf(st) {
    let s = '';
    for (let i = 0; i < 64; i++) s += String.fromCharCode(98 + st.b[i]);
    return s + (st.wtm ? 'w' : 'b') + st.cr.toString(16) + ':' + st.ep;
  }
  function blank() {
    return { b: new Int8Array(64), wtm: true, cr: 0, ep: -1, hm: 0, fm: 1, rep: null };
  }
  function finish(st) {
    st.rep = {};
    st.rep[keyOf(st)] = 1;
    return st;
  }
  function clone(st) {
    return {
      b: new Int8Array(st.b), wtm: st.wtm, cr: st.cr, ep: st.ep, hm: st.hm, fm: st.fm,
      rep: st.rep ? Object.assign({}, st.rep) : null,
    };
  }
  function parseFen(fen) {
    const st = blank();
    const p = fen.trim().split(/\s+/);
    let r = 7, f = 0;
    for (const ch of p[0]) {
      if (ch === '/') { r--; f = 0; continue; }
      if (ch >= '1' && ch <= '8') { f += ch.charCodeAt(0) - 48; continue; }
      st.b[r * 8 + f] = FROM[ch] || 0;
      f++;
    }
    st.wtm = p[1] !== 'b';
    const cr = p[2] || '-';
    if (cr.includes('K')) st.cr |= 1;
    if (cr.includes('Q')) st.cr |= 2;
    if (cr.includes('k')) st.cr |= 4;
    if (cr.includes('q')) st.cr |= 8;
    st.ep = sqIndex(p[3] || '-');
    st.hm = +(p[4] || 0);
    st.fm = +(p[5] || 1);
    return finish(st);
  }
  function toFen(st) {
    const rows = [];
    for (let r = 7; r >= 0; r--) {
      let row = '', e = 0;
      for (let f = 0; f < 8; f++) {
        const p = st.b[r * 8 + f];
        if (!p) e++;
        else { if (e) { row += e; e = 0; } row += FENCH[p + 6]; }
      }
      if (e) row += e;
      rows.push(row);
    }
    let cr = (st.cr & 1 ? 'K' : '') + (st.cr & 2 ? 'Q' : '') + (st.cr & 4 ? 'k' : '') + (st.cr & 8 ? 'q' : '');
    if (!cr) cr = '-';
    const ep = st.ep < 0 ? '-' : sqName(st.ep);
    return rows.join('/') + ' ' + (st.wtm ? 'w' : 'b') + ' ' + cr + ' ' + ep + ' ' + st.hm + ' ' + st.fm;
  }

  function attacked(st, sq, byWhite) {
    const b = st.b, file = sq & 7, rank = sq >> 3;
    const pawn = byWhite ? 1 : -1;
    const pd = byWhite ? [[-1, -1], [1, -1]] : [[-1, 1], [1, 1]];
    for (let i = 0; i < pd.length; i++) {
      const f = file + pd[i][0], r = rank + pd[i][1];
      if (f >= 0 && f < 8 && r >= 0 && r < 8 && b[r * 8 + f] === pawn) return true;
    }
    const knight = byWhite ? 2 : -2;
    for (let i = 0; i < KNIGHT.length; i++) {
      const f = file + KNIGHT[i][0], r = rank + KNIGHT[i][1];
      if (f >= 0 && f < 8 && r >= 0 && r < 8 && b[r * 8 + f] === knight) return true;
    }
    const king = byWhite ? 6 : -6;
    for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue;
      const f = file + df, r = rank + dr;
      if (f >= 0 && f < 8 && r >= 0 && r < 8 && b[r * 8 + f] === king) return true;
    }
    const bishop = byWhite ? 3 : -3, rook = byWhite ? 4 : -4, queen = byWhite ? 5 : -5;
    for (let i = 0; i < QUEEN.length; i++) {
      const df = QUEEN[i][0], dr = QUEEN[i][1], diag = df && dr;
      let f = file + df, r = rank + dr;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const p = b[r * 8 + f];
        if (p) {
          if (p === queen || (diag && p === bishop) || (!diag && p === rook)) return true;
          break;
        }
        f += df; r += dr;
      }
    }
    return false;
  }
  function kingSq(st, white) {
    const k = white ? 6 : -6;
    for (let i = 0; i < 64; i++) if (st.b[i] === k) return i;
    return -1;
  }
  function inCheck(st) {
    const sq = kingSq(st, st.wtm);
    return sq >= 0 && attacked(st, sq, !st.wtm);
  }

  function mv(f, t, p, c, pr, fl) { return { f: f, t: t, p: p, c: c, pr: pr, fl: fl }; }
  function addPromo(f, t, p, c, list) {
    const s = p > 0 ? 1 : -1;
    list.push(mv(f, t, p, c, s * 5, 0), mv(f, t, p, c, s * 4, 0), mv(f, t, p, c, s * 3, 0), mv(f, t, p, c, s * 2, 0));
  }
  function genLeap(st, sq, p, deltas, list) {
    const file = sq & 7, rank = sq >> 3, b = st.b;
    for (let i = 0; i < deltas.length; i++) {
      const f = file + deltas[i][0], r = rank + deltas[i][1];
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      const to = r * 8 + f, occ = b[to];
      if (occ && (occ > 0) === (p > 0)) continue;
      list.push(mv(sq, to, p, occ, 0, 0));
    }
  }
  function genSlide(st, sq, p, deltas, list) {
    const file = sq & 7, rank = sq >> 3, b = st.b;
    for (let i = 0; i < deltas.length; i++) {
      const df = deltas[i][0], dr = deltas[i][1];
      let f = file + df, r = rank + dr;
      while (f >= 0 && f < 8 && r >= 0 && r < 8) {
        const to = r * 8 + f, occ = b[to];
        if (!occ) list.push(mv(sq, to, p, 0, 0, 0));
        else { if ((occ > 0) !== (p > 0)) list.push(mv(sq, to, p, occ, 0, 0)); break; }
        f += df; r += dr;
      }
    }
  }
  function genPawn(st, sq, p, list) {
    const white = p > 0, dir = white ? 1 : -1;
    const file = sq & 7, rank = sq >> 3, b = st.b;
    const r1 = rank + dir;
    if (r1 < 0 || r1 > 7) return;
    const promo = r1 === (white ? 7 : 0);
    const one = r1 * 8 + file;
    if (!b[one]) {
      if (promo) addPromo(sq, one, p, 0, list);
      else {
        list.push(mv(sq, one, p, 0, 0, 0));
        if (rank === (white ? 1 : 6)) {
          const two = (rank + dir * 2) * 8 + file;
          if (!b[two]) list.push(mv(sq, two, p, 0, 0, 1));
        }
      }
    }
    for (let df = -1; df <= 1; df += 2) {
      const f2 = file + df;
      if (f2 < 0 || f2 > 7) continue;
      const cap = r1 * 8 + f2, occ = b[cap];
      if (occ && (occ > 0) !== white) {
        if (promo) addPromo(sq, cap, p, occ, list);
        else list.push(mv(sq, cap, p, occ, 0, 0));
      } else if (cap === st.ep && !occ) list.push(mv(sq, cap, p, white ? -1 : 1, 0, 2));
    }
  }
  function genCastle(st, sq, p, list) {
    const white = p > 0;
    if (sq !== (white ? 4 : 60) || attacked(st, sq, !white)) return;
    const b = st.b, rook = white ? 4 : -4;
    if (st.cr & (white ? 1 : 4)) {
      if (!b[sq + 1] && !b[sq + 2] && b[sq + 3] === rook && !attacked(st, sq + 1, !white) && !attacked(st, sq + 2, !white))
        list.push(mv(sq, sq + 2, p, 0, 0, 3));
    }
    if (st.cr & (white ? 2 : 8)) {
      if (!b[sq - 1] && !b[sq - 2] && !b[sq - 3] && b[sq - 4] === rook && !attacked(st, sq - 1, !white) && !attacked(st, sq - 2, !white))
        list.push(mv(sq, sq - 2, p, 0, 0, 4));
    }
  }
  function pseudo(st) {
    const list = [], white = st.wtm, b = st.b;
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (!p || (p > 0) !== white) continue;
      const t = Math.abs(p);
      if (t === 1) genPawn(st, sq, p, list);
      else if (t === 2) genLeap(st, sq, p, KNIGHT, list);
      else if (t === 3) genSlide(st, sq, p, BISHOP, list);
      else if (t === 4) genSlide(st, sq, p, ROOK, list);
      else if (t === 5) genSlide(st, sq, p, QUEEN, list);
      else { genLeap(st, sq, p, KING, list); genCastle(st, sq, p, list); }
    }
    return list;
  }
  function make(st, m) {
    m._cr = st.cr; m._ep = st.ep; m._hm = st.hm; m._fm = st.fm; m._wtm = st.wtm;
    const b = st.b, white = st.wtm;
    b[m.f] = 0;
    if (m.fl === 2) { m._cs = m.t + (white ? -8 : 8); b[m._cs] = 0; }
    else if (m.fl === 3) { const rf = white ? 7 : 63, rt = white ? 5 : 61; b[rf] = 0; b[rt] = white ? 4 : -4; }
    else if (m.fl === 4) { const rf = white ? 0 : 56, rt = white ? 3 : 59; b[rf] = 0; b[rt] = white ? 4 : -4; }
    b[m.t] = m.pr || m.p;
    let cr = st.cr;
    if (m.p === 6) cr &= ~3;
    else if (m.p === -6) cr &= ~12;
    if (m.f === 0 || m.t === 0) cr &= ~2;
    if (m.f === 7 || m.t === 7) cr &= ~1;
    if (m.f === 56 || m.t === 56) cr &= ~8;
    if (m.f === 63 || m.t === 63) cr &= ~4;
    st.cr = cr;
    st.ep = m.fl === 1 ? (m.f + m.t) >> 1 : -1;
    st.hm = (Math.abs(m.p) === 1 || m.c) ? 0 : st.hm + 1;
    if (!white) st.fm++;
    st.wtm = !white;
    if (st.rep) { const k = keyOf(st); m._key = k; st.rep[k] = (st.rep[k] || 0) + 1; }
  }
  function unmake(st, m) {
    if (st.rep && m._key) { if (--st.rep[m._key] <= 0) delete st.rep[m._key]; }
    const b = st.b;
    b[m.t] = 0;
    b[m.f] = m.p;
    if (m.fl === 2) b[m._cs] = m.c;
    else if (m.fl === 3) { const w = m.p > 0; b[w ? 5 : 61] = 0; b[w ? 7 : 63] = w ? 4 : -4; }
    else if (m.fl === 4) { const w = m.p > 0; b[w ? 3 : 59] = 0; b[w ? 0 : 56] = w ? 4 : -4; }
    else if (m.c) b[m.t] = m.c;
    st.cr = m._cr; st.ep = m._ep; st.hm = m._hm; st.fm = m._fm; st.wtm = m._wtm;
  }
  function legalMoves(st) {
    const raw = pseudo(st), out = [];
    for (let i = 0; i < raw.length; i++) {
      const m = raw[i];
      make(st, m);
      const ksq = kingSq(st, !st.wtm);
      const ok = ksq >= 0 && !attacked(st, ksq, st.wtm);
      unmake(st, m);
      if (ok) out.push(m);
    }
    return out;
  }
  function insufficient(st) {
    const minors = [];
    for (let i = 0; i < 64; i++) {
      const p = st.b[i], t = Math.abs(p);
      if (!p || t === 6) continue;
      if (t === 1 || t === 4 || t === 5) return false;
      minors.push(t === 3 ? i : -1);
    }
    if (minors.length <= 1) return true;
    if (minors.length === 2 && minors[0] >= 0 && minors[1] >= 0) {
      const color = function (sq) { return ((sq & 7) + (sq >> 3)) & 1; };
      return color(minors[0]) === color(minors[1]);
    }
    return false;
  }
  function result(st, moves) {
    const list = moves || legalMoves(st);
    if (!list.length) return inCheck(st) ? { type: 'mate', winner: st.wtm ? 'black' : 'white' } : { type: 'stalemate' };
    if (st.hm >= 100) return { type: '50' };
    if ((st.rep[keyOf(st)] || 0) >= 3) return { type: 'rep' };
    if (insufficient(st)) return { type: 'material' };
    return null;
  }
  function san(st, m, moves) {
    let body;
    if (m.fl === 3) body = 'O-O';
    else if (m.fl === 4) body = 'O-O-O';
    else {
      const letters = ['', '', 'N', 'B', 'R', 'Q', 'K'];
      const kind = Math.abs(m.p);
      const piece = letters[kind];
      const file = 'abcdefgh'[m.f & 7], rank = '12345678'[m.f >> 3], dest = sqName(m.t);
      let dis = '';
      if (piece && moves) {
        const others = moves.filter(function (o) {
          return Math.abs(o.p) === kind && o.t === m.t && (o.f !== m.f || o.pr !== m.pr);
        });
        if (others.length) {
          const sf = others.some(function (o) { return (o.f & 7) === (m.f & 7); });
          const sr = others.some(function (o) { return (o.f >> 3) === (m.f >> 3); });
          dis = !sf ? file : !sr ? rank : file + rank;
        }
      }
      const cap = m.c ? 'x' : '';
      body = piece + ((!piece && m.c) ? file : '') + dis + cap + dest + (m.pr ? '=' + letters[Math.abs(m.pr)] : '');
    }
    make(st, m);
    let suf = '';
    if (inCheck(st)) suf = legalMoves(st).length ? '+' : '#';
    unmake(st, m);
    return body + suf;
  }
  function perft(st, depth) {
    if (depth <= 0) return 1;
    const moves = legalMoves(st);
    if (depth === 1) return moves.length;
    let n = 0;
    for (let i = 0; i < moves.length; i++) {
      make(st, moves[i]);
      n += perft(st, depth - 1);
      unmake(st, moves[i]);
    }
    return n;
  }

  Chess.rules = {
    START: START, parseFen: parseFen, toFen: toFen, clone: clone, sqName: sqName, sqIndex: sqIndex,
    attacked: attacked, inCheck: inCheck, kingSq: kingSq, legalMoves: legalMoves, make: make, unmake: unmake,
    result: result, insufficient: insufficient, san: san, perft: perft, posKey: keyOf,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
