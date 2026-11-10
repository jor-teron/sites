/* NP-1b: plate builder, day planner, targets and local saves. User text uses textContent. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const fmt = (n) => { const d = Number.isInteger(n) ? 1 : 10; return (Math.round(n * d) / d).toString(); };
  let state = NPDay.fresh(), saveKind = 'plate', message = '';
  try { const text = localStorage.getItem(NPDay.KEY); if (text) state = NPDay.restore(text); }
  catch (_) { message = 'Saved data could not be read. A new day was started.'; }
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
  fillSelect('activity', NPTargets.activities, state.person.activity);
  fillSelect('diet', NPTargets.diets, state.person.diet);
  NP.foods.groups.forEach(([id, name]) => { const o = el('option', name); o.value = id; $('group').append(o); });
  function library() {
    const foods = NP.filterFoods($('search').value, $('group').value, state.person.diet);
    const box = $('library'); box.replaceChildren();
    $('lib-count').textContent = foods.length + ' food' + (foods.length === 1 ? '' : 's');
    foods.forEach(food => {
      const btn = el('button', null, 'food'); btn.type = 'button'; btn.draggable = true; btn.dataset.id = food.id;
      btn.append(NPIcons.make(food.icon, 80), el('strong', food.name), el('small', food.portion + ' · ' + food.kcal + ' kcal'));
      btn.addEventListener('click', () => addFood(food.id));
      btn.addEventListener('dragstart', ev => { ev.dataTransfer.setData('text/plain', food.id); ev.dataTransfer.effectAllowed = 'copy'; });
      box.append(btn);
    });
  }
  function addFood(id) {
    try { state.meals[state.meal] = NP.add(plate(), id); status('Added ' + NP.food(id).name + '.'); save(); render(); }
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
      less.onclick = () => { state.meals[state.meal] = NP.setQty(plate(), row.id, row.qty - 1); save(); render(); };
      const more = el('button', '+'); more.type = 'button'; more.setAttribute('aria-label', 'More ' + food.name);
      more.onclick = () => { try { state.meals[state.meal] = NP.setQty(plate(), row.id, row.qty + 1); save(); render(); } catch (err) { status(err.message); } };
      qty.append(less, el('span', String(row.qty)), more);
      card.append(NPIcons.make(food.icon, 72), mid, qty); box.append(card);
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
    const t = NPDay.dayTotals(state.meals), g = NPTargets.targets(state.person.age, state.person.activity);
    const box = $('progress'); box.replaceChildren();
    box.append(el('h2', 'Today against a rough daily target'));
    $('target-note').textContent = 'Rough target: about ' + g.kcal + ' kcal, ' + g.prot + ' g protein, under ' + g.sugar + ' g sugar. Approximate ICMR-NIN style mid-point; needs vary by sex and body size.';
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
      fillSelect('activity', NPTargets.activities, state.person.activity); fillSelect('diet', NPTargets.diets, state.person.diet);
      save(); render(); status('Day loaded.'); },
      id => { state = NPDay.deleteDay(state, id); save(); render(); status('Saved day deleted.'); }, 'No saved days yet.');
  }
  function render() { meals(); renderPlate(); mealTotals(); balance(); progress(); saved(); library(); status(message); }
  const drop = $('plate');
  drop.addEventListener('dragover', ev => { ev.preventDefault(); drop.classList.add('over'); ev.dataTransfer.dropEffect = 'copy'; });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', ev => { ev.preventDefault(); drop.classList.remove('over'); addFood(ev.dataTransfer.getData('text/plain')); });
  $('search').addEventListener('input', library);
  $('group').addEventListener('change', library);
  ['age', 'activity', 'diet'].forEach(id => $(id).addEventListener('change', () => {
    state.person = NPDay.cleanPerson({ age: $('age').value, activity: $('activity').value, diet: $('diet').value });
    save(); render();
  }));
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
