/* Pac-Man — fruit.js
 * Bonus fruit: appears below the ghost house twice per level, after PAC.levels.FRUIT_AT pellets have been
 * eaten (arcade 70 / 170, scaled to 43 / 105 here). It stays 9.33-10 s (random, as in the arcade) unless
 * Pac-Man eats it first; the kind and points depend on the level (levels.js).
 */
(function (PAC) {
  'use strict';
  const POS = { x: 9.5, y: 11.5 };   // tile (9, 11): the corridor just below the ghost house
  const fruit = { active: false, ticks: 0, x: POS.x, y: POS.y, kind: null, shown: 0 };

  /** New level / new life: no fruit on screen. newLevel also re-arms both appearances. */
  function reset(newLevel) {
    fruit.active = false; fruit.ticks = 0;
    if (newLevel) fruit.shown = 0;
  }

  /** Call after every pellet: spawn when the eaten count hits the next threshold. */
  function onPellet(eaten, kind) {
    const at = PAC.levels.FRUIT_AT;
    if (fruit.shown < at.length && eaten >= at[fruit.shown]) {
      fruit.shown++;
      fruit.active = true; fruit.kind = kind;
      fruit.ticks = Math.round((9.33 + Math.random() * 0.67) * 60);
    }
  }

  /** One tick: time out, or return the fruit's points if Pac-Man is on it (else 0). */
  function update(pac) {
    if (!fruit.active) return 0;
    if (Math.abs(pac.x - fruit.x) < 0.5 && Math.abs(pac.y - fruit.y) < 0.5) {
      fruit.active = false;
      return fruit.kind.points;
    }
    if (--fruit.ticks <= 0) fruit.active = false;
    return 0;
  }

  PAC.fruit = { fruit, reset, onPellet, update, POS };
})(window.PAC = window.PAC || {});
