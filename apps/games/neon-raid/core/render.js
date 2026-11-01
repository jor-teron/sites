/*
 * Neon Raid — render: draws one frame from `state` using the sprites in sprites.js.
 * Visual-only extras (explosions, sparks, animation clock) live here and never touch gameplay.
 */
var fx = { parts: [], booms: [], seen: [], t: 0, lastTs: 0 };

/** Spawn an explosion at a world point. */
function spawnBoom(x, y, big) {
  fx.booms.push({ x: x, y: y, t: 0, life: big ? 0.6 : 0.45, r: big ? 34 : 26 });
  var n = big ? 22 : 16;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
    fx.parts.push({
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
      t: 0, life: 0.35 + Math.random() * 0.45,
      c: i % 3 === 0 ? "#3cf0ff" : (i % 3 === 1 ? "#ffd36b" : "#ff6b3c"),
      s: 1.5 + Math.random() * 2.5
    });
  }
}

/** Watch for enemies that just died (visual hook only) and advance effects. */
function tickFx(dt) {
  if (state) {
    if (fx.seenState !== state) { fx.seenState = state; fx.seen = []; fx.parts = []; fx.booms = []; }
    for (var i = 0; i < state.enemies.length; i++) {
      var e = state.enemies[i];
      if (!e.alive && !fx.seen[i]) {
        fx.seen[i] = true;
        spawnBoom(e.x + e.w / 2, e.y + e.h / 2, e.kind === "turret");
      }
    }
  }
  var k;
  for (k = fx.parts.length - 1; k >= 0; k--) {
    var p = fx.parts[k];
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt; p.vx *= 0.98;
    if (p.t >= p.life) fx.parts.splice(k, 1);
  }
  for (k = fx.booms.length - 1; k >= 0; k--) {
    fx.booms[k].t += dt;
    if (fx.booms[k].t >= fx.booms[k].life) fx.booms.splice(k, 1);
  }
}

function drawBackdrop(cam) {
  ctx.fillStyle = vGrad(ctx, 0, H, ["#0b0f24", COL.bg, "#05060d"]);
  ctx.fillRect(0, 0, W, H);
  /* far skyline, slow parallax */
  var sky = SPR.skyline, off = -((cam * 0.25) % sky.w);
  for (var sx = off; sx < W; sx += sky.w) ctx.drawImage(sky.img, sx, H - 60 - sky.h, sky.w, sky.h);
  /* grid */
  ctx.strokeStyle = COL.grid;
  ctx.lineWidth = 1;
  for (var gx = -((cam | 0) % COL.gridSpacing); gx < W; gx += COL.gridSpacing) {
    ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
  }
}

function drawPlatforms(cam) {
  var plats = state.level.platforms;
  for (var i = 0; i < plats.length; i++) {
    var pl = plats[i], x = pl.x - cam;
    if (x > W || x + pl.w < 0) continue;
    ctx.fillStyle = vGrad(ctx, pl.y, pl.y + pl.h, ["#24324d", COL.platform, "#0c1220"]);
    ctx.fillRect(x, pl.y, pl.w, pl.h);
    /* rivets / panel seams */
    ctx.fillStyle = "rgba(60,240,255,0.12)";
    for (var sx = x + ((-pl.x) % 40 + 40) % 40; sx < x + pl.w; sx += 40) ctx.fillRect(sx, pl.y + 4, 1, Math.min(pl.h - 6, 30));
    ctx.fillStyle = "rgba(60,240,255,0.18)";
    ctx.fillRect(x, pl.y - 2, pl.w, 2);
    ctx.fillStyle = COL.platformEdge;
    ctx.fillRect(x, pl.y, pl.w, 3);
  }
}

function drawGate(cam) {
  var g = state.level.gate, x = g.x - cam, pulse = 0.6 + 0.4 * Math.sin(fx.t * 4);
  ctx.fillStyle = COL.gateGlow;
  ctx.fillRect(x - 8, g.y, g.w + 16, g.h);
  ctx.globalAlpha = 0.35 + 0.35 * pulse;
  ctx.fillStyle = vGrad(ctx, g.y, g.y + g.h, ["rgba(255,61,154,0.1)", "#ff3d9a", "rgba(255,61,154,0.1)"]);
  ctx.fillRect(x + 6, g.y, g.w - 12, g.h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#2a1630";
  ctx.fillRect(x, g.y, 6, g.h); ctx.fillRect(x + g.w - 6, g.y, 6, g.h);
  ctx.fillStyle = COL.gate;
  ctx.fillRect(x + 2, g.y, 2, g.h); ctx.fillRect(x + g.w - 4, g.y, 2, g.h);
}

function drawEnemies(cam) {
  var p = state.player;
  for (var i = 0; i < state.enemies.length; i++) {
    var e = state.enemies[i];
    if (!e.alive) continue;
    var x = e.x - cam;
    if (x > W + 40 || x + e.w < -40) continue;
    if (e.kind === "turret") {
      var dir = p.x + p.w / 2 > e.x ? 1 : -1;
      /* barrel points at the player's side, matching where it fires */
      var bx = x + e.w / 2, by = e.y + EC.bulletOffsetY;
      ctx.fillStyle = "#2a1a14";
      ctx.fillRect(dir > 0 ? bx : bx - 18, by - 2, 18, 5);
      ctx.fillStyle = "#ffb03c";
      ctx.fillRect(dir > 0 ? bx + 15 : bx - 18, by - 2, 3, 5);
      blit(ctx, SPR.turret, x, e.y, false, e.w);
    } else {
      var s = SPR.drone;
      blit(ctx, s, x, e.y, e.vx < 0, e.w);
      /* rotor blur */
      var spin = Math.abs(Math.sin(fx.t * 40 + i));
      ctx.fillStyle = "rgba(180,240,255,0.45)";
      ctx.fillRect(x - 6 + (1 - spin) * 3, e.y - 1, 10 * spin + 2, 1.5);
      ctx.fillRect(x + e.w - 4 + (1 - spin) * 3, e.y - 1, 10 * spin + 2, 1.5);
      /* thruster flicker */
      ctx.globalAlpha = 0.5 + 0.3 * Math.random();
      ctx.drawImage(SPR.glowFire.img, x + e.w / 2 - 6, e.y + e.h - 2, 12, 12);
      ctx.globalAlpha = 1;
    }
  }
}

function drawBullets(cam) {
  var i, b;
  ctx.globalCompositeOperation = "lighter";
  for (i = 0; i < state.bullets.length; i++) {
    b = state.bullets[i];
    ctx.drawImage(SPR.glowPlayer.img, b.x - cam + b.w / 2 - 14, b.y + b.h / 2 - 14, 28, 28);
  }
  for (i = 0; i < state.eBullets.length; i++) {
    b = state.eBullets[i];
    ctx.drawImage(SPR.glowEnemy.img, b.x - cam + b.w / 2 - 12, b.y + b.h / 2 - 12, 24, 24);
  }
  ctx.globalCompositeOperation = "source-over";
  for (i = 0; i < state.bullets.length; i++) {
    b = state.bullets[i];
    var tail = b.vx > 0 ? -12 : b.w;
    ctx.fillStyle = "rgba(255,246,168,0.35)";
    ctx.fillRect(b.x - cam + tail, b.y + 1, 12, b.h - 2);
    ctx.fillStyle = COL.bullet;
    rr(ctx, b.x - cam, b.y, b.w, b.h, 2); ctx.fill();
  }
  for (i = 0; i < state.eBullets.length; i++) {
    b = state.eBullets[i];
    ctx.fillStyle = COL.enemyBullet;
    rr(ctx, b.x - cam, b.y, b.w, b.h, 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(b.x - cam + 2, b.y + 1, b.w - 4, 1.5);
  }
}

function drawPlayer(cam) {
  var p = state.player;
  var blink = state.invuln > 0 && ((state.invuln * 20) | 0) % 2 === 0;
  if (blink) return;
  var x = p.x - cam, s;
  if (!p.onGround) s = SPR.playerJump;
  else if (p.vx !== 0) s = SPR.playerRun[((Math.abs(p.x) / 9) | 0) % SPR.playerRun.length];
  else s = SPR.playerIdle;
  /* ground shadow */
  if (p.onGround) {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(x + p.w / 2, p.y + p.h, 13, 2.6, 0, 0, Math.PI * 2); ctx.fill();
  }
  blit(ctx, s, x, p.y, p.facing < 0, p.w);
  /* muzzle flash for the first few frames after a shot */
  if (state.fireCd > FIRE_COOLDOWN - 0.06) {
    var mx = p.facing > 0 ? x + 23 : x - 23 + p.w;
    var my = p.y + 12;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(SPR.glowFire.img, mx - 12, my - 12 + 2, 24, 24);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#fff6a8";
    ctx.beginPath();
    var d = p.facing;
    ctx.moveTo(mx, my); ctx.lineTo(mx + 9 * d, my + 2); ctx.lineTo(mx, my + 4); ctx.closePath(); ctx.fill();
  }
}

function drawFx(cam) {
  ctx.globalCompositeOperation = "lighter";
  for (var i = 0; i < fx.booms.length; i++) {
    var b = fx.booms[i], k = b.t / b.life, r = b.r * (0.4 + k);
    ctx.globalAlpha = 1 - k;
    ctx.drawImage(SPR.glowFire.img, b.x - cam - r, b.y - r, r * 2, r * 2);
    ctx.strokeStyle = "rgba(60,240,255," + (0.8 * (1 - k)) + ")";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x - cam, b.y, b.r * 1.4 * k + 4, 0, Math.PI * 2); ctx.stroke();
  }
  for (i = 0; i < fx.parts.length; i++) {
    var q = fx.parts[i];
    ctx.globalAlpha = 1 - q.t / q.life;
    ctx.fillStyle = q.c;
    ctx.fillRect(q.x - cam - q.s / 2, q.y - q.s / 2, q.s, q.s);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

/**
 * Draw one frame.
 */
function draw() {
  var now = performance.now() / 1000;
  var dt = fx.lastTs ? Math.min(0.05, now - fx.lastTs) : 0;
  fx.lastTs = now;
  if (!(state && state.paused)) { fx.t += dt; tickFx(dt); }

  var cam = state ? state.camX : 0;
  drawBackdrop(cam);
  if (!state) return;

  /* gameplay layer: zoomed camera (background above and HUD stay unscaled) */
  var z = getZoom();
  ctx.save();
  ctx.setTransform(z, 0, 0, z, 0, -(state.camY || 0) * z);
  drawPlatforms(cam);
  drawGate(cam);
  drawEnemies(cam);
  drawBullets(cam);
  drawPlayer(cam);
  drawFx(cam);
  ctx.restore();

  if (state.paused) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 32px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(CFG.text.paused, W / 2, H / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
}
