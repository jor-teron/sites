import { createLoop } from '../../../engine/shared/loop.js';
import { createInput } from '../../../engine/shared/input.js';
import { createHex3D, showOverlay, supportsWebGPU } from '../../../engine/3d/core/hex3d.js';
import { buildValley } from './terrain.js';

export async function bootValley(canvas, host, hud) {
  if (location.protocol === 'file:') {
    showOverlay(host, 'Serve over HTTP',
      'Valley Explorer uses ES modules. Open via a local server or the Hub — <code>file://</code> is not supported.');
    return null;
  }
  if (!supportsWebGPU()) {
    showOverlay(host, 'WebGPU required',
      'This demo needs a browser with <code>navigator.gpu</code> (Chrome/Edge with WebGPU). There is no WebGL fallback.');
    return null;
  }

  let hex;
  try {
    hex = await createHex3D(canvas, { clear: 0x87b5d9, fogNear: 70, fogFar: 150 });
  } catch (e) {
    showOverlay(host, 'WebGPU init failed', (e && e.message) || String(e));
    return null;
  }

  const valley = buildValley(0x4E501);
  hex.root.add(valley.root);

  const input = createInput(canvas);
  canvas.addEventListener('click', () => input.requestLock());

  const player = { x: 0, y: 0, z: 6, yaw: Math.PI, pitch: 0, speed: 14, eye: 1.7 };
  player.y = valley.sample(player.x, player.z);
  // face first landmark
  if (valley.landmarks[0]) {
    const L = valley.landmarks[0].position;
    player.yaw = Math.atan2(-(L.x - player.x), -(L.z - player.z));
  }

  let gathered = 0, paused = false, total = valley.landmarks.length;
  const gatheredEl = hud.querySelector('#gathered');
  const helpEl = host.querySelector('#help');

  function resize() {
    hex.setSize(window.innerWidth, window.innerHeight);
  }
  resize();
  window.addEventListener('resize', resize);

  function syncCamera() {
    const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
    const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
    hex.camera.position.set(player.x, player.y + player.eye, player.z);
    hex.camera.lookAt(
      player.x + sy * cp,
      player.y + player.eye + sp,
      player.z + cy * cp
    );
  }

  function update(dt) {
    if (paused || hex.lost) return;
    const look = input.consumeLook();
    player.yaw -= look.dx * 0.0025;
    player.pitch -= look.dy * 0.0022;
    player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch));
    // arrow keys also turn
    if (input.key('ArrowLeft')) player.yaw += 1.6 * dt;
    if (input.key('ArrowRight')) player.yaw -= 1.6 * dt;

    const mv = input.moveAxes();
    const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
    const fx = sy * mv.y + cy * mv.x; // forward is -z visually via lookAt; movement: yaw 0 looks -Z? 
    // With lookAt using (sy, cy) as forward in XZ where yaw=PI faces +Z initially... keep consistent:
    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);
    const rightX = Math.cos(player.yaw);
    const rightZ = -Math.sin(player.yaw);
    // moveAxes y: W = -1 (forward)
    const wantX = forwardX * (-mv.y) + rightX * mv.x;
    const wantZ = forwardZ * (-mv.y) + rightZ * mv.x;
    player.x += wantX * player.speed * dt;
    player.z += wantZ * player.speed * dt;
    const half = valley.world * 0.48;
    player.x = Math.max(-half, Math.min(half, player.x));
    player.z = Math.max(-half, Math.min(half, player.z));
    player.y = valley.sample(player.x, player.z);

    for (const orb of valley.landmarks) {
      if (orb.userData.taken) continue;
      const dx = orb.position.x - player.x, dz = orb.position.z - player.z;
      const dy = orb.position.y - (player.y + player.eye);
      if (dx * dx + dy * dy + dz * dz < 3.2) {
        orb.userData.taken = true;
        orb.visible = false;
        gathered++;
        gatheredEl.textContent = `Landmarks ${gathered} / ${total}`;
        if (gathered >= total) {
          showOverlay(host, 'Valley clear', 'You found every glowing landmark. Pause → Restart to wander again.');
          paused = true;
        }
      }
    }
    // gentle bob for remaining orbs
    const t = performance.now() * 0.002;
    for (const orb of valley.landmarks) {
      if (orb.userData.taken) continue;
      orb.position.y = valley.sample(orb.position.x, orb.position.z) + 1.3 + Math.sin(t + orb.id) * 0.15;
    }
    syncCamera();
  }

  function render() {
    const r = hex.render();
    if (r.lost) {
      loop.stop();
      showOverlay(host, 'GPU device lost', 'The WebGPU device was lost. Reload the page to continue.');
    }
  }

  const loop = createLoop({
    fps: 30,
    update,
    render,
    onError(e) {
      showOverlay(host, 'Runtime error', (e && e.message) || String(e));
    }
  });

  syncCamera();
  gatheredEl.textContent = `Landmarks 0 / ${total}`;
  if (helpEl) setTimeout(() => { helpEl.style.opacity = '0.25'; }, 6000);

  return {
    start: () => loop.start(),
    pause() { paused = !paused; },
    restart() {
      gathered = 0; paused = false;
      player.x = 0; player.z = 6; player.pitch = 0; player.yaw = Math.PI;
      player.y = valley.sample(player.x, player.z);
      for (const orb of valley.landmarks) { orb.userData.taken = false; orb.visible = true; }
      const ov = host.querySelector('.hex-overlay'); if (ov) ov.remove();
      gatheredEl.textContent = `Landmarks 0 / ${total}`;
      syncCamera();
    },
    loop
  };
}
