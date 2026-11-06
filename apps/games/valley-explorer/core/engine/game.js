import { createLoop } from '../../../engine/shared/loop.js';
import { createInput } from '../../../engine/shared/input.js';
import { createHex3D, showOverlay, supportsWebGPU } from '../../../engine/3d/core/hex3d.js';
import { buildValley } from './terrain.js';
import { createAssetManager } from '../../../engine/3d/core/assets.js';
import { Vector3 } from '../../../engine/3d/core/three.js';
import { stepJump, JUMP_SPEED, GRAVITY } from './jump.js';

const QUALITY = {
  low:    { dpr: 0.85, shadows: false, label: 'Low' },
  medium: { dpr: 1.25, shadows: true,  label: 'Med' },
  high:   { dpr: 1.5,  shadows: true,  label: 'High' }
};
const DEV_FPS = 30;

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
    hex = await createHex3D(canvas, { clear: 0x8ec6e6, fogNear: 55, fogFar: 155, maxPixelRatio: 1.5 });
  } catch (e) {
    showOverlay(host, 'WebGPU init failed', (e && e.message) || String(e));
    return null;
  }

  const valley = buildValley(0x4E501);
  hex.root.add(valley.root);

  const assets = createAssetManager();
  try {
    const rockUrl = new URL('../../assets/models/rock.glb', import.meta.url).href;
    const { root: rockRoot, meta } = await assets.loadModel(rockUrl, { normalize: true, targetSize: 2.4 });
    const rx = 8, rz = -6;
    rockRoot.position.set(rx, valley.sample(rx, rz), rz);
    hex.root.add(rockRoot);
  } catch (e) {
    console.warn('[HEX-7a] optional GLB skipped:', e && e.message ? e.message : e);
  }

  const input = createInput(canvas);
  canvas.addEventListener('click', () => input.requestLock());

  const player = { x: 0, y: 0, z: 6, yaw: Math.PI, pitch: 0, speed: 14, eye: 1.7, vy: 0, grounded: true };
  player.y = valley.sample(player.x, player.z);
  if (valley.landmarks[0]) {
    const L = valley.landmarks[0].position;
    player.yaw = Math.atan2(-(L.x - player.x), -(L.z - player.z));
  }

  let gathered = 0, paused = false, total = valley.landmarks.length;
  let qualityKey = 'medium';
  const gatheredEl = hud.querySelector('#gathered');
  const fpsEl = hud.querySelector('#fps');
  const qualityEl = hud.querySelector('#btn-quality');
  const helpEl = host.querySelector('#help');

  // reused Three temps
  const _look = new Vector3();
  const _eye = new Vector3();
  let groundY = player.y; // smoothed terrain feet when grounded only

  function applyQuality(key) {
    qualityKey = QUALITY[key] ? key : 'medium';
    const q = QUALITY[qualityKey];
    hex.setPixelRatioCap(q.dpr);
    hex.setShadowsEnabled(q.shadows);
    loop.setFps(DEV_FPS); // mandatory 30 — quality never raises fps
    if (qualityEl) qualityEl.textContent = 'Quality: ' + q.label;
    resize(true);
  }

  function resize(force) {
    hex.setSize(window.innerWidth, window.innerHeight, !!force);
  }
  resize(true);
  window.addEventListener('resize', () => resize(false));

  function syncCamera() {
    _eye.set(player.x, player.y + player.eye, player.z);
    const cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
    _look.set(
      player.x - Math.sin(player.yaw) * cp,
      player.y + player.eye + sp,
      player.z - Math.cos(player.yaw) * cp
    );
    hex.camera.position.copy(_eye);
    hex.camera.lookAt(_look);
  }

  function update(dt) {
    if (paused || hex.lost) return;
    const look = input.consumeLook();
    player.yaw -= look.dx * 0.0025;
    player.pitch -= look.dy * 0.0022;
    player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch));
    if (input.key('ArrowLeft')) player.yaw += 1.6 * dt;
    if (input.key('ArrowRight')) player.yaw -= 1.6 * dt;

    const mv = input.moveAxes();
    const forwardX = -Math.sin(player.yaw);
    const forwardZ = -Math.cos(player.yaw);
    const rightX = Math.cos(player.yaw);
    const rightZ = -Math.sin(player.yaw);
    const wantX = forwardX * (-mv.y) + rightX * mv.x;
    const wantZ = forwardZ * (-mv.y) + rightZ * mv.x;
    player.x += wantX * player.speed * dt;
    player.z += wantZ * player.speed * dt;
    const half = valley.world * 0.48;
    player.x = Math.max(-half, Math.min(half, player.x));
    player.z = Math.max(-half, Math.min(half, player.z));
    const terrainY = valley.sample(player.x, player.z); // authoritative heightFn
    if (player.grounded) {
      // smooth walk follow on ground only — never while airborne (would flatten leap)
      groundY += (terrainY - groundY) * Math.min(1, dt * 12);
    } else {
      groundY = terrainY;
    }
    const jumpPulse = input.consumeJump();
    const vert = stepJump({
      y: player.grounded ? groundY : player.y,
      vy: player.vy,
      grounded: player.grounded,
      terrainY,
      jumpPulse,
      dt
    });
    player.y = vert.y;
    player.vy = vert.vy;
    player.grounded = vert.grounded;
    if (player.grounded) groundY = player.y;

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
    const t = performance.now() * 0.002;
    for (const orb of valley.landmarks) {
      if (orb.userData.taken) continue;
      orb.position.y = valley.sample(orb.position.x, orb.position.z) + 1.3 + Math.sin(t + orb.id) * 0.15;
    }
    syncCamera();
  }

  function render(_alpha, shownFps) {
    if (fpsEl && shownFps) fpsEl.textContent = shownFps.toFixed(0) + ' fps';
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

  applyQuality('medium');
  syncCamera();
  gatheredEl.textContent = `Landmarks 0 / ${total}`;
  if (helpEl) setTimeout(() => { helpEl.style.opacity = '0.25'; }, 6000);

  const qOrder = ['low', 'medium', 'high'];
  return {
    start: () => loop.start(),
    pause() { paused = !paused; input.clearStuck(); },
    cycleQuality() {
      const i = qOrder.indexOf(qualityKey);
      applyQuality(qOrder[(i + 1) % qOrder.length]);
    },
    restart() {
      gathered = 0; paused = false;
      player.x = 0; player.z = 6; player.pitch = 0; player.yaw = Math.PI;
      player.vy = 0; player.grounded = true;
      groundY = valley.sample(player.x, player.z);
      player.y = groundY;
      for (const orb of valley.landmarks) { orb.userData.taken = false; orb.visible = true; }
      const ov = host.querySelector('.hex-overlay'); if (ov) ov.remove();
      gatheredEl.textContent = `Landmarks 0 / ${total}`;
      input.clearStuck();
      syncCamera();
    },
    requestJump: () => input.requestJump(),
    loop, valley
  };
}
