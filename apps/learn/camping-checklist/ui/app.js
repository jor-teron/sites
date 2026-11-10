/* CC-1a: local-only checklist UI. Render user content with textContent, never HTML. */
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
    $('rename').disabled = current().template;
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
    box.append(el('h2', list.name), stats, progress, el('p', t.missing + ' must-have items still unpacked.', 'muted'), breakdown);
  }
  function render() {
    selectLists(); summary(); const groups = $('groups'); groups.replaceChildren();
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
        section.append(row);
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
    $('editor').showModal(); $('item-name').focus();
  }
  CCData.categories.forEach(c => { const o = el('option', c); o.value = c; $('item-category').append(o); });
  $('item-form').onsubmit = event => {
    event.preventDefault();
    try {
      if (!editing && current().items.length >= 300) throw new Error('Maximum 300 items per list.');
      const item = CC.validateItem({ id: editing ? editing.id : CC.uid(), name: $('item-name').value,
        category: $('item-category').value, grams: Number($('item-grams').value), qty: Number($('item-qty').value),
        must: $('item-must').checked, packed: editing ? editing.packed : false, custom: editing ? editing.custom : true });
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
  $('reset').onclick = () => { if (confirm('Clear every packed tick in this list?')) { current().items.forEach(i => { i.packed = false; }); save(); render(); } };
  $('add').onclick = () => openEditor(null);
  $('settings').onclick = () => { $('theme').value = HubTheme.own(); $('settings-dialog').showModal(); };
  $('theme').onchange = () => { if (!HubTheme.setOwn($('theme').value)) status('Theme could not be saved.'); };
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
  $('back').onclick = () => { location.href = '../learn.html'; };
  LearnHubBar.attach(document.querySelector('.lrn-head'), { buttons: '.lrn-qc' });
  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('offline.js').then(() => navigator.serviceWorker.ready)
      .then(() => { $('offline').textContent = 'Available offline on this device'; })
      .catch(() => { $('offline').textContent = 'Offline cache unavailable — keep this page open'; });
  } else $('offline').textContent = 'Local file mode';
})();
