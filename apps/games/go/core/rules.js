/*
 * Go — rules engine (GO-1). No DOM. Board = Int8Array n*n (0 empty, 1 Black, 2 White), point = y*n + x.
 * Rules: captures, no suicide, simple ko, pass (two passes in a row end play),
 * area scoring (Chinese): stones + empty points walled by one colour, plus komi for White.
 * Used by core/ai.js (also for fast playouts) and core/game.js.
 */
const GoRules = (() => {
  const PASS = -1;
  const nbCache = {}, diagCache = {};
  let markS = new Int32Array(0), markL = new Int32Array(0), stamp = 0;

  function neighbors(n) {
    if (nbCache[n]) return nbCache[n];
    const a = [], d = [];
    for (let i = 0; i < n * n; i++) {
      const x = i % n, y = (i / n) | 0, l = [], g = [];
      if (x > 0) l.push(i - 1); if (x < n - 1) l.push(i + 1);
      if (y > 0) l.push(i - n); if (y < n - 1) l.push(i + n);
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < n && Y < n) g.push(Y * n + X);
      }
      a.push(l); d.push(g);
    }
    diagCache[n] = d;
    return (nbCache[n] = a);
  }

  /** New position: Black to play. */
  function create(n) { neighbors(n); return { n, b: new Int8Array(n * n), ko: -1, caps: [0, 0, 0], toPlay: 1, passes: 0, moves: 0 }; }
  function clone(s) { return { n: s.n, b: s.b.slice(), ko: s.ko, caps: s.caps.slice(), toPlay: s.toPlay, passes: s.passes, moves: s.moves }; }

  /** Chain at `start`: { stones: [points], libs: count, lib: one liberty point }. */
  function group(b, n, start) {
    const N = n * n, nb = neighbors(n);
    if (markS.length < N) { markS = new Int32Array(N); markL = new Int32Array(N); }
    stamp++;
    const c = b[start], stones = [start]; let libs = 0, lib = -1;
    markS[start] = stamp;
    for (let k = 0; k < stones.length; k++) {
      const l = nb[stones[k]];
      for (let j = 0; j < l.length; j++) {
        const q = l[j], v = b[q];
        if (v === 0) { if (markL[q] !== stamp) { markL[q] = stamp; libs++; lib = q; } }
        else if (v === c && markS[q] !== stamp) { markS[q] = stamp; stones.push(q); }
      }
    }
    return { stones, libs, lib };
  }

  /** Play pt (or PASS) for s.toPlay, changing s. Returns false (and leaves s unchanged) if illegal. */
  function play(s, pt) {
    const n = s.n, b = s.b, c = s.toPlay, o = 3 - c, nb = neighbors(n);
    if (pt === PASS) { s.passes++; s.ko = -1; s.toPlay = o; s.moves++; return true; }
    if (pt < 0 || pt >= n * n || b[pt] !== 0 || pt === s.ko) return false;
    b[pt] = c;
    let captured = 0, capPt = -1;
    const l = nb[pt];
    for (let j = 0; j < l.length; j++) {
      const q = l[j];
      if (b[q] !== o) continue;
      const g = group(b, n, q);
      if (g.libs === 0) { for (const st of g.stones) b[st] = 0; captured += g.stones.length; capPt = q; }
    }
    const me = group(b, n, pt);
    if (me.libs === 0) { b[pt] = 0; return false; } // suicide (no capture happened, so nothing to restore)
    s.ko = captured === 1 && me.stones.length === 1 && me.libs === 1 ? capPt : -1;
    s.caps[c] += captured; s.passes = 0; s.toPlay = o; s.moves++;
    return true;
  }

  /** Is pt a legal move for s.toPlay? */
  function legal(s, pt) { return pt === PASS || play(clone(s), pt); }

  /** Why pt is illegal: 'occupied' | 'ko' | 'suicide' | '' (legal). */
  function whyIllegal(s, pt) {
    if (s.b[pt] !== 0) return 'occupied';
    if (pt === s.ko) return 'ko';
    return play(clone(s), pt) ? '' : 'suicide';
  }

  /** True eye-like point for colour c (all neighbours c, diagonals mostly c). Used by the AI. */
  function isEye(b, n, pt, c) {
    if (b[pt] !== 0) return false;
    const nb = neighbors(n)[pt];
    for (let j = 0; j < nb.length; j++) if (b[nb[j]] !== c) return false;
    const dg = diagCache[n][pt]; let bad = 0;
    for (let j = 0; j < dg.length; j++) if (b[dg[j]] === 3 - c) bad++;
    return dg.length < 4 ? bad === 0 : bad < 2;
  }

  /**
   * Empty regions: { id: Int32Array (region index per empty point, -1 on stones),
   *   regions: [{ size, mask }] } where mask bit 1 = touches Black, bit 2 = touches White.
   */
  function regions(b, n) {
    const N = n * n, nb = neighbors(n), id = new Int32Array(N).fill(-1), list = [];
    for (let i = 0; i < N; i++) {
      if (b[i] !== 0 || id[i] >= 0) continue;
      const r = list.length, stack = [i]; let size = 0, mask = 0; id[i] = r;
      while (stack.length) {
        const p = stack.pop(); size++;
        for (const q of nb[p]) {
          if (b[q] === 0) { if (id[q] < 0) { id[q] = r; stack.push(q); } }
          else mask |= b[q];
        }
      }
      list.push({ size, mask });
    }
    return { id, regions: list };
  }

  /**
   * Area score. dead = Uint8Array (1 = dead stone, taken off before counting) or null.
   * Returns { black, white (incl. komi), winner (1|2), margin, owner: Int8Array per point (1|2|0) }.
   */
  function score(b, n, dead, komi) {
    const N = n * n, bb = b.slice();
    if (dead) for (let i = 0; i < N; i++) if (dead[i]) bb[i] = 0;
    const R = regions(bb, n), owner = new Int8Array(N);
    let black = 0, white = 0;
    for (let i = 0; i < N; i++) {
      let o = bb[i];
      if (!o) { const m = R.regions[R.id[i]].mask; o = m === 1 ? 1 : m === 2 ? 2 : 0; }
      owner[i] = o; if (o === 1) black++; else if (o === 2) white++;
    }
    white += komi;
    return { black, white, winner: black > white ? 1 : 2, margin: Math.abs(black - white), owner };
  }

  return { PASS, create, clone, play, legal, whyIllegal, group, isEye, regions, score, neighbors };
})();
