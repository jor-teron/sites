/* Pac-Man — pacman.js
 * The player: input buffering, turning rules and movement.
 *
 * Turning rules (classic feel):
 *  - A direction press is buffered in pac.next and kept until it can be taken (or another key replaces it).
 *  - Reversing is allowed at any moment.
 *  - A 90° turn is taken on a tile centre when the tile that way is open, or up to PRETURN tiles before /
 *    after the centre ("pre-turn"); the small leftover offset is then smoothed out while moving (cornering).
 *  - Running into a wall stops Pac-Man exactly on the last tile centre; he keeps facing that way.
 */
(function (PAC) {
  'use strict';
  const M = PAC.maze;
  const SPEED = 0.11;      // tiles per tick (60 ticks/s) — unchanged
  const PRETURN = 0.3;     // how far (tiles) from a tile centre a buffered 90° turn may still be taken

  const pac = {
    x: 0, y: 0,
    dir: M.DIR.none,       // current movement (DIR.none = standing)
    next: M.DIR.none,      // buffered direction
    face: M.DIR.right,     // last movement direction (drawing, Pinky's look-ahead)
    speed: SPEED,
    mouth: 0, mouthDir: 1,
  };

  function reset() {
    const s = M.playerStart();
    pac.x = s.x; pac.y = s.y;
    pac.dir = M.DIR.none; pac.next = M.DIR.none; pac.face = M.DIR.right;
    pac.mouth = 0; pac.mouthDir = 1;
  }

  const same = (a, b) => a.x === b.x && a.y === b.y;
  const open = (c, r, d) => !M.isWall(c + d.x, r + d.y);

  function setDir(d) {
    pac.dir = d; pac.next = M.DIR.none;
    if (d.x || d.y) pac.face = d;
  }

  /** On each tile centre: take the buffered turn if that way is open, else stop if the way ahead is blocked. */
  function onCentre(p) {
    const c = Math.floor(p.x), r = Math.floor(p.y);
    if ((p.next.x || p.next.y) && open(c, r, p.next)) setDir(p.next);
    else if (M.isWall(c + p.dir.x, r + p.dir.y)) p.dir = M.DIR.none;
  }

  /** Apply the buffered direction when it is allowed right now (standing, reversing, or a pre-turn). */
  function tryBuffered() {
    const n = pac.next, d = pac.dir;
    if (!n.x && !n.y) return;
    const c = Math.floor(pac.x), r = Math.floor(pac.y);
    if (!d.x && !d.y) { if (open(c, r, n)) setDir(n); return; }          // standing on a centre
    if (same(n, d)) { pac.next = M.DIR.none; return; }                   // already going that way
    if (n.x === -d.x && n.y === -d.y) { setDir(n); return; }             // reverse: any time
    const ax = d.x ? 'x' : 'y';                                          // 90° turn: near the centre on the MOVING axis
    if (Math.abs(pac[ax] - M.centreOf(pac[ax])) <= PRETURN && open(c, r, n)) setDir(n);
  }

  /** One tick. Calls onPellet(ch) for each pellet eaten. Returns true if Pac-Man moved. */
  function update(onPellet) {
    tryBuffered();
    const x0 = pac.x, y0 = pac.y;
    M.move(pac, pac.speed, onCentre);
    const moved = pac.x !== x0 || pac.y !== y0;
    if (moved) {
      pac.mouth += pac.mouthDir * 0.15;
      if (pac.mouth >= 1) { pac.mouth = 1; pac.mouthDir = -1; }
      if (pac.mouth <= 0) { pac.mouth = 0; pac.mouthDir = 1; }
    }
    // Eat when well inside a tile (unchanged rule)
    const c = Math.floor(pac.x), r = Math.floor(pac.y);
    const fx = pac.x - c, fy = pac.y - r;
    if (fx > 0.35 && fx < 0.65 && fy > 0.35 && fy < 0.65) {
      const ch = M.takePellet(c, r);
      if (ch) onPellet(ch);
    }
    return moved;
  }

  PAC.pacman = { pac, reset, update, PRETURN };
})(window.PAC = window.PAC || {});
