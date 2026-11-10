/* SWAP-1a controller. A whole swap/cascade is one atomic saved turn.
 * Only stable boards are persisted; controls lock throughout a transaction. */
(() => {
  'use strict';
  const R = SweetRules, P = SweetProgress, V = SweetView, $ = id => document.getElementById(id);
  let store; try { store = window.localStorage; } catch (_) { store = null; }
  let state = P.load(store) || P.fresh(1), best = P.bests(store);
  let busy = false, selected = -1, idleSince = Date.now(), dialog = null, returnFocus = null;
  const active = () => !busy && !dialog && state.moves > 0;
  const status = text => { $('status').textContent = text; };
  const resetIdle = () => { idleSince = Date.now(); V.hint(null); };
  const save = () => {
    best[state.level] = Math.max(best[state.level], state.score);
    const ok = P.write(store, P.KEY, state);
    P.write(store, P.BEST, best);
    if (!ok) status('Storage unavailable · progress lasts until this page closes.');
  };
  function hud() {
    $('level').value = state.level; $('level').disabled = busy;
    $('pauseBtn').disabled = $('helpBtn').disabled = busy;
    $('score').textContent = state.score.toLocaleString(); $('moves').textContent = state.moves;
    $('best').textContent = Math.max(best[state.level], state.score).toLocaleString();
    $('target').textContent = P.target(state.level).toLocaleString();
    const thresholds = P.thresholds(state.level), stars = P.stars(state.level, state.score);
    $('stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('stars').setAttribute('aria-label', `${stars} of 3 stars`);
    $('meter').style.width = Math.min(100, state.score / thresholds[2] * 100) + '%';
    $('thresholds').textContent = `Stars: ${thresholds.map(n => n.toLocaleString()).join(' / ')}`;
    V.board.setAttribute('aria-busy', String(busy));
  }
  function show(id) {
    if (!dialog) returnFocus = document.activeElement;
    for (const name of ['pause', 'help', 'over']) $(name).hidden = id !== name;
    dialog = id;
    document.querySelector('main').inert = !!id;
    if (id) $(id).querySelector('button:not([hidden])')?.focus();
    else returnFocus?.focus();
    resetIdle();
  }
  function end() {
    const stars = P.stars(state.level, state.score);
    $('overTitle').textContent = stars ? `Level ${state.level} complete!` : 'A little more sweetness?';
    $('endStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    $('endStars').setAttribute('aria-label', `${stars} of 3 stars`);
    $('endInfo').textContent = `Score ${state.score.toLocaleString()} · Target ${P.target(state.level).toLocaleString()} · Best ${best[state.level].toLocaleString()}`;
    $('nextBtn').hidden = !stars;
    $('nextBtn').textContent = state.level === P.LEVELS ? 'Next · Level 1' : 'Next';
    show('over');
  }
  function start(level) {
    if (busy) return;
    state = P.fresh(level); selected = -1; show(null); V.draw(state.board); hud();
    status('Swap neighbours to match 3.'); save();
  }
  async function move(a, b) {
    if (!active() || !R.adjacent(a, b)) return;
    busy = true; selected = -1; resetIdle(); V.draw(state.board); hud();
    await V.swap(a, b);
    let groups = R.trySwap(state.board, a, b);
    if (!groups.length) {
      await V.swap(a, b, true); busy = false; V.draw(state.board); hud();
      status('That swap needs a match · no move used.'); resetIdle(); return;
    }
    state.moves--; V.draw(state.board);
    let combo = 0;
    while (groups.length) {
      combo++;
      await V.clear(groups);
      const count = R.clearMatches(state.board, groups), points = count * 60 * combo;
      state.score += points; status(`${combo > 1 ? `Sweet cascade ×${combo}` : 'Sweet match'} · +${points}`); hud();
      const falls = R.gravityAndRefill(state.board);
      V.draw(state.board); await V.fall(falls);
      groups = R.findMatches(state.board);
      // Safety valve for a pathological RNG. Never save a board with ready matches.
      if (combo >= 80 && groups.length) { R.reshuffle(state.board); V.draw(state.board); groups = []; }
    }
    if (!R.findMove(state.board)) { R.reshuffle(state.board); V.draw(state.board); status('Fresh mix! No moves lost.'); }
    busy = false; save(); hud(); resetIdle();
    if (!state.moves) end();
    else if (P.stars(state.level, state.score)) status('Target reached! Play on for more stars.');
  }
  function choose(i) {
    resetIdle();
    if (selected === i) selected = -1;
    else if (R.adjacent(selected, i)) { move(selected, i); return; }
    else selected = i;
    V.draw(state.board, selected);
  }
  for (let i = 1; i <= P.LEVELS; i++) $('level').add(new Option(String(i), String(i)));
  $('level').onchange = () => start(Number($('level').value));
  $('pauseBtn').onclick = () => { if (active()) show('pause'); };
  $('resumeBtn').onclick = () => show(null);
  $('restartBtn').onclick = $('retryBtn').onclick = () => start(state.level);
  $('nextBtn').onclick = () => start(state.level % P.LEVELS + 1);
  let helpReturn = null;
  $('helpBtn').onclick = () => { helpReturn = dialog; show('help'); };
  $('helpClose').onclick = () => show(helpReturn);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (dialog === 'help') show(helpReturn);
      else if (dialog === 'pause') show(null);
      else if (active()) show('pause');
    }
    // Keep keyboard focus inside the active modal.
    if (e.key === 'Tab' && dialog) {
      const buttons = [...$(dialog).querySelectorAll('button:not([hidden])')];
      const index = buttons.indexOf(document.activeElement);
      if ((e.shiftKey && index <= 0) || (!e.shiftKey && index === buttons.length - 1)) {
        e.preventDefault(); buttons[e.shiftKey ? buttons.length - 1 : 0].focus();
      }
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !dialog && state.moves > 0) show('pause');
  });
  bindSweetInput(V, choose, move, active);
  setInterval(() => {
    if (active() && SweetSettings.get('showHints') && Date.now() - idleSince >= 5000) V.hint(R.findMove(state.board));
    else V.hint(null);
  }, 250);
  V.draw(state.board); hud(); save();
  if (!state.moves) end();
})();
