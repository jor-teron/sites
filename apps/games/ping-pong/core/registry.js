/*
 * ========================================================================
 * Ping Pong — core/registry.js: where themes and models register themselves (plain script, global PP).
 * Loaded right after core/config.js. assets/ register into it; core/ and ui/ only ask it for the active ones.
 *
 * Contracts (all drawing is canvas code in court units: the canvas is already scaled to fit):
 *   theme   built with PP.makeTheme(spec) (assets/themes/base.js). It draws the court and the effects and
 *           provides colours:  drawCourt(ctx, e)  drawUnder(ctx, e, ball)  drawOver(ctx, e)
 *                              paddleColors(side "L" | "R") -> colours for a paddle model
 *                              ballColors() -> colours for a ball model
 *           e = { W, H, t (frame clock), fx (PP.fx: ball trail + particles) }
 *   paddle  { id, name, draw(ctx, x, y, w, h, col) }   col = theme.paddleColors(side)   (assets/models/paddle.js)
 *   ball    { id, name, draw(ctx, x, y, r, col) }      col = theme.ballColors()         (assets/models/ball.js)
 * Paddle and ball models are separate registries on purpose: later releases (paddle / ball pickers) only add
 * models with PP.registerPaddle / PP.registerBall and set PP.paddleId / PP.ballId.
 * ========================================================================
 */
const PP = {
  themes: [],
  paddles: [],
  balls: [],
  theme: null,            // active theme (set by PP.setTheme)
  paddleId: "standard",   // active paddle model id
  ballId: "standard",     // active ball model id
  fx: null,               // set by ui/fx.js
  onTheme: null,          // set by ui/dom.js: called after the active theme changes

  registerTheme(t) { this.themes.push(t); },
  registerPaddle(m) { this.paddles.push(m); },
  registerBall(m) { this.balls.push(m); },
  getTheme(id) { return this.themes.find(function (t) { return t.id === id; }) || this.themes[0]; },
  getPaddle(id) { return this.paddles.find(function (m) { return m.id === id; }) || this.paddles[0]; },
  getBall(id) { return this.balls.find(function (m) { return m.id === id; }) || this.balls[0]; },

  /** localStorage, never throwing (private mode / blocked storage just means "not saved"). */
  store: {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  },

  /** Activate a theme by id (unknown id -> first theme) and save it unless save === false. */
  setTheme(id, save) {
    this.theme = this.getTheme(id);
    if (save !== false) this.store.set(CFG.themes.key, this.theme.id);
    if (this.onTheme) this.onTheme(this.theme);
  },

  /** The hooks the game and the picker previews draw through (th: optional theme, default the active one). */
  drawPaddle(ctx, x, y, w, h, side, th) {
    th = th || this.theme;
    this.getPaddle(this.paddleId).draw(ctx, x, y, w, h, th.paddleColors(side));
  },
  drawBall(ctx, x, y, r, th) {
    th = th || this.theme;
    this.getBall(this.ballId).draw(ctx, x, y, r, th.ballColors());
  },
};
