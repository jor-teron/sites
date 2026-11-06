import { bootValley } from '../core/engine/game.js';

const boot = document.getElementById('boot');
const wrap = document.getElementById('wrap');
const canvas = document.getElementById('view');
const hud = document.getElementById('hud');

bootValley(canvas, wrap, hud).then((game) => {
  boot.classList.add('hidden');
  if (!game) return;
  document.getElementById('btn-pause').onclick = () => game.pause();
  document.getElementById('btn-restart').onclick = () => game.restart();
  game.start();
}).catch((e) => {
  boot.textContent = (e && e.message) || String(e);
});
