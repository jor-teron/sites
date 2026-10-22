// LandCraft L1a: renders a flat voxel test world with three.js r170 (vendored, no CDN).
import * as THREE from 'three';
import { makeAtlas } from './atlas.js';
import { World, GROUND } from './world.js';

const SKY = 0x8ec9ff;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
document.body.appendChild(renderer.domElement);

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

// L1a preview camera: slow orbit around the test area.
renderer.setAnimationLoop(function (t) {
  const a = t / 1000 * 0.08;
  camera.position.set(Math.cos(a) * 26, GROUND + 14, Math.sin(a) * 26);
  camera.lookAt(0, GROUND, 0);
  renderer.render(scene, camera);
});
