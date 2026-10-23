/* Desert Road — drawing: road, obstacles, player car, pause screen. */
(() => {
  const DR = window.DR, CFG = DR.CFG, ctx = DR.ctx, state = DR.state, view = DR.view;

  /** Sprite scale: device pixels per CSS px (crisp on hi-DPI). */
  const scale = () => Math.max(1, Math.ceil(view.DPR));

  function drawRoad() {
    const { W, H } = view;
    ctx.fillStyle = view.sandGrad;
    ctx.fillRect(0, 0, W, H);

    const roadX = view.road.x, roadW = view.road.w;
    ctx.fillStyle = CFG.colors.road;
    ctx.fillRect(roadX, 0, roadW, H);

    ctx.strokeStyle = CFG.colors.roadEdge;
    ctx.lineWidth = CFG.road.edgeWidth;
    ctx.setLineDash(CFG.road.edgeDash);
    ctx.beginPath();
    ctx.moveTo(roadX, 0); ctx.lineTo(roadX, H);
    ctx.moveTo(roadX + roadW, 0); ctx.lineTo(roadX + roadW, H);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = CFG.colors.stripe;
    ctx.lineWidth = CFG.road.stripeWidth;
    ctx.setLineDash(CFG.road.stripeDash);
    ctx.lineDashOffset = -state.roadOffset;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  function drawObstacles() {
    const s = scale();
    for (const o of state.obstacles) {
      const sp = DR.sprites.obstacle(o.type, s);
      ctx.drawImage(sp.canvas, o.x - sp.pad, o.y - sp.pad, sp.w, sp.h);
    }
  }

  function drawCar() {
    const c = state.car, C = CFG.car;
    const lag = c.targetX - c.x;                         // steering lag -> visual yaw / roll
    const tilt = DR.clamp(lag * C.tiltPerPx, -C.maxTilt, C.maxTilt);
    const steering = state.running && (state.keys.left || state.keys.right || state.touchLeft || state.touchRight);
    const sp = DR.sprites.car(DR.carColor, scale());

    ctx.save();
    ctx.translate(c.x, c.y);
    // soft shadow, pushed outward on the side the body rolls toward
    ctx.save();
    ctx.translate(-tilt * 30 + 3, 6);
    ctx.fillStyle = CFG.colors.carShadow;
    ctx.shadowColor = CFG.colors.carShadow;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.ellipse(0, 0, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.rotate(tilt);
    ctx.drawImage(sp.canvas, -c.w / 2 - sp.pad, -c.h / 2 - sp.pad, sp.w, sp.h);

    // roll: lighten the leading side, darken the trailing side
    if (Math.abs(tilt) > 0.005) {
      const a = Math.abs(tilt) / C.maxTilt * 0.22;
      const gr = ctx.createLinearGradient(-c.w / 2, 0, c.w / 2, 0);
      const lit = 'rgba(255,255,255,' + a + ')', dim = 'rgba(0,0,0,' + a + ')';
      gr.addColorStop(0, tilt > 0 ? dim : lit);
      gr.addColorStop(0.5, 'rgba(0,0,0,0)');
      gr.addColorStop(1, tilt > 0 ? lit : dim);
      ctx.fillStyle = gr;
      ctx.fillRect(-c.w / 2, -c.h / 2 + 4, c.w, c.h - 8);
    }

    // headlight beams
    ctx.globalCompositeOperation = 'lighter';
    for (const x of [-c.w * 0.3, c.w * 0.3]) {
      const g = ctx.createRadialGradient(x, -c.h / 2, 0, x, -c.h / 2 - 6, 16);
      g.addColorStop(0, 'rgba(255,245,200,0.55)');
      g.addColorStop(1, 'rgba(255,245,200,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 16, -c.h / 2 - 22, 32, 26);
    }
    // brake / tail lights: glow while steering
    const glow = steering ? 1 : 0.35;
    for (const x of [-c.w * 0.32, c.w * 0.32]) {
      const g = ctx.createRadialGradient(x, c.h / 2 - 1, 0, x, c.h / 2 - 1, steering ? 12 : 6);
      g.addColorStop(0, 'rgba(255,40,30,' + (0.9 * glow) + ')');
      g.addColorStop(1, 'rgba(255,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 12, c.h / 2 - 13, 24, 24);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  DR.render = {
    draw() { drawRoad(); drawObstacles(); drawCar(); },
    drawPaused() {
      const { W, H } = view;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(CFG.text.paused, W / 2, H / 2);
    },
  };
})();
