// LandCraft LCR1a: generated voxel maps 00-99 chosen in a title picker (or ?map=NN; 00 = flat test world),
// three.js r170 vendored, first-person movement and block break/place. Each map keeps its own save (edits + player),
// autosaved every 30 s and on map switch / picker / page hide; a map is rebuilt from its number plus the save's diff.
// LC3: shared Games settings (core/settings.js): FPS limit throttles drawing inside setAnimationLoop using real
// elapsed time (movement stays per second), render distance (+ fog), pixel ratio, look sensitivity, FPS counter,
// touch auto-jump and hold-to-repeat, and a ⚙ gear (top right). Changes apply live, even from another tab.
import * as THREE from 'three';
import { makeAtlas } from '../assets/textures/atlas.js';
import { generate, worldHash } from './mapgen.js';
import { Player, EYE } from './player.js';
import { setupControls } from './controls.js';
import { setupInteract } from './interact.js';
import { setupPicker } from './picker.js';
import { readSave, writeSave, hasSave, dropSave, saveKey } from './save.js';
import { settings } from './settings.js';
import { setupHud } from './hud.js';

const SKY = 0x8ec9ff;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(settings.pixelRatio());
document.body.prepend(renderer.domElement); // first, so the overlay UI stacks above it

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 40, 90); // distances follow the render distance (applyView)
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
let LOAD = 5; // chunks meshed around the player (setting 'renderDistance' 3-5); the rest stream in a few per frame

// Render distance and the fog that hides its edge: 5 chunks -> fog 40..90 (the original look), 3 -> 26..58.
function applyView() {
  LOAD = settings.get('renderDistance');
  scene.fog.far = LOAD * 16 + 10; scene.fog.near = Math.round(scene.fog.far * 0.45);
  camera.far = scene.fog.far + 20; camera.updateProjectionMatrix();
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
applyView();

const player = new Player(null, 0, 0, 0);
const controls = setupControls(renderer.domElement, player, { sens: function () { return settings.get('sensitivity'); } });
const ctx = { scene: scene, camera: camera, world: null, player: player, canvas: renderer.domElement, controls: controls, atlas: atlas,
  holdRepeat: function () { return settings.get('holdRepeat'); } };
const interact = setupInteract(ctx); // reads ctx.world on every use, so a map switch only swaps ctx.world
let mapNum = null, last = performance.now();

let saveOk = true;
function save() {
  if (!ctx.world || mapNum === null) return false;
  saveOk = writeSave(mapNum, ctx.world, player, interact.index());
  return saveOk;
}
// Save the old map, drop its meshes, generate map n from its number, apply its saved edits and put the
// player back where they were (or at spawn). keepOld = false skips saving the old map (used by Reset map).
function loadMap(n, keepOld) {
  if (keepOld !== false) save();
  if (ctx.world) for (const c of ctx.world.chunks.values()) if (c.mesh) { scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
  const w = generate(n), s = readSave(n, w);
  ctx.world = player.world = w; mapNum = n;
  player.spawn = Object.assign({}, w.spawn); Object.assign(player.pos, w.spawn); // map 00: facing the stone wall (-Z)
  player.vel.x = player.vel.y = player.vel.z = 0; player.yaw = player.pitch = 0;
  if (s) { // edits go in before the first meshing, so every affected chunk is meshed with them
    for (let i = 0; i < s.edits.length; i += 4) w.track(s.edits[i], s.edits[i + 1], s.edits[i + 2], s.edits[i + 3]);
    Object.assign(player.pos, s.pos); player.yaw = s.view.yaw; player.pitch = s.view.pitch; interact.select(s.slot);
    if (player.collides()) { Object.assign(player.pos, w.spawn); } // saved spot now inside a block: back to spawn
  }
  w.buildNear(scene, materials, player.pos.x, player.pos.z, LOAD, Infinity);
  if (/[?&]map=/.test(location.search)) history.replaceState(null, '', '?map=' + String(n).padStart(2, '0')); // reload keeps the map
  last = performance.now();
}
const AUTOSAVE_MS = 30000;
function autosave() { if (!picker.isOpen() && document.visibilityState === 'visible') save(); }
window.landcraft = { player: player, interact: interact, load: loadMap, // read-only handle for debugging and tests
  get world() { return ctx.world; }, get map() { return mapNum; }, hash: function () { return worldHash(ctx.world); },
  saves: { save: save, autosave: autosave, key: saveKey, AUTOSAVE_MS: AUTOSAVE_MS } };
const picker = setupPicker({ canvas: renderer.domElement, current: function () { return mapNum; }, load: loadMap,
  onOpen: save, hasSave: hasSave, saveOk: function () { return saveOk; },
  reset: function (n) { dropSave(n); if (n === mapNum) loadMap(n, false); } });
window.landcraft.picker = picker;
setInterval(autosave, AUTOSAVE_MS);
window.addEventListener('pagehide', save);

// Settings: gear, FPS counter, and live updates (the settings page may be open in another tab).
settings.mountGear('top-right');
const hud = setupHud(settings);
settings.onChange(function (ch) {
  if ('pixelRatio' in ch || 'lowGraphics' in ch) { renderer.setPixelRatio(settings.pixelRatio()); resize(); }
  if ('renderDistance' in ch) applyView();
  if ('holdRepeat' in ch && !settings.get('holdRepeat')) interact.stopHold();
});
window.landcraft.settings = settings;
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') save(); });

let lastDraw = -Infinity;
renderer.setAnimationLoop(function (t) {
  // FPS limit: skip display refreshes until a frame is due (1 ms slack so 60 on a 60 Hz screen draws every
  // refresh). The remainder is carried over, so 30 on a 60 Hz screen draws every second refresh, evenly.
  const fm = settings.frameMs(), since = t - lastDraw;
  if (since < fm - 1) return;
  lastDraw = since >= fm && since < 2 * fm ? t - (since - fm) : t;
  // Real elapsed time since the last drawn frame, clamped to 0..0.1 s: a background tab can't cause a huge
  // step, and the first frame's timestamp can predate `last` after a slow map build (negative dt).
  const dt = Math.max(0, Math.min(0.1, (t - last) / 1000));
  last = t;
  hud.tick(t);
  if (!ctx.world) { renderer.render(scene, camera); return; } // sky behind the picker until a map is chosen
  if (!picker.isOpen()) { // the world holds still while the picker is open
    const input = controls.read();
    input.autoJump = controls.touch() && settings.get('autoJump'); // auto-jump is a touch helper only
    player.update(dt, input);
    interact.tick(t);
  }
  ctx.world.buildNear(scene, materials, player.pos.x, player.pos.z, LOAD, 2);
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  camera.updateMatrixWorld();
  interact.update();
  renderer.render(scene, camera);
});
