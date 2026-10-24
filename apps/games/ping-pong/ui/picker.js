/*
 * ========================================================================
 * Ping Pong — ui/picker.js: the theme picker (button + panel), plain script.
 * A small "Themes" button opens a dialog with three sections: "Theme" (one card per registered theme), "Ball" (one card
 * per registered ball model) and "Paddle" (one per paddle model). Each card has a small canvas preview drawn with the real code (theme: court + effects + the
 * active paddle / ball models; ball: the model + its own trail and particles; paddle: the model, one idle and one just hit, on the
 * active theme's court). Picking a card applies and saves it (PP.setTheme -> "ping-pong.theme", PP.setBall -> "ping-pong.ball",
 * PP.setPaddle -> "ping-pong.paddle"), independently of the others, and CLOSES the panel.
 * Touch + mouse + keyboard: cards are buttons; Esc / the close button / a tap on the scrim close; Tab stays inside.
 * While the panel is open it keeps the keys from the game (keydown stops here); opening it pauses a running match.
 * Needs core/registry.js + the themes + ui/dom.js; loaded after core/input.js. The button is hidden in the hub
 * (ui/ping-pong.css) — the hub header owns that frame — and its "Customize" button opens the same panel through
 * PP.openPicker() (called by ui/hub.js); the saved theme / ball / paddle apply there too.
 * ========================================================================
 */
(function () {
  const btn = document.getElementById("theme-btn");
  const panel = document.getElementById("theme-panel");
  const list = document.getElementById("theme-list");
  const ballList = document.getElementById("ball-list");
  const paddleList = document.getElementById("paddle-list");
  const closeBtn = document.getElementById("theme-close");
  const T = CFG.themes.text;
  if (!btn || !panel || !list) return;

  btn.textContent = T.button;
  document.getElementById("theme-title").textContent = T.title;
  document.getElementById("theme-sec").textContent = T.section;
  document.getElementById("ball-sec").textContent = CFG.balls.text.section;
  document.getElementById("paddle-sec").textContent = CFG.paddles.text.section;
  closeBtn.setAttribute("aria-label", T.close);
  closeBtn.title = T.close;

  const PW = 800, PH = 500;                 // preview court (court units); the canvas scales it down
  let cards = [], ballCards = [], paddleCards = [];
  const IDLE = { side: "L", fx: null, age: 999, y: 0.5, n: 0 };   // a paddle at rest, for the previews

  /** A frozen "fx" for a preview of theme th with ball model m: the trail along a curve, a hit burst and a few
   *  emitted particles (all from the real effect code, seeded locally), and a fixed spin. */
  function previewFx(th, m, cx, cy, span, hx, hy) {
    const fx = { t: 40, trail: [], parts: [], spin: 0.6 };
    const f = PP.ballFx(th, m);
    const seed = { v: 7, rand() { this.v = (this.v * 16807) % 2147483647; return this.v / 2147483647; } };
    fx.rand = function () { return seed.rand(); };
    const n = f.trail ? f.trail.len : 0;
    for (let i = 0; i < n; i++) {
      const k = (i - n) / 14;
      fx.trail.push({ x: cx + k * span, y: cy + (18 - k * 70 + Math.sin(k * 3) * 14) * span / 190 });
    }
    if (f.emit) {
      for (let i = 0; i < 7; i++) {
        const tp = fx.trail[Math.floor(i * (n - 1) / 6)] || { x: cx - 30 * i, y: cy };
        PP.spawnEmit(f.emit, fx, tp.x, tp.y);
      }
      fx.parts.forEach(function (p) { p.life = Math.round(p.max * 0.7); });
    }
    if (f.hit) {
      const from = fx.parts.length;
      PP.spawnHit(f.hit, fx, hx, hy, "paddle", -1, 0);
      fx.parts.slice(from).forEach(function (p) { p.life = Math.round(p.max * 0.6); p.x += p.vx * 5; p.y += p.vy * 5; });
    }
    return fx;
  }

  /** Size a preview canvas (DPR-aware) and return its context, scaled to the 800x500 preview court. */
  function sizeCanvas(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = cv.clientWidth || 160;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssW * dpr * PH / PW);
    const c = cv.getContext("2d");
    c.setTransform(cv.width / PW, 0, 0, cv.height / PH, 0, 0);
    return c;
  }

  /** Theme preview: the court, paddles and the ACTIVE ball with its effects. */
  function drawPreview(cv, th) {
    const c = sizeCanvas(cv);
    const m = PP.getBall(PP.ballId);
    const fx = previewFx(th, m, 540, 232, 190, 696, 330);
    const e = { W: PW, H: PH, t: fx.t, fx: fx, model: m };
    const ball = { x: 540, y: 232, r: BALL_R * 1.5 };
    th.drawCourt(c, e);
    th.drawUnder(c, e, ball);
    PP.drawPaddle(c, PADDLE_MARGIN, 150, PADDLE_W, 150, "L", th, Object.assign({}, IDLE, { fx: fx }));
    PP.drawPaddle(c, PW - PADDLE_MARGIN - PADDLE_W, 290, PADDLE_W, 150, "R", th, Object.assign({}, IDLE, { side: "R", fx: fx }));
    PP.drawBall(c, ball.x, ball.y, ball.r, th, fx, m);
    th.drawOver(c, e);
  }

  /** Ball preview: the model, magnified, with its own trail / particles, on the ACTIVE theme's court. */
  function drawBallPreview(cv, m) {
    const c = sizeCanvas(cv);
    const th = PP.theme;
    const Z = 2.5, bx = 450, by = 232;
    const fx = previewFx(th, m, bx, by, 100, 530, 290);
    const e = { W: PW, H: PH, t: fx.t, fx: fx, model: m };
    const ball = { x: bx, y: by, r: BALL_R * 2.2 };
    c.save();
    c.beginPath();
    c.rect(0, 0, PW, PH);
    c.clip();
    c.translate(PW / 2, PH / 2);                           // zoom around the court middle
    c.scale(Z, Z);
    c.translate(-PW / 2, -PH / 2);
    th.drawCourt(c, e);
    th.drawUnder(c, e, ball);
    PP.drawBall(c, ball.x, ball.y, ball.r, th, fx, m);
    th.drawOver(c, e);
    c.restore();
  }

  /** Paddle preview: the model on the ACTIVE theme's court, magnified; the left one at rest, the right one just hit
   *  (pulse / crack / flare, with its own hit particles and embers, from the real model code, seeded locally). */
  function drawPaddlePreview(cv, m) {
    const c = sizeCanvas(cv);
    const th = PP.theme;
    const Z = 2.6, ph = 150, py = 175, lx = 250, rx = 530;
    const seed = { v: 11 };
    const fx = { t: 40, trail: [], parts: [], spin: 0, rand: function () { seed.v = (seed.v * 16807) % 2147483647; return seed.v / 2147483647; } };
    const hy = py + ph * 0.4;
    if (m.emit) for (let i = 0; i < 9; i++) PP.spawnEmit(m.emit, fx, lx + PADDLE_W / 2, py + fx.rand() * ph);
    if (m.emit) for (let i = 0; i < 9; i++) PP.spawnEmit(m.emit, fx, rx + PADDLE_W / 2, py + fx.rand() * ph);
    fx.parts.forEach(function (p) { p.life = Math.round(p.max * (0.3 + 0.7 * fx.rand())); p.x += p.vx * 4; p.y += p.vy * 4 - 6; });
    if (m.hit) {
      const from = fx.parts.length;
      PP.spawnHit(m.hit, fx, rx, hy, "paddle", -1, 0);
      fx.parts.slice(from).forEach(function (p) { p.life = Math.round(p.max * 0.65); p.x += p.vx * 4; p.y += p.vy * 4; });
    }
    const e = { W: PW, H: PH, t: fx.t, fx: fx, model: PP.getBall(PP.ballId) };
    c.save();
    c.beginPath();
    c.rect(0, 0, PW, PH);
    c.clip();
    c.translate(PW / 2, PH / 2);
    c.scale(Z, Z);
    c.translate(-PW / 2, -PH / 2);
    th.drawCourt(c, e);
    PP.drawPaddle(c, lx, py, PADDLE_W, ph, "L", th, Object.assign({}, IDLE, { fx: fx }), m);
    PP.drawPaddle(c, rx, py, PADDLE_W, ph, "R", th, { side: "R", fx: fx, age: 4, y: 0.4, n: 3 }, m);
    th.drawOver(c, e);
    c.restore();
  }

  function card(list, cls, attr, id, name, onPick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "theme-card" + cls;
    b.setAttribute(attr, id);
    const cv = document.createElement("canvas");
    const label = document.createElement("span");
    label.textContent = name;
    b.appendChild(cv);
    b.appendChild(label);
    b.addEventListener("click", onPick);
    list.appendChild(b);
    return { id: id, el: b, cv: cv };
  }

  function build() {
    list.textContent = "";
    ballList.textContent = "";
    paddleList.textContent = "";
    cards = PP.themes.map(function (th) {
      const c = card(list, "", "data-theme-id", th.id, th.name, function () { pickTheme(th.id); });
      c.th = th;
      return c;
    });
    ballCards = PP.balls.map(function (m) {
      const c = card(ballList, " ball-card", "data-ball-id", m.id, m.name, function () { pickBall(m.id); });
      c.m = m;
      return c;
    });
    // Kept for later: hidden in PPQ1a, will return when paddles grow to 10 items.
    // Only the visible models get a card: Ice Slab, Flame Blade, Neon Bar and Table Tennis Bat carry `hidden: true`
    // (their files still load); PP.visiblePaddles() leaves them out. Remove the flag to bring one back.
    paddleCards = PP.visiblePaddles().map(function (m) {
      const c = card(paddleList, " paddle-card", "data-paddle-id", m.id, m.name, function () { pickPaddle(m.id); });
      c.m = m;
      return c;
    });
    refreshPicker();
  }

  /** Mark the active cards (called from PP.onTheme / PP.onBall too). */
  window.refreshPicker = function () {
    cards.forEach(function (c) { c.el.setAttribute("aria-pressed", String(PP.theme && PP.theme.id === c.id)); });
    ballCards.forEach(function (c) { c.el.setAttribute("aria-pressed", String(PP.ballId === c.id)); });
    paddleCards.forEach(function (c) { c.el.setAttribute("aria-pressed", String(PP.paddleId === c.id)); });
  };

  function paintPreviews() {
    cards.forEach(function (c) { drawPreview(c.cv, c.th); });
    ballCards.forEach(function (c) { drawBallPreview(c.cv, c.m); });
    paddleCards.forEach(function (c) { drawPaddlePreview(c.cv, c.m); });
  }

  function isOpen() { return !panel.classList.contains("hidden"); }

  function open() {
    if (!paused && !winner) togglePause();     // do not lose a point behind the panel
    panel.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    paintPreviews();                           // sized now that the panel is visible
    const cur = cards.find(function (c) { return PP.theme && PP.theme.id === c.id; });
    (cur || cards[0]).el.focus();
  }

  function close() {
    if (!isOpen()) return;
    panel.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
    btn.blur();                                // Space / Enter keep going to the game
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }

  // Public handles for the hub bridge (ui/hub.js): the hub header's Customize button opens the same panel.
  PP.openPicker = function () { if (!isOpen()) open(); };
  PP.closePicker = close;
  PP.pickerOpen = isOpen;

  function pickTheme(id) { PP.setTheme(id); close(); }
  function pickBall(id) { PP.setBall(id); close(); }
  function pickPaddle(id) { PP.setPaddle(id); close(); }

  btn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  btn.addEventListener("click", function () { if (isOpen()) close(); else open(); });
  closeBtn.addEventListener("click", close);
  // a tap on the dimmed scrim (not on the sheet) closes
  panel.addEventListener("click", function (e) { if (e.target === panel) close(); });
  // the document blocks touchmove for the game; let the panel body scroll on a short screen
  panel.addEventListener("touchmove", function (e) { e.stopPropagation(); }, { passive: true });

  // While open: Esc closes, Tab stays inside the panel, and no key reaches the game.
  document.addEventListener("keydown", function (e) {
    if (!isOpen()) return;
    if (e.key === "Escape" || e.code === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab" || e.code === "Tab") {
      const f = Array.prototype.slice.call(panel.querySelectorAll("button"));
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
    }
    e.stopPropagation();
  });

  build();
})();
