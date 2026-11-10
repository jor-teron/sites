/* CC-1b: local-only checklist UI. Render user content with textContent, never HTML. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id), KEY = 'learn.camping-checklist.v1';
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const kg = g => (g / 1000).toFixed(2) + ' kg';
  let state = CC.fresh(), editing = null;
  try { const text = localStorage.getItem(KEY); if (text) state = CC.restore(text); }
  catch (_) { $('status').textContent = 'Saved data could not be read. Defaults loaded; export important lists regularly.'; }
  const current = () => state.lists.find(l => l.id === state.selected);
  function status(text) { $('status').textContent = text; }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (_) { status('Storage is unavailable or full. Changes only last this session.'); }
  }
  function selectLists() {
    $('lists').replaceChildren();
    [true, false].forEach(template => {
      const group = el('optgroup'); group.label = template ? 'Templates' : 'My lists';
      state.lists.filter(l => l.template === template).forEach(l => {
        const option = el('option', l.name); option.value = l.id; group.append(option);
      });
      $('lists').append(group);
    });
    $('lists').value = state.selected;
    $('rename').disabled = current().template; $('delete-list').disabled = current().template;
  }
  function summary() {
    const list = current(), t = CC.totals(list.items), box = $('summary'); box.replaceChildren();
    const stats = el('div', null, 'stats');
    [[t.count + ' / ' + list.items.length, 'Items packed'], [kg(t.grams), 'Total including worn gear'], [kg(t.packed), 'Packed weight']].forEach(([value, label]) => {
      const stat = el('div', null, 'stat'); stat.append(el('strong', value), el('small', label)); stats.append(stat);
    });
    const progress = el('progress'); progress.max = list.items.length || 1; progress.value = t.count; progress.setAttribute('aria-label', 'Items packed');
    const breakdown = el('details'), title = el('summary', 'Weight by category (packed / total)');
    const rows = el('div', null, 'breakdown');
    Object.entries(t.categories).forEach(([category, v]) => { if (v.grams) rows.append(el('span', category + ': ' + kg(v.packed) + ' / ' + kg(v.grams))); });
    breakdown.append(title, rows);
    if (list.plan) box.append(planNote(list.plan));
    box.append(el('h2', list.name), stats, progress, el('p', t.missing + ' must-have items still unpacked.', 'muted'), breakdown);
  }
  function render() {
    selectLists(); summary(); departure(); const groups = $('groups'); groups.replaceChildren();
    CCData.categories.forEach(category => {
      const items = current().items.filter(i => i.category === category); if (!items.length) return;
      const section = el('section', null, 'category');
      const heading = el('h3', category); heading.append(el('span', kg(CC.totals(items).grams))); section.append(heading);
      items.forEach(item => {
        const row = el('div', null, 'item' + (item.packed ? ' packed' : ''));
        const label = el('label'), input = el('input'); input.type = 'checkbox'; input.checked = item.packed;
        input.dataset.item = item.id;
        input.addEventListener('change', () => { item.packed = input.checked; row.classList.toggle('packed', item.packed); save(); summary(); });
        const info = el('span', null, 'info'), name = el('span', item.name, 'name');
        info.append(name);
        if (item.must) info.append(el('span', 'MUST', 'badge'));
        info.append(el('small', item.qty + ' × ' + item.grams + ' g = ' + kg(item.qty * item.grams)));
        label.append(input, info); row.append(label);
        if (!current().template || item.custom) {
          const edit = el('button', 'Edit'); edit.setAttribute('aria-label', 'Edit ' + item.name); edit.onclick = () => openEditor(item);
          const del = el('button', 'Delete'); del.setAttribute('aria-label', 'Delete ' + item.name);
          del.onclick = () => { if (confirm('Delete ' + item.name + '?')) { current().items = current().items.filter(i => i.id !== item.id); save(); render(); } };
          row.append(edit, del);
        }
        const tip = CCLearn.tips[item.id] || CCLearn.fallback;
        const details = el('details', null, 'item-tip'); details.append(el('summary', 'Why & care: ' + item.name),
          el('p', 'Why you need it: ' + (item.tip || tip[0])), el('p', 'Care / packing: ' + (item.care || tip[1])));
        section.append(row, details);
      });
      groups.append(section);
    });
  }
  function openEditor(item) {
    editing = item || null;
    $('edit-title').textContent = item ? 'Edit item' : 'Add custom item';
    $('item-name').value = item ? item.name : '';
    $('item-category').value = item ? item.category : 'Tools';
    $('item-grams').value = item ? item.grams : 100;
    $('item-qty').value = item ? item.qty : 1;
    $('item-must').checked = item ? item.must : true;
    $('item-tip').value = item ? item.tip || '' : ''; $('item-care').value = item ? item.care || '' : '';
    $('editor').showModal(); $('item-name').focus();
  }
  CCData.categories.forEach(c => { const o = el('option', c); o.value = c; $('item-category').append(o); });
  $('item-form').onsubmit = event => {
    event.preventDefault();
    try {
      if (!editing && current().items.length >= 300) throw new Error('Maximum 300 items per list.');
      const item = CC.validateItem({ id: editing ? editing.id : CC.uid(), name: $('item-name').value,
        category: $('item-category').value, grams: Number($('item-grams').value), qty: Number($('item-qty').value),
        tip: $('item-tip').value.trim(), care: $('item-care').value.trim(), must: $('item-must').checked, packed: editing ? editing.packed : false, custom: editing ? editing.custom : true });
      if (editing) Object.assign(editing, item); else current().items.push(item);
      save(); render(); $('editor').close(); status('Item saved.');
    } catch (error) { status(error.message); }
  };
  $('lists').onchange = () => { state.selected = $('lists').value; save(); render(); };
  $('duplicate').onclick = () => {
    if (state.lists.filter(l => !l.template).length >= 30) return status('Maximum 30 saved lists. Export or reuse a list.');
    const list = CC.duplicate(current()); state.lists.push(list); state.selected = list.id; save(); render(); status('Copied to My lists. Edit weights and quantities to match your actual gear.');
  };
  $('rename').onclick = () => {
    const name = prompt('List name (up to 80 characters)', current().name);
    if (name && name.trim()) { current().name = name.trim().slice(0, 80); save(); render(); }
  };
  $('reset').onclick = () => { if (confirm('Clear packed and departure checks in this list?')) { current().items.forEach(i => { i.packed = false; }); current().before = Array(7).fill(false); save(); render(); } };
  $('add').onclick = () => openEditor(null);
  $('settings').onclick = () => { $('theme').value = HubTheme.own(); $('settings-dialog').showModal(); };
  $('theme').onchange = () => { if (!HubTheme.setOwn($('theme').value)) status('Theme could not be saved.'); };
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
  $('back').onclick = () => { location.href = '../learn.html'; };
  LearnHubBar.attach(document.querySelector('.lrn-head'), { buttons: '.lrn-qc' });
  function planNote(plan) {
    const g = CC.guidance(plan), note = el('div', null, 'notice');
    note.append(el('strong', plan.days + ' days · ' + plan.people + ' people · ' + plan.weather),
      el('p', 'Food: trekking guide 2,500–3,500 kcal per person per day (' + g.kcalLow.toLocaleString() + '–' + g.kcalHigh.toLocaleString() + ' kcal for this group/trip). Verify food labels; needs vary. The 800 g ration is only an estimate.'),
      el('p', 'Water: about ' + g.liters + ' L per person per day; ' + g.totalWater + ' L for the full trip. This full-trip volume is included in the list weight, NOT a recommendation to carry it all. Edit quantities for verified safe refills plus a reserve; add cooking water. Heat and exertion may need more.'),
      el('p', 'Always carry a treatment method. Fuel quantities are placeholders, not stove-consumption calculations. Check weather-rated shelter, sleep insulation, local permits and specialist needs yourself.'));
    return note;
  }
  function departure() {
    const list = current(); $('before').replaceChildren();
    if (!list.before) list.before = Array(7).fill(false);
    CCLearn.before.forEach((text, n) => {
      const label = el('label', null, 'check'), input = el('input'); input.type = 'checkbox'; input.checked = list.before[n];
      input.onchange = () => { list.before[n] = input.checked; save(); }; label.append(input, text); $('before').append(label);
    });
  }
  CCLearn.lnt.forEach(([title, text]) => { const li = el('li'); li.append(el('strong', title + '. '), text); $('lnt').append(li); });
  CC.activities.forEach(activity => {
    const label = el('label', null, 'check'), input = el('input'); input.type = 'checkbox'; input.value = activity;
    input.checked = ['trekking', 'cooking'].includes(activity); label.append(input, activity); $('activities').append(label);
  });
  $('planner-form').onsubmit = event => {
    event.preventDefault();
    try {
      if (state.lists.filter(l => !l.template).length >= 30) throw new Error('Maximum 30 My lists. Delete or reuse one first.');
      const list = CC.planner({ days: Number($('days').value), people: Number($('people').value), weather: $('weather').value,
        activities: [...$('activities').querySelectorAll('input:checked')].map(i => i.value) });
      state.lists.push(list); state.selected = list.id; save(); render(); $('planner-panel').open = false;
      status('Trip list generated. Check and adapt every quantity before leaving.'); $('summary').scrollIntoView({ block: 'start' });
    } catch (error) { status(error.message); }
  };
  $('delete-list').onclick = () => {
    if (!current().template && confirm('Delete this saved list? Export it first if you need a backup.')) {
      state.lists = state.lists.filter(l => l.id !== state.selected); state.selected = 'day'; save(); render();
    }
  };
  function download(text, type, suffix) {
    const url = URL.createObjectURL(new Blob([text], { type })), a = el('a');
    a.href = url; a.download = 'camping-checklist.' + suffix; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  function transfer(importing) {
    $('transfer-title').textContent = importing ? 'Import JSON' : 'Export / copy';
    $('export-actions').hidden = importing; $('import-actions').hidden = !importing;
    $('transfer-text').value = importing ? '' : CC.exportText(current(), CCLearn);
    $('transfer-text').readOnly = !importing; $('transfer-status').textContent = '';
    $('import-file').value = ''; $('transfer-dialog').showModal();
  }
  $('export').onclick = () => transfer(false); $('import').onclick = () => transfer(true);
  $('copy-text').onclick = async () => {
    try { await navigator.clipboard.writeText($('transfer-text').value); $('transfer-status').textContent = 'Copied. Nothing was sent.'; }
    catch (_) { $('transfer-text').focus(); $('transfer-text').select(); $('transfer-status').textContent = 'Copy manually with your device controls.'; }
  };
  $('save-text').onclick = () => download(CC.exportText(current(), CCLearn), 'text/plain', 'txt');
  $('save-json').onclick = () => download(CC.exportJSON(current()), 'application/json', 'json');
  $('import-file').onchange = async () => {
    const file = $('import-file').files[0]; if (!file) return;
    if (file.size > 1000000) { $('transfer-status').textContent = 'File must be under 1 MB.'; return; }
    try { $('transfer-text').value = await file.text(); } catch (_) { $('transfer-status').textContent = 'File could not be read.'; }
  };
  $('do-import').onclick = () => {
    try {
      if (state.lists.filter(l => !l.template).length >= 30) throw new Error('Maximum 30 My lists.');
      const list = CC.importJSON($('transfer-text').value); state.lists.push(list); state.selected = list.id;
      save(); render(); $('transfer-dialog').close(); status('Imported as a new list. Review gear and safety notes yourself.');
    } catch (error) { $('transfer-status').textContent = 'Import failed: ' + error.message; }
  };
  function printSheet() {
    const list = current(), t = CC.totals(list.items), sheet = $('print-sheet'); sheet.replaceChildren();
    sheet.append(el('h1', list.name), el('p', 'Camping Checklist · Total ' + kg(t.grams) + ' · Packed ' + kg(t.packed) + ' · includes worn gear and consumables'));
    if (list.plan) sheet.append(planNote(list.plan));
    const columns = el('div', null, 'print-columns');
    CCData.categories.forEach(c => {
      const items = list.items.filter(i => i.category === c); if (!items.length) return;
      columns.append(el('h2', c));
      items.forEach(i => {
        const row = el('div', null, 'print-item');
        row.append(el('p', '[' + (i.packed ? 'x' : ' ') + '] ' + i.name + (i.must ? ' *' : '') + ' × ' + i.qty + ' — ' + i.grams + ' g each; ' + kg(i.grams * i.qty)));
        if ($('print-tips').checked) { const tip = CCLearn.tips[i.id] || CCLearn.fallback; row.append(el('small', 'Why: ' + (i.tip || tip[0]) + ' Care: ' + (i.care || tip[1]))); }
        columns.append(row);
      });
    });
    const departure = el('section', null, 'print-departure'); departure.append(el('h2', 'Before you leave'));
    sheet.append(columns, departure);
    CCLearn.before.forEach((text, n) => departure.append(el('p', '[' + (list.before[n] ? 'x' : ' ') + '] ' + text)));
    sheet.append(el('h2', 'Leave No Trace — plain-language summary'));
    CCLearn.lnt.forEach(([title, text], n) => sheet.append(el('p', (n + 1) + '. ' + title + ': ' + text)));
    sheet.append(el('p', '* Must-have starting point, not a safety guarantee. Check forecasts, permits and local guidance. India emergency 112; mobile coverage is not guaranteed.'));
  }
  $('print').onclick = () => { printSheet(); window.print(); };
  window.addEventListener('beforeprint', printSheet);
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
