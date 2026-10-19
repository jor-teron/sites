/* Pac-Man — maze.js
 * The maze layout, tile queries, the ghost-house geometry and the shared grid-movement routine
 * used by Pac-Man and the ghosts.
 *
 * Coordinates are float tile units: tile (c, r) covers [c, c+1) x [r, r+1) and its centre is
 * (c + 0.5, r + 0.5). Actors always travel along one axis and stop / turn only on tile centres,
 * so they can never clip into a wall (classic grid-locked movement).
 */
(function (PAC) {
  'use strict';

  //   #  wall
  //   .  pellet (10)
  //   o  power pellet (50)
  //   ' ' empty (walkable)
  //   -  ghost-house door: a wall for normal movement; ghosts cross it only in their scripted
  //      house moves (leaving the house, eyes going back in), see ghosts.js
  //   P  Pac-Man spawn (walkable, no pellet)
  // Row 9 is the tunnel: its ends are open and wrap around.
  const TEMPLATE = [
    "###################",
    "#........#........#",
    "#o##.###.#.###.##o#",
    "#.................#",
    "#.##.#.#####.#.##.#",
    "#....#...#...#....#",
    "####.### # ###.####",
    "   #.#       #.#   ",
    "####.# ##-## #.####",
    "    .  #   #  .    ",
    "####.# ##### #.####",
    "   #.#       #.#   ",
    "####.# ##### #.####",
    "#........#........#",
    "#.##.###.#.###.##.#",
    "#o.#.....P.....#.o#",
    "##.#.#.#####.#.#.##",
    "#....#...#...#....#",
    "#.######.#.######.#",
    "#.................#",
    "###################"
  ];
  const COLS = TEMPLATE[0].length;   // 19
  const ROWS = TEMPLATE.length;      // 21

  const DIR = {
    none:  { x: 0, y: 0 },
    up:    { x: 0, y: -1 },
    down:  { x: 0, y: 1 },
    left:  { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  // Ghost house: the door is (9, 8), the interior is row 9, columns 8-10. A ghost leaves through the door
  // to the exit tile (9, 7) just above it; returning eyes aim for that same tile and then sink back in.
  const HOUSE = {
    door:  { c: 9, r: 8 },
    exit:  { x: 9.5, y: 7.5 },     // centre of tile (9, 7): where leaving ghosts appear, where eyes aim
    inside: { x: 9.5, y: 9.5 },    // centre of the house, straight below the door
    slots: { blinky: { x: 9.5, y: 9.5 }, pinky: { x: 9.5, y: 9.5 }, inky: { x: 8.5, y: 9.5 }, clyde: { x: 10.5, y: 9.5 } },
  };

  let tiles = [];

  /** Fresh copy of the maze; returns the number of pellets (dots + power pellets). */
  function load() {
    tiles = TEMPLATE.map((row) => row.split(''));
    let n = 0;
    for (const row of tiles) for (const ch of row) if (ch === '.' || ch === 'o') n++;
    return n;
  }

  /** Tile character. Off the top/bottom is wall; off the sides is the tunnel when that row's edge is open. */
  function cell(c, r) {
    if (r < 0 || r >= ROWS) return '#';
    if (c < 0) return tiles[r][0] === '#' ? '#' : ' ';
    if (c >= COLS) return tiles[r][COLS - 1] === '#' ? '#' : ' ';
    return tiles[r][c];
  }

  /** Blocked for normal movement (walls and the house door). */
  function isWall(c, r) {
    const ch = cell(c, r);
    return ch === '#' || ch === '-';
  }

  /** Remove and return the pellet on tile (c, r) ('.', 'o' or null). */
  function takePellet(c, r) {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    const ch = tiles[r][c];
    if (ch !== '.' && ch !== 'o') return null;
    tiles[r][c] = ' ';
    return ch;
  }

  function playerStart() {
    for (let r = 0; r < ROWS; r++) {
      const c = TEMPLATE[r].indexOf('P');
      if (c >= 0) return { x: c + 0.5, y: r + 0.5 };
    }
    return { x: 9.5, y: 15.5 };
  }

  // ─── Grid movement ──────────────────────────────────────────────────────────
  const EPS = 1e-6;
  const centreOf = (v) => Math.floor(v) + 0.5;

  /** Tunnel wrap: the ring is tiles -1 .. COLS (one off-screen tile on each side). */
  function wrap(e) {
    if (e.x < -1) e.x += COLS + 2;
    else if (e.x >= COLS + 1) e.x -= COLS + 2;
  }

  /**
   * Move actor `e` ({ x, y, dir }) `dist` tiles along e.dir. Every time it lands exactly on a tile centre,
   * onCentre(e) is called once: that is where it may turn or stop (set e.dir; DIR.none stops it).
   * Leaving a centre is only ever in a direction onCentre / the caller checked is open, so actors never
   * enter walls. If the perpendicular axis is off-centre (after an early "pre-turn"), it is pulled back
   * onto the centre line while moving — classic cornering.
   */
  function move(e, dist, onCentre) {
    if (!e.dir.x && !e.dir.y) return;
    const perp = e.dir.x ? 'y' : 'x';
    const off = centreOf(e[perp]) - e[perp];
    if (Math.abs(off) > EPS) e[perp] += Math.sign(off) * Math.min(Math.abs(off), dist);
    else e[perp] = centreOf(e[perp]);

    for (let guard = 0; dist > EPS && guard < 4; guard++) {
      if (!e.dir.x && !e.dir.y) return;
      const ax = e.dir.x ? 'x' : 'y';
      const sgn = e.dir.x || e.dir.y;
      const p = e[ax];
      const frac = p - Math.floor(p);
      let toCentre = sgn > 0 ? 0.5 - frac : frac - 0.5;
      if (toCentre <= EPS) {                       // sitting on a centre: the next one is a tile away
        // Safety: never step off a centre into a wall (callers only set open directions, but be sure)
        if (isWall(Math.floor(e.x) + e.dir.x, Math.floor(e.y) + e.dir.y)) {
          if (guard) return;                       // onCentre already ran this step and chose this: stay put
          onCentre(e);
          continue;
        }
        toCentre += 1;
      }
      if (dist < toCentre - EPS) { e[ax] = p + sgn * dist; wrap(e); return; }
      e[ax] = Math.round(p + sgn * toCentre - 0.5) + 0.5;   // land exactly on the centre
      dist -= toCentre;
      wrap(e);
      onCentre(e);
    }
  }

  PAC.maze = {
    TEMPLATE, COLS, ROWS, DIR, HOUSE,
    load, cell, isWall, takePellet, playerStart, move, centreOf,
    get tiles() { return tiles; },
  };
})(window.PAC = window.PAC || {});
