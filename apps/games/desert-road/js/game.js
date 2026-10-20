/* Desert Road — game flow: start / end / pause, spawning, per-frame update, colour picker. */
(() => {
  const DR = window.DR, CFG = DR.CFG, state = DR.state, view = DR.view, el = DR.el, S = DR.storage;

  DR.carColor = S.loadColor();

  /** Render the colour swatches into a container (menu and end screens). */
  function renderColors(box) {
    if (!box) return;
    box.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'label';
    for (const c of CFG.carColors) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', c.label);
      b.dataset.color = c.id;
      b.style.background = `linear-gradient(135deg, ${c.light}, ${c.base} 55%, ${c.dark})`;
      b.setAttribute('aria-checked', String(c.id === DR.carColor));
      b.addEventListener('click', (e) => {
        e.currentTarget.blur();
        DR.carColor = c.id;
        S.saveColor(c.id);
        renderColors(box);
        state.needsDraw = true;
        DR.render.draw();
      });
      box.appendChild(b);
    }
    label.textContent = (CFG.carColors.find(c => c.id === DR.carColor) || {}).label || '';
    box.appendChild(label);
  }

  function onStartClick(e) {
    if (e && e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
    if (!state.running) startGame();
  }

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    state.needsDraw = true;
    if (el.pauseBtn) el.pauseBtn.textContent = state.paused ? '▶' : '⏸';
  }

  function startGame() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    state.running = true;
    state.paused = false;
    state.played = true;
    state.score = CFG.start.score;
    state.elapsed = 0;
    state.speed = CFG.start.speed;
    state.obstacles = [];
    state.spawnTimer = 0;
    state.spawnInterval = CFG.start.spawnInterval;
    state.roadOffset = 0;
    state.shownTenths = -1;
    state.car.x = state.car.targetX = view.road.x + view.road.w / 2;
    state.car.y = DR.carY();
    el.score.textContent = String(CFG.start.score);
    el.time.textContent = '0.0';
    el.overlay.classList.add('hidden');
    if (el.pauseBtn) { el.pauseBtn.textContent = '⏸'; el.pauseBtn.classList.remove('hidden'); }
  }

  function endGame(win) {
    state.running = false;
    state.paused = false;
    state.needsDraw = true;
    DR.input.clear();
    if (el.pauseBtn) el.pauseBtn.classList.add('hidden');

    if (win) {
      const t = state.elapsed;
      const r = CFG.ranks.find(x => t < x.maxSeconds) || CFG.ranks[CFG.ranks.length - 1];
      const prev = S.loadBest();
      const isNew = !prev || t < prev.time;
      const best = isNew ? { time: t, rank: r.rank } : prev;
      if (isNew) S.saveBest(best);
      el.overlay.innerHTML = `
        <h1>${CFG.text.winTitle}</h1>
        <div class="rank">${r.rank}</div>
        <p>Time: <strong>${t.toFixed(1)}s</strong><br>${r.message}</p>
        <p class="best">${isNew ? CFG.text.newBest + '<br>' : ''}${S.bestHtml(best)}</p>
        <div class="colors" role="radiogroup" aria-label="Car colour"></div>
        <button id="startBtn">${CFG.text.winButton}</button>
      `;
    } else {
      el.overlay.innerHTML = `
        <h1>${CFG.text.crashTitle}</h1>
        <p>${CFG.text.crashBody.replace('{score}', state.score)}</p>
        <p class="best">${S.bestHtml(S.loadBest())}</p>
        <div class="colors" role="radiogroup" aria-label="Car colour"></div>
        <button id="startBtn">${CFG.text.crashButton}</button>
      `;
    }
    renderColors(el.overlay.querySelector('.colors'));
    el.overlay.classList.remove('hidden');
    document.getElementById('startBtn').addEventListener('click', onStartClick);
  }

  function spawnObstacle() {
    const types = CFG.obstacles.types;
    const type = types[Math.floor(Math.random() * types.length)];
    const m = CFG.obstacles.spawnMargin, road = view.road;
    const x = road.x + m + Math.random() * Math.max(0, road.w - m * 2 - type.w);
    state.obstacles.push({
      x, y: -type.h - CFG.obstacles.spawnAbove,
      w: type.w, h: type.h,
      type,
      emoji: type.emoji,
      points: type.points,
    });
  }

  function update(dt) {
    const k = dt * 60; // 1/60 s ticks this frame
    state.elapsed += dt;
    const tenths = Math.floor(state.elapsed * 10);
    if (tenths !== state.shownTenths) {
      state.shownTenths = tenths;
      el.time.textContent = (tenths / 10).toFixed(1);
    }

    const D = CFG.difficulty;
    state.speed = CFG.start.speed + Math.min(state.elapsed * D.speedPerSecond, D.maxExtraSpeed);
    state.spawnInterval = Math.max(D.minSpawnInterval, CFG.start.spawnInterval - state.elapsed * D.spawnDecayPerSecond);

    state.roadOffset = (state.roadOffset + state.speed * k) % CFG.road.stripePeriod;

    const c = state.car;
    const left = state.keys.left || state.touchLeft;
    const right = state.keys.right || state.touchRight;
    const move = CFG.car.moveSpeed * k;
    if (left)  c.targetX -= move;
    if (right) c.targetX += move;
    c.targetX = DR.clamp(c.targetX, DR.carMinX(), DR.carMaxX());
    c.x += (c.targetX - c.x) * (1 - Math.pow(1 - CFG.car.follow, k));

    state.spawnTimer += dt;
    if (state.spawnTimer >= state.spawnInterval) {
      state.spawnTimer -= state.spawnInterval;
      if (state.spawnTimer > state.spawnInterval) state.spawnTimer = 0; // after a stall
      if (Math.random() < D.spawnChance) spawnObstacle();
    }

    const pad = CFG.obstacles.hitPad;
    const carL = c.x - c.w / 2 + pad;
    const carR = c.x + c.w / 2 - pad;
    const carT = c.y - c.h / 2 + pad;
    const carB = c.y + c.h / 2 - pad;
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const o = state.obstacles[i];
      o.y += state.speed * k;

      const oL = o.x + pad, oR = o.x + o.w - pad;
      const oT = o.y + pad, oB = o.y + o.h - pad;
      if (carL < oR && carR > oL && carT < oB && carB > oT) {
        endGame(false);
        return;
      }

      if (o.y > view.H) {
        state.score += o.points;
        el.score.textContent = state.score;
        state.obstacles.splice(i, 1);
        if (state.score >= CFG.winScore) {
          endGame(true);
          return;
        }
      }
    }
  }

  DR.game = { startGame, endGame, togglePause, update, onStartClick, renderColors };
})();
