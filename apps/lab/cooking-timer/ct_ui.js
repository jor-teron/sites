/* Cooking Timer — ct_ui.js: render presets/timers, event delegation, light tick updates. CT1 */
(function () {
  var CT = window.CT = window.CT || {};
  var T = CT.Timers;
  var els = {};
  var timers = [];
  var tickId = null;
  var lastRenderKey = '';

  function escapeHtml(str) {
    return String(str).replace(/[&<>'"]/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch];
    });
  }

  function now() {
    return Date.now();
  }

  function persist() {
    T.save(localStorage, timers);
  }

  function anyRunning() {
    for (var i = 0; i < timers.length; i++) {
      if (timers[i].running && !timers[i].finished) return true;
    }
    return false;
  }

  function anyFinished() {
    for (var i = 0; i < timers.length; i++) {
      if (timers[i].finished) return true;
    }
    return false;
  }

  function syncAlarm() {
    if (!CT.sound) return;
    if (anyFinished()) CT.sound.startAlarm();
    else CT.sound.stopAlarm();
  }

  function ensureTick() {
    if (anyRunning()) {
      if (!tickId) tickId = setInterval(onTick, 250);
    } else if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
  }

  function onTick() {
    var n = now();
    var newly = false;
    var structureChanged = false;
    for (var i = 0; i < timers.length; i++) {
      if (T.tickOne(timers[i], n)) newly = true;
    }
    if (newly) {
      structureChanged = true;
      persist();
      syncAlarm();
      renderTimers();
      ensureTick();
      return;
    }
    // Only update time text for running timers — no full re-render.
    for (var j = 0; j < timers.length; j++) {
      var t = timers[j];
      if (!t.running || t.finished) continue;
      var node = document.getElementById('ct-time-' + t.id);
      if (node) node.textContent = T.formatTime(T.remainingMs(t, n));
    }
    if (!structureChanged) persist();
    ensureTick();
  }

  function renderPresets() {
    var grid = els.presetsGrid;
    if (!grid) return;
    grid.innerHTML = CT.PRESETS.map(function (p, index) {
      var time =
        (p.minutes > 0 ? p.minutes + 'm' : '') +
        (p.minutes > 0 && p.seconds > 0 ? ' ' : '') +
        (p.seconds > 0 ? p.seconds + 's' : '');
      return (
        '<button type="button" class="preset-btn" data-action="preset" data-index="' + index + '">' +
          '<span class="preset-name">' + escapeHtml(p.name) + '</span>' +
          '<span class="preset-time">' + escapeHtml(time) + '</span>' +
        '</button>'
      );
    }).join('');
  }

  function renderTimers() {
    var list = els.activeList;
    if (!list) return;
    if (timers.length === 0) {
      list.innerHTML = '<p class="empty-state">No active timers. Start one above or pick a preset!</p>';
      lastRenderKey = 'empty';
      return;
    }
    var n = now();
    var key = timers.map(function (t) {
      return t.id + ':' + (t.finished ? 'f' : t.running ? 'r' : 'p');
    }).join('|');
    list.innerHTML = timers.map(function (t) {
      var rem = T.remainingMs(t, n);
      var actions;
      if (t.finished) {
        actions =
          '<button type="button" class="btn-action btn-danger" data-action="dismiss" data-id="' +
          escapeHtml(t.id) + '">Dismiss</button>';
      } else {
        actions =
          '<button type="button" class="btn-action" data-action="toggle" data-id="' +
          escapeHtml(t.id) + '">' + (t.running ? 'Pause' : 'Resume') + '</button>' +
          '<button type="button" class="btn-action btn-danger" data-action="cancel" data-id="' +
          escapeHtml(t.id) + '">Cancel</button>';
      }
      return (
        '<div class="timer-card' + (t.finished ? ' finished' : '') + '" id="timer-' + escapeHtml(t.id) + '">' +
          '<div class="timer-info">' +
            '<span class="timer-card-title">' + escapeHtml(t.label) + '</span>' +
            '<span class="timer-card-time" id="ct-time-' + escapeHtml(t.id) + '">' +
              T.formatTime(rem) +
            '</span>' +
          '</div>' +
          '<div class="timer-actions">' + actions + '</div>' +
        '</div>'
      );
    }).join('');
    lastRenderKey = key;
  }

  function addTimer(label, minutes, seconds) {
    var t = T.create(label, minutes, seconds, now());
    if (!t) return;
    timers.push(t);
    persist();
    renderTimers();
    ensureTick();
    if (CT.sound) CT.sound.resume();
  }

  function findTimer(id) {
    for (var i = 0; i < timers.length; i++) {
      if (timers[i].id === id) return timers[i];
    }
    return null;
  }

  function removeTimer(id) {
    timers = timers.filter(function (t) { return t.id !== id; });
    persist();
    syncAlarm();
    renderTimers();
    ensureTick();
  }

  function onAction(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (CT.sound) CT.sound.resume();

    if (action === 'preset') {
      var idx = Number(btn.getAttribute('data-index'));
      var p = CT.PRESETS[idx];
      if (p) addTimer(p.name, p.minutes, p.seconds);
      return;
    }

    var id = btn.getAttribute('data-id');
    var t = findTimer(id);
    if (!t) return;

    if (action === 'toggle') {
      if (t.finished) return;
      if (t.running) T.pause(t, now());
      else T.resume(t, now());
      persist();
      renderTimers();
      ensureTick();
      return;
    }
    if (action === 'cancel' || action === 'dismiss') {
      removeTimer(id);
    }
  }

  function onCustomSubmit(e) {
    e.preventDefault();
    var label = els.labelInput.value;
    var mins = els.minsInput.value;
    var secs = els.secsInput.value;
    addTimer(label, mins, secs);
    els.labelInput.value = 'Timer';
  }

  function init() {
    els.presetsGrid = document.getElementById('presets-grid');
    els.activeList = document.getElementById('active-timers-list');
    els.form = document.getElementById('custom-timer-form');
    els.labelInput = document.getElementById('timer-label');
    els.minsInput = document.getElementById('timer-mins');
    els.secsInput = document.getElementById('timer-secs');

    timers = T.load(localStorage, now());
    renderPresets();
    renderTimers();
    syncAlarm();
    ensureTick();

    document.addEventListener('click', onAction);
    if (els.form) els.form.addEventListener('submit', onCustomSubmit);
    // Resume audio context on first tap anywhere.
    document.addEventListener('pointerdown', function once() {
      if (CT.sound) CT.sound.resume();
    }, { passive: true });
  }

  CT.ui = {
    init: init,
    addTimer: addTimer,
    getTimers: function () { return timers; }
  };
})();
