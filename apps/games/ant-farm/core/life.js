// AF-4d: seasons, a surface predator, goals, food cap from pantry rooms.
// Called from colony.js (AF.tickLife). Keeps seed determinism: all chance uses w.r().
(function () {
  var S, W;
  AF.YEAR = 8 * (AF.DAY || 60);                            // 8 colony days in a year
  AF.SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  AF.yearPhase = function (w) { return ((w.t / AF.YEAR) % 1 + 1) % 1; };
  AF.seasonIndex = function (w) { return AF.yearPhase(w) * 4 | 0; };
  AF.season = function (w) { return AF.SEASONS[AF.seasonIndex(w)]; };
  // 0 by spring/summer, fades in late autumn, 1 through most of winter, fades at year end.
  AF.winterAmt = function (w) {
    var p = AF.yearPhase(w);
    if (p < 0.68) return 0;
    if (p < 0.75) return (p - 0.68) / 0.07;
    if (p < 0.96) return 1;
    return (1 - p) / 0.04;
  };
  AF.foodCap = function (w) {
    var n = 220, i;
    for (i = 0; i < (w.rooms || []).length; i++) if (w.rooms[i].kind === 'pantry') n += 80;
    return n;
  };
  AF.hasRoom = function (w, kind) {
    var i;
    for (i = 0; i < (w.rooms || []).length; i++) if (w.rooms[i].kind === kind) return w.rooms[i];
    return null;
  };
  AF.pickRoomKind = function (w) {
    var has = {}, i;
    for (i = 0; i < w.rooms.length; i++) has[w.rooms[i].kind] = true;
    if (!has.barracks) return 'barracks';
    if (!has.pantry) return 'pantry';
    if (!has.warmth) return 'warmth';
    var v = w.r();
    return v < 0.28 ? 'barracks' : v < 0.55 ? 'pantry' : v < 0.75 ? 'warmth' : 'side';
  };
  AF.roomTitle = function (kind) {
    return kind === 'queen' ? 'Queen chamber' : kind === 'brood' ? 'Brood chamber' : kind === 'store' ? 'Store'
      : kind === 'barracks' ? 'Barracks' : kind === 'pantry' ? 'Pantry' : kind === 'warmth' ? 'Warm chamber' : 'Side chamber';
  };
  AF.GOAL_LIST = [
    { id: 'brood', label: 'First brood' },
    { id: 'fifty', label: '50 ants' },
    { id: 'winter', label: 'Survive winter' }
  ];
  AF.goalsOf = function (w) { return w.goals || (w.goals = { brood: false, fifty: false, winter: false }); };
  function unlock(w, id) {
    var g = AF.goalsOf(w);
    if (g[id]) return;
    g[id] = true;
    (w.goalLog || (w.goalLog = [])).push({ id: id, t: w.t });
  }
  function checkGoals(w) {
    if (w.brood.length > 0 || (w.ants.length > 12)) unlock(w, 'brood');
    if (w.ants.length >= 50) unlock(w, 'fifty');
    if (w.t >= AF.YEAR) unlock(w, 'winter');
  }

  function stepPred(w, dt) {
    W = AF.W; S = AF.SURF;
    w.predT = (w.predT == null ? 30 + w.r() * 20 : w.predT) - dt;
    var day = AF.nightAmt(w) < 0.25, win = AF.winterAmt(w), i, a, p;
    if (!w.pred && w.predT <= 0) {
      w.predT = 55 + w.r() * 50;
      if (day && win < 0.55 && w.ants.length >= 16 && w.r() < 0.75) {
        var left = w.r() < 0.5;
        w.pred = { x: left ? -5 : W + 4, vx: left ? 7 : -7, y: S - 1.6, st: 'hunt', t: 0, fear: 0, ate: 0 };
        w.predSeen = (w.predSeen || 0) + 1;
      }
    }
    p = w.pred; if (!p) return;
    p.t += dt; p.x += p.vx * dt;
    var need = AF.hasRoom(w, 'barracks') ? 1 : 2;
    if (p.st === 'hunt' && (p.fear >= need || p.ate >= 1 || p.t > 16)) {
      p.st = 'flee'; p.vx = (p.x < W / 2 ? -14 : 14);
    }
    if (p.st === 'flee' && (p.x < -12 || p.x > W + 12)) { w.pred = null; return; }
    if (p.x < -14 || p.x > W + 14) { w.pred = null; return; }
    if (p.st !== 'hunt' || p.ate || p.t < 2.5 || w.ants.length <= 10) return;
    for (i = 0; i < w.ants.length; i++) {
      a = w.ants[i];
      if (a.cy === S - 1 && Math.abs(a.cx + 0.5 - p.x) < 1.5) {
        if (a.tip) a.tip.busy = false;
        w.ants.splice(i, 1);
        w.dead = (w.dead || 0) + 1; w.lost = (w.lost || 0) + 1;
        p.ate = 1; p.st = 'flee'; p.vx = p.vx >= 0 ? 12 : -12;
        return;
      }
    }
  }

  AF.tickLife = function (w, dt) {
    stepPred(w, dt);
    checkGoals(w);
  };
})();
