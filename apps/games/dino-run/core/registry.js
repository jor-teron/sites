/**
 * Dino Run — registry. Models (dinos, obstacles, background pieces) and themes register themselves here
 * from assets/; core/logic.js and ui/picker.js only ask the registry for the active ones.
 *
 * Contracts (all drawing is canvas code, in CSS px; the canvas is already scaled by devicePixelRatio):
 *   dino      { id, name, draw(ctx, d, th), eye(d) -> [x, y] relative to d.x, d.y }
 *               d = { x, y, w, h, pose: 'run'|'jump'|'duck'|'dead', phase (run cycle, +1 per step), t (clock, s),
 *                     airT (s since take-off), deadT (s since death), vy, onGround, shield }
 *               The hitbox is d.x, d.y, d.w (44), d.h (48 / 28 ducking): art only, never gameplay.
 *   obstacle  { id, kind: 'ground'|'air', draw(ctx, o, env, th) }       o = { x, y, w, h, flap, v }
 *   bg model  DR.bg.ground / clouds / sunmoon / stars / scenery / particles  (style functions)
 *   theme     built with DR.makeTheme(spec) (assets/themes/base.js)
 */
const DR = {
  dinos: [],
  themes: [],
  obstacles: {},
  bg: {},
  game: null, // set by core/logic.js
  ui: null,   // set by ui/picker.js
  registerDino(d) { this.dinos.push(d); },
  registerTheme(t) { this.themes.push(t); },
  registerObstacle(o) { this.obstacles[o.id] = o; },
  getDino(id) { return this.dinos.find((d) => d.id === id) || this.dinos[0]; },
  getTheme(id) { return this.themes.find((t) => t.id === id) || this.themes[0]; },
};
