/*
 * Neon Raid — sprites: detailed 2D side-view models drawn in code.
 * Everything here is visual only; hit boxes come from config and never change.
 * Static parts are pre-rendered once to offscreen canvases (SPR.*) at 2x for crisp scaling.
 * Each sprite has an anchor (ax, ay): the hit box's top-left inside the sprite.
 */
var SPR_SCALE = 2;

/**
 * Pre-render a sprite.
 * @param {number} w logical width
 * @param {number} h logical height
 * @param {function(CanvasRenderingContext2D)} paint
 */
function makeSprite(w, h, ax, ay, paint) {
  var c = document.createElement("canvas");
  c.width = w * SPR_SCALE;
  c.height = h * SPR_SCALE;
  var g = c.getContext("2d");
  g.scale(SPR_SCALE, SPR_SCALE);
  paint(g);
  return { img: c, w: w, h: h, ax: ax, ay: ay };
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function vGrad(g, y0, y1, stops) {
  var gr = g.createLinearGradient(0, y0, 0, y1);
  for (var i = 0; i < stops.length; i++) gr.addColorStop(i / (stops.length - 1), stops[i]);
  return gr;
}

/* ---------- player soldier (box 22x36, anchor 14,8 in a 52x48 sprite) ---------- */

var PLAYER_AX = 14, PLAYER_AY = 8;

/** One leg: thigh + shin + boot, hip at (hx,hy), swing angles in radians. */
function drawLeg(g, hx, hy, thigh, shin, dark) {
  var kx = hx + Math.sin(thigh) * 7, ky = hy + Math.cos(thigh) * 7;
  var fx = kx + Math.sin(shin) * 6.5, fy = ky + Math.cos(shin) * 6.5;
  g.lineCap = "round";
  g.strokeStyle = dark ? "#1d3a4a" : "#2b5468";
  g.lineWidth = 5;
  g.beginPath(); g.moveTo(hx, hy); g.lineTo(kx, ky); g.stroke();
  g.lineWidth = 4.2;
  g.beginPath(); g.moveTo(kx, ky); g.lineTo(fx, fy); g.stroke();
  /* knee pad */
  g.fillStyle = dark ? "#2a7f91" : "#3cf0ff";
  g.beginPath(); g.arc(kx, ky, 1.6, 0, Math.PI * 2); g.fill();
  /* boot */
  g.fillStyle = dark ? "#0d1119" : "#161c28";
  rr(g, fx - 2.5, fy - 1.5, 7, 3.6, 1.4); g.fill();
}

/**
 * Paint the soldier facing right.
 * @param {string} pose "idle" | "run" | "jump"
 * @param {number} ph run phase 0..1
 */
function paintPlayer(g, pose, ph) {
  var ox = PLAYER_AX, oy = PLAYER_AY;
  var bob = pose === "run" ? Math.abs(Math.sin(ph * Math.PI * 2)) * -1.2 : 0;
  var hx = ox + 11, hy = oy + 24 + bob;
  var a = Math.sin(ph * Math.PI * 2);

  /* back leg, then front leg */
  if (pose === "jump") {
    drawLeg(g, hx - 1, hy, -0.5, 0.6, true);
    drawLeg(g, hx + 1, hy, 0.9, -0.2, false);
  } else if (pose === "run") {
    drawLeg(g, hx - 1, hy, -a * 0.75, -a * 0.75 + (a > 0 ? 0.9 : 0.15), true);
    drawLeg(g, hx + 1, hy, a * 0.75, a * 0.75 + (a < 0 ? 0.9 : 0.15), false);
  } else {
    drawLeg(g, hx - 2, hy, -0.12, 0, true);
    drawLeg(g, hx + 2, hy, 0.12, 0, false);
  }

  var ty = oy + 11 + bob;
  /* back arm (behind torso), reaching the fore-grip */
  g.strokeStyle = "#c58c63"; g.lineWidth = 3.2; g.lineCap = "round";
  g.beginPath(); g.moveTo(ox + 9, ty + 3); g.lineTo(ox + 17, ty + 8); g.lineTo(ox + 24, ty + 7); g.stroke();

  /* torso: tactical vest with shading */
  g.fillStyle = vGrad(g, ty, ty + 14, ["#3f7f8f", "#24505e", "#163542"]);
  rr(g, ox + 4, ty, 14, 14, 3); g.fill();
  g.fillStyle = "rgba(255,255,255,0.18)";
  rr(g, ox + 5, ty + 1, 4, 11, 2); g.fill();
  /* pouches + belt */
  g.fillStyle = "#1a2b33";
  g.fillRect(ox + 10, ty + 5, 3, 4); g.fillRect(ox + 14, ty + 5, 3, 4);
  g.fillStyle = "#0e161c"; g.fillRect(ox + 4, ty + 12, 14, 2.5);
  g.fillStyle = "#ffd36b"; g.fillRect(ox + 10, ty + 12.3, 2, 1.9);
  /* neon trim */
  g.fillStyle = "#3cf0ff"; g.fillRect(ox + 4, ty + 3, 1.2, 8);

  /* head */
  var cx = ox + 12, cy = oy + 5 + bob;
  g.fillStyle = "#d39a6c";
  g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#b47b52";
  g.beginPath(); g.arc(cx - 1.5, cy + 1, 4, 0.6, 2.4); g.fill();
  /* jaw shadow + visor */
  g.fillStyle = "#0b1622"; rr(g, cx, cy - 1.3, 5.8, 2.6, 1.2); g.fill();
  g.fillStyle = "#3cf0ff"; g.fillRect(cx + 1.2, cy - 0.8, 4, 1);
  /* helmet */
  g.fillStyle = vGrad(g, cy - 7, cy - 1, ["#5b7183", "#2b3a48"]);
  g.beginPath(); g.arc(cx, cy - 1.2, 6, Math.PI, 0); g.lineTo(cx + 6.5, cy - 1); g.lineTo(cx - 6, cy - 1); g.fill();
  g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(cx - 3, cy - 6, 4, 1.2);
  /* bandana band + flowing tails */
  g.fillStyle = "#ff3d9a"; g.fillRect(cx - 6, cy - 2.2, 12.4, 2);
  var flow = pose === "idle" ? 1 : 2.4;
  g.beginPath();
  g.moveTo(cx - 5.5, cy - 2); g.quadraticCurveTo(cx - 10, cy - 1 - flow, cx - 13, cy + 1 - flow * 0.5);
  g.lineTo(cx - 12, cy + 2); g.quadraticCurveTo(cx - 9, cy + 0.5, cx - 5.5, cy); g.fill();

  /* rifle */
  var gy = oy + 11 + bob;
  g.fillStyle = "#1b2230"; rr(g, ox + 10, gy + 3, 9, 4, 1.2); g.fill();          /* stock */
  g.fillStyle = vGrad(g, gy + 2, gy + 7, ["#4a5568", "#222a38"]);
  rr(g, ox + 16, gy + 2, 14, 5, 1.2); g.fill();                                  /* receiver */
  g.fillStyle = "#11161f"; g.fillRect(ox + 29, gy + 3, 8, 2.4);                    /* barrel */
  g.fillStyle = "#11161f"; g.fillRect(ox + 21, gy + 6.5, 3, 4);                    /* magazine */
  g.fillStyle = "#ff3d9a"; g.fillRect(ox + 19, gy + 3.2, 7, 1);                    /* neon rail */
  g.fillStyle = "#3cf0ff"; g.fillRect(ox + 25, gy + 1, 3, 1.2);                    /* sight */

  /* front arm over the rifle */
  g.strokeStyle = "#d39a6c"; g.lineWidth = 3.4;
  g.beginPath(); g.moveTo(ox + 13, ty + 3); g.lineTo(ox + 15, ty + 8); g.lineTo(ox + 19, ty + 6); g.stroke();
  g.fillStyle = "#24505e"; rr(g, ox + 11, ty + 1, 5, 5, 2); g.fill();            /* shoulder pad */
}

/* ---------- drone (box 28x22, anchor 6,6 in a 40x32 sprite) ---------- */

function paintDrone(g) {
  var ox = 6, oy = 6;
  /* rotor arms */
  g.fillStyle = "#2c3a4c";
  g.fillRect(ox - 2, oy + 2, 32, 2.5);
  g.fillStyle = "#111823";
  g.fillRect(ox - 3, oy + 1, 5, 4); g.fillRect(ox + 26, oy + 1, 5, 4);
  /* hull */
  g.fillStyle = vGrad(g, oy + 3, oy + 20, ["#9ff6ff", "#3a8fa8", "#163848"]);
  g.beginPath();
  g.moveTo(ox + 3, oy + 7); g.quadraticCurveTo(ox + 14, oy + 1, ox + 25, oy + 7);
  g.lineTo(ox + 22, oy + 17); g.quadraticCurveTo(ox + 14, oy + 22, ox + 6, oy + 17);
  g.closePath(); g.fill();
  g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1;
  g.beginPath(); g.moveTo(ox + 7, oy + 7); g.quadraticCurveTo(ox + 14, oy + 3.5, ox + 21, oy + 7); g.stroke();
  /* eye */
  g.fillStyle = "#0a0f18";
  g.beginPath(); g.arc(ox + 14, oy + 12, 4.4, 0, Math.PI * 2); g.fill();
  var eg = g.createRadialGradient(ox + 14, oy + 12, 0.5, ox + 14, oy + 12, 3.6);
  eg.addColorStop(0, "#fff"); eg.addColorStop(0.35, "#ff4d6d"); eg.addColorStop(1, "rgba(255,77,109,0)");
  g.fillStyle = eg; g.beginPath(); g.arc(ox + 14, oy + 12, 3.6, 0, Math.PI * 2); g.fill();
  /* under-fins */
  g.fillStyle = "#1c2b3a";
  g.beginPath(); g.moveTo(ox + 8, oy + 17); g.lineTo(ox + 6, oy + 22); g.lineTo(ox + 11, oy + 19); g.fill();
  g.beginPath(); g.moveTo(ox + 20, oy + 17); g.lineTo(ox + 22, oy + 22); g.lineTo(ox + 17, oy + 19); g.fill();
}

/* ---------- turret (box 32x24, anchor 6,8 in a 44x34 sprite; barrel drawn live) ---------- */

function paintTurret(g) {
  var ox = 6, oy = 8;
  /* base plate */
  g.fillStyle = vGrad(g, oy + 16, oy + 24, ["#5a3a2c", "#2a1a14"]);
  rr(g, ox, oy + 16, 32, 8, 2); g.fill();
  g.fillStyle = "#ffb03c";
  for (var i = 0; i < 4; i++) g.fillRect(ox + 3 + i * 8, oy + 18, 4, 1.6);
  /* dome */
  g.fillStyle = vGrad(g, oy, oy + 17, ["#ffae7c", "#ff6b3c", "#8a2f14"]);
  g.beginPath(); g.arc(ox + 16, oy + 17, 12, Math.PI, 0); g.closePath(); g.fill();
  g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 1.2;
  g.beginPath(); g.arc(ox + 16, oy + 17, 9, Math.PI * 1.15, Math.PI * 1.5); g.stroke();
  /* sensor slit */
  g.fillStyle = "#10070a"; rr(g, ox + 10, oy + 9, 12, 3.5, 1.5); g.fill();
  g.fillStyle = "#ffe36b"; g.fillRect(ox + 12, oy + 10, 8, 1.4);
}

/* ---------- glows / effects ---------- */

function paintGlow(g, size, inner, outer) {
  var r = size / 2;
  var gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, "#fff");
  gr.addColorStop(0.25, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
}

/* ---------- backdrop: far city skyline (tiles horizontally) ---------- */

function paintSkyline(g, w, h) {
  var x = 0, seed = 7;
  function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  while (x < w) {
    var bw = 30 + rnd() * 50, bh = 60 + rnd() * 170;
    g.fillStyle = "#0d1426";
    g.fillRect(x, h - bh, bw, bh);
    g.fillStyle = "rgba(60,240,255,0.08)";
    g.fillRect(x, h - bh, bw, 2);
    for (var wy = h - bh + 8; wy < h - 6; wy += 10) {
      for (var wx = x + 5; wx < x + bw - 6; wx += 8) {
        if (rnd() < 0.18) {
          g.fillStyle = rnd() < 0.5 ? "rgba(60,240,255,0.35)" : "rgba(255,61,154,0.3)";
          g.fillRect(wx, wy, 3, 4);
        }
      }
    }
    x += bw + 4 + rnd() * 10;
  }
}

/** Pre-rendered sprite set, built once at boot. */
var SPR = {};

function buildSprites() {
  var PW = 52, PH = 48;
  SPR.playerIdle = makeSprite(PW, PH, PLAYER_AX, PLAYER_AY, function (g) { paintPlayer(g, "idle", 0); });
  SPR.playerJump = makeSprite(PW, PH, PLAYER_AX, PLAYER_AY, function (g) { paintPlayer(g, "jump", 0); });
  SPR.playerRun = [];
  for (var i = 0; i < 6; i++) {
    SPR.playerRun.push(makeSprite(PW, PH, PLAYER_AX, PLAYER_AY, (function (k) {
      return function (g) { paintPlayer(g, "run", k / 6); };
    })(i)));
  }
  SPR.drone = makeSprite(40, 32, 6, 6, paintDrone);
  SPR.turret = makeSprite(44, 34, 6, 8, paintTurret);
  SPR.glowPlayer = makeSprite(32, 32, 0, 0, function (g) { paintGlow(g, 32, "rgba(255,246,168,0.9)", "rgba(255,200,60,0)"); });
  SPR.glowEnemy = makeSprite(28, 28, 0, 0, function (g) { paintGlow(g, 28, "rgba(255,77,109,0.9)", "rgba(255,40,80,0)"); });
  SPR.glowFire = makeSprite(64, 64, 0, 0, function (g) { paintGlow(g, 64, "rgba(255,190,80,0.95)", "rgba(255,60,40,0)"); });
  SPR.skyline = makeSprite(960, 260, 0, 0, function (g) { paintSkyline(g, 960, 260); });
}

/**
 * Blit a sprite so its anchor lands on (x, y); flip mirrors around the hit box.
 * @param {number} boxW hit-box width (mirror axis)
 */
function blit(ctx, s, x, y, flip, boxW) {
  if (!flip) {
    ctx.drawImage(s.img, x - s.ax, y - s.ay, s.w, s.h);
    return;
  }
  ctx.save();
  ctx.translate(x + boxW, y);
  ctx.scale(-1, 1);
  ctx.drawImage(s.img, -s.ax, -s.ay, s.w, s.h);
  ctx.restore();
}
