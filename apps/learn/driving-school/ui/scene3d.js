/* DS-2a: low-poly three.js world for the first-person view. Pure three.js, no DOM:
   text/sign textures come from optional opts.label / opts.sign factories, so Node can
   build and update the whole scene in tests. Every material is double-sided because the
   mirrors flip their projection (a real mirror shows a left-right reversed picture).
   DS-3: the open road (ui/road3d.js) is a third area beside the lot and the town.
   DS-6: AI cars are merged low-poly models (core/carmodel.js), one mesh each.
   DS-7: trees are merged low-poly types (core/treemodel.js), one InstancedMesh per type.
   DS-8: town buildings are merged models (core/buildingmodel.js), one mesh each. */
import { createDrive } from './road3d.js';
export function createWorld(THREE, M, opts = {}) {
  const scene = new THREE.Scene(), DS = THREE.DoubleSide;
  const sky = new THREE.Color('#9fd3f0');
  scene.background = sky; scene.fog = new THREE.Fog(sky, 70, 280);
  scene.add(new THREE.HemisphereLight('#ffffff', '#4d6650', 1.7));
  const sun = new THREE.DirectionalLight('#fff6e0', 1.9); sun.position.set(60, 120, 40); scene.add(sun);
  const basic = c => new THREE.MeshBasicMaterial({ color: c, side: DS });
  const lit = c => new THREE.MeshLambertMaterial({ color: c, side: DS });
  const owned = [];   // geometries/materials of the current lesson markers (rebuilt per lesson)
  function flat(parent, w, d, color, x, z, y, angle = 0, material) {
    const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, material || basic(color)); m.position.set(x, y, z); m.rotation.y = -angle; parent.add(m); return m;
  }
  function instanced(parent, geometry, material, items, place) {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length)), o = new THREE.Object3D();
    items.forEach((it, i) => { o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); place(o, it); o.updateMatrix(); mesh.setMatrixAt(i, o.matrix); });
    mesh.count = items.length; parent.add(mesh); return mesh;
  }
  function sprite(parent, texture, x, y, z, w, h) {
    if (!texture) return null;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, fog: true })); s.position.set(x, y, z); s.scale.set(w, h, 1); parent.add(s); return s;
  }
  const label = (text, style) => opts.label ? opts.label(text, style || {}) : null;

  // Ground and a ring of trees for depth cues.
  const ground = flat(scene, 1400, 1400, '#6f9a6c', 130, 120, 0);
  const trees = [];
  for (let i = 0; i < 44; i++) { const a = i / 44 * Math.PI * 2, r = 175 + (i % 4) * 14; trees.push([130 + Math.cos(a) * r, 120 + Math.sin(a) * r * .9, 6 + (i % 3) * 2]); }
  // DS-7: the ring mixes conifers and round broadleaf trees (core/treemodel.js), one InstancedMesh per type.
  const treeRing = new THREE.Group(), treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: DS }), tint = [1, 1, 1];
  scene.add(treeRing);
  for (const type of ['conifer', 'broadleaf']) {
    const a = M.buildTreeArrays(type), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(a.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3)); g.setAttribute('color', new THREE.BufferAttribute(a.color, 3));
    const mine = trees.filter(t => M.treeKind(t[0], t[1], 'town') === type);
    const m = instanced(treeRing, g, treeMat, mine, (o, t) => { const k = 1.3 * M.treeSpread(t[0], t[1]); o.position.set(t[0], 0, t[1]); o.rotation.y = M.treeHash(t[1], t[0]) * 6.283; o.scale.set(k, t[2], k); });
    mine.forEach((t, i) => { M.treeTint(t[0], t[1], tint); m.setColorAt(i, new THREE.Color(tint[0], tint[1], tint[2])); });
  }

  // Practice lot.
  const lot = new THREE.Group(), L = M.lotLayout(); scene.add(lot);
  flat(lot, L.width, L.depth, '#4b565e', L.width / 2, L.depth / 2, .03);
  const [bx, by, bw, bd] = L.border, edge = basic('#d5dee0');
  flat(lot, bw, .3, 0, bx + bw / 2, by, .05, 0, edge); flat(lot, bw, .3, 0, bx + bw / 2, by + bd, .05, 0, edge);
  flat(lot, .3, bd, 0, bx, by + bd / 2, .05, 0, edge); flat(lot, .3, bd, 0, bx + bw, by + bd / 2, .05, 0, edge);
  const dash = new THREE.PlaneGeometry(1, .2); dash.rotateX(-Math.PI / 2);
  instanced(lot, dash, edge, L.dashes, (o, d) => { o.position.set(d[0] + d[2] / 2, .05, d[1]); o.scale.set(d[2], 1, 1); });
  instanced(lot, new THREE.ConeGeometry(.35, .8, 8), lit('#ff8a2a'), L.cones, (o, c) => o.position.set(c[0], .4, c[1]));

  // Town (lessons 7-13 and the mock test).
  const town = new THREE.Group(); scene.add(town);
  let townSide = null, signalLamps = [], aiCars = [], walkers = [];
  // DS-6: one merged, vertex-coloured mesh per car (body, windows, roof, bumpers, lights, plates,
  // mirrors, wheels) from core/carmodel.js; geometry cached per colour + shape, one shared material.
  const vcGeometry = a => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3)); g.setAttribute('color', new THREE.BufferAttribute(a.color, 3)); g.computeBoundingSphere(); return g; };
  const buildingMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: DS });   // DS-8
  const carGeos = new Map(), carMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: DS });
  function carMesh(color, variant = 1) {
    const name = M.carVariantOf(variant), key = color + name;
    let g = carGeos.get(key);
    if (!g) {
      const a = M.buildCarArrays(color, name); g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(a.position, 3)); g.setAttribute('normal', new THREE.BufferAttribute(a.normal, 3));
      g.setAttribute('color', new THREE.BufferAttribute(a.color, 3)); g.computeBoundingSphere(); carGeos.set(key, g);
    }
    return new THREE.Mesh(g, carMat);
  }
  function buildTown(side) {
    town.clear(); townSide = side; signalLamps = []; aiCars = []; walkers = [];
    const T = M.townLayout(side), [W, H] = T.size, pave = basic('#b7bab5'), road = basic('#454f58'), paint = basic('#e8ebdf');
    for (const n of T.roads) {
      flat(town, W, T.pavement, 0, W / 2, n, .02, 0, pave); flat(town, T.pavement, H, 0, n, H / 2, .021, 0, pave);
      flat(town, W, T.roadWidth, 0, W / 2, n, .04, 0, road); flat(town, T.roadWidth, H, 0, n, H / 2, .041, 0, road);
    }
    const R = T.roundabout;
    const disc = (r, color, y) => { const g = new THREE.CircleGeometry(r, 36); g.rotateX(-Math.PI / 2); const m = new THREE.Mesh(g, basic(color)); m.position.set(R.x, y, R.y); town.add(m); };
    disc(R.road, '#454f58', .045); disc(R.kerb, '#c8c9bb', .06);
    const island = new THREE.Mesh(new THREE.CylinderGeometry(R.island, R.island, .35, 24), lit('#587f63')); island.position.set(R.x, .18, R.y); town.add(island);
    // Centre dashes, left out at junctions and the roundabout.
    const dashes = [], clear = (x, y) => T.roads.some(a => T.roads.some(b => Math.abs(x - a) < 8 && Math.abs(y - b) < 8)) || Math.hypot(x - R.x, y - R.y) < R.road + 1;
    for (const n of T.roads) for (let t = 1.25; t < Math.max(W, H); t += 5) {
      if (t < W && !clear(t, n)) dashes.push([t, n, 0]);
      if (t < H && !clear(n, t)) dashes.push([n, t, Math.PI / 2]);
    }
    const dg = new THREE.PlaneGeometry(2.5, .2); dg.rotateX(-Math.PI / 2);
    instanced(town, dg, paint, dashes, (o, d) => { o.position.set(d[0], .07, d[1]); o.rotation.y = -d[2]; });
    for (const [x, y, w, d] of T.zebra.concat(T.stopLines)) flat(town, w, d, 0, x + w / 2, y + d / 2, .07, 0, paint);
    for (const [x, y, w, d] of T.parking) flat(town, w, d, '#5c6870', x + w / 2, y + d / 2, .05);
    for (const [x, y, w, d] of T.bays) {
      flat(town, w, .2, 0, x + w / 2, y, .075, 0, paint); flat(town, w, .2, 0, x + w / 2, y + d, .075, 0, paint);
      flat(town, .2, d, 0, x, y + d / 2, .075, 0, paint); flat(town, .2, d, 0, x + w, y + d / 2, .075, 0, paint);
    }
    // DS-8: each town building is one merged vertex-colour mesh (windows, parapet, tank, entrance,
    // signboard; awnings on SHOPS) from core/buildingmodel.js. Same 22 x 15 m footprint and height.
    T.buildings.forEach(([x, y, name, color], i) => {
      const h = M.townBuildingHeight(i), a = M.townBuildingArrays(name, color, h, M.frontFace(x, y, 22, 15, T.roads));
      const b = new THREE.Mesh(vcGeometry(a), buildingMat); b.name = 'building'; b.position.set(x + 11, 0, y + 7.5); town.add(b);
      sprite(town, label(name, { bg: '#ffffff', fg: '#203040' }), x + 11, h + 2, y + 7.5, 8, 2);   // DS-8: 0.6 m higher, clear of the new parapet
    });
    // Traffic signal for eastbound traffic: faces west (towards the approaching driver).
    const S = T.signal, pole = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 3.2, 6), lit('#2b3238')); pole.position.set(S.x, 1.6, S.y); town.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.4, 1.5, .55), lit('#222a30')); head.position.set(S.x, 3.6, S.y); town.add(head);
    ['red', 'amber', 'green'].forEach((c, i) => {
      const m = new THREE.MeshBasicMaterial({ color: '#4b5054', side: DS }), lamp = new THREE.Mesh(new THREE.SphereGeometry(.18, 8, 6), m);
      lamp.position.set(S.x - .22, 4.1 - i * .48, S.y); town.add(lamp); signalLamps.push({ c, m });
    });
    for (const sg of T.signs) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.4, 5), lit('#30383e')); post.position.set(sg.x, 1.2, sg.y); town.add(post);
      const tex = opts.sign ? opts.sign(sg.kind, sg.text) : null;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), tex ? new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: DS }) : basic(sg.kind === 'stop' ? '#c83e42' : '#ffffff'));
      face.position.set(sg.x, 2.7, sg.y); face.rotation.y = sg.kind === 'stop' ? Math.PI : -Math.PI / 2; town.add(face);
    }
    ['#e3b85f', '#df798b', '#e3e5da', '#a8abd9'].forEach((c, i) => { const m = carMesh(c, i); m.visible = false; town.add(m); aiCars.push(m); });
    for (let i = 0; i < 2; i++) { const g = walkerMesh(); g.visible = false; town.add(g); walkers.push(g); }
  }
  function walkerMesh() {
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.CylinderGeometry(.22, .25, 1.1, 6), lit('#2e5f86')); body.position.y = .75; g.add(body);
    const headM = new THREE.Mesh(new THREE.SphereGeometry(.17, 8, 6), lit('#e2b48c')); headM.position.y = 1.5; g.add(headM);
    return g;
  }
  // Open road (DS-3), built in chunks around the car.
  const drive = createDrive(THREE, M, { sign: opts.sign, carMesh, walker: walkerMesh }); scene.add(drive.group);

  // Lesson markers: blue arches to drive through, numbers, a dashed guide and finish boxes.
  const markers = new THREE.Group(); scene.add(markers);
  let markerKey = '', rings = [];
  function setLesson(def, side) {
    for (const o of owned) o.dispose(); owned.length = 0; markers.clear(); rings = [];
    const K = M.lessonMarkers(def), track = x => { owned.push(x); return x; };
    const arch = track(new THREE.TorusGeometry(3.4, .14, 6, 28)), ground = track(new THREE.RingGeometry(3.6, 4, 32)); ground.rotateX(-Math.PI / 2);
    K.rings.forEach(r => {
      const am = track(new THREE.MeshBasicMaterial({ color: '#7fd8ff', side: DS, transparent: true, opacity: .9 }));
      const a = new THREE.Mesh(arch, am); a.position.set(r.x, .9, r.y); a.rotation.y = Math.atan2(Math.cos(r.heading), Math.sin(r.heading)); markers.add(a);
      const gm = track(new THREE.MeshBasicMaterial({ color: '#7fd8ff', side: DS, transparent: true, opacity: .8 }));
      const g = new THREE.Mesh(ground, gm); g.position.set(r.x, .08, r.y); markers.add(g);
      const tex = label(String(r.n), { bg: '#0b6f96', fg: '#ffffff', round: true });
      if (tex) track(tex);
      const n = sprite(markers, tex, r.x, 5.1, r.y, 1.6, 1.6); if (n) track(n.material);
      rings.push({ a, am, gm, n });
    });
    const guide = [], step = 3;
    for (let i = 1; i < K.path.length; i++) {
      const [x0, y0] = K.path[i - 1], [x1, y1] = K.path[i], len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
      for (let t = 1; t < len - 1; t += step) guide.push([x0 + (x1 - x0) * t / len, y0 + (y1 - y0) * t / len, ang]);
    }
    const gg = track(new THREE.PlaneGeometry(1.4, .3)); gg.rotateX(-Math.PI / 2);
    const gmat = track(new THREE.MeshBasicMaterial({ color: '#71d8fc', side: DS, transparent: true, opacity: .7 }));
    instanced(markers, gg, gmat, guide, (o, d) => { o.position.set(d[0], .085, d[1]); o.rotation.y = -d[2]; });
    for (const b of [K.box, K.park].filter(Boolean)) {
      const fill = track(new THREE.MeshBasicMaterial({ color: '#4fc3f7', side: DS, transparent: true, opacity: .32 }));
      const pg = track(new THREE.PlaneGeometry(b.w, b.d)); pg.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(pg, fill); m.position.set(b.x, .09, b.y); markers.add(m);
    }
    markerKey = def.id + '|' + side;
  }

  function update(s, prefs, time = 0) {
    const side = prefs.side || 'left', def = s.l.def;
    if (def.id + '|' + side !== markerKey) setLesson(def, side);
    const open = !!(s.w && s.w.road);
    lot.visible = !s.w; town.visible = !!s.w && !open; drive.group.visible = open; treeRing.visible = !open;
    if (open) { ground.position.set(Math.round(s.c.x / 50) * 50, -.05, Math.round(s.c.y / 50) * 50); drive.update(s, prefs); }
    else ground.position.set(130, 0, 120);
    if (s.w && !open && townSide !== side) buildTown(side);
    rings.forEach((r, i) => {
      const passed = i < s.l.gate, next = i === s.l.gate, color = passed ? '#6fdc9f' : next ? '#3fd0ff' : '#9ab8c8';
      r.am.color.set(color); r.gm.color.set(color); r.am.opacity = passed ? .35 : next ? 1 : .55; r.gm.opacity = r.am.opacity;
      const k = next ? 1 + .06 * Math.sin(time * 5) : 1; r.a.scale.set(k, k, k);
      if (r.n) r.n.visible = !passed;
    });
    if (s.w && !open) {
      const light = s.w.time % 24 < 9 ? 'green' : s.w.time % 24 < 12 ? 'amber' : 'red';
      for (const l of signalLamps) l.m.color.set(l.c === light ? { red: '#ff3b30', amber: '#ffbf2e', green: '#3ee68a' }[l.c] : '#3c4247');
      aiCars.forEach((m, i) => { const ai = s.w.cars[i]; m.visible = !!ai; if (ai) { m.position.set(ai.x, 0, ai.y); m.rotation.y = -ai.heading; } });
      walkers.forEach((m, i) => { const p = s.w.pedestrians[i]; m.visible = !!p; if (p) m.position.set(p.x, 0, p.y); });
    }
  }
  return { scene, update, setLesson, get markerCount() { return rings.length; }, get town() { return town; }, get lot() { return lot; }, get drive() { return drive; } };
}

// Point a camera using a pose from core/cockpit.js; mirror poses flip left-right.
export function poseCamera(camera, pose, aspect) {
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  if (aspect && (camera.aspect !== aspect || camera.fov !== pose.fov)) { camera.aspect = aspect; camera.fov = pose.fov; camera.updateProjectionMatrix(); camera.userData.flipped = false; }
  if (pose.flip && !camera.userData.flipped) {
    camera.projectionMatrix.elements[0] *= -1; camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert(); camera.userData.flipped = true;
  }
  camera.updateMatrixWorld();
  return camera;
}
