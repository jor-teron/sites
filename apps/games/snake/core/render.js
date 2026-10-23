/** Snake — canvas drawing: board, grid, food, snake and the boost tint. */
window.SN = window.SN || {};
(function () {
  'use strict';
  const ctx = SN.ctx, CL = SN.CL, SZ = SN.SZ, G = SN.G, V = SN.view;
  const COLS = SN.COLS, ROWS = SN.ROWS;

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    const { W, H, cell, ox, oy } = V;
    ctx.fillStyle = CL.bg;
    ctx.fillRect(0, 0, W, H);
    // board
    ctx.fillStyle = CL.board;
    ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
    // grid subtle
    ctx.strokeStyle = CL.grid;
    ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(ox + x * cell + 0.5, oy);
      ctx.lineTo(ox + x * cell + 0.5, oy + ROWS * cell);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(ox, oy + y * cell + 0.5);
      ctx.lineTo(ox + COLS * cell, oy + y * cell + 0.5);
      ctx.stroke();
    }
    // food
    if (G.food) {
      const fx = ox + G.food[0] * cell;
      const fy = oy + G.food[1] * cell;
      const pad = cell * SZ.foodPad;
      ctx.fillStyle = CL.food;
      rr(fx + pad, fy + pad, cell - pad * 2, cell - pad * 2, SZ.foodRadius);
      ctx.fill();
    }
    // snake
    const snake = G.snake;
    for (let i = snake.length - 1; i >= 0; i--) {
      const [sx, sy] = snake[i];
      const t = i / Math.max(1, snake.length - 1);
      const g = Math.floor(CL.bodyGMin + (1 - t) * CL.bodyGRange);
      ctx.fillStyle = i === 0 ? CL.head : 'rgb(' + CL.bodyR + ',' + g + ',' + CL.bodyB + ')';
      const pad = i === 0 ? cell * SZ.headPad : cell * SZ.bodyPad;
      rr(ox + sx * cell + pad, oy + sy * cell + pad, cell - pad * 2, cell - pad * 2, SZ.segRadius);
      ctx.fill();
    }
    if (G.boost && G.state === 'play') {
      ctx.fillStyle = CL.boostTint;
      ctx.fillRect(ox, oy, cell * COLS, cell * ROWS);
    }
  }

  SN.render = { draw };
})();
