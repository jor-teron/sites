/**
 * Browser FPS — first-person viewmodel: arms + hands holding a low-poly rifle.
 *
 * Rendered in its own scene/camera AFTER the world, with the depth buffer cleared,
 * so it never clips into walls. Cheap: shared Lambert materials, ~400 triangles.
 *
 * API (used by browser-fps_logic.js):
 *   const vm = createViewmodel();
 *   vm.scene, vm.camera            render these after the world (renderer.clearDepth() first)
 *   vm.setAspect(aspect)           on resize
 *   vm.muzzleWorld(mainCamera, out) world position of the barrel tip (for flash light / tracers)
 *   vm.onFire()                    recoil kick + muzzle flash
 *   vm.startReload(seconds)        reload animation (mag drops, left hand fetches a new one)
 *   vm.update(dt, { moving, sprint, onGround, yaw, pitch })
 */
import * as THREE from 'three';

const FOV = 60;                       // viewmodel camera FOV (independent of the world FOV)
const GUN_POS = new THREE.Vector3(0.115, -0.07, -0.34);  // rest position (camera space, lower right)
const GUN_SCALE = 0.6;                                   // overall viewmodel size
const GUN_YAW = 0.06;                                    // angle the barrel slightly toward the crosshair
// Aim-down-sights pose: gun centred, front sight post (gun-local tip y ~0.095 x 0.6 scale) just below the crosshair
const ADS_POS = new THREE.Vector3(0, -0.066, -0.2);    // eye behind the scope tube (tube axis gun-local y 0.11 x 0.6 scale)
const MUZZLE_LOCAL = new THREE.Vector3(0, 0.022, -0.52); // barrel tip in gun space

const RECOIL_BACK = 0.045, RECOIL_UP = 0.07, RECOIL_RETURN = 16;   // kick and recovery rate (1/s)
const FLASH_TIME = 0.05;
const BOB_WALK = 9, BOB_SPRINT = 13, BOB_AMP = 0.012;
const SWAY_K = 0.6, SWAY_MAX = 0.05, SWAY_RETURN = 8;

// ─── Shared materials ───────────────────────────────────────────────────────
const M = {
  metal: new THREE.MeshLambertMaterial({ color: 0x2b2e33 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x17191c }),
  poly: new THREE.MeshLambertMaterial({ color: 0x4a4f3a }),     // olive furniture
  sleeve: new THREE.MeshLambertMaterial({ color: 0x3d4a5c }),   // jacket sleeves
  glove: new THREE.MeshLambertMaterial({ color: 0x5a4a3c }),    // gloves
  skin: new THREE.MeshLambertMaterial({ color: 0xc89878 }),     // wrists
  lens: new THREE.MeshBasicMaterial({ color: 0x5aa0d0 }),        // scope glass
  flash: new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
};

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

/** Cylinder limb from a to b (gun space). */
function limb(a, b, r0, r1, mat) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 7), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

export function createViewmodel() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.01, 5);
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x5a5040, 1.8));
  const key = new THREE.DirectionalLight(0xfff0dd, 2.4);
  key.position.set(1, 2, 1.5);
  scene.add(key);

  // root (bob/sway) -> gun (recoil/reload tilt)
  const root = new THREE.Group();
  root.position.copy(GUN_POS);
  root.scale.setScalar(GUN_SCALE);
  scene.add(root);
  const gun = new THREE.Group();
  root.add(gun);

  // ── Rifle (forward = -Z) ──
  gun.add(box(0.06, 0.08, 0.3, M.metal, 0, 0, -0.05));                 // receiver
  gun.add(box(0.064, 0.07, 0.2, M.poly, 0, -0.005, -0.3));            // handguard
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.14, 8), M.dark);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.022, -0.45); gun.add(barrel);
  gun.add(box(0.03, 0.03, 0.05, M.dark, 0, 0.022, -0.5));             // muzzle brake
  gun.add(box(0.042, 0.06, 0.13, M.poly, 0, -0.012, 0.15));           // stock (kept short so it doesn't fill the view)
  gun.add(box(0.02, 0.03, 0.12, M.dark, 0, 0.055, -0.06));            // top rail / sight base
  gun.add(box(0.012, 0.03, 0.012, M.dark, 0, 0.08, -0.36));           // front sight
  // Scope: two ring mounts on the rail, tube, bells, lenses
  gun.add(box(0.03, 0.035, 0.02, M.dark, 0, 0.08, -0.11));
  gun.add(box(0.03, 0.035, 0.02, M.dark, 0, 0.08, 0.0));
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 10), M.metal);
  tube.rotation.x = Math.PI / 2; tube.position.set(0, 0.11, -0.055); gun.add(tube);
  const bellF = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.019, 0.05, 10), M.metal);
  bellF.rotation.x = Math.PI / 2; bellF.position.set(0, 0.11, -0.175); gun.add(bellF);
  const bellR = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.024, 0.04, 10), M.metal);
  bellR.rotation.x = Math.PI / 2; bellR.position.set(0, 0.11, 0.06); gun.add(bellR);
  gun.add(box(0.012, 0.016, 0.016, M.dark, 0, 0.132, -0.06));         // turret
  const lensF = new THREE.Mesh(new THREE.CircleGeometry(0.024, 12), M.lens);
  lensF.position.set(0, 0.11, -0.201); lensF.rotation.y = Math.PI; gun.add(lensF);
  const lensR = new THREE.Mesh(new THREE.CircleGeometry(0.022, 12), M.lens);
  lensR.position.set(0, 0.11, 0.081); gun.add(lensR);
  gun.add(box(0.026, 0.02, 0.02, M.dark, 0, 0.075, 0.02));            // rear sight
  const grip = box(0.035, 0.09, 0.04, M.poly, 0, -0.08, 0.05);
  grip.rotation.x = 0.35; gun.add(grip);
  gun.add(box(0.008, 0.03, 0.02, M.dark, 0, -0.05, -0.005));          // trigger
  const mag = new THREE.Group();
  const magMesh = box(0.04, 0.13, 0.06, M.dark, 0, -0.065, 0);
  magMesh.rotation.x = -0.2; mag.add(magMesh);
  mag.position.set(0, -0.04, -0.12);
  gun.add(mag);
  const magRest = mag.position.clone();

  // ── Right arm: hand on grip / trigger ──
  const rHand = box(0.05, 0.075, 0.06, M.glove, 0.012, -0.085, 0.055);
  rHand.rotation.x = 0.35; gun.add(rHand);
  gun.add(box(0.035, 0.022, 0.03, M.glove, 0.0, -0.045, 0.0));        // trigger finger
  gun.add(limb(new THREE.Vector3(0.03, -0.12, 0.1), new THREE.Vector3(0.05, -0.15, 0.17), 0.032, 0.03, M.skin)); // wrist
  gun.add(limb(new THREE.Vector3(0.05, -0.15, 0.16), new THREE.Vector3(0.18, -0.35, 0.42), 0.042, 0.05, M.sleeve)); // sleeve

  // ── Left arm: hand under the handguard (animated during reload) ──
  const lArm = new THREE.Group();
  gun.add(lArm);
  const lHand = box(0.075, 0.045, 0.07, M.glove, 0, -0.05, -0.3); lArm.add(lHand);
  lArm.add(box(0.02, 0.05, 0.06, M.glove, -0.04, -0.02, -0.3));      // thumb wrapping the side
  lArm.add(limb(new THREE.Vector3(-0.02, -0.07, -0.28), new THREE.Vector3(-0.06, -0.11, -0.2), 0.03, 0.028, M.skin));
  lArm.add(limb(new THREE.Vector3(-0.06, -0.11, -0.21), new THREE.Vector3(-0.26, -0.32, 0.05), 0.042, 0.05, M.sleeve));
  const lArmRest = lArm.position.clone();

  // ── Muzzle flash (two crossed quads) ──
  const flash = new THREE.Group();
  const fq = new THREE.PlaneGeometry(0.09, 0.09);
  const f1 = new THREE.Mesh(fq, M.flash), f2 = new THREE.Mesh(fq, M.flash), f3 = new THREE.Mesh(fq, M.flash);
  f2.rotation.y = Math.PI / 2; f3.rotation.x = Math.PI / 2;
  flash.add(f1, f2, f3);
  flash.position.copy(MUZZLE_LOCAL).add(new THREE.Vector3(0, 0, -0.03));
  flash.visible = false;
  gun.add(flash);
  const muzzleMarker = new THREE.Object3D();
  muzzleMarker.position.copy(MUZZLE_LOCAL);
  gun.add(muzzleMarker);

  // ── State ──
  let recoil = 0, flashT = 0, bobT = 0, bobW = 0;
  let reloadT = 0, reloadDur = 0;
  let lastYaw = null, lastPitch = null, swayX = 0, swayY = 0;
  let aim = 0;   // 0 = hip, 1 = aiming down sights
  const tmp = new THREE.Vector3();

  function setAspect(a) { camera.aspect = a; camera.updateProjectionMatrix(); }

  function muzzleWorld(mainCamera, out = new THREE.Vector3()) {
    scene.updateMatrixWorld(true);
    muzzleMarker.getWorldPosition(tmp);              // viewmodel camera space (camera at origin)
    // Viewmodel FOV differs from the world FOV: project to NDC with the vm camera, unproject at the same depth with the main camera
    const depth = -tmp.z;
    tmp.project(camera);
    out.set(tmp.x, tmp.y, 0.5).unproject(mainCamera).sub(mainCamera.position).normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(mainCamera.quaternion);
    const dist = depth / Math.max(0.2, out.dot(fwd));
    return out.multiplyScalar(dist).add(mainCamera.position);
  }

  function onFire() {
    recoil = Math.min(1.4, recoil + 0.65);
    flashT = FLASH_TIME;
    flash.visible = true;
    flash.rotation.z = Math.random() * Math.PI;
    const s = 0.8 + Math.random() * 0.5;
    flash.scale.set(s, s, s);
  }

  function startReload(seconds) { reloadDur = seconds; reloadT = seconds; }
  function setAim(a) { aim = Math.max(0, Math.min(1, a)); }

  const smooth = (x) => x * x * (3 - 2 * x);
  const seg = (u, a, b) => Math.max(0, Math.min(1, (u - a) / (b - a)));

  function update(dt, st) {
    // recoil decays exponentially
    recoil *= Math.exp(-RECOIL_RETURN * dt);
    if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.visible = false; }

    // bob while moving on the ground
    const moving = st.moving && st.onGround;
    bobW += ((moving ? 1 : 0) - bobW) * Math.min(1, dt * 8);
    bobT += dt * (st.sprint ? BOB_SPRINT : BOB_WALK) * bobW;
    const amp = BOB_AMP * bobW * (st.sprint ? 1.6 : 1);
    const bx = Math.sin(bobT) * amp, by = -Math.abs(Math.cos(bobT)) * amp;

    // look sway: gun lags behind camera rotation
    if (lastYaw !== null) {
      const dy = st.yaw - lastYaw, dp = st.pitch - lastPitch;
      swayX = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, swayX + dy * SWAY_K));
      swayY = Math.max(-SWAY_MAX, Math.min(SWAY_MAX, swayY - dp * SWAY_K));
    }
    lastYaw = st.yaw; lastPitch = st.pitch;
    const ret = Math.exp(-SWAY_RETURN * dt);
    swayX *= ret; swayY *= ret;

    const sprintDrop = st.sprint && moving ? 1 : 0;
    const k = 1 - aim * 0.85;                       // less bob/sway while aiming
    const bx2 = bx * k, by2 = by * k, sx = swayX * k, sy = swayY * k;
    const px = GUN_POS.x + (ADS_POS.x - GUN_POS.x) * aim;
    const py = GUN_POS.y + (ADS_POS.y - GUN_POS.y) * aim;
    const pz = GUN_POS.z + (ADS_POS.z - GUN_POS.z) * aim;
    root.position.set(px + bx2 + sx * 0.6, py + by2 + sy * 0.6 - 0.02 * sprintDrop, pz);
    root.rotation.set(sy * 0.8, GUN_YAW * (1 - aim) + sx * 0.8, -0.12 * sprintDrop);

    // recoil on the gun
    gun.position.set(0, recoil * 0.01, recoil * RECOIL_BACK);
    let rx = recoil * RECOIL_UP, rz = 0, ry = 0;

    // reload: 0-.15 tilt, .1-.3 mag drops, .3-.55 hand down & back with new mag, .55-.75 insert, .75-1 tilt back
    mag.visible = true;
    mag.position.copy(magRest);
    lArm.position.copy(lArmRest);
    if (reloadT > 0) {
      reloadT = Math.max(0, reloadT - dt);
      const u = 1 - reloadT / reloadDur;
      const tilt = smooth(seg(u, 0, 0.15)) * (1 - smooth(seg(u, 0.78, 1)));
      rz += 0.5 * tilt; ry += -0.15 * tilt; rx += 0.12 * tilt;
      const drop = smooth(seg(u, 0.1, 0.3));
      const fetch = smooth(seg(u, 0.3, 0.45)) * (1 - smooth(seg(u, 0.45, 0.72)));
      const insert = smooth(seg(u, 0.45, 0.72));
      if (u < 0.45) {
        mag.position.y = magRest.y - drop * 0.35;          // old mag falls away
        mag.visible = drop < 0.95;
      } else {
        mag.position.y = magRest.y - (1 - insert) * 0.16;  // new mag rises in with the hand
      }
      // left hand: leaves the handguard, goes down to the mag well, pushes the new mag up, returns
      const toWell = smooth(seg(u, 0.12, 0.3)) * (1 - smooth(seg(u, 0.72, 0.9)));
      lArm.position.set(0.02 * toWell, -0.12 * toWell - 0.12 * fetch, 0.17 * toWell);
    }
    gun.rotation.set(rx, ry, rz);
  }

  return { scene, camera, setAspect, muzzleWorld, onFire, startReload, setAim, root, update,
    get reloading() { return reloadT > 0; }, get recoil() { return recoil; }, gun, mag, lArm };
}
