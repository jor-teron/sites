/* BRK-1 — original canvas brick game. Classic scripts; no build or network dependencies. */
'use strict';
window.BRK = {
  C: { width: 480, height: 640, step: 1 / 60, radius: 6, paddleY: 590,
    paddleWidth: 88, paddleHeight: 14, startSpeed: 340, maxSpeed: 650,
    columns: 10, brickWidth: 42, brickHeight: 22, gap: 3, left: 16.5, top: 70,
    powerSeconds: 16, powerTypes: ['wide', 'multi', 'slow', 'laser', 'life'] },
  clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
};
