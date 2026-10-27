/*
 * File: modules/render.js
 * Project: tennis-throw
 * Purpose: All canvas drawing: sky, targets, balls, aim (crosshair, predicted
 *          arc, power bar, drag line) and the pause / start-hint overlays.
 */
(function (TT) {
  const CFG = TT.CFG, game = TT.game, ctx = TT.ctx, canvas = TT.canvas;

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    const c = TT.settings.get('theme') === 'dark' ? CFG.darkColors : CFG.colors; // TB4/GS1 theme
    g.addColorStop(0, c.skyTop);
    g.addColorStop(1, c.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawTargets() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of game.targets) {
      ctx.font = (t.radius * 2) + 'px ' + CFG.colors.targetFont;
      ctx.fillText(t.emoji, t.x, t.y);
    }
  }

  function drawBalls() {
    for (const b of game.balls) {
      if (b.trailX.length > 0) {   // trail
        ctx.strokeStyle = CFG.colors.trail;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.trailX[0], b.trailY[0]);
        for (let i = 1; i < b.trailX.length; i++) ctx.lineTo(b.trailX[i], b.trailY[i]);
        ctx.stroke();
      }
      ctx.fillStyle = CFG.colors.ball;
      ctx.beginPath();
      ctx.arc(b.x, b.y, CFG.ball.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = CFG.colors.ballOutline;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function drawAim() {
    const A = CFG.aim, { x: sx, y: sy } = TT.launchPoint(), ch = A.crosshairSize;

    // Crosshair
    ctx.strokeStyle = CFG.colors.crosshair;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx - ch, sy); ctx.lineTo(sx + ch, sy);
    ctx.moveTo(sx, sy - ch); ctx.lineTo(sx, sy + ch);
    ctx.stroke();

    // TB3/TB2: dotted predicted arc, using the same exact step as the ball
    const p = Object.assign({ x: sx, y: sy }, TT.aimVelocity());
    const step = A.previewDotEvery, n = Math.round(A.previewSeconds / step);
    ctx.fillStyle = CFG.colors.aimLine;
    game.arcDots = 0;
    for (let i = 1; i <= n; i++) {
      TT.stepBody(p, step);
      if (p.x < 0 || p.x > canvas.width || p.y > canvas.height) break;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 - 1.5 * i / n, 0, Math.PI * 2); // dots shrink along the arc
      ctx.fill();
      game.arcDots++;
    }

    // Power bar (red = strong, green = weak)
    const bw = A.powerBarWidth, by = sy + A.powerBarOffsetY;
    ctx.fillStyle = `rgba(${Math.round(game.aimPower * 255)}, ${Math.round((1 - game.aimPower) * 255)}, 0, 0.8)`;
    ctx.fillRect(sx - bw / 2, by, game.aimPower * bw, A.powerBarHeight);
    ctx.strokeStyle = CFG.colors.powerBarOutline;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - bw / 2, by, bw, A.powerBarHeight);

    // TB5: while dragging, draw the pull-back band from the launch point
    // (behind the ball, opposite the throw) and the power as a percentage
    if (game.drag) {
      const r = game.aimAngle * Math.PI / 180, len = game.aimPower * CFG.drag.bandMaxPx;
      const bx = sx - Math.cos(r) * len, byy = sy + Math.sin(r) * len;
      ctx.strokeStyle = CFG.drag.lineColor;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(sx - 14, sy); ctx.lineTo(bx, byy); ctx.lineTo(sx + 14, sy); ctx.stroke();
      ctx.fillStyle = CFG.colors.ball;
      ctx.beginPath(); ctx.arc(bx, byy, 6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(game.aimPower * 100) + '%', sx + bw / 2 + 28, by + A.powerBarHeight / 2);
    }
  }

  /** Dim the screen and print centred lines of text. */
  function overlay(lines) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => {
      ctx.font = i === 0 ? 'bold 28px sans-serif' : '18px sans-serif';
      ctx.fillText(l, canvas.width / 2, canvas.height / 2 + i * 36);
    });
  }

  /** Draw one full frame. */
  TT.draw = function () {
    drawSky();
    drawTargets();
    drawBalls();
    if (!game.isFinished) drawAim();
    if (game.isPaused) {
      overlay([CFG.text.paused, CFG.text.pausedHint, CFG.text.pausedTouch]);
    } else if (TT.settings.get('showHints') && game.isRunning && game.clock < CFG.text.startHintSeconds) {
      // TB2: start hint for touch players (no overlay, play is live)
      ctx.fillStyle = TT.settings.get('theme') === 'dark' ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.55)'; // TB4: readable on dark sky
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(CFG.text.startTouch, canvas.width / 2, 24);
    }
    // TB4/GS1: small FPS counter (measured draw rate) when 'showFps' is on
    if (TT.settings.get('showFps')) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(canvas.width / 2 - 40, 42, 80, 20); // top centre, under the start hint
      ctx.fillStyle = '#fff';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(game.fps || 0) + '/' + TT.settings.fps() + ' fps', canvas.width / 2, 52);
    }
  };
})(window.TT);
