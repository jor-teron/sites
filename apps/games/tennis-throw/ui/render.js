/*
 * File: ui/render.js
 * Project: tennis-throw
 * Purpose: All canvas drawing: sky, targets, balls, aim (crosshair, predicted
 *          arc, power bar, pull-back band) and the pause / start-hint overlays.
 *          TB9: clouds, grass + clay court, spinning ball with seam, spawn pop, fx.
 */
(function (TT) {
  const CFG = TT.CFG, game = TT.game, ctx = TT.ctx, canvas = TT.canvas;

  // TB9: static scenery is drawn once to an offscreen canvas per theme (cheap per frame)
  let scene = null, sceneTheme = null;
  function buildScene(dark) {
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
    const g = c.getContext('2d'), W = c.width, H = c.height, C = CFG.colors, S = dark ? CFG.darkColors : C;
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, S.skyTop); grad.addColorStop(1, S.skyBottom);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = dark ? 'rgba(255,255,255,0.12)' : C.cloud;
    [[120, 110, 1], [560, 80, 1.3], [380, 190, 0.8], [700, 220, 0.9]].forEach(([x, y, k]) => {
      g.beginPath(); g.arc(x, y, 22 * k, 0, 7); g.arc(x + 26 * k, y - 10 * k, 28 * k, 0, 7); g.arc(x + 56 * k, y, 22 * k, 0, 7); g.fill();
    });
    const gy = H - 24;
    g.fillStyle = dark ? '#1f4d27' : C.ground; g.fillRect(0, gy, W, 24);
    g.fillStyle = dark ? '#7a4127' : C.court;              // clay court (perspective trapezoid)
    g.beginPath(); g.moveTo(W / 2 - 150, H); g.lineTo(W / 2 - 100, gy - 30); g.lineTo(W / 2 + 100, gy - 30); g.lineTo(W / 2 + 150, H); g.fill();
    g.strokeStyle = C.courtLine; g.lineWidth = 2;
    g.beginPath(); g.moveTo(W / 2 - 150, H); g.lineTo(W / 2 - 100, gy - 30); g.lineTo(W / 2 + 100, gy - 30); g.lineTo(W / 2 + 150, H);
    g.moveTo(W / 2, gy - 30); g.lineTo(W / 2, H); g.moveTo(W / 2 - 125, gy - 2); g.lineTo(W / 2 + 125, gy - 2); g.stroke();
    return c;
  }
  function drawSky() {
    const dark = TT.settings.get('theme') === 'dark'; // TB4/GS1 theme
    if (!scene || sceneTheme !== dark) { scene = buildScene(dark); sceneTheme = dark; }
    ctx.drawImage(scene, 0, 0);
  }

  function drawTargets() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of game.targets) {
      const age = (game.clock || 0) - (t.born || 0), k = age < 0.25 ? 0.4 + 0.6 * age / 0.25 : 1; // TB9: spawn pop
      ctx.font = Math.round(t.radius * 2 * k) + 'px ' + CFG.colors.targetFont;
      ctx.fillText(t.emoji, t.x, t.y);
    }
  }

  function drawBalls() {
    const R = CFG.ball.radius;
    for (const b of game.balls) {
      const n = b.trailX.length;
      ctx.fillStyle = CFG.colors.trail;     // TB9: fading dot trail (cheap, no per-segment stroke)
      for (let i = 0; i < n; i += 2) {
        ctx.globalAlpha = (i + 1) / n;
        ctx.beginPath(); ctx.arc(b.trailX[i], b.trailY[i], R * (0.3 + 0.5 * i / n), 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = CFG.colors.ball;
      ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = CFG.colors.ballOutline; ctx.lineWidth = 2; ctx.stroke();
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.spin || 0);   // TB9: spinning seam
      ctx.strokeStyle = CFG.colors.seam; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(-R * 1.1, 0, R * 0.8, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(R * 1.1, 0, R * 0.8, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();
      ctx.restore();
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
      TT.bounceWalls(p, canvas.width);   // TB6: preview follows the wall bounce
      if (p.y > canvas.height) break;
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
    if (TT.fx) TT.fx.draw(ctx);   // TB9
    if (!game.isFinished) drawAim();
    if (game.banner > 0 && !game.isFinished) {   // TB8: round banner
      ctx.globalAlpha = Math.min(1, game.banner * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, canvas.height / 2 - 50, canvas.width, 100);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillText('Round ' + game.round, canvas.width / 2, canvas.height / 2 - 14);
      ctx.font = '20px sans-serif';
      ctx.fillText('Score ' + game.roundGoal + ' in ' + game.roundSeconds + 's', canvas.width / 2, canvas.height / 2 + 24);
      ctx.globalAlpha = 1;
    }
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
