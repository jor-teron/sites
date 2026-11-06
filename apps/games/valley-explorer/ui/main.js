import { bootValley } from '../core/engine/game.js';

const boot = document.getElementById('boot');
const wrap = document.getElementById('wrap');
const canvas = document.getElementById('view');
const hud = document.getElementById('hud');
const jumpBtn = document.getElementById('btn-jump');

bootValley(canvas, wrap, hud).then((game) => {
  boot.classList.add('hidden');
  if (!game) return;
  document.getElementById('btn-pause').onclick = () => game.pause();
  document.getElementById('btn-restart').onclick = () => game.restart();
  document.getElementById('btn-quality').onclick = () => game.cycleQuality();

  // Jump button: edge pulse on press; outside canvas so look drag never sees it
  const pulse = (e) => {
    e.preventDefault();
    e.stopPropagation();
    game.requestJump();
  };
  jumpBtn.addEventListener('pointerdown', pulse);
  jumpBtn.addEventListener('touchstart', (e) => { e.stopPropagation(); }, { passive: true });

  game.start();
}).catch((e) => {
  boot.textContent = (e && e.message) || String(e);
});
