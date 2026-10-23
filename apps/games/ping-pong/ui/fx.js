/*
 * ========================================================================
 * Ping Pong — ui/fx.js: visual-only effect state (ball trail + hit particles), global PP.fx.
 * Cosmetic: it never changes the game. It reads ballX / ballY but never writes game state, and it uses
 * its own tiny random generator, so Math.random (the serve) is untouched and a theme can never change a match.
 * core/game.js calls PP.fx.step() once per frame, PP.fx.hit() on a bounce / point and PP.fx.reset() on a serve;
 * the active theme decides what (if anything) is drawn from it (assets/themes/base.js).
 * ========================================================================
 */
(function () {
  let seed = 20261023;
  const MAX_PARTS = 90;

  PP.fx = {
    t: 0,          // frame clock (counts frames while the game is not paused)
    trail: [],     // recent ball centres, oldest first: { x, y }
    parts: [],     // live particles: { x, y, vx, vy, life, max, kind, color, size, glow }

    /** Deterministic 0..1 (LCG), separate from Math.random. */
    rand() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    },

    reset() {
      this.trail.length = 0;
      this.parts.length = 0;
    },

    /** One frame. `ticking`: the ball is in play, so the trail grows. Particles age unless paused. */
    step(ticking) {
      if (paused) return;
      this.t++;
      const tr = PP.theme && PP.theme.trail;
      const n = tr ? tr.len : 0;
      if (ticking && n > 0) this.trail.push({ x: ballX, y: ballY });
      else if (this.trail.length) this.trail.shift();
      while (this.trail.length > n) this.trail.shift();
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.94; p.vy *= 0.94;
        if (--p.life <= 0) this.parts.splice(i, 1);
      }
    },

    /** A bounce or point at (x, y); (nx, ny) = direction away from the surface. kind: "paddle" | "wall" | "score". */
    hit(x, y, kind, nx, ny) {
      const th = PP.theme;
      if (!th || !th.hit) return;
      th.spawnHit(this, x, y, kind, nx, ny);
    },
  };
})();
