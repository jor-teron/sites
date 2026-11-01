/* Neon Raid — game: physics, combat, win / fail, match flow (start / menu / pause). */

/* ---------- physics / combat ---------- */

/**
 * Resolve player vs platforms (simple vertical then horizontal).
 */
function collidePlatforms(body, platforms) {
  body.onGround = false;
  for (var i = 0; i < platforms.length; i++) {
    var p = platforms[i];
    if (!p.solid) {
      /* One-way platform: land only when falling and the feet were at/above the top last frame.
         Rising through it or walking under/past it never collides (no snagging). */
      var bottom = body.y + body.h;
      if (body.vy >= 0 &&
          body.x + body.w > p.x && body.x < p.x + p.w &&
          body.prevBottom <= p.y + PC.oneWayEps && bottom >= p.y) {
        body.y = p.y - body.h;
        body.vy = 0;
        body.onGround = true;
      }
      continue;
    }
    if (!hits(body, p)) continue;
    var overlapX = Math.min(body.x + body.w, p.x + p.w) - Math.max(body.x, p.x);
    var overlapY = Math.min(body.y + body.h, p.y + p.h) - Math.max(body.y, p.y);
    if (overlapY < overlapX) {
      if (body.vy >= 0 && body.y + body.h - overlapY <= p.y + PC.landTolerance) {
        body.y = p.y - body.h;
        body.vy = 0;
        body.onGround = true;
      } else if (body.vy < 0) {
        body.y = p.y + p.h;
        body.vy = 0;
      }
    } else {
      if (body.x + body.w / 2 < p.x + p.w / 2) {
        body.x = p.x - body.w;
      } else {
        body.x = p.x + p.w;
      }
      body.vx = 0;
    }
  }
}

/**
 * Player takes a hit.
 */
function hurtPlayer() {
  if (state.invuln > 0) return;
  state.hp -= 1;
  state.invuln = PC.invulnTime;
  AudioBus.playSfx("hit");
  if (state.hp <= 0) {
    state.lives -= 1;
    state.hp = MAX_HP;
    state.player.x = Math.max(PC.respawnMinX, state.player.x - PC.respawnBack);
    state.player.y = PC.respawnY;
    state.player.vy = 0;
    if (state.lives <= 0) {
      fail(CFG.text.livesLost);
    }
  }
}

/**
 * End match as failure.
 * @param {string} msg
 */
function fail(msg) {
  state.running = false;
  state.lost = true;
  showOverlay(CFG.text.failed, msg);
}

/**
 * End match as clear.
 */
function win() {
  state.running = false;
  state.won = true;
  var bonus = Math.floor(state.timeLeft * CFG.timeBonusPerSecond);
  state.score += bonus;
  showOverlay(CFG.text.clear, "Time bonus " + bonus + " · Score " + state.score);
}

/**
 * Show end overlay.
 */
function showOverlay(title, msg) {
  document.getElementById("overlayTitle").textContent = title;
  document.getElementById("overlayMsg").textContent = msg;
  document.getElementById("overlay").classList.remove("hidden");
  syncChrome();
}

/**
 * Spawn a player bullet.
 */
function fire() {
  if (state.fireCd > 0) return;
  var p = state.player;
  state.bullets.push({
    x: p.x + (p.facing > 0 ? p.w : -BC.backOffset),
    y: p.y + BC.offsetY,
    w: BC.w,
    h: BC.h,
    vx: BULLET_SPEED * p.facing
  });
  state.fireCd = FIRE_COOLDOWN;
  AudioBus.playSfx("shoot");
}

/**
 * Advance one frame.
 * @param {number} dt
 */
function step(dt) {
  if (!state.running) return;

  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    fail(CFG.text.timeExpired);
    return;
  }

  state.invuln = Math.max(0, state.invuln - dt);
  state.fireCd = Math.max(0, state.fireCd - dt);

  var p = state.player;
  var left = keyAny(CFG.keys.left);
  var right = keyAny(CFG.keys.right);
  var jump = keyAny(CFG.keys.jump);
  var shoot = keyAny(CFG.keys.fire);

  p.vx = 0;
  if (left) {
    p.vx = -RUN_SPEED;
    p.facing = -1;
  }
  if (right) {
    p.vx = RUN_SPEED;
    p.facing = 1;
  }
  /* Jump: triggered on the press (edge), buffered briefly, with coyote time after leaving a ledge */
  var pressed = jump && !p.jumpHeld;
  p.jumpHeld = jump;
  if (pressed) p.jumpBuf = PC.jumpBuffer;
  else p.jumpBuf = Math.max(0, p.jumpBuf - dt);
  if (p.onGround) p.coyote = PC.coyoteTime;
  else p.coyote = Math.max(0, p.coyote - dt);
  if (p.jumpBuf > 0 && p.coyote > 0) {
    p.vy = JUMP_VEL;
    p.onGround = false;
    p.coyote = 0;
    p.jumpBuf = 0;
    p.jumpCutDone = false;
    AudioBus.playSfx("jump");
  }
  /* Variable height: letting go while rising cuts the jump short */
  if (!jump && p.vy < 0 && !p.jumpCutDone) { p.vy *= PC.jumpCut; p.jumpCutDone = true; }
  if (shoot) fire();

  /* Exact constant-gravity integration: same jump height at any frame rate */
  p.prevBottom = p.y + p.h;
  p.x += p.vx * dt;
  p.y += p.vy * dt + 0.5 * GRAVITY * dt * dt;
  p.vy += GRAVITY * dt;

  if (p.x < 0) p.x = 0;
  if (p.x > state.level.width - p.w) p.x = state.level.width - p.w;
  if (p.y > H + PC.fallMargin) {
    hurtPlayer();
    p.y = PC.respawnY;
    p.vy = 0;
  }

  collidePlatforms(p, state.level.platforms);

  /* camera */
  var ct = cameraTarget(state);
  state.camX = ct.x;
  state.camY += (ct.y - state.camY) * Math.min(1, CFG.size.camYSmooth * dt);

  /* bullets */
  var i;
  for (i = state.bullets.length - 1; i >= 0; i--) {
    var b = state.bullets[i];
    b.x += b.vx * dt;
    if (b.x < state.camX - BC.despawnMargin || b.x > state.camX + viewW() + BC.despawnMargin) {
      state.bullets.splice(i, 1);
    }
  }

  /* enemies */
  for (i = 0; i < state.enemies.length; i++) {
    var e = state.enemies[i];
    if (!e.alive) continue;
    if (e.kind === "drone") {
      e.x += e.vx * dt;
      if (e.x < EC.droneMinX || e.x > state.level.width - EC.droneEdge) e.vx *= -1;
      e.y += Math.sin(state.timeLeft * EC.droneBobSpeed + i) * EC.droneBobAmp * dt;
    }
    e.shootCd -= dt;
    if (e.kind === "turret" && e.shootCd <= 0 && Math.abs(e.x - p.x) < EC.turretRange) {
      var dir = p.x + p.w / 2 > e.x ? 1 : -1;
      state.eBullets.push({
        x: e.x + e.w / 2,
        y: e.y + EC.bulletOffsetY,
        w: EC.bulletW,
        h: EC.bulletH,
        vx: EC.bulletSpeed * dir
      });
      e.shootCd = EC.turretCooldown;
    }

    if (hits(p, e) && state.invuln <= 0) hurtPlayer();

    for (var j = state.bullets.length - 1; j >= 0; j--) {
      if (hits(state.bullets[j], e)) {
        state.bullets.splice(j, 1);
        /* Two bullets can overlap one enemy in the same frame. Count the kill once. */
        if (!e.alive) continue;
        e.hp -= 1;
        if (e.hp <= 0) {
          e.alive = false;
          state.score += e.kind === "turret" ? EC.scoreTurret : EC.scoreDrone;
          AudioBus.playSfx("explode");
        }
      }
    }
  }

  for (i = state.eBullets.length - 1; i >= 0; i--) {
    var eb = state.eBullets[i];
    eb.x += eb.vx * dt;
    if (eb.x < state.camX - BC.despawnMargin || eb.x > state.camX + viewW() + BC.despawnMargin) {
      state.eBullets.splice(i, 1);
      continue;
    }
    if (hits(eb, p)) {
      state.eBullets.splice(i, 1);
      hurtPlayer();
    }
  }

  if (hits(p, state.level.gate)) win();
  updateHud();
}

/* ---------- boot ---------- */

/**
 * Start a match from the selected duration.
 */
function startGame() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  clearKeys();
  var sel = document.getElementById("duration");
  var dur = parseInt(sel.value, 10) || DEFAULT_DURATION;
  state = newState(dur);
  snapCamera(state);
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("overlay").classList.add("hidden");
  updateHud();
  syncChrome();
}

/**
 * Back to the start menu (from the end screen or a running / paused match).
 */
function showMenu() {
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (state) { state.running = false; state.paused = false; }
  clearKeys();
  document.getElementById("overlay").classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
  syncChrome();
}

/**
 * Pause / resume a running match.
 */
function togglePause() {
  if (!state) return;
  if (state.paused) {
    state.paused = false;
    state.running = true;
  } else if (state.running) {
    state.paused = true;
    state.running = false;
    clearKeys();
  }
  syncChrome();
}
