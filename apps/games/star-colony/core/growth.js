/* SC-1b: events, skills, research and arrivals. Optional pure simulation extension. */
(function (root) {
  'use strict';
  const SC = typeof module !== 'undefined' && module.exports ? require('./sim.js') : root.SC;
  const D = SC.D;
  Object.assign(D.buildings, {
    lab: { name: 'Discovery Lab', glyph: '⚗', cost: { ore: 18 }, work: 16, power: 3 },
    medbay: { name: 'Care Station', glyph: '+', cost: { ore: 16, water: 5 }, work: 14, power: 2, unlock: 'medbay' },
    droneport: { name: 'Hauler Nest', glyph: '◇', cost: { ore: 20 }, work: 14, power: 2, unlock: 'drones' }
  });
  const tree = {
    solar: { name: 'Prism Solar', cost: 45, requires: [], text: 'Solar output +35%.' },
    recycle: { name: 'Closed Water Loop', cost: 65, requires: ['solar'], text: 'Farm and oxygen water use halved.' },
    medbay: { name: 'Gentle Care', cost: 70, requires: ['recycle'], text: 'Unlock Care Stations to cure illness.' },
    drones: { name: 'Cargo Wings', cost: 85, requires: ['solar'], text: 'Unlock Hauler Nests and autonomous hauling helpers.' },
    domes: { name: 'Woven Shells', cost: 65, requires: ['medbay'], text: 'Domes take 60% less event damage.' }
  };
  const events = ['storm', 'meteor', 'failure', 'illness'];
  const eventNames = { storm: 'Dust front', meteor: 'Meteor shower', failure: 'Equipment fault', illness: 'Spore illness' };
  function init(s) {
    s.research ||= { points: 0, active: null, done: [] };
    s.events ||= { next: D.DAY * 1.4, warning: null, stormUntil: 0, last: null };
    s.ship ||= { next: D.DAY * 3, waiting: false, visits: 0 };
    s.goals ||= { ten: false, twenty: false, sufficient: false, research: false, streak: 0,
      day: Math.floor(s.time / D.DAY), food: s.stats.food, water: s.stats.water, foodUsed: s.stats.foodUsed || 0, waterUsed: s.stats.waterUsed || 0, bad: false };
    s.drones ||= [];
    s.colonists.forEach(c => { c.skills ||= { build: 0, haul: 0, mine: 0, farm: 0, research: 0, repair: 0 }; c.illness ||= 0; });
  }
  function selectResearch(s, key) {
    init(s); const def = tree[key];
    if (!def || s.research.done.includes(key) || def.requires.some(k => !s.research.done.includes(k))) return false;
    s.research.active = key; SC.notice(s, 'Research selected: ' + def.name); return true;
  }
  function researchTick(s) {
    const key = s.research.active, def = tree[key];
    if (def && s.research.points >= def.cost) {
      s.research.points -= def.cost; s.research.done.push(key); s.research.active = null;
      SC.notice(s, 'Discovery complete: ' + def.name, 'good');
    }
  }
  function availableBeds(s) { return s.buildings.filter(b => b.ready && b.health > 0 && b.type === 'dome').length * 5 - s.colonists.length; }
  function chooseSupply(s, choice) {
    init(s); if (!s.ship.waiting || !['pantry', 'materials', 'water'].includes(choice)) return false;
    const store = SC.stores(s)[0]; if (!store) return false;
    const pack = choice === 'pantry' ? { food: 45, water: 15, ore: 10 } : choice === 'water' ? { water: 65, food: 15, ore: 10 } : { ore: 55, food: 15, water: 15 };
    for (const [key, n] of Object.entries(pack)) store.stock[key] += n;
    const count = Math.max(0, Math.min(2, availableBeds(s)));
    const names = ['Tavi', 'Lumi', 'Enna', 'Oru', 'Kiri', 'Mavi', 'Ilo', 'Vela', 'Runi', 'Esi', 'Pavi', 'Noma'];
    for (let i = 0; i < count; i++) {
      const c = SC.addColonist(s, names[(s.stats.born - 3) % names.length] + (s.stats.born >= 15 ? ' ' + (s.stats.born - 13) : ''));
      s.stats.born++; c.skills = { build: 0, haul: 0, mine: 0, farm: 0, research: 0, repair: 0 }; c.illness = 0;
    }
    s.ship.waiting = false; s.ship.visits++; s.ship.next = s.time + 3 * D.DAY;
    SC.notice(s, 'Supply ship docked: ' + count + ' settlers joined. ' + (count < 2 ? 'Build more domes for future arrivals.' : 'Welcome home.'), 'good');
    return true;
  }
  function warn(s, kind) {
    init(s); s.events.warning = { kind, at: s.time + 18 };
    SC.notice(s, eventNames[kind] + ' in 18 seconds. Prepare batteries and repair crews.', 'warning');
  }
  function trigger(s, kind) {
    init(s); const ready = s.buildings.filter(b => b.ready && b.type !== 'corridor');
    const pick = list => list[Math.floor(SC.random(s) * list.length)];
    const b = ready.length ? pick(ready) : null;
    s.events.last = { kind, at: s.time, x: b?.x ?? 20, y: b?.y ?? 15 };
    if (kind === 'storm') {
      s.events.stormUntil = s.time + 38;
      ready.forEach(b => { b.health = Math.max(1, b.health - (b.type === 'dome' && s.research.done.includes('domes') ? 3 : 8)); });
      SC.notice(s, 'Dust front: solar at 25% and structures weathered. Repair jobs queued.', 'warning');
    } else if (kind === 'meteor' && b) {
      const damage = b.type === 'dome' && s.research.done.includes('domes') ? 30 : 75;
      b.health = Math.max(0, b.health - damage);
      SC.notice(s, 'Meteor impact at ' + b.x + ', ' + b.y + '. Repair crew requested.', 'danger');
    } else if (kind === 'failure' && b) {
      b.health = Math.max(1, b.health - 35); b.offlineUntil = s.time + 60;
      SC.notice(s, D.buildings[b.type].name + ' shut down after an equipment fault. Repair to restart.', 'danger');
    } else if (kind === 'illness' && s.colonists.length) {
      const c = pick(s.colonists); c.illness = 200;
      SC.notice(s, c.name + ' has spore illness. A powered Care Station cures it.', 'warning');
    }
    s.events.warning = null; s.events.next = s.time + D.DAY * (1.3 + SC.random(s) * 1.6);
  }
  function milestones(s) {
    const set = (key, yes, text) => { if (yes && !s.goals[key]) { s.goals[key] = true; SC.notice(s, 'Milestone: ' + text, 'good'); } };
    set('ten', s.colonists.length >= 10, 'Ten settlers'); set('twenty', s.colonists.length >= 20, 'Twenty settlers');
    set('research', s.research.done.length === Object.keys(tree).length, 'All discoveries complete');
    const day = Math.floor(s.time / D.DAY);
    if (day > s.goals.day) {
      const n = s.colonists.length;
      /* A full day of local production must exceed need consumption, not just stock. */
      const enough = s.stats.food - s.goals.food >= (s.stats.foodUsed || 0) - s.goals.foodUsed && s.stats.water - s.goals.water >= (s.stats.waterUsed || 0) - s.goals.waterUsed && !s.goals.bad && n > 0;
      s.goals.streak = enough ? s.goals.streak + 1 : 0;
      s.goals.day = day; s.goals.food = s.stats.food; s.goals.water = s.stats.water; s.goals.foodUsed = s.stats.foodUsed || 0; s.goals.waterUsed = s.stats.waterUsed || 0; s.goals.bad = false;
      set('sufficient', s.goals.streak >= 5, 'Five days of self-sufficiency');
    }
  }
  function tick(s, dt) {
    init(s);
    for (const c of s.colonists) if (c.illness > 0) { c.illness = Math.max(0, c.illness - dt); c.health = Math.max(0, c.health - .16 * dt); }
    if (!s.events.warning && s.time >= s.events.next) warn(s, events[Math.floor(SC.random(s) * events.length)]);
    if (s.events.warning && s.time >= s.events.warning.at) trigger(s, s.events.warning.kind);
    if (!s.ship.waiting && s.time >= s.ship.next) { s.ship.waiting = true; SC.notice(s, 'Supply ship in orbit. Choose a cargo pack to dock.', 'good'); }
    if (s.power.served < s.power.demand - .01 || SC.totals(s).food <= 0 || SC.totals(s).water <= 0 || s.colonists.some(c => c.air <= 0 || c.food <= 0)) s.goals.bad = true;
    researchTick(s); milestones(s);
    for (const b of s.buildings.filter(b => b.ready && b.type === 'droneport')) {
      if (!s.drones.some(d => d.port === b.id)) s.drones.push({ id: ++s.serial, port: b.id, x: b.x, y: b.y, path: [], job: null, cargo: null });
    }
    for (const drone of s.drones) droneTick(s, drone, dt);
  }
  function droneTick(s, c, dt) {
    const port = SC.building(s, c.port); if (!port?.powered || port.health <= 0) return;
    let j = s.jobs.find(j => j.id === c.job);
    if (!j) {
      j = s.jobs.find(j => j.kind === 'haul' && !j.worker);
      if (!j) return;
      j.worker = c.id; c.job = j.id; c.destination = null;
    }
    const source = SC.building(s, j.target);
    if (!source || source.health <= 0) { s.jobs = s.jobs.filter(v => v.id !== j.id); SC.clearJob(s, c); return; }
    const dest = !j.stage ? source : SC.nearestStore(s, c);
    if (!dest) { SC.clearJob(s, c); return; }
    const arrived = SC.navigate(s, c, dest, dt * 1.5);
    if (arrived < 0) { SC.clearJob(s, c); return; }
    if (!arrived) return;
    if (!j.stage) {
      c.cargo = {}; Object.entries(source.output).forEach(([key, n]) => { c.cargo[key] = Math.floor(n); source.output[key] -= c.cargo[key]; });
      j.stage = 1; c.destination = null;
    } else {
      Object.entries(c.cargo || {}).forEach(([key, n]) => { dest.stock[key] += n; }); c.cargo = null;
      s.jobs = s.jobs.filter(v => v.id !== j.id); SC.clearJob(s, c);
    }
  }
  function jobs(s) {
    for (const b of s.buildings) {
      if (b.ready && (b.health < 99.9 || b.offlineUntil > s.time)) SC.enqueue(s, 'repair', b, 5);
      if (b.ready && b.health > 0 && b.type === 'lab' && b.powered && s.research.active) SC.enqueue(s, 'research', b, 48);
    }
  }
  function needs(s, c, dt) {
    if (!c.illness) return;
    const med = s.buildings.filter(b => b.type === 'medbay' && b.ready && b.powered && b.health > 0).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
    if (med && !c.cargo) {
      SC.clearJob(s, c); c.activity = 'Medical care';
      if (SC.navigate(s, c, med, dt) === 1) { c.illness = Math.max(0, c.illness - 10 * dt); c.health = Math.min(100, c.health + 1.2 * dt); }
      return true;
    }
    return false;
  }
  function complete(s, c, j, b) {
    if (j.kind === 'repair') {
      /* Low-cost field repairs are always possible, including a wrecked starting store. */
      b.health = Math.min(100, b.health + 45); b.offlineUntil = 0;
    }
    if (j.kind === 'research' && b.powered && s.research.active) { s.research.points += 8; researchTick(s); }
  }
  function skill(c, kind, dt) { c.skills ||= {}; c.skills[kind] = Math.min(5, (c.skills[kind] || 0) + dt * .018); }
  function workSpeed(s, c, kind) { return (1 + (c.skills?.[kind] || 0) * .16) * (c.illness > 0 ? .6 : 1); }
  const api = { init, tree, selectResearch, chooseSupply, availableBeds, warn, trigger, tick, jobs, needs, complete, skill, workSpeed,
    solar: s => (s.research.done.includes('solar') ? 1.35 : 1) * (s.events.stormUntil > s.time ? .25 : 1) };
  SC.growth = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SCGrowth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
