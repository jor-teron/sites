/* 3D Builder — tb_scene.js: viewport, primitives, pick, gizmo, views. TD1
   Renders on demand only (no continuous loop). three.js r170, local vendor. */

import * as THREE from 'three';
import { OrbitControls } from './vendor/three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from './vendor/three/examples/jsm/controls/TransformControls.js';
import {
  TYPES, DEFAULT_COLOR, SNAP, PLACE_STEP,
  sitHeight, defaultRotationDeg, nextName, nextOffset,
  radToDeg, degToRad, roundN, makeProject, parseColor
} from './tb_io.js';

const SEG = { sphereW: 24, sphereH: 16, cyl: 24, torusR: 12, torusT: 24 };

const THEME_VIEW = {
  light: { bg: 0xe8eef5, grid: 0xcbd5e1, gridCenter: 0x64748b, helper: 0xd97706 },
  dark: { bg: 0x0f172a, grid: 0x334155, gridCenter: 0x94a3b8, helper: 0xfbbf24 }
};

function newId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) { /* ok */ }
  return 'o_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function createScene(viewportEl, hooks) {
  hooks = hooks || {};

  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, SEG.sphereW, SEG.sphereH),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, SEG.cyl),
    cone: new THREE.ConeGeometry(0.5, 1, SEG.cyl),
    plane: new THREE.PlaneGeometry(1, 1),
    torus: new THREE.TorusGeometry(0.5, 0.2, SEG.torusR, SEG.torusT)
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(8, 6, 10);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power'
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
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.15);
  dir.position.set(6, 10, 4);
  dir.castShadow = false;
  scene.add(dir);

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

  let selected = null;
  let snapOn = false;
  let viewName = 'perspective';
  let raf = 0;
  let lastTheme = 'light';
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downX = 0, downY = 0, downOk = false;

  function requestRender() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      if (selected) boxHelper.update();
      renderer.render(scene, camera);
    });
  }

  function emit(kind) {
    if (kind === 'select' && hooks.onSelect) hooks.onSelect(selected);
    if (kind === 'change' && hooks.onChange) hooks.onChange();
    if (kind === 'objectChange' && hooks.onObjectChange) hooks.onObjectChange(selected);
  }

  function updateHelper() {
    if (!selected) {
      boxHelper.visible = false;
      return;
    }
    boxHelper.setFromObject(selected);
    boxHelper.visible = true;
  }

  function recordOf(mesh) {
    const e = mesh.rotation;
    return {
      id: mesh.userData.id,
      type: mesh.userData.type,
      name: mesh.userData.name,
      position: [roundN(mesh.position.x, 4), roundN(mesh.position.y, 4), roundN(mesh.position.z, 4)],
      rotation: [roundN(radToDeg(e.x), 3), roundN(radToDeg(e.y), 3), roundN(radToDeg(e.z), 3)],
      scale: [roundN(mesh.scale.x, 4), roundN(mesh.scale.y, 4), roundN(mesh.scale.z, 4)],
      color: mesh.userData.color
    };
  }

  function names() {
    return objects.children.map(function (m) { return m.userData.name; });
  }

  function occupiedXZ() {
    return objects.children.map(function (m) { return [m.position.x, m.position.z]; });
  }

  function makeMesh(rec) {
    const type = rec.type;
    const geo = geometries[type];
    const color = parseColor(rec.color);
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      metalness: 0.12,
      roughness: 0.55,
      side: type === 'plane' ? THREE.DoubleSide : THREE.FrontSide
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData = {
      id: rec.id || newId(),
      type: type,
      name: rec.name || nextName(type, names()),
      color: color,
      editable: true
    };
    mesh.name = mesh.userData.name;
    mesh.position.set(rec.position[0], rec.position[1], rec.position[2]);
    mesh.rotation.set(degToRad(rec.rotation[0]), degToRad(rec.rotation[1]), degToRad(rec.rotation[2]));
    mesh.scale.set(rec.scale[0], rec.scale[1], rec.scale[2]);
    return mesh;
  }

  function select(mesh, quiet) {
    selected = mesh || null;
    if (selected) {
      transform.attach(selected);
      updateHelper();
    } else {
      transform.detach();
      boxHelper.visible = false;
    }
    requestRender();
    if (!quiet) emit('select');
  }

  function deselect(quiet) {
    select(null, quiet);
  }

  function findById(id) {
    if (!id) return null;
    for (let i = 0; i < objects.children.length; i++) {
      if (objects.children[i].userData.id === id) return objects.children[i];
    }
    return null;
  }

  function addFromRecord(rec, doSelect) {
    const mesh = makeMesh(rec);
    objects.add(mesh);
    if (doSelect) select(mesh);
    else requestRender();
    return mesh;
  }

  function addPrimitive(type) {
    if (TYPES.indexOf(type) < 0) return null;
    const off = nextOffset(occupiedXZ(), PLACE_STEP);
    const rec = {
      id: newId(),
      type: type,
      name: nextName(type, names()),
      position: [off[0], sitHeight(type), off[1]],
      rotation: defaultRotationDeg(type),
      scale: [1, 1, 1],
      color: DEFAULT_COLOR
    };
    const mesh = addFromRecord(rec, true);
    emit('change');
    return mesh;
  }

  function removeMesh(mesh) {
    if (!mesh) return false;
    const wasSel = selected === mesh;
    objects.remove(mesh);
    if (mesh.material) mesh.material.dispose();
    if (wasSel) deselect();
    else requestRender();
    emit('change');
    return true;
  }

  function deleteSelected() {
    if (!selected) return false;
    return removeMesh(selected);
  }

  function duplicateSelected() {
    if (!selected) return null;
    const rec = recordOf(selected);
    rec.id = newId();
    rec.name = nextName(rec.type, names());
    rec.position = [rec.position[0] + PLACE_STEP, rec.position[1], rec.position[2]];
    const mesh = addFromRecord(rec, true);
    emit('change');
    return mesh;
  }

  function getProject() {
    return makeProject(objects.children.map(recordOf));
  }

  function clearObjects() {
    transform.detach();
    selected = null;
    boxHelper.visible = false;
    while (objects.children.length) {
      const m = objects.children[0];
      objects.remove(m);
      if (m.material) m.material.dispose();
    }
  }

  function loadProject(project, selectId) {
    clearObjects();
    const list = (project && project.objects) || [];
    for (let i = 0; i < list.length; i++) addFromRecord(list[i], false);
    if (selectId) {
      const m = findById(selectId);
      if (m) select(m, true);
      else deselect(true);
    } else {
      deselect(true);
    }
    requestRender();
    emit('select');
    emit('change');
  }

  function getState() {
    return { project: getProject(), selectedId: selected ? selected.userData.id : null };
  }

  function setState(s) {
    s = s || {};
    loadProject(s.project || makeProject([]), s.selectedId || null);
  }

  function listObjects() {
    return objects.children.map(function (m) {
      return { id: m.userData.id, name: m.userData.name, type: m.userData.type };
    });
  }

  function getSelected() { return selected; }

  function getProps() {
    if (!selected) return null;
    return recordOf(selected);
  }

  function applyProps(partial, live) {
    if (!selected || !partial) return false;
    if (partial.name != null) {
      const n = String(partial.name).trim();
      if (n) {
        selected.userData.name = n;
        selected.name = n;
      }
    }
    if (partial.position) {
      selected.position.set(partial.position[0], partial.position[1], partial.position[2]);
    }
    if (partial.rotation) {
      selected.rotation.set(
        degToRad(partial.rotation[0]),
        degToRad(partial.rotation[1]),
        degToRad(partial.rotation[2])
      );
    }
    if (partial.scale) {
      const sx = Math.max(0.01, Math.abs(Number(partial.scale[0])) || 0.01);
      const sy = Math.max(0.01, Math.abs(Number(partial.scale[1])) || 0.01);
      const sz = Math.max(0.01, Math.abs(Number(partial.scale[2])) || 0.01);
      selected.scale.set(sx, sy, sz);
    }
    if (partial.color) {
      const c = parseColor(partial.color);
      selected.userData.color = c;
      selected.material.color.set(c);
    }
    updateHelper();
    requestRender();
    if (!live) emit('change');
    else emit('objectChange');
    return true;
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

  function setSnap(on) {
    snapOn = !!on;
    applySnap();
    return snapOn;
  }

  function getSnap() { return snapOn; }

  function setView(name) {
    const dist = 12;
    camera.up.set(0, 1, 0);
    if (name === 'front') {
      camera.position.set(0, 2, dist);
      orbit.target.set(0, 0, 0);
      viewName = 'front';
    } else if (name === 'top') {
      camera.position.set(0, dist, 0.001);
      orbit.target.set(0, 0, 0);
      viewName = 'top';
    } else if (name === 'side') {
      camera.position.set(dist, 2, 0);
      orbit.target.set(0, 0, 0);
      viewName = 'side';
    } else {
      camera.position.set(8, 6, 10);
      orbit.target.set(0, 0, 0);
      viewName = 'perspective';
    }
    orbit.update();
    requestRender();
    return viewName;
  }

  function getView() { return viewName; }

  function frameSelected() {
    const box = new THREE.Box3();
    if (selected) box.setFromObject(selected);
    else if (objects.children.length) box.setFromObject(objects);
    else {
      setView(viewName === 'perspective' ? 'perspective' : viewName);
      return;
    }
    if (box.isEmpty()) return;
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

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointer.set(x, y);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(objects.children, false);
    if (hits.length) select(hits[0].object);
    else deselect();
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    downOk = true;
    downX = e.clientX;
    downY = e.clientY;
  }

  function onPointerUp(e) {
    if (e.button !== 0 || !downOk) return;
    downOk = false;
    if (transform.dragging) return;
    if (transform.axis) return;
    const dx = e.clientX - downX;
    const dy = e.clientY - downY;
    if (dx * dx + dy * dy > 25) return;
    pick(e);
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  orbit.addEventListener('change', requestRender);

  transform.addEventListener('change', requestRender);
  transform.addEventListener('objectChange', function () {
    updateHelper();
    requestRender();
    emit('objectChange');
  });
  transform.addEventListener('dragging-changed', function (e) {
    orbit.enabled = !e.value;
  });
  transform.addEventListener('mouseUp', function () {
    orbit.enabled = true;
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

  function setTheme(eff) {
    lastTheme = (eff === 'dark') ? 'dark' : 'light';
    const t = THEME_VIEW[lastTheme];
    renderer.setClearColor(t.bg, 1);
    scene.background = new THREE.Color(t.bg);
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

  function webglOk() {
    try { return !!(renderer.getContext()); } catch (e) { return false; }
  }

  applySnap();
  setTheme('light');
  requestRender();

  return {
    addPrimitive: addPrimitive,
    deleteSelected: deleteSelected,
    duplicateSelected: duplicateSelected,
    selectById: function (id) { const m = findById(id); if (m) select(m); return m; },
    deselect: function () { deselect(); },
    getSelected: getSelected,
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
    requestRender: requestRender,
    resize: resize,
    webglOk: webglOk,
    isDragging: function () { return !!transform.dragging; }
  };
}
