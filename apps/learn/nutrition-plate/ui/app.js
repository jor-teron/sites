/* NP-1a: plate builder UI. User text uses textContent, never HTML. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
  const fmt = (n, d) => (Math.round(n * (d = Math.pow(10, d || (Number.isInteger(n) ? 0 : 1)))) / d).toString();
  let plate = [], message = '';
  function status(text) { message = text || ''; $('status').textContent = message; }
  const groupSel = $('group');
  NP.foods.groups.forEach(([id, name]) => { const o = el('option', name); o.value = id; groupSel.append(o); });
  function filtered() { return NP.filterFoods($('search').value, $('group').value, $('diet').value); }
  function library() {
    const foods = filtered(), box = $('library'); box.replaceChildren();
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
    try { plate = NP.add(plate, id); status('Added ' + NP.food(id).name + '.'); renderPlate(); }
    catch (err) { status(err.message); }
  }
  function renderPlate() {
    const box = $('plate'); box.replaceChildren();
    if (!plate.length) { box.append(el('p', 'Your plate is empty. Tap a food to add it.', 'empty')); }
    plate.forEach(row => {
      const food = NP.food(row.id), card = el('div', null, 'served');
      const mid = el('div'); mid.append(el('strong', food.name), el('small', '  ' + food.portion));
      const qty = el('div', null, 'qty');
      const less = el('button', '−'); less.type = 'button'; less.setAttribute('aria-label', 'Fewer ' + food.name);
      less.onclick = () => { plate = NP.setQty(plate, row.id, row.qty - 1); renderPlate(); };
      const more = el('button', '+'); more.type = 'button'; more.setAttribute('aria-label', 'More ' + food.name);
      more.onclick = () => { try { plate = NP.setQty(plate, row.id, row.qty + 1); renderPlate(); } catch (err) { status(err.message); } };
      qty.append(less, el('span', String(row.qty)), more);
      card.append(NPIcons.make(food.icon, 72), mid, qty); box.append(card);
    });
    totals(); balance();
  }
  function totals() {
    const t = NP.totals(plate), box = $('totals'); box.replaceChildren();
    const stats = el('div', null, 'stats');
    [['kcal', t.kcal + ' kcal', 'Energy'], ['prot', fmt(t.prot) + ' g', 'Protein'],
      ['carb', fmt(t.carb) + ' g', 'Carbs'], ['fat', fmt(t.fat) + ' g', 'Fat'],
      ['fibre', fmt(t.fibre) + ' g', 'Fibre'], ['items', t.portions + ' portion' + (t.portions === 1 ? '' : 's'), t.items + ' food' + (t.items === 1 ? '' : 's')]
    ].forEach(([, value, label]) => { const s = el('div', null, 'stat'); s.append(el('strong', value), el('small', label)); stats.append(s); });
    const more = el('p', null, 'more-nut');
    more.append('Sugar ' + fmt(t.sugar) + ' g · Iron ' + fmt(t.fe) + ' mg · Calcium ' + fmt(t.ca) + ' mg · Vitamin C ' + fmt(t.vc) + ' mg  (approximate)');
    box.append(stats, more);
  }
  function pct(n) { return Math.round(n * 100); }
  function balance() {
    const b = NP.balance(plate), box = $('balance'); box.replaceChildren();
    const pie = el('div', null, 'pie');
    const g = pct(b.shares.grains), p = pct(b.shares.protein), v = Math.max(0, 100 - g - p);
    pie.style.background = b.core
      ? 'conic-gradient(var(--grain) 0 ' + g + '%, var(--protein) ' + g + '% ' + (g + p) + '%, var(--veg) ' + (g + p) + '% 100%)'
      : 'conic-gradient(var(--soft) 0 100%)';
    pie.setAttribute('aria-hidden', 'true');
    const legend = el('div', null, 'legend');
    legend.append(el('h2', 'Balanced-plate guide'));
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
  const drop = $('plate');
  drop.addEventListener('dragover', ev => { ev.preventDefault(); drop.classList.add('over'); ev.dataTransfer.dropEffect = 'copy'; });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', ev => { ev.preventDefault(); drop.classList.remove('over'); addFood(ev.dataTransfer.getData('text/plain')); });
  ['search', 'group', 'diet'].forEach(id => $(id).addEventListener('input', library));
  $('group').addEventListener('change', library); $('diet').addEventListener('change', library);
  $('settings').onclick = () => { $('theme').value = HubTheme.own(); $('settings-dialog').showModal(); };
  $('theme').onchange = () => { if (!HubTheme.setOwn($('theme').value)) status('Theme could not be saved.'); };
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
  $('back').onclick = () => { location.href = '../learn.html'; };
  LearnHubBar.attach(document.querySelector('.lrn-head'), { buttons: '.lrn-qc' });
  library(); renderPlate();
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
