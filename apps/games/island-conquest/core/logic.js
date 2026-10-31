/* Island Conquest — match flow: menu, clock, opponent schedule, win and loss. */
(function (IC) {
  const PLAYER = IC.config.owner.player;
  const AI = IC.config.owner.ai;
  const hud = document.getElementById('hud');
  const hint = document.getElementById('hint');
  const overlay = document.getElementById('overlay');
  const menuOpts = document.getElementById('menu-opts');
  const title = document.getElementById('ov-title');
  const msg = document.getElementById('ov-msg');
  const help = document.getElementById('ov-help');
  const btnPrimary = document.getElementById('btn-primary');
  const btnSecondary = document.getElementById('btn-secondary');
  const statYou = document.getElementById('stat-you');
  const statAi = document.getElementById('stat-ai');

  const session = {
    mode: 'menu',
    mapId: 'atoll',
    difficulty: 'normal',
    seed: (Date.now() % 1000003) + 1,
    ratio: 0.5,
    world: null,
    drag: null,
    reticle: { x: 500, y: 500, on: false },
    elapsed: 0,
    aiAcc: 0,
  };
  IC.session = session;
  if (IC.config.app.name) document.title = IC.config.app.name;

  function chip(parent, label, id, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = label;
    b.dataset.id = id;
    b.addEventListener('click', fn);
    parent.appendChild(b);
  }

  function clock(t) {
    const s = Math.max(0, Math.floor(t));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function showMode() {
    const mode = session.mode;
    const T = IC.config.text;
    hud.hidden = mode === 'menu';
    hint.hidden = mode !== 'play';
    overlay.hidden = mode === 'play';
    menuOpts.hidden = mode !== 'menu';
    btnSecondary.hidden = mode === 'menu';
    if (mode === 'menu') {
      title.textContent = T.title;
      msg.textContent = T.tagline;
      help.hidden = false;
      help.textContent = T.help;
      btnPrimary.textContent = T.start;
    } else if (mode === 'pause') {
      title.textContent = T.paused;
      msg.textContent = T.pausedMsg;
      help.hidden = true;
      btnPrimary.textContent = T.resume;
      btnSecondary.textContent = T.menu;
    } else if (mode === 'win' || mode === 'lose') {
      title.textContent = mode === 'win' ? T.victory : T.defeat;
      msg.textContent = (mode === 'win' ? T.victoryMsg : T.defeatMsg) + ' ' + clock(session.elapsed);
      help.hidden = true;
      btnPrimary.textContent = T.restart;
      btnSecondary.textContent = T.menu;
    }
    const chips = menuOpts.querySelectorAll('.chip');
    for (let i = 0; i < chips.length; i++) {
      const on = chips[i].dataset.id === session.mapId || chips[i].dataset.id === session.difficulty;
      chips[i].className = on ? 'chip on' : 'chip';
      chips[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    const ratios = document.querySelectorAll('#ratios button');
    for (let i = 0; i < ratios.length; i++) {
      const on = Number(ratios[i].dataset.ratio) === session.ratio;
      ratios[i].className = on ? 'on' : '';
      ratios[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    IC.render.resize();
  }

  function preview() {
    session.world = IC.createWorld(session.mapId, session.difficulty, session.seed);
    session.drag = null;
  }

  function begin() {
    session.world = IC.createWorld(session.mapId, session.difficulty, session.seed);
    session.mode = 'play';
    session.elapsed = 0;
    session.aiAcc = 0;
    session.drag = null;
    session.reticle.on = false;
    for (let i = 0; i < session.world.islands.length; i++) {
      if (session.world.islands[i].owner === PLAYER) {
        session.reticle.x = session.world.islands[i].x;
        session.reticle.y = session.world.islands[i].y;
        break;
      }
    }
    showMode();
  }

  const actions = {
    start: function () { begin(); },
    restart: function () { begin(); },
    menu: function () {
      session.mode = 'menu';
      session.drag = null;
      preview();
      showMode();
    },
    pause: function () {
      if (session.mode !== 'play') return;
      session.mode = 'pause';
      session.drag = null;
      showMode();
    },
    resume: function () {
      if (session.mode !== 'pause') return;
      session.mode = 'play';
      showMode();
    },
    primary: function () {
      if (session.mode === 'menu') actions.start();
      else if (session.mode === 'pause') actions.resume();
      else if (session.mode === 'win' || session.mode === 'lose') actions.restart();
      else actions.pause();
    },
    setRatio: function (r) { session.ratio = r; showMode(); },
    setMap: function (id) {
      if (session.mode !== 'menu') return;
      if (id === 'random' && session.mapId === 'random') {
        session.seed = (session.seed * 1664525 + 1013904223) >>> 0;
      }
      session.mapId = id;
      preview();
      showMode();
    },
    setDifficulty: function (id) {
      if (session.mode !== 'menu') return;
      session.difficulty = id;
      preview();
      showMode();
    },
    cycleMap: function (dir) {
      const maps = IC.config.maps;
      let i = 0;
      for (let k = 0; k < maps.length; k++) if (maps[k].id === session.mapId) i = k;
      actions.setMap(maps[(i + dir + maps.length) % maps.length].id);
    },
    cycleDifficulty: function (dir) {
      const list = IC.config.difficulties;
      let i = 0;
      for (let k = 0; k < list.length; k++) if (list[k].id === session.difficulty) i = k;
      actions.setDifficulty(list[(i + dir + list.length) % list.length].id);
    },
  };
  IC.actions = actions;

  const diffs = IC.config.difficulties;
  for (let i = 0; i < diffs.length; i++) {
    chip(document.getElementById('diff-row'), diffs[i].label, diffs[i].id, function (ev) {
      actions.setDifficulty(ev.currentTarget.dataset.id);
    });
  }
  for (let i = 0; i < IC.config.maps.length; i++) {
    const map = IC.config.maps[i];
    chip(document.getElementById('map-row'), map.name, map.id, function (ev) {
      actions.setMap(ev.currentTarget.dataset.id);
    });
  }
  const ratioBox = document.getElementById('ratios');
  for (let i = 0; i < IC.config.ship.ratios.length; i++) {
    const r = IC.config.ship.ratios[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.ratio = String(r);
    b.textContent = Math.round(r * 100) + '%';
    b.addEventListener('click', function () { actions.setRatio(r); });
    ratioBox.appendChild(b);
  }
  btnPrimary.addEventListener('click', function () { actions.primary(); });
  btnSecondary.addEventListener('click', function () { actions.menu(); });
  document.getElementById('btn-pause').addEventListener('click', function () { actions.pause(); });

  function finish(kind) {
    if (session.mode === 'win' || session.mode === 'lose') return;
    session.mode = kind;
    session.drag = null;
    showMode();
  }

  function hudTick() {
    if (!session.world) return;
    const you = session.world.counts(PLAYER);
    const ai = session.world.counts(AI);
    statYou.textContent = you.isles + ' · ' + you.troops;
    statAi.textContent = ai.isles + ' · ' + ai.troops;
    if (session.mode === 'play') {
      const n = session.world.selectedIds().length;
      hint.textContent = n
        ? n + ' selected · send ' + Math.round(session.ratio * 100) + '%'
        : IC.config.text.hint;
    }
  }

  let last = 0;
  function frame(now) {
    const dt = last ? Math.min(0.05, Math.max(0, (now - last) / 1000)) : 0;
    last = now;
    IC.input.update(dt);
    if (session.mode === 'play' && session.world && !session.world.outcome) {
      session.elapsed += dt;
      session.aiAcc += dt;
      while (session.aiAcc >= session.world.diff.interval) {
        session.aiAcc -= session.world.diff.interval;
        IC.opponent.act(session.world);
      }
      session.world.step(dt);
    }
    if (session.world && session.world.outcome && (session.mode === 'play' || session.mode === 'pause')) {
      finish(session.world.outcome);
    }
    hudTick();
    IC.render.draw(session);
    window.requestAnimationFrame(frame);
  }

  preview();
  showMode();
  window.requestAnimationFrame(frame);
})(window.IslandConquest);
