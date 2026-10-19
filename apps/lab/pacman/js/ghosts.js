/* Pac-Man — ghosts.js
 * The four ghosts: house release, scatter/chase schedule, targeting, frightened mode and eaten eyes.
 *
 * Ghost states:
 *   house    — waiting inside the house (bobbing), until released (see RELEASE below)
 *   leaving  — scripted move to the house centre, then up through the door to the exit tile above it
 *   active   — in the maze, following the global scatter / chase mode (or frightened)
 *   eyes     — eaten: fast eyes navigating back to the exit tile
 *   entering — eyes sinking through the door to their slot; there they revive and leave again at once
 *
 * Movement in the maze is grid-locked (maze.move): a ghost picks its next direction once per tile, on the
 * tile centre, never reversing by choice. Ghosts only reverse when forced: on every scatter <-> chase switch
 * and when a power pellet frightens them.
 */
(function (PAC) {
  'use strict';
  const M = PAC.maze, D = M.DIR, H = M.HOUSE;

  // ─── Speeds (tiles per tick at 60 ticks/s) — maze speeds unchanged from the original ──
  const SPEED = 0.075;
  const FRIGHT_MULT = 0.55;
  const EYES_MULT = 2.0;
  const HOUSE_SPEED = 0.05;     // drifting inside the house and through the door

  // Direction preference on ties (original order kept; the arcade uses up, left, down, right).
  const ORDER = [D.up, D.down, D.left, D.right];

  // ─── Scatter / chase schedule (arcade table, seconds) ───────────────────────
  // Phases alternate scatter, chase, scatter, ... starting with scatter; the last chase lasts forever.
  // The phase clock pauses while ghosts are frightened, and restarts on a new life or a new level.
  const MODE_TABLE = [
    { maxLevel: 1,        phases: [7, 20, 7, 20, 5, 20, 5, Infinity] },
    { maxLevel: 4,        phases: [7, 20, 7, 20, 5, 1033, 1 / 60, Infinity] },
    { maxLevel: Infinity, phases: [5, 20, 5, 20, 5, 1037, 1 / 60, Infinity] },
  ];

  // ─── House release ──────────────────────────────────────────────────────────
  // Blinky starts outside. The others leave in the order Pinky, Inky, Clyde; only the first ghost still
  // waiting counts dots. Arcade rules, with dot limits scaled to this maze (150 pellets vs the arcade's 244):
  //  - personal dot limits per level: arcade Pinky 0 / Inky 30 / Clyde 60 on level 1, Clyde 50 on level 2,
  //    then 0 -> here 0 / 18 / 37, then Clyde 31, then 0;
  //  - after losing a life a shared dot counter is used instead: Pinky at 7, Inky at 17, Clyde at 32 dots
  //    (here 4 / 10 / 20); if Clyde is still inside when it reaches his number, it switches back to personal;
  //  - if Pac-Man eats no dot for IDLE_LIMIT seconds (4 s, 3 s from level 5), the next waiting ghost is let out.
  const DOT_LIMITS = [
    { maxLevel: 1,        pinky: 0, inky: 18, clyde: 37 },
    { maxLevel: 2,        pinky: 0, inky: 0,  clyde: 31 },
    { maxLevel: Infinity, pinky: 0, inky: 0,  clyde: 0 },
  ];
  const SHARED_LIMITS = { pinky: 4, inky: 10, clyde: 20 };
  const RELEASE_ORDER = ['pinky', 'inky', 'clyde'];
  const idleLimit = (level) => (level < 5 ? 4 : 3);
  const forLevel = (table, level) => table.find((t) => level <= t.maxLevel);

  // ─── Ghost records ──────────────────────────────────────────────────────────
  const DEFS = [
    { name: 'blinky', color: '#FF0000', scatter: { x: M.COLS - 2, y: 0 } },
    { name: 'pinky',  color: '#FFB8FF', scatter: { x: 1, y: 0 } },
    { name: 'inky',   color: '#00FFFF', scatter: { x: M.COLS - 2, y: M.ROWS - 1 } },
    { name: 'clyde',  color: '#FFB852', scatter: { x: 1, y: M.ROWS - 1 } },
  ];
  const list = DEFS.map((d) => ({ ...d, x: 0, y: 0, dir: D.up, state: 'house', leg: 0, frightened: false, slot: H.slots[d.name] }));
  const byName = Object.fromEntries(list.map((g) => [g.name, g]));

  // Global ghost-controller state
  let level = 1;
  let phase = 0, phaseTime = 0;               // index into the level's MODE_TABLE phases, seconds into it
  let personal = { pinky: 0, inky: 0, clyde: 0 };
  let shared = false, sharedDots = 0, idle = 0;

  const mode = () => (phase % 2 === 0 ? 'scatter' : 'chase');
  const reverse = (d) => ({ x: -d.x, y: -d.y });

  /** Put every ghost back at its start. newLevel resets the dot counters; after a death the shared counter is used. */
  function reset(lvl, afterDeath) {
    level = lvl;
    for (const g of list) {
      g.frightened = false;
      if (g.name === 'blinky') { g.x = H.exit.x; g.y = H.exit.y; g.dir = D.left; g.state = 'active'; }
      else { g.x = g.slot.x; g.y = g.slot.y; g.dir = g.name === 'pinky' ? D.down : D.up; g.state = 'house'; }
    }
    phase = 0; phaseTime = 0; idle = 0;
    if (afterDeath) { shared = true; sharedDots = 0; }
    else { shared = false; personal = { pinky: 0, inky: 0, clyde: 0 }; }
  }

  // ─── House release ──────────────────────────────────────────────────────────
  const firstWaiting = () => RELEASE_ORDER.map((n) => byName[n]).find((g) => g.state === 'house');

  function onDotEaten() {
    idle = 0;
    if (shared) {
      sharedDots++;
      for (const n of RELEASE_ORDER) {
        const g = byName[n];
        if (g.state === 'house' && sharedDots >= SHARED_LIMITS[n]) {
          release(g);
          if (n === 'clyde') shared = false;     // Clyde out on the shared counter: back to personal counters
          break;
        }
      }
    } else {
      const g = firstWaiting();
      if (g) personal[g.name]++;
    }
  }

  function updateRelease(dt) {
    const g = firstWaiting();
    if (!g) return;
    if (!shared && personal[g.name] >= forLevel(DOT_LIMITS, level)[g.name]) { release(g); return; }
    idle += dt;
    if (idle >= idleLimit(level)) { idle = 0; release(g); }
  }

  // ─── Scatter / chase clock ──────────────────────────────────────────────────
  function updateMode(dt, frightActive) {
    if (frightActive) return;                  // paused while frightened
    const phases = forLevel(MODE_TABLE, level).phases;
    phaseTime += dt;
    if (phase < phases.length - 1 && phaseTime >= phases[phase]) {
      phaseTime -= phases[phase];
      phase++;
      // Mode switch: every ghost in the maze turns round
      for (const g of list) if (g.state === 'active') g.dir = reverse(g.dir);
    }
  }

  // ─── Targeting (chase mode) ─────────────────────────────────────────────────
  // Blinky: Pac-Man's tile.
  // Pinky:  4 tiles ahead of Pac-Man (where he faces).
  // Inky:   Pac-Man's tile plus the vector from Blinky to Pac-Man (doubled vector from Blinky).
  // Clyde:  Pac-Man's tile while more than 8 tiles away, his scatter corner when closer.
  // Scatter mode: each ghost's own corner (g.scatter). Eyes: the exit tile above the door.
  function chaseTarget(g, pac) {
    const pc = Math.floor(pac.x), pr = Math.floor(pac.y);
    switch (g.name) {
      case 'blinky': return { x: pc, y: pr };
      case 'pinky':  return { x: pc + pac.face.x * 4, y: pr + pac.face.y * 4 };
      case 'inky': {
        const b = byName.blinky, bc = Math.floor(b.x), br = Math.floor(b.y);
        return { x: pc + (pc - bc), y: pr + (pr - br) };
      }
      default: {
        const far = Math.hypot(pc - Math.floor(g.x), pr - Math.floor(g.y)) > 8;
        return far ? { x: pc, y: pr } : g.scatter;
      }
    }
  }

  /** On a tile centre: pick the open, non-reversing direction closest to the target (random when frightened). */
  function decide(g, pac) {
    const c = Math.floor(g.x), r = Math.floor(g.y);
    if (g.state === 'eyes' && c === Math.floor(H.exit.x) && r === Math.floor(H.exit.y)) {
      g.state = 'entering'; g.leg = 0; g.dir = D.down;    // above the door: sink back into the house
      return;
    }
    const back = reverse(g.dir);
    const options = ORDER.filter((d) => !(d.x === back.x && d.y === back.y) && !M.isWall(c + d.x, r + d.y));
    if (!options.length) { g.dir = back; return; }                    // dead end
    if (g.frightened) { g.dir = options[Math.floor(Math.random() * options.length)]; return; }
    const t = g.state === 'eyes' ? { x: Math.floor(H.exit.x), y: Math.floor(H.exit.y) }
      : mode() === 'scatter' ? g.scatter : chaseTarget(g, pac);
    let best = options[0], bestD = Infinity;
    for (const d of options) {
      const dd = Math.hypot(t.x - (c + d.x), t.y - (r + d.y));
      if (dd < bestD) { bestD = dd; best = d; }
    }
    g.dir = best;
  }

  // ─── Scripted house moves ───────────────────────────────────────────────────
  /** Step toward (tx, ty), one axis at a time (y first when `yFirst`). Returns true on arrival. */
  function stepToward(g, tx, ty, sp, yFirst) {
    const axes = yFirst ? ['y', 'x'] : ['x', 'y'];
    for (const ax of axes) {
      const goal = ax === 'x' ? tx : ty, d = goal - g[ax];
      if (Math.abs(d) > 1e-6) {
        const s = Math.min(Math.abs(d), sp) * Math.sign(d);
        g[ax] += s;
        g.dir = ax === 'x' ? (s > 0 ? D.right : D.left) : (s > 0 ? D.down : D.up);
        return false;
      }
    }
    return true;
  }

  /** Release a waiting ghost: it starts its scripted walk out of the house. */
  function release(g) { g.state = 'leaving'; g.leg = 0; }

  function updateHouse(g) {
    if (g.state === 'house') {                 // bob up and down in the slot
      const top = g.slot.y - 0.2, bottom = g.slot.y + 0.2;
      if (!g.dir.y) g.dir = D.up;
      g.y += g.dir.y * HOUSE_SPEED * 0.6;
      if (g.y <= top) { g.y = top; g.dir = D.down; } else if (g.y >= bottom) { g.y = bottom; g.dir = D.up; }
    } else if (g.state === 'leaving') {
      // leg 0: back to the slot's row centre, then across to the house centre; leg 1: up through the door
      if (g.leg === 0) { if (stepToward(g, H.inside.x, H.inside.y, HOUSE_SPEED, true)) g.leg = 1; }
      else if (stepToward(g, H.exit.x, H.exit.y, HOUSE_SPEED, false)) { g.state = 'active'; g.dir = D.left; }   // out: head left, as in the arcade
    } else if (g.state === 'entering') {
      // eyes: leg 0 down through the door to the house centre; leg 1 across to the slot, then revive and leave
      const sp = SPEED * EYES_MULT;
      if (g.leg === 0) { if (stepToward(g, H.inside.x, H.inside.y, sp, true)) g.leg = 1; }
      else if (stepToward(g, g.slot.x, g.slot.y, sp, false)) { g.frightened = false; release(g); }
    }
  }

  /** One tick for every ghost. ctx = { pac, dt, frightActive }. */
  function update(ctx) {
    updateRelease(ctx.dt);
    updateMode(ctx.dt, ctx.frightActive);
    for (const g of list) {
      if (g.state === 'house' || g.state === 'leaving' || g.state === 'entering') { updateHouse(g); continue; }
      const sp = SPEED * (g.state === 'eyes' ? EYES_MULT : g.frightened ? FRIGHT_MULT : 1);
      M.move(g, sp, (e) => decide(e, ctx.pac));
    }
  }

  /** Power pellet: every ghost not already eyes turns blue; those in the maze turn round. */
  function frighten() {
    for (const g of list) {
      if (g.state === 'eyes' || g.state === 'entering') continue;
      g.frightened = true;
      if (g.state === 'active') g.dir = reverse(g.dir);
    }
  }
  /** Fright over: back to the current scatter / chase phase (the phase clock was paused). */
  function unfrighten() { for (const g of list) g.frightened = false; }
  /** Eaten by Pac-Man: become eyes heading home. */
  function eat(g) { g.frightened = false; g.state = 'eyes'; }

  PAC.ghosts = {
    list, byName, reset, update, onDotEaten, frighten, unfrighten, eat,
    get mode() { return mode(); }, get phase() { return phase; }, get phaseTime() { return phaseTime; },
    get release() { return { shared, sharedDots, personal: { ...personal }, idle }; },
    MODE_TABLE, DOT_LIMITS, SHARED_LIMITS,
  };
})(window.PAC = window.PAC || {});
