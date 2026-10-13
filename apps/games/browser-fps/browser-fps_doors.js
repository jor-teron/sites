/**
 * Browser FPS — doors between maps. Links come from CONFIG.doors.list ({ id, map, to, pos: [x, z], face: [fx, fz], style }):
 * every entry whose map is the current one becomes a themed gate (tiki | stone | metal) with a glowing destination label.
 * Walking through the opening (or pressing E inside promptRadius) fades out, shows "Loading <map>", saves player state in
 * sessionStorage and reloads with ?map=<to>&from=<this map>. On arrival the player spawns spawnDist in front of the door that
 * leads back (to === from), facing away from it.
 *
 * createDoors({ scene, map, cfg, groundAt, colliders, mapNames }) -> { doors, arrival(from) -> { x, z, yaw } | null,
 *   update(dt, playerPos, t) -> nearDoor | null, go(door, state), takeCarry() -> state | null }
 */
import * as THREE from 'three';

const CARRY_KEY = 'browser-fps-carry';

function labelSprite(text, color) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 58px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const hex = '#' + new THREE.Color(color).getHexString();
  g.shadowColor = hex; g.shadowBlur = 26; g.fillStyle = hex;
  for (let i = 0; i < 3; i++) g.fillText(text, 256, 64);
  g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.fillText(text, 256, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  s.scale.set(3.2, 0.8, 1);
  return s;
}

/** Gate model, opening along local x (width w), facing local +z. Returns { group, posts: [[lx, halfW]], height }. */
function gateModel(style, w, h) {
  const g = new THREE.Group(), std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const add = (geo, mat, x, y, z, rx = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const px = w / 2 + 0.25;
  if (style === 'tiki') {
    const wood = std(0x8a5a32), dark = std(0x4a2e18), thatch = std(0xc9a85a, { roughness: 1 });
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.28, 0.34, h, 8), wood, s * px, h / 2, 0);
      for (let k = 0; k < 3; k++) {   // carved tiki faces: brow + eyes + mouth blocks
        const y = 0.7 + k * 0.85;
        add(new THREE.BoxGeometry(0.5, 0.1, 0.12), dark, s * px, y + 0.2, 0.28);
        add(new THREE.BoxGeometry(0.12, 0.12, 0.1), dark, s * px - 0.12, y + 0.05, 0.3); add(new THREE.BoxGeometry(0.12, 0.12, 0.1), dark, s * px + 0.12, y + 0.05, 0.3);
        add(new THREE.BoxGeometry(0.3, 0.08, 0.1), dark, s * px, y - 0.2, 0.3);
      }
      add(new THREE.ConeGeometry(0.18, 0.5, 6), std(0xffa040, { emissive: 0xff7020, emissiveIntensity: 1.2 }), s * px, h + 0.25, 0);   // torch flame
    }
    add(new THREE.BoxGeometry(w + 1.4, 0.35, 0.45), wood, 0, h - 0.25, 0);
    add(new THREE.BoxGeometry(w + 2.0, 0.25, 1.4), thatch, 0, h + 0.05, 0, 0, 0);
  } else if (style === 'stone') {
    const stone = std(0x8a9098, { flatShading: true }), snow = std(0xf3f7fc, { flatShading: true });
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) add(new THREE.DodecahedronGeometry(0.55 - k * 0.04, 0), stone, s * (px + 0.1), 0.45 + k * 0.85, (k % 2) * 0.08);
    const n = 9, rr = px + 0.1;
    for (let i = 0; i < n; i++) {   // arch of blocks
      const a = Math.PI * (i / (n - 1)), x = Math.cos(a) * rr, y = h - 0.6 + Math.sin(a) * 1.1;
      const b = add(new THREE.BoxGeometry(0.75, 0.6, 0.9), stone, x, y, 0, 0, a - Math.PI / 2);
      add(new THREE.BoxGeometry(0.7, 0.18, 0.95), snow, x, y + 0.36, 0, 0, b.rotation.z);
    }
  } else {   // metal gate
    const steel = std(0x5c636b, { metalness: 0.7, roughness: 0.4 }), yel = std(0xf0c020), blk = std(0x222222);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.35, h, 0.35), steel, s * px, h / 2, 0);
    for (let i = 0; i < 8; i++) add(new THREE.BoxGeometry((w + 1.0) / 8, 0.4, 0.4), i % 2 ? blk : yel, -(w + 1.0) / 2 + (i + 0.5) * (w + 1.0) / 8, h + 0.2, 0);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, h * 0.9, 0.12), steel, s * (px + 0.6), h * 0.45, -0.2, 0, s * 0.0);
    add(new THREE.BoxGeometry(0.5, 0.25, 0.2), std(0x30ff80, { emissive: 0x30ff80, emissiveIntensity: 1.5 }), 0, h + 0.55, 0);
  }
  return { group: g, px };
}

export function createDoors({ scene, map, cfg, groundAt, colliders, mapNames = {} }) {
  const D = cfg, doors = [];
  for (const d of D.list.filter((e) => e.map === map)) {
    const [x, z] = d.pos, f = new THREE.Vector2(...d.face).normalize(), y = groundAt(x, z);
    const st = D.styles[d.style] || D.styles.metal, w = st.width, h = st.height;
    const { group, px } = gateModel(d.style, w, h);
    group.position.set(x, y - 0.05, z);
    group.rotation.y = Math.atan2(f.x, f.y);                               // local +z -> face
    // glowing portal sheet inside the opening
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(w, h - 0.2), new THREE.MeshBasicMaterial({ color: st.glow, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false }));
    portal.position.set(0, (h - 0.2) / 2, 0); group.add(portal);
    const label = labelSprite(mapNames[d.to] || d.to, st.glow); label.position.set(0, h + 1.3, 0); group.add(label);
    scene.add(group);
    // posts are solid (walk through the middle); right vector = (f.y, -f.x)
    const rx = f.y, rz = -f.x;
    for (const s of [-1, 1]) {
      const cx = x + rx * s * px, cz = z + rz * s * px, r = 0.4;
      colliders.push({ min: new THREE.Vector3(cx - r, y - 0.2, cz - r), max: new THREE.Vector3(cx + r, y + h, cz + r), prop: 'door' });
    }
    doors.push({ ...d, x, y, z, f, w, group, portal, label });
  }
  const yawFacing = (f) => Math.atan2(-f.x, -f.y);   // camera yaw that looks along f (forward = (-sin, -cos))
  function arrival(from) {
    const d = doors.find((e) => e.to === from); if (!d) return null;
    return { x: d.x + d.f.x * D.spawnDist, z: d.z + d.f.y * D.spawnDist, yaw: yawFacing(d.f), door: d.id };
  }
  /** Nearest door within promptRadius; .through = player is inside the opening (walk-through trigger). */
  function update(dt, p, t = 0) {
    let best = null, bd = Infinity;
    for (const d of doors) {
      d.portal.material.opacity = 0.25 + 0.15 * Math.sin(t * 2.5 + d.x);
      const dx = p.x - d.x, dz = p.z - d.z, dist = Math.hypot(dx, dz);
      if (dist < bd) { bd = dist; best = d; }
    }
    if (!best || bd > D.promptRadius) return null;
    const dx = p.x - best.x, dz = p.z - best.z;
    const along = dx * best.f.x + dz * best.f.y, side = Math.abs(dx * best.f.y - dz * best.f.x);   // depth / lateral offset
    best.through = Math.abs(along) < D.triggerDepth && side < best.w / 2;
    return best;
  }
  let going = false;
  function go(d, state, extraParams = {}) {
    if (going) return; going = true;
    sessionStorage.setItem(CARRY_KEY, JSON.stringify({ ...state, from: map, to: d.to, t: Date.now() }));
    const fade = document.getElementById('door-fade'), txt = document.getElementById('door-fade-text');
    if (txt) txt.textContent = 'Loading ' + (mapNames[d.to] || d.to) + '…';
    if (fade) fade.classList.add('on');
    const u = new URL(location.href); u.searchParams.set('map', d.to); u.searchParams.set('from', map);
    for (const [k, v] of Object.entries(extraParams)) u.searchParams.set(k, v);
    setTimeout(() => { location.href = u.href; }, D.fadeMs);
    return u.href;
  }
  /** Carried state for this arrival (only if it was saved for this map, recently), then cleared. */
  function takeCarry() {
    try {
      const s = JSON.parse(sessionStorage.getItem(CARRY_KEY) || 'null');
      sessionStorage.removeItem(CARRY_KEY);
      if (s && s.to === map && Date.now() - s.t < 60000) return s;
    } catch (e) { /* ignore */ }
    return null;
  }
  return { doors, arrival, update, go, takeCarry, get going() { return going; } };
}
