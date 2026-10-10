import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mapData } from "./map.js";

const WALK = 1.5;
const RUN = 3.4;
const MALE_HEIGHT = 1.778;
const FEMALE_HEIGHT = 1.702;

function limb(w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 })
  );
  mesh.castShadow = true;
  return mesh;
}

function makeMale() {
  const g = new THREE.Group();
  const skin = "#e2b48c";
  const body = limb(0.38, 0.62, 0.22, skin);
  body.position.y = 1.05;
  g.add(body);
  const shorts = limb(0.4, 0.28, 0.24, "#6d7346");
  shorts.position.y = 0.78;
  g.add(shorts);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 20, 16),
    new THREE.MeshStandardMaterial({ color: skin, roughness: 0.65 })
  );
  head.position.y = 1.52;
  head.castShadow = true;
  g.add(head);
  const hair = limb(0.28, 0.42, 0.16, "#6a431f");
  hair.position.set(0, 1.4, 0.04);
  g.add(hair);
  const armL = limb(0.09, 0.5, 0.09, skin);
  armL.position.set(-0.26, 1.02, 0);
  const armR = armL.clone();
  armR.position.x = 0.26;
  g.add(armL, armR);
  const legL = limb(0.12, 0.48, 0.12, skin);
  legL.position.set(-0.1, 0.28, 0);
  const legR = legL.clone();
  legR.position.x = 0.1;
  g.add(legL, legR);
  g.userData.arms = [armL, armR];
  g.userData.legs = [legL, legR];
  g.userData.height = MALE_HEIGHT;
  g.userData.label = "Male";
  return g;
}

function skinMat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
}

function part(geo, mat, x, y, z) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function pivot(x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
}

function makeFemale() {
  const g = new THREE.Group();
  const skin = skinMat("#f0c6a4");
  const blue = new THREE.MeshStandardMaterial({ color: "#1d4fd0", roughness: 0.72 });
  const hair = new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.45 });
  const h = FEMALE_HEIGHT;

  const legGeo = new THREE.CapsuleGeometry(0.055, 0.46, 6, 10);
  const legL = pivot(-0.09, 0.78, 0);
  const legR = pivot(0.09, 0.78, 0);
  legL.add(part(legGeo, skin, 0, -0.34, 0));
  legR.add(part(legGeo, skin, 0, -0.34, 0));
  g.add(legL, legR);

  g.add(part(new THREE.CapsuleGeometry(0.13, 0.16, 6, 12), blue, 0, 0.86, 0));
  g.add(part(new THREE.CapsuleGeometry(0.115, 0.1, 6, 12), skin, 0, 1.02, 0));
  g.add(part(new THREE.CapsuleGeometry(0.145, 0.12, 6, 12), blue, 0, 1.16, 0));

  const armGeo = new THREE.CapsuleGeometry(0.038, 0.4, 4, 8);
  const armL = pivot(-0.2, 1.28, 0);
  const armR = pivot(0.2, 1.28, 0);
  armL.add(part(armGeo, skin, 0, -0.26, 0));
  armR.add(part(armGeo, skin, 0, -0.26, 0));
  g.add(armL, armR);

  g.add(part(new THREE.SphereGeometry(0.11, 24, 18), skin, 0, 1.46, 0));
  g.add(part(new THREE.SphereGeometry(0.118, 20, 14), hair, 0, 1.5, -0.01));
  const tail = part(new THREE.CapsuleGeometry(0.035, 0.34, 4, 8), hair, 0, 1.28, 0.06);
  tail.rotation.x = 0.15;
  g.add(tail);

  g.scale.setScalar(h / 1.7);
  g.userData.arms = [armL, armR];
  g.userData.legs = [legL, legR];
  g.userData.height = h;
  g.userData.label = "Female";
  return g;
}

export function createPlayer(scene, camera) {
  let male = makeMale();
  let female = makeFemale();
  scene.add(male);
  male.visible = false;
  scene.add(female);

  const state = {
    who: "female",
    body: female,
    yaw: 0.6,
    pitch: 0.38,
    dist: 4.8,
    face: 0,
    bob: 0
  };

  const keys = new Set();
  const onDown = (e) => {
    keys.add(e.code);
    if (e.code === "Tab") e.preventDefault();
  };
  const onUp = (e) => keys.delete(e.code);
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);

  let dragging = false;
  const view = document.getElementById("view");
  view.addEventListener("contextmenu", (e) => e.preventDefault());
  view.addEventListener("pointerdown", (e) => {
    if (e.button === 0 || e.button === 2) {
      dragging = true;
      view.setPointerCapture(e.pointerId);
    }
  });
  view.addEventListener("pointerup", () => {
    dragging = false;
  });
  view.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    state.yaw -= e.movementX * 0.005;
    state.pitch = Math.max(0.15, Math.min(1.15, state.pitch + e.movementY * 0.004));
  });
  view.addEventListener("wheel", (e) => {
    state.dist = Math.max(2.4, Math.min(8, state.dist + Math.sign(e.deltaY) * 0.35));
  }, { passive: true });

  function active() {
    return state.who === "male" ? male : female;
  }

  function switchTo(who) {
    state.who = who;
    male.visible = who === "male";
    female.visible = who === "female";
    state.body = active();
  }

  function update(dt) {
    const body = active();
    let x = 0;
    let z = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) z -= 1;
    if (keys.has("KeyS") || keys.has("ArrowDown")) z += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
    if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
    const moving = x !== 0 || z !== 0;
    const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? RUN : WALK;
    if (moving) {
      const len = Math.hypot(x, z);
      x /= len;
      z /= len;
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      const wx = x * cos + z * sin;
      const wz = -x * sin + z * cos;
      body.position.x += wx * speed * dt;
      body.position.z += wz * speed * dt;
      state.face = Math.atan2(wx, wz);
      state.bob += dt * speed * 6;
    } else {
      state.bob = 0;
    }
    const half = mapData.bounds / 2 - 0.3;
    body.position.x = Math.max(-half, Math.min(half, body.position.x));
    body.position.z = Math.max(-half, Math.min(half, body.position.z));
    body.position.y = body.userData.footLift || 0;
    body.rotation.y = state.face;

    const swing = moving ? Math.sin(state.bob) * 0.45 : 0;
    const arms = body.userData.arms;
    const legs = body.userData.legs;
    if (arms && legs) {
      arms[0].rotation.x = swing;
      arms[1].rotation.x = -swing;
      legs[0].rotation.x = -swing;
      legs[1].rotation.x = swing;
    }
    if (body.userData.mixer) body.userData.mixer.update(dt);

    const look = body.position.clone();
    look.y += 1.15;
    const offset = new THREE.Vector3(
      Math.sin(state.yaw) * Math.cos(state.pitch) * state.dist,
      Math.sin(state.pitch) * state.dist + 0.4,
      Math.cos(state.yaw) * Math.cos(state.pitch) * state.dist
    );
    camera.position.copy(look).add(offset);
    camera.lookAt(look);
    return body.userData.label;
  }

  function useModel(who, model) {
    const old = who === "female" ? female : male;
    model.position.copy(old.position);
    model.rotation.copy(old.rotation);
    model.visible = state.who === who;
    scene.remove(old);
    if (who === "female") female = model;
    else male = model;
    if (state.who === who) state.body = model;
  }

  return { update, switchTo, keys, loadModels: (s, onReady) => loadModels(s, (who, model) => {
    useModel(who, model);
    if (onReady) onReady(who, model);
  }) };
}

function fitHeight(root, meters) {
  const box = new THREE.Box3().setFromObject(root);
  const h = box.max.y - box.min.y || 1;
  root.scale.multiplyScalar(meters / h);
  root.updateMatrixWorld(true);
  const fitted = new THREE.Box3().setFromObject(root);
  root.position.y -= fitted.min.y;
  root.userData.footLift = root.position.y;
}

async function loadModels(scene, getBodies) {
  const loader = new GLTFLoader();
  const jobs = [
    ["female", "models/female/body.glb", FEMALE_HEIGHT],
    ["male", "models/male/body.glb", MALE_HEIGHT]
  ];
  for (const [who, url, height] of jobs) {
    try {
      const gltf = await loader.loadAsync(url);
      const model = gltf.scene;
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });
      fitHeight(model, height);
      const mixer = new THREE.AnimationMixer(model);
      const clip = gltf.animations.find((a) => /walk/i.test(a.name)) || gltf.animations[0];
      if (clip) mixer.clipAction(clip).play();
      model.userData.mixer = mixer;
      model.userData.label = who === "female" ? "Female" : "Male";
      model.userData.height = height;
      scene.add(model);
      getBodies(who, model);
    } catch {
      /* stand-in stays until body.glb is in the folder */
    }
  }
}
