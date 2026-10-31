/* Island Conquest — one opponent. Expands into weak neutrals, gangs up on the player,
   and stacks troops forward when a single island cannot win the fight. */
(function (IC) {
  const AI = IC.config.owner.ai;
  const PLAYER = IC.config.owner.player;
  const NEUTRAL = IC.config.owner.neutral;

  function act(world) {
    const diff = world.diff;
    const speed = IC.config.ship.speed;
    const owned = [];
    for (let i = 0; i < world.islands.length; i++) {
      const isle = world.islands[i];
      if (isle.owner === AI && isle.troops >= diff.reserve) owned.push(isle);
    }
    if (!owned.length) return;

    function defendOf(tgt, dist) {
      let cover = 0;
      let hostile = 0;
      for (let n = 0; n < world.ships.length; n++) {
        const ship = world.ships[n];
        if (ship.to !== tgt.id) continue;
        if (ship.owner === tgt.owner) cover += ship.troops;
        else if (ship.owner === AI) hostile += ship.troops;
      }
      const grow = tgt.owner === NEUTRAL ? 0 : IC.rules.growth(tgt) * (dist / speed);
      return tgt.troops + grow + cover - hostile;
    }

    let best = null;
    let bestScore = 0;
    for (let t = 0; t < world.islands.length; t++) {
      const tgt = world.islands[t];
      if (tgt.owner === AI) continue;
      const near = [];
      for (let i = 0; i < owned.length; i++) {
        const dist = Math.hypot(owned[i].x - tgt.x, owned[i].y - tgt.y);
        if (dist <= diff.maxDist) near.push({ src: owned[i], dist: dist });
      }
      if (!near.length) continue;
      near.sort(function (a, b) { return a.dist - b.dist; });
      const squad = near.slice(0, diff.launches);
      let ammo = 0;
      let reach = 0;
      for (let i = 0; i < squad.length; i++) {
        ammo += squad[i].src.troops * diff.send;
        if (squad[i].dist > reach) reach = squad[i].dist;
      }
      const defend = defendOf(tgt, reach);
      const need = tgt.owner === PLAYER ? diff.advantage : diff.neutralNeed;
      if (ammo < Math.max(0, defend) * need) continue;
      const bias = tgt.owner === PLAYER ? diff.attackBias : diff.neutralBias;
      const score = bias * (ammo / (Math.max(defend, 1) + 4)) / (reach + 80);
      if (score > bestScore) { bestScore = score; best = { tgt: tgt, squad: squad }; }
    }
    if (best) {
      const ids = [];
      for (let i = 0; i < best.squad.length; i++) ids.push(best.squad[i].src.id);
      world.send(ids, best.tgt.id, diff.send, AI);
      return;
    }

    /* No winning strike. Feed the island closest to the weakest foe. */
    let prey = null;
    let preyW = Infinity;
    for (let t = 0; t < world.islands.length; t++) {
      const tgt = world.islands[t];
      if (tgt.owner === AI) continue;
      const weight = tgt.troops + 20 + (tgt.owner === PLAYER ? 0 : 30);
      if (weight < preyW) { preyW = weight; prey = tgt; }
    }
    if (!prey) return;
    let front = owned[0];
    let frontD = Infinity;
    for (let i = 0; i < owned.length; i++) {
      const d = Math.hypot(owned[i].x - prey.x, owned[i].y - prey.y);
      if (d < frontD) { frontD = d; front = owned[i]; }
    }
    let donor = null;
    for (let i = 0; i < owned.length; i++) {
      if (owned[i].id === front.id) continue;
      const d = Math.hypot(owned[i].x - front.x, owned[i].y - front.y);
      if (d <= diff.maxDist && (!donor || owned[i].troops > donor.troops)) donor = owned[i];
    }
    if (donor) world.send([donor.id], front.id, diff.send, AI);
  }

  IC.opponent = { act: act };
})(window.IslandConquest);
