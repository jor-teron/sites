/* DS-3: the procedural open road in three.js. Pure three.js, no DOM (Node builds it in tests).
   The road is built in 100 m chunks (core/roadgen.js) around the car: 3 meshes per chunk
   (tarmac, verge, paint with vertex colours). Chunks behind are dropped and disposed.
   Scenery (trees, poles, houses, sign posts and faces) uses a fixed set of InstancedMeshes
   refilled when the chunk window moves, so the mesh count stays flat however far you drive. */
export function createDrive(THREE, M, opts = {}) {
  const group = new THREE.Group(), DS = THREE.DoubleSide;
  group.visible = false;
  const basic = c => new THREE.MeshBasicMaterial({ color: c, side: DS });
  const lit = c => new THREE.MeshLambertMaterial({ color: c, side: DS });
  const mat = { road: basic('#454f58'), verge: new THREE.MeshLambertMaterial({ vertexColors: true, side: DS }), paint: new THREE.MeshBasicMaterial({ vertexColors: true, side: DS }) };
  const col = h => new THREE.Color(h);
  const C = { white: col('#e8ebdf'), yellow: col('#f2c230'), black: col('#22262a'), green: col('#6f9a5c'), pave: col('#b7bab5'), dirt: col('#8a8a5e'), rock: col('#7d7a6a') };
  function pool(geometry, material, cap) { const m = new THREE.InstancedMesh(geometry, material, cap); m.count = 0; m.frustumCulled = false; group.add(m); return m; }
  const up = g => { g.translate(0, .5, 0); return g; };
  // DS-7: three tree types (core/treemodel.js), one InstancedMesh each sharing one vertex-colour material;
  // 600 trees in total as before. Per-tree width spread and colour tint come from its position.
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: DS }), TREE_CAP = 600, tint = [1, 1, 1], tintCol = new THREE.Color();
  const treeGeo = type => { const a = M.buildTreeArrays(type), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3)); g.setAttribute('color', new THREE.BufferAttribute(a.color, 3)); return g; };
  const treeKinds = {}; for (const t of M.TREE_TYPES) { const m = treeKinds[t] = pool(treeGeo(t), treeMat, TREE_CAP); m.setColorAt(0, tintCol.setRGB(1, 1, 1)); }   // colour buffer from the start
  const poles = pool(up(new THREE.CylinderGeometry(.09, .12, 1, 5)), lit('#59626a'), 160);
  // DS-8: houses are four merged unit models (2, 3 or 4 floors with terrace and tank; village hut with
  // thatch), one InstancedMesh each, 220 in total as before. Instance colour paints the walls.
  const HOUSE_CAP = 220, houseMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: DS }), white = col('#ffffff');
  const houseKinds = {};
  for (const k of M.HOUSE_TYPES) { const a = M.houseArrays(k), g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3)); g.setAttribute('color', new THREE.BufferAttribute(a.color, 3)); const m = houseKinds[k] = pool(g, houseMat, HOUSE_CAP); m.setColorAt(0, white); }
  const posts = pool(up(new THREE.CylinderGeometry(.05, .05, 1, 5)), lit('#30383e'), 60);
  const faceGeo = new THREE.PlaneGeometry(1.3, 1.3), faces = new Map();
  const housePalette = ['#c69172', '#718eb4', '#d7c7a0', '#a589a9', '#b58d5c'].map(col);
  const islands = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(M.ROUND.island, M.ROUND.island + .3, .5, 20), lit('#587f63')); m.visible = false; group.add(m); return m; });
  const cars = ['#6fa8c9', '#c95f4a', '#7fae7a', '#5a5f66'].map((c, i) => { const m = opts.carMesh(c, i + 1); m.visible = false; group.add(m); return m; });   // DS-6 models
  const walkers = [0, 1].map(() => { const m = opts.walker(); m.visible = false; group.add(m); return m; });
  const chunks = new Map();
  let road = null, side = 'left', key = '';
  const o = new THREE.Object3D();
  // Scene point at lateral offset lat (+ = left of the road direction) and height dy above the road.
  const lp = (p, lat, dy = 0) => [p.x + Math.sin(p.dir) * lat, p.h + dy, p.y - Math.cos(p.dir) * lat];
  function faceFor(kind, text) {
    const k = kind + ':' + text; if (faces.has(k)) return faces.get(k);
    const tex = opts.sign ? opts.sign(kind === 'limit' ? 'speed' : 'warn', text) : null;
    const m = pool(faceGeo, tex ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: DS }) : basic(kind === 'limit' ? '#ffffff' : '#f2c230'), 16);
    faces.set(k, m); return m;
  }
  const eventIndex = e => Math.round(e.s / M.ROAD_STEP);
  function inChunk(e, k) { let i = eventIndex(e); if (road.mode === 'loop') i = ((i % road.n) + road.n) % road.n; return M.chunkOf(i) === k; }
  function buildChunk(k) {
    const pts = M.chunkPoints(road, k);
    const rPos = [], rIdx = [], vPos = [], vCol = [], pPos = [], pCol = [];
    const events = road.events.filter(e => inChunk(e, k)).map(e => road.place(e)).filter(e => e.x != null);
    const rounds = road.events.filter(e => e.kind === 'roundabout').map(e => road.place(e)).filter(e => e.x != null);
    const inRound = p => rounds.some(e => Math.hypot(p.x - e.x, p.y - e.y) < M.ROUND.outer + 1.5);
    const quad = (pos, cols, a, b, c, d, colr) => { for (const v of [a, b, c, a, c, d]) { pos.push(v[0], v[1], v[2]); cols.push(colr.r, colr.g, colr.b); } };
    pts.forEach((p, j) => {
      const w = p.width / 2; rPos.push(...lp(p, w, .03), ...lp(p, -w, .03));
      if (j) { const a = (j - 1) * 2; rIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    for (let j = 1; j < pts.length; j++) {
      const p = pts[j - 1], q = pts[j], vc = p.type === 'city' ? C.pave : p.type === 'ghat' ? C.rock : p.type === 'village' ? C.dirt : C.green;
      for (const sd of [1, -1]) {
        const wp = p.width / 2 * sd, wq = q.width / 2 * sd, fp = (p.type === 'city' ? 3 : 8) * sd, fq = (q.type === 'city' ? 3 : 8) * sd;
        quad(vPos, vCol, lp(p, wp, .02), lp(q, wq, .02), [...lp(q, wq + fq, 0)].map((v, i) => i === 1 ? q.h * .4 - .02 : v), [...lp(p, wp + fp, 0)].map((v, i) => i === 1 ? p.h * .4 - .02 : v), vc);
      }
      if (inRound(p) || inRound(q)) continue;
      // Edge lines, and the centre line (dashed; solid with dashed lane lines on the highway).
      const line = (lat, colr, dash) => { if (dash && j % 2) return; quad(pPos, pCol, lp(p, lat - .08, .06), lp(q, lat - .08, .06), lp(q, lat + .08, .06), lp(p, lat + .08, .06), colr); };
      for (const sd of [1, -1]) {
        const mouth = events.some(e => e.kind === 'junction' && e.side === sd && Math.hypot(p.x - e.x, p.y - e.y) < 5);
        if (!mouth) line(sd * (Math.min(p.width, q.width) / 2 - .3), C.white, false);
      }
      if (p.lanes === 2) { line(0, C.yellow, false); line(p.width / 4, C.white, true); line(-p.width / 4, C.white, true); }
      else line(0, C.white, p.type !== 'ghat');
    }
    for (const e of events) {
      const p = { x: e.x, y: e.y, h: e.h, dir: e.dir }, fwd = (q, d) => ({ x: q.x + Math.cos(q.dir) * d, y: q.y + Math.sin(q.dir) * d, h: q.h, dir: q.dir }), w = e.width / 2;
      if (e.kind === 'zebra') for (let lat = -w + .5; lat < w - .3; lat += 1) quad(pPos, pCol, lp(fwd(p, -1.5), lat, .065), lp(fwd(p, 1.5), lat, .065), lp(fwd(p, 1.5), lat + .5, .065), lp(fwd(p, -1.5), lat + .5, .065), C.white);
      else if (e.kind === 'breaker') for (let n = 0; n < 6; n++) { const a = -w + n * e.width / 6; quad(pPos, pCol, lp(fwd(p, -.5), a, .1), lp(fwd(p, .5), a, .1), lp(fwd(p, .5), a + e.width / 6, .1), lp(fwd(p, -.5), a + e.width / 6, .1), n % 2 ? C.black : C.yellow); }
      else if (e.kind === 'junction') {
        // Side road: 6 m wide, 32 m long, going off to e.side.
        const b = rPos.length / 3, a0 = lp(fwd(p, -3), e.side * (w - .2), .031), a1 = lp(fwd(p, 3), e.side * (w - .2), .031), a2 = lp(fwd(p, 3), e.side * (w + 32), .031), a3 = lp(fwd(p, -3), e.side * (w + 32), .031);
        rPos.push(...a0, ...a1, ...a2, ...a3); rIdx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        quad(pPos, pCol, lp(fwd(p, -3), e.side * (w + 1), .065), lp(fwd(p, 0), e.side * (w + 1), .065), lp(fwd(p, 0), e.side * (w + 1.3), .065), lp(fwd(p, -3), e.side * (w + 1.3), .065), C.white);
      } else if (e.kind === 'roundabout') {
        const b = rPos.length / 3, n = 28; rPos.push(e.x, e.h + .035, e.y);
        for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2; rPos.push(e.x + Math.cos(a) * M.ROUND.outer, e.h + .035, e.y + Math.sin(a) * M.ROUND.outer); if (i) rIdx.push(b, b + i, b + i + 1); }
      }
    }
    const geo = (pos, cols, idx) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (cols) g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); if (idx) g.setIndex(idx); return g; };
    const vg = geo(vPos, vCol); vg.computeVertexNormals();
    const meshes = [new THREE.Mesh(geo(rPos, null, rIdx), mat.road), new THREE.Mesh(vg, mat.verge), new THREE.Mesh(geo(pPos, pCol), mat.paint)];
    meshes.forEach(m => group.add(m));
    return { meshes, scenery: M.chunkScenery(road, k), signs: road.signs.filter(g => inChunk(g, k)), events };
  }
  function dropChunk(k) { const c = chunks.get(k); for (const m of c.meshes) { group.remove(m); m.geometry.dispose(); } chunks.delete(k); }
  function refill() {
    let treeTotal = 0; for (const t of M.TREE_TYPES) treeKinds[t].count = 0; let houseTotal = 0; for (const k of M.HOUSE_TYPES) houseKinds[k].count = 0; poles.count = posts.count = 0; for (const f of faces.values()) f.count = 0;
    const set = (mesh, cap, fn) => { if (mesh.count >= cap) return; o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); fn(o); o.updateMatrix(); mesh.setMatrixAt(mesh.count++, o.matrix); };
    const sg = side === 'right' ? -1 : 1;
    for (const c of chunks.values()) {
      for (const t of c.scenery.trees) {
        if (treeTotal >= TREE_CAP) break;
        const m = treeKinds[M.treeKind(t.x, t.y, t.road)], i = m.count, k = M.treeSpread(t.x, t.y);
        set(m, TREE_CAP, q => { q.position.set(t.x, t.h * .4 - .3, t.y); q.rotation.y = M.treeHash(t.y, t.x) * 6.283; q.scale.set(k, t.ht, k); });
        M.treeTint(t.x, t.y, tint); m.setColorAt(i, tintCol.setRGB(tint[0], tint[1], tint[2])); treeTotal++;
      }
      for (const t of c.scenery.poles) set(poles, 160, q => { q.position.set(t.x, t.h, t.y); q.scale.set(1, 6, 1); });
      for (const t of c.scenery.houses) {
        if (houseTotal >= HOUSE_CAP) break;
        const m = houseKinds[M.houseKind(t)], i = m.count;
        set(m, HOUSE_CAP, q => { q.position.set(t.x, t.h * .4 - .1, t.y); q.rotation.y = -t.dir; q.scale.set(t.w, t.ht, t.d); });
        m.setColorAt(i, t.c === 4 ? white : housePalette[t.c % housePalette.length]); houseTotal++;   // huts carry their own mud and thatch colours
      }
      for (const g of c.signs) {
        const p = M.pointAtS(road, g.s); if (!p) continue;
        const [x, , z] = lp(p, sg * (p.width / 2 + 1.4)), face = faceFor(g.kind, g.text);
        set(posts, 60, q => { q.position.set(x, p.h, z); q.scale.set(1, 2.3, 1); });
        set(face, 16, q => { q.position.set(x, p.h + 2.6, z); q.rotation.y = Math.atan2(-Math.cos(p.dir), -Math.sin(p.dir)); });
      }
    }
    for (const m of [...Object.values(treeKinds), poles, ...Object.values(houseKinds), posts, ...faces.values()]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  function reset(r, sd) {
    for (const k of [...chunks.keys()]) dropChunk(k);
    road = r; side = sd; key = '';
  }
  function update(s, prefs) {
    const w = s.w, sd = prefs.side || 'left';
    if (w.road !== road || sd !== side) reset(w.road, sd);
    const want = M.chunkWindow(road, w.at ? w.at.i : 0, 1, 3), k = want.join();
    if (k !== key) {
      for (const c of [...chunks.keys()]) if (!want.includes(c)) dropChunk(c);
      for (const c of want) if (!chunks.has(c)) chunks.set(c, buildChunk(c));
      refill(); key = k;
    }
    let n = 0;
    for (const c of chunks.values()) for (const e of c.events) if (e.kind === 'roundabout' && n < islands.length) { const m = islands[n++]; m.visible = true; m.position.set(e.x, e.h + .25, e.y); }
    for (; n < islands.length; n++) islands[n].visible = false;
    cars.forEach((m, i) => { const ai = w.cars[i]; m.visible = !!ai; if (ai) { m.position.set(ai.x, ai.h || 0, ai.y); m.rotation.y = -ai.heading; } });
    walkers.forEach((m, i) => { const p = w.pedestrians[i]; m.visible = !!p; if (p) m.position.set(p.x, p.h || 0, p.y); });
  }
  return { group, update, reset, trees: treeKinds, houses: houseKinds, get chunkCount() { return chunks.size; }, get chunkKeys() { return [...chunks.keys()]; } };
}
