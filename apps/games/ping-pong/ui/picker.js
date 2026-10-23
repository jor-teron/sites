/*
 * ========================================================================
 * Ping Pong — ui/picker.js: the theme picker (button + panel), plain script.
 * A small "Themes" button opens a dialog with one card per registered theme; each card has a small canvas preview
 * drawn with the theme's real code (court, effects, and the paddle / ball models). Picking a card applies and saves
 * the theme (PP.setTheme -> localStorage "ping-pong.theme") and CLOSES the panel.
 * Touch + mouse + keyboard: cards are buttons; Esc / the close button / a tap on the scrim close; Tab stays inside.
 * While the panel is open it keeps the keys from the game (keydown stops here); opening it pauses a running match.
 * Needs core/registry.js + the themes + ui/dom.js; loaded after core/input.js. The button is hidden in the hub
 * (ui/ping-pong.css) — the hub header owns that frame — but the saved theme still applies there.
 * ========================================================================
 */
(function () {
  const btn = document.getElementById("theme-btn");
  const panel = document.getElementById("theme-panel");
  const list = document.getElementById("theme-list");
  const closeBtn = document.getElementById("theme-close");
  const T = CFG.themes.text;
  if (!btn || !panel || !list) return;

  btn.textContent = T.button;
  document.getElementById("theme-title").textContent = T.title;
  closeBtn.setAttribute("aria-label", T.close);
  closeBtn.title = T.close;

  const PW = 800, PH = 500;                 // preview court (court units); the canvas scales it down
  let cards = [];

  /** A frozen "fx" for a preview: a trail along a curve and a few particles, so the card shows the theme's effects. */
  function previewFx(th) {
    const fx = { t: 40, trail: [], parts: [] };
    const n = th.trail ? th.trail.len : 0;
    for (let i = 0; i < n; i++) {
      const k = (i - n) / 14;
      fx.trail.push({ x: 470 + k * 190, y: 250 - k * 70 + Math.sin(k * 3) * 14 });
    }
    if (th.hit) {
      const seed = { v: 7, rand() { this.v = (this.v * 16807) % 2147483647; return this.v / 2147483647; } };
      fx.rand = function () { return seed.rand(); };
      th.spawnHit(fx, 700 - 4, 330, "paddle", -1, 0);
      fx.parts.forEach(function (p) { p.life = Math.round(p.max * 0.6); p.x += p.vx * 5; p.y += p.vy * 5; });
    }
    return fx;
  }

  /** Draw one theme preview into a canvas (DPR-aware). */
  function drawPreview(cv, th) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = cv.clientWidth || 160;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssW * dpr * PH / PW);
    const c = cv.getContext("2d");
    c.setTransform(cv.width / PW, 0, 0, cv.height / PH, 0, 0);
    const fx = previewFx(th);
    const e = { W: PW, H: PH, t: fx.t, fx: fx };
    const ball = { x: 540, y: 232, r: BALL_R * 1.5 };
    th.drawCourt(c, e);
    th.drawUnder(c, e, ball);
    PP.drawPaddle(c, PADDLE_MARGIN, 150, PADDLE_W, 150, "L", th);
    PP.drawPaddle(c, PW - PADDLE_MARGIN - PADDLE_W, 290, PADDLE_W, 150, "R", th);
    PP.drawBall(c, ball.x, ball.y, ball.r, th);
    th.drawOver(c, e);
  }

  function build() {
    list.textContent = "";
    cards = PP.themes.map(function (th) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "theme-card";
      b.setAttribute("data-theme-id", th.id);
      const cv = document.createElement("canvas");
      const label = document.createElement("span");
      label.textContent = th.name;
      b.appendChild(cv);
      b.appendChild(label);
      b.addEventListener("click", function () { pick(th.id); });
      list.appendChild(b);
      return { id: th.id, el: b, cv: cv, th: th };
    });
    refreshPicker();
  }

  /** Mark the active card (called from PP.onTheme too). */
  window.refreshPicker = function () {
    cards.forEach(function (c) { c.el.setAttribute("aria-pressed", String(PP.theme && PP.theme.id === c.id)); });
  };

  function paintPreviews() { cards.forEach(function (c) { drawPreview(c.cv, c.th); }); }

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

  function pick(id) {
    PP.setTheme(id);
    close();
  }

  btn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  btn.addEventListener("click", function () { if (isOpen()) close(); else open(); });
  closeBtn.addEventListener("click", close);
  // a tap on the dimmed scrim (not on the sheet) closes
  panel.addEventListener("click", function (e) { if (e.target === panel) close(); });
  // the document blocks touchmove for the game; let the card list scroll on a short screen
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
