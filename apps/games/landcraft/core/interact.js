// LandCraft L1c block editing: target the block under the crosshair (reach 5), outline it,
// break / place it, and pick the block to place from a 7-slot hotbar.
import * as THREE from 'three';
import { raycast } from './raycast.js';
import { AIR, HOTBAR, NAMES, FACE_TILES, solid } from './blocks.js';
import { TILE } from './atlas.js';

const REACH = 5;

export function setupInteract(o) { // o: { scene, camera, world, player, canvas, controls, atlas }
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
  outline.visible = false;
  o.scene.add(outline);
  const dir = new THREE.Vector3(), bar = document.getElementById('hotbar');
  let target = null, slot = 0;

  // Hotbar: one swatch per block, drawn from the atlas side tile.
  HOTBAR.forEach(function (b, i) {
    const btn = document.createElement('button'), cv = document.createElement('canvas');
    btn.type = 'button'; btn.title = (i + 1) + ': ' + NAMES[b];
    cv.width = cv.height = TILE;
    cv.getContext('2d').drawImage(o.atlas.image, FACE_TILES[b][2] * TILE, 0, TILE, TILE, 0, 0, TILE, TILE);
    btn.appendChild(cv);
    btn.addEventListener('pointerdown', function (e) { e.preventDefault(); select(i); });
    bar.appendChild(btn);
  });
  function select(i) {
    slot = (i + HOTBAR.length) % HOTBAR.length;
    Array.prototype.forEach.call(bar.children, function (c, k) { c.classList.toggle('on', k === slot); });
  }
  select(0);
  window.addEventListener('keydown', function (e) { if (e.key >= '1' && e.key <= '7') select(+e.key - 1); });
  window.addEventListener('wheel', function (e) { select(slot + (e.deltaY > 0 ? 1 : -1)); }, { passive: true });

  function breakBlock() { if (target) o.world.edit(target.x, target.y, target.z, AIR); }
  function placeBlock() {
    if (!target) return;
    const x = target.x + target.n[0], y = target.y + target.n[1], z = target.z + target.n[2];
    if (solid(o.world.get(x, y, z)) || o.player.overlaps(x, y, z)) return; // never inside the player
    o.world.edit(x, y, z, HOTBAR[slot]);
  }
  // Desktop: with the mouse locked, left = break, right = place. If pointer lock is unavailable,
  // a click (not a drag) does the same.
  let down = null;
  o.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  o.canvas.addEventListener('mousedown', function (e) {
    down = { x: e.clientX, y: e.clientY, locked: document.pointerLockElement === o.canvas };
    if (down.locked) { update(); if (e.button === 0) breakBlock(); else if (e.button === 2) placeBlock(); }
  });
  o.canvas.addEventListener('mouseup', function (e) {
    if (!down || down.locked || !o.controls.lockFailed() || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    update(); if (e.button === 0) breakBlock(); else if (e.button === 2) placeBlock();
  });
  // Touch: Break and Place buttons act on the block under the crosshair.
  document.getElementById('break').addEventListener('pointerdown', function (e) { e.preventDefault(); update(); breakBlock(); });
  document.getElementById('place').addEventListener('pointerdown', function (e) { e.preventDefault(); update(); placeBlock(); });

  function update() {
    o.camera.getWorldDirection(dir);
    target = raycast(o.world, o.camera.position, dir, REACH);
    outline.visible = !!target;
    if (target) outline.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
  }
  return { update: update, slot: function () { return HOTBAR[slot]; }, target: function () { return target; } };
}
