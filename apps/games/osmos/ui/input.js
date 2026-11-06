/* ============================================================
 * File:        ui/input.js
 * Project:     Osmos OSM1a
 * Purpose:     Mouse / touch aim → eject thrust.
 * Depends on:  OSMOS_GAME, OSMOS_RENDER
 * ============================================================ */
var OSMOS_INPUT = (function () {
  var canvas, view, holding = false, lx = 0, ly = 0, acc = 0;

  function bind(c, v) {
    canvas = c; view = v;
    c.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    c.addEventListener('touchstart', tDown, { passive: false });
    c.addEventListener('touchmove', tMove, { passive: false });
    c.addEventListener('touchend', up, { passive: false });
    c.addEventListener('touchcancel', up, { passive: false });
  }

  function pos(e) {
    var r = canvas.getBoundingClientRect();
    var x = (e.clientX - r.left) * (canvas.width / r.width);
    var y = (e.clientY - r.top) * (canvas.height / r.height);
    return OSMOS_RENDER.worldFromScreen(view, x, y);
  }

  function down(e) {
    holding = true; acc = 0;
    var p = pos(e); lx = p.x; ly = p.y;
    OSMOS_GAME.aim(lx, ly, true);
  }
  function move(e) {
    if (!holding) return;
    var p = pos(e); lx = p.x; ly = p.y;
  }
  function up() { holding = false; }

  function tDown(e) {
    e.preventDefault();
    if (!e.touches.length) return;
    holding = true; acc = 0;
    var p = pos(e.touches[0]); lx = p.x; ly = p.y;
    OSMOS_GAME.aim(lx, ly, true);
  }
  function tMove(e) {
    e.preventDefault();
    if (!holding || !e.touches.length) return;
    var p = pos(e.touches[0]); lx = p.x; ly = p.y;
  }

  function tick(dt) {
    if (!holding) return;
    acc += dt;
    if (acc >= 0.09) {
      acc = 0;
      OSMOS_GAME.aim(lx, ly, false);
    }
  }

  return { bind: bind, tick: tick };
})();
