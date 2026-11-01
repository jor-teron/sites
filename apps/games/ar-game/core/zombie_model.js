/*
 * AR Theme Game — code-built low-poly zombie (ES module).
 * Pivot hierarchy (no skinning): hips → torso → head / arms, hips → legs.
 * Small canvas textures (256 px) for pale skin, torn shirt, ripped trousers
 * and the face; shared by every zombie. Materials are cloned per zombie so
 * hit flashes and the death fade stay per-instance.
 */
import * as THREE from "three";

let shared = null;

function canvasTex(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function blotches(g, S, r, n, colors, rmin, rmax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    g.globalAlpha = 0.15 + r() * 0.35;
    g.beginPath();
    g.ellipse(r() * S, r() * S, rmin + r() * (rmax - rmin), rmin + r() * (rmax - rmin), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function veins(g, S, r, n, color) {
  g.strokeStyle = color;
  g.lineWidth = 1.2;
  g.globalAlpha = 0.45;
  for (let i = 0; i < n; i++) {
    let x = r() * S, y = r() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 22;
      y += (r() - 0.3) * 18;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

function wounds(g, S, r, n) {
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * S, w = 6 + r() * 14;
    g.fillStyle = "#4a0f0c";
    g.beginPath();
    g.ellipse(x, y, w, w * 0.5, r() * 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#8a1f17";
    g.beginPath();
    g.ellipse(x, y, w * 0.6, w * 0.28, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
}

/** Ragged transparent bottom edge + a few holes (alphaTest cut-outs). */
function tear(g, S, r, bottomFrac, holes) {
  g.globalCompositeOperation = "destination-out";
  g.beginPath();
  g.moveTo(0, S);
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * S;
    const y = S * bottomFrac + (i % 2 ? r() * S * 0.22 : r() * S * 0.05);
    g.lineTo(x, y);
  }
  g.lineTo(S, S);
  g.closePath();
  g.fill();
  for (let i = 0; i < holes; i++) {
    g.beginPath();
    const x = r() * S, y = S * 0.15 + r() * S * 0.55, w = 5 + r() * 12;
    g.moveTo(x, y - w);
    g.lineTo(x + w * 0.7, y + w * 0.2);
    g.lineTo(x + w * 0.1, y + w);
    g.lineTo(x - w * 0.8, y + w * 0.3);
    g.closePath();
    g.fill();
  }
  g.globalCompositeOperation = "source-over";
}

function buildShared() {
  const r = rng(1337);
  const S = 256;
  const skin = canvasTex(S, (g) => {
    g.fillStyle = "#9fb089";
    g.fillRect(0, 0, S, S);
    blotches(g, S, r, 60, ["#7e9468", "#b9c2a0", "#6f7d5c", "#8d8a6a"], 6, 26);
    veins(g, S, r, 14, "#4d5f62");
    wounds(g, S, r, 4);
  });
  const face = canvasTex(S, (g) => {
    g.fillStyle = "#9fb089";
    g.fillRect(0, 0, S, S);
    blotches(g, S, r, 50, ["#7e9468", "#b9c2a0", "#6f7d5c"], 5, 20);
    veins(g, S, r, 8, "#4d5f62");
    const fx = S * 0.25; // sphere +Z (front) sits at u = 0.25
    // sunken eye sockets
    g.fillStyle = "#2b2a22";
    [-1, 1].forEach((s) => {
      g.beginPath();
      g.ellipse(fx + s * 15, S * 0.47, 11, 8, 0, 0, Math.PI * 2);
      g.fill();
    });
    // brow ridge shade
    g.fillStyle = "rgba(40,45,30,0.5)";
    g.fillRect(fx - 30, S * 0.41, 60, 5);
    // nose holes
    g.fillStyle = "#3a2a20";
    g.fillRect(fx - 4, S * 0.53, 3, 4);
    g.fillRect(fx + 1, S * 0.53, 3, 4);
    // gaping mouth with teeth
    g.fillStyle = "#2a0806";
    g.beginPath();
    g.ellipse(fx, S * 0.62, 17, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#d8cfa8";
    for (let i = -3; i <= 3; i++) g.fillRect(fx + i * 4.6 - 1.6, S * 0.585, 3.2, 5 + r() * 2);
    g.fillStyle = "#6a1510";
    g.fillRect(fx + 8, S * 0.64, 3, 14); // drool of blood
    wounds(g, S, r, 2);
  });
  const shirt = canvasTex(S, (g) => {
    g.fillStyle = "#6b7a8c";
    g.fillRect(0, 0, S, S);
    // faded plaid
    g.globalAlpha = 0.25;
    g.fillStyle = "#3d4656";
    for (let i = 0; i < S; i += 32) {
      g.fillRect(i, 0, 10, S);
      g.fillRect(0, i, S, 10);
    }
    g.globalAlpha = 1;
    blotches(g, S, r, 40, ["#4b4030", "#5a3a22", "#3a3a2c", "#7a2a20"], 6, 22);
    blotches(g, S, r, 6, ["#5d120c"], 10, 24); // blood
    tear(g, S, r, 0.78, 7);
  });
  const pants = canvasTex(S, (g) => {
    g.fillStyle = "#3b4150";
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 3) {
      g.fillStyle = y % 6 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.06)";
      g.fillRect(0, y, S, 1);
    }
    blotches(g, S, r, 40, ["#4b3f2e", "#2a2620", "#5a4632"], 6, 22);
    // rips showing skin
    for (let i = 0; i < 5; i++) {
      const x = r() * S, y = S * 0.2 + r() * S * 0.6;
      g.fillStyle = "#9fb089";
      g.beginPath();
      g.ellipse(x, y, 7 + r() * 9, 3 + r() * 4, r() * 3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#d6d0c0";
      g.lineWidth = 1;
      g.stroke();
    }
    tear(g, S, r, 0.9, 0);
  });

  const geo = {
    torso: new THREE.CylinderGeometry(0.19, 0.16, 0.52, 14, 4).translate(0, 0.26, 0),
    shirt: new THREE.CylinderGeometry(0.205, 0.19, 0.66, 16, 4, true).translate(0, 0.21, 0),
    hips: new THREE.CylinderGeometry(0.16, 0.15, 0.16, 10, 1),
    head: new THREE.SphereGeometry(0.12, 16, 12),
    jaw: new THREE.BoxGeometry(0.13, 0.05, 0.1),
    eye: new THREE.SphereGeometry(0.016, 6, 4),
    upperArm: new THREE.CylinderGeometry(0.05, 0.042, 0.3, 10, 2).translate(0, -0.15, 0),
    sleeve: new THREE.CylinderGeometry(0.062, 0.058, 0.17, 8, 1, true).translate(0, -0.08, 0),
    foreArm: new THREE.CylinderGeometry(0.041, 0.033, 0.28, 10, 2).translate(0, -0.14, 0),
    hand: new THREE.BoxGeometry(0.07, 0.11, 0.035).translate(0, -0.055, 0),
    thigh: new THREE.CylinderGeometry(0.088, 0.066, 0.42, 12, 3).translate(0, -0.21, 0),
    shin: new THREE.CylinderGeometry(0.064, 0.048, 0.42, 12, 3).translate(0, -0.21, 0),
    foot: new THREE.BoxGeometry(0.09, 0.06, 0.22).translate(0, -0.03, 0.04),
    shoulders: new THREE.SphereGeometry(0.21, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    neck: new THREE.CylinderGeometry(0.05, 0.06, 0.1, 8),
    hit: new THREE.CylinderGeometry(0.3, 0.3, 1.8, 8).translate(0, 0.9, 0),
  };
  const mats = {
    skin: new THREE.MeshStandardMaterial({ map: skin, roughness: 0.85 }),
    face: new THREE.MeshStandardMaterial({ map: face, roughness: 0.85 }),
    shirt: new THREE.MeshStandardMaterial({ map: shirt, roughness: 0.95, alphaTest: 0.5, side: THREE.DoubleSide }),
    pants: new THREE.MeshStandardMaterial({ map: pants, roughness: 0.95, alphaTest: 0.5, side: THREE.DoubleSide }),
    shoe: new THREE.MeshStandardMaterial({ color: 0x2b241d, roughness: 0.9 }),
    eye: new THREE.MeshStandardMaterial({ color: 0xe8f070, emissive: 0xb8c020, emissiveIntensity: 1.2 }),
    hit: new THREE.MeshBasicMaterial({ visible: false }),
  };
  return { geo, mats, textures: [skin, face, shirt, pants] };
}

/**
 * Build one zombie (feet at y=0, faces +Z, ~1.75 tall).
 * @returns {THREE.Group} root with userData.parts / userData.mats / userData.hit
 */
export function createZombieModel() {
  if (!shared) shared = buildShared();
  const { geo } = shared;
  const mats = {};
  Object.keys(shared.mats).forEach((k) => {
    mats[k] = k === "hit" ? shared.mats.hit : shared.mats[k].clone();
  });
  const M = (g, m) => new THREE.Mesh(geo[g], mats[m]);

  const root = new THREE.Group();
  const body = new THREE.Group(); // fall pivot at the feet
  root.add(body);
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  body.add(hips);
  const pelvis = M("hips", "pants");
  hips.add(pelvis);

  const torso = new THREE.Group();
  torso.position.y = 0.05;
  hips.add(torso);
  const chest = M("torso", "skin");
  const shirtM = M("shirt", "shirt");
  const caps = M("shoulders", "shirt");
  caps.position.y = 0.5;
  caps.scale.set(1.05, 0.45, 1);
  [chest, shirtM, caps].forEach((m) => { m.scale.z = 0.72; torso.add(m); });
  const neck = M("neck", "skin");
  neck.position.y = 0.56;
  torso.add(neck);

  const head = new THREE.Group();
  head.position.y = 0.6;
  torso.add(head);
  const skull = M("head", "face");
  skull.position.y = 0.1;
  skull.scale.set(0.95, 1.08, 1);
  head.add(skull);
  const jaw = M("jaw", "skin");
  jaw.position.set(0, 0.0, 0.03);
  head.add(jaw);
  [-1, 1].forEach((s) => {
    const e = M("eye", "eye");
    e.position.set(s * 0.038, 0.115, 0.1);
    head.add(e);
  });

  const arms = [];
  [-1, 1].forEach((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.23, 0.47, 0);
    torso.add(sh);
    sh.add(M("upperArm", "skin"));
    sh.add(M("sleeve", "shirt"));
    const el = new THREE.Group();
    el.position.y = -0.3;
    sh.add(el);
    el.add(M("foreArm", "skin"));
    const hand = M("hand", "skin");
    hand.position.y = -0.28;
    el.add(hand);
    arms.push({ sh, el });
  });

  const legs = [];
  [-1, 1].forEach((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.095, -0.04, 0);
    hips.add(hip);
    hip.add(M("thigh", "pants"));
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    knee.add(M("shin", "pants"));
    const foot = M("foot", "shoe");
    foot.position.y = -0.42;
    knee.add(foot);
    legs.push({ hip, knee });
  });

  // Invisible generous tap target
  const hit = M("hit", "hit");
  root.add(hit);

  root.userData.parts = { body, hips, torso, head, jaw, arms, legs };
  root.userData.mats = mats;
  root.userData.hit = hit;
  root.userData.flinch = 0;
  root.userData.flash = 0;
  root.userData.phase = Math.random() * 10;
  root.userData.limp = Math.random() < 0.5 ? 0 : 1; // which leg drags
  return root;
}

/** Shambling walk: arms forward, lurching limp, head lolling. */
export function poseZombie(z, dt, speed = 1) {
  const u = z.userData;
  const p = u.parts;
  u.phase += dt * 3.2 * speed;
  const ph = u.phase;
  const s = Math.sin(ph);
  const good = u.limp, bad = 1 - u.limp;
  // legs: the good leg strides, the bad one drags stiffly
  p.legs[good].hip.rotation.x = -s * 0.5;
  p.legs[good].knee.rotation.x = Math.max(0, s) * 0.7;
  p.legs[bad].hip.rotation.x = s * 0.22;
  p.legs[bad].knee.rotation.x = 0.08 + Math.max(0, -s) * 0.15;
  p.legs[bad].hip.rotation.z = (bad ? -1 : 1) * 0.06;
  // lurch: dip on the bad leg
  p.hips.position.y = 0.92 - Math.abs(Math.cos(ph)) * 0.035 - (s < 0 ? 0.03 : 0);
  p.hips.rotation.z = s * 0.08;
  p.torso.rotation.x = 0.22 + Math.sin(ph * 2) * 0.03;
  p.torso.rotation.y = s * 0.12;
  // arms reaching forward, out of sync wobble
  p.arms[0].sh.rotation.x = -1.35 + Math.sin(ph * 0.9 + 1) * 0.12;
  p.arms[1].sh.rotation.x = -1.2 + Math.sin(ph * 0.8) * 0.15;
  p.arms[0].sh.rotation.z = -0.08;
  p.arms[1].sh.rotation.z = 0.12;
  p.arms[0].el.rotation.x = -0.15;
  p.arms[1].el.rotation.x = -0.35 + Math.sin(ph) * 0.1;
  p.head.rotation.z = 0.3 + Math.sin(ph * 0.5) * 0.12;
  p.head.rotation.x = 0.1;
  p.jaw.rotation.x = 0.15 + Math.abs(Math.sin(ph * 0.7)) * 0.25;
  // flinch: snap back, decays
  if (u.flinch > 0) {
    u.flinch = Math.max(0, u.flinch - dt * 3);
    const f = u.flinch;
    p.torso.rotation.x -= f * 0.7;
    p.head.rotation.x -= f * 0.8;
    p.arms[0].sh.rotation.x += f * 0.9;
    p.arms[1].sh.rotation.x += f * 1.1;
  }
  applyFlash(z, dt);
}

export function applyFlash(z, dt) {
  const u = z.userData;
  if (u.flash <= 0 && !u.flashOn) return;
  u.flash = Math.max(0, u.flash - dt);
  const k = u.flash > 0 ? Math.min(1, u.flash * 8) : 0;
  u.flashOn = k > 0;
  ["skin", "face", "shirt", "pants"].forEach((m) => {
    u.mats[m].emissive.setRGB(0.9 * k, 0.05 * k, 0.02 * k);
  });
}

/** Fall-down death; t = seconds since death. Returns true when finished. */
export function poseDeath(z, dt, t) {
  const u = z.userData;
  const p = u.parts;
  const k = Math.min(1, t / 0.7);
  const e = k * k * (3 - 2 * k);
  p.body.rotation.x = -e * 1.5; // topple backwards
  p.legs.forEach((l) => { l.knee.rotation.x = e * 0.5; });
  p.arms.forEach((a) => { a.sh.rotation.x = -1.3 * (1 - e) - e * 2.6; });
  p.head.rotation.x = -e * 0.4;
  applyFlash(z, dt);
  if (t > 1.1) {
    const fade = Math.max(0, 1 - (t - 1.1) / 0.6);
    Object.values(u.mats).forEach((m) => {
      if (m.visible === false) return;
      m.transparent = true;
      m.opacity = fade;
    });
    z.position.y = -0.2 * (1 - fade);
  }
  return t > 1.7;
}

/** Dispose only the per-zombie material clones (geometry/textures shared). */
export function disposeZombieModel(z) {
  Object.entries(z.userData.mats).forEach(([k, m]) => {
    if (k !== "hit") m.dispose();
  });
}

export function zombieTriangleCount() {
  const z = createZombieModel();
  let n = 0;
  z.traverse((o) => {
    if (o.isMesh && o.material.visible !== false) {
      const g = o.geometry;
      n += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  disposeZombieModel(z);
  return n;
}
