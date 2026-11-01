/**
 * Browser FPS — enemies: the target pool, timed spawning, the cover grid / flow field the AI walks along,
 * and the per-frame enemy AI (movement, facing, when to shoot; the shot itself is S.enemyFire in combat).
 * The cover grid also gives medkit / grenade pickups their reachable spots (validPickupSpot).
 * installEnemies(S) registers its functions and S.GA (the grid area) on the shared context.
 */
export function installEnemies(S) {
  const { CFG, FOREST, IS, ISLAND, ARENA, scene, player, enemies, colliders, groundAt, onLand } = S;
  const PLAYER_RADIUS = CFG.player.radius;
  const START = S.START;

  // ─── Enemies (humanoid targets, see browser-fps_target.js) ────────────────
  function newTarget(spec) {
    const en = S.createTarget(spec);
    en.groundAt = groundAt;   // feet follow the terrain
    scene.add(en.group);
    colliders.push(en.collider);   // player can't walk through targets (skipped for bullets)
    enemies.push(en);
    return en;
  }

  /** Retry / start: hide every target, then place the initial ones at random far-half spots. */
  function resetEnemies() {
    for (const en of enemies) {
      en.alive = false; en.dying = false; en.rising = 0; en.group.visible = false; en.collider.disabled = true;
    }
    placeInitialEnemies();
  }

  // ─── Timed spawning (random valid spot, rise-up animation, pooled) ───────
  const SP = CFG.spawn;

  function spotIsFree(x, z, gap = SP.targetGap) {
    const m = SP.coverMargin;
    for (const c of colliders) {
      if (c.disabled || c.target) continue;
      if (c.max.y <= 0.05) continue;                        // the floor
      if (x > c.min.x - m - 0.42 && x < c.max.x + m + 0.42 && z > c.min.z - m - 0.42 && z < c.max.z + m + 0.42) return false;
    }
    for (const en of enemies) {
      if (!en.alive) continue;
      const p = en.group.position;
      if (Math.hypot(p.x - x, p.z - z) < gap) return false;
    }
    if (!onLand(x, z, SP.edgeMargin)) return false;
    return Math.hypot(player.pos.x - x, player.pos.z - z) >= SP.minPlayerDist;
  }

  /** Random point in the far half of the arena (z from the far wall up to farHalfMaxZ). */
  function randomFarSpot() {
    if (ISLAND) return S.island.randomSpot(Math.random, { zMax: SP.farHalfMaxZ, margin: SP.edgeMargin + 1 });
    const lim = ARENA.w / 2 - SP.edgeMargin;
    const zMin = -(ARENA.d / 2 - SP.edgeMargin);
    return [(Math.random() * 2 - 1) * lim, zMin + Math.random() * (SP.farHalfMaxZ - zMin)];
  }

  /** Try to spawn one target. Returns it, or null if capped / no valid spot. */
  function spawnRandomTarget(rise = true, gap = SP.targetGap) {
    if (enemies.filter((e) => e.alive).length >= SP.maxAlive) return null;
    for (let i = 0; i < SP.tries; i++) {
      const [x, z] = randomFarSpot();
      if (!spotIsFree(x, z, gap)) continue;
      const yaw = Math.atan2(player.pos.x - x, player.pos.z - z);
      let en = enemies.find((e) => !e.alive && !e.dying);
      if (!en) {
        if (enemies.length >= SP.poolMax) return null;
        en = newTarget({ pos: [x, 1, z], color: SP.colors[enemies.length % SP.colors.length], hp: SP.hp, faceYaw: yaw });
      }
      en.respawn(x, z, yaw, SP.hp, rise);
      return en;
    }
    return null;
  }

  /** Initial enemies: random valid far-half spots, spaced apart, already standing (no rise). */
  function placeInitialEnemies() {
    for (let i = 0; i < SP.initialEnemies; i++) {
      if (!spawnRandomTarget(false, SP.initialGap)) spawnRandomTarget(false, SP.targetGap);  // relax spacing if crowded
    }
  }

  function updateSpawning(dt) {
    if (FOREST) {   // big map: enemies left far behind are quietly recycled so new ones can appear near the player
      for (const en of enemies) {
        if (!en.alive || en.dying) continue;
        const p = en.group.position;
        if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) > IS.despawnDist) { en.alive = false; en.rising = 0; en.group.visible = false; en.collider.disabled = true; }
      }
    }
    S.spawnTimer -= dt;
    if (S.spawnTimer <= 0) {
      S.spawnTimer += SP.interval;
      spawnRandomTarget();
    }
  }

  // ─── Enemy movement: flow field toward the player + sliding collision ─────
  // Grid over the arena; cells blocked by cover/walls (inflated by the enemy radius).
  // BFS from the player's cell gives each free cell a step count; enemies walk downhill.
  // Grid area GA: the whole arena, or on the forest a window (IS.aiWindow) re-centred on the player as they walk.
  const AI = CFG.ai;
  const GRID = FOREST && IS.aiGridCell ? IS.aiGridCell : AI.gridCell;
  const GA = FOREST ? { w: IS.aiWindow, d: IS.aiWindow, ox: Math.round(START[0] / GRID) * GRID, oz: Math.round(START[1] / GRID) * GRID } : { w: ARENA.w, d: ARENA.d, ox: 0, oz: 0 };
  const GW = Math.ceil(GA.w / GRID), GD = Math.ceil(GA.d / GRID);
  const blocked = new Uint8Array(GW * GD);
  const field = new Int32Array(GW * GD);
  let fieldT = 0;
  const cellX = (x) => Math.max(0, Math.min(GW - 1, Math.floor((x - GA.ox + GA.w / 2) / GRID)));
  const cellZ = (z) => Math.max(0, Math.min(GD - 1, Math.floor((z - GA.oz + GA.d / 2) / GRID)));
  const cellCx = (i) => GA.ox - GA.w / 2 + (i + 0.5) * GRID;
  const cellCz = (j) => GA.oz - GA.d / 2 + (j + 0.5) * GRID;
  /** Forest: move the grid window to the player once they are aiRecentre m from its centre. */
  function recentreGrid() {
    if (!FOREST || Math.max(Math.abs(player.pos.x - GA.ox), Math.abs(player.pos.z - GA.oz)) < IS.aiRecentre) return false;
    GA.ox = Math.round(player.pos.x / GRID) * GRID; GA.oz = Math.round(player.pos.z / GRID) * GRID;
    buildBlocked(); buildReachable(player.pos.x, player.pos.z);
    return true;
  }

  /** Static cover/wall boxes (not the floor, not targets). */
  let solidCache = null;
  function solidBoxes() {
    // cover / walls never change: cache the list once
    if (!solidCache) solidCache = colliders.filter((c) => !c.target && !c.disabled && c.max.y > 0.05);
    return solidCache;
  }

  /** Static boxes bucketed on a coarse xz grid (built once) so lookups stay cheap with hundreds of trunks. */
  const HB = 4;
  let coverHash = null;
  const hkey = (i, j) => (i + 32768) * 65536 + (j + 32768);
  function coverBuckets() {
    if (coverHash) return coverHash;
    coverHash = new Map();
    for (const c of solidBoxes()) {
      for (let j = Math.floor(c.min.z / HB); j <= Math.floor(c.max.z / HB); j++) for (let i = Math.floor(c.min.x / HB); i <= Math.floor(c.max.x / HB); i++) {
        const k = hkey(i, j); let l = coverHash.get(k); if (!l) coverHash.set(k, (l = [])); l.push(c);
      }
    }
    return coverHash;
  }
  /** Does a body of radius r at (x, z) overlap any cover/wall box? */
  function hitsCover(x, z, r) {
    const hb = coverBuckets();
    for (let j = Math.floor((z - r) / HB); j <= Math.floor((z + r) / HB); j++) for (let i = Math.floor((x - r) / HB); i <= Math.floor((x + r) / HB); i++) {
      const l = hb.get(hkey(i, j)); if (!l) continue;
      for (const c of l) if (x + r > c.min.x && x - r < c.max.x && z + r > c.min.z && z - r < c.max.z) return true;
    }
    return false;
  }

  function buildBlocked() {
    const r = AI.radius + 0.05;
    for (let j = 0; j < GD; j++) for (let i = 0; i < GW; i++) {
      blocked[j * GW + i] = hitsCover(cellCx(i), cellCz(j), r) || !onLand(cellCx(i), cellCz(j), r + 0.3) ? 1 : 0;
    }
  }

  function buildField() {
    field.fill(-1);
    let pi = cellX(player.pos.x), pj = cellZ(player.pos.z);
    const q = new Int32Array(GW * GD);
    let head = 0, tail = 0;
    // if the player stands on/inside an inflated cell, seed from the nearest free neighbours
    const seed = (i, j) => { const k = j * GW + i; if (!blocked[k] && field[k] < 0) { field[k] = 0; q[tail++] = k; } };
    seed(pi, pj);
    for (let rr = 1; tail === 0 && rr < 6; rr++) {
      for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
        const i = pi + di, j = pj + dj;
        if (i >= 0 && j >= 0 && i < GW && j < GD) seed(i, j);
      }
    }
    while (head < tail) {
      const k = q[head++], i = k % GW, j = (k - i) / GW, d = field[k] + 1;
      if (i > 0 && !blocked[k - 1] && field[k - 1] < 0) { field[k - 1] = d; q[tail++] = k - 1; }
      if (i < GW - 1 && !blocked[k + 1] && field[k + 1] < 0) { field[k + 1] = d; q[tail++] = k + 1; }
      if (j > 0 && !blocked[k - GW] && field[k - GW] < 0) { field[k - GW] = d; q[tail++] = k - GW; }
      if (j < GD - 1 && !blocked[k + GW] && field[k + GW] < 0) { field[k + GW] = d; q[tail++] = k + GW; }
    }
  }

  /** Unit direction (dx, dz) to walk from (x, z) toward the player along the field. */
  const steerOut = { x: 0, z: 0 };
  function steer(x, z) {
    const i = cellX(x), j = cellZ(z), k = j * GW + i;
    let best = field[k] >= 0 ? field[k] : 1e9, bi = -1, bj = -1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= GW || nj >= GD) continue;
      const nk = nj * GW + ni;
      if (blocked[nk] || field[nk] < 0) continue;
      if (di && dj && (blocked[j * GW + ni] || blocked[nj * GW + i])) continue;   // no corner cutting
      const v = field[nk] + (di && dj ? 0.4 : 0);
      if (v < best) { best = v; bi = ni; bj = nj; }
    }
    if (bi < 0) {   // already at the bottom (or no path): head straight for the player
      steerOut.x = player.pos.x - x; steerOut.z = player.pos.z - z;
    } else {
      steerOut.x = cellCx(bi) - x; steerOut.z = cellCz(bj) - z;
    }
    const l = Math.hypot(steerOut.x, steerOut.z) || 1;
    steerOut.x /= l; steerOut.z /= l;
    return steerOut;
  }

  /** Is (x, z) free for enemy `self` (cover, walls, other enemies, the player)? */
  function enemySpotFree(self, x, z) {
    const r = AI.radius;
    const lim = ARENA.w / 2 - r - 0.3, limZ = ARENA.d / 2 - r - 0.3;
    if (x < -lim || x > lim || z < -limZ || z > limZ || !onLand(x, z, r + 0.2)) return false;
    if (hitsCover(x, z, r + 0.02)) return false;
    for (const o of enemies) {
      if (o === self || !o.alive) continue;
      const p = o.group.position;
      if (Math.hypot(p.x - x, p.z - z) < r * 2 + 0.1) return false;
    }
    return Math.hypot(player.pos.x - x, player.pos.z - z) >= r + PLAYER_RADIUS + 0.3;
  }

  /** Slide: try the full move, else each axis separately. Returns distance actually moved. */
  function moveEnemy(en, vx, vz, dt) {
    const p = en.group.position;
    const x0 = p.x, z0 = p.z;
    const nx = p.x + vx * dt, nz = p.z + vz * dt;
    if (enemySpotFree(en, nx, nz)) en.moveTo(nx, nz);
    else if (enemySpotFree(en, nx, p.z)) en.moveTo(nx, p.z);
    else if (enemySpotFree(en, p.x, nz)) en.moveTo(p.x, nz);
    return Math.hypot(p.x - x0, p.z - z0);
  }

  function updateEnemyAI(dt) {
    fieldT -= dt;
    if (fieldT <= 0) {
      fieldT = AI.fieldRefresh;
      recentreGrid();
      buildField();
    }
    for (const en of enemies) {
      if (!en.alive || en.rising > 0) { en.walkSpeed = 0; continue; }   // corpses / risers don't move
      const p = en.group.position;
      const dist = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      if (en.shootCd > 0) en.shootCd -= dt;
      const sees = dist <= AI.range && S.hasLineOfSight(en);
      // Turn (eased, capped): face the player when in sight, else the walking direction
      const err = sees || !en.moveDirSet ? en.turnToward(player.pos.x, player.pos.z, AI.turnRate, dt)
        : en.turnToward(p.x + en.moveDx * 4, p.z + en.moveDz * 4, AI.turnRate, dt);
      en.seenT = sees ? en.seenT + dt : 0;

      // Movement: approach along the flow field until in position with line of sight, then strafe a little
      let moved = 0;
      const x0m = p.x, z0m = p.z;
      if (!sees || dist > AI.preferredDist) {
        const d = steer(p.x, p.z);
        // jog when far away and out of sight (run animation); walk otherwise
        const spd = AI.runSpeed && !sees && dist > AI.runDist ? AI.runSpeed : AI.walkSpeed;
        moved = moveEnemy(en, d.x * spd, d.z * spd, dt);
      } else {
        en.strafeT -= dt;
        if (en.strafeT <= 0) {
          en.strafeT = AI.strafeMinS + Math.random() * (AI.strafeMaxS - AI.strafeMinS);
          const r = Math.random();
          en.strafeDir = r < 0.4 ? -1 : r < 0.8 ? 1 : 0;   // sometimes stand still
        }
        const tx = (player.pos.z - p.z) / (dist || 1), tz = -(player.pos.x - p.x) / (dist || 1); // perpendicular
        let vx = tx * AI.strafeSpeed * en.strafeDir, vz = tz * AI.strafeSpeed * en.strafeDir;
        if (dist < AI.tooClose) {   // back off slowly
          vx -= (player.pos.x - p.x) / dist * AI.walkSpeed * 0.6;
          vz -= (player.pos.z - p.z) / dist * AI.walkSpeed * 0.6;
        }
        if (vx || vz) {
          moved = moveEnemy(en, vx, vz, dt);
          if (moved < 1e-4) en.strafeDir = -en.strafeDir;   // bumped into something: switch side
        }
      }
      if (moved > 1e-4 && !sees) {   // remember the smoothed walking direction for facing
        const k = Math.min(1, dt * 5), mx = (p.x - x0m) / moved, mz = (p.z - z0m) / moved;
        en.moveDx = en.moveDirSet ? en.moveDx + (mx - en.moveDx) * k : mx;
        en.moveDz = en.moveDirSet ? en.moveDz + (mz - en.moveDz) * k : mz;
        en.moveDirSet = true;
      } else if (sees) en.moveDirSet = false;
      const walking = moved / dt > 0.2;
      en.walkSpeed = moved / dt;

      // Shooting: from a standstill as before; while walking only sometimes, and less accurately
      if (sees && err <= AI.aimTolerance && en.seenT >= AI.reaction && en.shootCd <= 0) {
        if (!walking) {
          S.enemyFire(en);
          en.shootCd = AI.cooldownMin + Math.random() * AI.cooldownRandom;
        } else if (Math.random() < AI.moveFireChance) {
          S.enemyFire(en, AI.moveSpreadMult);
          en.shootCd = (AI.cooldownMin + Math.random() * AI.cooldownRandom) * 1.5;
        } else {
          en.shootCd = 0.5;   // decided not to shoot on the move; re-check shortly
        }
      }
    }
  }

  // ─── Pickup spots: static reachability from the player start over the cover grid (cover never moves) ──
  const PK = CFG.pickups;
  const reachable = new Uint8Array(GW * GD);
  function buildReachable(fx = START[0], fz = START[1]) {
    reachable.fill(0);
    const s0 = cellZ(fz) * GW + cellX(fx);
    const q = new Int32Array(GW * GD); let h = 0, t = 0;
    if (!blocked[s0]) { reachable[s0] = 1; q[t++] = s0; }
    while (h < t) {
      const k = q[h++], i = k % GW;
      for (const n of [i > 0 ? k - 1 : -1, i < GW - 1 ? k + 1 : -1, k - GW, k + GW]) {
        if (n < 0 || n >= GW * GD || blocked[n] || reachable[n]) continue;
        reachable[n] = 1; q[t++] = n;
      }
    }
  }
  function validPickupSpot(x, z) {
    const k = cellZ(z) * GW + cellX(x);
    if (!reachable[k] || hitsCover(x, z, PK.clearance)) return false;
    if (Math.abs(x - GA.ox) > GA.w / 2 - 1 || Math.abs(z - GA.oz) > GA.d / 2 - 1 || !onLand(x, z, 1.5)) return false;
    if (Math.hypot(player.pos.x - x, player.pos.z - z) < PK.minPlayerDist) return false;
    for (const it of S.pickups.items) if (Math.hypot(it.x - x, it.z - z) < 3) return false;
    return true;
  }

  Object.assign(S, { GA, newTarget, resetEnemies, spawnRandomTarget, placeInitialEnemies, updateSpawning, recentreGrid, hitsCover, buildBlocked, buildReachable, validPickupSpot, updateEnemyAI });
}
