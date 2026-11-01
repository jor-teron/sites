/* Pac-Man — render.js
 * Canvas sizing (fits the stage, sharp on high-DPI screens) and drawing: maze (flashing on level clear),
 * pellets, bonus fruit, Pac-Man, ghosts (normal, frightened blue / flashing, eyes only), floating points,
 * READY / PAUSED text and the classic death animation (mouth opens until Pac-Man is gone).
 * Called at most 30 times a second by game.js; the canvas backing store is capped at 2x DPR.
 */
(function (PAC) {
  'use strict';
  const M = PAC.maze;
  const BASE_TILE = 24;
  const MAX_DPR = 2;
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
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);   // 3x phones: 2x is sharp enough, far fewer pixels
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 50));

  /** flash: null = normal walls; true / false = level-clear flash phase (white / blue). */
  function drawMaze(flash) {
    const tiles = M.tiles;
    const fill = flash ? '#FFFFFF' : '#1919A6', edge = flash ? '#DDDDDD' : '#3B3BFF';
    for (let r = 0; r < M.ROWS; r++) {
      for (let c = 0; c < M.COLS; c++) {
        const ch = tiles[r][c];
        const x = c * TILE, y = r * TILE;
        if (ch === '#') {
          ctx.fillStyle = fill;
          ctx.fillRect(x, y, TILE, TILE);
          ctx.strokeStyle = edge;
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

  /** frightTicks: ticks of fright left; flashTicks: the last stretch in which it flashes white (per level). */
  function drawGhost(g, frightTicks, flashTicks) {
    const radius = TILE * 0.42;
    const x = g.x * TILE, y = g.y * TILE;
    let color = g.color;
    if (g.state === 'eyes' || g.state === 'entering') color = null;            // eaten: eyes only
    else if (g.frightened) {
      const flashing = frightTicks < flashTicks && Math.floor(frightTicks / 12) % 2 === 0;
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

  /** Classic death: Pac-Man turns to face up and his mouth opens wider and wider until nothing is left,
   *  then a short "pop" of lines. p: 0 -> 1 over the animation. */
  function drawDeath(pac, p) {
    const x = pac.x * TILE, y = pac.y * TILE, radius = TILE * 0.42;
    const up = -Math.PI / 2;
    if (p < 0.85) {
      const mouth = 0.1 * Math.PI + (p / 0.85) * 0.9 * Math.PI;   // half-angle: 18° -> 180° (gone)
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, radius, up + mouth, up - mouth + Math.PI * 2);
      ctx.closePath();
      ctx.fill();
    } else {
      const q = (p - 0.85) / 0.15;                                 // pop: 8 short rays moving outward
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = Math.max(1, TILE * 0.07);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, r0 = radius * (0.3 + 0.5 * q), r1 = r0 + radius * 0.3;
        ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
        ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      }
      ctx.stroke();
    }
  }

  function drawCentreText(text) {
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${Math.floor(TILE * 0.9)}px Courier New`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, M.COLS * TILE / 2, M.ROWS * TILE / 2);
  }

  function drawFruit(f) {
    if (!f.active || !f.kind) return;
    ctx.font = `${Math.floor(TILE * 0.9)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(f.kind.icon, f.x * TILE, f.y * TILE);
  }

  function drawPopups(list) {
    ctx.fillStyle = '#00FFFF';
    ctx.font = `bold ${Math.floor(TILE * 0.55)}px Courier New`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of list) ctx.fillText(p.text, p.x * TILE, p.y * TILE);
  }

  /** v = view from game.js: { ST, state, timer, paused, pac, ghosts, fruit, popups, frightTicks, flashTicks,
   *  mazeFlash, deathProgress (null = not in the death animation yet), freeze (ghost-eat pause) } */
  function draw(v) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, M.COLS * TILE, M.ROWS * TILE);
    const flash = v.mazeFlash;
    drawMaze(flash);
    const dp = v.deathProgress;
    if (dp !== null) {                          // dying, after the short freeze: ghosts gone, Pac-Man folds up
      drawDeath(v.pac, dp);
    } else {
      drawFruit(v.fruit);
      const blinkHidden = (v.state === v.ST.READY && v.timer > 60 && Math.floor(v.timer / 10) % 2 === 0) || flash !== null;
      if (!blinkHidden) for (const g of v.ghosts) drawGhost(g, v.frightTicks, v.flashTicks);
      if (!v.freeze) drawPac(v.pac);            // ghost-eat pause: only the points show where they met
      drawPopups(v.popups);
    }
    if (v.paused) drawCentreText('PAUSED');
    else if (v.state === v.ST.READY) drawCentreText('READY!');
  }

  PAC.render = { resize, draw, canvas, get TILE() { return TILE; } };
})(window.PAC = window.PAC || {});
