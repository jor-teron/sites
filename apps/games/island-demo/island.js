import * as THREE from "three";
import { createWorld } from "./world.js";
import { createPlayer } from "./player.js";
import { createProps } from "./props.js";
import { createEditor } from "./editor.js";

const canvas = document.getElementById("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const { scene } = createWorld();
createProps(scene);
createEditor();

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 80);
const player = createPlayer(scene, camera);
player.loadModels(scene);

const label = document.getElementById("who");
document.getElementById("male").addEventListener("click", () => choose("male"));
document.getElementById("female").addEventListener("click", () => choose("female"));

function choose(who) {
  player.switchTo(who);
  document.getElementById("male").classList.toggle("on", who === "male");
  document.getElementById("female").classList.toggle("on", who === "female");
  label.textContent = who === "male" ? "Male" : "Female";
}
choose("female");

window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.code === "KeyC" || e.code === "Tab") {
    const next = label.textContent === "Male" ? "female" : "male";
    choose(next);
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const name = player.update(dt);
  label.textContent = name;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
