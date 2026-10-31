// Sling Birds — entry point: boot and main loop.
import { engine, updateTurnResolution } from './physics.js';
import { resize, initResize, render } from './render.js';
import { initInput } from './input.js';
import { initUi, showHint, loadLastLevel, gotoLevel } from './ui.js';
import { Engine, STEP_MS } from './config.js';

initResize();
initInput();
initUi();

let lastTime = 0;
let acc = 0;

// Fixed 60Hz physics step with an accumulator (same physics at 60/120/144Hz or when lagging)
function loop(now) {
  requestAnimationFrame(loop);
  acc += Math.min(100, now - lastTime);
  lastTime = now;

  while (acc >= STEP_MS) {
    Engine.update(engine, STEP_MS);
    updateTurnResolution(STEP_MS / 1000);
    acc -= STEP_MS;
  }

  render();
}

// ---------- BOOT ----------
resize();
gotoLevel(loadLastLevel());   // last level played (00 demo on the first visit)
showHint('DRAG FROM THE SLINGSHOT', 3000);

requestAnimationFrame((t) => {
  lastTime = t;
  requestAnimationFrame(loop);
});
