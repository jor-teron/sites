/* Pure deterministic fixed-step simulation. No DOM, wall clock or storage access. */
(function (root) {
  'use strict';
  const D = typeof module !== 'undefined' && module.exports ? require('./data.js') : root.SCData;
  const findPath = typeof module !== 'undefined' && module.exports ? require('./path.js') : root.SCPath;
  const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, n));
  function random(s) { s.seed = (Math.imul(s.seed, 1664525) + 1013904223) >>> 0; return s.seed / 4294967296; }
  function notice(s, text, type = 'info') {
    s.alerts.push({ id: ++s.serial, time: s.time, text, type });
    if (s.alerts.length > 60) s.alerts.shift();
  }
  function addBuilding(s, type, x, y, ready = false) {
    const b = { id: ++s.serial, type, x, y, ready, delivered: ready, progress: 0, health: 100,
      stock: { ore: 0, water: 0, food: 0 }, output: {}, charge: type === 'battery' ? 150 : 0,
      oxygen: type === 'dome' ? 140 : 0, powered: false, next: 0, network: -1 };
    s.buildings.push(b); return b;
  }
  function addColonist(s, name) {
    const c = { id: ++s.serial, name, x: 18, y: 15, health: 100, air: 100, food: 100,
      rest: 100, morale: 85, job: null, path: [], cargo: null, recovering: false };
    s.colonists.push(c); return c;
  }
  function create(seed = 4627) {
    const s = { version: 1, w: D.W, h: D.H, seed: seed >>> 0, time: 0, serial: 0,
      terrain: [], buildings: [], colonists: [], jobs: [], alerts: [], power: {},
      stats: { born: 3, lost: 0, built: 0, food: 0, water: 0, ore: 0, foodUsed: 0, waterUsed: 0 }, over: false };
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const n = random(s);
      s.terrain.push(n < .12 ? 'rock' : n < .19 ? 'ice' : n < .27 ? 'ore' : 'regolith');
    }
    for (let y = 11; y <= 20; y++) for (let x = 14; x <= 25; x++) s.terrain[y * s.w + x] = 'regolith';
    s.terrain[16 * s.w + 19] = 'ice'; s.terrain[16 * s.w + 20] = 'ore';
    addBuilding(s, 'dome', 18, 15, true);
    addBuilding(s, 'oxygen', 19, 15, true);
    const store = addBuilding(s, 'storage', 20, 15, true);
    store.stock = { ore: 100, water: 90, food: 65 };
    addBuilding(s, 'farm', 18, 16, true); addBuilding(s, 'drill', 19, 16, true);
    addBuilding(s, 'mine', 20, 16, true); addBuilding(s, 'solar', 18, 14, true);
    addBuilding(s, 'solar', 19, 14, true); addBuilding(s, 'battery', 20, 14, true);
    addBuilding(s, 'battery', 21, 14, true); addBuilding(s, 'corridor', 21, 15, true);
    ['Ari', 'Neri', 'Sol'].forEach(n => addColonist(s, n));
    notice(s, 'Welcome to Pelora. Adjacent buildings share power and oxygen. Expand with corridors.');
    if (api.growth) api.growth.init(s);
    networks(s, D.STEP); return s;
  }
  function totals(s) {
    const out = { ore: 0, water: 0, food: 0 };
    s.buildings.filter(b => b.ready && b.health > 0 && b.type === 'storage').forEach(b => {
      D.resources.forEach(k => { out[k] += b.stock[k] || 0; });
    }); return out;
  }
  function stores(s, network) { return s.buildings.filter(b => b.ready && b.health > 0 && b.type === 'storage' && (network === undefined || b.network === network)); }
  function withdraw(s, key, amount, network) {
    const list = stores(s, network);
    if (list.reduce((n, b) => n + (b.stock[key] || 0), 0) + 1e-8 < amount) return false;
    if (key === 'water') s.stats.waterUsed = (s.stats.waterUsed || 0) + amount;
    for (const b of list) { const n = Math.min(b.stock[key] || 0, amount); b.stock[key] -= n; amount -= n; }
    return true;
  }
  function place(s, type, x, y) {
    const def = D.buildings[type];
    if (s.over || !def || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= s.w || y >= s.h) return 'Choose a valid tile';
    const terrain = s.terrain[y * s.w + x];
    if (terrain === 'rock') return 'Rock blocks building and walking';
    if (def.deposit && terrain !== def.deposit) return 'Needs an ' + def.deposit + ' deposit';
    if (s.buildings.some(b => b.x === x && b.y === y)) return 'Tile already occupied';
    if (def.unlock && !s.research?.done.includes(def.unlock)) return 'Research required: ' + def.unlock;
    const b = addBuilding(s, type, x, y);
    notice(s, def.name + ' planned. Workers haul its cost before construction.');
    return b;
  }
  /* Connected cardinal tiles carry utilities; no invisible global oxygen or power. */
  function networks(s, dt) {
    s.buildings.forEach(b => { b.network = -1; b.powered = false; });
    const live = s.buildings.filter(b => b.ready && b.health > 0 && !(b.offlineUntil > s.time)), byPos = new Map(live.map(b => [b.y * s.w + b.x, b]));
    live.forEach(b => { b.network = -1; b.powered = false; });
    let net = 0, made = 0, demand = 0, served = 0, charge = 0, capacity = 0;
    for (const first of live) {
      if (first.network >= 0) continue;
      const group = [], queue = [first]; first.network = net;
      while (queue.length) {
        const b = queue.pop(); group.push(b);
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const nx = b.x + dx, ny = b.y + dy;
          if (nx < 0 || ny < 0 || nx >= s.w || ny >= s.h) continue;
          const nb = byPos.get(ny * s.w + nx);
          if (nb && nb.network < 0) { nb.network = net; queue.push(nb); }
        }
      }
      let solar = group.filter(b => b.type === 'solar').reduce((n, b) => n + (daylight(s) ? 16 * b.health / 100 : 0), 0);
      if (api.growth?.solar) solar *= api.growth.solar(s);
      const cells = group.filter(b => b.type === 'battery');
      const stored = cells.reduce((n, b) => n + b.charge, 0);
      const use = group.reduce((n, b) => n + D.buildings[b.type].power, 0);
      let available = solar + stored / dt, used = 0;
      const consumers = [...group].sort((a, b) => (a.type === 'oxygen' ? -1 : 1) - (b.type === 'oxygen' ? -1 : 1));
      for (const b of consumers) {
        const power = D.buildings[b.type].power;
        b.powered = power <= available + 1e-8;
        if (b.powered) { used += power; available -= power; }
      }
      let delta = (solar - used) * dt;
      for (const b of cells) { const v = clamp(b.charge + delta, 0, 900); delta -= v - b.charge; b.charge = v; }
      made += solar; demand += use; served += used;
      charge += cells.reduce((n, b) => n + b.charge, 0); capacity += cells.length * 900;
      const domes = group.filter(b => b.type === 'dome');
      for (const gen of group.filter(b => b.type === 'oxygen' && b.powered)) {
        if (domes.some(b => b.oxygen < 179) && withdraw(s, 'water', .018 * dt * (s.research?.done.includes('recycle') ? .5 : 1), net)) {
          domes.forEach(b => { b.oxygen = Math.min(180, b.oxygen + 4 * dt / domes.length); });
        }
      }
      domes.forEach(b => { b.oxygen = Math.max(0, b.oxygen - .025 * dt); }); net++;
    }
    s.power = { made, demand, served, charge, capacity };
  }
  function daylight(s) { return s.time % D.DAY < D.DAY * .64; }
  function enqueue(s, kind, b, priority, extra = {}) {
    const key = kind + ':' + b.id;
    if (!s.jobs.some(j => j.key === key)) s.jobs.push({ id: ++s.serial, key, kind, target: b.id, priority, worker: null, work: 0, stage: 0, ...extra });
  }
  function queueJobs(s) {
    for (const b of s.buildings) {
      if (b.health <= 0) continue;
      if (!b.ready) { enqueue(s, b.delivered ? 'build' : 'supply', b, b.delivered ? 10 : 20); continue; }
      if (Object.values(b.output).some(n => n >= 1)) enqueue(s, 'haul', b, 30);
      if (b.next > s.time || !b.powered) continue;
      if (b.type === 'drill' || b.type === 'mine') enqueue(s, 'mine', b, b.type === 'drill' ? 40 : 50);
      if (b.type === 'farm') enqueue(s, 'farm', b, 45);
    }
    if (api.growth?.jobs) api.growth.jobs(s);
    s.jobs.sort((a, b) => a.priority - b.priority || a.id - b.id);
  }
  function building(s, id) { return s.buildings.find(b => b.id === id); }
  function navigate(s, c, dest, dt) {
    if (!c.destination || c.destination.x !== dest.x || c.destination.y !== dest.y) {
      c.path = findPath(s, { x: Math.round(c.x), y: Math.round(c.y) }, dest);
      c.destination = { x: dest.x, y: dest.y };
    }
    if (!c.path) return -1;
    let distance = 1.7 * dt * (1 + (c.cargo ? (c.skills?.haul || 0) * .12 : 0));
    while (c.path.length && distance > 0) {
      const node = c.path[0], dx = node.x - c.x, dy = node.y - c.y, len = Math.hypot(dx, dy);
      if (len <= distance) { c.x = node.x; c.y = node.y; distance -= len; c.path.shift(); }
      else { c.x += dx / len * distance; c.y += dy / len * distance; distance = 0; }
    }
    return c.path.length === 0 ? 1 : 0;
  }
  function clearJob(s, c) {
    const j = s.jobs.find(j => j.id === c.job); if (j) j.worker = null;
    c.job = null; c.path = []; c.destination = null;
  }
  function finish(s, c, j) { s.jobs = s.jobs.filter(v => v.id !== j.id); clearJob(s, c); }
  function nearestStore(s, c, test = () => true) {
    return stores(s).filter(test).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
  }
  function need(s, c, dt) {
    const shelter = s.buildings.find(b => b.ready && b.health > 0 && b.type === 'dome' && Math.hypot(b.x - c.x, b.y - c.y) < .7);
    c.air = clamp(c.air - .14 * dt); c.food = clamp(c.food - .085 * dt); c.rest = clamp(c.rest - .065 * dt);
    if (shelter && shelter.oxygen > .12) { const take = Math.min(2.5 * dt, 100 - c.air, shelter.oxygen); c.air += take; shelter.oxygen -= take; c.rest = clamp(c.rest + 2 * dt); }
    const store = nearestStore(s, c, b => b.stock.food >= 1);
    if (c.food < 65 && store && Math.hypot(store.x - c.x, store.y - c.y) < .75) { store.stock.food--; s.stats.foodUsed = (s.stats.foodUsed || 0) + 1; c.food = clamp(c.food + 45); }
    c.morale = clamp(c.morale + ((c.air > 35 && c.food > 35 && c.rest > 30) ? .03 : -.15) * dt);
    c.health = clamp(c.health + ((c.air <= 0 ? -.8 : c.food <= 0 ? -.35 : c.rest <= 0 ? -.08 : .08) * dt));
    if (c.air < 28 || c.rest < 22) c.recovering = true;
    if (c.recovering && c.air > 92 && c.rest > 92) c.recovering = false;
    let dest;
    if (c.recovering) dest = s.buildings.filter(b => b.ready && b.health > 0 && b.type === 'dome' && b.oxygen > 1)
      .sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
    else if (c.food < 55) dest = store;
    if (dest && !c.cargo) { clearJob(s, c); c.activity = c.recovering ? 'Rest / oxygen' : 'Eat'; navigate(s, c, dest, dt); return true; }
    return false;
  }
  function worker(s, c, dt) {
    if (need(s, c, dt)) return;
    if (api.growth?.needs && api.growth.needs(s, c, dt)) return;
    let j = s.jobs.find(j => j.id === c.job);
    if (!j) {
      for (const candidate of s.jobs) {
        if (candidate.worker) continue;
        const b = building(s, candidate.target); if (!b || (b.health <= 0 && candidate.kind !== 'repair')) continue;
        if (candidate.kind === 'supply' && !nearestStore(s, c, store => Object.entries(D.buildings[b.type].cost).every(([k, v]) => store.stock[k] >= v))) continue;
        if (!findPath(s, { x: Math.round(c.x), y: Math.round(c.y) }, b)) continue;
        j = candidate; j.worker = c.id; c.job = j.id; c.destination = null; break;
      }
    }
    if (!j) {
      const dome = s.buildings.find(b => b.ready && b.health > 0 && b.type === 'dome');
      c.activity = 'Rest'; if (dome) navigate(s, c, dome, dt); return;
    }
    const b = building(s, j.target);
    if (!b || (b.health <= 0 && j.kind !== 'repair')) { finish(s, c, j); return; }
    let dest = b; c.activity = j.kind;
    if (j.kind === 'supply' && j.stage === 0) {
      dest = nearestStore(s, c, store => Object.entries(D.buildings[b.type].cost).every(([k, v]) => store.stock[k] >= v));
      if (!dest) { clearJob(s, c); return; }
    }
    if (j.kind === 'haul' && j.stage === 1) dest = nearestStore(s, c);
    if (!dest) { clearJob(s, c); return; }
    const arrived = navigate(s, c, dest, dt);
    if (arrived < 0) { clearJob(s, c); return; }
    if (!arrived) return;
    if (j.kind === 'supply') {
      if (j.stage === 0) {
        c.cargo = { ...D.buildings[b.type].cost }; Object.entries(c.cargo).forEach(([k, v]) => { dest.stock[k] -= v; });
        j.stage = 1; c.destination = null;
      } else { b.delivered = true; c.cargo = null; if (api.growth?.skill) api.growth.skill(c, 'haul', 6); finish(s, c, j); }
    } else if (j.kind === 'haul') {
      if (!j.stage) {
        c.cargo = {}; for (const [k, v] of Object.entries(b.output)) { c.cargo[k] = Math.floor(v); b.output[k] -= c.cargo[k]; }
        j.stage = 1; c.destination = null;
      } else { for (const [k, v] of Object.entries(c.cargo || {})) dest.stock[k] += v; c.cargo = null; if (api.growth?.skill) api.growth.skill(c, 'haul', 6); finish(s, c, j); }
    } else {
      const speed = api.growth?.workSpeed ? api.growth.workSpeed(s, c, j.kind) : 1;
      j.work += dt * speed;
      if (api.growth?.skill) api.growth.skill(c, j.kind, dt);
      const required = j.kind === 'build' ? D.buildings[b.type].work : 6;
      if (j.work < required) return;
      if (j.kind === 'build') {
        b.ready = true; s.stats.built++; notice(s, D.buildings[b.type].name + ' is ready.', 'good');
      } else if (j.kind === 'mine' || j.kind === 'farm') {
        if (!b.powered) { clearJob(s, c); return; }
        const key = b.type === 'drill' ? 'water' : b.type === 'mine' ? 'ore' : 'food';
        if (key !== 'food' || withdraw(s, 'water', .6 * (s.research?.done.includes('recycle') ? .5 : 1), b.network)) {
          b.output[key] = (b.output[key] || 0) + (key === 'ore' ? 3 : 5); s.stats[key] += key === 'ore' ? 3 : 5;
        }
        b.next = s.time + 12;
      } else if (api.growth?.complete) api.growth.complete(s, c, j, b);
      finish(s, c, j);
    }
  }
  function step(s) {
    if (s.over) return;
    const dt = D.STEP; s.time += dt;
    if (api.growth?.tick) api.growth.tick(s, dt);
    networks(s, dt); queueJobs(s);
    for (const c of s.colonists) worker(s, c, dt);
    for (const c of s.colonists.filter(c => c.health <= 0)) {
      const store = nearestStore(s, c);
      if (store && c.cargo) for (const [k, v] of Object.entries(c.cargo)) store.stock[k] += v;
      const job = s.jobs.find(j => j.id === c.job);
      if (job && c.cargo) { job.stage = 0; }
      clearJob(s, c); s.stats.lost++; notice(s, c.name + ' was lost.', 'danger');
    }
    s.colonists = s.colonists.filter(c => c.health > 0);
    s.jobs = s.jobs.filter(j => { const b = building(s, j.target); return b && (b.health > 0 || j.kind === 'repair') && !(j.kind === 'supply' && b.delivered); });
    if (!s.colonists.length) { s.over = true; notice(s, 'The colony is silent. All colonists were lost.', 'danger'); }
  }
  function advance(s, seconds) { const n = Math.floor(seconds / D.STEP); for (let i = 0; i < n && !s.over; i++) step(s); return s; }
  function save(s) { return JSON.stringify(s); }
  function load(text) {
    const s = JSON.parse(text);
    if (!s || s.version !== 1 || s.w !== D.W || s.h !== D.H || !Array.isArray(s.terrain) || s.terrain.length !== D.W * D.H || !Array.isArray(s.colonists) || !Array.isArray(s.buildings) || !Array.isArray(s.jobs)) throw Error('Unrecognized colony save');
    function finite(v) { if (typeof v === 'number' && !Number.isFinite(v)) throw Error('Invalid save number'); if (v && typeof v === 'object') Object.values(v).forEach(finite); }
    finite(s);
    if (!Number.isFinite(s.time) || s.time < 0 || !Number.isInteger(s.seed) || !Array.isArray(s.alerts)) throw Error('Invalid colony state');
    for (const b of s.buildings) if (!D.buildings[b.type] || !Number.isInteger(b.x) || !Number.isInteger(b.y) || b.x < 0 || b.y < 0 || b.x >= s.w || b.y >= s.h || !b.stock || !b.output || !Number.isFinite(b.health)) throw Error('Invalid building');
    for (const c of s.colonists) if (!['x', 'y', 'health', 'air', 'food', 'rest', 'morale'].every(k => Number.isFinite(c[k]))) throw Error('Invalid colonist');
    if (api.growth) api.growth.init(s);
    return s;
  }
  const api = { D, create, random, notice, addBuilding, addColonist, totals, stores, withdraw, place, networks,
    daylight, enqueue, building, findPath, navigate, clearJob, nearestStore, step, advance, save, load, growth: null };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
