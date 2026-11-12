/* NP-1c: plate builder, day planner, games, How to use. User text uses textContent.
   NP4: Portions tab, personal serving sizes, and typed grams on a plate item. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const fmt = (n) => { const d = Number.isInteger(n) ? 1 : 10; return (Math.round(n * d) / d).toString(); };
  let state = NPDay.fresh(), saveKind = 'plate', message = '', view = 'plate', groupFilter = 'all';
  let portionGroup = 'all', confirmAction = null;
  let openGroups = new Set(['grains']), game = null, compactMql = matchMedia('(max-width: 800px)');
  try { const text = localStorage.getItem(NPDay.KEY); if (text) state = NPDay.restore(text); }
  catch (_) { message = 'Saved data could not be read. A new day was started.'; }
  if (!state.scores) state.scores = { guess: 0, plate: 0, swaps: 0 };
  if (!state.portions) state.portions = {};
  const plate = () => state.meals[state.meal];
  function status(text) { message = text || message; $('status').textContent = message; }
  function save() {
    try { localStorage.setItem(NPDay.KEY, JSON.stringify(state)); }
    catch (_) { status('Storage is unavailable or full. Changes only last this session.'); }
  }
  function fillSelect(id, rows, value) {
    const box = $(id); box.replaceChildren();
    rows.forEach(row => { const o = el('option', row.label); o.value = row.id; box.append(o); });
    box.value = value;
  }
  fillSelect('age', NPTargets.ages, state.person.age);
  fillSelect('sex', NPTargets.sexes, state.person.sex);
  fillSelect('activity', NPTargets.activities, state.person.activity);
  fillSelect('diet', NPTargets.diets, state.person.diet);

  function foodBtn(food, compact) {
    const btn = el('button', null, 'food'); btn.type = 'button'; btn.draggable = true; btn.dataset.id = food.id;
    const unit = NP.portionGrams(food.id, state.portions);
    const custom = unit !== food.g;
    const kcal = custom ? Math.round(NP.scaleNutrient(food, 'kcal', unit)) : food.kcal;
    /* (before NP4) el('small', food.portion + ' · ' + food.kcal + ' kcal') */
    const line = custom
      ? food.portion + ' · your ' + unit + ' g · ' + kcal + ' kcal'
      : food.portion + ' · ' + food.kcal + ' kcal';
    btn.append(NPIcons.make(food.icon, compact ? 64 : 80), el('strong', food.name), el('small', line));
    btn.addEventListener('click', () => addFood(food.id));
    btn.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', food.id); ev.dataTransfer.effectAllowed = 'copy'; });
    return btn;
  }
  function chips() {
    const box = $('chips'); box.replaceChildren();
    [['all', 'All groups']].concat(NP.foods.groups).forEach(([id, name]) => {
      const btn = el('button', name); btn.type = 'button'; btn.dataset.group = id;
      btn.setAttribute('aria-pressed', groupFilter === id ? 'true' : 'false');
      btn.onclick = () => { groupFilter = id; library(); };
      box.append(btn);
    });
  }
  function library() {
    chips();
    const q = $('search').value, foods = NP.filterFoods(q, groupFilter, state.person.diet);
    const box = $('library'); box.replaceChildren();
    $('lib-count').textContent = foods.length + ' food' + (foods.length === 1 ? '' : 's');
    const compact = compactMql.matches, searching = !!(q || '').trim();
    const mount = (items, parent) => {
      const grid = el('div', null, compact ? 'food-list' : 'food-grid');
      items.forEach(food => grid.append(foodBtn(food, compact)));
      parent.append(grid);
    };
    if (groupFilter === 'all' && !searching && compact) {
      NP.foods.groups.forEach(([id, name]) => {
        const items = foods.filter(f => f.group === id);
        if (!items.length) return;
        const det = el('details', null, 'food-group');
        det.open = openGroups.has(id);
        det.addEventListener('toggle', () => { if (det.open) openGroups.add(id); else openGroups.delete(id); });
        det.append(el('summary', name + ' · ' + items.length));
        mount(items, det); box.append(det);
      });
    } else mount(foods, box);
  }
  function addFood(id) {
    try { state.meals[state.meal] = NP.add(plate(), id, 1, state.portions); status('Added ' + NP.food(id).name + '.'); save(); render(); }
    catch (err) { status(err.message); }
  }
  function meals() {
    const box = $('meals'); box.replaceChildren();
    const parts = NPDay.mealTotals(state.meals);
    NPDay.MEALS.forEach(([id, name]) => {
      const btn = el('button', name + (parts[id].portions ? ' · ' + parts[id].kcal + ' kcal' : ''));
      btn.type = 'button'; btn.dataset.m = id; btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', state.meal === id ? 'true' : 'false');
      if (state.meal === id) btn.setAttribute('aria-pressed', 'true');
      btn.onclick = () => { state.meal = id; save(); render(); };
      box.append(btn);
    });
  }
  function renderPlate() {
    const box = $('plate'); box.replaceChildren();
    $('plate-title').textContent = NPDay.MEALS.find(m => m[0] === state.meal)[1];
    if (!plate().length) box.append(el('p', 'This meal is empty. Tap a food to add it.', 'empty'));
    plate().forEach(row => {
      const food = NP.food(row.id), card = el('div', null, 'served');
      const mid = el('div'); mid.append(el('strong', food.name), el('small', '  ' + food.portion));
      const qty = el('div', null, 'qty');
      const less = el('button', '−'); less.type = 'button'; less.setAttribute('aria-label', 'Fewer ' + food.name);
      less.onclick = () => { state.meals[state.meal] = NP.setQty(plate(), row.id, row.qty - 1, state.portions); save(); render(); };
      const more = el('button', '+'); more.type = 'button'; more.setAttribute('aria-label', 'More ' + food.name);
      more.onclick = () => { try { state.meals[state.meal] = NP.setQty(plate(), row.id, row.qty + 1, state.portions); save(); render(); } catch (err) { status(err.message); } };
      qty.append(less, el('span', String(row.qty)), more);
      const grams = el('label', null, 'item-grams');
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = String(NP.MIN_G); inp.max = String(NP.MAX_ITEM_G); inp.step = '0.1';
      inp.value = String(row.g); inp.setAttribute('aria-label', 'Grams of ' + food.name + ' for this serving');
      const commitGrams = () => {
        try {
          state.meals[state.meal] = NP.setItemGrams(plate(), row.id, inp.value);
          save(); render();
        } catch (err) {
          inp.value = String(row.g);
          showNotice('Check the amount', err.message);
        }
      };
      inp.addEventListener('change', commitGrams);
      grams.append('g ', inp);
      card.append(NPIcons.make(food.icon, 72), mid, qty, grams); box.append(card);
    });
  }
  function mealTotals() {
    const t = NP.totals(plate()), box = $('totals'); box.replaceChildren();
    const stats = el('div', null, 'stats');
    [['kcal', t.kcal + ' kcal', 'This meal'], ['prot', fmt(t.prot) + ' g', 'Protein'],
      ['carb', fmt(t.carb) + ' g', 'Carbs'], ['fat', fmt(t.fat) + ' g', 'Fat'],
      ['fibre', fmt(t.fibre) + ' g', 'Fibre'], ['items', t.portions + ' portion' + (t.portions === 1 ? '' : 's'), t.items + ' food' + (t.items === 1 ? '' : 's')]
    ].forEach(([, value, label]) => { const s = el('div', null, 'stat'); s.append(el('strong', value), el('small', label)); stats.append(s); });
    const more = el('p', null, 'more-nut');
    more.append('Sugar ' + fmt(t.sugar) + ' g · Iron ' + fmt(t.fe) + ' mg · Calcium ' + fmt(t.ca) + ' mg · Vitamin C ' + fmt(t.vc) + ' mg  (approximate)');
    box.append(stats, more);
  }
  function pct(n) { return Math.round(n * 100); }
  function balance() {
    const b = NP.balance(plate()), box = $('balance'); box.replaceChildren();
    const pie = el('div', null, 'pie');
    const g = pct(b.shares.grains), p = pct(b.shares.protein), v = Math.max(0, 100 - g - p);
    pie.style.background = b.core
      ? 'conic-gradient(var(--grain) 0 ' + g + '%, var(--protein) ' + g + '% ' + (g + p) + '%, var(--veg) ' + (g + p) + '% 100%)'
      : 'conic-gradient(var(--soft) 0 100%)';
    pie.setAttribute('aria-hidden', 'true');
    const legend = el('div', null, 'legend');
    legend.append(el('h2', 'This meal — balanced-plate guide'));
    function row(color, label, share, ideal) {
      const line = el('span'); line.append(el('i', null, 'swatch'), ' ' + label + ': ' + (b.core ? pct(share) + '%' : '—') +
        '  (guide about ' + pct(ideal) + '%)');
      line.querySelector('.swatch').style.background = color;
      const bar = el('div', null, 'bar'), fill = el('i'); fill.style.width = (share * 100) + '%'; fill.style.background = color; bar.append(fill);
      legend.append(line, bar);
    }
    row('var(--veg)', 'Vegetables and fruit', b.shares.vegfruit, b.ideal.vegfruit);
    row('var(--grain)', 'Grains and millets', b.shares.grains, b.ideal.grains);
    row('var(--protein)', 'Pulses, eggs, meat or fish', b.shares.protein, b.ideal.protein);
    legend.append(el('p', 'A balanced meal is about half vegetables and fruit, one quarter grains, and one quarter protein, with milk or curd on the side. Shares use food weight so vegetables stay visible.', 'muted'));
    if (b.dairy) legend.append(el('p', 'Dairy on the side: ' + b.dairy + ' g.', 'muted'));
    if (b.extras) legend.append(el('p', 'Oils, snacks or sweets on this plate: ' + b.extras + ' g — keep these small.', 'muted'));
    const guide = el('div', null, 'guide'); guide.append(pie, legend); box.append(guide);
  }
  function progress() {
    const t = NPDay.dayTotals(state.meals), g = NPTargets.targets(state.person.age, state.person.activity, state.person.sex);
    const box = $('progress'); box.replaceChildren();
    box.append(el('h2', 'Today against a rough daily target'));
    const mid = state.person.sex === 'unspecified' ? ' Mid-point used when sex is not given.' : '';
    $('target-note').textContent = 'Rough target: about ' + g.kcal + ' kcal, ' + g.prot + ' g protein, ' + g.fe + ' mg iron, under ' + g.sugar + ' g sugar. Approximate ICMR-NIN style figures.' + mid + ' Needs vary by body size, health and life stage.';
    const grid = el('div', null, 'bars');
    const rows = [
      ['kcal', 'Energy (kcal)', t.kcal, g.kcal, false],
      ['prot', 'Protein (g)', t.prot, g.prot, false],
      ['carb', 'Carbohydrate (g)', t.carb, g.carb, false],
      ['fat', 'Fat (g)', t.fat, g.fat, false],
      ['fibre', 'Fibre (g)', t.fibre, g.fibre, false],
      ['sugar', 'Sugar (g, keep below)', t.sugar, g.sugar, true],
      ['fe', 'Iron (mg)', t.fe, g.fe, false],
      ['ca', 'Calcium (mg)', t.ca, g.ca, false],
      ['vc', 'Vitamin C (mg)', t.vc, g.vc, false]
    ];
    rows.forEach(([id, label, value, target, cap]) => {
      const ratio = target ? value / target : 0, over = cap ? value > target : ratio > 1.05;
      const row = el('div', null, 'prog' + (over ? ' over' : ''));
      row.append(el('span', label), el('strong', fmt(value) + ' / ' + target));
      const bar = el('div', null, 'bar'), fill = el('i');
      fill.style.width = Math.min(100, Math.max(0, ratio * 100)) + '%';
      bar.append(fill); row.append(bar); grid.append(row);
    });
    box.append(grid);
    const tips = $('tips'); tips.replaceChildren();
    NPDay.tips(state.meals, state.person).forEach(text => tips.append(el('p', text)));
  }
  function savedList(box, rows, load, remove, empty) {
    box.replaceChildren();
    if (!rows.length) { box.append(el('p', empty, 'muted')); return; }
    rows.forEach(row => {
      const line = el('div', null, 'saved-row');
      line.append(el('span', row.name));
      const use = el('button', 'Load'); use.type = 'button'; use.onclick = () => load(row.id);
      const del = el('button', 'Delete'); del.type = 'button'; del.onclick = () => remove(row.id);
      line.append(use, del); box.append(line);
    });
  }
  function saved() {
    savedList($('saved-plates'), state.plates, id => { state = NPDay.loadPlate(state, id); save(); render(); status('Plate loaded into this meal.'); },
      id => { state = NPDay.deletePlate(state, id); save(); render(); status('Saved plate deleted.'); }, 'No saved plates yet.');
    savedList($('saved-days'), state.days, id => { state = NPDay.loadDay(state, id); fillSelect('age', NPTargets.ages, state.person.age);
      fillSelect('sex', NPTargets.sexes, state.person.sex);
      fillSelect('activity', NPTargets.activities, state.person.activity); fillSelect('diet', NPTargets.diets, state.person.diet);
      save(); render(); status('Day loaded.'); },
      id => { state = NPDay.deleteDay(state, id); save(); render(); status('Saved day deleted.'); }, 'No saved days yet.');
  }
  function showNotice(title, text) {
    $('notice-title').textContent = title;
    $('notice-text').textContent = text;
    $('notice-dialog').showModal();
  }
  function askConfirm(title, text, okLabel, onOk) {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    $('confirm-ok').textContent = okLabel || 'OK';
    confirmAction = onOk;
    $('confirm-dialog').showModal();
  }
  function renderPortions() {
    const q = $('portion-search').value;
    const foods = NP.filterFoods(q, portionGroup, 'all');
    const chips = $('portion-chips'); chips.replaceChildren();
    [['all', 'All groups']].concat(NP.foods.groups).forEach(([id, name]) => {
      const btn = el('button', name); btn.type = 'button'; btn.dataset.group = id;
      btn.setAttribute('aria-pressed', portionGroup === id ? 'true' : 'false');
      btn.onclick = () => { portionGroup = id; renderPortions(); };
      chips.append(btn);
    });
    $('portion-count').textContent = foods.length + ' food' + (foods.length === 1 ? '' : 's');
    const box = $('portions-list'); box.replaceChildren();
    foods.forEach(food => {
      const row = el('div', null, 'portion-row');
      const meta = el('div', null, 'meta');
      const unit = NP.portionGrams(food.id, state.portions);
      const custom = state.portions[food.id] != null;
      meta.append(el('strong', food.name),
        el('small', 'Default: ' + food.portion + ' · ' + food.g + ' g' + (custom ? ' · your size ' + unit + ' g' : '')));
      const grams = el('div', null, 'grams');
      const lab = el('label', 'Your size (g)');
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = String(NP.MIN_G); inp.max = String(NP.MAX_PORTION_G); inp.step = '0.1';
      inp.placeholder = String(food.g);
      inp.value = custom ? String(state.portions[food.id]) : '';
      inp.setAttribute('aria-label', 'Usual portion of ' + food.name + ' in grams');
      const commit = () => {
        try {
          state.portions = NP.setPortion(state.portions, food.id, inp.value);
          save(); render();
        } catch (err) {
          inp.value = custom ? String(state.portions[food.id]) : '';
          showNotice('Check the amount', err.message);
        }
      };
      inp.addEventListener('change', commit);
      lab.append(inp); grams.append(lab);
      const reset = el('button', 'Reset'); reset.type = 'button';
      reset.disabled = !custom;
      reset.setAttribute('aria-label', 'Reset ' + food.name + ' to the default portion');
      reset.onclick = () => {
        state.portions = NP.resetPortion(state.portions, food.id);
        save(); render(); status('Reset ' + food.name + ' to the default portion.');
      };
      grams.append(reset);
      row.append(NPIcons.make(food.icon, 48), meta, grams);
      box.append(row);
    });
  }
  function showView(id) {
    view = id;
    ['plate', 'portions', 'games', 'help'].forEach(name => {
      const sec = $('view-' + name), btn = $('mode-' + name);
      sec.hidden = name !== id;
      btn.setAttribute('aria-pressed', name === id ? 'true' : 'false');
    });
    if (id === 'games') renderGames();
    if (id === 'portions') renderPortions();
    status('');
  }

  function gamePicks() {
    const box = $('game-picks'); box.replaceChildren();
    const items = [
      ['guess', 'Guess the calories', 'A food is shown. Pick the closest energy figure.', state.scores.guess, NPGames.GUESS_N],
      ['fix', 'Fix this plate', 'An unbalanced plate is shown. Add and remove foods until it is balanced.', state.scores.plate, NPGames.CHALLENGES.length],
      ['swaps', 'Healthier swaps', 'Pick the lighter or higher-fibre swap for a common food.', state.scores.swaps, NPGames.SWAP_N]
    ];
    items.forEach(([id, title, blurb, best, of]) => {
      const card = el('button', null, 'game-card'); card.type = 'button'; card.dataset.game = id;
      card.append(el('strong', title), el('p', blurb), el('small', 'Best ' + best + ' / ' + of));
      card.onclick = () => startGame(id);
      box.append(card);
    });
  }
  function startGame(kind) {
    const rng = NPGames.rngFrom(Date.now() % 1e9);
    if (kind === 'guess') game = { kind, i: 0, score: 0, used: [], q: null, locked: false, rng };
    else if (kind === 'swaps') game = { kind, i: 0, score: 0, used: [], q: null, locked: false, rng };
    else {
      const first = NPGames.CHALLENGES[0];
      game = { kind: 'fix', i: 0, score: 0, challenge: NPGames.challenge(first.id), plate: first.start.map(r => ({ ...r })) };
    }
    renderGames();
  }
  function nextGuess() {
    game.q = NPGames.guessQuestion(game.used, game.rng);
    game.used.push(game.q.id); game.locked = false;
  }
  function nextSwap() {
    game.q = NPGames.swapQuestion(game.used, game.rng);
    game.used.push(game.q.id); game.locked = false;
  }
  function recordBest(key, score, of) {
    if (score > state.scores[key]) { state.scores[key] = score; save(); }
    return 'Score ' + score + ' / ' + of + '. Best ' + state.scores[key] + ' / ' + of + '.';
  }
  function foodLine(id, extra) {
    const food = NP.food(id), row = el('div', null, 'served');
    row.append(NPIcons.make(food.icon, 72), el('strong', food.name), el('small', '  ' + food.portion + (extra || '')));
    return row;
  }
  function renderGuess(play) {
    if (!game.q && game.i < NPGames.GUESS_N) nextGuess();
    if (game.i >= NPGames.GUESS_N && !game.q) {
      play.append(el('h3', 'Guess the calories'), el('p', recordBest('guess', game.score, NPGames.GUESS_N)));
      const again = el('button', 'Play again'); again.type = 'button'; again.onclick = () => startGame('guess'); play.append(again);
      return;
    }
    const q = game.q;
    play.append(el('h3', 'Guess the calories · ' + (game.i + 1) + ' / ' + NPGames.GUESS_N));
    play.append(el('p', 'About how many calories are in this portion?'));
    play.append(foodLine(q.id));
    const choices = el('div', null, 'choices');
    q.choices.forEach(n => {
      const btn = el('button', n + ' kcal'); btn.type = 'button'; btn.dataset.kcal = String(n);
      btn.disabled = game.locked;
      btn.onclick = () => {
        if (game.locked) return;
        const grade = NPGames.gradeGuess(q, n); game.locked = true;
        if (grade.correct) { game.score += 1; status('Correct — ' + q.name + ' is ' + grade.answer + ' kcal.'); }
        else status('This portion is ' + grade.answer + ' kcal.');
        choices.querySelectorAll('button').forEach(b => {
          b.disabled = true;
          if (Number(b.dataset.kcal) === grade.answer) b.classList.add('correct');
          if (Number(b.dataset.kcal) === n && !grade.correct) b.classList.add('wrong');
        });
      };
      choices.append(btn);
    });
    play.append(choices);
    const next = el('button', game.i + 1 >= NPGames.GUESS_N ? 'See score' : 'Next'); next.type = 'button'; next.className = 'primary'; next.disabled = !game.locked;
    next.onclick = () => { if (!game.locked) return; game.i += 1; game.q = null; renderGames(); };
    play.append(next);
  }
  function renderSwaps(play) {
    if (!game.q && game.i < NPGames.SWAP_N) nextSwap();
    if (game.i >= NPGames.SWAP_N && !game.q) {
      play.append(el('h3', 'Healthier swaps'), el('p', recordBest('swaps', game.score, NPGames.SWAP_N)));
      const again = el('button', 'Play again'); again.type = 'button'; again.onclick = () => startGame('swaps'); play.append(again);
      return;
    }
    const q = game.q;
    play.append(el('h3', 'Healthier swaps · ' + (game.i + 1) + ' / ' + NPGames.SWAP_N));
    play.append(el('p', 'Which is the healthier swap for this food?'));
    play.append(foodLine(q.from));
    const choices = el('div', null, 'choices');
    q.choices.forEach(id => {
      const food = NP.food(id), btn = el('button', null, 'food-choice'); btn.type = 'button'; btn.dataset.id = id; btn.disabled = game.locked;
      btn.append(NPIcons.make(food.icon, 64), el('strong', food.name));
      btn.onclick = () => {
        if (game.locked) return;
        const grade = NPGames.gradeSwap(q, id); game.locked = true;
        status(grade.correct ? 'Good swap. ' + grade.why : grade.why);
        if (grade.correct) game.score += 1;
        choices.querySelectorAll('button').forEach(b => {
          b.disabled = true;
          if (b.dataset.id === grade.answer) b.classList.add('correct');
          if (b.dataset.id === id && !grade.correct) b.classList.add('wrong');
        });
      };
      choices.append(btn);
    });
    play.append(choices);
    const why = el('p', game.locked ? q.why : '', 'muted'); why.id = 'swap-why'; play.append(why);
    const next = el('button', game.i + 1 >= NPGames.SWAP_N ? 'See score' : 'Next'); next.type = 'button'; next.className = 'primary'; next.disabled = !game.locked;
    next.onclick = () => { if (!game.locked) return; game.i += 1; game.q = null; renderGames(); };
    play.append(next);
  }
  function renderFix(play) {
    if (game.finished) {
      play.append(el('h3', 'Fix this plate'), el('p', recordBest('plate', game.score, NPGames.CHALLENGES.length)));
      const again = el('button', 'Play again'); again.type = 'button'; again.onclick = () => startGame('fix'); play.append(again);
      return;
    }
    const ch = game.challenge, current = game.plate, done = NPGames.isBalanced(current);
    play.append(el('h3', 'Fix this plate · ' + (game.i + 1) + ' / ' + NPGames.CHALLENGES.length));
    play.append(el('p', ch.blurb));
    const list = el('div', null, 'fix-plate');
    if (!current.length) list.append(el('p', 'The plate is empty. Add foods from the list below.', 'empty'));
    current.forEach(row => {
      const food = NP.food(row.id), card = el('div', null, 'served');
      const mid = el('div'); mid.append(el('strong', food.name), el('small', '  ×' + row.qty + '  ' + food.portion));
      const rm = el('button', 'Remove'); rm.type = 'button'; rm.disabled = done;
      rm.onclick = () => { game.plate = NP.setQty(game.plate, row.id, row.qty - 1); renderGames(); };
      card.append(NPIcons.make(food.icon, 64), mid, rm); list.append(card);
    });
    play.append(list);
    const notes = el('div', null, 'tips');
    if (done) notes.append(el('p', 'This plate now matches the balanced-plate guide. Well done.'));
    else NPGames.issues(current).forEach(text => notes.append(el('p', text)));
    play.append(notes);
    if (!done) {
      play.append(el('h3', 'Add or swap in'));
      const bank = el('div', null, 'bank');
      ch.bank.forEach(id => {
        const food = NP.food(id), btn = el('button', null, 'food-choice'); btn.type = 'button';
        btn.append(NPIcons.make(food.icon, 56), el('strong', food.name));
        btn.onclick = () => {
          try { game.plate = NP.add(game.plate, id, 1); renderGames(); }
          catch (err) { status(err.message); }
        };
        bank.append(btn);
      });
      play.append(bank);
    } else {
      game.cleared = game.cleared || {};
      if (!game.cleared[ch.id]) { game.score += 1; game.cleared[ch.id] = true; }
      const next = el('button', game.i + 1 >= NPGames.CHALLENGES.length ? 'See score' : 'Next plate'); next.type = 'button'; next.className = 'primary';
      next.onclick = () => {
        game.i += 1;
        if (game.i >= NPGames.CHALLENGES.length) {
          game.finished = true; status(recordBest('plate', game.score, NPGames.CHALLENGES.length));
        } else {
          const row = NPGames.CHALLENGES[game.i];
          game.challenge = NPGames.challenge(row.id); game.plate = row.start.map(r => ({ ...r }));
        }
        renderGames();
      };
      play.append(next);
    }
  }
  function renderGames() {
    gamePicks();
    const play = $('game-play'); play.replaceChildren();
    if (!game) { play.append(el('p', 'Choose a game to begin.', 'muted')); return; }
    if (game.kind === 'guess') renderGuess(play);
    else if (game.kind === 'swaps') renderSwaps(play);
    else renderFix(play);
  }

  function render() { meals(); renderPlate(); mealTotals(); balance(); progress(); saved(); library(); if (view === 'portions') renderPortions(); }
  const drop = $('plate');
  drop.addEventListener('dragover', ev => { ev.preventDefault(); drop.classList.add('over'); ev.dataTransfer.dropEffect = 'copy'; });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', ev => { ev.preventDefault(); drop.classList.remove('over'); addFood(ev.dataTransfer.getData('text/plain')); });
  $('search').addEventListener('input', library);
  ['age', 'sex', 'activity', 'diet'].forEach(id => $(id).addEventListener('change', () => {
    state.person = NPDay.cleanPerson({ age: $('age').value, sex: $('sex').value, activity: $('activity').value, diet: $('diet').value });
    save(); render();
  }));
  compactMql.addEventListener('change', library);
  ['plate', 'portions', 'games', 'help'].forEach(name => { $('mode-' + name).onclick = () => showView(name); });
  $('portion-search').addEventListener('input', renderPortions);
  $('reset-all-portions').onclick = () => {
    askConfirm('Reset all portions?',
      'Every food will go back to its default household size. Meals you have already saved are not changed.',
      'Reset all',
      () => { state.portions = NP.resetAllPortions(); save(); render(); status('All portions reset to the defaults.'); });
  };
  $('confirm-ok').onclick = () => {
    const fn = confirmAction; confirmAction = null;
    $('confirm-dialog').close();
    if (fn) fn();
  };
  $('confirm-dialog').addEventListener('close', () => { confirmAction = null; });
  function openSave(kind, title, suggestion) {
    saveKind = kind; $('name-title').textContent = title; $('save-name').value = suggestion; $('name-dialog').showModal(); $('save-name').focus();
  }
  $('save-plate').onclick = () => openSave('plate', 'Save this plate', NPDay.MEALS.find(m => m[0] === state.meal)[1]);
  $('save-day').onclick = () => openSave('day', 'Save this day', 'My day');
  $('name-form').onsubmit = ev => {
    ev.preventDefault();
    try {
      state = saveKind === 'day' ? NPDay.saveDay(state, $('save-name').value) : NPDay.savePlate(state, $('save-name').value);
      save(); $('name-dialog').close(); render(); status(saveKind === 'day' ? 'Day saved on this device.' : 'Plate saved on this device.');
    } catch (err) { status(err.message); }
  };
  $('settings').onclick = () => { $('theme').value = HubTheme.own(); $('settings-dialog').showModal(); };
  $('theme').onchange = () => { if (!HubTheme.setOwn($('theme').value)) status('Theme could not be saved.'); };
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
  $('back').onclick = () => { location.href = '../learn.html'; };
  LearnHubBar.attach(document.querySelector('.lrn-head'), { buttons: '.lrn-qc', tabs: '.lrn-mode' });
  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('offline.js').then(reg => new Promise((resolve, reject) => {
      const worker = reg.installing || reg.waiting || reg.active;
      if (!worker) return reject(new Error('No offline worker'));
      const ready = () => { if (worker.state === 'activated') resolve(); else if (worker.state === 'redundant') reject(new Error('Offline install failed')); };
      worker.addEventListener('statechange', ready); ready();
    }))
      .then(() => { $('offline').textContent = 'Available offline on this device'; })
      .catch(() => { $('offline').textContent = 'Offline cache unavailable — keep this page open'; });
  } else $('offline').textContent = 'Local file mode';
})();
