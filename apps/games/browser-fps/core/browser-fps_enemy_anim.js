/**
 * Browser FPS — procedural enemy animation (code-built; works for every humanoid built by humanoid_basic's
 * createTarget: humanoid_basic and soldier_hq).
 *
 * buildRig(pivot, legL, legR, muzzleLocal) re-parents the built body (world transforms kept) into
 *   pivot (feet) ─ hips (y 0.9: bob / twist) ─┬ legL / legR (hip pivots) ─ knee (y -0.46: shin + boot)
 *                                             └ spine (y ~1.02: lean, counter-twist, flinch) ─ head (neck pivot)
 * Arms + rifle ride on the spine (they hold the gun). A 0.9-tall single leg box (basic model) is split in two.
 *
 * createAnimator(rig, cfg) -> { update(dt, s), hit(localX, localZ, head), die(variant, slope), reset(), state }
 *   s = { speed, alive, rising, turnErr, deathT }  (all numbers; no allocations per frame)
 * Locomotion blends idle / walk / run by the smoothed actual speed; stride length grows with speed.
 * Death variants: 'back', 'forward', 'crumple' — fall timing per variant, final pitch corrected for the slope.
 */
import * as THREE from 'three';

export const ANIM = {
  walkSpeed: 1.1,      // speed (u/s) at which the walk cycle is fully on
  runSpeed: 2.4,       // speed at which the run cycle is fully on
  strideWalk: 1.25,    // world units per full cycle (two steps) when walking ...
  strideRun: 2.1,      // ... and when running
  speedSmooth: 7,      // 1/s smoothing of the measured speed
  // fall: duration (s), final pitch sign (+1 forward, -1 back)
  falls: { back: 0.7, forward: 0.75, crumple: 1.15 },
};
const smooth = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function buildRig(pivot, legL, legR, muzzleLocal) {
  pivot.updateMatrixWorld(true);
  const hips = new THREE.Group(); hips.position.set(0, 0.9, 0); pivot.add(hips);
  const spine = new THREE.Group(); spine.position.set(0, 0.12, 0); hips.add(spine);
  const head = new THREE.Group(); head.position.set(0, 0.68, 0); spine.add(head);
  pivot.updateMatrixWorld(true);
  const muzzle = new THREE.Object3D(); muzzle.position.copy(muzzleLocal); pivot.add(muzzle);
  pivot.updateMatrixWorld(true);
  for (const c of [...pivot.children]) {
    if (c === hips || c === legL || c === legR) continue;
    const y = c.position.y;
    if (y >= 1.69 && c.isMesh) head.attach(c);
    else if (y < 1.1 && c.isMesh) hips.attach(c);
    else spine.attach(c);          // torso, vest, arms, rifle, muzzle flash, muzzle marker
  }
  hips.attach(legL); hips.attach(legR);
  const knees = [];
  for (const leg of [legL, legR]) {
    const knee = new THREE.Group(); knee.position.set(0, -0.46, 0); leg.add(knee);
    leg.updateMatrixWorld(true);
    for (const c of [...leg.children]) {
      if (c === knee || !c.isMesh) continue;
      const h = c.geometry.parameters && c.geometry.parameters.height;
      if (h && h > 0.8) {          // single full-length leg box: split into thigh + shin
        const shin = c.clone();
        c.scale.y = 0.5; c.position.y = -0.23;
        shin.scale.y = 0.5; shin.position.set(c.position.x, -0.22, c.position.z);
        knee.add(shin);
      } else if (c.position.y < -0.4) knee.attach(c);
    }
    knees.push(knee);
  }
  return { pivot, hips, spine, head, legL, legR, kneeL: knees[0], kneeR: knees[1], muzzle };
}

export function createAnimator(rig, cfg = ANIM) {
  const { pivot, hips, spine, head, legL, legR, kneeL, kneeR } = rig;
  const st = {
    v: 0, phase: 0, t: 0,
    flinchT: 9, fx: 0, fz: 0, fHead: 0,     // last hit: local shot direction, head shot
    variant: null, slope: 0, roll: 0,
    lean: 0,                                  // smoothed upper-body lead into turns
  };

  function hit(lx, lz, isHead) {
    st.flinchT = 0; st.fx = lx; st.fz = lz; st.fHead = isHead ? 1 : 0;
  }
  function die(variant, slope) { st.variant = variant; st.slope = slope; st.roll = (Math.random() - 0.5) * 0.3; }
  function reset() {
    st.v = 0; st.flinchT = 9; st.variant = null; st.lean = 0;
    pivot.rotation.set(0, 0, 0); hips.rotation.set(0, 0, 0); hips.position.set(0, 0.9, 0);
    spine.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0);
    legL.rotation.set(0, 0, 0); legR.rotation.set(0, 0, 0); kneeL.rotation.set(0, 0, 0); kneeR.rotation.set(0, 0, 0);
  }

  /** s: { speed, alive, rising, turnErr, deathT } */
  function update(dt, s) {
    st.t += dt;
    // ── locomotion (alive) ──
    const target = s.alive && s.rising <= 0 ? s.speed : 0;
    st.v += (target - st.v) * Math.min(1, dt * cfg.speedSmooth);
    const v = st.v;
    const walkW = clamp01(v / cfg.walkSpeed);                          // idle -> walk
    const runW = clamp01((v - cfg.walkSpeed) / (cfg.runSpeed - cfg.walkSpeed));   // walk -> run
    const stride = cfg.strideWalk + (cfg.strideRun - cfg.strideWalk) * runW;
    st.phase += (v / stride) * Math.PI * 2 * dt;
    const p = st.phase, sp = Math.sin(p), cp = Math.cos(p);
    const thighA = (0.42 + 0.38 * runW) * walkW;      // thigh swing amplitude
    const kneeA = (0.55 + 0.8 * runW) * walkW;        // knee bend while the leg swings forward
    legL.rotation.x = -thighA * sp;
    legR.rotation.x = thighA * sp;
    kneeL.rotation.x = kneeA * Math.max(0, cp) + 0.08 * walkW + 0.25 * runW * Math.max(0, -sp);
    kneeR.rotation.x = kneeA * Math.max(0, -cp) + 0.08 * walkW + 0.25 * runW * Math.max(0, sp);
    const bob = (0.025 + 0.05 * runW) * walkW;
    hips.position.y = 0.9 - bob * 0.5 + bob * Math.abs(Math.cos(p)) - 0.04 * runW;   // up at mid-stance, lower when running
    hips.rotation.y = 0.12 * sp * walkW;
    hips.rotation.z = 0.03 * cp * walkW * (1 - runW);
    // upper body: counter-twist, forward lean when running, idle breathing, lead into turns
    st.lean += ((s.turnErr || 0) - st.lean) * Math.min(1, dt * 6);
    const lead = Math.max(-0.3, Math.min(0.3, st.lean)) * 0.6;
    spine.rotation.y = -0.1 * sp * walkW + lead;
    spine.rotation.x = 0.04 * walkW + 0.16 * runW + 0.012 * Math.sin(st.t * 1.9) * (1 - walkW) + 0.03 * Math.abs(sp) * runW;
    spine.rotation.z = 0;
    head.rotation.set(-0.5 * (0.04 * walkW + 0.16 * runW), -lead * 0.5, 0);   // keep the eyes level

    // ── hit flinch (damped spring, ~0.35 s) ──
    if (st.flinchT < 1) {
      st.flinchT += dt;
      const t = st.flinchT, f = Math.exp(-t * 9) * Math.sin(t * 18) * 1.6;   // fast jerk, small overshoot, settles
      const amp = st.fHead ? 0.16 : 0.3;
      spine.rotation.x += amp * st.fz * f;                                    // torso jerks along the shot
      spine.rotation.z += -amp * st.fx * f;
      if (st.fHead) { head.rotation.x += 0.75 * st.fz * f; head.rotation.z += -0.5 * st.fx * f; }
      hips.position.y -= 0.04 * f;                                      // short stagger dip
    }

    // ── death fall ──
    if (st.variant && s.deathT >= 0) {
      const T = cfg.falls[st.variant];
      const u = clamp01(s.deathT / T);
      if (st.variant === 'back') {
        // short stagger back, then topple backwards around the feet
        const a = clamp01((u - 0.12) / 0.88), e = a * a;
        const bounce = u >= 1 ? 0 : Math.sin(clamp01((u - 0.85) / 0.15) * Math.PI) * 0.06;
        pivot.rotation.x = -(Math.PI / 2 - 0.05 - st.slope) * e + bounce;
        spine.rotation.x = -0.35 * smooth(clamp01(u / 0.2)) * (1 - e * 0.6);
        head.rotation.x = -0.5 * smooth(clamp01(u / 0.15));
        kneeL.rotation.x = kneeR.rotation.x = 0.35 * e;
        legL.rotation.x = legR.rotation.x = -0.2 * e;
      } else if (st.variant === 'forward') {
        // knees give, then pitch forward
        const a = clamp01((u - 0.18) / 0.82), e = a * a;
        pivot.rotation.x = (Math.PI / 2 - 0.05 - st.slope) * e;
        const k = smooth(clamp01(u / 0.25));
        kneeL.rotation.x = kneeR.rotation.x = 0.5 * k * (1 - e * 0.7);
        legL.rotation.x = legR.rotation.x = -0.25 * k * (1 - e);
        hips.position.y = 0.9 - 0.12 * k * (1 - e);
        spine.rotation.x = 0.3 * k;
        head.rotation.x = 0.3 * e;
      } else {
        // crumple: drop to the knees, slump, then fall forward from the knees
        const k = smooth(clamp01(u / 0.4));                  // kneel
        const a = clamp01((u - 0.45) / 0.55), e = a * a;     // fall
        kneeL.rotation.x = kneeR.rotation.x = 1.45 * k;
        legL.rotation.x = legR.rotation.x = -0.15 * k + 0.3 * e;
        hips.position.y = 0.9 - 0.42 * k;
        spine.rotation.x = 0.35 * k + 0.2 * e;
        head.rotation.x = 0.4 * k;
        pivot.rotation.x = (Math.PI / 2 - 0.25 - st.slope) * e * 0.9;
        pivot.position.y += -0.05 * e;
      }
      pivot.rotation.z = st.roll * clamp01(u * 1.5);
      if (u >= 1) pivot.position.y += 0.06;                  // rest on the surface (body ~0.3 thick)
    }
  }
  return { update, hit, die, reset, state: st };
}
