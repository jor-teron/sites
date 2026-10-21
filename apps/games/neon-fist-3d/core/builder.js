// Neon Fist 3D — Hero Builder R1: scene, camera, UI, save.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SKINS, DEFAULT_HERO, buildHero, randomHero, sanitizeHero } from '../assets/models/body.js';

const LS_KEY = 'nf3d.lastHero';
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.shadowMap.enabled = true;
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0a0618');
scene.fog = new THREE.Fog('#0a0618', 6, 14);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
camera.position.set(1.6, 1.5, 3.4);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.95, 0); controls.enableDamping = true; controls.enablePan = false;
controls.minDistance = 1.2; controls.maxDistance = 7; controls.maxPolarAngle = Math.PI * 0.55;

scene.add(new THREE.HemisphereLight('#8a7cff', '#1a0f2a', 0.9));
const key = new THREE.DirectionalLight('#ffffff', 1.6); key.position.set(2, 4, 3); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); scene.add(key);
const rimA = new THREE.PointLight('#ff2bd6', 6, 6); rimA.position.set(-2, 1.8, -1.5); scene.add(rimA);
const rimB = new THREE.PointLight('#29f0ff', 6, 6); rimB.position.set(2, 1.2, -1.5); scene.add(rimB);
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: '#140c26', roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
const grid = new THREE.GridHelper(6, 24, '#ff2bd6', '#2a1f55'); grid.position.y = 0.002; scene.add(grid);

let hero = loadLast(), model = null;
function loadLast() { try { return sanitizeHero(JSON.parse(localStorage.getItem(LS_KEY))); } catch { return { ...DEFAULT_HERO }; } }
function disposeModel(m) { m.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); }

function apply() {
  hero = sanitizeHero(hero);
  if (model) { scene.remove(model); disposeModel(model); }
  model = buildHero(hero); scene.add(model);
  try { localStorage.setItem(LS_KEY, JSON.stringify(hero)); } catch {}
  document.querySelectorAll('.seg').forEach(seg => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === hero[seg.dataset.key])));
  document.querySelectorAll('#skins button').forEach(b => b.classList.toggle('on', b.dataset.v === hero.skin));
  heightIn.value = hero.height; document.getElementById('hVal').textContent = hero.height + ' cm';
  window.__nf3d = { hero: { ...hero }, meshes: model.children.length, scale: model.scale.x };
}

// UI
document.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; hero[seg.dataset.key] = b.dataset.v; apply();
}));
const skins = document.getElementById('skins');
for (const c of SKINS) { const b = document.createElement('button'); b.style.background = c; b.dataset.v = c; b.title = c; skins.appendChild(b); }
skins.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { hero.skin = b.dataset.v; apply(); } });
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
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
