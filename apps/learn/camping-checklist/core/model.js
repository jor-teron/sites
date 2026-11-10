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
    return { id: item.id, name: item.name.trim(), category: item.category, grams: item.grams,
      qty: item.qty, must: item.must, packed: item.packed, custom: item.custom };
  }
  function validateList(list) {
    if (!list || typeof list.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(list.id) ||
      typeof list.name !== 'string' || !list.name.trim() || list.name.length > 80 ||
      !Array.isArray(list.items) || list.items.length > 300) throw new Error('Invalid list (maximum 300 items).');
    const items = list.items.map(validateItem);
    if (new Set(items.map(i => i.id)).size !== items.length) throw new Error('Duplicate item IDs.');
    return { id: list.id, name: list.name.trim(), template: list.template === true, items };
  }
  function fresh() { return { version: 1, selected: 'day', lists: copy(D.templates) }; }
  function restore(text) {
    const parsed = JSON.parse(text);
    if (parsed.version !== 1 || !Array.isArray(parsed.lists) || parsed.lists.length > 37) throw new Error('Invalid saved lists.');
    const lists = parsed.lists.map(validateList);
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
    return { ...copy(list), id: uid(), name: (list.name + ' — my list').slice(0, 80), template: false,
      items: list.items.map(i => ({ ...i, packed: false })) };
  }
  return { copy, uid, fresh, restore, validateItem, validateList, totals, duplicate };
});
