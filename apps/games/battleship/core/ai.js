/*
 * Battleship — computer player (SHIP-1). BSAI.choose(board, level) → cell index to fire at.
 * It only looks at what a player may know: its own shots (miss / hit), which ships are sunk
 * (the cells of a sunk ship are announced) and the sizes still afloat. Never the hidden ships.
 *   easy   – a random cell it has not tried.
 *   medium – hunt and target: checkerboard hunting; after a hit, try the cells around it,
 *            and once two hits line up, keep going along that line.
 *   hard   – probability density: count every way each ship still afloat could fit
 *            (not over misses or sunk ships); placements through live hits count far more.
 *            Fire at the cell covered most often. A few thousand checks: well under 5 ms.
 */
const BSAI = (() => {
  const R = BSRules, N = R.N;
  const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];

  function view(b) {
    const sunkC = new Array(N * N).fill(false), left = [];
    b.ships.forEach((sh, j) => { if (R.isSunk(b, j)) R.cells(sh).forEach((c) => { sunkC[c] = true; }); else left.push(sh.size); });
    const open = [], hits = [];
    for (let c = 0; c < N * N; c++) { if (!b.shots[c]) open.push(c); else if (b.shots[c] === 2 && !sunkC[c]) hits.push(c); }
    return { shots: b.shots, sunkC, left, open, hits };
  }
  const isHit = (v, x, y) => x >= 0 && y >= 0 && x < N && y < N && v.shots[R.idx(x, y)] === 2 && !v.sunkC[R.idx(x, y)];
  const isOpen = (v, x, y) => x >= 0 && y >= 0 && x < N && y < N && !v.shots[R.idx(x, y)];
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  const easy = (v, rnd) => pick(v.open, rnd);

  function medium(v, rnd) {
    if (v.hits.length) {
      const line = [], near = [];
      for (const h of v.hits) {
        const hx = h % N, hy = Math.floor(h / N);
        for (const [dx, dy] of DIRS) {
          if (isOpen(v, hx + dx, hy + dy)) near.push(R.idx(hx + dx, hy + dy));
          if (isHit(v, hx - dx, hy - dy)) {          // two hits in a row: carry on along the line
            let x = hx + dx, y = hy + dy;
            while (isHit(v, x, y)) { x += dx; y += dy; }
            if (isOpen(v, x, y)) line.push(R.idx(x, y));
          }
        }
      }
      if (line.length) return pick(line, rnd);
      if (near.length) return pick(near, rnd);
    }
    const small = Math.min.apply(null, v.left.length ? v.left : [2]);
    const par = v.open.filter((c) => ((c % N) + Math.floor(c / N)) % small === 0);
    return pick(par.length ? par : v.open, rnd);
  }

  function density(v) {
    const d = new Array(N * N).fill(0), W = BS_CONFIG.hardHitWeight;
    for (const sz of v.left) {
      for (const o of ['h', 'v']) {
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          if (o === 'h' ? x + sz > N : y + sz > N) continue;
          const cs = R.cellsOf(sz, x, y, o);
          let k = 0, bad = false;
          for (const c of cs) { if (v.shots[c] === 1 || v.sunkC[c]) { bad = true; break; } if (v.shots[c] === 2) k++; }
          if (bad) continue;
          if (v.hits.length && !k) continue;          // target mode: only shapes through a live hit
          const w = k ? Math.pow(W, k) : 1;
          for (const c of cs) if (!v.shots[c]) d[c] += w;
        }
      }
    }
    return d;
  }
  function hard(v, rnd) {
    const d = density(v);
    let best = -1, cand = [];
    for (const c of v.open) { if (d[c] > best) { best = d[c]; cand = [c]; } else if (d[c] === best) cand.push(c); }
    return best > 0 ? pick(cand, rnd) : medium(v, rnd);
  }

  function choose(b, level, rnd = Math.random) {
    const v = view(b);
    if (!v.open.length) return -1;
    return level === 'easy' ? easy(v, rnd) : level === 'hard' ? hard(v, rnd) : medium(v, rnd);
  }
  return { choose, density, view };
})();
