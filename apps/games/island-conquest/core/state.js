/* Island Conquest — world rules. No drawing and no input. */
(function (IC) {
  const CFG = IC.config;
  const NEUTRAL = CFG.owner.neutral;
  const PLAYER = CFG.owner.player;
  const AI = CFG.owner.ai;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function growth(isle) {
    return CFG.growth.base + isle.r * CFG.growth.perRadius;
  }

  function cloneList(list) {
    const islands = [];
    for (let i = 0; i < list.length; i++) {
      const src = list[i];
      islands.push({
        id: i + 1, x: src.x, y: src.y, r: src.r,
        owner: src.owner, troops: src.troops, selected: false, flash: 0,
      });
    }
    return islands;
  }

  /* Jitter a fixed lattice so Random always has a playable spread. */
  function buildRandom(seed) {
    const rnd = mulberry32(seed || 1);
    const spots = CFG.randomSpots;
    const islands = [];
    for (let i = 0; i < spots.length; i++) {
      islands.push({
        x: spots[i][0] + (rnd() - 0.5) * CFG.randomJitter,
        y: spots[i][1] + (rnd() - 0.5) * CFG.randomJitter,
        r: CFG.randomRadius[0] + rnd() * CFG.randomRadius[1],
        owner: NEUTRAL,
        troops: CFG.randomTroops[0] + rnd() * CFG.randomTroops[1],
      });
    }
    let player = 0;
    let ai = 1;
    let best = -1;
    for (let i = 0; i < islands.length; i++) {
      for (let j = i + 1; j < islands.length; j++) {
        const d = Math.hypot(islands[i].x - islands[j].x, islands[i].y - islands[j].y);
        if (d > best) {
          best = d;
          player = islands[i].y >= islands[j].y ? i : j;
          ai = player === i ? j : i;
        }
      }
    }
    islands[player].owner = PLAYER;
    islands[player].troops = CFG.startTroops;
    islands[player].r = Math.max(islands[player].r, CFG.homeRadius);
    islands[ai].owner = AI;
    islands[ai].troops = CFG.startTroops;
    islands[ai].r = Math.max(islands[ai].r, CFG.homeRadius);
    return islands;
  }

  function createWorld(mapId, difficulty, seed) {
    const maps = CFG.maps;
    let map = maps[0];
    for (let i = 0; i < maps.length; i++) if (maps[i].id === mapId) map = maps[i];
    const spec = map.id === 'random' ? buildRandom(seed) : map.islands;
    const islands = cloneList(spec);
    const tune = CFG.handicap[difficulty] || CFG.handicap.normal;
    for (let i = 0; i < islands.length; i++) {
      if (islands[i].owner === PLAYER) islands[i].troops *= tune.player;
      else if (islands[i].owner === AI) islands[i].troops *= tune.ai;
    }
    const byId = {};
    for (let i = 0; i < islands.length; i++) byId[islands[i].id] = islands[i];
    const ships = [];
    let seq = 1;
    const diff = {};
    const srcDiff = CFG.ai[difficulty] || CFG.ai.normal;
    for (const key in srcDiff) diff[key] = srcDiff[key];

    const world = {
      islands: islands, ships: ships, byId: byId, diff: diff,
      mapId: map.id, mapName: map.name, difficulty: difficulty, seed: seed, outcome: null,
    };

    world.send = function (ids, targetId, ratio, owner) {
      const target = byId[targetId];
      if (!target) return 0;
      let launched = 0;
      for (let i = 0; i < ids.length; i++) {
        const src = byId[ids[i]];
        if (!src || src.id === target.id || src.owner !== owner) continue;
        const amt = src.troops * ratio;
        if (amt < CFG.ship.minFleet) continue;
        src.troops -= amt;
        const dx = target.x - src.x;
        const dy = target.y - src.y;
        const dist = Math.hypot(dx, dy) || 1;
        const launch = Math.min(src.r + 8, dist * 0.45);
        ships.push({
          id: seq++, owner: owner, to: target.id, troops: amt,
          x: src.x + (dx / dist) * launch, y: src.y + (dy / dist) * launch,
          ang: Math.atan2(dy, dx),
        });
        launched++;
      }
      return launched;
    };

    world.islandAt = function (x, y, pad) {
      let best = null;
      let bestD = Infinity;
      for (let i = 0; i < islands.length; i++) {
        const isle = islands[i];
        const d = Math.hypot(isle.x - x, isle.y - y);
        if (d <= Math.max(isle.r, pad || 0) && d < bestD) { best = isle; bestD = d; }
      }
      return best;
    };

    world.counts = function (owner) {
      let isles = 0;
      let troops = 0;
      for (let i = 0; i < islands.length; i++) {
        if (islands[i].owner === owner) { isles++; troops += islands[i].troops; }
      }
      for (let i = 0; i < ships.length; i++) if (ships[i].owner === owner) troops += ships[i].troops;
      return { isles: isles, troops: Math.floor(troops + 1e-6) };
    };

    world.selectedIds = function () {
      const ids = [];
      for (let i = 0; i < islands.length; i++) {
        if (islands[i].selected && islands[i].owner === PLAYER) ids.push(islands[i].id);
      }
      return ids;
    };
    world.toggleSelect = function (id) {
      const isle = byId[id];
      if (isle && isle.owner === PLAYER) isle.selected = !isle.selected;
    };
    world.selectAll = function () {
      for (let i = 0; i < islands.length; i++) islands[i].selected = islands[i].owner === PLAYER;
    };
    world.clearSelect = function () {
      for (let i = 0; i < islands.length; i++) islands[i].selected = false;
    };

    function land(ship, isle) {
      if (ship.owner === isle.owner) { isle.troops += ship.troops; return; }
      isle.troops -= ship.troops;
      if (isle.troops < 0) {
        isle.owner = ship.owner;
        isle.troops = -isle.troops;
        isle.selected = false;
        isle.flash = 1;
      } else if (isle.troops <= 0.05) {
        isle.owner = NEUTRAL;
        isle.troops = 0;
        isle.selected = false;
      }
    }

    function judge() {
      let pI = 0, aI = 0, pS = 0, aS = 0;
      for (let i = 0; i < islands.length; i++) {
        if (islands[i].owner === PLAYER) pI++;
        else if (islands[i].owner === AI) aI++;
      }
      for (let i = 0; i < ships.length; i++) {
        if (ships[i].owner === PLAYER) pS++;
        else if (ships[i].owner === AI) aS++;
      }
      if (pI === 0 && pS === 0) return 'lose';
      if (aI === 0 && aS === 0) return 'win';
      return null;
    }

    /* Owned islands grow. Ships reinforce allies, or capture when defenders go negative. */
    world.step = function (dt) {
      if (world.outcome || dt <= 0) return;
      for (let i = 0; i < islands.length; i++) {
        const isle = islands[i];
        if (isle.owner !== NEUTRAL) isle.troops += growth(isle) * dt;
        if (isle.owner !== PLAYER) isle.selected = false;
        if (isle.flash > 0) isle.flash = Math.max(0, isle.flash - dt * 1.6);
      }
      for (let i = ships.length - 1; i >= 0; i--) {
        const ship = ships[i];
        const tgt = byId[ship.to];
        if (!tgt) { ships.splice(i, 1); continue; }
        const dx = tgt.x - ship.x;
        const dy = tgt.y - ship.y;
        const dist = Math.hypot(dx, dy) || 1;
        ship.ang = Math.atan2(dy, dx);
        if (dist - Math.max(12, tgt.r * 0.5) <= CFG.ship.speed * dt) {
          land(ship, tgt);
          ships.splice(i, 1);
        } else {
          const m = (CFG.ship.speed * dt) / dist;
          ship.x += dx * m;
          ship.y += dy * m;
        }
      }
      world.outcome = judge();
    };

    return world;
  }

  IC.rules = { growth: growth };
  IC.createWorld = createWorld;
})(window.IslandConquest);
