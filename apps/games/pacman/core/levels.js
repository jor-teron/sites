/* Pac-Man — levels.js
 * Per-level difficulty: speeds, fright time, Cruise Elroy thresholds and the bonus fruit.
 *
 * Based on the arcade table. Speeds there are percentages of a maximum speed; here 100% = 0.1375 tiles per
 * tick (60 ticks/s), chosen so that level 1 Pac-Man (80%) keeps the original 0.11 tiles/tick.
 * Dot counts are scaled to this maze: 150 pellets vs the arcade's 244 (factor ~0.615).
 */
(function (PAC) {
  'use strict';
  const MAX = 0.1375;                 // tiles per tick at "100%"
  const SCALE = 150 / 244;            // this maze's pellets vs the arcade maze
  const dots = (n) => Math.round(n * SCALE);

  // Speeds (%), by level band. pacFright = Pac-Man while ghosts are blue; tunnel = ghosts in the side tunnel.
  const SPEEDS = [
    { maxLevel: 1,        pac: 80,  pacFright: 90,  ghost: 75, tunnel: 40, fright: 50 },
    { maxLevel: 4,        pac: 90,  pacFright: 95,  ghost: 85, tunnel: 45, fright: 55 },
    { maxLevel: 20,       pac: 100, pacFright: 100, ghost: 95, tunnel: 50, fright: 60 },
    { maxLevel: Infinity, pac: 90,  pacFright: 90,  ghost: 95, tunnel: 50, fright: 60 },
  ];
  // Fright time (s) and number of white flashes at its end, levels 1..19; from level 19 on: 0 = ghosts only
  // reverse when a power pellet is eaten, they don't turn blue.
  const FRIGHT_S  = [6, 5, 4, 3, 2, 5, 2, 2, 1, 5, 2, 1, 1, 3, 1, 1, 0, 1, 0];
  const FLASHES   = [5, 5, 5, 5, 5, 5, 5, 5, 3, 5, 5, 3, 3, 5, 3, 3, 0, 3, 0];
  // Cruise Elroy: Blinky speeds up when this few pellets are left (stage 1 / stage 2), arcade dot counts scaled.
  const ELROY = [
    { maxLevel: 1,        dots1: 20,  sp1: 80,  dots2: 10, sp2: 85 },
    { maxLevel: 2,        dots1: 30,  sp1: 90,  dots2: 15, sp2: 95 },
    { maxLevel: 4,        dots1: 40,  sp1: 90,  dots2: 20, sp2: 95 },
    { maxLevel: 5,        dots1: 40,  sp1: 100, dots2: 20, sp2: 105 },
    { maxLevel: 8,        dots1: 50,  sp1: 100, dots2: 25, sp2: 105 },
    { maxLevel: 11,       dots1: 60,  sp1: 100, dots2: 30, sp2: 105 },
    { maxLevel: 14,       dots1: 80,  sp1: 100, dots2: 40, sp2: 105 },
    { maxLevel: 18,       dots1: 100, sp1: 100, dots2: 50, sp2: 105 },
    { maxLevel: Infinity, dots1: 120, sp1: 100, dots2: 60, sp2: 105 },
  ];
  // Bonus fruit per level (arcade): shown twice per level, after FRUIT_AT pellets have been eaten.
  const FRUITS = [
    { maxLevel: 1,        name: 'cherry',     icon: '🍒', points: 100 },
    { maxLevel: 2,        name: 'strawberry', icon: '🍓', points: 300 },
    { maxLevel: 4,        name: 'orange',     icon: '🍊', points: 500 },
    { maxLevel: 6,        name: 'apple',      icon: '🍎', points: 700 },
    { maxLevel: 8,        name: 'melon',      icon: '🍈', points: 1000 },
    { maxLevel: 10,       name: 'galaxian',   icon: '🚀', points: 2000 },
    { maxLevel: 12,       name: 'bell',       icon: '🔔', points: 3000 },
    { maxLevel: Infinity, name: 'key',        icon: '🔑', points: 5000 },
  ];
  const FRUIT_AT = [dots(70), dots(170)];          // arcade 70 / 170 -> 43 / 105 here

  const band = (table, level) => table.find((t) => level <= t.maxLevel);
  const pct = (p) => (p / 100) * MAX;

  /** Everything level-dependent, speeds in tiles per tick, times in ticks. */
  function get(level) {
    const s = band(SPEEDS, level), e = band(ELROY, level), i = Math.min(level, FRIGHT_S.length) - 1;
    return {
      level,
      pac: pct(s.pac), pacFright: pct(s.pacFright),
      ghost: pct(s.ghost), ghostTunnel: pct(s.tunnel), ghostFright: pct(s.fright),
      frightTicks: Math.round(FRIGHT_S[i] * 60), flashes: FLASHES[i],
      elroy1Dots: dots(e.dots1), elroy1: pct(e.sp1), elroy2Dots: dots(e.dots2), elroy2: pct(e.sp2),
      fruit: band(FRUITS, level),
    };
  }

  PAC.levels = { get, FRUIT_AT, MAX, SCALE, FRUITS };
})(window.PAC = window.PAC || {});
