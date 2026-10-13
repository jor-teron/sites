/**
 * File: threejs-viewer-v2.js
 * Project: threejs-viewer-v2
 * Role: Viewer + runner. Runs pasted/dropped/URL-loaded Three.js code as a real ES module (blob URL)
 * when it has import/export, otherwise as plain code with THREE, scene, hero, setModel(), setAnimations(), setStatus()
 * and box/cyl/sph/cone/orb/cap/ring/cone2 helpers. Shows every error (syntax, runtime, async) with a line number.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (id) => document.getElementById(id);
const view = $('view'), editor = $('editor'), statusEl = $('status'), errorsEl = $('errors');
const STORAGE_KEY = 'threejs-viewer-v2-code';

const DEFAULT_CODE = `// Plain code: THREE, scene, hero, setModel(), setStatus() and helpers are ready.
// Or paste module code with import/export (e.g. a repo asset) — it runs as a real module.
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x3a8ee6, roughness: 0.4, metalness: 0.2 })
);
cube.position.y = 0.5;
hero.add(cube);
hero.add(sph(0.3, 0xffaa33, 0, 1.3, 0, { metal: 0.6, rough: 0.3 }));
setStatus('Cube ready');
`;

/* ---------------- scene ---------------- */
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d16);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
camera.position.set(3, 2, 4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
const base = [new THREE.HemisphereLight(0xffffff, 0x334455, 1.2), new THREE.DirectionalLight(0xffffff, 2)];
base[1].position.set(4, 8, 5);
const grid = new THREE.GridHelper(10, 20, 0x5577aa, 0x263048);
base.push(grid);
base.forEach((o) => scene.add(o));
const content = new THREE.Group(); content.name = 'content';
scene.add(content);
let hero = null;

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
new ResizeObserver(resize).observe(view);
document.getElementById('btn-code').onclick = (e) => {
  const hidden = document.getElementById('app').classList.toggle('code-hidden');
  e.target.textContent = hidden ? 'Show code' : 'Hide code';
};
/* ---------------- animation ---------------- */
let mixer = null, clips = [], action = null, paused = false;
const clock = new THREE.Clock();
function stopAnim() { if (mixer) { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); } mixer = null; clips = []; action = null; updateClipUI(); }
function addClips(list, root) {
  if (!Array.isArray(list)) return;
  for (const c of list) if (c && Array.isArray(c.tracks) && !clips.includes(c)) clips.push(c);
  if (!clips.length) return;
  if (!mixer) mixer = new THREE.AnimationMixer(content);
  if (root && !root.animations?.length) root.animations = list;
}
function setAnimations(list) { addClips(list); startAnim(); return clips; }
function playClip(i) {
  if (!mixer || !clips[i]) return;
  if (action) action.stop();
  action = mixer.clipAction(clips[i]); action.reset().play(); action.paused = paused;
  $('clip').value = String(i);
}
function startAnim() {
  updateClipUI();
  if (!clips.length) return;
  const i = clips.findIndex((c) => c.name === 'idle');
  playClip(i >= 0 ? i : 0);
}
function updateClipUI() {
  const sel = $('clip'); sel.innerHTML = '';
  clips.forEach((c, i) => sel.add(new Option(c.name || `clip ${i + 1}`, String(i))));
  $('anim').hidden = !clips.length;
}
$('clip').onchange = (e) => playClip(+e.target.value);
$('btn-play').onclick = () => {
  paused = !paused; if (action) action.paused = paused;
  $('btn-play').textContent = paused ? '▶' : '❚❚';
};
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta(); if (mixer) mixer.update(dt);
  if ($('opt-spin').checked) content.rotation.y += 0.005;
  controls.update(); renderer.render(scene, camera);
});

/* ---------------- helpers for plain code ---------------- */
function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness: o.metal ?? 0, roughness: o.rough ?? 0.6,
    emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? (o.emissive != null ? 1 : 0), flatShading: !!o.flat });
}
function place(geo, color, x, y, z, o = {}, s) {
  const m = new THREE.Mesh(geo, mat(color, o));
  m.position.set(x || 0, y || 0, z || 0);
  if (s) m.scale.set(s[0] ?? 1, s[1] ?? 1, s[2] ?? 1);
  if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
  return m;
}
const helpers = {
  box: (w, h, d, c, x, y, z, o = {}) => place(new THREE.BoxGeometry(w, h, d), c, x, y, z, o),
  cyl: (rt, rb, h, c, x, y, z, o = {}) => place(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 16), c, x, y, z, o),
  sph: (r, c, x, y, z, o = {}) => place(new THREE.SphereGeometry(r, o.seg ?? 20, o.seg ?? 20), c, x, y, z, o),
  cone: (r, h, c, x, y, z, o = {}) => place(new THREE.ConeGeometry(r, h, o.seg ?? 12), c, x, y, z, o),
  orb: (r, c, x, y, z, sx, sy, sz, o = {}) => place(new THREE.SphereGeometry(r, o.seg ?? 24, o.seg ?? 24), c, x, y, z, o, [sx, sy, sz]),
  cap: (r, len, c, x, y, z, o = {}) => place(new THREE.CapsuleGeometry(r, len, o.seg ?? 8, o.seg2 ?? 12), c, x, y, z, o),
  ring: (r, t, c, x, y, z, o = {}) => place(new THREE.TorusGeometry(r, t, o.seg ?? 8, o.seg2 ?? 24), c, x, y, z, o),
  cone2: (r, h, c, x, y, z, sx, sy, sz, o = {}) => place(new THREE.ConeGeometry(r, h, o.seg ?? 16), c, x, y, z, o, [sx, sy, sz]),
};

/* ---------------- status + errors ---------------- */
function setStatus(t, err) { statusEl.textContent = String(t); statusEl.className = err ? 'err' : 'ok'; }
let currentLabel = 'code', currentSrc = '', currentBlob = '';
function lineOf(err) {
  if (err && err.__line) return [err.__line, err.__col];
  const st = String((err && err.stack) || '');
  const pats = [];
  if (currentBlob) pats.push(new RegExp(currentBlob.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':(\\d+):(\\d+)'));
  pats.push(/user-code\.js:(\d+):(\d+)/);
  for (const p of pats) { const m = st.match(p); if (m) return p.source.includes('user-code') ? [m[1] - 2, +m[2]] : [+m[1], +m[2]]; }
  return null;
}
function showError(err, where = '') {
  const lc = lineOf(err);
  const name = (err && err.name) || 'Error', msg = (err && err.message) || String(err);
  let out = `✗ ${where}${name}: ${msg}`;
  if (lc) {
    const lines = currentSrc.split('\n');
    out = `✗ ${where}${name} at line ${lc[0]}${lc[1] ? ', col ' + lc[1] : ''} (${currentLabel})\n  ${msg}\n\n`;
    for (let i = Math.max(1, lc[0] - 2); i <= Math.min(lines.length, lc[0] + 2); i++)
      out += `${i === lc[0] ? '▶' : ' '} ${String(i).padStart(4)} | ${lines[i - 1]}\n`;
  } else if (err && err.stack) out += '\n\n' + String(err.stack).split('\n').slice(1, 6).join('\n');
  errorsEl.textContent = (errorsEl.hidden ? '' : errorsEl.textContent + '\n\n') + out;
  errorsEl.hidden = false;
  setStatus(`✗ ${name}${lc ? ' at line ' + lc[0] : ''}: ${msg}`, true);
  console.error(err);
}
function clearErrors() { errorsEl.textContent = ''; errorsEl.hidden = true; }
let probing = 0;
addEventListener('error', (e) => { if (e.__ours || probing) return; showError(e.error || { name: 'Error', message: e.message, __line: e.lineno, __col: e.colno }, 'Uncaught (async) '); });
addEventListener('unhandledrejection', (e) => showError(e.reason, 'Unhandled promise rejection: '));

/* ---------------- model management ---------------- */
function disposeTree(o) {
  o.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    const ms = Array.isArray(c.material) ? c.material : c.material ? [c.material] : [];
    ms.forEach((m) => { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); });
  });
}
function clearContent() {
  for (const c of [...content.children]) { content.remove(c); disposeTree(c); }
  content.rotation.set(0, 0, 0);
  stopAnim();
}
function setModel(obj) {
  if (!obj || !obj.isObject3D) throw new TypeError('setModel() needs a THREE.Object3D (Mesh, Group, Scene...)');
  for (const c of [...content.children]) if (c !== hero) { content.remove(c); disposeTree(c); }
  stopAnim();
  content.add(obj);
  if (obj.animations?.length) setAnimations(obj.animations);
  return obj;
}
async function adopt(v, depth = 0) {
  if (v == null || depth > 3) return;
  if (typeof v.then === 'function') return adopt(await v, depth + 1);
  if (v.isObject3D) { if (v.parent !== content) content.add(v); addClips(v.animations); return; }
  if (typeof v === 'function') return adopt(await v(THREE, scene), depth + 1);
  if (typeof v.build === 'function') return adopt(await v.build(THREE, scene), depth + 1);
  if (typeof v.create === 'function') return adopt(await v.create(THREE, scene), depth + 1);
  if (Array.isArray(v.animations)) for (const k of ['model', 'mesh', 'group', 'object', 'scene']) if (v[k] && v[k].isObject3D) { addClips(v.animations, v[k]); return adopt(v[k], depth + 1); }
  for (const k of ['model', 'mesh', 'group', 'object', 'scene']) if (v[k] && v[k].isObject3D) return adopt(v[k], depth + 1);
}
function stats() {
  let tris = 0, meshes = 0;
  content.traverse((c) => {
    if (!c.isMesh || !c.geometry) return;
    meshes++;
    const g = c.geometry, n = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
    tris += (n / 3) * (c.isInstancedMesh ? c.count : 1);
    const ms = Array.isArray(c.material) ? c.material : [c.material];
    ms.forEach((m) => { if (m && 'wireframe' in m) m.wireframe = $('opt-wire').checked; });
  });
  $('tris').textContent = `${Math.round(tris).toLocaleString()} tris · ${meshes} meshes`;
}
function frame() {
  const b = new THREE.Box3().setFromObject(content);
  if (b.isEmpty()) return;
  const size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
  const r = Math.max(size.length() / 2, 0.01);
  const d = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.1;
  const dir = new THREE.Vector3(1, 0.6, 1.3).normalize();
  camera.position.copy(c).addScaledVector(dir, d);
  camera.near = d / 200; camera.far = d * 50; camera.updateProjectionMatrix();
  controls.target.copy(c); controls.update();
  grid.scale.setScalar(Math.max(r / 2, 0.05)); grid.position.y = b.min.y;
}

/* ---------------- running ---------------- */
const isModule = (src) => /^\s*(import\s*[\w*{'"]|export\s)/m.test(src);
let baseURL = location.href;
function rewriteRelative(src, base) {
  return src.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\2/g,
    (m, pre, q, spec) => pre + q + new URL(spec, base).href + q);
}
function syntaxLine(src, asModule) {
  // A failed parse in a <script> element reports the exact line through window 'error'.
  probing++;
  return new Promise((resolve) => {
    const code = asModule ? src : 'void function(){' + src + '\n}';
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const s = document.createElement('script');
    if (asModule) s.type = 'module';
    let done = false;
    const onErr = (e) => {
      if (e.filename !== url) return;
      e.__ours = true; e.stopImmediatePropagation(); e.preventDefault();
      done = true; resolve({ line: e.lineno, col: e.colno, message: e.message });
    };
    addEventListener('error', onErr, true);
    s.src = url;
    s.onload = s.onerror = () => setTimeout(() => { removeEventListener('error', onErr, true); s.remove(); URL.revokeObjectURL(url); probing--; if (!done) resolve(null); }, 30);
    document.head.appendChild(s);
  });
}
async function run(label) {
  const src = editor.value;
  currentSrc = src; currentLabel = label || 'editor';
  clearErrors(); setStatus('Running…');
  clearContent();
  hero = new THREE.Group(); hero.name = 'hero'; content.add(hero);
  const before = new Set(scene.children);
  const t0 = performance.now();
  try {
    if (isModule(src)) {
      currentBlob = URL.createObjectURL(new Blob([rewriteRelative(src, baseURL)], { type: 'text/javascript' }));
      window.__viewer = { THREE, scene, hero, setModel, setAnimations, setStatus, camera, renderer, ...helpers };
      let mod;
      try { mod = await import(currentBlob); }
      catch (e) {
        if (e instanceof SyntaxError) { const p = await syntaxLine(src, true); if (p) { e.__line = p.line; e.__col = p.col; } }
        throw e;
      }
      const v = mod.default ?? mod.build ?? mod.create ?? Object.values(mod).find((x) => x && (x.isObject3D || typeof x === 'function'));
      await adopt(v);
    } else {
      currentBlob = '';
      const names = ['THREE', 'scene', 'hero', 'setModel', 'setAnimations', 'setStatus', 'camera', 'renderer', 'controls', ...Object.keys(helpers)];
      let fn;
      try { fn = new Function(...names, src + '\n//# sourceURL=user-code.js'); }
      catch (e) { const p = await syntaxLine(src, false); if (p) { e.__line = p.line; e.__col = p.col; } throw e; }
      await adopt(fn(THREE, scene, hero, setModel, setAnimations, setStatus, camera, renderer, controls, ...Object.values(helpers)));
    }
    // anything the code added straight to the scene becomes part of the model
    for (const c of [...scene.children]) if (!before.has(c)) content.add(c);
    if (!hero.children.length) content.remove(hero);
    stats(); frame(); startAnim();
    if (statusEl.textContent === 'Running…' || statusEl.className !== 'ok')
      setStatus(`✓ Ran ${currentLabel} in ${Math.round(performance.now() - t0)} ms` + (clips.length ? ` · ${clips.length} clip${clips.length > 1 ? 's' : ''}` : ''));
  } catch (e) { showError(e); stats(); frame(); }
}

/* ---------------- UI ---------------- */
$('btn-run').onclick = () => run(baseURL === location.href ? 'editor' : baseURL.split('/').pop());
editor.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('btn-run').click(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
  else if (e.key === 'Tab') { e.preventDefault(); editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end'); }
});
function save() { localStorage.setItem(STORAGE_KEY, editor.value); setStatus('Saved to this browser'); }
$('btn-save').onclick = save;
$('btn-reset').onclick = () => {
  if (!confirm('Reset to the default cube code and forget the saved code?')) return;
  localStorage.removeItem(STORAGE_KEY); editor.value = DEFAULT_CODE; baseURL = location.href; run('default');
};
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
$('btn-dl').onclick = () => download(new Blob([editor.value], { type: 'text/javascript' }), 'model.js');
$('btn-shot').onclick = () => { renderer.render(scene, camera); renderer.domElement.toBlob((b) => download(b, 'threejs-viewer.png')); };
$('btn-glb').onclick = async () => {
  try {
    const glb = await new GLTFExporter().parseAsync(content, { binary: true, animations: clips });
    download(new Blob([glb], { type: 'model/gltf-binary' }), 'model.glb');
    setStatus(`Exported model.glb (${(glb.byteLength / 1024).toFixed(0)} KB, ${clips.length} clips)`);
  } catch (e) { showError(e, 'Export GLB: '); }
};
$('btn-gltf').onclick = async () => {
  try {
    const json = JSON.stringify(await new GLTFExporter().parseAsync(content, { binary: false, animations: clips }));
    download(new Blob([json], { type: 'model/gltf+json' }), 'model.gltf');
    setStatus(`Exported model.gltf (${(json.length / 1024).toFixed(0)} KB, ${clips.length} clips)`);
  } catch (e) { showError(e, 'Export glTF: '); }
};
$('btn-frame').onclick = frame;
$('opt-grid').onchange = (e) => (grid.visible = e.target.checked);
$('opt-wire').onchange = stats;
async function loadFile(f) {
  editor.value = await f.text(); baseURL = location.href; run(f.name);
}
$('btn-open').onclick = () => $('file').click();
$('file').onchange = (e) => e.target.files[0] && loadFile(e.target.files[0]);
const dz = $('dropzone');
addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('on'); });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) dz.classList.remove('on'); });
addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('on'); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
$('btn-url').onclick = async () => {
  const u = $('url').value.trim() || $('url').placeholder;
  const abs = new URL(u, location.href).href;
  try {
    const r = await fetch(abs);
    if (!r.ok) throw new Error(`HTTP ${r.status} loading ${abs}`);
    editor.value = await r.text(); baseURL = abs; run(abs.split('/').pop());
  } catch (e) { currentSrc = ''; clearErrors(); showError(e, 'Load URL: '); }
};
$('url').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-url').click(); });

// Saved code is shown but never auto-run; only the built-in default runs on start.
const saved = localStorage.getItem(STORAGE_KEY);
if (saved) { editor.value = saved; setStatus('Loaded your saved code — press Run to run it.'); }
else { editor.value = DEFAULT_CODE; run('default'); }
