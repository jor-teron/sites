/*
  File: core/anim.js
  Project: Demolisher
  Purpose: Character animation state, driven only by game state (position change, grounded flag,
  shots fired, hp, alive). Computes a pose per character each frame: walk cycle (leg swing, lift,
  body bob), jump / fall pose, landing squash, idle breathing, lean, head tilt, arm angle with
  firing recoil and muzzle pop, hit flash and knock-back, and the death fall + fade. The same code
  drives the hero, the three enemy skins and the villain rig. Also holds the part layout ("rig")
  of each character so sprites.js draws them the same way.
  Pure logic: no drawing, no physics, no gameplay changes, no Math.random (deterministic seeds).
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html (before sprites.js).
  Uses: nothing at load time (state.js globals only when helpers are called).
*/

'use strict';

/* Motion tuning. Distances are world px, angles are radians, times are seconds. */
const ANIM = {
  stride: 9,          // px travelled per radian of leg phase
  swing: 0.62,        // peak leg swing while walking
  lift: 1.8,          // foot lift at mid swing
  bob: 1.3,           // body drop when the legs are spread
  leanMax: 0.09,      // forward lean at full speed
  standSpeed: 8,      // px/s below which the character stands (idle breathing)
  fullSpeed: 70,      // px/s at which the walk cycle has full amplitude
  airSpeed: 90,       // vertical px/s that counts as airborne even when the grounded flag is true
  airDelay: 0.07,     // airborne this long before the jump pose starts (hides one-frame hops)
  kickDecay: 11,      // recoil recovery rate
  muzzleTime: 0.09,   // muzzle flash length for enemies / villain
  hitTime: 0.24,      // hit flash length
  deathHop: 0.45,     // upward hop at the start of the death
  deathFall: 0.6,     // time to hit the ground
  deathHold: 0.7,     // lie there, then fade
  deathFade: 0.7
};

/* One animation state per character object (player record, enemy record, villain). */
const animStates = new WeakMap();

function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function animLerp(a, b, t) { return a + (b - a) * t; }
function animClamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

/* Get (or create) the state for a character. seed varies idle breathing between characters. */
function animFor(owner, seed) {
  let st = animStates.get(owner);
  if (!st) {
    st = {
      t: -1, px: null, py: null, armInit: false, vx: 0, vy: 0, phase: 0, walkK: 0, airK: 0, airT: 0, land: 0,
      fall: 0, kick: 0, muz: 0, hit: 0, hp: -1, shots: -1, arm: 0, seed: seed || 0,
      dead: false, deathT0: 0, deathDone: false,
      pose: {
        face: 1, legBack: 0, legFront: 0, liftBack: 0, liftFront: 0, ub: 0, lean: 0, tilt: 0,
        arm: 0, kick: 0, muz: 0, hit: 0, shift: 0, alpha: 1, dead: false, deathRot: 0, deathY: 0,
        capeSway: 0
      }
    };
    animStates.set(owner, st);
  }
  return st;
}

/*
  Advance one character and fill st.pose.
  o = {
    x, y        world position (centre of the body)
    face        1 right / -1 left (the way the sprite looks)
    aim         arm angle in the facing frame (0 = straight ahead, + = down)
    smooth      ease the arm toward the aim (enemies); false = follow exactly (hero)
    grounded    true / false when the game knows, otherwise omit (vertical speed decides)
    shots       running count of shots fired (a rise = a shot)
    hp          current hp (a drop = a hit)
    dead        true once it has died
    finalAlpha  opacity left after the death fade (0 = gone)
  }
  now = seconds. Returns st.
*/
function animTick(st, o, now) {
  const P = st.pose;
  const rdt = st.t < 0 ? 0 : now - st.t;
  const dt = Math.min(0.05, Math.max(0, rdt));
  st.t = now;
  const jump = st.px === null || rdt >= 0.25 || Math.abs(o.x - st.px) >= 80 || Math.abs(o.y - st.py) >= 80;
  if (jump) {
    st.vx = 0; st.vy = 0;                       // first frame, teleport (respawn), or a long pause
  } else if (rdt > 0) {
    const k = Math.min(1, dt * 18);
    st.vx += ((o.x - st.px) / rdt - st.vx) * k;
    st.vy += ((o.y - st.py) / rdt - st.vy) * k;
  }
  st.px = o.x; st.py = o.y;

  /* Events: shots, hits, death. */
  if (st.shots < 0) st.shots = o.shots || 0;
  if (o.shots > st.shots) { st.kick = 1; st.muz = 1; }
  st.shots = o.shots || 0;
  if (st.hp < 0) st.hp = o.hp;
  if (o.hp < st.hp) st.hit = 1;
  st.hp = o.hp;
  if (o.dead && !st.dead) { st.dead = true; st.deathT0 = now; st.hit = 1; }
  st.kick *= Math.exp(-dt * ANIM.kickDecay);
  st.muz = Math.max(0, st.muz - dt / ANIM.muzzleTime);
  st.hit = Math.max(0, st.hit - dt / ANIM.hitTime);

  /* Ground / air. */
  const air = o.grounded === false || Math.abs(st.vy) > ANIM.airSpeed;
  const wasAir = st.airT > 0.1;
  st.airT = air ? st.airT + dt : 0;
  if (air && st.vy > st.fall) st.fall = st.vy;
  if (wasAir && !air) st.land = animClamp(st.fall / 420, 0.25, 1);
  if (!air && st.airT === 0 && !wasAir) st.fall = 0;
  if (!air) st.fall = Math.max(0, st.fall - 600 * dt);
  st.land *= Math.exp(-dt * 9);
  st.airK += ((st.airT > ANIM.airDelay ? 1 : 0) - st.airK) * Math.min(1, dt * 16);

  /* Walk cycle: phase follows ground speed, direction follows the way the legs move relative to
     the way the character faces (walking backwards while aiming ahead plays in reverse). */
  const speed = Math.abs(st.vx);
  const walkT = air ? 0 : animClamp((speed - ANIM.standSpeed) / (ANIM.fullSpeed - ANIM.standSpeed), 0, 1);
  st.walkK += (walkT - st.walkK) * Math.min(1, dt * 12);
  if (!air) st.phase += (st.vx * o.face >= 0 ? 1 : -1) * speed * dt / ANIM.stride;
  const s = Math.sin(st.phase);
  const c = Math.cos(st.phase);
  const wk = st.walkK;

  /* Legs: forward angle (+ = foot forward), foot lift in px. */
  let lf = s * ANIM.swing * wk;
  let lb = -lf;
  let liftF = Math.max(0, c) * ANIM.lift * wk;
  let liftB = Math.max(0, -c) * ANIM.lift * wk;
  const a = st.airK;
  if (a > 0.001) {
    const vt = animClamp(st.vy / 320, -1, 1);          // -1 rising .. +1 falling
    const rise = (1 - vt) / 2;
    const jf = animLerp(0.35, 0.9, rise);
    const jb = animLerp(-0.5, -0.3, rise);
    lf = animLerp(lf, jf, a);
    lb = animLerp(lb, jb, a);
    liftF *= 1 - a; liftB *= 1 - a;
    liftF += a * 1.6 * rise; liftB += a * 0.6 * rise;
  }

  /* Upper body: bob, breathing, landing squash, lean, head tilt, hit shove. */
  const breath = Math.sin(now * 2.3 + st.seed) * (1 - wk) * (1 - a);
  let ub = Math.abs(s) * ANIM.bob * wk + breath * 0.55 + st.land * 2.4 + a * -0.6;
  let lean = animClamp(st.vx * o.face / 230, -1, 1) * ANIM.leanMax * (1 - a * 0.5) + a * 0.04 * animClamp(-st.vy / 300, -1, 1);
  lean -= st.hit * 0.18;
  const shift = -st.hit * 2;

  /* Arm: aim in the facing frame, eased for AI, with a small walk sway when the aim is relaxed. */
  if (!st.armInit) { st.arm = o.aim; st.armInit = true; }
  if (o.smooth) st.arm += wrapPi(o.aim - st.arm) * Math.min(1, dt * 14);
  else st.arm = o.aim;
  let arm = st.arm;
  const tilt = animClamp(st.arm, -1, 1) * 0.22 + st.hit * -0.12;

  /* Death: hop, fall back about the feet, lie, fade. */
  let deathRot = 0, deathY = 0, alpha = 1;
  if (st.dead) {
    const td = now - st.deathT0;
    const hopU = Math.min(1, td / ANIM.deathHop);
    deathY = -10 * Math.sin(Math.PI * hopU);
    const fu = Math.min(1, td / ANIM.deathFall);
    deathRot = 1.5 * (1 - Math.pow(1 - fu, 3)) + 0.1 * Math.sin(Math.min(1, Math.max(0, td - ANIM.deathFall * 0.7) / 0.25) * Math.PI);
    const fin = o.finalAlpha || 0;
    const fu2 = animClamp((td - ANIM.deathHold) / ANIM.deathFade, 0, 1);
    alpha = 1 - fu2 * (1 - fin);
    if (fu2 >= 1 && fin <= 0) st.deathDone = true;
    lf = animLerp(lf, 0.7, Math.min(1, td * 5));
    lb = animLerp(lb, -0.25, Math.min(1, td * 5));
    arm = animLerp(arm, 1.2, Math.min(1, td * 4));
    ub = animLerp(ub, 0, Math.min(1, td * 6));
    lean = 0;
  }

  P.face = o.face;
  P.legBack = lb; P.legFront = lf; P.liftBack = liftB; P.liftFront = liftF;
  P.ub = ub; P.lean = lean; P.tilt = tilt; P.arm = arm; P.kick = st.kick; P.muz = st.muz;
  P.hit = st.hit; P.shift = shift; P.alpha = alpha; P.dead = st.dead;
  P.deathRot = deathRot; P.deathY = deathY;
  P.capeSway = Math.sin(now * 3 + st.seed) * 0.05 + animClamp(-st.vx * o.face / 260, -0.4, 0.4) + a * 0.25 * animClamp(st.vy / 300, -1, 1);
  return st;
}

/* ============================================================
   RIGS: where each part sits relative to the body centre (the same box the hitbox uses).
   Parts face right; the renderer mirrors the whole figure to face left.
   ============================================================ */

/*
  legs: sprite key prefix (<prefix>_back / <prefix>_front); legX/legY top-left of the old one-piece
  legs; legW is the pair width (back leg hip at .29 W, front leg at .70 W). neck / hip / shoulder
  are joints; footY is the distance from the body centre to the sole; muzzle is the shoulder to
  muzzle distance for the flash; kickPx the recoil slide.
*/
function makeRig(o) {
  return Object.assign({ gunScale: 1, kickPx: 3, flashScale: 1, cape: null }, o);
}

const HERO_RIG = makeRig({
  legs: 'hero/leg', legW: 22, legX: -11, legY: 1,
  body: 'hero/body', bodyX: -12, bodyY: -16,
  head: 'hero/head', headX: -8, headY: -28, headW: 16, headH: 16,
  arm: 'hero/arm', neck: [0, -12], hip: [0, 2], shoulder: [0, -4], footY: 17, muzzle: 24
});

function enemyRig(skin) {
  return makeRig({
    legs: 'enemies/' + skin + '_leg', legW: 22, legX: -11, legY: 0,
    body: 'enemies/' + skin + '_body', bodyX: -12, bodyY: -15,
    head: 'enemies/' + skin + '_head', headX: -8, headY: -27, headW: 16, headH: 16,
    arm: 'enemies/' + skin + '_arm', gun: 'enemies/' + skin + '_gun',
    neck: [0, -11], hip: [0, 1], shoulder: [0, -4], footY: 15, muzzle: 22.5
  });
}
const ENEMY_RIGS = { grunt: enemyRig('grunt'), trooper: enemyRig('trooper'), scout: enemyRig('scout') };

/* The boss: bigger, same parts and motion code. Not used in play yet (no boss exists). */
const VILLAIN_RIG = makeRig({
  legs: 'villain/leg', legW: 34, legX: -17, legY: 8,
  body: 'villain/body', bodyX: -21, bodyY: -22,
  head: 'villain/head', headX: -15, headY: -50, headW: 30, headH: 30,
  arm: 'villain/arm', gun: 'villain/weapon', cape: 'villain/cape',
  neck: [0, -21], hip: [0, 9], shoulder: [0, -10], footY: 34, muzzle: 47, kickPx: 5, flashScale: 1.8
});

/* Sprite keys a rig needs (the gun key is passed separately for the hero). */
function rigKeys(rig) {
  const k = [rig.legs + '_back', rig.legs + '_front', rig.body, rig.head, rig.arm];
  if (rig.gun) k.push(rig.gun);
  if (rig.cape) k.push(rig.cape);
  return k;
}
