/**
 * Browser FPS asset (gun): rifle_basic — the original low-poly rifle (~250 tris, Lambert).
 * Asset interface: see assets/README.md. Gun space: forward = -Z, up = +Y, origin ≈ receiver.
 */
import * as THREE from 'three';

const M = {
  metal: new THREE.MeshLambertMaterial({ color: 0x2b2e33 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x17191c }),
  poly: new THREE.MeshLambertMaterial({ color: 0x4a4f3a }),
  lens: new THREE.MeshBasicMaterial({ color: 0x5aa0d0 }),
};
function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function build() {
  const group = new THREE.Group();
  const gun = group;
  gun.add(box(0.06, 0.08, 0.3, M.metal, 0, 0, -0.05));                 // receiver
  gun.add(box(0.064, 0.07, 0.2, M.poly, 0, -0.005, -0.3));            // handguard
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.14, 8), M.dark);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.022, -0.45); gun.add(barrel);
  gun.add(box(0.03, 0.03, 0.05, M.dark, 0, 0.022, -0.5));             // muzzle brake
  gun.add(box(0.042, 0.06, 0.13, M.poly, 0, -0.012, 0.15));           // stock
  gun.add(box(0.02, 0.03, 0.12, M.dark, 0, 0.055, -0.06));            // top rail
  gun.add(box(0.012, 0.03, 0.012, M.dark, 0, 0.08, -0.36));           // front sight
  gun.add(box(0.03, 0.035, 0.02, M.dark, 0, 0.08, -0.11));            // scope rings
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
  return {
    group, mag,
    muzzle: new THREE.Vector3(0, 0.022, -0.52),       // barrel tip
    sight: new THREE.Vector3(0, 0.11, 0.08),          // scope eyepiece (centre of the tube axis)
    hands: { right: new THREE.Vector3(0.012, -0.085, 0.055), left: new THREE.Vector3(0, -0.05, -0.3) },
  };
}

export default { kind: 'gun', name: 'rifle_basic', build };
