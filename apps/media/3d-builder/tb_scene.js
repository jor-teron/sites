/* 3D Builder — tb_scene.js: viewport, primitives, groups, lights, pick, gizmo. TD2
   Renders on demand only (no continuous loop). three.js r170, local vendor. */

import * as THREE from 'three';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from './vendor/three/examples/jsm/controls/TransformControls.js';
import {
  SHAPE_TYPES, LIGHT_TYPES, DEFAULT_COLOR, DEFAULT_LIGHT_COLOR, DEFAULT_MATERIAL,
  SNAP, PLACE_STEP, sitHeight, defaultRotationDeg, nextName, nextOffset,
  radToDeg, degToRad, roundN, makeProject, parseColorOr, makeId,
  isShapeType, isLightType, normalizeMaterial, normalizeTexture, normalizeLight
} from './tb_io.js';
import { snapBoxes, OBJECT_SNAP_THRESHOLD, alignItems as alignItemsFn, distributeItems as distributeItemsFn } from './tb_align.js';
import { makeTextTexture, textureFromDataURL } from './tb_tex.js';

const SEG = { sphereW: 24, sphereH: 16, cyl: 24, torusR: 12, torusT: 24 };

const THEME_VIEW = {
  light: { bg: 0xe8eef5, grid: 0xcbd5e1, gridCenter: 0x64748b, helper: 0xd97706 },
  dark: { bg: 0x0f172a, grid: 0x334155, gridCenter: 0x94a3b8, helper: 0xfbbf24 }
};

const _tmpPos = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _tmpScale = new THREE.Vector3();
const _tmpMat = new THREE.Matrix4();
const _tmpMat2 = new THREE.Matrix4();
const _tmpBox = new THREE.Box3();

export function createScene(viewportEl, hooks) {
  hooks = hooks || {};

  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, SEG.sphereW, SEG.sphereH),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, SEG.cyl),
    cone: new THREE.ConeGeometry(0.5, 1, SEG.cyl),
    plane: new THREE.PlaneGeometry(1, 1),
    torus: new THREE.TorusGeometry(0.5, 0.2, SEG.torusR, SEG.torusT),
    lightPoint: new THREE.SphereGeometry(0.12, 10, 8),
    lightSpot: new THREE.ConeGeometry(0.12, 0.28, 10),
    lightDir: new THREE.OctahedronGeometry(0.12)
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(8, 6, 10);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  viewportEl.appendChild(renderer.domElement);
  renderer.domElement.tabIndex = 0;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.outline = 'none';
  renderer.domElement.style.touchAction = 'none';

  const hemi = new THREE.HemisphereLight(0xe8f0ff, 0x3d4a3a, 1.05);
  hemi.name = '__defaultHemisphere';
  scene.add(hemi);
  const defDir = new THREE.DirectionalLight(0xffffff, 1.15);
  defDir.position.set(6, 10, 4);
  defDir.castShadow = false;
  defDir.name = '__defaultDirectional';
  scene.add(defDir);

  let grid = new THREE.GridHelper(20, 20, THEME_VIEW.light.gridCenter, THEME_VIEW.light.grid);
  grid.name = '__grid';
  scene.add(grid);
  const axes = new THREE.AxesHelper(2);
  axes.name = '__axes';
  scene.add(axes);

  const objects = new THREE.Group();
  objects.name = '__objects';
  scene.add(objects);

  const boxHelper = new THREE.BoxHelper(new THREE.Object3D(), THEME_VIEW.light.helper);
  boxHelper.visible = false;
  boxHelper.name = '__sel';
  scene.add(boxHelper);

  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = false;
  orbit.screenSpacePanning = true;
  orbit.minDistance = 1;
  orbit.maxDistance = 80;
  orbit.target.set(0, 0, 0);
  orbit.update();

  const transform = new TransformControls(camera, renderer.domElement);
  transform.setMode('translate');
  scene.add(transform.getHelper());

  const pivot = new THREE.Object3D();
  pivot.name = '__pivot';

  let selection = [];
  let snapOn = false;
  let viewName = 'perspective';
  let raf = 0;
  let lastTheme = 'light';
  let skyCustom = false;
  let skyColor = '#e8eef5';
  let textureStore = {};
  let dragStarts = null;
  let pivotStartInv = null;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0, downY = 0, downOk = false, downAdd = false;

  function requestRender() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      if (selection.length) updateHelper();
      renderer.render(scene, camera);
    });
  }

  function primary() {
    return selection.length ? selection[selection.length - 1] : null;
  }

  function emit(kind) {
    if (kind === 'select' && hooks.onSelect) hooks.onSelect(primary(), selection);
    if (kind === 'change' && hooks.onChange) hooks.onChange();
    if (kind === 'objectChange' && hooks.onObjectChange) hooks.onObjectChange(primary(), selection);
  }

  function isEditable(node) {
    return !!(node && node.userData && node.userData.id && node.userData.type);
  }

  function walkEditable(root, fn) {
    const kids = root.children;
    for (let i = 0; i < kids.length; i++) {
      const c = kids[i];
      if (!isEditable(c)) continue;
      if (fn(c) === false) return false;
      if (c.userData.type === 'group') {
        if (walkEditable(c, fn) === false) return false;
      }
    }
  }

  function findById(id) {
    if (!id) return null;
    let found = null;
    walkEditable(objects, function (n) {
      if (n.userData.id === id) { found = n; return false; }
    });
    return found;
  }

  function isDescendant(node, maybeAncestor) {
    let p = node ? node.parent : null;
    while (p) {
      if (p === maybeAncestor) return true;
      p = p.parent;
    }
    return false;
  }

  function transformTargets() {
    const lockedOut = selection.filter(function (o) {
      return !o.userData.locked && o.visible !== false;
    });
    return lockedOut.filter(function (o) {
      return !lockedOut.some(function (other) { return other !== o && isDescendant(o, other); });
    });
  }

  function boxOf(node) {
    _tmpBox.setFromObject(node);
    if (_tmpBox.isEmpty()) {
      node.getWorldPosition(_tmpPos);
      return {
        min: [_tmpPos.x - 0.1, _tmpPos.y - 0.1, _tmpPos.z - 0.1],
        max: [_tmpPos.x + 0.1, _tmpPos.y + 0.1, _tmpPos.z + 0.1]
      };
    }
    return {
      min: [_tmpBox.min.x, _tmpBox.min.y, _tmpBox.min.z],
      max: [_tmpBox.max.x, _tmpBox.max.y, _tmpBox.max.z]
    };
  }

  function combinedBox(nodes) {
    const box = new THREE.Box3();
    let any = false;
    (nodes || []).forEach(function (n) {
      if (!n.visible) return;
      _tmpBox.setFromObject(n);
      if (_tmpBox.isEmpty()) return;
      if (!any) { box.copy(_tmpBox); any = true; }
      else box.union(_tmpBox);
    });
    return any ? box : null;
  }

  function updateHelper() {
    const box = combinedBox(selection);
    if (!box) {
      boxHelper.visible = false;
      return;
    }
    const dummy = boxHelper.userData._dummy || new THREE.Object3D();
    boxHelper.userData._dummy = dummy;
    dummy.position.copy(box.getCenter(_tmpPos));
    const sz = box.getSize(_tmpScale);
    dummy.scale.set(Math.max(sz.x, 0.001), Math.max(sz.y, 0.001), Math.max(sz.z, 0.001));
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrixWorld(true);
    boxHelper.setFromObject(dummy);
    boxHelper.visible = true;
  }

  function names() {
    const list = [];
    walkEditable(objects, function (n) { list.push(n.userData.name); });
    return list;
  }

  function occupiedXZ() {
    const pts = [];
    walkEditable(objects, function (n) {
      n.getWorldPosition(_tmpPos);
      pts.push([_tmpPos.x, _tmpPos.z]);
    });
    return pts;
  }

  function parentIdOf(node) {
    const p = node.parent;
    if (p && isEditable(p) && p.userData.type === 'group') return p.userData.id;
    return null;
  }

  function recordOf(node) {
    const e = node.rotation;
    const type = node.userData.type;
    const rec = {
      id: node.userData.id,
      type: type,
      name: node.userData.name,
      position: [roundN(node.position.x, 4), roundN(node.position.y, 4), roundN(node.position.z, 4)],
      rotation: [roundN(radToDeg(e.x), 3), roundN(radToDeg(e.y), 3), roundN(radToDeg(e.z), 3)],
      scale: type && isLightType(type) ? [1, 1, 1]
        : [roundN(node.scale.x, 4), roundN(node.scale.y, 4), roundN(node.scale.z, 4)],
      color: node.userData.color,
      visible: node.visible !== false,
      locked: !!node.userData.locked,
      parentId: parentIdOf(node)
    };
    if (isShapeType(type)) {
      rec.material = normalizeMaterial(node.userData.material);
      rec.texture = normalizeTexture(node.userData.texture);
    }
    if (isLightType(type)) {
      const L = node.userData.light || normalizeLight({}, type);
      rec.intensity = L.intensity;
      rec.distance = L.distance;
      rec.angle = L.angle;
      rec.penumbra = L.penumbra;
    }
    return rec;
  }

  function disposeMap(mesh) {
    if (mesh && mesh.material && mesh.material.map) {
      mesh.material.map.dispose();
      mesh.material.map = null;
    }
  }

  function applyMaterial(mesh, mat) {
    if (!mesh.material || !isShapeType(mesh.userData.type)) return;
    const m = normalizeMaterial(mat);
    mesh.userData.material = m;
    mesh.material.roughness = m.roughness;
    mesh.material.metalness = m.metalness;
    mesh.material.opacity = m.opacity;
    mesh.material.transparent = m.opacity < 0.999;
    mesh.material.depthWrite = m.opacity >= 0.999;
    mesh.material.needsUpdate = true;
  }

  function applyTextureToMesh(mesh, texRec) {
    if (!mesh || !isShapeType(mesh.userData.type)) return;
    disposeMap(mesh);
    texRec = normalizeTexture(texRec);
    mesh.userData.texture = texRec;
    if (!texRec) {
      mesh.material.map = null;
      mesh.material.needsUpdate = true;
      requestRender();
      return;
    }
    if (texRec.kind === 'text') {
      mesh.material.map = makeTextTexture(texRec);
      mesh.material.needsUpdate = true;
      requestRender();
      return;
    }
    if (texRec.kind === 'image' && texRec.id && textureStore[texRec.id]) {
      const id = texRec.id;
      textureFromDataURL(textureStore[id].dataURL).then(function (tex) {
        if (!mesh.userData.texture || mesh.userData.texture.id !== id) {
          tex.dispose();
          return;
        }
        disposeMap(mesh);
        mesh.material.map = tex;
        mesh.material.needsUpdate = true;
        requestRender();
      }).catch(function () { /* skip bad image */ });
    }
  }

  function getLight(node) {
    if (!node) return null;
    return node.children.find(function (c) { return c.isLight; }) || null;
  }

  function applyLightProps(node) {
    const L = node.userData.light;
    const light = getLight(node);
    if (!light || !L) return;
    light.color.set(node.userData.color || DEFAULT_LIGHT_COLOR);
    light.intensity = L.intensity;
    if (light.distance != null) light.distance = L.distance;
    if (light.angle != null) light.angle = degToRad(L.angle);
    if (light.penumbra != null) light.penumbra = L.penumbra;
    const helper = node.children.find(function (c) { return c.userData && c.userData.helper; });
    if (helper && helper.material) helper.material.color.set(node.userData.color || DEFAULT_LIGHT_COLOR);
  }

  function makeMesh(rec) {
    const type = rec.type;
    const geo = geometries[type];
    const color = parseColorOr(rec.color, DEFAULT_COLOR);
    const matSpec = normalizeMaterial(rec.material);
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      metalness: matSpec.metalness,
      roughness: matSpec.roughness,
      opacity: matSpec.opacity,
      transparent: matSpec.opacity < 0.999,
      side: type === 'plane' ? THREE.DoubleSide : THREE.FrontSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData = {
      id: rec.id || makeId(),
      type: type,
      name: rec.name || nextName(type, names()),
      color: color,
      material: matSpec,
      texture: normalizeTexture(rec.texture),
      locked: !!rec.locked,
      editable: true
    };
    mesh.name = mesh.userData.name;
    mesh.visible = rec.visible !== false;
    mesh.position.set(rec.position[0], rec.position[1], rec.position[2]);
    mesh.rotation.set(degToRad(rec.rotation[0]), degToRad(rec.rotation[1]), degToRad(rec.rotation[2]));
    mesh.scale.set(rec.scale[0], rec.scale[1], rec.scale[2]);
    applyTextureToMesh(mesh, mesh.userData.texture);
    return mesh;
  }

  function makeGroup(rec) {
    const g = new THREE.Group();
    g.userData = {
      id: rec.id || makeId(),
      type: 'group',
      name: rec.name || nextName('group', names()),
      color: parseColorOr(rec.color, '#94a3b8'),
      locked: !!rec.locked,
      editable: true
    };
    g.name = g.userData.name;
    g.visible = rec.visible !== false;
    g.position.set(rec.position[0], rec.position[1], rec.position[2]);
    g.rotation.set(degToRad(rec.rotation[0]), degToRad(rec.rotation[1]), degToRad(rec.rotation[2]));
    g.scale.set(rec.scale[0], rec.scale[1], rec.scale[2]);
    return g;
  }

  function makeLight(rec) {
    const type = rec.type;
    const color = parseColorOr(rec.color, DEFAULT_LIGHT_COLOR);
    const L = normalizeLight(rec, type);
    const root = new THREE.Group();
    let light;
    let helperGeo;
    if (type === 'light-point') {
      light = new THREE.PointLight(color, L.intensity, L.distance);
      helperGeo = geometries.lightPoint;
    } else if (type === 'light-spot') {
      light = new THREE.SpotLight(color, L.intensity, L.distance, degToRad(L.angle), L.penumbra);
      helperGeo = geometries.lightSpot;
    } else {
      light = new THREE.DirectionalLight(color, L.intensity);
      helperGeo = geometries.lightDir;
    }
    light.name = '__light';
    root.add(light);
    if (type === 'light-spot' || type === 'light-directional') {
      light.target.position.set(0, -1, 0);
      root.add(light.target);
    }
    const helper = new THREE.Mesh(helperGeo, new THREE.MeshBasicMaterial({ color: color }));
    helper.userData.helper = true;
    helper.userData.pickParent = true;
    if (type === 'light-spot') helper.rotation.x = Math.PI;
    root.add(helper);
    root.userData = {
      id: rec.id || makeId(),
      type: type,
      name: rec.name || nextName(type, names()),
      color: color,
      light: L,
      locked: !!rec.locked,
      editable: true
    };
    root.name = root.userData.name;
    root.visible = rec.visible !== false;
    root.position.set(rec.position[0], rec.position[1], rec.position[2]);
    root.rotation.set(degToRad(rec.rotation[0]), degToRad(rec.rotation[1]), degToRad(rec.rotation[2]));
    return root;
  }

  function makeNode(rec) {
    if (rec.type === 'group') return makeGroup(rec);
    if (isLightType(rec.type)) return makeLight(rec);
    return makeMesh(rec);
  }

  function pickTarget(obj) {
    let n = obj;
    while (n && n !== objects && n !== scene) {
      if (isEditable(n)) return n;
      n = n.parent;
    }
    return null;
  }

  function detachPivot() {
    transform.detach();
    if (pivot.parent) pivot.parent.remove(pivot);
    pivot.position.set(0, 0, 0);
    pivot.rotation.set(0, 0, 0);
    pivot.scale.set(1, 1, 1);
  }

  function attachGizmo() {
    detachPivot();
    const targets = transformTargets();
    if (targets.length === 0) {
      updateHelper();
      requestRender();
      return;
    }
    if (targets.length === 1) {
      transform.attach(targets[0]);
      updateHelper();
      requestRender();
      return;
    }
    const box = combinedBox(targets);
    const c = box ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
    pivot.position.copy(c);
    pivot.rotation.set(0, 0, 0);
    pivot.scale.set(1, 1, 1);
    scene.add(pivot);
    pivot.updateMatrixWorld(true);
    transform.attach(pivot);
    updateHelper();
    requestRender();
  }

  function setSelection(nodes, quiet) {
    const uniq = [];
    (nodes || []).forEach(function (n) {
      if (n && isEditable(n) && uniq.indexOf(n) < 0) uniq.push(n);
    });
    selection = uniq;
    attachGizmo();
    if (!quiet) emit('select');
  }

  function select(node, add, quiet) {
    if (!node) {
      setSelection([], quiet);
      return;
    }
    if (add) {
      const i = selection.indexOf(node);
      if (i >= 0) {
        const next = selection.slice();
        next.splice(i, 1);
        setSelection(next, quiet);
      } else {
        setSelection(selection.concat([node]), quiet);
      }
    } else {
      setSelection([node], quiet);
    }
  }

  function deselect(quiet) { setSelection([], quiet); }

  function addFromRecord(rec, doSelect) {
    const node = makeNode(rec);
    objects.add(node);
    if (doSelect) select(node);
    else requestRender();
    return node;
  }

  function addObject(type) {
    if (SHAPE_TYPES.indexOf(type) < 0 && LIGHT_TYPES.indexOf(type) < 0) return null;
    const off = nextOffset(occupiedXZ(), PLACE_STEP);
    const rec = {
      id: makeId(),
      type: type,
      name: nextName(type, names()),
      position: [off[0], sitHeight(type), off[1]],
      rotation: defaultRotationDeg(type),
      scale: [1, 1, 1],
      color: isLightType(type) ? DEFAULT_LIGHT_COLOR : DEFAULT_COLOR,
      visible: true,
      locked: false,
      parentId: null,
      material: Object.assign({}, DEFAULT_MATERIAL),
      texture: null
    };
    if (isLightType(type)) Object.assign(rec, normalizeLight({}, type));
    const node = addFromRecord(rec, true);
    emit('change');
    return node;
  }

  function disposeNode(node) {
    node.traverse(function (ch) {
      if (ch.material) {
        disposeMap(ch);
        if (ch.material.dispose && ch.geometry !== geometries[ch.userData && ch.userData.type]) {
          /* shared geo kept */
        }
        if (ch.material && ch.material.dispose) ch.material.dispose();
      }
    });
  }

  function removeNode(node) {
    if (!node) return false;
    const drop = [];
    if (node.userData.type === 'group') {
      walkEditable(node, function (c) { drop.push(c); });
    }
    drop.push(node);
    const nextSel = selection.filter(function (s) { return drop.indexOf(s) < 0 && s !== node; });
    if (node.parent) node.parent.remove(node);
    disposeNode(node);
    setSelection(nextSel, true);
    emit('change');
    return true;
  }

  function deleteSelected() {
    const roots = transformTargets();
    if (!roots.length) return false;
    roots.slice().forEach(function (n) { removeNode(n); });
    return true;
  }

  function cloneSubtree(node, nameSet) {
    const rec = recordOf(node);
    rec.id = makeId();
    rec.name = nextName(rec.type, nameSet);
    rec.parentId = null;
    nameSet.push(rec.name);
    const copy = makeNode(rec);
    if (node.userData.type === 'group') {
      node.children.forEach(function (ch) {
        if (isEditable(ch)) copy.add(cloneSubtree(ch, nameSet));
      });
    }
    return copy;
  }

  function duplicateSelected() {
    const roots = transformTargets();
    if (!roots.length) return null;
    const nameSet = names();
    const created = [];
    roots.forEach(function (n) {
      const copy = cloneSubtree(n, nameSet);
      copy.position.x += PLACE_STEP;
      const parent = (n.parent && isEditable(n.parent)) ? n.parent : objects;
      parent.add(copy);
      created.push(copy);
    });
    setSelection(created);
    emit('change');
    return created[0] || null;
  }

  function getProject() {
    const list = [];
    walkEditable(objects, function (n) { list.push(recordOf(n)); });
    return makeProject(list, {
      skyCustom: skyCustom,
      sky: skyColor,
      textures: textureStore
    });
  }

  function clearObjects() {
    detachPivot();
    selection = [];
    boxHelper.visible = false;
    while (objects.children.length) {
      const n = objects.children[0];
      objects.remove(n);
      disposeNode(n);
    }
  }

  function sortByParent(list) {
    const byId = new Map();
    list.forEach(function (o) { if (o.id) byId.set(o.id, o); });
    function depth(o) {
      let d = 0, cur = o, seen = new Set();
      while (cur && cur.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = byId.get(cur.parentId);
        d += 1;
      }
      return d;
    }
    return list.slice().sort(function (a, b) { return depth(a) - depth(b); });
  }

  function loadProject(project, selectIds) {
    clearObjects();
    project = project || makeProject([]);
    textureStore = {};
    if (project.textures && typeof project.textures === 'object') {
      Object.keys(project.textures).forEach(function (k) {
        const t = project.textures[k];
        if (t && t.dataURL) textureStore[k] = { dataURL: t.dataURL };
      });
    }
    skyCustom = !!project.skyCustom;
    if (skyCustom && project.sky) skyColor = project.sky;
    applyBackground();
    const list = sortByParent(project.objects || []);
    const created = new Map();
    list.forEach(function (rec) {
      const node = makeNode(rec);
      created.set(rec.id, node);
      const parent = rec.parentId && created.get(rec.parentId);
      (parent || objects).add(node);
    });
    const ids = Array.isArray(selectIds) ? selectIds : (selectIds ? [selectIds] : []);
    const nodes = ids.map(function (id) { return created.get(id) || findById(id); }).filter(Boolean);
    setSelection(nodes, true);
    requestRender();
    emit('select');
    emit('change');
  }

  function getState() {
    return {
      project: getProject(),
      selectedIds: selection.map(function (n) { return n.userData.id; })
    };
  }

  function setState(s) {
    s = s || {};
    loadProject(s.project || makeProject([]), s.selectedIds || s.selectedId || null);
  }

  function listObjects() {
    const out = [];
    function walk(root, depth) {
      root.children.forEach(function (c) {
        if (!isEditable(c)) return;
        out.push({
          id: c.userData.id,
          name: c.userData.name,
          type: c.userData.type,
          visible: c.visible !== false,
          locked: !!c.userData.locked,
          depth: depth,
          parentId: parentIdOf(c)
        });
        if (c.userData.type === 'group') walk(c, depth + 1);
      });
    }
    walk(objects, 0);
    return out;
  }

  function getSelected() { return primary(); }
  function getSelection() { return selection.slice(); }

  function getProps() {
    const n = primary();
    if (!n) return null;
    const rec = recordOf(n);
    rec.selectedCount = selection.length;
    rec.selectedIds = selection.map(function (o) { return o.userData.id; });
    rec.skyCustom = skyCustom;
    rec.sky = skyColor;
    return rec;
  }

  function applyProps(partial, live) {
    const node = primary();
    if (!node || !partial) return false;
    if (node.userData.locked && (partial.position || partial.rotation || partial.scale)) {
      /* allow name / visibility / material? still block transform */
    }
    if (partial.name != null) {
      const nm = String(partial.name).trim();
      if (nm) { node.userData.name = nm; node.name = nm; }
    }
    if (!node.userData.locked) {
      if (partial.position) node.position.set(partial.position[0], partial.position[1], partial.position[2]);
      if (partial.rotation) {
        node.rotation.set(degToRad(partial.rotation[0]), degToRad(partial.rotation[1]), degToRad(partial.rotation[2]));
      }
      if (partial.scale && !isLightType(node.userData.type)) {
        const sx = Math.max(0.01, Math.abs(Number(partial.scale[0])) || 0.01);
        const sy = Math.max(0.01, Math.abs(Number(partial.scale[1])) || 0.01);
        const sz = Math.max(0.01, Math.abs(Number(partial.scale[2])) || 0.01);
        node.scale.set(sx, sy, sz);
      }
    }
    if (partial.color) {
      const c = parseColorOr(partial.color, node.userData.color);
      node.userData.color = c;
      if (node.material && node.material.color) node.material.color.set(c);
      if (isLightType(node.userData.type)) applyLightProps(node);
    }
    if (partial.material && isShapeType(node.userData.type)) applyMaterial(node, partial.material);
    if (partial.texture !== undefined && isShapeType(node.userData.type)) applyTextureToMesh(node, partial.texture);
    if (partial.visible != null) node.visible = !!partial.visible;
    if (partial.locked != null) {
      node.userData.locked = !!partial.locked;
      attachGizmo();
    }
    if (isLightType(node.userData.type) && node.userData.light) {
      const cur = node.userData.light;
      const merged = normalizeLight(Object.assign({}, cur, {
        intensity: partial.intensity != null ? partial.intensity : cur.intensity,
        distance: partial.distance != null ? partial.distance : cur.distance,
        angle: partial.angle != null ? partial.angle : cur.angle,
        penumbra: partial.penumbra != null ? partial.penumbra : cur.penumbra
      }), node.userData.type);
      node.userData.light = merged;
      applyLightProps(node);
    }
    updateHelper();
    requestRender();
    if (!live) emit('change');
    else emit('objectChange');
    return true;
  }

  function setVisible(id, vis) {
    const n = findById(id);
    if (!n) return false;
    n.visible = !!vis;
    attachGizmo();
    emit('change');
    return true;
  }

  function setLocked(id, locked) {
    const n = findById(id);
    if (!n) return false;
    n.userData.locked = !!locked;
    attachGizmo();
    emit('change');
    return true;
  }

  function groupSelected() {
    const roots = transformTargets();
    if (roots.length < 2) return null;
    const box = combinedBox(roots);
    const c = box ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
    const g = makeGroup({
      id: makeId(),
      type: 'group',
      name: nextName('group', names()),
      position: [c.x, c.y, c.z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      color: '#94a3b8',
      visible: true,
      locked: false
    });
    /* Common parent if all share one, else the root. */
    let common = roots[0].parent;
    roots.forEach(function (n) {
      if (n.parent !== common) common = objects;
    });
    if (!common) common = objects;
    common.add(g);
    g.updateMatrixWorld(true);
    roots.forEach(function (n) { g.attach(n); });
    setSelection([g]);
    emit('change');
    return g;
  }

  function ungroupSelected() {
    const groups = selection.filter(function (n) { return n.userData.type === 'group'; });
    if (!groups.length) return false;
    const next = [];
    groups.forEach(function (g) {
      const dest = (g.parent && isEditable(g.parent) && g.parent.userData.type === 'group') ? g.parent : objects;
      const kids = g.children.filter(isEditable);
      kids.forEach(function (ch) { dest.attach(ch); next.push(ch); });
      if (g.parent) g.parent.remove(g);
    });
    setSelection(next);
    emit('change');
    return true;
  }

  function worldPos(node) {
    node.getWorldPosition(_tmpPos);
    return [_tmpPos.x, _tmpPos.y, _tmpPos.z];
  }

  function setWorldPosition(node, xyz) {
    _tmpPos.set(xyz[0], xyz[1], xyz[2]);
    if (node.parent) node.parent.worldToLocal(_tmpPos);
    node.position.copy(_tmpPos);
  }

  function alignSelected(axis, mode) {
    const roots = transformTargets();
    if (roots.length < 2) return false;
    const items = roots.map(function (n) {
      return { id: n.userData.id, box: boxOf(n), position: worldPos(n), node: n };
    });
    const map = (mode === 'distribute')
      ? requireDistribute(items, axis)
      : requireAlign(items, axis, mode);
    Object.keys(map).forEach(function (id) {
      const n = findById(id);
      if (n && !n.userData.locked) setWorldPosition(n, map[id]);
    });
    attachGizmo();
    emit('change');
    return true;
  }

  function requireAlign(items, axis, mode) {
    /* imported at top as alignItems — call via closure set later? import is already there */
    return alignItemsFn(items, axis, mode);
  }
  function requireDistribute(items, axis) {
    return distributeItemsFn(items, axis);
  }

  function applyObjectSnap() {
    const targets = transformTargets();
    if (!targets.length) return;
    const moving = combinedBox(targets);
    if (!moving) return;
    const movingBox = { min: [moving.min.x, moving.min.y, moving.min.z], max: [moving.max.x, moving.max.y, moving.max.z] };
    const others = [];
    walkEditable(objects, function (n) {
      if (targets.indexOf(n) >= 0) return;
      if (targets.some(function (t) { return isDescendant(n, t); })) return;
      if (!n.visible) return;
      others.push(boxOf(n));
    });
    const d = snapBoxes(movingBox, others, OBJECT_SNAP_THRESHOLD);
    if (!d[0] && !d[1] && !d[2]) return;
    targets.forEach(function (n) {
      n.getWorldPosition(_tmpPos);
      _tmpPos.x += d[0]; _tmpPos.y += d[1]; _tmpPos.z += d[2];
      setWorldPosition(n, [_tmpPos.x, _tmpPos.y, _tmpPos.z]);
    });
    if (transform.object === pivot) {
      pivot.position.x += d[0];
      pivot.position.y += d[1];
      pivot.position.z += d[2];
      pivot.updateMatrixWorld(true);
    }
  }

  function setMode(mode) {
    if (mode !== 'translate' && mode !== 'rotate' && mode !== 'scale') return getMode();
    transform.setMode(mode);
    requestRender();
    return mode;
  }
  function getMode() { return transform.getMode(); }

  function applySnap() {
    if (snapOn) {
      transform.setTranslationSnap(SNAP.translate);
      transform.setRotationSnap(degToRad(SNAP.rotateDeg));
      transform.setScaleSnap(SNAP.scale);
    } else {
      transform.setTranslationSnap(null);
      transform.setRotationSnap(null);
      transform.setScaleSnap(null);
    }
  }
  function setSnap(on) { snapOn = !!on; applySnap(); return snapOn; }
  function getSnap() { return snapOn; }

  function setView(name) {
    const dist = 12;
    camera.up.set(0, 1, 0);
    if (name === 'front') {
      camera.position.set(0, 2, dist); orbit.target.set(0, 0, 0); viewName = 'front';
    } else if (name === 'top') {
      camera.position.set(0, dist, 0.001); orbit.target.set(0, 0, 0); viewName = 'top';
    } else if (name === 'side') {
      camera.position.set(dist, 2, 0); orbit.target.set(0, 0, 0); viewName = 'side';
    } else {
      camera.position.set(8, 6, 10); orbit.target.set(0, 0, 0); viewName = 'perspective';
    }
    orbit.update();
    requestRender();
    return viewName;
  }
  function getView() { return viewName; }

  function frameSelected() {
    const box = combinedBox(selection.length ? selection : objects.children.filter(isEditable));
    if (!box) { setView(viewName === 'perspective' ? 'perspective' : viewName); return; }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.5);
    const fov = camera.fov * Math.PI / 180;
    let dist = (maxDim * 0.65) / Math.tan(fov / 2);
    dist = Math.max(dist * 1.55, 2);
    const dir = camera.position.clone().sub(orbit.target);
    if (dir.lengthSq() < 1e-6) dir.set(0.55, 0.45, 0.7);
    dir.normalize();
    camera.position.copy(center).addScaledVector(dir, dist);
    orbit.target.copy(center);
    orbit.update();
    requestRender();
  }

  function collectMeshes(root) {
    const list = [];
    root.traverse(function (n) {
      if (n.isMesh && n.visible && !(n.userData && n.userData.helper)) list.push(n);
    });
    return list;
  }

  function pick(event, add) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointer.set(x, y);
    raycaster.setFromCamera(pointer, camera);
    const meshes = collectMeshes(objects);
    const hits = raycaster.intersectObjects(meshes, false);
    for (let i = 0; i < hits.length; i++) {
      const t = pickTarget(hits[i].object);
      if (!t) continue;
      if (t.userData.locked && !add) { select(t, false); return; }
      select(t, add);
      return;
    }
    if (!add) deselect();
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    downOk = true;
    downX = e.clientX;
    downY = e.clientY;
    downAdd = !!(e.shiftKey || e.ctrlKey || e.metaKey);
  }

  function onPointerUp(e) {
    if (e.button !== 0 || !downOk) return;
    downOk = false;
    if (transform.dragging) return;
    if (transform.axis) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (dx * dx + dy * dy > 25) return;
    pick(e, downAdd || e.shiftKey || e.ctrlKey || e.metaKey);
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  orbit.addEventListener('change', requestRender);

  transform.addEventListener('change', requestRender);
  transform.addEventListener('mouseDown', function () {
    const targets = transformTargets();
    dragStarts = targets.map(function (o) {
      return {
        obj: o,
        world: o.matrixWorld.clone(),
        parentWorldInv: new THREE.Matrix4().copy(o.parent.matrixWorld).invert()
      };
    });
    if (transform.object === pivot) {
      pivotStartInv = new THREE.Matrix4().copy(pivot.matrixWorld).invert();
    } else {
      pivotStartInv = null;
    }
  });
  transform.addEventListener('objectChange', function () {
    if (dragStarts && dragStarts.length && transform.object === pivot && pivotStartInv) {
      const delta = _tmpMat.copy(pivot.matrixWorld).multiply(pivotStartInv);
      dragStarts.forEach(function (s) {
        const newW = _tmpMat2.copy(delta).multiply(s.world);
        const local = s.parentWorldInv.clone().multiply(newW);
        local.decompose(s.obj.position, s.obj.quaternion, s.obj.scale);
      });
    }
    updateHelper();
    requestRender();
    emit('objectChange');
  });
  transform.addEventListener('dragging-changed', function (e) {
    orbit.enabled = !e.value;
  });
  transform.addEventListener('mouseUp', function () {
    orbit.enabled = true;
    if (snapOn && transform.getMode() === 'translate') applyObjectSnap();
    dragStarts = null;
    pivotStartInv = null;
    attachGizmo();
    emit('change');
  });

  function resize() {
    const w = Math.max(1, viewportEl.clientWidth || 1);
    const h = Math.max(1, viewportEl.clientHeight || 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(w, h, false);
    requestRender();
  }

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(resize);
    ro.observe(viewportEl);
  }
  window.addEventListener('resize', resize);
  resize();

  function applyBackground() {
    if (skyCustom) {
      const c = new THREE.Color(skyColor);
      renderer.setClearColor(c, 1);
      scene.background = c;
    } else {
      const t = THEME_VIEW[lastTheme];
      renderer.setClearColor(t.bg, 1);
      scene.background = new THREE.Color(t.bg);
    }
  }

  function setTheme(eff) {
    lastTheme = (eff === 'dark') ? 'dark' : 'light';
    const t = THEME_VIEW[lastTheme];
    applyBackground();
    scene.remove(grid);
    if (grid.geometry) grid.geometry.dispose();
    const gm = grid.material;
    if (Array.isArray(gm)) gm.forEach(function (m) { if (m) m.dispose(); });
    else if (gm) gm.dispose();
    grid = new THREE.GridHelper(20, 20, t.gridCenter, t.grid);
    grid.name = '__grid';
    scene.add(grid);
    boxHelper.material.color.setHex(t.helper);
    requestRender();
  }

  function setSky(color, custom) {
    skyCustom = !!custom;
    if (color) skyColor = parseColorOr(color, skyColor);
    applyBackground();
    requestRender();
    emit('change');
  }

  function getSky() {
    return { skyCustom: skyCustom, sky: skyColor };
  }

  function putTexture(id, dataURL) {
    textureStore[id] = { dataURL: dataURL };
  }

  function webglOk() {
    try { return !!(renderer.getContext()); } catch (e) { return false; }
  }

  applySnap();
  setTheme('light');
  requestRender();

  return {
    addPrimitive: addObject,
    addObject: addObject,
    deleteSelected: deleteSelected,
    duplicateSelected: duplicateSelected,
    groupSelected: groupSelected,
    ungroupSelected: ungroupSelected,
    alignSelected: alignSelected,
    setVisible: setVisible,
    setLocked: setLocked,
    selectById: function (id, add) { const m = findById(id); if (m) select(m, !!add); return m; },
    deselect: function () { deselect(); },
    getSelected: getSelected,
    getSelection: getSelection,
    getProps: getProps,
    applyProps: applyProps,
    listObjects: listObjects,
    getProject: getProject,
    loadProject: loadProject,
    getState: getState,
    setState: setState,
    setMode: setMode,
    getMode: getMode,
    setSnap: setSnap,
    getSnap: getSnap,
    setView: setView,
    getView: getView,
    frameSelected: frameSelected,
    setTheme: setTheme,
    setSky: setSky,
    getSky: getSky,
    putTexture: putTexture,
    requestRender: requestRender,
    resize: resize,
    webglOk: webglOk,
    isDragging: function () { return !!transform.dragging; }
  };
}

