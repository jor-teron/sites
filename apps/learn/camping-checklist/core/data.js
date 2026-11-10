/* CC-1a: indicative dry/unit weights, not manufacturer specifications. No remote data. */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.CCData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const categories = ['Shelter', 'Sleep', 'Cooking', 'Water', 'Clothing', 'First Aid',
    'Navigation', 'Tools', 'Personal/Hygiene', 'Documents/Money'];
  // id | name | category index | grams per unit | essential | quantity
  const rows = [
    ['pack', 'Backpack', 7, 1000, true, 1],
    ['tent', 'Two-person tent with pegs', 0, 2400, true, 1],
    ['ground', 'Tent footprint', 0, 200, false, 1],
    ['tarp', 'Emergency shelter / bivvy', 0, 180, true, 1],
    ['bag', 'Sleeping bag rated for forecast lows', 1, 1200, true, 1],
    ['mat', 'Insulated sleeping mat', 1, 500, true, 1],
    ['pillow', 'Camping pillow', 1, 100, false, 1],
    ['stove', 'Stove (where permitted)', 2, 300, false, 1],
    ['fuel', 'Compatible fuel canister (full)', 2, 350, false, 1],
    ['pot', 'Cooking pot with lid', 2, 250, false, 1],
    ['bowl', 'Bowl and spoon', 2, 100, false, 1],
    ['food', 'Food ration (one person-day)', 2, 800, true, 1],
    ['snack', 'Extra no-cook snacks / reserve', 2, 250, true, 1],
    ['bottle', 'Empty 1 L bottle', 3, 80, true, 3],
    ['water', 'Drinking water (1 L unit)', 3, 1000, true, 3],
    ['treatment', 'Water filter + disinfection backup', 3, 120, true, 1],
    ['ors', 'Oral rehydration salts sachet', 3, 25, false, 2],
    ['rain', 'Waterproof jacket / poncho', 4, 350, true, 1],
    ['fleece', 'Warm fleece layer', 4, 350, true, 1],
    ['shirt', 'Quick-dry long-sleeve shirt', 4, 180, true, 1],
    ['trousers', 'Trekking trousers', 4, 300, true, 1],
    ['socks', 'Spare dry socks (pair)', 4, 60, true, 1],
    ['underwear', 'Spare underwear', 4, 50, true, 1],
    ['hat', 'Sun hat', 4, 80, true, 1],
    ['shoes', 'Grippy trail shoes (pair)', 4, 800, true, 1],
    ['insulation', 'Insulated jacket', 4, 600, true, 1],
    ['thermal', 'Thermal base layer set', 4, 300, true, 1],
    ['gloves', 'Warm gloves and beanie', 4, 150, true, 1],
    ['gaiters', 'Gaiters / leech socks', 4, 150, false, 1],
    ['rainpants', 'Waterproof overtrousers', 4, 250, true, 1],
    ['firstaid', 'First aid and blister kit', 5, 250, true, 1],
    ['meds', 'Personal medicines + prescription', 5, 80, true, 1],
    ['map', 'Paper route map', 6, 40, true, 1],
    ['compass', 'Compass (know how to use it)', 6, 35, true, 1],
    ['phone', 'Phone with offline maps', 6, 200, true, 1],
    ['power', 'Charged power bank + cable', 6, 250, true, 1],
    ['lamp', 'Head torch', 7, 90, true, 1],
    ['batteries', 'Compatible spare batteries', 7, 50, true, 1],
    ['whistle', 'Emergency whistle', 7, 15, true, 1],
    ['repair', 'Repair tape and repair kit', 7, 100, false, 1],
    ['knife', 'Small multitool (where legal)', 7, 100, false, 1],
    ['matches', 'Waterproof ignition kit', 7, 35, false, 1],
    ['poles', 'Trekking poles (pair)', 7, 450, false, 1],
    ['drybag', 'Pack liner / dry bag', 7, 100, true, 1],
    ['sunscreen', 'Sunscreen SPF 30+', 8, 80, true, 1],
    ['glasses', 'UV-protective sunglasses', 8, 30, true, 1],
    ['repellent', 'Mosquito repellent', 8, 100, true, 1],
    ['net', 'Mosquito net', 8, 200, false, 1],
    ['soap', 'Soap and hand sanitiser', 8, 100, true, 1],
    ['tooth', 'Toothbrush and toothpaste', 8, 50, true, 1],
    ['waste', 'Rubbish bags (pack everything out)', 8, 30, true, 1],
    ['toilet', 'Toilet paper + waste bags', 8, 100, true, 1],
    ['trowel', 'Toilet trowel (where allowed)', 8, 80, false, 1],
    ['period', 'Menstrual / personal hygiene kit', 8, 100, false, 1],
    ['towel', 'Quick-dry towel', 8, 150, false, 1],
    ['id', 'Photo ID and emergency contact card', 9, 30, true, 1],
    ['permit', 'Permits / bookings / insurance copies', 9, 30, true, 1],
    ['cash', 'Cash in small notes', 9, 30, true, 1],
    ['swim', 'Swimwear (safe permitted areas only)', 4, 150, false, 1],
    ['pfd', 'Properly fitted buoyancy aid', 7, 700, true, 1],
    ['sandals', 'Secure camp sandals', 4, 300, false, 1],
    ['chair', 'Folding camp chair', 7, 2000, false, 1],
    ['cooler', 'Cool box with ice packs', 2, 4000, false, 1],
    ['car', 'Vehicle emergency kit and spare tyre tools', 7, 4000, true, 1],
    ['helmet', 'Cycling helmet', 7, 300, true, 1],
    ['cycle', 'Cycle pump + tube + puncture kit', 7, 400, true, 1],
    ['fishing', 'Fishing tackle (permit required)', 7, 700, false, 1],
    ['camera', 'Camera with spare battery', 7, 900, false, 1],
    ['snow', 'Snow traction / gaiters (route appropriate)', 7, 700, true, 1]
  ];
  const items = rows.map(([id, name, c, grams, must, qty]) =>
    ({ id, name, category: categories[c], grams, must, qty, packed: false, custom: false }));
  const base = 'pack tarp food snack bottle water treatment rain fleece shirt trousers socks hat shoes firstaid meds map compass phone power lamp batteries whistle drybag sunscreen glasses repellent soap waste toilet id permit cash';
  const camp = 'tent ground bag mat pillow underwear tooth trowel period repair';
  const cooking = 'stove fuel pot bowl matches';
  const specs = [
    ['day', 'Day Hike', base],
    ['overnight', 'Overnight Camp', base + ' ' + camp + ' ' + cooking],
    ['trek', 'Multi-day Trek', base + ' ' + camp + ' ' + cooking + ' poles insulation thermal'],
    ['monsoon', 'Monsoon Trip', base + ' ' + camp + ' ' + cooking + ' gaiters rainpants net'],
    ['cold', 'Cold/Snow', base + ' ' + camp + ' ' + cooking + ' insulation thermal gloves poles snow'],
    ['beach', 'Beach Camping', base + ' ' + camp + ' ' + cooking + ' sandals swim towel net'],
    ['carcamp', 'Car Camping', base + ' ' + camp + ' ' + cooking + ' chair cooler car towel sandals']
  ];
  const templates = specs.map(([id, name, ids]) => ({ id, name, template: true,
    items: [...new Set(ids.split(' '))].map(key => {
      const item = { ...items.find(i => i.id === key) };
      if (id === 'trek' && key === 'food') item.qty = 3;
      if (id !== 'day' && id !== 'trek' && key === 'food') item.qty = 2;
      if (id === 'cold' && key === 'bag') { item.name = 'Cold-rated sleeping bag (check comfort rating)'; item.grams = 1700; }
      return item;
    }) }));
  return { categories, items, templates };
});
