// Sling Birds — entry point: boot and main loop.
import { engine, updateTurnResolution } from './physics.js';
import { buildLevel } from './entities.js';
import { resize, initResize, render } from './render.js';
import { initInput } from './input.js';
import { initUi, showHint } from './ui.js';
import { Engine } from './config.js';

initResize();
initInput();
initUi();

let lastTime = 0;

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  Engine.update(engine, dt * 1000);

  updateTurnResolution(dt);

  render();
}

// ---------- BOOT ----------
resize();
buildLevel(0);
showHint('DRAG FROM THE SLINGSHOT', 3000);

requestAnimationFrame((t) => {
  lastTime = t;
  requestAnimationFrame(loop);
});
