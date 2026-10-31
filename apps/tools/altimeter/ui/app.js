/* Altimeter AL1 — UI + Geolocation watch.
   Shows GPS altitude in metres and feet. Accuracy shown when available. */
(function () {
  'use strict';

  var watchId = null;
  var unit = 'm';

  function render() {
    document.getElementById('app').innerHTML =
      '<div class="al-wrap">' +
        '<h1 class="al-title">⛰️ Altimeter</h1>' +
        '<div class="al-display">' +
          '<div class="al-value" id="al-value">—</div>' +
          '<div class="al-unit" id="al-unit">metres</div>' +
          '<div class="al-acc" id="al-acc"></div>' +
        '</div>' +
        '<div class="al-status" id="al-status">Tap Start and allow location</div>' +
        '<button type="button" class="al-btn" id="al-start">Start Altimeter</button>' +
        '<button type="button" class="al-btn stop" id="al-unit-btn" style="margin-top:10px">Show feet</button>' +
        '<p class="al-note">Uses GPS altitude. Accuracy is usually ±10–30 m and works best outdoors with a clear sky. Not a certified aviation altimeter.</p>' +
      '</div>';

    document.getElementById('al-start').addEventListener('click', toggle);
    document.getElementById('al-unit-btn').addEventListener('click', toggleUnit);
  }

  function toggleUnit() {
    unit = unit === 'm' ? 'ft' : 'm';
    var btn = document.getElementById('al-unit-btn');
    var unitEl = document.getElementById('al-unit');
    if (btn) btn.textContent = unit === 'm' ? 'Show feet' : 'Show metres';
    if (unitEl) unitEl.textContent = unit === 'm' ? 'metres' : 'feet';
  }

  function update(pos) {
    var alt = pos.coords.altitude;
    var acc = pos.coords.altitudeAccuracy;
    var valEl = document.getElementById('al-value');
    var accEl = document.getElementById('al-acc');
    var status = document.getElementById('al-status');

    if (alt == null) {
      if (valEl) valEl.textContent = '—';
      if (status) status.textContent = 'No altitude data from this device';
      return;
    }

    var display = unit === 'm' ? AL.format(alt) : AL.feet(alt);
    if (valEl) valEl.textContent = display;
    if (accEl) {
      if (acc != null && !isNaN(acc)) {
        var accDisp = unit === 'm' ? Math.round(acc) + ' m' : Math.round(acc * 3.28084) + ' ft';
        accEl.textContent = '±' + accDisp;
      } else {
        accEl.textContent = '';
      }
    }
    if (status) status.textContent = 'Live GPS altitude';
  }

  function error(err) {
    var status = document.getElementById('al-status');
    if (!status) return;
    if (err.code === 1) status.textContent = 'Permission denied';
    else if (err.code === 2) status.textContent = 'Position unavailable';
    else if (err.code === 3) status.textContent = 'Timed out';
    else status.textContent = 'Location error';
  }

  function toggle() {
    var btn = document.getElementById('al-start');
    var status = document.getElementById('al-status');

    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      if (btn) { btn.textContent = 'Start Altimeter'; btn.classList.remove('stop'); }
      if (status) status.textContent = 'Stopped';
      return;
    }

    if (!navigator.geolocation) {
      if (status) status.textContent = 'Geolocation not supported';
      return;
    }

    watchId = navigator.geolocation.watchPosition(update, error, {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 10000
    });

    if (btn) { btn.textContent = 'Stop'; btn.classList.add('stop'); }
    if (status) status.textContent = 'Waiting for GPS…';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
