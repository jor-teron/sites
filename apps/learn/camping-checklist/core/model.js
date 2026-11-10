/* Pure list operations, shared by the browser and Node tests. */
(function (root, factory) {
  const data = typeof module === 'object' && module.exports ? require('./data.js') : root.CCData;
  const model = factory(data);
  if (typeof module === 'object' && module.exports) module.exports = model;
  else root.CC = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const uid = () => 'my-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  function validateItem(item) {
    if (!item || typeof item.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(item.id) ||
      typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120 ||
      !D.categories.includes(item.category) || !Number.isFinite(item.grams) || item.grams < 0 || item.grams > 100000 ||
      !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 10000 ||
      typeof item.must !== 'boolean' || typeof item.packed !== 'boolean' || typeof item.custom !== 'boolean') {
      throw new Error('Invalid item: use a name, category, 0–100000 g and quantity 1–10000.');
    }
    if ((item.tip != null && (typeof item.tip !== 'string' || item.tip.length > 300)) ||
      (item.care != null && (typeof item.care !== 'string' || item.care.length > 300))) throw new Error('Item notes must be at most 300 characters.');
    return { ...(item.tip ? { tip: item.tip } : {}), ...(item.care ? { care: item.care } : {}), id: item.id, name: item.name.trim(), category: item.category, grams: item.grams,
      qty: item.qty, must: item.must, packed: item.packed, custom: item.custom };
  }
  function validateList(list) {
    if (!list || typeof list.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(list.id) ||
      typeof list.name !== 'string' || !list.name.trim() || list.name.length > 80 ||
      !Array.isArray(list.items) || list.items.length > 300) throw new Error('Invalid list (maximum 300 items).');
    const items = list.items.map(validateItem);
    if (new Set(items.map(i => i.id)).size !== items.length) throw new Error('Duplicate item IDs.');
    if (list.before != null && (!Array.isArray(list.before) || list.before.length !== 7 || list.before.some(v => typeof v !== 'boolean'))) throw new Error('Invalid departure checks.');
    return { id: list.id, name: list.name.trim(), template: list.template === true, items,
      ...(list.plan ? { plan: validatePlan(list.plan) } : {}), ...(list.before ? { before: [...list.before] } : {}) };
  }
  function fresh() { return { version: 1, selected: 'day', lists: copy(D.templates) }; }
  function restore(text) {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.lists) || parsed.lists.length > 37) throw new Error('Invalid saved lists.');
    const lists = parsed.lists.map(validateList);
    if (lists.filter(l => !D.templates.some(t => t.id === l.id)).length > 30) throw new Error('Too many saved lists.');
    lists.forEach(l => { l.template = D.templates.some(t => t.id === l.id); });
    if (new Set(lists.map(l => l.id)).size !== lists.length) throw new Error('Duplicate list IDs.');
    D.templates.forEach(t => { if (!lists.some(l => l.id === t.id)) lists.unshift(copy(t)); });
    return { version: 1, lists, selected: lists.some(l => l.id === parsed.selected) ? parsed.selected : 'day' };
  }
  function totals(items) {
    const result = { grams: 0, packed: 0, count: 0, essential: 0, missing: 0, categories: {} };
    D.categories.forEach(c => { result.categories[c] = { grams: 0, packed: 0 }; });
    items.forEach(i => {
      const weight = i.grams * i.qty;
      result.grams += weight;
      result.categories[i.category].grams += weight;
      if (i.packed) { result.packed += weight; result.categories[i.category].packed += weight; result.count++; }
      if (i.must) { result.essential++; if (!i.packed) result.missing++; }
    });
    return result;
  }
  function duplicate(list) {
    return { ...copy(list), before: Array(7).fill(false), id: uid(), name: (list.name + ' — my list').slice(0, 80), template: false,
      items: list.items.map(i => ({ ...i, packed: false })) };
  }
  const weather = ['hot', 'mild', 'cold', 'rain', 'snow'];
  const activities = ['cooking', 'swimming', 'trekking', 'cycling', 'fishing', 'photography'];
  function validatePlan(p) {
    if (!p || !Number.isInteger(p.days) || p.days < 1 || p.days > 30 ||
      !Number.isInteger(p.people) || p.people < 1 || p.people > 20 || !weather.includes(p.weather) ||
      !Array.isArray(p.activities) || p.activities.length > 6 || p.activities.some(a => !activities.includes(a))) {
      throw new Error('Choose 1–30 days, 1–20 people, weather and valid activities.');
    }
    return { days: p.days, people: p.people, weather: p.weather, activities: [...new Set(p.activities)] };
  }
  function guidance(input) {
    const p = validatePlan(input), liters = p.weather === 'hot' ? 4 : 3;
    return { liters, totalWater: liters * p.days * p.people,
      kcalLow: 2500 * p.days * p.people, kcalHigh: 3500 * p.days * p.people };
  }
  function planner(input) {
    const plan = validatePlan(input), g = guidance(plan), { days, people } = plan;
    const source = D.templates.find(t => t.id === (days > 1 ? 'overnight' : 'day'));
    const keys = new Set(source.items.map(i => i.id));
    const add = ids => ids.split(' ').forEach(id => keys.add(id));
    if (plan.weather === 'hot') add('ors');
    if (plan.weather === 'rain') add('gaiters rainpants net');
    if (plan.weather === 'cold' || plan.weather === 'snow') add('insulation thermal gloves');
    if (plan.weather === 'snow') add('snow poles');
    if (plan.activities.includes('cooking')) add('stove fuel pot bowl matches');
    else ['stove', 'fuel', 'pot', 'bowl', 'matches'].forEach(id => keys.delete(id));
    if (plan.activities.includes('swimming')) add('swim pfd towel');
    if (plan.activities.includes('trekking')) add('poles');
    if (plan.activities.includes('cycling')) add('helmet cycle');
    if (plan.activities.includes('fishing')) add('fishing');
    if (plan.activities.includes('photography')) add('camera');
    const group = new Set(['pot', 'stove', 'repair', 'compass', 'map']);
    const items = [...keys].map(id => {
      const item = copy(D.items.find(i => i.id === id));
      item.qty = group.has(id) ? 1 : item.qty * people;
      if (id === 'tent' || id === 'ground') item.qty = Math.ceil(people / 2);
      if (plan.activities.includes('cooking') && ['stove', 'fuel', 'pot', 'bowl', 'matches'].includes(id)) item.must = true;
      if (id === 'fuel') item.qty = Math.ceil(days * people / 4); // placeholder: user must check stove consumption
      if (id === 'food') item.qty = days * people;
      if (id === 'bottle') item.qty = g.liters * people;
      if (id === 'water') item.qty = g.totalWater;
      if (id === 'socks' || id === 'underwear') item.qty = Math.min(days, 3) * people;
      if (id === 'bag' && ['cold', 'snow'].includes(plan.weather)) item.grams = 1700;
      if (id === 'food' && !plan.activities.includes('cooking')) item.name = 'No-cook food ration (one person-day)';
      return item;
    });
    return { id: uid(), name: days + '-day ' + plan.weather + ' trip · ' + people + ' people',
      template: false, plan, before: Array(7).fill(false), items };
  }
  function exportJSON(list) {
    return JSON.stringify({ format: 'camping-checklist', version: 1, list: validateList(list) }, null, 2);
  }
  function importJSON(text) {
    if (typeof text !== 'string' || text.length > 1000000) throw new Error('Import must be a JSON list under 1 MB.');
    const data = JSON.parse(text);
    if (!data || data.format !== 'camping-checklist' || data.version !== 1) throw new Error('Choose a Camping Checklist JSON export.');
    const list = validateList(data.list);
    list.id = uid(); list.template = false; // Always add a copy, never overwrite any existing list.
    return list;
  }
  function exportText(list, learning) {
    const lines = [list.name, 'Camping Checklist — weights are estimates; adapt to your route.', ''];
    if (list.plan) {
      const g = guidance(list.plan);
      lines.push(list.plan.days + ' days / ' + list.plan.people + ' people / ' + list.plan.weather,
        'Planned water: ' + g.totalWater + ' L for the full trip. Check safe refills; this is not a carry target.',
        'Trekking food guide: 2500–3500 kcal/person/day; group total ' + g.kcalLow + '–' + g.kcalHigh + ' kcal.', '');
    }
    D.categories.forEach(c => {
      const items = list.items.filter(i => i.category === c); if (!items.length) return;
      lines.push(c);
      items.forEach(i => {
        lines.push('[' + (i.packed ? 'x' : ' ') + '] ' + i.name + ' × ' + i.qty + ' @ ' + i.grams + ' g' + (i.must ? ' (must-have)' : ' (optional)'));
        if (learning) { const tip = learning.tips[i.id] || learning.fallback; lines.push('  Why: ' + (i.tip || tip[0]), '  Care: ' + (i.care || tip[1])); }
      });
      lines.push('');
    });
    const t = totals(list.items);
    lines.push('Total: ' + (t.grams / 1000).toFixed(2) + ' kg; packed: ' + (t.packed / 1000).toFixed(2) + ' kg (including worn items).');
    if (learning) {
      lines.push('', 'Before you leave');
      learning.before.forEach((text, n) => lines.push('[' + (list.before && list.before[n] ? 'x' : ' ') + '] ' + text));
      lines.push('', 'Leave No Trace — a plain-language summary');
      learning.lnt.forEach(([title, text], n) => lines.push((n + 1) + '. ' + title + ': ' + text));
    }
    lines.push('', 'India emergency: 112. Mobile coverage and rescue response are not guaranteed.');
    return lines.join('\n');
  }
  return { copy, uid, fresh, restore, validateItem, validateList, totals, duplicate,
    validatePlan, guidance, planner, exportJSON, importJSON, exportText, weather, activities };
});
