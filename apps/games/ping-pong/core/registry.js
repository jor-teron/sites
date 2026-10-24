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
 *   paddle  { id, name, draw(ctx, x, y, w, h, col, st), hit?, emit? }   (assets/models/paddles/*.js)
 *           col = theme.paddleColors(side); (x, y) = top-left of the paddle's collision rectangle (w x h) — the model draws
 *           within it (glow / sparks / flames may go beyond: purely visual). st = { side "L"|"R", fx (PP.fx), age (frames
 *           since this paddle last hit the ball, 999 = long ago), y (0..1 where along the paddle the ball hit), n (hit counter) }
 *           for a short pulse / flex animation (PP.pulse). hit = the paddle's OWN hit particles (a PP.spawnHit spec, spawned
 *           at the paddle face on top of the ball's / theme's); emit = a PP.spawnEmit spec, a particle per paddle every few frames.
 *   ball    { id, name, draw(ctx, x, y, r, col, fx), trail?, hit?, shadow?, emit? }   (assets/models/balls/*.js)
 *           col = theme.ballColors(); fx = PP.fx (fx.t frame clock, fx.spin = rolling angle). The model draws within the
 *           ball's collision radius r (glow / trail are purely visual). trail / hit / shadow / emit are the ball's OWN
 *           effects (same specs as a theme's, see assets/themes/base.js; emit = a particle every few frames while
 *           it moves); a key the model leaves out (undefined) falls back to the THEME's — null means "none".
 * Theme, ball and paddle are three separate picks: PP.setTheme -> "ping-pong.theme", PP.setBall(id) -> PP.ballId ("ping-pong.ball"),
 * PP.setPaddle(id) -> PP.paddleId ("ping-pong.paddle"). None forces another.
 * ========================================================================
 */
const PP = {
  themes: [],
  paddles: [],
  balls: [],
  theme: null,            // active theme (set by PP.setTheme)
  paddleId: "classic",    // active paddle model id
  ballId: "classic",      // active ball model id
  fx: null,               // set by ui/fx.js
  onTheme: null,          // set by ui/dom.js: called after the active theme changes
  onBall: null,           // set by ui/dom.js: called after the active ball changes
  onPaddle: null,         // set by ui/dom.js: called after the active paddle changes

  registerTheme(t) { this.themes.push(t); },
  registerPaddle(m) { this.paddles.push(m); },
  registerBall(m) { this.balls.push(m); },
  getTheme(id) { return this.themes.find(function (t) { return t.id === id; }) || this.themes[0]; },
  getPaddle(id) { return this.paddles.find(function (m) { return m.id === id; }) || this.paddles[0]; },
  /** The paddles the picker offers: every registered model except those marked `hidden: true` (PPQ1a). */
  visiblePaddles() { return this.paddles.filter(function (m) { return !m.hidden; }); },
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

  /** Activate a ball model by id (unknown id -> first registered = Classic) and save it unless save === false. */
  setBall(id, save) {
    this.ballId = this.getBall(id).id;
    if (save !== false) this.store.set(CFG.balls.key, this.ballId);
    if (this.onBall) this.onBall(this.getBall(this.ballId));
  },

  /** Activate a paddle model by id (unknown id -> first registered = Classic Bar) and save it unless save === false.
   *  A hidden model's id is migrated (CFG.paddles.migrate) and the new id saved; any other hidden id -> the default. */
  setPaddle(id, save) {
    const to = CFG.paddles.migrate && CFG.paddles.migrate[id];
    let m = this.getPaddle(to || id);
    if (m.hidden) m = this.getPaddle(CFG.paddles.default);
    this.paddleId = m.id;
    if (save !== false || to) this.store.set(CFG.paddles.key, this.paddleId);
    if (this.onPaddle) this.onPaddle(this.getPaddle(this.paddleId));
  },

  /** The effects in force for a theme + ball model: the model's own, else the theme's (model: default the active ball). */
  ballFx(th, model) {
    const m = model || this.getBall(this.ballId);
    const pick = function (k) { return m[k] !== undefined ? m[k] : th[k]; };
    return { trail: pick("trail"), hit: pick("hit"), shadow: pick("shadow"), emit: m.emit || null };
  },

  /** The hooks the game and the picker previews draw through (th: optional theme, default the active one). */
  drawPaddle(ctx, x, y, w, h, side, th, st, model) {
    th = th || this.theme;
    st = st || this.fx.paddleState(side);
    (model || this.getPaddle(this.paddleId)).draw(ctx, x, y, w, h, th.paddleColors(side), st);
  },
  drawBall(ctx, x, y, r, th, fx, model) {
    th = th || this.theme;
    (model || this.getBall(this.ballId)).draw(ctx, x, y, r, th.ballColors(), fx || this.fx);
  },
};
