/**
 * Browser FPS — first-person viewmodel: arms + hands holding a low-poly rifle.
 *
 * Rendered in its own scene/camera AFTER the world, with the depth buffer cleared,
 * so it never clips into walls. Cheap: shared Lambert materials, ~400 triangles.
 *
 * API (used by the logic/ modules):
 *   const vm = createViewmodel(gunAsset, armsAsset);   // defaults: rifle_hq + arms_hq
 *   vm.scene, vm.camera            render these after the world (renderer.clearDepth() first)
 *   vm.setAspect(aspect)           on resize
 *   vm.muzzleWorld(mainCamera, out) world position of the barrel tip (for flash light / tracers)
 *   vm.onFire()                    recoil kick + muzzle flash
 *   vm.startReload(seconds)        reload animation (mag drops, left hand fetches a new one)
 *   vm.setNadeModel(obj)           grenade mesh shown in the raised hand while aiming a throw
 *   vm.setNade(mode)               'hold' (rifle lowers, grenade up) | 'throw' (throw swing, then rifle returns) | 'none' (cancel)
 *   vm.update(dt, { moving, sprint, onGround, yaw, pitch })
 */
import * as THREE from 'three';
import rifleHq from '../assets/guns/rifle_hq.js';
import armsHq from '../assets/characters/arms_hq.js';

const FOV = 60;                       // viewmodel camera FOV (independent of the world FOV)
const GUN_POS = new THREE.Vector3(0.115, -0.07, -0.34);  // rest position (camera space, lower right)
const GUN_SCALE = 0.6;                                   // overall viewmodel size
const GUN_YAW = 0.06;                                    // angle the barrel slightly toward the crosshair
// Aim-down-sights pose: gun centred, front sight post (gun-local tip y ~0.095 x 0.6 scale) just below the crosshair
const ADS_POS_DEFAULT = new THREE.Vector3(0, -0.066, -0.2);    // eye behind the scope tube (tube axis gun-local y 0.11 x 0.6 scale)

const RECOIL_BACK = 0.045, RECOIL_UP = 0.07, RECOIL_RETURN = 16;   // kick and recovery rate (1/s)
const FLASH_TIME = 0.05;
const BOB_WALK = 9, BOB_SPRINT = 13, BOB_AMP = 0.012;
const SWAY_K = 0.6, SWAY_MAX = 0.05, SWAY_RETURN = 8;

const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

export function createViewmodel(gunAsset = rifleHq, armsAsset = armsHq) {
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

  // ── Gun + arms from asset modules ──
  const G = gunAsset.build();
  gun.add(G.group);
  const mag = G.mag || new THREE.Group();
  if (!mag.parent) gun.add(mag);
  const magRest = mag.position.clone();
  const MUZZLE_LOCAL = G.muzzle.clone();
  // ADS: put the sight/eyepiece axis on the camera's centre line (default if the gun gives no sight)
  const ADS_POS = G.sight
    ? new THREE.Vector3(-G.sight.x * GUN_SCALE, -G.sight.y * GUN_SCALE, ADS_POS_DEFAULT.z)
    : ADS_POS_DEFAULT.clone();
  const A = armsAsset.build(G);
  gun.add(A.right);
  const lArm = A.left;
  gun.add(lArm);
  const lArmRest = lArm.position.clone();

  // ── Muzzle flash (two crossed quads) ──
  const flash = new THREE.Group();
  const fq = new THREE.PlaneGeometry(0.09, 0.09);
  const f1 = new THREE.Mesh(fq, FLASH_MAT), f2 = new THREE.Mesh(fq, FLASH_MAT), f3 = new THREE.Mesh(fq, FLASH_MAT);
  f2.rotation.y = Math.PI / 2; f3.rotation.x = Math.PI / 2;
  flash.add(f1, f2, f3);
  flash.position.copy(MUZZLE_LOCAL).add(new THREE.Vector3(0, 0, -0.03));
  flash.visible = false;
  gun.add(flash);
  const muzzleMarker = new THREE.Object3D();
  muzzleMarker.position.copy(MUZZLE_LOCAL);
  gun.add(muzzleMarker);

  // ── Grenade hand (camera space, outside the gun root): glove fist + sleeve holding the grenade ──
  const nadeHand = new THREE.Group();
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x34352f, roughness: 0.9 });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 1 });
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), gloveMat); fist.scale.set(1.1, 0.9, 1.2); fist.position.set(0.012, -0.03, 0.01);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.03, 2, 6), gloveMat); thumb.position.set(-0.022, -0.005, 0.0); thumb.rotation.z = 0.6;
  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.042, 0.28, 12, 1, true), sleeveMat);
  forearm.position.set(0.04, -0.17, 0.08); forearm.rotation.set(0.45, 0, -0.25);
  const nadeSlot = new THREE.Group(); nadeSlot.position.set(0, 0.012, -0.008);
  nadeHand.add(fist, thumb, forearm, nadeSlot);
  nadeHand.visible = false;
  scene.add(nadeHand);
  const NH_HIDE = new THREE.Vector3(0.18, -0.45, -0.32), NH_HOLD = new THREE.Vector3(0.14, -0.1, -0.33);
  let nadeMode = 'none', nadeT = 0, nadeLower = 0, nadeRaise = 0;
  const THROW_TIME = 0.4;
  function setNadeModel(obj) { nadeSlot.clear(); if (obj) { const sz = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()); obj.scale.multiplyScalar(0.075 / Math.max(1e-3, sz.y)); nadeSlot.add(obj); } }
  function setNade(mode) { nadeMode = mode; nadeT = 0; }

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
      lArm.position.set(lArmRest.x + 0.02 * toWell, lArmRest.y - 0.12 * toWell - 0.12 * fetch, lArmRest.z + 0.17 * toWell);
    }
    gun.rotation.set(rx, ry, rz);

    // grenade: hold = rifle lowered + hand up; throw = forward swing (grenade leaves at ~35%), then rifle returns
    nadeT += dt;
    let lowerTarget = 0, raiseTarget = 0, swing = 0;
    if (nadeMode === 'hold') { lowerTarget = 1; raiseTarget = 1; }
    else if (nadeMode === 'throw') {
      const u = Math.min(1, nadeT / THROW_TIME);
      swing = Math.sin(Math.min(1, u * 1.4) * Math.PI);
      lowerTarget = u < 0.8 ? 1 : 0; raiseTarget = u < 0.6 ? 1 : 0;
      nadeSlot.visible = u < 0.35;
      if (u >= 1) nadeMode = 'none';
    } else nadeSlot.visible = true;
    if (nadeMode === 'hold') nadeSlot.visible = true;
    const ek = Math.min(1, dt * 12);
    nadeLower += (lowerTarget - nadeLower) * ek;
    nadeRaise += (raiseTarget - nadeRaise) * ek;
    if (nadeLower > 1e-3) {
      root.position.y -= 0.2 * nadeLower; root.position.x += 0.03 * nadeLower;
      root.rotation.x -= 0.7 * nadeLower; root.rotation.z -= 0.25 * nadeLower;
    }
    nadeHand.visible = nadeRaise > 0.02;
    if (nadeHand.visible) {
      nadeHand.position.lerpVectors(NH_HIDE, NH_HOLD, nadeRaise);
      nadeHand.position.x += bx2 + sx * 0.6 - 0.08 * swing; nadeHand.position.y += by2 + sy * 0.6 + 0.06 * swing; nadeHand.position.z -= 0.2 * swing;
      nadeHand.rotation.set(-0.2 - 0.9 * swing, 0.3, 0.15);
    }
  }

  return { scene, camera, setAspect, muzzleWorld, onFire, startReload, setAim, setNade, setNadeModel, get nadeMode() { return nadeMode; }, nadeHand, root, update,
    get reloading() { return reloadT > 0; }, get recoil() { return recoil; }, gun, mag, lArm, assets: { gun: gunAsset.name, arms: armsAsset.name } };
}
