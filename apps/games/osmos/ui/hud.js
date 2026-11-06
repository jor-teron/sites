/* ============================================================
 * File:        ui/hud.js
 * Project:     Osmos OSM1b
 * Purpose:     Mass readout, pause/restart, level picker overlays.
 * Depends on:  OSMOS_GAME, OSMOS_CONFIG
 * ============================================================ */
var OSMOS_HUD = (function () {
  var els = {};

  function bind(root) {
    els.mass = root.querySelector('#mass');
    els.target = root.querySelector('#target');
    els.level = root.querySelector('#level');
    els.overlay = root.querySelector('#overlay');
    els.panel = root.querySelector('#panel');
    els.title = root.querySelector('#panel-title');
    els.msg = root.querySelector('#panel-msg');
    els.levels = root.querySelector('#levels');
    els.hint = root.querySelector('#hint');
    root.querySelector('#btn-pause').addEventListener('click', function () {
      OSMOS_GAME.togglePause();
      refresh();
    });
    root.querySelector('#btn-restart').addEventListener('click', function () {
      var s = OSMOS_GAME.get();
      OSMOS_GAME.start(s ? s.level.index : 0);
      hideOverlay();
    });
    root.querySelector('#btn-levels').addEventListener('click', function () {
      showLevels();
    });
    root.querySelector('#btn-resume').addEventListener('click', function () {
      var s = OSMOS_GAME.get();
      if (s && s.status === 'pause') OSMOS_GAME.togglePause();
      hideOverlay();
    });
    root.querySelector('#btn-next').addEventListener('click', function () {
      var s = OSMOS_GAME.get();
      var n = s ? s.level.index + 1 : 0;
      if (n >= OSMOS_CONFIG.levels) n = 0;
      OSMOS_GAME.start(n);
      hideOverlay();
    });
    root.querySelector('#btn-replay').addEventListener('click', function () {
      var s = OSMOS_GAME.get();
      OSMOS_GAME.start(s ? s.level.index : 0);
      hideOverlay();
    });
  }

  function refresh() {
    var s = OSMOS_GAME.get();
    if (!s) return;
    els.mass.textContent = 'Mass ' + Math.round(s.player.mass);
    els.target.textContent = 'Goal ' + s.level.targetMass;
    els.level.textContent = 'Lv ' + s.level.label;
    if (s.status === 'win') showEnd(true);
    else if (s.status === 'lose') showEnd(false);
    else if (s.status === 'pause') showPause();
  }

  function showEnd(win) {
    els.overlay.classList.add('show');
    els.title.textContent = win ? 'Level clear' : 'Drifted too thin';
    els.msg.textContent = win
      ? 'You reached the target mass. Soft light, soft win.'
      : 'Mass fell too low. Try again — the field is forgiving.';
    document.getElementById('btn-next').style.display = win ? '' : 'none';
    document.getElementById('btn-resume').style.display = 'none';
    document.getElementById('end-actions').style.display = '';
    els.levels.parentElement.style.display = 'none';
  }

  function showPause() {
    els.overlay.classList.add('show');
    els.title.textContent = 'Paused';
    els.msg.textContent = 'Tap or drag to drift. Absorb smaller glows.';
    document.getElementById('btn-next').style.display = 'none';
    document.getElementById('btn-resume').style.display = '';
    document.getElementById('end-actions').style.display = '';
    els.levels.parentElement.style.display = 'none';
  }

  function showLevels() {
    var s = OSMOS_GAME.get();
    var unlocked = OSMOS_GAME.unlockCount();
    els.overlay.classList.add('show');
    els.title.textContent = 'Levels';
    els.msg.textContent = 'Unlocked through ' + String(Math.min(unlocked, OSMOS_CONFIG.levels) - 1).padStart(2, '0');
    document.getElementById('end-actions').style.display = 'none';
    els.levels.parentElement.style.display = '';
    els.levels.innerHTML = '';
    for (var i = 0; i < OSMOS_CONFIG.levels; i++) {
      var b = document.createElement('button');
      var label = (i < 10 ? '0' : '') + i;
      b.textContent = label;
      if (i >= unlocked) { b.className = 'locked'; b.disabled = true; }
      if (s && s.level.index === i) b.classList.add('current');
      (function (idx) {
        b.addEventListener('click', function () {
          OSMOS_GAME.start(idx);
          hideOverlay();
        });
      })(i);
      els.levels.appendChild(b);
    }
  }

  function hideOverlay() {
    els.overlay.classList.remove('show');
  }

  function hideHintSoon() {
    setTimeout(function () {
      if (els.hint) els.hint.style.opacity = '0';
    }, 5000);
  }

  return { bind: bind, refresh: refresh, hideOverlay: hideOverlay, hideHintSoon: hideHintSoon };
})();
