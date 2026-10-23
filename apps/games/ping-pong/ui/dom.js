/*
 * ========================================================================
 * Ping Pong — ui/dom.js: DOM handles, page title, court fitting, HUD text and drawing.
 * Drawing: the court + effects are the active theme (assets/themes/), paddles / ball are models (assets/models/); draw() calls both.
 * Loaded after core/state.js; the game loop (core/game.js) calls draw() and updateHud().
 * ========================================================================
 */

// --- DOM handles --------------------------------------------------------

const canvas = document.getElementById("court");
const ctx = canvas.getContext("2d");
const hud = document.getElementById("hud");
const topbar = document.getElementById("topbar");
const pauseBtn = document.getElementById("pause-btn");

// Title from APP info
document.querySelector("h1").textContent = APP.name;
document.title = APP.name + " PGQ1c";

// --- Theme -> page chrome -------------------------------------------------

/** Theme ui keys -> CSS custom properties (see :root fallbacks in ui/ping-pong.css). A theme without a key
 *  (Classic has none) keeps the stylesheet default. */
const THEME_VARS = {
  bg: "--pp-bg", text: "--pp-text", hud: "--pp-hud", border: "--pp-border", accent: "--pp-accent",
  btnBg: "--pp-btn-bg", btnText: "--pp-btn-text", panel: "--pp-panel", panelBorder: "--pp-panel-border", scrim: "--pp-scrim",
};

/** Called by PP.setTheme: paint the page chrome for the new theme, drop old effects, redraw. */
PP.onTheme = function (th) {
  const root = document.documentElement;
  for (const k in THEME_VARS) {
    if (th.ui[k]) root.style.setProperty(THEME_VARS[k], th.ui[k]);
    else root.style.removeProperty(THEME_VARS[k]);
  }
  root.setAttribute("data-theme", th.id);
  PP.fx.reset();
  if (typeof refreshPicker === "function") refreshPicker();
};

/** Called by PP.setBall: new ball -> drop the old trail / particles and refresh the picker. */
PP.onBall = function () {
  PP.fx.reset();
  if (typeof refreshPicker === "function") refreshPicker();
};

/** Fit the court to the free space of the page / hub frame (DPR-sharp canvas). */
function fitCourt() {
  const cs = getComputedStyle(document.body);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const gap = parseFloat(cs.rowGap) || 0;
  const border = 4; // canvas border (2px each side)
  const barH = topbar && topbar.offsetParent !== null ? topbar.offsetHeight + gap : 0;
  const availW = Math.max(100, window.innerWidth - padX - border);
  const availH = Math.max(80, window.innerHeight - padY - barH - border);
  const aspect = clamp(availH / availW, CFG.court.minAspect || 0.45, CFG.court.maxAspect || 1);
  const h = Math.round(COURT_W * aspect);
  if (h !== COURT_H) setCourtHeight(h);
  scale = Math.min(availW / COURT_W, availH / COURT_H);
  const cssW = Math.floor(COURT_W * scale);
  const cssH = Math.floor(COURT_H * scale);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / COURT_W, 0, 0, canvas.height / COURT_H, 0, 0);
}

window.addEventListener("resize", fitCourt);

/** Refresh the HUD string (scores + pause) and the hub header stats. */
function updateHud() {
  const extra = paused ? CFG.text.pausedSuffix : "";
  const tag = twoP ? "  ·  " + (CFG.text.twoPlayerTag || "2P") : "";
  hud.textContent = scoreL + CFG.text.scoreSeparator + scoreR + tag + extra;
  if (pauseBtn) {
    const showPlay = paused || !!winner;
    pauseBtn.textContent = showPlay ? "▶" : "⏸";
    const t = showPlay ? (CFG.text.resumeTitle || "Resume") : (CFG.text.pauseTitle || "Pause");
    pauseBtn.title = t;
    pauseBtn.setAttribute("aria-label", t);
  }
  hubSendStats();
}

// --- Draw ---------------------------------------------------------------

/** Centered message on a dimmed court (pause / win). */
function drawMessage(big, small) {
  ctx.fillStyle = PP.theme.colors.shade;
  ctx.fillRect(0, 0, COURT_W, COURT_H);
  ctx.fillStyle = PP.theme.colors.message;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 56px system-ui, sans-serif";
  ctx.fillText(big, COURT_W / 2, COURT_H / 2 - (small ? 22 : 0));
  if (small) {
    ctx.font = "500 22px system-ui, sans-serif";
    ctx.fillText(small, COURT_W / 2, COURT_H / 2 + 30);
  }
}


function draw() {
  const th = PP.theme;
  const e = { W: COURT_W, H: COURT_H, t: PP.fx.t, fx: PP.fx };
  const ball = { x: ballX, y: ballY, r: BALL_R };

  // Court, lines and net (the theme: assets/themes/*.js)
  th.drawCourt(ctx, e);

  // Trail / bounce shadow, under the pieces (the theme)
  if (!winner) th.drawUnder(ctx, e, ball);

  // Paddles (assets/models/paddle.js, coloured by the theme)
  PP.drawPaddle(ctx, PADDLE_MARGIN, leftY, PADDLE_W, PADDLE_H, "L");
  PP.drawPaddle(ctx, COURT_W - PADDLE_MARGIN - PADDLE_W, rightY, PADDLE_W, PADDLE_H, "R");

  // Ball (hidden once the match is over) (the active ball model, assets/models/balls/, coloured by the theme)
  if (!winner) PP.drawBall(ctx, ballX, ballY, BALL_R);

  // Hit effects, over the pieces (the theme)
  th.drawOver(ctx, e);

  if (winner) {
    const big = twoP ? (winner === "L" ? CFG.text.p1Wins : CFG.text.p2Wins)
      : (winner === "L" ? CFG.text.youWin : CFG.text.cpuWins);
    const again = usedTouch ? (CFG.text.tapAgain || CFG.text.playAgain) : CFG.text.playAgain;
    drawMessage(big, scoreL + CFG.text.scoreSeparator + scoreR + "  ·  " + again);
  } else if (paused) {
    drawMessage(CFG.text.paused, "");
  }
}
