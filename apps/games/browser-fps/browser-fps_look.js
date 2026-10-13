/**
 * Browser FPS — Island "look" (Map Visuals 2, desktop): soft sun shadows that follow the player (texel-snapped),
 * sky dome whose horizon matches the fog, instanced grass clumps + flowers in a ring around the player (fade with
 * distance, sway with the island wind) and a sun glare (lens-flare sprites, fade when occluded or off-axis).
 *
 * setupIslandLook({ scene, renderer, camera, sun, island, cfg: CONFIG.island.look, sc: resolved scene cfg, colliders })
 *   -> { update(t, playerPos), grass, flare, stats() }
 */
import * as THREE from 'three';

const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const col = (h) => new THREE.Color(h);

function glowTexture(inner = 'rgba(255,255,255,1)', ring = false) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (ring) { grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(0.7, 'rgba(255,255,255,0.05)'); grd.addColorStop(0.85, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); }
  else { grd.addColorStop(0, inner); grd.addColorStop(0.15, 'rgba(255,250,235,0.8)'); grd.addColorStop(0.4, 'rgba(255,230,180,0.18)'); grd.addColorStop(1, 'rgba(255,220,160,0)'); }
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function setupIslandLook({ scene, renderer, camera, sun, island, cfg, sc, colliders }) {
  const sunDir = new THREE.Vector3(...sc.sunPos).normalize();

  // ── Soft shadows ──
  if (cfg.softShadows) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.shadow.radius = cfg.shadowRadius;
    sun.shadow.bias = cfg.shadowBias; sun.shadow.normalBias = cfg.shadowNormalBias;
  }
  const texel = (2 * sc.shadowExtent) / sc.shadowMapSize;

  // ── Sky dome (no fog; horizon colour = fog colour so distant hills melt into the sky) ──
  let dome = null;
  if (cfg.sky.enabled) {
    scene.fog.color.setHex(cfg.sky.horizon); scene.background = col(cfg.sky.horizon);
    dome = new THREE.Mesh(new THREE.SphereGeometry(sc.far * 0.9, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: col(cfg.sky.top) }, hor: { value: col(cfg.sky.horizon) }, glow: { value: col(cfg.sky.sunGlow) }, sunDir: { value: sunDir } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top, hor, glow, sunDir; varying vec3 vD;
        void main(){ vec3 d = normalize(vD); float h = clamp(d.y, 0.0, 1.0);
          vec3 c = mix(hor, top, pow(h, 0.55));
          float s = max(dot(d, sunDir), 0.0);
          c += glow * (pow(s, ${(1 / cfg.sky.glowSize).toFixed(2)}) * ${cfg.sky.glowStrength.toFixed(3)} + pow(s, 900.0) * 2.5);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }));
    dome.renderOrder = -10; dome.frustumCulled = false;
    scene.add(dome);
  }

  // ── Grass clumps + flowers (instanced, recycled on a world grid around the player) ──
  let grass = null, flowers = null;
  const G = cfg.grass;
  const windTime = island.windTime;
  function grassMat(base) {
    const m = new THREE.MeshLambertMaterial({ ...base, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWindT = windTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindT;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float hw = clamp(transformed.y / ${G.height.toFixed(3)}, 0.0, 1.0);
          float t = uWindT * ${(+island.wind.speed || 1.4).toFixed(3)};
          float ph = ip.x * 0.61 + ip.z * 0.47;
          transformed.x += sin(t * 1.3 + ph) * ${G.sway.toFixed(3)} * hw;
          transformed.z += cos(t + ph * 1.2) * ${(G.sway * 0.5).toFixed(3)} * hw;
          float fd = distance(ip.xz, cameraPosition.xz);
          transformed *= 1.0 - smoothstep(${G.fadeStart.toFixed(2)}, ${G.radius.toFixed(2)}, fd);
        }`);
    };
    m.customProgramCacheKey = () => 'grass';
    return m;
  }
  if (G.enabled && G.clumps > 0) {
    // clump: 5 tapered blades (triangles) fanned around the root
    const pos = [], cl = [];
    for (let b = 0; b < 5; b++) {
      const a = (b / 5) * Math.PI * 2 + 0.3, lean = 0.08 + 0.05 * (b % 2), w = 0.035, h = G.height * (0.7 + 0.3 * ((b * 7) % 5) / 4);
      const cx = Math.cos(a) * 0.06, cz = Math.sin(a) * 0.06, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
      pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean);
      cl.push(0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 1, 1, 1);
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    gg.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
    gg.computeVertexNormals();
    // normals up-ish so blades shade like the ground (no dark backfaces)
    const n = gg.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
    grass = new THREE.InstancedMesh(gg, grassMat({ vertexColors: true }), G.clumps);
    const fg = new THREE.BufferGeometry();
    const fp = [];
    for (let k = 0; k < 2; k++) { const a = k * Math.PI / 2, dx = Math.cos(a) * 0.06, dz = Math.sin(a) * 0.06, y = G.height * 0.75;
      fp.push(-dx, y - 0.05, -dz, dx, y - 0.05, dz, dx, y + 0.07, dz, -dx, y - 0.05, -dz, dx, y + 0.07, dz, -dx, y + 0.07, -dz); }
    fp.push(0, 0, 0, 0.012, 0, 0, 0, G.height * 0.72, 0);   // stem
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3)); fg.computeVertexNormals();
    const fn = fg.attributes.normal; for (let i = 0; i < fn.count; i++) fn.setXYZ(i, 0, 1, 0);
    flowers = new THREE.InstancedMesh(fg, grassMat({ color: 0xffffff }), Math.max(1, G.flowers));
    for (const m of [grass, flowers]) { m.frustumCulled = false; m.receiveShadow = true; m.castShadow = false; m.count = 0; scene.add(m); }
  }
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), tmpC = new THREE.Color();
  const gcols = (G.colors || []).map(col), fcols = (G.flowerColors || []).map(col);
  const rockHit = (x, z) => colliders.some((c) => c.prop !== 'palm_tree' && x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z);
  let lastCX = 1e9, lastCZ = 1e9;
  function refillGrass(px, pz) {
    const cs = G.cell, cx0 = Math.floor(px / cs), cz0 = Math.floor(pz / cs), rc = Math.ceil(G.radius / cs);
    if (cx0 === lastCX && cz0 === lastCZ) return;
    lastCX = cx0; lastCZ = cz0;
    let ng = 0, nf = 0;
    const R2 = G.radius * G.radius, inner = island.beachIn - 0.5;
    for (let i = -rc; i <= rc && ng < G.clumps; i++) for (let j = -rc; j <= rc && ng < G.clumps; j++) {
      const gx = cx0 + i, gz = cz0 + j, h1 = hash(gx, gz), h2 = hash(gz + 17.3, gx - 3.1), h3 = hash(gx * 1.7, gz * 2.3);
      const x = (gx + h1) * cs, z = (gz + h2) * cs, dx = x - px, dz = z - pz;
      if (dx * dx + dz * dz > R2) continue;
      const r = Math.hypot(x, z);
      if (r > inner + h3 * 1.5) continue;                       // grass thins out into the beach
      if (island.isOpen && island.isOpen(x, z) && h3 < 0.6) continue;   // paths / clearings stay sparser
      if (rockHit(x, z)) continue;
      const y = island.heightAt(x, z) - 0.02, flower = h3 > 0.86 && nf < G.flowers;
      const sc = 0.7 + h1 * 0.7;
      tmpQ.setFromEuler(tmpE.set(0, h2 * 6.28, 0)); tmpS.set(sc, sc * (0.8 + h3 * 0.5), sc);
      tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS);
      if (flower && flowers) { flowers.setMatrixAt(nf, tmpM); flowers.setColorAt(nf, fcols[(h1 * fcols.length) | 0] || tmpC.set(0xffffff)); nf++; }
      else { grass.setMatrixAt(ng, tmpM); grass.setColorAt(ng, tmpC.copy(gcols[(h2 * gcols.length) | 0] || col(0x6fa040))); ng++; }
    }
    grass.count = ng; flowers.count = nf;
    grass.instanceMatrix.needsUpdate = true; flowers.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  }

  // ── Sun glare: screen-space sprites along the sun -> centre axis (own ortho scene, drawn after the world) ──
  let flare = null;
  const F = cfg.flare;
  if (F.enabled) {
    const fs = new THREE.Scene(), fc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mk = (tex, size, alpha, color) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false }));
      s.userData = { size, alpha }; fs.add(s); return s;
    };
    const main = mk(glowTexture(), F.size, F.maxAlpha, F.color);
    const ghostTex = glowTexture(undefined, true), ghosts = [];
    const ghostCols = [0xffd090, 0x90ffd0, 0xa0c0ff, 0xffa0e0, 0xfff0a0];
    for (let i = 0; i < F.ghosts; i++) { const g = mk(ghostTex, F.size * (0.12 + 0.18 * ((i * 3) % 4) / 3), F.ghostAlpha, ghostCols[i % ghostCols.length]); g.userData.k = 0.4 + i * 0.45; ghosts.push(g); }
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector3(), camDir = new THREE.Vector3();
    let vis = 0;
    flare = { scene: fs, camera: fc, get visibility() { return vis; },
      render() {
        camera.getWorldDirection(camDir);
        const facing = camDir.dot(sunDir);
        ndc.copy(camera.position).addScaledVector(sunDir, 100).project(camera);
        let target = 0;
        if (facing > 0.2 && ndc.z < 1 && Math.abs(ndc.x) < 1.3 && Math.abs(ndc.y) < 1.3) {
          // occlusion: palms / rocks / terrain between eye and sun
          ray.set(camera.position, sunDir); ray.far = 90;
          const blocked = colliders.some((c) => ray.ray.intersectsBox(c)) || island.heightAt(camera.position.x + sunDir.x * 12, camera.position.z + sunDir.z * 12) > camera.position.y + sunDir.y * 12;
          target = blocked ? 0 : Math.pow((facing - 0.2) / 0.8, 2);
        }
        vis += (target - vis) * 0.25;
        if (vis < 0.01) return;
        const W = renderer.domElement.clientWidth || innerWidth, H = renderer.domElement.clientHeight || innerHeight, asp = W / H;
        fc.left = -asp; fc.right = asp; fc.updateProjectionMatrix();
        const sx = ndc.x * asp, sy = ndc.y;
        main.position.set(sx, sy, -0.5); main.scale.setScalar((main.userData.size / H) * 2); main.material.opacity = main.userData.alpha * vis;
        for (const g of ghosts) { const k = g.userData.k; g.position.set(sx - sx * k * 1.2, sy - sy * k * 1.2, -0.5); g.scale.setScalar((g.userData.size / H) * 2); g.material.opacity = g.userData.alpha * vis; }
        renderer.render(fs, fc);
      } };
  }

  const ls = new THREE.Vector3();
  function update(t, p) {
    if (dome) dome.position.copy(camera.position);
    if (grass) refillGrass(p.x, p.z);
    if (cfg.shadowSnap) {
      // snap the shadow box to whole shadow texels in light space -> no shimmer on edges while walking
      ls.set(p.x, 0, p.z);
      const q = new THREE.Quaternion().setFromUnitVectors(sunDir, new THREE.Vector3(0, 0, 1));
      ls.applyQuaternion(q); ls.x = Math.round(ls.x / texel) * texel; ls.y = Math.round(ls.y / texel) * texel; ls.applyQuaternion(q.invert());
      sun.target.position.copy(ls); sun.position.copy(ls).addScaledVector(sunDir, Math.hypot(...sc.sunPos));
    }
  }
  const stats = () => ({ grass: grass ? grass.count : 0, flowers: flowers ? flowers.count : 0, flare: flare ? +flare.visibility.toFixed(2) : null, sky: !!dome });
  return { update, grass, flowers, flare, dome, stats };
}
