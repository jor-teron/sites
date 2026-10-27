/*
 * File: modules/fx.js
 * Project: tennis-throw — TB9
 * Purpose: Modest hit effects: a few particles and a floating "+points" text
 *          per hit. Capped (CFG.fx.maxParticles), halved with lowGraphics.
 *          Moves per second; updated in the loop, drawn by render.js.
 */
(function (TT) {
  const CFG = TT.CFG, game = TT.game;
  const parts = [], texts = [];
  const COLORS = ['#ffd34d', '#ff7a59', '#ffffff', '#7ee081'];

  TT.fx = {
    /** Burst at target t; pts and mult feed the floating label. */
    hit(t, pts, mult) {
      const F = CFG.fx, n = TT.settings.get('lowGraphics') ? F.particlesPerHit / 2 : F.particlesPerHit;
      for (let i = 0; i < n && parts.length < F.maxParticles; i++) {
        const a = Math.random() * Math.PI * 2, s = F.particleSpeed * (0.4 + Math.random() * 0.6);
        parts.push({ x: t.x, y: t.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: F.particleLife, c: COLORS[i % COLORS.length] });
      }
      texts.push({ x: t.x, y: t.y, life: F.textLife, s: '+' + pts + (mult > 1 ? ' ×' + mult.toFixed(1).replace('.0', '') : '') });
    },
    clear() { parts.length = 0; texts.length = 0; },
    /** dt seconds. */
    update(dt) {
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += game.gravity * 0.5 * dt;
      }
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i]; t.life -= dt; t.y -= 50 * dt;
        if (t.life <= 0) texts.splice(i, 1);
      }
    },
    draw(ctx) {
      for (const p of parts) {
        ctx.globalAlpha = Math.max(0, p.life / CFG.fx.particleLife);
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = 'bold 22px sans-serif';
      for (const t of texts) {
        ctx.globalAlpha = Math.max(0, t.life / CFG.fx.textLife);
        ctx.fillStyle = '#000'; ctx.fillText(t.s, t.x + 2, t.y + 2);
        ctx.fillStyle = '#fff'; ctx.fillText(t.s, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    },
  };
})(window.TT);
