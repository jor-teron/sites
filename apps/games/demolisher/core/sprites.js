/*
  File: core/sprites.js
  Project: Demolisher
  Purpose: Sprite drawing on top of the art cache in assets.js: textured terrain, hero and enemy
  parts, weapons, projectiles, targets, exit gate, explosions, smoke, sparks and debris.
  Every function returns false (draws nothing) when its sprites are not loaded, so render.js can
  fall back to the old shape drawing. Visual only: no physics, no hitboxes, no Math.random.
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
  Uses: assets.js (Art), state.js, terrain.js, entities.js, weapons.js.
*/

'use strict';

/* ============================================================
   TEXTURED TERRAIN
   One canvas for the whole world, one tile = one 14 px sprite (x Art.tileScale).
   Painted once per world and re-painted only around damaged tiles.
   ============================================================ */

let artCanvas = null;
let artCtx = null;
/* False until the textured world has been fully painted for the current world. */
let artPainted = false;

const TILE_DIRT = ['env/tile_dirt_0', 'env/tile_dirt_1', 'env/tile_dirt_2'];
const TILE_STONE = ['env/tile_stone_0', 'env/tile_stone_1', 'env/tile_stone_2'];
const TILE_METAL = ['env/tile_metal_0', 'env/tile_metal_1'];
const TILE_LAVA = ['env/tile_lava_0', 'env/tile_lava_1'];

/* Cheap deterministic hash of a tile position (variant pick; never random per frame). */
function tileHash(x, y) {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function artCanvasReady() {
  if (artCanvas) return true;
  if (!Art.tilesReady()) return false;
  const S = Art.tileScale;
  artCanvas = document.createElement('canvas');
  artCanvas.width = Math.round(GRID_W * TILE * S);
  artCanvas.height = Math.round(GRID_H * TILE * S);
  artCtx = artCanvas.getContext('2d');
  artPainted = false;
  return true;
}

/* Texture key for the tile at (x, y) with material m. */
function tileArtKey(m, x, y, aboveOpen) {
  const h = tileHash(x, y);
  switch (m) {
    case MAT.DIRT: return TILE_DIRT[h % 3];
    case MAT.GRASS: return aboveOpen ? 'env/tile_grass_top' : 'env/tile_grass_side';
    case MAT.STONE: return TILE_STONE[h % 3];
    case MAT.CRATE: return 'env/tile_crate';
    case MAT.METAL: return TILE_METAL[h % 2];
    case MAT.LAVA: return TILE_LAVA[h % 2];
    case MAT.WATER: return 'env/tile_water';
    case MAT.TARGET: return 'env/tile_target';
  }
  return null;
}

/*
  Paint tiles x0..x1, y0..y1 (inclusive) into the textured world. The rectangle grows by one tile
  because edge shading depends on the neighbours. Edge light/shadow, water and lava surface lines
  and the damage overlay are drawn on top of the texture.
*/
function paintTerrainArt(x0, y0, x1, y1) {
  x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1);
  x1 = Math.min(GRID_W - 1, x1 + 1); y1 = Math.min(GRID_H - 1, y1 + 1);
  const S = Art.tileScale;
  const T = TILE * S;
  const g = artCtx;
  const rx0 = Math.round(x0 * T), ry0 = Math.round(y0 * T);
  g.clearRect(rx0, ry0, Math.round((x1 + 1) * T) - rx0, Math.round((y1 + 1) * T) - ry0);
  const e1 = Math.max(1, Math.round(1.5 * S));
  const e2 = Math.max(1, Math.round(2.2 * S));
  for (let y = y0; y <= y1; y++) {
    const py = Math.round(y * T);
    const ph = Math.round((y + 1) * T) - py;
    for (let x = x0; x <= x1; x++) {
      const i = y * GRID_W + x;
      const m = terrain[i];
      if (m === MAT.AIR) continue;
      const above = y > 0 ? terrain[i - GRID_W] : MAT.METAL;
      const below = y < GRID_H - 1 ? terrain[i + GRID_W] : MAT.METAL;
      const left = x > 0 ? terrain[i - 1] : MAT.METAL;
      const right = x < GRID_W - 1 ? terrain[i + 1] : MAT.METAL;
      const aboveOpen = above === MAT.AIR || above === MAT.WATER || above === MAT.LAVA;
      const sp = Art.get(tileArtKey(m, x, y, above === MAT.AIR));
      if (!sp) continue;
      const px = Math.round(x * T);
      const pw = Math.round((x + 1) * T) - px;
      if (m === MAT.WATER) g.globalAlpha = 0.68;
      g.drawImage(sp.c, px, py, pw, ph);
      g.globalAlpha = 1;
      if (m === MAT.WATER) {
        if (above === MAT.AIR) {
          g.fillStyle = 'rgba(200,230,255,0.75)';
          g.fillRect(px, py, pw, e1);
        }
        continue;
      }
      if (m === MAT.LAVA) {
        if (above === MAT.AIR) {
          g.fillStyle = 'rgba(255,230,140,0.85)';
          g.fillRect(px, py, pw, e1);
          const gl = g.createLinearGradient(0, py - 7 * S, 0, py);
          gl.addColorStop(0, 'rgba(255,110,30,0)');
          gl.addColorStop(1, 'rgba(255,140,40,0.35)');
          g.fillStyle = gl;
          g.fillRect(px, py - Math.round(7 * S), pw, Math.round(7 * S));
        }
        continue;
      }
      /* Solid blocks: light on open top, shadow on open bottom, soft side shade. */
      if (above === MAT.AIR || (aboveOpen && m !== MAT.GRASS)) {
        g.fillStyle = 'rgba(255,255,255,0.20)';
        g.fillRect(px, py, pw, e1);
      }
      if (below === MAT.AIR || below === MAT.WATER || below === MAT.LAVA) {
        g.fillStyle = 'rgba(0,0,0,0.30)';
        g.fillRect(px, py + ph - e2, pw, e2);
      }
      if (left === MAT.AIR) {
        g.fillStyle = 'rgba(255,255,255,0.10)';
        g.fillRect(px, py, e1, ph);
      }
      if (right === MAT.AIR) {
        g.fillStyle = 'rgba(0,0,0,0.20)';
        g.fillRect(px + pw - e1, py, e1, ph);
      }
      /* Damage: darker and cracked as hp drops. */
      const k = terrainHp[i] / MAT_INFO[m].hp;
      if (k < 0.999) {
        g.fillStyle = 'rgba(20,8,0,' + (0.5 * (1 - Math.max(0, k))).toFixed(3) + ')';
        g.fillRect(px, py, pw, ph);
        if (k < 0.7) {
          const cr = Art.get(k < 0.35 ? 'fx/crack_2' : 'fx/crack_1');
          if (cr) g.drawImage(cr.c, px, py, pw, ph);
        }
      }
    }
  }
}

/*
  Textured replacement for the 1 px terrain blit. rect = damaged tile rectangle or null.
  Returns false when the textures are not ready (render.js then blits the old image).
*/
function drawTerrainArt(rect) {
  if (!artCanvasReady()) return false;
  if (!artPainted) {
    paintTerrainArt(0, 0, GRID_W - 1, GRID_H - 1);
    artPainted = true;
  } else if (rect) {
    paintTerrainArt(rect.x0, rect.y0, rect.x1, rect.y1);
  }
  const S = Art.tileScale;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    artCanvas,
    camX * S, camY * S, VIEW_W * S, VIEW_H * S,
    0, 0, CW, CH
  );
  return true;
}

/* ============================================================
   CHARACTERS
   ============================================================ */

/* Draw one sprite with its top-left at (x, y); optional size override. */
function artDraw(key, x, y, w, h) {
  const s = Art.sprites[key];
  if (!s) return false;
  ctx.drawImage(s.c, x, y, w || s.w, h || s.h);
  return true;
}

/* Draw a sprite so its pivot point lands on (0, 0) of the current transform. */
function artDrawPivot(key, scale) {
  const s = Art.sprites[key];
  if (!s) return false;
  const pv = ART_PIVOTS[key] || { x: s.w / 2, y: s.h / 2 };
  const k = scale || 1;
  ctx.drawImage(s.c, -pv.x * k, -pv.y * k, s.w * k, s.h * k);
  return true;
}

const HERO_GUN_KEYS = { pistol: 'weapons/gun_pistol', rocket: 'weapons/gun_rocket', grenade: 'weapons/gun_grenade', laser: 'weapons/gun_laser' };
const ENEMY_SKINS = ['grunt', 'trooper', 'scout'];

/* Flash amount (0..1) for the part being drawn; set by drawRig, read by rigPart. */
let rigFlash = 0;

/* One body part: the sprite, then (during a hit) its white silhouette on top. */
function rigPart(key, x, y, w, h) {
  const s = Art.sprites[key];
  if (!s) return;
  const pw = w || s.w;
  const ph = h || s.h;
  ctx.drawImage(s.c, x, y, pw, ph);
  if (rigFlash > 0.02) {
    const sil = Art.silhouette(key);
    if (!sil) return;
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * Math.min(1, rigFlash * 1.1) * 0.85;
    ctx.drawImage(sil.c, x, y, pw, ph);
    ctx.globalAlpha = a;
  }
}

/* Sprite drawn about its pivot point (ART_PIVOTS) at the current origin. */
function rigPartPivot(key) {
  const s = Art.sprites[key];
  if (!s) return;
  const pv = ART_PIVOTS[key] || { x: s.w / 2, y: s.h / 2 };
  rigPart(key, -pv.x, -pv.y);
}

/*
  Draw one animated character from its rig and the pose in st.pose (anim.js).
  Everything is drawn in a frame that faces right and is mirrored for left. Layers, back to
  front: cape, back leg, front leg, torso (leaning about the hips), head, arm + weapon.
  The whole figure tips over about its feet when dead. flash: draw an enemy-style muzzle flash.
*/
function drawRig(rig, st, sx, sy, gunKey, flash) {
  const P = st.pose;
  const legB = rig.legs + '_back';
  const legF = rig.legs + '_front';
  const sB = Art.sprites[legB];
  const sF = Art.sprites[legF];
  const k = rig.legW / 22;                       // hip joints sit at fixed fractions of the leg pair
  ctx.save();
  ctx.translate(sx, sy);
  if (P.face < 0) ctx.scale(-1, 1);
  ctx.globalAlpha = P.alpha;
  if (P.dead) {
    ctx.translate(0, rig.footY + P.deathY - (-rig.bodyX) * Math.sin(Math.min(P.deathRot, 1.5708)));   // lie on the ground, not in it
    ctx.rotate(-P.deathRot);
    ctx.translate(0, -rig.footY);
  }
  rigFlash = P.hit;

  if (rig.cape) {
    const cs = Art.sprites[rig.cape];
    ctx.save();
    ctx.translate(rig.neck[0] - 4, rig.neck[1] + 2 + P.ub);
    ctx.rotate(P.capeSway + P.lean);
    rigPart(rig.cape, -cs.w + 6, -2);
    ctx.restore();
  }

  const hipY = rig.legY + 1.5;
  ctx.save();                                       // back leg
  ctx.translate(rig.legX + 0.29 * rig.legW, hipY - P.liftBack);
  ctx.rotate(-P.legBack);
  rigPart(legB, -0.29 * rig.legW, -1.5);
  ctx.restore();
  ctx.save();                                       // front leg
  ctx.translate(rig.legX + 0.7 * rig.legW, hipY - P.liftFront);
  ctx.rotate(-P.legFront);
  rigPart(legF, -0.25 * rig.legW, -1.5);
  ctx.restore();

  ctx.translate(P.shift, P.ub);                     // upper body
  ctx.translate(rig.hip[0], rig.hip[1]);
  ctx.rotate(P.lean);
  ctx.translate(-rig.hip[0], -rig.hip[1]);
  rigPart(rig.body, rig.bodyX, rig.bodyY);
  ctx.save();
  ctx.translate(rig.neck[0], rig.neck[1]);
  ctx.rotate(P.tilt);
  rigPart(rig.head, rig.headX - rig.neck[0], rig.headY - rig.neck[1], rig.headW, rig.headH);
  ctx.restore();

  const armKey = rig.arm;
  const pv = ART_PIVOTS[armKey];
  ctx.save();                                       // arm + weapon
  ctx.translate(rig.shoulder[0], rig.shoulder[1]);
  ctx.rotate(P.arm - P.lean - P.kick * 0.13);
  ctx.translate(-P.kick * rig.kickPx, 0);
  rigPartPivot(armKey);
  ctx.translate(pv.hand, 0);
  const gk = gunKey || rig.gun;
  rigPartPivot(gk);
  if (flash && P.muz > 0.01) {
    const fl = Art.sprites['fx/muzzle_flash'];
    if (fl) {
      const gs = Art.sprites[gk];
      const gp = ART_PIVOTS[gk] || { x: 4, y: 4 };
      ctx.translate((gs ? gs.w : 16) - gp.x, (gs ? gs.h / 2 : 4) - gp.y);
      const fs = rig.flashScale * (0.7 + 0.5 * P.muz);
      ctx.globalAlpha = P.alpha * Math.min(1, P.muz * 1.4);
      ctx.globalCompositeOperation = 'lighter';
      const fp = ART_PIVOTS['fx/muzzle_flash'];
      ctx.drawImage(fl.c, -fp.x * fs, -fp.y * fs, fl.w * fs, fl.h * fs);
    }
  }
  ctx.restore();
  ctx.restore();
  rigFlash = 0;
}

/* Current time in seconds for the animation clock (render time, not the physics clock). */
function animNow() { return performance.now() / 1000; }

/* Arm angle in the facing frame from a true-space aim angle. */
function frameAim(ang, face) { return Math.atan2(Math.sin(ang), face * Math.cos(ang)); }

/*
  Hero: animated from velocity (position change), onGround, shots fired, hp. The arm follows
  aimAngle exactly (the muzzle, the shots and the aim guide use the same joint at (0, -4)).
*/
function drawPlayerArt(sx, sy) {
  const gunKey = HERO_GUN_KEYS[WEAPONS[currentWeapon].name] || HERO_GUN_KEYS.pistol;
  if (!Art.has(rigKeys(HERO_RIG)) || !Art.has(gunKey)) return false;
  const face = Math.cos(aimAngle) >= 0 ? 1 : -1;
  const st = animFor(player, 0);
  animTick(st, {
    x: player.body.position.x, y: player.body.position.y, face: face,
    aim: frameAim(aimAngle, face), smooth: false, grounded: player.onGround,
    shots: player.shots || 0, hp: player.hp, dead: player.hp <= 0, finalAlpha: 0.3
  }, animNow());
  drawRig(HERO_RIG, st, sx, sy, gunKey, false);
  return true;
}

/*
  Enemy soldier. The skin is picked from the Matter body id, so it is steady for a given world.
  Same 24 x 30 box; aims at the player when alerted, arm eased between poses.
*/
function enemyAnimInput(e) {
  let ang;
  let face = e.facing >= 0 ? 1 : -1;
  if (e.alerted && player) {
    ang = Math.atan2(player.body.position.y - 4 - (e.body.position.y - 4), player.body.position.x - e.body.position.x);
    face = Math.cos(ang) >= 0 ? 1 : -1;
  } else {
    ang = face > 0 ? 0.45 : Math.PI - 0.45;
  }
  return {
    x: e.body.position.x, y: e.body.position.y, face: face, aim: frameAim(ang, face), smooth: true,
    shots: e.shots || 0, hp: e.hp, dead: !e.alive, finalAlpha: 0
  };
}

function drawEnemyArt(e, sx, sy) {
  const rig = ENEMY_RIGS[ENEMY_SKINS[e.body.id % ENEMY_SKINS.length]];
  if (!Art.has(rigKeys(rig))) return false;
  const st = animFor(e, e.body.id);
  animTick(st, enemyAnimInput(e), animNow());
  drawRig(rig, st, sx, sy, null, true);
  return true;
}

/* A killed enemy keeps its record but loses its body: play the fall and fade, only if it was seen alive. */
function drawDeadEnemyArt(e, sx, sy) {
  const st = animStates.get(e);
  if (!st || st.deathDone) return;
  const rig = ENEMY_RIGS[ENEMY_SKINS[e.body.id % ENEMY_SKINS.length]];
  if (!Art.has(rigKeys(rig))) return;
  animTick(st, enemyAnimInput(e), animNow());
  if (!st.deathDone) drawRig(rig, st, sx, sy, null, true);
}

/*
  Villain (boss): drawn from the same rig and motion code. No boss exists yet, so nothing calls
  this in play; v = { x, y (body centre), facing, aim (true angle), grounded, shots, hp, alive }.
  See drawVillainDebug for a test path.
*/
function drawVillainArt(v, sx, sy) {
  if (!Art.has(rigKeys(VILLAIN_RIG))) return false;
  const face = v.facing >= 0 ? 1 : -1;
  const st = animFor(v, 7);
  animTick(st, {
    x: v.x, y: v.y, face: face, aim: frameAim(v.aim || 0, face), smooth: true, grounded: v.grounded,
    shots: v.shots || 0, hp: v.hp, dead: v.alive === false, finalAlpha: 0
  }, animNow());
  if (st.deathDone) return true;
  drawRig(VILLAIN_RIG, st, sx, sy, null, true);
  return true;
}

/*
  Debug path: add ?villain to the page URL (or call debugVillain(true) in the console) to draw a
  scripted villain 200 px from the hero: walks, jumps, fires, takes a hit, dies, repeats (16 s).
*/
const villainDebug = { on: false, v: null, t0: 0, cycle: -1 };

function debugVillain(on) {
  villainDebug.on = on !== false;
  villainDebug.v = null;
  return villainDebug.on;
}
if (typeof location !== 'undefined' && /[?&]villain\b/.test(location.search)) villainDebug.on = true;

function drawVillainDebug() {
  if (!villainDebug.on || !player) return;
  const D = villainDebug;
  const now = animNow();
  if (!D.v) { D.t0 = now; D.v = { x: 0, y: 0, facing: -1, aim: Math.PI, grounded: true, shots: 0, hp: 10, alive: true }; D.cycle = -1; }
  const t = (now - D.t0) % 16;
  const cyc = Math.floor((now - D.t0) / 16);
  const v = D.v;
  if (cyc !== D.cycle) {                            // new life: fresh animation state
    D.cycle = cyc;
    D.v = { x: 0, y: 0, facing: -1, aim: Math.PI, grounded: true, shots: 0, hp: 10, alive: true };
    return;
  }
  const px = player.body.position.x;
  let gy = player.body.position.y;
  const gx = Math.floor((px + 200) / TILE);
  for (let i = 0, ty = Math.floor(gy / TILE) - 6; i < 40; i++, ty++) {
    if (isSolid(gx, ty)) { gy = ty * TILE; break; }
  }
  const walkX = t < 5 ? 200 + 60 * Math.sin(t * 0.9) : t < 7 ? 200 : 200 + 40 * Math.sin(t * 0.7);
  const jumpT = t >= 5 && t < 6 ? t - 5 : -1;
  v.x = px + walkX;
  v.y = gy - VILLAIN_RIG.footY - (jumpT >= 0 ? 60 * 4 * jumpT * (1 - jumpT) : 0);
  v.grounded = jumpT < 0;
  v.facing = Math.cos(Math.atan2(player.body.position.y - v.y, px - v.x)) >= 0 ? 1 : -1;
  v.aim = Math.atan2(player.body.position.y - v.y, px - v.x);
  const shots = (t >= 7 ? 1 : 0) + (t >= 8 ? 1 : 0) + (t >= 9.2 ? 1 : 0);
  v.shots = shots;
  v.hp = t >= 10 ? 6 : 10;
  v.alive = t < 12;
  drawVillainArt(v, v.x - camX, v.y - camY);
}

/* ============================================================
   TARGETS, EXIT
   ============================================================ */

/* Bullseye marker over the 3 x 3 target tiles; ring radius follows the pulsing t.r. */
function drawTargetArt(t, sx, sy, pulse) {
  if (!Art.has('env/target')) return false;
  const k = (t.r * pulse) / 21;
  const hpK = Math.max(0, Math.min(1, t.hp / t.maxHp));
  if (Art.has('fx/glow')) {
    const glow = Art.tint('fx/glow', '#ff3030');
    ctx.globalAlpha = 0.45 + 0.35 * (pulse - 0.92) * 6;
    ctx.drawImage(glow.c, sx - 46, sy - 46, 92, 92);
  }
  ctx.globalAlpha = 0.55 + 0.45 * hpK;
  artDraw('env/target', sx - 24 * k, sy - 24 * k, 48 * k, 48 * k);
  ctx.globalAlpha = 1;
  return true;
}

/* Gold / red gate: two posts-worth of beam, post and, when locked, laser bars. */
function drawExitArt(x, locked) {
  const post = locked ? 'env/gate_post_locked' : 'env/gate_post_open';
  const beam = locked ? 'env/gate_beam_locked' : 'env/gate_beam_open';
  if (!Art.has([post, beam, 'env/gate_bar'])) return false;
  artDraw(post, x - 1, 40, 8, CH - 80);
  artDraw(beam, x - 18, 38.5, 42, 7.2);
  if (locked) {
    for (let yy = 60; yy < CH - 40; yy += 26) artDraw('env/gate_bar', x - 18, yy - 1.5, 42, 6);
  }
  return true;
}

/* ============================================================
   PROJECTILES AND EFFECTS
   ============================================================ */

const PROJ_KEYS = { pistol: 'weapons/proj_bullet', rocket: 'weapons/proj_rocket', grenade: 'weapons/proj_grenade', laser: 'weapons/proj_laser' };

/* Player shot: smoke trail for rockets and grenades, then the sprite along its velocity. */
function drawProjectileArt(p, sx, sy) {
  const name = p.weapon.name;
  const key = PROJ_KEYS[name];
  if (!key || !Art.has(key)) return false;
  if (p.trail && p.trail.length > 1 && (name === 'rocket' || name === 'grenade') && Art.has('fx/smoke_puff')) {
    const sm = Art.tint('fx/smoke_puff', name === 'rocket' ? '#d8d2c8' : '#c8b8e8');
    const n = p.trail.length;
    for (let i = 0; i < n - 1; i++) {
      const tp = p.trail[i];
      const a = (i + 1) / n;
      const d = (name === 'rocket' ? 8 : 6) + (1 - a) * 8;
      ctx.globalAlpha = 0.38 * a;
      ctx.drawImage(sm.c, tp.x - camX - d / 2, tp.y - camY - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
  }
  const spin = name === 'grenade' ? (performance.now() * 0.012) % (Math.PI * 2) : Math.atan2(p.vy, p.vx);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(spin);
  artDrawPivot(key, 1);
  ctx.restore();
  return true;
}

function drawEnemyShotArt(p) {
  if (!Art.has('weapons/proj_enemy')) return false;
  ctx.save();
  ctx.translate(p.x - camX, p.y - camY);
  ctx.rotate(Math.atan2(p.vy, p.vx));
  artDrawPivot('weapons/proj_enemy', 1);
  ctx.restore();
  return true;
}

/* Render-owned smoke puffs (not gameplay state): { x, y, vx, vy, age, life, size, color }. */
const smokePuffs = [];
let smokeLastT = 0;

/* Deterministic 0..1 value from a seed (no Math.random in render). */
function fxRand(seed) {
  const s = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function addExplosionSmoke(ex) {
  const n = ex.r >= 40 ? 7 : 4;
  for (let i = 0; i < n; i++) {
    const a = fxRand(ex.x * 0.37 + ex.y * 0.11 + i * 3.1) * Math.PI * 2;
    const d = fxRand(ex.x * 0.19 + ex.y * 0.53 + i * 7.7) * ex.r * 0.7;
    smokePuffs.push({
      x: ex.x + Math.cos(a) * d, y: ex.y + Math.sin(a) * d * 0.6,
      vx: Math.cos(a) * 14, vy: -24 - fxRand(i + ex.x) * 22,
      age: 0, life: 1.1 + fxRand(i * 1.9 + ex.y) * 0.7,
      size: ex.r * (0.9 + fxRand(i * 5.3 + ex.x) * 0.6),
      color: i % 3 === 0 ? '#9a9088' : '#6e6a68'
    });
  }
  if (smokePuffs.length > 80) smokePuffs.splice(0, smokePuffs.length - 80);
}

/* Age and draw lingering smoke (called before the fireballs so flames sit on top). */
function drawSmokeArt() {
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0, (now - smokeLastT) / 1000));
  smokeLastT = now;
  if (smokePuffs.length === 0) return;
  for (let i = smokePuffs.length - 1; i >= 0; i--) {
    const s = smokePuffs[i];
    s.age += dt;
    if (s.age >= s.life) { smokePuffs.splice(i, 1); continue; }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= 0.98;
    const k = s.age / s.life;
    const sp = Art.tint('fx/smoke_puff', s.color);
    if (!sp) continue;
    const d = s.size * (0.8 + k * 0.9);
    ctx.globalAlpha = 0.6 * (1 - k) * Math.min(1, s.age * 8);
    ctx.drawImage(sp.c, s.x - camX - d / 2, s.y - camY - d / 2, d, d);
  }
  ctx.globalAlpha = 1;
}

/* Fireball + shock ring for blasts; a star flash and glow for the muzzle pop. */
function drawExplosionArt(ex) {
  const sx = ex.x - camX;
  const sy = ex.y - camY;
  const t = 1 - ex.life / ex.maxLife;
  if (ex.flash) {
    if (!Art.has(['fx/muzzle_flash', 'fx/glow'])) return false;
    const col = WEAPONS[currentWeapon].color;
    ctx.globalCompositeOperation = 'lighter';
    const gl = Art.tint('fx/glow', col);
    ctx.globalAlpha = 1 - t;
    ctx.drawImage(gl.c, sx - 20, sy - 20, 40, 40);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(aimAngle);
    if (Math.cos(aimAngle) < 0) ctx.scale(1, -1);
    ctx.globalAlpha = 1 - t * 0.5;
    const k = 0.8 + t * 0.5;
    artDrawPivot('fx/muzzle_flash', k);
    ctx.restore();
    ctx.globalAlpha = 1;
    return true;
  }
  if (!Art.has(['fx/explosion_fireball', 'fx/explosion_ring'])) return false;
  const r = ex.r * (0.6 + t * 0.6);
  const D = r * 2.6;
  ctx.globalAlpha = Math.max(0, 1 - t * t);
  artDraw('fx/explosion_fireball', sx - D / 2, sy - D / 2, D, D);
  const R = ex.r * 2.7 * (0.55 + t * 0.75);
  ctx.globalAlpha = Math.max(0, (1 - t) * 0.9);
  artDraw('fx/explosion_ring', sx - R / 2, sy - R / 2, R, R);
  ctx.globalAlpha = 1;
  return true;
}

/*
  Sparks, embers and rock chips from the same particle list the game already moves.
  size 2 = spark, size >= 3 = ember, chips (gravity >= 400) = debris.
*/
function drawParticleArt(p) {
  const a = Math.max(0, p.life / p.maxLife);
  const sx = p.x - camX;
  const sy = p.y - camY;
  if (p.gravity >= 400) {
    const t = Art.tint('fx/debris', p.color);
    if (!t) return false;
    const d = 7 + p.size;
    ctx.globalAlpha = Math.min(1, a * 1.6);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate((p.maxLife - p.life) * 11 + p.x * 0.05);
    ctx.drawImage(t.c, -d / 2, -d / 2, d, d);
    ctx.restore();
    return true;
  }
  const big = p.size >= 3;
  const t = Art.tint(big ? 'fx/ember' : 'fx/spark', p.color);
  if (!t) return false;
  const d = big ? 12 : 11;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a;
  ctx.drawImage(t.c, sx - d / 2, sy - d / 2, d, d);
  ctx.globalCompositeOperation = 'source-over';
  return true;
}
