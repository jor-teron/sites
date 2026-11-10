/*
 * Battleship — computer player (SHIP-2c). BSAI.choose(board, level, rnd) → cell index to fire at.
 * It only looks at what a player may know: its own shots (miss / hit), which ships are sunk
 * (the cells of a sunk ship are announced) and the sizes still afloat. Never the hidden ships.
 *   easy   – a random cell it has not tried.
 *   medium – hunt and target: checkerboard hunting; after a hit, try the cells around it,
 *            and once two hits line up, keep going along that line. Unchanged from SHIP-1.
 *   hard   – hunt with a remaining-configuration search (MCMC over legal fleets, plus parity).
 *            After a hit, an exact count of every way the unsunk ships can still be placed
 *            together, falling back to MCMC, then density, if the search times out. Never peeks.
 */
const BSAI = (() => {
  const R = BSRules, N = R.N;
  const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];

  function view(b) {
    const sunkC = new Array(N * N).fill(false), left = [];
    b.ships.forEach((sh, j) => { if (R.isSunk(b, j)) R.cells(sh).forEach((c) => { sunkC[c] = true; }); else left.push(sh.size); });
    const open = [], hits = [];
    for (let c = 0; c < N * N; c++) { if (!b.shots[c]) open.push(c); else if (b.shots[c] === 2 && !sunkC[c]) hits.push(c); }
    return { shots: b.shots, sunkC, left, open, hits, noTouch: !!b.noTouch };
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
          if (isHit(v, hx - dx, hy - dy)) {
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
          if (v.hits.length && !k) continue;
          const w = k ? Math.pow(W, k) : 1;
          for (const c of cs) if (!v.shots[c]) d[c] += w;
        }
      }
    }
    return d;
  }

  const catalog = {};
  for (let sz = 2; sz <= 5; sz++) {
    const list = [];
    for (const o of ['h', 'v']) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (o === 'h' ? x + sz > N : y + sz > N) continue;
      list.push(R.cellsOf(sz, x, y, o));
    }
    catalog[sz] = list;
  }

  function helpers(v) {
    function legal(occ, sz, x, y, o) {
      if (x < 0 || y < 0 || (o === 'h' ? x + sz > N : y + sz > N)) return null;
      const cs = R.cellsOf(sz, x, y, o);
      for (const c of cs) if (v.shots[c] === 1 || v.sunkC[c] || occ[c]) return null;
      if (v.noTouch) {
        for (const c of cs) for (const n of R.around(c)) if (occ[n]) return null;
      }
      return cs;
    }
    function allPos(occ, sz) {
      const out = [];
      for (const cs of catalog[sz]) {
        let bad = false;
        for (const c of cs) if (v.shots[c] === 1 || v.sunkC[c] || occ[c]) { bad = true; break; }
        if (bad) continue;
        if (v.noTouch) {
          for (const c of cs) { if (bad) break; for (const n of R.around(c)) if (occ[n]) { bad = true; break; } }
          if (bad) continue;
        }
        out.push(cs);
      }
      return out;
    }
    function posThrough(occ, sz, h) {
      const out = [], hx = h % N, hy = Math.floor(h / N);
      for (const o of ['h', 'v']) for (let s = 0; s < sz; s++) {
        const cs = legal(occ, sz, o === 'h' ? hx - s : hx, o === 'v' ? hy - s : hy, o);
        if (cs && cs.indexOf(h) >= 0) out.push(cs);
      }
      return out;
    }
    return { legal, allPos, posThrough };
  }

  /** Exact remaining-configuration counts for live hits. Feasibility of leftover ships is checked
   *  without enumerating every leftover placement. Fair: only uses shots, sunk cells and sizes. */
  function exact(v, budget, nodeCap) {
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const { allPos, posThrough } = helpers(v);
    const sizes0 = v.left.slice().sort((a, b) => b - a);
    const d = new Array(N * N).fill(0);
    const occ = new Uint8Array(N * N);
    let found = 0, nodes = 0, aborted = false;

    function timedOut() { return aborted || nodes > nodeCap || now() - t0 >= budget; }

    function feasible(rest, ri) {
      if (timedOut()) return false;
      if (ri >= rest.length) return true;
      nodes++;
      const ps = allPos(occ, rest[ri]);
      for (const cs of ps) {
        for (const c of cs) occ[c] = 1;
        const ok = feasible(rest, ri + 1);
        for (const c of cs) occ[c] = 0;
        if (ok) return true;
        if (timedOut()) return false;
      }
      return false;
    }

    function rec(rest) {
      if (timedOut()) { aborted = true; return; }
      nodes++;
      const h = v.hits.find((c) => !occ[c]);
      if (h == null) {
        if (feasible(rest, 0)) {
          found++;
          for (let c = 0; c < N * N; c++) if (occ[c] && !v.shots[c]) d[c]++;
        }
        return;
      }
      const seen = {};
      for (let i = 0; i < rest.length; i++) {
        if (seen[rest[i]]) continue;
        seen[rest[i]] = true;
        const ps = posThrough(occ, rest[i], h);
        if (!ps.length) continue;
        const next = rest.slice(); next.splice(i, 1);
        for (const cs of ps) {
          for (const c of cs) occ[c] = 1;
          rec(next);
          for (const c of cs) occ[c] = 0;
          if (aborted) return;
        }
      }
    }

    rec(sizes0);
    if (!found) return null;
    return { d, found, aborted, nodes };
  }

  /** MCMC over remaining configurations (near-uniform). Fair: shots, sunk cells and leftover sizes only. */
  function configs(v, rnd, budget, want) {
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const now = () => (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const { posThrough } = helpers(v);
    const sizes = v.left.slice().sort((a, b) => b - a);
    const d = new Array(N * N).fill(0);
    const occ = new Uint8Array(N * N);

    // placements legal w.r.t. misses and sunk ships (occ is applied later)
    const legalAt = {};
    for (const sz of sizes) {
      if (legalAt[sz]) continue;
      const out = [];
      outer: for (const cs of catalog[sz]) {
        for (const c of cs) if (v.shots[c] === 1 || v.sunkC[c]) continue outer;
        if (v.noTouch) {
          for (const c of cs) for (const n of R.around(c)) if (v.sunkC[n]) continue outer;
        }
        out.push(cs);
      }
      legalAt[sz] = out;
    }
    function allPos(sz) {
      const out = [], list = legalAt[sz];
      outer: for (const cs of list) {
        for (const c of cs) if (occ[c]) continue outer;
        if (v.noTouch) {
          for (const c of cs) for (const n of R.around(c)) if (occ[n]) continue outer;
        }
        out.push(cs);
      }
      return out;
    }
    function tryPos(sz) {
      const list = legalAt[sz];
      if (!list.length) return null;
      for (let t = 0; t < 48; t++) {
        const cs = list[Math.floor(rnd() * list.length)];
        let bad = false;
        for (const c of cs) if (occ[c]) { bad = true; break; }
        if (bad) continue;
        if (v.noTouch) {
          for (const c of cs) { if (bad) break; for (const n of R.around(c)) if (occ[n]) { bad = true; break; } }
        }
        if (!bad) return cs;
      }
      const all = allPos(sz);
      return all.length ? all[Math.floor(rnd() * all.length)] : null;
    }

    function seed() {
      const ships = [];
      occ.fill(0);
      const rest = sizes.slice();
      while (rest.length) {
        const h = v.hits.find((c) => !occ[c]);
        if (h == null) break;
        const cand = [];
        for (let i = 0; i < rest.length; i++) {
          const ps = posThrough(occ, rest[i], h);
          for (const cs of ps) cand.push({ i, cs });
        }
        if (!cand.length) return null;
        const ch = cand[Math.floor(rnd() * cand.length)];
        for (const c of ch.cs) occ[c] = 1;
        ships.push({ sz: rest[ch.i], cs: ch.cs });
        rest.splice(ch.i, 1);
      }
      for (const sz of rest) {
        const cs = tryPos(sz);
        if (!cs) return null;
        for (const c of cs) occ[c] = 1;
        ships.push({ sz, cs });
      }
      return ships;
    }
    let ships = null;
    for (let k = 0; k < 80 && !ships && now() - t0 < budget; k++) ships = seed();
    if (!ships) return null;

    function add() {
      for (const sh of ships) {
        if (v.hits.length && !sh.cs.some((c) => v.shots[c] === 2 && !v.sunkC[c])) continue;
        for (const c of sh.cs) if (!v.shots[c]) d[c]++;
      }
    }
    function covers() { return !v.hits.length || v.hits.every((h) => occ[h]); }
    add();
    let ok = 1;
    while (ok < want && now() - t0 < budget) {
      const i = Math.floor(rnd() * ships.length);
      const sh = ships[i];
      for (const c of sh.cs) occ[c] = 0;
      const cs = tryPos(sh.sz);
      let accepted = false;
      if (cs) {
        for (const c of cs) occ[c] = 1;
        if (covers()) { sh.cs = cs; accepted = true; ok++; add(); }
        else { for (const c of cs) occ[c] = 0; }
      }
      if (!accepted) for (const c of sh.cs) occ[c] = 1;
    }
    return ok >= 40 ? d : null;
  }

  function pickBest(d, open, rnd, v, forceParity) {
    let cells = open;
    if (forceParity && v && v.left && v.left.length) {
      const small = Math.min.apply(null, v.left);
      const par = open.filter((c) => ((c % N) + Math.floor(c / N)) % small === 0);
      if (par.length) cells = par;
    }
    let best = -1, cand = [];
    for (const c of cells) { if (d[c] > best) { best = d[c]; cand = [c]; } else if (d[c] === best) cand.push(c); }
    if (best <= 0 && cells !== open) {
      best = -1; cand = [];
      for (const c of open) { if (d[c] > best) { best = d[c]; cand = [c]; } else if (d[c] === best) cand.push(c); }
    }
    if (best <= 0) return null;
    return pick(cand, rnd);
  }

  function hard(v, rnd) {
    const budget = BS_CONFIG.hardBudgetMs || 16;
    // Prefer MCMC (joint weights) always. Exact leftover-feasibility counts each covering
    // placement once, which over-weights long ships; only use it when few ships remain
    // and the search finishes, as a supplement if MCMC fails.
    const d = configs(v, rnd, budget, 20000);
    const near = v.hits.length ? v.open.filter((c) => {
      const x = c % N, y = Math.floor(c / N);
      return v.hits.some((h) => Math.abs(h % N - x) + Math.abs(Math.floor(h / N) - y) === 1);
    }) : v.open;
    const c = d && pickBest(d, near.length ? near : v.open, rnd, v, !v.hits.length);
    if (c != null) return c;
    if (v.hits.length && v.left.length <= 3) {
      const ex = exact(v, budget, 80000);
      if (ex && ex.d) {
        const c2 = pickBest(ex.d, v.open, rnd, v, false);
        if (c2 != null) return c2;
      }
    }
    const c3 = pickBest(density(v), v.open, rnd, v, !v.hits.length);
    return c3 != null ? c3 : medium(v, rnd);
  }

  function choose(b, level, rnd = Math.random) {
    const v = view(b);
    if (!v.open.length) return -1;
    return level === 'easy' ? easy(v, rnd) : level === 'hard' ? hard(v, rnd) : medium(v, rnd);
  }
  return { choose, density, configs, exact, view };
})();
if (typeof globalThis !== 'undefined') globalThis.BSAI = BSAI;
