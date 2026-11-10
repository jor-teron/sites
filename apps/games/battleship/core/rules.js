/*
 * Battleship — rules (SHIP-2c). Pure functions, no page code.
 * A board = { ships: [{ name, size, x, y, o }], shots: [100 x 0 none / 1 miss / 2 hit], noTouch? }.
 * A ship sits at (x, y) and runs right ('h') or down ('v'); x = -1 means not placed yet.
 * Ships must fit and may not overlap. Touching is allowed unless board.noTouch is set (8-neighbours).
 * fire() marks a shot and says miss / hit / sunk; the fleet is lost when every ship is sunk.
 */
const BSRules = (() => {
  const N = BS_CONFIG.size;
  const idx = (x, y) => y * N + x;
  const label = (c) => 'ABCDEFGHIJ'[c % N] + (Math.floor(c / N) + 1);
  const list = (id) => BS_CONFIG.fleets[id] || BS_CONFIG.fleets.classic;
  function fleetIdOf(ships) {
    const sig = (ships || []).map((s) => s.size || s).join(',');
    for (const id of Object.keys(BS_CONFIG.fleets)) {
      if (BS_CONFIG.fleets[id].map((f) => f.size).join(',') === sig) return id;
    }
    return null;
  }

  function newBoard(fleet, noTouch) {
    const f = typeof fleet === 'string' ? list(fleet) : (Array.isArray(fleet) ? fleet : list('classic'));
    return { ships: f.map((s) => ({ name: s.name, size: s.size, x: -1, y: -1, o: 'h' })), shots: new Array(N * N).fill(0), noTouch: !!noTouch };
  }
  function cellsOf(size, x, y, o) { const out = []; for (let k = 0; k < size; k++) out.push(o === 'h' ? idx(x + k, y) : idx(x, y + k)); return out; }
  function cells(sh) { return sh.x < 0 ? [] : cellsOf(sh.size, sh.x, sh.y, sh.o); }
  function occupancy(b, skip = -1) {
    const occ = new Array(N * N).fill(-1);
    b.ships.forEach((sh, j) => { if (j !== skip) cells(sh).forEach((c) => { occ[c] = j; }); });
    return occ;
  }
  function around(c) {
    const x = c % N, y = Math.floor(c / N), out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < N && ny < N) out.push(idx(nx, ny));
    }
    return out;
  }
  function fits(b, i, x, y, o) {
    const sz = b.ships[i].size;
    if (x < 0 || y < 0 || x >= N || y >= N || (o === 'h' ? x + sz > N : y + sz > N)) return false;
    const occ = occupancy(b, i), cs = cellsOf(sz, x, y, o);
    if (!cs.every((c) => occ[c] < 0)) return false;
    if (b.noTouch) {
      for (const c of cs) for (const n of around(c)) if (occ[n] >= 0) return false;
    }
    return true;
  }
  function place(b, i, x, y, o) {
    if (!fits(b, i, x, y, o)) return false;
    Object.assign(b.ships[i], { x, y, o }); return true;
  }
  /** Place with the bow on (x, y), slid back inside the grid if it would hang off the edge.
   *  The UI uses place() instead, so a tap near the edge is refused rather than slid. */
  function placeNear(b, i, x, y, o) {
    const sz = b.ships[i].size;
    if (o === 'h') x = Math.min(x, N - sz); else y = Math.min(y, N - sz);
    return place(b, i, x, y, o);
  }
  function unplace(b, i) { Object.assign(b.ships[i], { x: -1, y: -1 }); }
  function randomFleet(b, rnd = Math.random) {
    for (;;) {
      b.ships.forEach((_, i) => unplace(b, i));
      let ok = true;
      for (let i = 0; i < b.ships.length && ok; i++) {
        ok = false;
        for (let t = 0; t < 400 && !ok; t++) {
          const o = rnd() < 0.5 ? 'h' : 'v';
          ok = place(b, i, Math.floor(rnd() * N), Math.floor(rnd() * N), o);
        }
      }
      if (ok) return b;
    }
  }
  const allPlaced = (b) => b.ships.every((sh) => sh.x >= 0);
  const isSunk = (b, j) => b.ships[j].x >= 0 && cells(b.ships[j]).every((c) => b.shots[c] === 2);
  const shipsLeft = (b) => b.ships.filter((_, j) => !isSunk(b, j)).length;
  const lost = (b) => shipsLeft(b) === 0;
  const salvoShots = (b) => Math.max(1, shipsLeft(b));

  function peek(b, c) {
    if (c < 0 || c >= N * N || b.shots[c]) return { res: 'repeat' };
    const j = occupancy(b)[c];
    if (j < 0) return { res: 'miss' };
    const wouldSink = cells(b.ships[j]).every((k) => k === c || b.shots[k] === 2);
    if (wouldSink) {
      const win = b.ships.every((_, i) => i === j || isSunk(b, i));
      return { res: 'sunk', ship: j, win };
    }
    return { res: 'hit', ship: j };
  }
  function fire(b, c) {
    if (c < 0 || c >= N * N || b.shots[c]) return { res: 'repeat' };
    const j = occupancy(b)[c];
    if (j < 0) { b.shots[c] = 1; return { res: 'miss' }; }
    b.shots[c] = 2;
    if (isSunk(b, j)) return { res: 'sunk', ship: j, win: lost(b) };
    return { res: 'hit', ship: j };
  }

  const serialize = (b) => ({ s: b.ships.map((sh) => [sh.x, sh.y, sh.o, sh.name, sh.size]), t: b.shots.join(''), noTouch: !!b.noTouch });
  function deserialize(o, fallbackFleet, noTouch) {
    if (!o || !Array.isArray(o.s) || typeof o.t !== 'string' || o.t.length !== N * N) throw new Error('bad board');
    const sizes = o.s.map((p) => (p && p.length >= 5 ? p[4] : null));
    let fleet = fallbackFleet;
    if (sizes.every((n) => typeof n === 'number')) {
      const id = fleetIdOf(sizes);
      if (id) fleet = id;
    } else if (o.s.length !== list(fallbackFleet || 'classic').length) {
      const id = Object.keys(BS_CONFIG.fleets).find((k) => list(k).length === o.s.length);
      if (id) fleet = id;
    }
    const b = newBoard(fleet, noTouch != null ? noTouch : !!o.noTouch);
    if (o.s.length !== b.ships.length) throw new Error('bad board');
    o.s.forEach((p, i) => { if (p[0] >= 0 && !place(b, i, p[0], p[1], p[2])) throw new Error('bad ship'); });
    b.shots = o.t.split('').map(Number);
    return b;
  }

  return { N, idx, label, list, fleetIdOf, newBoard, cells, cellsOf, occupancy, around, fits, place, placeNear, unplace, randomFleet,
    allPlaced, isSunk, shipsLeft, lost, salvoShots, peek, fire, serialize, deserialize };
})();
if (typeof globalThis !== 'undefined') globalThis.BSRules = BSRules;
