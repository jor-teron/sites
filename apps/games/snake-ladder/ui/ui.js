/* ui.js — screens, panel, dice, player list, log. Wires Engine to Render. */

const Ui = (() => {
  const $ = (id) => document.getElementById(id);

  const screens = {
    lobby: $('screen-lobby'),
    play: $('screen-play'),
    result: $('screen-result'),
  };

  function show(name) {
    for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
  }

  /* ---------- log ---------- */
  function log(html, cls = '') {
    const box = $('log');
    const line = document.createElement('div');
    if (cls) line.className = cls;
    line.innerHTML = html;
    box.appendChild(line);
    box.scrollTop = box.scrollHeight;
  }
  function clearLog() {
    $('log').innerHTML = '';
  }

  const tag = (p) => `<span class="hl">${p.name}</span>`;

  /* ---------- panel ---------- */
  function refresh() {
    const st = Engine.state;
    if (!st) return;
    Render.layout(st.players, st.players[st.turn]?.id);
    renderPlayers(st);
  }

  function renderPlayers(state) {
    const list = $('players');
    list.innerHTML = '';
    for (const p of state.players) {
      const li = document.createElement('li');
      li.className = p.id === state.players[state.turn].id && !state.over ? 'active' : '';
      li.innerHTML = `
        <span class="dot ${p.color}"></span>
        <span class="pname">${p.name}</span>
        <span class="pcell">${p.onBoard ? p.pos + 1 : '&ndash;'}</span>`;
      list.appendChild(li);
    }
  }

  /* Nine fixed pip positions; the face tumbles without changing the fair result. */
  function settle(value) {
    const dice = $('dice');
    dice.classList.remove('rolling');
    dice.replaceChildren();
    const faces = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8],
    };
    for (let i = 0; i < 9; i++) {
      const pip = document.createElement('i');
      pip.className = 'pip' + ((faces[value] || []).includes(i) ? ' visible' : '');
      dice.append(pip);
    }
    dice.setAttribute('aria-label', typeof value === 'number' ? `Die: ${value}` : 'Ready to roll');
  }
  function flicker() {
    settle(5);
    $('dice').classList.add('rolling');
    $('dice').setAttribute('aria-label', 'Die rolling');
  }

  /* ---------- engine events ---------- */
  function bindEngine() {
    Engine.on('reset', (st) => {
      clearLog();
      settle('–');
      Render.drawBoard(st);
      renderPlayers(st);
      $('btn-roll').disabled = false;
      $('panel-seed').textContent = String(st.seed).padStart(2, '0');
      log(`Board <span class="hl">#${String(st.seed).padStart(2, '0')}</span> —
           ${st.board.ladders.length} ladders, ${st.board.snakes.length} snakes.`);
      log(`${tag(st.players[0])} to roll.`);
    });

    Engine.on('roll-start', () => {
      $('btn-roll').disabled = true;
      flicker();
    });

    Engine.on('rolled', ({ player, value }) => {
      settle(value);
      log(`${tag(player)} rolled <span class="hl">${value}</span>.`);
    });

    const step = async ({ player, from, cell }) => {
      await Render.hop(player, from, cell);
      renderPlayers(Engine.state);
    };
    Engine.on('hop', step);
    Engine.on('step', step);
    Engine.on('jump-start', ({ player, from, to, kind }) => Render.ride(player, from, to, kind));
    Engine.on('blocked', ({ needed }) => {
      log(`No move — needs exactly ${needed}.`);
    });

    Engine.on('jump', ({ player, from, to, kind }) => {
      refresh();
      log(
        kind === 'ladder'
          ? `&nbsp;&nbsp;<span class="up">ladder ${from + 1} &rarr; ${to + 1}</span>`
          : `&nbsp;&nbsp;<span class="down">snake ${from + 1} &rarr; ${to + 1}</span>`,
      );
    });

    Engine.on('extra-turn', ({ player }) => {
      log(`&nbsp;&nbsp;${tag(player)} rolls again.`);
    });

    Engine.on('turn', ({ player }) => {
      refresh();
      $('btn-roll').disabled = false;
      $('btn-roll').textContent = `Roll — ${player.name}`;
    });

    Engine.on('win', ({ player }) => {
      log(`${tag(player)} reaches ${CONFIG.FINISH_CELL + 1}!`, 'win');
    });

    Engine.on('gameover', ({ player, state: st }) => {
      refresh();
      $('result-title').textContent = `${player.name} wins!`;
      $('result-sub').textContent = `Board #${String(st.seed).padStart(2, '0')} · ${player.rolls} rolls`;
      show('result');
      Render.confetti();
    });
  }

  /* ---------- lobby ---------- */
  function readLobby() {
    let seed = parseInt($('seed-input').value.trim(), 10);
    if (!Number.isFinite(seed)) seed = 0;
    seed = Math.min(99, Math.max(0, seed));
    $('seed-input').value = seed;
    return { seed, playerCount: parseInt($('player-count').value, 10) };
  }

  function start() {
    const { seed, playerCount } = readLobby();
    show('play');
    Engine.reset({ seed, playerCount });
  }

  function stepSeed(delta) {
    const cur = readLobby().seed;
    $('seed-input').value = (cur + delta + 100) % 100;
  }

  function bindLobby() {
    $('btn-start').addEventListener('click', start);

    $('seed-random').addEventListener('click', () => {
      $('seed-input').value = Math.floor(Math.random() * 100);
    });

    $('seed-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        start();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        stepSeed(+1);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        stepSeed(-1);
      }
    });

    $('btn-roll').addEventListener('click', () => Engine.roll());
    $('btn-again').addEventListener('click', () => show('lobby'));
    $('btn-quit').addEventListener('click', () => show('lobby'));

    // space / enter rolls while playing
    document.addEventListener('keydown', (e) => {
      if (screens.play.classList.contains('hidden')) return;
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault();
      if (!$('btn-roll').disabled) Engine.roll();
    });

    // tokens are positioned in %, so a resize needs a re-layout
    window.addEventListener('resize', () => {
      const st = Engine.state;
      if (st) Render.layout(st.players, st.players[st.turn]?.id);
    });
  }

  function init() {
    SNLSettings.init();
    $('motion-toggle').checked = !SNLSettings.get('lowGraphics');
    $('motion-toggle').addEventListener('change', (e) => {
      window.GameSettings?.set('lowGraphics', !e.target.checked);
    });
    bindEngine();
    bindLobby();
    $('seed-input').value = String(Math.floor(Math.random() * 100));
    $('btn-roll').textContent = 'Roll';
    show('lobby');
  }

  return { init, show };
})();
