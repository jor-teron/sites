/*
 * File: core/targets.js
 * Project: tennis-throw
 * Purpose: Target spawning (reachable band, spacing, bird rows) and movement.
 *          TB8: band derived from the reachable rise; targets bob in later rounds.
 */
(function (TT) {
  const CFG = TT.CFG, game = TT.game;

  /**
   * TB1: highest y a target may use. Max rise at full power straight up is
   * speed²/(2·gravity) (same in per-frame or per-second units); only
   * reachFraction of it is used so every target is hittable with margin.
   */
  TT.minReachableY = function () {
    const rise = (game.ballSpeed * game.ballSpeed) / (2 * game.gravity) * CFG.physics.reachFraction;
    return Math.max(CFG.targets.marginTop, TT.launchPoint().y - rise);
  };

  /** TB3: true if (x, y) is clear of other targets and (for non-birds) of bird rows. */
  function spotIsFree(x, y, type) {
    const T = CFG.targets;
    return game.targets.every(t => {
      if (Math.hypot(t.x - x, t.y - y) < T.minGap) return false;
      // Birds fly across the whole width: keep other targets out of their row
      if ((t.type === 'bird') !== (type === 'bird') && Math.abs(t.y - y) < T.birdClearance) return false;
      return true;
    });
  }

  /** Add one target of the given pool type at a free, reachable spot. */
  TT.spawnTarget = function (type) {
    const T = CFG.targets, W = TT.canvas.width;
    const item = game.targetPool.find(p => p.type === type);
    const yMin = TT.minReachableY();
    const yMax = TT.launchPoint().y - T.minRiseAbove;   // TB8: derived from the launch point, not a fixed reserve
    // TB3: retry random spots; if none is free keep the one farthest from its neighbour
    let x, y, best = -1;
    for (let i = 0; i < T.spawnTries; i++) {
      const cx = Math.random() * (W - T.marginX * 2) + T.marginX;
      const cy = yMin + Math.random() * (yMax - yMin);
      if (spotIsFree(cx, cy, type)) { x = cx; y = cy; break; }
      const near = Math.min(Infinity, ...game.targets.map(t => Math.hypot(t.x - cx, t.y - cy)));
      if (near > best) { best = near; x = cx; y = cy; }
    }
    game.targets.push({
      type, x, y,
      vx: type === 'bird' ? (Math.random() > 0.5 ? 1 : -1) * item.speed * (game.birdSpeedScale || 1) * (1 + CFG.rounds.birdSpeedPerRound * ((game.round || 1) - 1)) : 0, // px/s (TB4: × difficulty, TB8: × round)
      baseY: y, phase: Math.random() * Math.PI * 2,   // TB8: bobbing
      bob: type !== 'bird' && type !== 'gift' && (game.round || 1) >= CFG.rounds.bobFromRound,
      born: game.clock || 0,                          // TB9: spawn pop animation
      emoji: item.emoji,
      points: item.points,
      radius: type === 'star' ? T.starRadius : T.radius,
    });
  };

  /** Fill the screen with the configured count of each target type. */
  TT.spawnAllTargets = function () {
    game.targets = [];
    // TB4/GS1: difficulty adds/removes a few targets per type (never below 1)
    const extra = game.extraCount || {};
    game.targetPool.forEach(p => {
      const n = Math.max(1, p.count + (extra[p.type] || 0));
      for (let i = 0; i < n; i++) TT.spawnTarget(p.type);
    });
  };

  /** Birds fly sideways and bounce off the edges; TB8: others may bob. dt in seconds. */
  TT.updateTargets = function (dt) {
    const T = CFG.targets, bobW = T.bobSpeed * (1 + CFG.rounds.bobPerRound * ((game.round || 1) - 1));
    for (const t of game.targets) {
      if (t.bob) { t.phase += bobW * dt; t.y = t.baseY + Math.sin(t.phase) * T.bobAmp; }
      if (t.type !== 'bird') continue;
      t.x += t.vx * dt;
      if (t.x - t.radius < 0) { t.x = t.radius; t.vx = Math.abs(t.vx); }
      if (t.x + t.radius > TT.canvas.width) { t.x = TT.canvas.width - t.radius; t.vx = -Math.abs(t.vx); }
    }
  };
})(window.TT);
