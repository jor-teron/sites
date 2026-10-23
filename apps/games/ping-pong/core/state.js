/*
 * ========================================================================
 * Ping Pong — core/state.js: constants from PONG_CONFIG, mutable game state, court size.
 * No DOM here (the handles live in ui/dom.js). Loaded after core/config.js.
 * The court is COURT_W x COURT_H game units; COURT_H follows the free space
 * (court.minAspect … maxAspect) and the canvas is scaled to fit (fitCourt, ui/dom.js).
 * ========================================================================
 */

const CFG = PONG_CONFIG;
const APP = CFG.APP || { name: "Ping Pong", version: "" };
const WIN_SCORE = Number(CFG.WIN_SCORE) || 0;
const TOUCH = CFG.touch || {};

// --- Court constants (from config) --------------------------------------

const COURT_W = CFG.court.width;
const BASE_H = CFG.court.baseHeight || 480;
const PADDLE_W = CFG.paddle.width;
const PADDLE_MARGIN = CFG.paddle.margin;
const BALL_R = CFG.ball.radius;
const BALL_SPEED = CFG.ball.speed;
const BALL_SPEED_BUMP = CFG.ball.speedBump;
const BALL_SPEED_MAX = CFG.ball.speedMax;

// Height-dependent values (set by setCourtHeight)
let COURT_H = BASE_H;
let PADDLE_H = CFG.paddle.height;
let PLAYER_SPEED = CFG.paddle.playerSpeed;
let AI_SPEED = CFG.paddle.aiSpeed;

// --- Mutable game state -------------------------------------------------

let leftY = (COURT_H - PADDLE_H) / 2;   // left paddle top
let rightY = (COURT_H - PADDLE_H) / 2;  // right paddle top
let ballX = COURT_W / 2;
let ballY = COURT_H / 2;
let ballVX = BALL_SPEED;
let ballVY = 0;
let scoreL = CFG.start.scoreLeft;
let scoreR = CFG.start.scoreRight;
let paused = CFG.start.paused;          // true while the match is frozen
let waitingServe = true;                // true after a point until serve
let winner = "";                        // "" | "L" | "R" (match over)
let serveTimer = 0;
let scale = 1;                          // CSS px per game unit

// Held keys map
const keys = Object.create(null);

// Pointer control: target paddle top (game units) per side, null = not steered
let leftTarget = null;
let rightTarget = null;
let twoP = false;                       // right paddle is a second player (CPU off)
const pointers = new Map();             // pointerId -> { side, x, y, t, moved }

// --- Court size ---------------------------------------------------------

/** Set the court height (game units); paddle size / speeds follow it, positions keep their place. */
function setCourtHeight(h) {
  const k = h / COURT_H;
  COURT_H = h;
  const r = h / BASE_H;
  PADDLE_H = CFG.paddle.height * r;
  PLAYER_SPEED = CFG.paddle.playerSpeed * r;
  AI_SPEED = CFG.paddle.aiSpeed * r;
  leftY = clamp(leftY * k, 0, COURT_H - PADDLE_H);
  rightY = clamp(rightY * k, 0, COURT_H - PADDLE_H);
  ballY = clamp(ballY * k, BALL_R, COURT_H - BALL_R);
}

// --- Helpers ------------------------------------------------------------

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
