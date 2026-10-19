/* Pac-Man — game.js
 * Game flow and rules glue: states (START -> READY -> PLAYING -> DYING / WIN -> ...), score, lives,
 * levels, power-pellet fright timer, Pac-Man vs ghost collisions, HUD / overlay, and the main loop.
 *
 * Nothing moves before START is pressed. The simulation runs at a fixed 60 ticks per second
 * (accumulator), so speed does not depend on the screen's frame rate; drawing happens once per frame.
 */
(function (PAC) {
  'use strict';
  const M = PAC.maze, P = PAC.pacman, GH = PAC.ghosts, R = PAC.render;
  const ST = { START: 0, READY: 1, PLAYING: 2, DYING: 3, WIN: 4, GAMEOVER: 5 };
  const TICK = 1 / 60;               // seconds per simulation tick
  const FRIGHT_TICKS = 60 * 7;       // power-pellet fright: 7 s

  const G = {
    state: ST.START, timer: 0,
    score: 0, high: +(localStorage.getItem('pacman_high') || 0),
    level: 1, lives: 3, pellets: 0, frightTicks: 0,
  };

  // ─── DOM / HUD / overlay ────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const scoreEl = $('score'), highEl = $('high'), levelEl = $('level'), livesEl = $('lives');
  const overlay = $('overlay'), overlayTitle = $('overlay-title'), overlayMsg = $('overlay-msg'), overlayBtn = $('overlay-btn');

  function updateHud() {
    scoreEl.textContent = G.score;
    highEl.textContent = G.high;
    levelEl.textContent = G.level;
    livesEl.innerHTML = '';
    for (let i = 0; i < G.lives; i++) {
      const d = document.createElement('div');
      d.className = 'life';
      livesEl.appendChild(d);
    }
  }
  function showOverlay(title, msg, btn) {
    overlayTitle.textContent = title; overlayMsg.textContent = msg; overlayBtn.textContent = btn;
    overlay.classList.remove('hidden');
  }
  const hideOverlay = () => overlay.classList.add('hidden');

  // ─── Flow ───────────────────────────────────────────────────────────────────
  /** Pac-Man and ghosts back to their starts, READY countdown. afterDeath: house uses the shared dot counter. */
  function resetActors(afterDeath) {
    P.reset();
    GH.reset(G.level, afterDeath);
    G.frightTicks = 0;
    G.state = ST.READY; G.timer = 90;
  }
  function startLevel() {
    G.pellets = M.load();
    resetActors(false);
  }
  function newGame() {
    G.score = 0; G.level = 1; G.lives = 3;
    updateHud();
    startLevel();
    hideOverlay();
  }

  function onPellet(ch) {
    G.pellets--;
    G.score += ch === 'o' ? 50 : 10;
    GH.onDotEaten();
    if (ch === 'o') { G.frightTicks = FRIGHT_TICKS; GH.frighten(); }
    updateHud();
  }

  /** Touching a ghost: frightened -> it becomes eyes (+200); normal -> lose a life. Eyes are harmless. */
  function checkCollisions() {
    const pac = P.pac;
    for (const g of GH.list) {
      if (g.state === 'eyes' || g.state === 'entering') continue;
      if (Math.abs(g.x - pac.x) < 0.7 && Math.abs(g.y - pac.y) < 0.7) {
        if (g.frightened) { GH.eat(g); G.score += 200; updateHud(); }
        else { G.lives--; updateHud(); G.state = ST.DYING; G.timer = 90; return; }
      }
    }
  }

  function tick() {
    if (G.state === ST.READY) {
      if (--G.timer <= 0) G.state = ST.PLAYING;
    } else if (G.state === ST.PLAYING) {
      P.update(onPellet);
      if (G.pellets === 0) { G.state = ST.WIN; G.timer = 120; return; }
      if (G.frightTicks > 0 && --G.frightTicks === 0) GH.unfrighten();   // back to the current scatter/chase phase
      GH.update({ pac: P.pac, dt: TICK, frightActive: G.frightTicks > 0 });
      checkCollisions();
    } else if (G.state === ST.DYING) {
      if (--G.timer <= 0) {
        if (G.lives <= 0) {
          if (G.score > G.high) { G.high = G.score; localStorage.setItem('pacman_high', G.high); }
          G.state = ST.GAMEOVER;
          showOverlay('GAME OVER', `Score: ${G.score}  •  High: ${G.high}`, 'PLAY AGAIN');
        } else resetActors(true);
      }
    } else if (G.state === ST.WIN) {
      if (--G.timer <= 0) { G.level++; updateHud(); startLevel(); }
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
  const view = { ST, pac: P.pac, ghosts: GH.list, get state() { return G.state; }, get timer() { return G.timer; }, get frightTicks() { return G.frightTicks; } };
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
  G.pellets = M.load();
  P.reset();
  GH.reset(G.level, false);
  updateHud();
  requestAnimationFrame(() => { R.resize(); requestAnimationFrame(loop); });

  PAC.game = { G, ST, newGame, tick };    // also handy for debugging in the console
})(window.PAC = window.PAC || {});
