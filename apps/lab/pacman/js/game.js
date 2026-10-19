/* Pac-Man — game.js
 * Game flow and rules glue: states (START -> READY -> PLAYING -> DYING / WIN -> ...), score, lives,
 * levels, power-pellet fright, ghost-eating chain, bonus fruit, extra life, collisions, HUD / overlay and
 * the main loop.
 *
 * Nothing moves before START is pressed. The simulation runs at a fixed 60 ticks per second
 * (accumulator), so speed does not depend on the screen's frame rate; drawing happens once per frame.
 */
(function (PAC) {
  'use strict';
  const M = PAC.maze, P = PAC.pacman, GH = PAC.ghosts, R = PAC.render, L = PAC.levels, F = PAC.fruit;
  const ST = { START: 0, READY: 1, PLAYING: 2, DYING: 3, WIN: 4, GAMEOVER: 5 };
  const TICK = 1 / 60;               // seconds per simulation tick
  const WIN_TICKS = 150;             // level clear: ~0.7 s still, then the maze flashes (WIN_FLASH_FROM ticks)
  const WIN_FLASH_FROM = 110;
  const EXTRA_LIFE_AT = 10000;       // one bonus life, as in the arcade default
  const GHOST_POINTS = [200, 400, 800, 1600];   // 1st..4th ghost eaten on the same power pellet

  const G = {
    state: ST.START, timer: 0,
    score: 0, high: +(localStorage.getItem('pacman_high') || 0),
    level: 1, lives: 3, pellets: 0, total: 0, frightTicks: 0,
    params: L.get(1),                // this level's speeds / fright time / fruit (levels.js)
    chain: 0,                        // ghosts eaten on the current power pellet
    extraGiven: false,
    popups: [],                      // floating points text: { x, y, text, ticks }
  };

  // ─── DOM / HUD / overlay ────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const scoreEl = $('score'), highEl = $('high'), levelEl = $('level'), livesEl = $('lives'), fruitsEl = $('fruits');
  const overlay = $('overlay'), overlayTitle = $('overlay-title'), overlayMsg = $('overlay-msg'), overlayBtn = $('overlay-btn');

  function updateHud() {
    scoreEl.textContent = G.score;
    highEl.textContent = G.high;
    levelEl.textContent = G.level;
    // Lives: only the spare lives are shown (the one in play is Pac-Man himself)
    livesEl.innerHTML = '';
    for (let i = 0; i < Math.max(0, G.lives - 1); i++) {
      const d = document.createElement('div');
      d.className = 'life';
      livesEl.appendChild(d);
    }
    // Level counter: the fruits of the last 7 levels (arcade style)
    if (fruitsEl) {
      let s = '';
      for (let l = Math.max(1, G.level - 6); l <= G.level; l++) s += L.get(l).fruit.icon;
      fruitsEl.textContent = s;
      fruitsEl.title = `Bonus fruit: ${G.params.fruit.name} (${G.params.fruit.points})`;
    }
  }
  function showOverlay(title, msg, btn) {
    overlayTitle.textContent = title; overlayMsg.textContent = msg; overlayBtn.textContent = btn;
    overlay.classList.remove('hidden');
  }
  const hideOverlay = () => overlay.classList.add('hidden');

  /** Add points; awards the extra life when the score first passes EXTRA_LIFE_AT. */
  function addScore(n) {
    G.score += n;
    if (!G.extraGiven && G.score >= EXTRA_LIFE_AT) { G.extraGiven = true; G.lives++; }
    updateHud();
  }
  const popup = (x, y, text) => G.popups.push({ x, y, text: String(text), ticks: 60 });

  // ─── Flow ───────────────────────────────────────────────────────────────────
  /** Pac-Man and ghosts back to their starts, READY countdown. afterDeath: house uses the shared dot counter. */
  function resetActors(afterDeath) {
    P.reset();
    P.pac.speed = G.params.pac;
    GH.reset(G.level, afterDeath);
    F.reset(false);
    G.frightTicks = 0; G.chain = 0; G.popups.length = 0;
    G.state = ST.READY; G.timer = 90;
  }
  function startLevel() {
    G.params = L.get(G.level);
    G.pellets = G.total = M.load();
    F.reset(true);
    resetActors(false);
    updateHud();
  }
  function newGame() {
    G.score = 0; G.level = 1; G.lives = 3; G.extraGiven = false;
    startLevel();
    hideOverlay();
  }

  function onPellet(ch) {
    G.pellets--;
    GH.onDotEaten();
    F.onPellet(G.total - G.pellets, G.params.fruit);
    if (ch === 'o') {
      G.frightTicks = G.params.frightTicks;     // 0 on late levels: ghosts only reverse
      G.chain = 0;
      GH.frighten(G.frightTicks > 0);
    }
    addScore(ch === 'o' ? 50 : 10);
  }

  /** Touching a ghost: frightened -> it becomes eyes (200/400/800/1600 chain); normal -> lose a life. */
  function checkCollisions() {
    const pac = P.pac;
    for (const g of GH.list) {
      if (g.state === 'eyes' || g.state === 'entering') continue;
      if (Math.abs(g.x - pac.x) < 0.7 && Math.abs(g.y - pac.y) < 0.7) {
        if (g.frightened) {
          const pts = GHOST_POINTS[Math.min(G.chain, GHOST_POINTS.length - 1)];
          G.chain++;
          GH.eat(g);
          popup(g.x, g.y, pts);
          addScore(pts);
        } else { G.lives--; updateHud(); G.state = ST.DYING; G.timer = 90; return; }
      }
    }
  }

  function tick() {
    for (let i = G.popups.length - 1; i >= 0; i--) if (--G.popups[i].ticks <= 0) G.popups.splice(i, 1);
    if (G.state === ST.READY) {
      if (--G.timer <= 0) G.state = ST.PLAYING;
    } else if (G.state === ST.PLAYING) {
      P.pac.speed = G.frightTicks > 0 ? G.params.pacFright : G.params.pac;
      P.update(onPellet);
      if (G.pellets === 0) { G.state = ST.WIN; G.timer = WIN_TICKS; F.reset(false); return; }
      const fruitPts = F.update(P.pac);
      if (fruitPts) { popup(F.fruit.x, F.fruit.y, fruitPts); addScore(fruitPts); }
      if (G.frightTicks > 0 && --G.frightTicks === 0) { GH.unfrighten(); G.chain = 0; }   // back to the current scatter/chase phase
      GH.update({ pac: P.pac, dt: TICK, frightActive: G.frightTicks > 0, params: G.params, pelletsLeft: G.pellets });
      checkCollisions();
    } else if (G.state === ST.DYING) {
      if (--G.timer <= 0) {
        if (G.lives <= 0) {
          if (G.score > G.high) { G.high = G.score; localStorage.setItem('pacman_high', G.high); }
          G.state = ST.GAMEOVER;
          updateHud();
          showOverlay('GAME OVER', `Score: ${G.score}  •  High: ${G.high}`, 'PLAY AGAIN');
        } else resetActors(true);
      }
    } else if (G.state === ST.WIN) {
      if (--G.timer <= 0) { G.level++; startLevel(); }
    }
    // START and GAMEOVER: nothing runs
  }

  // ─── Input ──────────────────────────────────────────────────────────────────
  PAC.input.init({
    direction(d) {
      P.pac.next = d;
      if (G.state === ST.READY && G.timer > 30) G.timer = 30;
    },
    button() {
      if (G.state === ST.START || G.state === ST.GAMEOVER) newGame();
      else { hideOverlay(); if (G.state === ST.READY && G.timer > 30) G.timer = 30; }
    },
  });

  // ─── Main loop: fixed 60 Hz simulation, one draw per frame ──────────────────
  let last = performance.now(), acc = 0;
  const FRAME = 1000 / 60;
  const view = {
    ST, pac: P.pac, ghosts: GH.list, fruit: F.fruit, popups: G.popups,
    get state() { return G.state; }, get timer() { return G.timer; }, get frightTicks() { return G.frightTicks; },
    get flashTicks() { return G.params.flashes * 24; },     // white flashes at the end of fright: 24 ticks each
    /** Level clear: walls alternate white / blue every 12 ticks after the short pause. */
    get mazeFlash() { return G.state === ST.WIN && G.timer <= WIN_FLASH_FROM ? Math.floor((WIN_FLASH_FROM - G.timer) / 12) % 2 === 0 : null; },   // white / blue every 12 ticks
  };
  function loop(now) {
    requestAnimationFrame(loop);
    acc += now - last;
    last = now;
    if (acc > 200) acc = FRAME;      // after a tab switch: don't fast-forward
    while (acc >= FRAME) { acc -= FRAME; tick(); }
    R.draw(view);
  }

  // ─── Boot: show the maze and the START overlay; nothing moves until START ───
  R.resize();
  G.pellets = G.total = M.load();
  P.reset();
  GH.reset(G.level, false);
  updateHud();
  requestAnimationFrame(() => { R.resize(); requestAnimationFrame(loop); });

  PAC.game = { G, ST, newGame, tick, addScore, view, EXTRA_LIFE_AT, GHOST_POINTS };    // also handy for debugging in the console
})(window.PAC = window.PAC || {});
