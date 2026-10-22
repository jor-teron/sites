// LandCraft L1b: flat voxel test world (three.js r170, vendored) explored in first person.
import * as THREE from 'three';
import { makeAtlas } from './atlas.js';
import { World, GROUND } from './world.js';
import { Player, EYE } from './player.js';
import { setupControls } from './controls.js';

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
const material = new THREE.MeshLambertMaterial({ map: makeAtlas(), vertexColors: true });
const world = World.flat(2);
world.buildAll(scene, material);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const player = new Player(world, 5.5, GROUND, 1.5); // spawn facing the stone wall (-Z)
const controls = setupControls(renderer.domElement, player);
window.landcraft = { player: player, world: world }; // read-only handle for debugging and tests

let last = performance.now();
renderer.setAnimationLoop(function (t) {
  const dt = Math.min(0.05, (t - last) / 1000); // cap so a background tab can't cause a huge step
  last = t;
  player.update(dt, controls.read());
  camera.position.set(player.pos.x, player.pos.y + EYE, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  renderer.render(scene, camera);
});
