/*
 * Blockade — rules engine (BLKD-1). No DOM. Square index = y * cols + x.
 * A turn: move one of your 2 pawns 1 or 2 squares in a straight line (up/down/left/right; it may hop
 * over a pawn but never through a wall), or 1 square diagonally (needs one open L-shaped way round),
 * then optionally place one wall. Pawns can't land on a pawn, except on an enemy home square.
 * Walls are 2 squares long and sit in the grooves: 'v' (green, between columns) or 'h' (blue, between rows),
 * anchored at an inner corner (cx 1..cols-1, cy 1..rows-1). Walls can't overlap or cross, and must leave
 * EVERY pawn at least one path to an enemy home square (BFS; pawns don't block paths).
 * The first pawn to reach an enemy home square wins.
 * Used by core/ai.js and core/game.js.
 */
const BKRules = (() => {
  const C = BK_CONFIG, W = C.cols, H = C.rows, N = W * H;
  const sq = (x, y) => y * W + x;
  const HOME = { 1: C.homes[1].map(([x, y]) => sq(x, y)), 2: C.homes[2].map(([x, y]) => sq(x, y)) };
  const isTarget = (p, q) => HOME[3 - p].indexOf(q) >= 0;
  const ownerOf = (i) => (i < 2 ? 1 : 2);
  const NB = [];
  for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0, l = []; if (x > 0) l.push(i - 1); if (x < W - 1) l.push(i + 1); if (y > 0) l.push(i - W); if (y < H - 1) l.push(i + W); NB.push(l); }

  function create() {
    return { pawns: HOME[1].concat(HOME[2]), bS: new Uint8Array(N), bE: new Uint8Array(N), corner: new Int8Array((W + 1) * (H + 1)),
      walls: [], left: { 1: { v: C.walls, h: C.walls }, 2: { v: C.walls, h: C.walls } }, turn: 1, winner: 0, moves: 0 };
  }
  function clone(s) {
    return { pawns: s.pawns.slice(), bS: s.bS.slice(), bE: s.bE.slice(), corner: s.corner.slice(), walls: s.walls.slice(),
      left: { 1: { v: s.left[1].v, h: s.left[1].h }, 2: { v: s.left[2].v, h: s.left[2].h } }, turn: s.turn, winner: s.winner, moves: s.moves };
  }

  /** Open edge between neighbouring squares a and b (no wall). */
  function open(s, a, b) {
    if (b === a + 1) return !s.bE[a];
    if (b === a - 1) return !s.bE[b];
    if (b === a + W) return !s.bS[a];
    if (b === a - W) return !s.bS[b];
    return false;
  }

  /** Destinations for pawn i (index 0..3). */
  function pawnMoves(s, i) {
    const from = s.pawns[i], p = ownerOf(i), out = [];
    const landOk = (q) => q !== from && (s.pawns.indexOf(q) < 0 || isTarget(p, q)) && out.indexOf(q) < 0;
    const x = from % W, y = (from / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x1 = x + dx, y1 = y + dy; if (x1 < 0 || y1 < 0 || x1 >= W || y1 >= H) continue;
      const a = sq(x1, y1); if (!open(s, from, a)) continue;
      if (landOk(a)) out.push(a);
      if (isTarget(p, a)) continue;                 // reaching a target ends the move
      const x2 = x1 + dx, y2 = y1 + dy; if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H) continue;
      const b = sq(x2, y2); if (open(s, a, b) && landOk(b)) out.push(b);
    }
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const q = sq(X, Y), m1 = sq(X, y), m2 = sq(x, Y);
      if (((open(s, from, m1) && open(s, m1, q)) || (open(s, from, m2) && open(s, m2, q))) && landOk(q)) out.push(q);
    }
    return out;
  }

  /** Move pawn i to q (assumed legal). Sets winner when it lands on an enemy home square. */
  function movePawn(s, i, q) { s.pawns[i] = q; if (isTarget(ownerOf(i), q)) s.winner = ownerOf(i); }
  function endTurn(s) { s.turn = 3 - s.turn; s.moves++; }

  const ci = (cx, cy) => cy * (W + 1) + cx;
  /** Edges a wall covers: [[array, square], [array, square]]. */
  function cover(cx, cy, o) {
    return o === 'h' ? [['bS', sq(cx - 1, cy - 1)], ['bS', sq(cx, cy - 1)]] : [['bE', sq(cx - 1, cy - 1)], ['bE', sq(cx - 1, cy)]];
  }
  function setWall(s, cx, cy, o, v) {
    for (const [k, i] of cover(cx, cy, o)) s[k][i] = v;
    s.corner[ci(cx, cy)] = v ? (o === 'h' ? 1 : 2) : 0;
  }

  /** Distance field (in squares) from every square to player p's targets; -1 = no path. Pawns ignored. */
  function distField(s, p) {
    const d = new Int16Array(N).fill(-1), q = new Int16Array(N); let h = 0, t = 0;
    for (const g of HOME[3 - p]) { d[g] = 0; q[t++] = g; }
    while (h < t) {
      const a = q[h++], l = NB[a];
      for (let j = 0; j < l.length; j++) { const b = l[j]; if (d[b] < 0 && open(s, a, b)) { d[b] = d[a] + 1; q[t++] = b; } }
    }
    return d;
  }
  /** Every pawn still has a path to an enemy home square. */
  function pathsOk(s) {
    for (const p of [1, 2]) { const d = distField(s, p), b = p === 1 ? 0 : 2; if (d[s.pawns[b]] < 0 || d[s.pawns[b + 1]] < 0) return false; }
    return true;
  }

  /** Why a wall can't go there for player p: 'range' | 'none left' | 'overlap' | 'blocks' | '' (legal). */
  function wallProblem(s, cx, cy, o, p) {
    if (cx < 1 || cy < 1 || cx > W - 1 || cy > H - 1 || (o !== 'h' && o !== 'v')) return 'range';
    if (s.left[p][o] <= 0) return 'none left';
    if (s.corner[ci(cx, cy)]) return 'overlap';
    for (const [k, i] of cover(cx, cy, o)) if (s[k][i]) return 'overlap';
    setWall(s, cx, cy, o, 1);
    const ok = pathsOk(s);
    setWall(s, cx, cy, o, 0);
    return ok ? '' : 'blocks';
  }
  const legalWall = (s, cx, cy, o, p) => wallProblem(s, cx, cy, o, p) === '';
  /** Place a wall for player p (assumed legal). */
  function placeWall(s, cx, cy, o, p) { setWall(s, cx, cy, o, 1); s.left[p][o]--; s.walls.push([cx, cy, o, p]); }

  /** Shortest distance (squares) of player p's closer pawn. */
  function dist(s, p, field) {
    const d = field || distField(s, p), b = p === 1 ? 0 : 2, a = d[s.pawns[b]], c = d[s.pawns[b + 1]];
    return Math.min(a < 0 ? 999 : a, c < 0 ? 999 : c);
  }

  /** Walls (any orientation) that would cut the edge a-b (neighbours). */
  function wallsOnEdge(a, b) {
    if (b < a) { const t = a; a = b; b = t; }
    const x = a % W, y = (a / W) | 0, out = [];
    if (b === a + 1) { for (const cy of [y, y + 1]) if (cy >= 1 && cy <= H - 1) out.push([x + 1, cy, 'v']); }
    else for (const cx of [x, x + 1]) if (cx >= 1 && cx <= W - 1) out.push([cx, y + 1, 'h']);
    return out;
  }

  /** Plain save / load (walls replayed). */
  function serialize(s) { return { p: s.pawns.slice(), w: s.walls.slice(), l: s.left, t: s.turn, win: s.winner, m: s.moves }; }
  function deserialize(o) {
    const s = create(); s.pawns = o.p.slice(); for (const [cx, cy, or, p] of o.w) { setWall(s, cx, cy, or, 1); s.walls.push([cx, cy, or, p]); }
    s.left = { 1: { v: o.l[1].v, h: o.l[1].h }, 2: { v: o.l[2].v, h: o.l[2].h } }; s.turn = o.t; s.winner = o.win || 0; s.moves = o.m || 0;
    return s;
  }

  return { W, H, N, HOME, sq, isTarget, ownerOf, create, clone, open, pawnMoves, movePawn, endTurn, wallProblem, legalWall,
    placeWall, distField, dist, pathsOk, wallsOnEdge, serialize, deserialize, NB };
})();
