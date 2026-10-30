// Aquarium AQQ1b: one shared behaviour state machine for every animal - swim, rest, sleep, eat, flee.
// Species tune it with data only: rest {chance, where: 'plant'|'sand'}, sleep {chance}, flee {speed}.
(function () {
  'use strict';
  var A = window.AQ, S = A.st, C = A.core, rnd = C.rng(13);
  var WORD = { swim: 'Swimming', rest: 'Resting', sleep: 'Sleeping', eat: 'Eating', flee: 'Startled' };
  var SLOW = { swim: 1, eat: 1, flee: 1, rest: .25, sleep: .12 };   // speed factor per state
  function asleep() { var n = 0; S.fish.forEach(function (f) { if (f.st === 'sleep') n++; }); return n; }
  function spot(f) {   // where to rest or sleep: by a plant/rock, or just above the sand; sleepers sink a little lower
    var b = A.sim.bounds(f), px = S.plantX || [], x = f.sp.rest.where === 'plant' && px.length ? px[rnd() * px.length | 0] + (rnd() - .5) * 40 * S.U : f.x + (rnd() - .5) * 120 * S.U;
    f.rx = C.clamp(x, b.x0 + 20, b.x1 - 20);
    f.ry = Math.max(b.y0, b.y1 - (f.st === 'sleep' ? rnd() * 20 : 20 + rnd() * 60) * S.U);
  }
  function step(f, dt, tg) {   // returns the speed factor for this frame
    var sp = f.sp, st = f.st || 'swim';
    if (f.fleeT > 0) { f.fleeT -= dt; st = 'flee'; }
    else if (tg) st = 'eat';   // hunger wakes resting and sleeping fish
    else if (st === 'eat' || st === 'flee') { st = 'swim'; f.stT = 2 + rnd() * 3; }
    else if ((f.stT = (f.stT || 0) - dt) <= 0) {
      var r = rnd();
      if (st !== 'swim') { st = 'swim'; f.stT = 4 + rnd() * 6; }
      else if (r < sp.sleep.chance && asleep() < S.fish.length / 3) { st = 'sleep'; f.stT = 6 + rnd() * 8; }
      else if (r < sp.sleep.chance + sp.rest.chance) { st = 'rest'; f.stT = 3 + rnd() * 4; }
      else f.stT = 2 + rnd() * 4;
      f.st = st; if (st !== 'swim') spot(f);
    }
    f.st = st; return SLOW[st];
  }
  function startle(x, y) {   // empty-water tap: nearby fish dart away for about a second
    var n = 0; S.fish.forEach(function (f) { if (Math.hypot(f.x - x, f.y - y) < 170 * S.U) { f.fleeT = .8 + rnd() * .4; f.fx = x; f.fy = y; f.st = 'flee'; n++; } }); return n;
  }
  A.behave = { step: step, startle: startle, word: function (f) { var v = f.sp.verb; return (!f.st || f.st === 'swim') && v ? (typeof v === 'function' ? v(f) : v) : WORD[f.st || 'swim']; } };
})();
