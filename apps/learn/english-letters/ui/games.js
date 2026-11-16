(function () {
  'use strict';
  const E = window.English, { el, button } = E, $ = id => document.getElementById(id), out = $('content');
  const names = { match: 'Match capital & small', listen: 'Listen & pick', first: 'First letter', spell: 'Spell the word', missing: 'Missing letter' };
  E.rewards = E.read('rewards', { best: {}, streak: {} });
  if (!E.rewards || typeof E.rewards !== 'object') E.rewards = {};
  E.rewards.best = E.rewards.best || {}; E.rewards.streak = E.rewards.streak || {};
  const stats = el('span'); stats.id = 'rewards'; document.querySelector('.status').append(stats);
  function rewardStatus() {
    const best = E.rewards.best, total = Object.keys(names).reduce((sum, k) => sum + (best[k] || 0), 0), s = E.rewards.streak;
    stats.textContent = 'Games ' + total + '/15 ★ · ' + (s.count || 0) + ' day streak' + (s.day && s.day !== E.localDay() ? ' · last ' + s.day : '');
    E.write('rewards', E.rewards);
  }
  E.recordActivity = function () { E.rewards.streak = E.activity(E.rewards.streak); rewardStatus(); };
  function quit() { E.quiet(); E.game = null; $('pause-card').close(); E.views.games(); }
  function pause() {
    if (!E.game || E.game.finished) return;
    E.game.paused = true; E.quiet(); if (!$('pause-card').open) $('pause-card').showModal();
  }
  E.pauseGame = pause;
  $('pause-card').addEventListener('cancel', () => { if (E.game) E.game.paused = false; });
  $('resume-game').onclick = () => { if (E.game) E.game.paused = false; $('pause-card').close(); };
  $('quit-game').onclick = quit;
  function complete(g) {
    out.className = ''; const stars = E.gameStars(g.correct); E.rewards.best[g.mode] = Math.max(E.rewards.best[g.mode] || 0, stars); E.recordActivity();
    out.replaceChildren(el('h2', 'Practice complete!'), el('p', '★'.repeat(stars) + '☆'.repeat(3 - stars), 'result-stars'), el('p', g.correct + ' / 10 correct. Every practice helps.'));
    out.append(el('p', 'Best in ' + names[g.mode] + ': ' + E.rewards.best[g.mode] + ' stars. Try again whenever you like.'), button('Play again', () => start(g.mode), 'primary'), button('Choose another game', quit));
  }
  function start(mode) { E.quiet(); E.game = E.createGame(mode); render(); }
  function letterLabel(letter, capital) { return capital ? letter.capital : letter.small; }
  function render() {
    const g = E.game, q = E.current(g); if (g.finished) { complete(g); return; }
    out.className = 'playing ' + g.mode;
    const head = el('div', undefined, 'game-head'); head.append(el('h2', names[g.mode]), button('Pause / quit', pause));
    const meter = el('p', 'Question ' + (g.index + 1) + ' of 10 · ' + g.correct + ' correct', 'muted');
    const prompt = el('section', undefined, 'game-prompt'); prompt.id = 'game-prompt'; prompt.setAttribute('aria-live', 'polite');
    let spoken = '', answerText = '';
    if (g.mode === 'match') {
      const show = letterLabel(q.target, q.showCapital);
      answerText = letterLabel(q.target, !q.showCapital);
      spoken = q.target.nameSpoken;
      prompt.append(el('p', 'Find the ' + (q.showCapital ? 'small' : 'capital') + ' letter that matches:'), el('strong', show, 'game-glyph en'));
    } else if (g.mode === 'listen') {
      spoken = q.target.nameSpoken; answerText = q.target.capital + ' ' + q.target.small;
      prompt.append(el('p', 'Listen, then choose the letter.'));
      if (!E.hasVoice || !E.prefs.audio || E.prefs.muted) prompt.append(el('strong', q.target.name, 'roman-prompt'), el('p', 'Audio unavailable or off — match this letter name.'));
      else prompt.append(el('p', 'Tap Hear again whenever needed.'));
    } else if (g.mode === 'first') {
      spoken = q.target.word; answerText = q.letter.capital;
      prompt.append(el('span', q.target.emoji, 'emoji'), el('p', q.target.meaning), el('p', 'What is the first letter?'));
    } else if (g.mode === 'missing') {
      spoken = q.target.word; answerText = q.missing;
      prompt.append(el('span', q.target.emoji, 'emoji'), el('p', q.target.meaning), el('strong', q.pattern, 'game-glyph en'), el('p', 'Which letter is missing?'));
    } else {
      spoken = q.target.word; answerText = q.target.word;
      prompt.append(el('span', q.target.emoji, 'emoji'), el('p', q.target.meaning), el('p', 'Put the letter tiles in order.', 'note'));
    }
    prompt.append(button('Hear', () => {
      if (g.mode === 'listen') E.speakLetter(q.target);
      else if (g.mode === 'match') E.speakLetter(q.target);
      else E.speakWord(spoken);
    }));
    const choices = el('div', undefined, 'game-choices'), feedback = el('p', '', 'game-feedback'); feedback.id = 'game-feedback'; feedback.setAttribute('role', 'status');
    out.replaceChildren(head, meter, prompt, choices, feedback);
    function submit(value) {
      const correct = E.answer(g, value); if (correct === null) return;
      E.quiet(); E.tone(correct);
      choices.querySelectorAll('button').forEach(b => b.disabled = true);
      feedback.textContent = (correct ? '✓ Well done! ' : 'Keep practising! The answer is ') + answerText + (g.mode === 'first' || g.mode === 'missing' ? ' · ' + q.target.word : g.mode === 'listen' || g.mode === 'match' ? ' · ' + q.target.name : '');
      const next = button(g.index === 9 ? 'See my stars' : 'Next question', () => { if (E.next(g)) render(); }, 'primary'); next.id = 'next-question'; out.append(next); next.focus();
    }
    if (g.mode === 'spell') {
      const built = el('p', 'Tap a tile to start', 'built en'); built.id = 'built'; choices.before(built);
      const controls = el('div', undefined, 'row');
      const undo = button('Undo tile', () => { if (g.paused || q.answered) return; q.used.pop(); update(); });
      const clear = button('Clear word', () => { if (g.paused || q.answered) return; q.used = []; update(); });
      const check = button('Check word', () => submit(E.built(g)), 'primary'); check.id = 'check-word';
      controls.append(undo, clear, check); choices.append(controls);
      const tiles = el('div', undefined, 'tile-row'); choices.prepend(tiles);
      q.tiles.forEach((t, i) => { const b = button(t.text, () => { if (E.tile(g, i)) update(); }, 'word-tile en'); b.dataset.tile = i; tiles.append(b); });
      function update() {
        built.textContent = E.built(g) || 'Tap a tile to start';
        tiles.querySelectorAll('button').forEach((b, i) => b.disabled = q.used.includes(i));
        check.disabled = q.used.length !== q.tiles.length; undo.disabled = clear.disabled = !q.used.length;
      }
      update();
    } else q.options.forEach(option => {
      const label = g.mode === 'match' ? letterLabel(option, !q.showCapital) : option.capital + ' ' + option.small;
      const value = (g.mode === 'first' || g.mode === 'missing') ? option.id : option.id;
      const b = button(label, () => submit(value), 'answer en'); b.dataset.answer = option.id; choices.append(b);
    });
    out.scrollIntoView({ block: 'start' });
  }
  E.views.games = function () {
    out.className = ''; E.game = null; E.quiet(); out.replaceChildren(el('h2', 'Gentle practice games'), el('p', 'Ten questions, no timer. 4 correct earns ★; 7 earns ★★; 9 earns ★★★. You can pause or quit at any time.', 'intro'));
    const grid = el('div', undefined, 'game-menu');
    Object.entries(names).forEach(([id, name]) => { const b = button(name, () => start(id), 'game-menu-card'); b.dataset.game = id; b.append(el('small', 'Best ' + '★'.repeat(E.rewards.best[id] || 0) + '☆'.repeat(3 - (E.rewards.best[id] || 0)))); grid.append(b); }); out.append(grid);
  };
  const navigate = E.navigate;
  E.navigate = function (mode) { out.className = ''; E.game = null; E.quiet(); navigate(mode); };
  $('mute').onclick = () => { E.prefs.muted = !E.prefs.muted; E.write('prefs', E.prefs); E.quiet(); muteLabel(); E.audioChanged(); };
  function muteLabel() { $('mute').textContent = E.prefs.muted ? 'Sound off' : 'Sound on'; $('mute').setAttribute('aria-pressed', E.prefs.muted); }
  E.audioChanged = () => { if (E.game && E.game.mode === 'listen' && !E.game.finished && !E.current(E.game).answered) render(); };
  $('help').onclick = () => { E.quiet(); $('help-card').showModal(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && E.game && !document.querySelector('dialog[open]')) pause(); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && E.game && !document.querySelector('dialog[open]')) { e.preventDefault(); pause(); } });
  window.addEventListener('resize', () => { if (E.game && !E.game.finished) requestAnimationFrame(() => out.scrollIntoView({ block: 'start' })); });
  muteLabel(); rewardStatus();
})();
