/*
 * AR Theme Game — Zombie theme: the real game mode.
 * Overlay mode: 360° look (gyro, or drag on desktop) like Ghost. Zombies
 * spawn around you at a distance and shamble toward you, growing larger as
 * they close in. Tap one 2–3 times to drop it (it flinches on each hit).
 * If one reaches you: red flash, -1 life. 3 lives, waves get bigger and a
 * bit faster, best score kept in localStorage. Edge arrow points at the
 * nearest off-screen zombie. Sounds are synthesized (Web Audio).
 * WebXR AR mode falls back to a single shambling zombie on the floor that
 * you tap to drop (the XR wanderer moves it).
 */
import * as THREE from "three";
import { AR_GAME_CONFIG } from "../ar-game_config.js";
import { view } from "../ar.js";
import { isPresenting } from "../xr.js";
import { createLookController, cameraYawPitch, wrapAngle } from "../look.js";
import { createZombieModel, poseZombie, poseDeath, disposeZombieModel } from "../zombie_model.js";
import { startZombieAudio, stopZombieAudio, groan, hitSound, deathSound, damageSound, zombieAudioState } from "../zombie_audio.js";

const C = AR_GAME_CONFIG.themes.zombie;
const D2R = THREE.MathUtils.DEG2RAD;

const S = {
  active: false,
  root: null,
  look: null,
  ctx: null,
  els: null,
  savedPos: new THREE.Vector3(),
  savedQuat: new THREE.Quaternion(),
  savedScore: 0,
  zombies: [],
  wave: 0,
  toSpawn: 0,
  spawnT: 0,
  waveSpeed: 1,
  lives: C.lives,
  score: 0,
  best: 0,
  over: false,
  pauseT: 0,
  groanT: 2,
  nextId: 1,
  debug: { arrowDeg: null, flashes: 0, hits: 0 },
};

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tmp = new THREE.Vector3();
const camSpace = new THREE.Vector3();

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function loadBest() {
  try {
    return parseInt(localStorage.getItem(C.bestKey) || "0", 10) || 0;
  } catch (err) {
    return 0;
  }
}
function saveBest(n) {
  try {
    localStorage.setItem(C.bestKey, String(n));
  } catch (err) { /* private mode */ }
}

function vibrate(p) {
  if (navigator.vibrate) {
    try { navigator.vibrate(p); } catch (err) { /* ignore */ }
  }
}

/* ---------------- DOM (HUD, flash, banner, game over) ---------------- */

function buildDom(uiRoot) {
  if (S.els) return S.els;
  const mk = (tag, id) => {
    const el = document.createElement(tag);
    el.id = id;
    el.hidden = true;
    uiRoot.appendChild(el);
    return el;
  };
  const els = {
    hud: mk("div", "zombie-hud"),
    flash: mk("div", "zombie-flash"),
    banner: mk("div", "zombie-banner"),
    over: mk("div", "zombie-over"),
  };
  els.over.innerHTML =
    '<div class="zo-card"><h2>GAME OVER</h2><p class="zo-score"></p><p class="zo-best"></p>' +
    '<button type="button" class="zo-retry">Retry</button></div>';
  els.over.querySelector(".zo-retry").addEventListener("click", (ev) => {
    ev.stopPropagation();
    startZombieAudio();
    newGame();
  });
  S.els = els;
  return els;
}

function renderHud() {
  const e = S.els;
  if (!e) return;
  const hearts = "❤".repeat(Math.max(0, S.lives)) + "♡".repeat(Math.max(0, C.lives - S.lives));
  e.hud.innerHTML = `<span class="zh-lives">${hearts}</span><span>Wave <b>${S.wave}</b></span><span>Best <b>${S.best}</b></span>`;
  if (S.ctx && S.ctx.setScore) S.ctx.setScore(S.score);
}

function banner(text, ms) {
  const el = S.els.banner;
  el.textContent = text;
  el.hidden = false;
  el.classList.remove("show");
  void el.offsetWidth; // restart the CSS animation
  el.classList.add("show");
  clearTimeout(S.bannerTimer);
  S.bannerTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function flashDamage() {
  const el = S.els.flash;
  el.hidden = false;
  el.classList.remove("hit");
  void el.offsetWidth;
  el.classList.add("hit");
  clearTimeout(S.flashTimer);
  S.flashTimer = setTimeout(() => { el.hidden = true; }, 600);
  S.debug.flashes++;
}

/* ---------------- game flow ---------------- */

function clearZombies() {
  S.zombies.forEach((z) => {
    if (z.parent) z.parent.remove(z);
    disposeZombieModel(z);
  });
  S.zombies = [];
}

function newGame() {
  clearZombies();
  S.lives = C.lives;
  S.score = 0;
  S.wave = 0;
  S.over = false;
  if (S.els) S.els.over.hidden = true;
  nextWave();
}

function nextWave() {
  S.wave++;
  S.toSpawn = Math.min(C.maxPerWave, C.baseCount + (S.wave - 1) * C.countPerWave);
  S.waveSpeed = Math.min(C.maxSpeedMul, 1 + (S.wave - 1) * C.speedPerWave);
  S.spawnT = C.firstSpawnDelay;
  S.pauseT = 0;
  renderHud();
  banner(`Wave ${S.wave}`, 1800);
}

function spawnZombie() {
  const z = createZombieModel();
  const { yaw } = cameraYawPitch(view.camera);
  // Early on, spawn roughly ahead; later, anywhere around you
  const spread = S.wave <= 1 ? C.firstWaveSpreadDeg : 180;
  const a = yaw + rand(-spread, spread) * D2R;
  const d = rand(C.spawnMin, C.spawnMax);
  // yaw convention: 0 = -Z, positive = turn left (toward -X)
  z.position.set(-Math.sin(a) * d, -C.eyeHeight, -Math.cos(a) * d);
  z.scale.setScalar(rand(0.92, 1.08));
  const u = z.userData;
  u.id = S.nextId++;
  u.hp = Math.floor(rand(C.hpMin, C.hpMax + 1));
  u.speed = C.speed * S.waveSpeed * rand(0.85, 1.15);
  u.stun = 0;
  u.dead = false;
  u.deadT = 0;
  u.hit.userData.zombie = z;
  S.root.add(z);
  S.zombies.push(z);
}

function zombiePan(z) {
  tmp.copy(z.position).applyMatrix4(view.camera.matrixWorldInverse);
  return THREE.MathUtils.clamp(tmp.x / Math.max(1, Math.abs(tmp.z)), -1, 1);
}

function hitZombie(z) {
  const u = z.userData;
  if (u.dead || S.over) return;
  u.hp--;
  u.flinch = 1;
  u.flash = 0.18;
  u.stun = C.stunSec;
  // knock back a little
  tmp.set(z.position.x, 0, z.position.z).normalize().multiplyScalar(C.knockback);
  z.position.add(tmp);
  S.debug.hits++;
  const pan = zombiePan(z);
  vibrate(30);
  if (u.hp <= 0) {
    u.dead = true;
    u.deadT = 0;
    S.score++;
    if (S.score > S.best) {
      S.best = S.score;
      saveBest(S.best);
    }
    renderHud();
    deathSound(pan);
  } else {
    hitSound(pan);
  }
}

function zombieReached(z) {
  S.lives--;
  flashDamage();
  damageSound();
  vibrate([80, 40, 120]);
  S.root.remove(z);
  disposeZombieModel(z);
  S.zombies.splice(S.zombies.indexOf(z), 1);
  renderHud();
  if (S.lives <= 0) gameOver();
}

function gameOver() {
  S.over = true;
  if (S.score > S.best) {
    S.best = S.score;
    saveBest(S.best);
  }
  const o = S.els.over;
  o.querySelector(".zo-score").textContent = `Score: ${S.score}  ·  Wave ${S.wave}`;
  o.querySelector(".zo-best").textContent = `Best: ${S.best}`;
  o.hidden = false;
  S.els.banner.hidden = true;
  if (S.ctx && S.ctx.arrow) S.ctx.arrow.hidden = true;
}

function onTap(ev) {
  startZombieAudio(); // user gesture: unlock audio
  if (S.look) S.look.retryPermission();
  if (S.over || !S.root) return;
  ndc.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, view.camera);
  const targets = S.zombies.filter((z) => !z.userData.dead).map((z) => z.userData.hit);
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length) hitZombie(hits[0].object.userData.zombie);
}

/* ---------------- arrow to nearest off-screen zombie ---------------- */

function updateArrow() {
  const el = S.ctx && S.ctx.arrow;
  if (!el) return;
  let near = null;
  let nd = Infinity;
  S.zombies.forEach((z) => {
    if (z.userData.dead) return;
    const d = Math.hypot(z.position.x, z.position.z);
    if (d < nd) { nd = d; near = z; }
  });
  if (!near || S.over) {
    el.hidden = true;
    S.debug.arrowDeg = null;
    return;
  }
  tmp.copy(near.position);
  tmp.y += 1.2 * near.scale.y;
  camSpace.copy(tmp).applyMatrix4(view.camera.matrixWorldInverse);
  tmp.project(view.camera);
  const onScreen = camSpace.z < 0 && Math.abs(tmp.x) < 0.95 && Math.abs(tmp.y) < 0.95;
  if (onScreen) {
    el.hidden = true;
    S.debug.arrowDeg = null;
    return;
  }
  let sx = camSpace.x;
  let sy = camSpace.y;
  if (camSpace.z > 0 && Math.abs(sx) < 0.3) sx = sx < 0 ? -1 : 1; // right behind: point sideways
  if (Math.hypot(sx, sy) < 1e-3) { sx = 1; sy = 0; }
  const ang = Math.atan2(-sy, sx);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const bar = document.getElementById("topbar");
  const top = (bar ? bar.getBoundingClientRect().bottom : 0) + 40;
  const bottom = h - 28;
  const cx = w / 2;
  const cy = (top + bottom) / 2;
  const mx = Math.max(10, cx - 30);
  const my = Math.max(10, (bottom - top) / 2 - 18);
  const k = Math.min(mx / Math.max(1e-6, Math.abs(Math.cos(ang))), my / Math.max(1e-6, Math.abs(Math.sin(ang))));
  el.hidden = false;
  el.style.transform = `translate(${cx + Math.cos(ang) * k - 18}px, ${cy + Math.sin(ang) * k - 18}px) rotate(${ang}rad)`;
  S.debug.arrowDeg = (ang * 180) / Math.PI;
}

/* ---------------- theme API ---------------- */

export const ZombieTheme = {
  id: "zombie",
  label: C.label,
  /** Overlay taps are handled here (several targets, hit points), not by the main catch. */
  handlesTaps: true,

  height() {
    return 1.75;
  },

  create() {
    if (isPresenting()) {
      // XR fallback: one shambling zombie on the floor (the wanderer moves it)
      const z = createZombieModel();
      z.userData.xrSingle = true;
      return z;
    }
    const root = new THREE.Group();
    S.root = root;
    return root;
  },

  enter(ctx) {
    if (ctx.xr || S.active) return;
    const cam = view.camera;
    S.active = true;
    S.ctx = ctx;
    buildDom(ctx.uiRoot || document.getElementById("ui-root"));
    if (ctx.arrow) ctx.arrow.classList.add("zombie");
    S.els.hud.hidden = false;
    S.savedScore = ctx.getScore ? ctx.getScore() : 0;
    S.savedPos.copy(cam.position);
    S.savedQuat.copy(cam.quaternion);
    cam.position.set(0, 0, 0);
    if (!S.look) S.look = createLookController(ctx.canvas, { dragDegPerScreen: C.dragDegPerScreen });
    S.look.state.yaw = 0;
    S.look.state.pitch = 0;
    S.look.enable();
    S.look.apply(cam);
    ctx.canvas.addEventListener("pointerdown", onTap);
    startZombieAudio();
    S.best = loadBest();
    newGame();
    if (ctx.showMsg) ctx.showMsg(S.look.state.permission === "needs-gesture" ? C.hintMotionTap : C.hint, 2200);
  },

  exit() {
    if (!S.active) return;
    S.active = false;
    const cam = view.camera;
    cam.position.copy(S.savedPos);
    cam.quaternion.copy(S.savedQuat);
    cam.updateMatrixWorld(true);
    if (S.look) S.look.disable();
    if (S.ctx) {
      S.ctx.canvas.removeEventListener("pointerdown", onTap);
      if (S.ctx.arrow) {
        S.ctx.arrow.hidden = true;
        S.ctx.arrow.classList.remove("zombie");
      }
      if (S.ctx.setScore) S.ctx.setScore(S.savedScore);
    }
    if (S.els) ["hud", "flash", "banner", "over"].forEach((k) => { S.els[k].hidden = true; });
    clearTimeout(S.bannerTimer);
    clearZombies();
    stopZombieAudio();
  },

  update(root, dt) {
    if (!S.active || root !== S.root) return;
    S.look.apply(view.camera);

    if (!S.over) {
      if (S.toSpawn > 0) {
        S.spawnT -= dt;
        if (S.spawnT <= 0) {
          spawnZombie();
          S.toSpawn--;
          S.spawnT = Math.max(C.minSpawnGap, C.spawnGap - (S.wave - 1) * 0.15) * rand(0.7, 1.3);
        }
      } else if (S.zombies.length === 0) {
        S.pauseT += dt;
        if (S.pauseT > C.wavePauseSec) nextWave();
      }
      // ambient groans from a random living zombie, louder when near
      S.groanT -= dt;
      if (S.groanT <= 0) {
        S.groanT = rand(1.2, 3.2);
        const alive = S.zombies.filter((z) => !z.userData.dead);
        if (alive.length) {
          const z = alive[Math.floor(Math.random() * alive.length)];
          const d = Math.hypot(z.position.x, z.position.z);
          groan(THREE.MathUtils.clamp(1.6 / Math.max(1, d), 0.12, 1), zombiePan(z));
        }
      }
    }

    for (let i = S.zombies.length - 1; i >= 0; i--) {
      const z = S.zombies[i];
      const u = z.userData;
      if (u.dead) {
        u.deadT += dt;
        if (poseDeath(z, dt, u.deadT)) {
          root.remove(z);
          disposeZombieModel(z);
          S.zombies.splice(i, 1);
        }
        continue;
      }
      if (S.over) {
        poseZombie(z, dt * 0.3, 0.5);
        continue;
      }
      const d = Math.hypot(z.position.x, z.position.z);
      z.rotation.y = Math.atan2(-z.position.x, -z.position.z); // face the player
      if (u.stun > 0) {
        u.stun -= dt;
        poseZombie(z, dt * 0.3, 0.3);
      } else {
        const step = Math.min(d, u.speed * dt * (0.75 + 0.25 * Math.abs(Math.sin(u.phase)))); // lurching pace
        z.position.x -= (z.position.x / d) * step;
        z.position.z -= (z.position.z / d) * step;
        poseZombie(z, dt, u.speed / C.speed);
      }
      if (d <= C.reachDist) {
        zombieReached(z);
        if (S.over) break;
      }
    }
    updateArrow();
  },

  /** XR fallback: shamble while the wanderer moves it. */
  animate(root, dt, moving) {
    if (root.userData.xrSingle) poseZombie(root, dt, moving === false ? 0.4 : 1);
  },

  onCatch() {
    return C.catchText;
  },

  dispose(root) {
    if (root.userData.xrSingle) {
      disposeZombieModel(root);
      return;
    }
    if (root === S.root) clearZombies();
  },

  debugState() {
    const cam = view.camera;
    return {
      active: S.active,
      over: S.over,
      lives: S.lives,
      score: S.score,
      best: S.best,
      wave: S.wave,
      toSpawn: S.toSpawn,
      audio: zombieAudioState(),
      arrowDeg: S.debug.arrowDeg,
      flashes: S.debug.flashes,
      hits: S.debug.hits,
      zombies: S.zombies.map((z) => {
        const p = z.position.clone();
        p.y += 1.1 * z.scale.y;
        const cs = p.clone().applyMatrix4(cam.matrixWorldInverse);
        p.project(cam);
        return {
          id: z.userData.id,
          hp: z.userData.hp,
          dead: z.userData.dead,
          dist: +Math.hypot(z.position.x, z.position.z).toFixed(2),
          yawDeg: +(wrapAngle(Math.atan2(-z.position.x, -z.position.z)) / D2R).toFixed(1),
          sx: ((p.x + 1) / 2) * window.innerWidth,
          sy: ((1 - p.y) / 2) * window.innerHeight,
          onScreen: cs.z < 0 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1,
        };
      }),
    };
  },
};
