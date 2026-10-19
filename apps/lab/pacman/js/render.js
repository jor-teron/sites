/* Pac-Man — render.js
 * Canvas sizing (fits the stage, sharp on high-DPI screens) and drawing: maze, pellets, Pac-Man,
 * ghosts (normal, frightened blue / flashing, eyes only), READY text and the death shrink.
 */
(function (PAC) {
  'use strict';
  const M = PAC.maze;
  const BASE_TILE = 24;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  let TILE = BASE_TILE;

  function resize() {
    const rect = stage.getBoundingClientRect();
    const availW = Math.max(100, rect.width - 12);
    const availH = Math.max(100, rect.height - 12);
    const scale = Math.min(availW / (M.COLS * BASE_TILE), availH / (M.ROWS * BASE_TILE));
    TILE = Math.max(8, Math.floor(BASE_TILE * scale));
    const cssW = M.COLS * TILE, cssH = M.ROWS * TILE;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 50));

  function drawMaze() {
    const tiles = M.tiles;
    for (let r = 0; r < M.ROWS; r++) {
      for (let c = 0; c < M.COLS; c++) {
        const ch = tiles[r][c];
        const x = c * TILE, y = r * TILE;
        if (ch === '#') {
          ctx.fillStyle = '#1919A6';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = '#3B3BFF';
          ctx.lineWidth = Math.max(1, TILE * 0.08);
          ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        } else if (ch === '.') {
          ctx.fillStyle = '#FFD9A0';
          ctx.beginPath();
          ctx.arc(x + TILE / 2, y + TILE / 2, Math.max(1.5, TILE * 0.10), 0, Math.PI * 2);
          ctx.fill();
        } else if (ch === 'o') {
          ctx.fillStyle = '#FFD9A0';
          ctx.beginPath();
          ctx.arc(x + TILE / 2, y + TILE / 2, Math.max(3, TILE * 0.24), 0, Math.PI * 2);
          ctx.fill();
        } else if (ch === '-') {
          ctx.fillStyle = '#FFB8FF';
          ctx.fillRect(x, y + TILE / 2 - 2, TILE, 4);
        }
      }
    }
  }

  function drawPac(pac) {
    const x = pac.x * TILE, y = pac.y * TILE;
    const radius = TILE * 0.42;
    const angle = Math.atan2(pac.face.y, pac.face.x);
    const mouthAngle = pac.mouth * 0.35 * Math.PI;
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, radius, angle + mouthAngle, angle - mouthAngle + Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    // Eye
    ctx.fillStyle = '#000';
    const eyeAngle = angle - Math.PI / 4;
    ctx.beginPath();
    ctx.arc(x + Math.cos(eyeAngle) * radius * 0.35, y + Math.sin(eyeAngle) * radius * 0.35, Math.max(1.5, TILE * 0.09), 0, Math.PI * 2);
    ctx.fill();
  }

  /** frightTicks: ticks of fright left (blue; flashes white during the last 2 s). */
  function drawGhost(g, frightTicks) {
    const radius = TILE * 0.42;
    const x = g.x * TILE, y = g.y * TILE;
    let color = g.color;
    if (g.state === 'eyes' || g.state === 'entering') color = null;            // eaten: eyes only
    else if (g.frightened) {
      const flashing = frightTicks < 120 && Math.floor(frightTicks / 12) % 2 === 0;
      color = flashing ? '#FFFFFF' : '#2121DE';
    }
    if (color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y - radius * 0.1, radius, Math.PI, 0);
      ctx.lineTo(x + radius, y + radius * 0.85);
      const segs = 4, segW = (radius * 2) / segs;        // wavy skirt
      for (let i = 0; i < segs; i++) {
        const sx = x + radius - i * segW;
        const wave = (i % 2 === 0) ? radius * 0.25 : 0;
        ctx.quadraticCurveTo(sx - segW / 2, y + radius * 0.85 + wave, sx - segW, y + radius * 0.85);
      }
      ctx.lineTo(x - radius, y - radius * 0.1);
      ctx.closePath();
      ctx.fill();
    }
    // Eyes look where the ghost is going
    const eox = g.dir.x * 3, eoy = g.dir.y * 3;
    const eyeR = Math.max(2, TILE * 0.14), pupilR = Math.max(1, TILE * 0.07);
    for (const side of [-1, 1]) {
      const ex = x + side * TILE * 0.16 + eox * 0.6;
      const ey = y - TILE * 0.12 + eoy * 0.6;
      ctx.fillStyle = '#FFF';
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(ex + eox * 0.4, ey + eoy * 0.4, pupilR, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawReadyText() {
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${Math.floor(TILE * 0.9)}px Courier New`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('READY!', M.COLS * TILE / 2, M.ROWS * TILE / 2);
  }

  /** v = { state, ST, timer, pac, ghosts, frightTicks } from game.js */
  function draw(v) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, M.COLS * TILE, M.ROWS * TILE);
    drawMaze();
    if (v.state === v.ST.DYING) {               // shrinking Pac-Man, ghosts hidden
      const t = 1 - v.timer / 90;
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(v.pac.x * TILE, v.pac.y * TILE, TILE * 0.42 * Math.max(0, 1 - t), 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const blinkHidden = v.state === v.ST.READY && v.timer > 60 && Math.floor(v.timer / 10) % 2 === 0;
    if (!blinkHidden) for (const g of v.ghosts) drawGhost(g, v.frightTicks);
    drawPac(v.pac);
    if (v.state === v.ST.READY) drawReadyText();
  }

  PAC.render = { resize, draw, canvas, get TILE() { return TILE; } };
})(window.PAC = window.PAC || {});
