/* Screens, accessible turn log, automatic seats and cancellation boundaries. */
const Ui = (() => {
  const $ = (id) => document.getElementById(id);
  let screen = 'lobby',
    cpuTimer = null,
    cpuEpoch = 0;
  const screens = ['lobby', 'play', 'result'];
  function clearCPU() {
    clearTimeout(cpuTimer);
    cpuTimer = null;
    cpuEpoch++;
  }
  function show(name) {
    screen = name;
    screens.forEach((s) => $(`screen-${s}`).classList.toggle('hidden', s !== name));
    if (name !== 'play') clearCPU();
  }
  function log(text) {
    const line = document.createElement('div');
    line.textContent = text;
    $('log').append(line);
    while ($('log').childElementCount > 40) $('log').firstChild.remove();
    $('log').scrollTop = $('log').scrollHeight;
  }
  function renderPlayers(s) {
    $('players').replaceChildren();
    for (const p of s.players) {
      const li = document.createElement('li');
      li.className = p.id === s.players[s.turn].id && !s.over ? 'active' : '';
      const dot = document.createElement('span');
      dot.className = `dot ${p.color}`;
      dot.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.textContent = p.name;
      const sub = document.createElement('small');
      sub.textContent = p.kind === 'cpu' ? `CPU · ${p.level}` : 'Human';
      const label = document.createElement('span');
      label.className = 'player-label';
      label.append(name, sub);
      const pos = document.createElement('span');
      pos.className = 'pcell';
      pos.textContent = p.onBoard ? p.pos + 1 : 'Gate';
      li.append(dot, label, pos);
      $('players').append(li);
    }
  }
  function refresh() {
    const s = Engine.state;
    if (!s) return;
    Render.layout(s.players, s.players[s.turn]?.id);
    renderPlayers(s);
  }
  function settleDie(value) {
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
    // Paint pips in the same background as the bevel. Some mobile/Chrome GPU paths
    // intermittently lose independently composited grid children after a 3D tumble.
    const circles = (faces[value] || [])
      .map(
        (i) =>
          `<circle cx="${27 + (i % 3) * 23}" cy="${24 + Math.floor(i / 3) * 23}" r="6.5" fill="#304339"/>`,
      )
      .join('');
    const face = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${circles}</svg>`;
    dice.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(face)}"),linear-gradient(135deg,#fff,#e7d8b8)`;
    dice.dataset.value = value || '';
    dice.setAttribute('aria-label', value ? `Die: ${value}` : 'Ready to roll');
  }
  function resumeButton() {
    const saved = SNLSave.load();
    $('btn-resume').hidden = !saved;
    if (saved) $('btn-resume').textContent = `Resume board ${String(saved.seed).padStart(2, '0')} →`;
  }
  function scheduleCPU() {
    clearCPU();
    const s = Engine.state;
    if (screen !== 'play' || document.hidden || $('help').open || !s || s.over || s.rolling) return;
    const player = s.players[s.turn];
    if (player.kind !== 'cpu') return;
    const plan = SNLCPU.plan(s, player.level),
      token = cpuEpoch;
    log(`${player.name}: ${plan.message}`);
    cpuTimer = setTimeout(() => {
      if (
        token === cpuEpoch &&
        screen === 'play' &&
        !document.hidden &&
        !$('help').open &&
        Engine.state === s
      )
        Engine.roll();
    }, plan.delay);
  }
  function turn({ player }) {
    refresh();
    $('btn-roll').disabled = player.kind === 'cpu' || Engine.state.rolling;
    $('btn-roll').textContent = player.kind === 'cpu' ? `${player.name} thinking…` : `Roll · ${player.name}`;
    $('turn-status').textContent = `${player.name}'s turn${player.kind === 'cpu' ? ' · computer' : ''}`;
    scheduleCPU();
  }
  function bindEngine() {
    Engine.on('reset', (s) => {
      clearCPU();
      $('log').replaceChildren();
      settleDie();
      Render.drawBoard(s);
      renderPlayers(s);
      $('panel-seed').textContent = String(s.seed).padStart(2, '0');
      log(`Board #${String(s.seed).padStart(2, '0')} — 9 ladders and 8 snakes. Race to 100!`);
    });
    Engine.on('cancel', () => {
      clearCPU();
      Render.cancelMotion();
      settleDie();
    });
    Engine.on('settled', (s) => {
      if (s.over) SNLSave.clear();
      else {
        const ok = SNLSave.store(Engine.snapshot());
        $('save-note').textContent = ok
          ? 'Progress saved after every turn.'
          : 'Storage unavailable — progress lasts only in this tab.';
      }
    });
    Engine.on('roll-start', () => {
      $('btn-roll').disabled = true;
      $('turn-status').textContent = 'Rolling…';
      settleDie(5);
      $('dice').classList.add('rolling');
      $('dice').setAttribute('aria-label', 'Die rolling');
      SNLSound.play('roll');
    });
    Engine.on('rolled', ({ player, value }) => {
      settleDie(value);
      log(`${player.name} rolled ${value}.`);
    });
    const step = async ({ player, from, cell }) => {
      SNLSound.play('hop');
      await Render.hop(player, from, cell);
      // The render waiter may have resolved because Quit cancelled it.
      if (Engine.state?.players.includes(player)) renderPlayers(Engine.state);
    };
    Engine.on('step', step);
    Engine.on('hop', step);
    Engine.on('jump-start', ({ player, from, to, kind }) => {
      SNLSound.play(kind);
      return Render.ride(player, from, to, kind);
    });
    Engine.on('jump', ({ from, to, kind }) => {
      refresh();
      log(`${kind === 'ladder' ? 'Climb' : 'Slide'}: ${from + 1} → ${to + 1}.`);
    });
    Engine.on('blocked', ({ needed, entry }) =>
      log(entry ? 'A six opens the gate. Try next turn.' : `Needs exactly ${needed} to reach 100. No move.`),
    );
    Engine.on('extra-turn', ({ player }) => log(`A six! ${player.name} rolls again.`));
    Engine.on('turn', turn);
    Engine.on('win', ({ player }) => {
      log(`${player.name} reaches 100!`);
      SNLSound.play('win');
    });
    Engine.on('gameover', ({ player }) => {
      refresh();
      $('result-title').textContent = `${player.name} wins!`;
      $('result-sub').textContent = `Board #${Engine.state.seed} · ${player.rolls} rolls · first to 100`;
      show('result');
      Render.confetti();
      $('btn-again').focus();
    });
  }
  function readLobby() {
    const value = Number.parseInt($('seed-input').value, 10),
      seed = Math.max(0, Math.min(99, Number.isFinite(value) ? value : 0));
    $('seed-input').value = seed;
    const seats = [0, 1, 2, 3]
      .map((id) => ({ id, kind: $(`seat-${id}`).value, level: $(`level-${id}`).value }))
      .filter((s) => s.kind !== 'off');
    return {
      seed,
      seats,
      rules: {
        exact: $('rule-exact').checked,
        sixAgain: $('rule-again').checked,
        sixStart: $('rule-start').checked,
      },
    };
  }
  function start() {
    const options = readLobby();
    if (options.seats.length < 2) {
      $('lobby-error').textContent = 'Choose at least two Human or CPU seats.';
      return;
    }
    SNLSound.unlock();
    clearCPU();
    Render.cancelMotion();
    show('play');
    Engine.reset(options);
    $('btn-roll').focus();
  }
  function quit() {
    // Engine first invalidates the async session, then Render resolves outstanding animation waiters.
    Engine.cancel();
    show('lobby');
    resumeButton();
    $('btn-start').focus();
  }
  function syncSettings() {
    $('motion-toggle').checked = !SNLSettings.get('lowGraphics');
    $('mute-toggle').textContent = SNLSettings.get('sfx') ? '♪' : '♫̸';
    $('mute-toggle').setAttribute('aria-pressed', String(!SNLSettings.get('sfx')));
    $('mute-toggle').setAttribute('aria-label', SNLSettings.get('sfx') ? 'Mute sounds' : 'Unmute sounds');
  }
  function init() {
    SNLSettings.init();
    syncSettings();
    bindEngine();
    window.GameSettings?.onChange(syncSettings);
    const defaultLevel =
      { easy: 'easy', normal: 'medium', hard: 'hard' }[SNLSettings.get('difficulty')] || 'medium';
    for (let id = 0; id < 4; id++) {
      $(`level-${id}`).value = defaultLevel;
      const update = () => {
        $(`level-${id}`).disabled = $(`seat-${id}`).value !== 'cpu';
      };
      $(`seat-${id}`).addEventListener('change', update);
      update();
    }
    $('btn-start').addEventListener('click', start);
    $('btn-resume').addEventListener('click', () => {
      const saved = SNLSave.load();
      if (!saved) {
        resumeButton();
        return;
      }
      SNLSound.unlock();
      show('play');
      Engine.restore(saved);
    });
    $('seed-random').addEventListener(
      'click',
      () => ($('seed-input').value = Math.floor(Math.random() * 100)),
    );
    $('btn-roll').addEventListener('click', () => {
      SNLSound.unlock();
      Engine.roll();
    });
    $('btn-quit').addEventListener('click', quit);
    $('btn-again').addEventListener('click', () => {
      Engine.cancel();
      show('lobby');
      resumeButton();
    });
    $('motion-toggle').addEventListener('change', (e) => SNLSettings.set('lowGraphics', !e.target.checked));
    $('mute-toggle').addEventListener('click', () => {
      SNLSettings.set('sfx', !SNLSettings.get('sfx'));
      syncSettings();
      SNLSound.unlock();
    });
    $('btn-help').addEventListener('click', () => {
      clearCPU();
      $('help').showModal();
    });
    $('help-close').addEventListener('click', () => $('help').close());
    $('help').addEventListener('close', scheduleCPU);
    document.addEventListener('visibilitychange', () => (document.hidden ? clearCPU() : scheduleCPU()));
    addEventListener('storage', (e) => {
      if (e.key === SNLSave.KEY || e.key === null) resumeButton();
    });
    document.addEventListener('keydown', (e) => {
      if (
        screen !== 'play' ||
        $('help').open ||
        e.repeat ||
        e.code !== 'Space' ||
        /INPUT|SELECT|BUTTON|A/.test(e.target.tagName)
      )
        return;
      e.preventDefault();
      if (!$('btn-roll').disabled) {
        SNLSound.unlock();
        Engine.roll();
      }
    });
    resumeButton();
    show('lobby');
  }
  return { init, show, start, quit };
})();
