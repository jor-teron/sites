// Neon Fist 3D — Hero Builder v0.5: scene, camera, UI, save.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SKINS, PICKERS, HAIR_COLORS, DEFAULT_HERO, buildHero, randomHero, sanitizeHero } from './hero.js';

const LS_KEY = 'nf3d.lastHero';
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0618');
scene.fog = new THREE.Fog('#0a0618', 6, 14);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
camera.position.set(1.6, 1.5, 3.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0); controls.enableDamping = true; controls.enablePan = false;
controls.minDistance = 1.2; controls.maxDistance = 7; controls.maxPolarAngle = Math.PI * 0.55;

// soft studio: warm key with soft shadows, cool fill, neon rims behind
scene.add(new THREE.HemisphereLight('#b8b0ff', '#2a1a30', 0.55));
const key = new THREE.DirectionalLight('#fff1e4', 2.4); key.position.set(1.8, 3.6, 2.6); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 4; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 2.3, bottom: -0.2, near: 0.5, far: 9 }); scene.add(key);
const fill = new THREE.DirectionalLight('#9fb8ff', 0.7); fill.position.set(-2.5, 1.6, 2); scene.add(fill);
const front = new THREE.DirectionalLight('#ffffff', 0.35); front.position.set(0, 1.6, 4); scene.add(front);
const rimA = new THREE.SpotLight('#ff2bd6', 18, 7, 0.6, 0.6); rimA.position.set(-1.8, 2.2, -1.8); rimA.target.position.set(0, 1, 0); scene.add(rimA, rimA.target);
const rimB = new THREE.SpotLight('#29f0ff', 18, 7, 0.6, 0.6); rimB.position.set(1.8, 1.6, -1.8); rimB.target.position.set(0, 1, 0); scene.add(rimB, rimB.target);
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: '#140c26', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(6, 24, '#ff2bd6', '#2a1f55'); grid.position.y = 0.002; scene.add(grid);

let hero = loadLast(), model = null;
function loadLast() { try { return sanitizeHero(JSON.parse(localStorage.getItem(LS_KEY))); } catch { return { ...DEFAULT_HERO }; } }
function disposeModel(m) { m.traverse(o => { if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose(); o.material?.dispose?.(); }); }
const LABEL = { barefoot: 'Barefoot', tshirt: 'T-shirt', none: 'None' };
for (const [k, opts] of Object.entries(PICKERS)) document.querySelector(`.seg[data-key="${k}"]`).innerHTML = opts.map(v => `<button data-v="${v}">${LABEL[v] || v[0].toUpperCase() + v.slice(1)}</button>`).join('');

function apply() {
  const t0 = performance.now();
  hero = sanitizeHero(hero);
  if (model) { scene.remove(model); disposeModel(model); }
  model = buildHero(hero); scene.add(model);
  try { localStorage.setItem(LS_KEY, JSON.stringify(hero)); } catch {}
  document.querySelectorAll('.seg').forEach(seg => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === hero[seg.dataset.key])));
  document.querySelectorAll('#skins button').forEach(b => b.classList.toggle('on', b.dataset.v === hero.skin));
  document.querySelectorAll('#hairColors button').forEach(b => b.classList.toggle('on', b.dataset.v === hero.hairColor));
  heightIn.value = hero.height; document.getElementById('hVal').textContent = hero.height + ' cm';
  window.__nf3d = { hero: { ...hero }, meshes: countMeshes(model), sig: sig(model), scale: model.scale.x, ms: Math.round(performance.now() - t0) };
}

function countMeshes(m) { let n = 0; m.traverse(o => { if (o.isMesh) n++; }); return n; }
function sig(m) { let a = 0; m.traverse(o => { if (o.isMesh) a += o.geometry.attributes.position.count * (1 + Math.abs(o.position.x) + o.position.y); }); return Math.round(a); }

// UI
document.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; hero[seg.dataset.key] = b.dataset.v; apply();
}));
const skins = document.getElementById('skins');
for (const c of SKINS) { const b = document.createElement('button'); b.style.background = c; b.dataset.v = c; b.title = c; skins.appendChild(b); }
skins.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { hero.skin = b.dataset.v; apply(); } });
const hcs = document.getElementById('hairColors');
for (const c of HAIR_COLORS) { const b = document.createElement('button'); b.style.background = c; b.dataset.v = c; b.title = c; hcs.appendChild(b); }
hcs.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { hero.hairColor = b.dataset.v; apply(); } });
const heightIn = document.getElementById('height');
heightIn.addEventListener('input', () => { hero.height = +heightIn.value; apply(); });
document.getElementById('randomBtn').onclick = () => { hero = randomHero(); apply(); };

function download(name, href) { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
document.getElementById('saveJson').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ type: 'neon-fist-3d-hero', ...hero }, null, 2)], { type: 'application/json' }));
  download('hero.json', url); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.getElementById('savePng').onclick = () => { renderer.render(scene, camera); download('hero.png', renderer.domElement.toDataURL('image/png')); };
document.getElementById('loadJson').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try { const { type, ...h } = JSON.parse(await f.text()); hero = h; apply(); } catch { alert('Not a valid hero file'); }
  e.target.value = '';
};

function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(view);
resize(); apply();
window.__nf3dView = (p, t) => { camera.position.set(...p); controls.target.set(...t); controls.update(); }; // test hook
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
