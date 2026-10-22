// LandCraft L2b: generated voxel maps 00-99 chosen in a title picker (or ?map=NN; 00 = flat test world),
// three.js r170 vendored, first-person movement and block break/place. Switching maps rebuilds the world from the number.
import * as THREE from 'three';
import { makeAtlas } from './atlas.js';
import { generate, worldHash } from './mapgen.js';
import { Player, EYE } from './player.js';
import { setupControls } from './controls.js';
import { setupInteract } from './interact.js';
import { setupPicker } from './picker.js';

const SKY = 0x8ec9ff;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
document.body.prepend(renderer.domElement); // first, so the overlay UI stacks above it

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 40, 90);
scene.add(new THREE.AmbientLight(0xffffff, 1.1));
const sun = new THREE.DirectionalLight(0xfff4e0, 1.8);
sun.position.set(30, 60, 20);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
const atlas = makeAtlas();
const materials = [ // [0] opaque + cutout leaves, [1] translucent glass
  new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 }),
  new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, transparent: true, depthWrite: false })
];
const LOAD = 5; // chunks meshed around the player; the rest stream in a few per frame as you walk

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const player = new Player(null, 0, 0, 0);
const controls = setupControls(renderer.domElement, player);
const ctx = { scene: scene, camera: camera, world: null, player: player, canvas: renderer.domElement, controls: controls, atlas: atlas };
const interact = setupInteract(ctx); // reads ctx.world on every use, so a map switch only swaps ctx.world
let mapNum = null, last = performance.now();

// Drop the old map's meshes, generate map n from its number and put the player at its spawn.
function loadMap(n) {
  if (ctx.world) for (const c of ctx.world.chunks.values()) if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
  const w = generate(n);
  w.buildNear(scene, materials, w.spawn.x, w.spawn.z, LOAD, Infinity);
  ctx.world = player.world = w; mapNum = n;
  player.spawn = Object.assign({}, w.spawn); Object.assign(player.pos, w.spawn); // map 00: facing the stone wall (-Z)
  player.vel.x = player.vel.y = player.vel.z = 0; player.yaw = player.pitch = 0;
  if (/[?&]map=/.test(location.search)) history.replaceState(null, '', '?map=' + String(n).padStart(2, '0')); // reload keeps the map
  last = performance.now();
}
window.landcraft = { player: player, interact: interact, load: loadMap, // read-only handle for debugging and tests
  get world() { return ctx.world; }, get map() { return mapNum; }, hash: function () { return worldHash(ctx.world); } };
const picker = setupPicker({ canvas: renderer.domElement, current: function () { return mapNum; }, load: loadMap });
window.landcraft.picker = picker;

renderer.setAnimationLoop(function (t) {
  // Clamp to 0..0.05 s: a background tab can't cause a huge step, and the first frame's timestamp can
  // predate `last` after a slow map build (a negative dt pushed the player into the ground).
  const dt = Math.max(0, Math.min(0.05, (t - last) / 1000));
  last = t;
  if (!ctx.world) { renderer.render(scene, camera); return; } // sky behind the picker until a map is chosen
  if (!picker.isOpen()) player.update(dt, controls.read()); // the world holds still while the picker is open
  ctx.world.buildNear(scene, materials, player.pos.x, player.pos.z, LOAD, 2);
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
  interact.update();
  renderer.render(scene, camera);
});
