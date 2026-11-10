/* One versioned key: unlocks and the complete fixed-step simulation. */
(function (G) {
  'use strict';
  G.STORE_KEY = 'garden-guard.save';
  G.load = function () {
    try {
      const r = JSON.parse(localStorage.getItem(G.STORE_KEY));
      if (r && r.version === 1) return {
        unlocked:Math.max(1,Math.min(5,Number.isInteger(r.unlocked) ? r.unlocked : 1)),
        game:G.Engine.restore(r.game)
      };
    } catch (_) { /* Storage blocked / invalid JSON: keep playing locally. */ }
    return { unlocked:1, game:null };
  };
  G.save = function (game,unlocked) {
    try { localStorage.setItem(G.STORE_KEY,JSON.stringify({version:1,unlocked,game:game.snapshot()})); return true; }
    catch (_) { return false; }
  };
})(window.GardenGuard);
