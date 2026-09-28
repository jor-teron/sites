/*
 * AR Theme Game — Ghost theme: "Ghost chase".
 * Overlay mode: the ghost lives at a yaw/pitch around you in a virtual 360°
 * space. The phone's gyro (or drag on desktop) turns the camera; the ghost is
 * drawn only when you face it. It drifts, slides away when aimed at, sometimes
 * dashes behind you, and gets tired so it stays catchable. An edge arrow
 * points to it when off-screen and a synthesized hum gets louder as you aim
 * closer. WebXR mode keeps the simple hover/pulse behaviour.
 */
import * as THREE from "three";
import { AR_GAME_CONFIG } from "../../ar-game_config.js";
import { disposeObject, view } from "../ar.js";
import { createLookController, cameraYawPitch, dirFromYawPitch, wrapAngle } from "../look.js";
import { startGhostAudio, setGhostAudio, stopGhostAudio, ghostAudioState } from "../ghost_audio.js";

const C = AR_GAME_CONFIG.themes.ghost;
const K = C.chase;
const D2R = THREE.MathUtils.DEG2RAD;

/** Chase session state (module scope; one Ghost theme at a time). */
const chase = {
  active: false,
  look: null,
  arrow: null,
  canvas: null,
  showMsg: null,
  savedPos: new THREE.Vector3(),
  savedQuat: new THREE.Quaternion(),
  hintShown: false,
  debug: { onScreen: false, arrowDeg: null, aimDeg: 180, energy: 1, state: "idle" },
};

const tmpV = new THREE.Vector3();
const camSpace = new THREE.Vector3();
const ndc = new THREE.Vector3();

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function onCanvasTap() {
  // Any tap in Ghost theme is a user gesture: (re)start audio, retry iOS prompt
  startGhostAudio();
  if (chase.look) chase.look.retryPermission();
}

/** Arrow at the screen edge pointing toward a camera-space direction. */
function updateArrow(root, onScreen) {
  const el = chase.arrow;
  if (!el) return;
  if (onScreen || root.userData.caught) {
    el.hidden = true;
    chase.debug.arrowDeg = null;
    return;
  }
  // Screen direction from camera-space x/y (y up). If the ghost is almost
  // straight behind, x/y are tiny: fall back to its side (yaw offset sign).
  let sx = camSpace.x;
  let sy = camSpace.y;
  if (Math.hypot(sx, sy) < 1e-3) {
    sx = root.userData.side || 1;
    sy = 0;
  }
  const ang = Math.atan2(-sy, sx); // CSS: 0 = right, +90° = down
  const w = window.innerWidth;
  const h = window.innerHeight;
  const cx = w / 2;
  const cy = h / 2;
  const mx = cx - 36;
  const my = cy - 90;
  const k = Math.min(mx / Math.max(1e-6, Math.abs(Math.cos(ang))), my / Math.max(1e-6, Math.abs(Math.sin(ang))));
  const x = cx + Math.cos(ang) * k;
  const y = cy + Math.sin(ang) * k;
  el.hidden = false;
  el.style.transform = `translate(${x - 18}px, ${y - 18}px) rotate(${ang}rad)`;
  chase.debug.arrowDeg = (ang * 180) / Math.PI;
}

export const GhostTheme = {
  id: "ghost",
  label: C.label,

  height() {
    return C.radius * 2;
  },

  /**
   * Theme became active (called from the Ghost button click = user gesture).
   * @param {{ canvas: HTMLCanvasElement, arrow: HTMLElement, showMsg: Function, xr: boolean }} ctx
   */
  enter(ctx) {
    if (ctx.xr || chase.active) return;
    const cam = view.camera;
    chase.active = true;
    chase.canvas = ctx.canvas;
    chase.arrow = ctx.arrow;
    chase.showMsg = ctx.showMsg;
    chase.savedPos.copy(cam.position);
    chase.savedQuat.copy(cam.quaternion);
    cam.position.set(0, 0, 0);
    if (!chase.look) chase.look = createLookController(ctx.canvas, { dragDegPerScreen: K.dragDegPerScreen });
    chase.look.state.yaw = 0;
    chase.look.state.pitch = 0;
    chase.look.enable();
    chase.look.apply(cam);
    ctx.canvas.addEventListener("pointerdown", onCanvasTap);
    startGhostAudio();
    chase.hintShown = false;
    if (chase.look.state.permission === "needs-gesture" && ctx.showMsg) {
      chase.hintShown = true;
      ctx.showMsg(AR_GAME_CONFIG.text.ghostMotionTap, 2500);
    }
  },

  /** Theme left: restore the overlay camera, stop listeners/audio, hide arrow. */
  exit() {
    if (!chase.active) return;
    chase.active = false;
    if (chase.look) chase.look.disable();
    if (chase.canvas) chase.canvas.removeEventListener("pointerdown", onCanvasTap);
    const cam = view.camera;
    cam.position.copy(chase.savedPos);
    cam.quaternion.copy(chase.savedQuat);
    cam.updateMatrixWorld(true);
    if (chase.arrow) chase.arrow.hidden = true;
    stopGhostAudio();
  },

  create() {
    const root = new THREE.Group();
    const body = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: C.color, transparent: true, opacity: C.opacity });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(C.radius, 20, 14), mat);
    mesh.position.y = C.radius;
    body.add(mesh);
    // Tail: a squashed cone under the head
    const tail = new THREE.Mesh(new THREE.ConeGeometry(C.radius * 0.9, C.radius * 1.2, 16, 1, true), mat);
    tail.rotation.x = Math.PI;
    tail.position.y = C.radius * 0.1;
    body.add(tail);
    // Eyes (face +Z; the body turns to face the viewer)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
    const eyeGeo = new THREE.SphereGeometry(C.radius * 0.12, 10, 8);
    [-1, 1].forEach((s) => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(s * C.radius * 0.35, C.radius * 1.15, C.radius * 0.88);
      body.add(eye);
    });
    // Invisible, bigger tap target
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(K.hitRadius, 12, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.y = C.radius;
    body.add(hit);
    root.add(body);

    const u = root.userData;
    u.mesh = mesh;
    u.mat = mat;
    u.body = body;
    u.t = 0;
    u.energy = 1;
    u.state = "idle";   // idle | evade | dash | tired
    u.tiredT = 0;
    u.dashTo = 0;
    u.side = Math.random() < 0.5 ? -1 : 1;
    u.caught = false;
    u.wanderPhase = Math.random() * 10;

    // Spawn relative to where the camera currently looks (usually off-screen)
    const cam = view.camera;
    const look = cam ? cameraYawPitch(cam) : { yaw: 0, pitch: 0 };
    u.yaw = wrapAngle(look.yaw + u.side * rand(K.spawnMinDeg, K.spawnMaxDeg) * D2R);
    u.pitch = THREE.MathUtils.clamp(rand(-10, 20) * D2R, K.pitchMinDeg * D2R, K.pitchMaxDeg * D2R);
    return root;
  },

  /** Overlay mode: look control + chase AI + arrow + audio. */
  update(root, dt) {
    const u = root.userData;
    const cam = view.camera;
    u.t += dt;
    if (!chase.active) {
      // Not in chase (e.g. called before enter): keep the ghost in front
      root.position.set(0, -C.radius, -K.distance);
      return;
    }
    chase.look.apply(cam);
    const look = cameraYawPitch(cam);

    let dy = wrapAngle(u.yaw - look.yaw);
    let dp = u.pitch - look.pitch;
    dirFromYawPitch(u.yaw, u.pitch, tmpV);
    const fwd = dirFromYawPitch(look.yaw, look.pitch, new THREE.Vector3());
    const aim = Math.acos(THREE.MathUtils.clamp(tmpV.dot(fwd), -1, 1)); // radians
    const pMin = K.pitchMinDeg * D2R;
    const pMax = K.pitchMaxDeg * D2R;

    if (u.caught) {
      u.mat.opacity = Math.max(0, u.mat.opacity - dt * 1.5);
      u.body.scale.multiplyScalar(1 + dt * 1.2);
    } else if (u.state === "tired") {
      u.tiredT -= dt;
      u.yaw += Math.sin(u.t * 1.3) * 2 * D2R * dt; // barely drifts
      if (u.tiredT <= 0) {
        u.state = "idle";
        u.energy = 0.6;
      }
    } else if (u.state === "dash") {
      const d = wrapAngle(u.dashTo - u.yaw);
      const step = Math.min(Math.abs(d), K.dashDegPerSec * D2R * dt);
      u.yaw = wrapAngle(u.yaw + Math.sign(d) * step);
      u.energy -= K.drainPerSec * dt;
      if (Math.abs(d) < 3 * D2R) u.state = "idle";
    } else if (aim < K.evadeAngleDeg * D2R) {
      if (u.state !== "evade") {
        u.state = "evade";
        if (u.energy > 0.6 && Math.random() < K.dashChance) {
          // Go behind the player
          u.state = "dash";
          u.dashTo = wrapAngle(look.yaw + Math.PI + rand(-35, 35) * D2R);
        }
      }
      if (u.state === "evade") {
        // Slide directly away from the aim point in yaw/pitch space
        let ex = dy;
        let ep = dp;
        const len = Math.hypot(ex, ep);
        if (len < 1e-3) {
          ex = u.side;
          ep = 0;
        } else {
          ex /= len;
          ep /= len;
        }
        const speed = Math.min(K.evadeDegPerSec * u.energy, K.evadeMaxDegPerSec) * D2R;
        u.yaw = wrapAngle(u.yaw + ex * speed * dt);
        u.pitch += ep * speed * 0.5 * dt;
        if (ex !== 0) u.side = Math.sign(ex);
        u.energy -= K.drainPerSec * dt;
      }
    } else {
      if (u.state === "evade") u.state = "idle";
      // Idle wander
      u.yaw = wrapAngle(u.yaw + Math.sin(u.t * 0.4 + u.wanderPhase) * K.wanderDegPerSec * D2R * dt);
      u.pitch += Math.cos(u.t * 0.3 + u.wanderPhase) * K.wanderDegPerSec * 0.4 * D2R * dt;
      u.energy = Math.min(1, u.energy + K.recoverPerSec * dt);
    }
    if (!u.caught && u.state !== "tired" && u.energy < K.tiredBelow) {
      u.state = "tired";
      u.tiredT = K.tiredSec;
    }
    u.pitch = THREE.MathUtils.clamp(u.pitch, pMin, pMax);

    // Place in world, bob, face the viewer
    dirFromYawPitch(u.yaw, u.pitch, tmpV).multiplyScalar(K.distance);
    root.position.copy(tmpV);
    root.position.y += Math.sin(u.t * (u.state === "tired" ? 1 : 2.2)) * 0.12 - C.radius;
    root.lookAt(0, root.position.y, 0);
    if (!u.caught) {
      const minO = u.state === "tired" ? 0.7 : 0.4;
      u.mat.opacity = minO + Math.abs(Math.sin(u.t * C.fadeSpeed)) * (0.9 - minO);
    }

    // Visibility / arrow / audio
    root.updateMatrixWorld(true);
    camSpace.copy(root.position).setY(root.position.y + C.radius).applyMatrix4(cam.matrixWorldInverse);
    ndc.copy(root.position).setY(root.position.y + C.radius).project(cam);
    const onScreen = camSpace.z < 0 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
    root.visible = camSpace.z < 0; // never draw behind (projection would wrap)
    updateArrow(root, onScreen);
    dy = wrapAngle(u.yaw - look.yaw);
    const closeness = 1 - aim / Math.PI;
    setGhostAudio(u.caught ? 0 : closeness, THREE.MathUtils.clamp(-dy / (Math.PI / 2), -1, 1));

    if (!chase.hintShown && chase.showMsg) {
      chase.hintShown = true;
      chase.showMsg(chase.look.state.mode === "gyro" ? AR_GAME_CONFIG.text.ghostHint : AR_GAME_CONFIG.text.ghostHintDrag, 1800);
    }

    chase.debug = {
      onScreen,
      arrowDeg: chase.debug.arrowDeg,
      aimDeg: (aim * 180) / Math.PI,
      energy: +u.energy.toFixed(2),
      state: u.state,
      ghostYawDeg: (u.yaw * 180) / Math.PI,
      ghostPitchDeg: (u.pitch * 180) / Math.PI,
      camYawDeg: (look.yaw * 180) / Math.PI,
      camPitchDeg: (look.pitch * 180) / Math.PI,
      camX: camSpace.x,
      camY: camSpace.y,
      camZ: camSpace.z,
      mode: chase.look.state.mode,
      permission: chase.look.state.permission,
      audio: ghostAudioState(),
    };
  },

  /** XR: hover above the surface and pulse (unchanged simple behaviour). */
  animate(root, dt) {
    const u = root.userData;
    u.t += dt;
    u.mesh.position.y = C.radius * 2 + Math.sin(u.t * 2) * C.radius * 0.4;
    u.mat.opacity = C.fadeMin + Math.abs(Math.sin(u.t * C.fadeSpeed)) * C.fadeRange;
  },

  onCatch(root) {
    if (root) root.userData.caught = true;
    return C.catchText;
  },

  dispose(root) {
    disposeObject(root);
  },

  /** Read-only snapshot for tests. */
  debugState() {
    return { ...chase.debug, active: chase.active, audio: ghostAudioState() };
  },
};
