/* SP1 Sun Position — offline. Place (GPS, city list, lat/lon, saved), NOAA dial and times,
   date picker + time slider, IST or the place's own time zone. Auto theme follows the Hub. */
(function () {
  'use strict';
  var RELEASE = 'SP1';
  var KEY = 'sun-position-v1';
  var DEFAULT_PLACE = { id: 'diphu', name: 'Diphu', lat: 25.843, lon: 93.432, tz: 'Asia/Kolkata' };
  var $ = function (id) { return document.getElementById(id); };
  var Sp = window.SpCalc;
  var Cities = (window.SpCities && window.SpCities.list) || [];

  function load() {
    var s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    if (!s.theme) s.theme = 'auto';
    if (s.tzMode !== 'place') s.tzMode = 'ist';
    if (!Array.isArray(s.places)) s.places = [];
    if (!s.currentPlace) s.currentPlace = DEFAULT_PLACE;
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* full/blocked */ } }

  var st = load();
  var live = true;
  var liveTimer = null;
  var viewDate = null; /* {y,m,d} in the display time zone, or null = today */
  var viewMin = null;  /* minutes from local midnight, or null = now */
  var locBusy = false;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function deviceTz() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'; }
    catch (e) { return 'Asia/Kolkata'; }
  }
  function place() { return st.currentPlace || DEFAULT_PLACE; }
  function displayTz() {
    if (st.tzMode === 'ist') return 'Asia/Kolkata';
    return place().tz || deviceTz();
  }
  function tzLabel() {
    if (st.tzMode === 'ist') return 'IST';
    var tz = displayTz();
    if (tz === 'Asia/Kolkata') return 'IST';
    var off = Sp.offsetMinutesAt(new Date(), tz);
    var sign = off >= 0 ? '+' : '−';
    var a = Math.abs(off);
    var name = place().tz && place().tz !== 'Asia/Kolkata' ? String(place().tz).replace(/_/g, ' ') : 'local time';
    return name + ' (UTC' + sign + Math.floor(a / 60) + ':' + pad2(a % 60) + ')';
  }

  /* ---- theme ---- */
  function applyTheme() {
    var t = ''; try { t = localStorage.getItem('sites-hub.theme') || ''; } catch (e) { /* blocked */ }
    var dark = st.theme === 'dark' || (st.theme === 'auto' && (t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)));
    document.documentElement.classList.toggle('dark', !!dark);
  }
  window.addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') { applyTheme(); } });
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', applyTheme);
  }

  /* ---- dialogs (in-app only) ---- */
  function dialog(html, acts, onOpen) {
    $('dlgBody').innerHTML = html;
    var box = $('dlgActs'); box.innerHTML = '';
    acts.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ' + (a.cls || ''); b.textContent = a.label;
      b.onclick = function () { if (a.fn && a.fn() === false) return; close(); };
      box.appendChild(b);
    });
    $('dlg').hidden = false;
    if (onOpen) onOpen();
    function close() { $('dlg').hidden = true; }
    return close;
  }
  $('dlg').addEventListener('click', function (e) { if (e.target === $('dlg')) $('dlg').hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('dlg').hidden = true; });

  /* ---- dial (built once) ---- */
  var NS = 'http://www.w3.org/2000/svg';
  var R = 140;
  function el(tag, at, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in at) e.setAttribute(k, at[k]);
    parent.appendChild(e);
    return e;
  }
  function polar(az, elev) {
    var e = elev;
    if (e > 90) e = 90;
    if (e < 0) e = 0;
    var r = (1 - e / 90) * R;
    var a = az * Math.PI / 180;
    return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
  }
  function buildRose() {
    var rose = $('rose');
    while (rose.firstChild) rose.removeChild(rose.firstChild);
    el('circle', { r: 152, 'class': 'face' }, rose);
    el('circle', { r: R, 'class': 'horizon' }, rose);
    var d, a, r1, line, t, card;
    for (d = 0; d < 360; d += 10) {
      r1 = d % 90 === 0 ? 126 : 132;
      a = d * Math.PI / 180;
      line = el('line', {
        x1: (Math.sin(a) * r1).toFixed(2), y1: (-Math.cos(a) * r1).toFixed(2),
        x2: (Math.sin(a) * 146).toFixed(2), y2: (-Math.cos(a) * 146).toFixed(2),
        'class': 'tk' + (d % 90 === 0 ? ' m' : '')
      }, rose);
    }
    var labels = [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']];
    for (d = 0; d < labels.length; d++) {
      a = labels[d][0] * Math.PI / 180;
      t = el('text', { x: (Math.sin(a) * 114).toFixed(1), y: (-Math.cos(a) * 114).toFixed(1), 'class': 'lb' }, rose);
      t.textContent = labels[d][1];
    }
  }

  function arcPath(samples) {
    var d = '', i, s, p, started = false;
    for (i = 0; i < samples.length; i++) {
      s = samples[i];
      if (s.elevation < 0) {
        started = false;
        continue;
      }
      p = polar(s.azimuth, s.elevation);
      d += (started ? ' L' : 'M') + p.x.toFixed(1) + ' ' + p.y.toFixed(1);
      started = true;
    }
    return d;
  }

  /* ---- current instant / chosen wall time ---- */
  function civilNow() {
    return Sp.civilDateInTz(new Date(), displayTz());
  }
  function chosenCivil() {
    return viewDate || civilNow();
  }
  function chosenInstant() {
    var c = chosenCivil();
    if (live || viewMin == null) return new Date();
    var hh = Math.floor(viewMin / 60), mm = viewMin % 60;
    return new Date(Sp.wallToUtcMs(c.y, c.m, c.d, hh, mm, 0, displayTz()));
  }
  function localMinutesOf(date) {
    var tz = displayTz();
    var p;
    try {
      if (typeof tz === 'number' || Sp.parseOffsetString(tz) != null) {
        var off = typeof tz === 'number' ? tz : Sp.parseOffsetString(tz);
        var s = new Date(date.getTime() + off * 60000);
        return s.getUTCHours() * 60 + s.getUTCMinutes();
      }
      p = Sp.zonedParts(date, tz);
      return p.hourNum * 60 + (+p.minute);
    } catch (e) {
      return date.getHours() * 60 + date.getMinutes();
    }
  }
  function isoOf(c) { return c.y + '-' + pad2(c.m) + '-' + pad2(c.d); }

  function fmtClock(date) {
    return Sp.formatTime(date, displayTz(), false);
  }
  function fmtRange(a, b) {
    if (!a && !b) return '—';
    if (a && b) return fmtClock(a) + '–' + fmtClock(b);
    return fmtClock(a || b);
  }
  function fmtWhen(date) {
    var tz = displayTz();
    var c = Sp.civilDateInTz(date, tz);
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return c.d + ' ' + months[c.m - 1] + ' ' + c.y + ' · ' + fmtClock(date);
  }

  /* ---- render (only on change, or the live 15s tick) ---- */
  function render() {
    applyTheme();
    var pl = place();
    $('placeBtn').textContent = pl.name || 'Place';
    var instant = chosenInstant();
    var c = chosenCivil();
    var ev = Sp.dayEvents(pl.lat, pl.lon, c.y, c.m, c.d);
    var pos = Sp.position(pl.lat, pl.lon, instant);
    var up = pos.elevationApp >= 0;

    var sun = polar(pos.azimuth, Math.max(pos.elevationApp, 0));
    var g = $('sunG');
    g.setAttribute('transform', 'translate(' + sun.x.toFixed(1) + ',' + sun.y.toFixed(1) + ')');
    var sunC = g.querySelector('.sun');
    if (sunC) {
      if (up) sunC.classList.remove('down'); else sunC.classList.add('down');
    }
    $('arc').setAttribute('d', arcPath(Sp.dayPath(pl.lat, pl.lon, c.y, c.m, c.d, 8)));

    var az = Math.round(pos.azimuth);
    if (az === 360) az = 0;
    $('azOut').textContent = az + '° ' + Sp.cardinal(pos.azimuth);
    if (up) $('elOut').textContent = Math.round(pos.elevationApp) + '° up';
    else $('elOut').textContent = Math.round(Math.abs(pos.elevationApp)) + '° down';

    $('whenOut').textContent = fmtWhen(instant);
    if (ev.polar === 'day') {
      $('polarOut').hidden = false;
      $('polarOut').textContent = 'The sun does not set today at this place (polar day).';
    } else if (ev.polar === 'night') {
      $('polarOut').hidden = false;
      $('polarOut').textContent = 'The sun does not rise today at this place (polar night).';
    } else {
      $('polarOut').hidden = true;
    }

    var rows = [];
    function row(k, v) { rows.push({ k: k, v: v }); }
    if (ev.polar !== 'night') {
      if (ev.civilDawn) row('First light', fmtClock(ev.civilDawn));
      if (ev.sunrise) row('Sunrise', fmtClock(ev.sunrise));
      if (ev.goldenMorning.start || ev.goldenMorning.end) row('Morning golden hour', fmtRange(ev.goldenMorning.start, ev.goldenMorning.end));
      if (ev.solarNoon) row('Solar noon', fmtClock(ev.solarNoon));
      if (ev.goldenEvening.start || ev.goldenEvening.end) row('Evening golden hour', fmtRange(ev.goldenEvening.start, ev.goldenEvening.end));
      if (ev.sunset) row('Sunset', fmtClock(ev.sunset));
      if (ev.civilDusk) row('Last light', fmtClock(ev.civilDusk));
    }
    row('Day length', ev.polar === 'day' ? '24 hours' : ev.polar === 'night' ? 'No sunrise' : Sp.formatDayLength(ev.dayLengthMinutes));
    if (ev.blueMorning.start || ev.blueMorning.end) row('Morning blue hour', fmtRange(ev.blueMorning.start, ev.blueMorning.end));
    if (ev.blueEvening.start || ev.blueEvening.end) row('Evening blue hour', fmtRange(ev.blueEvening.start, ev.blueEvening.end));

    var html = '', i;
    for (i = 0; i < rows.length; i++) {
      html += '<li><span class="k">' + esc(rows[i].k) + '</span><span class="v">' + esc(rows[i].v) + '</span></li>';
    }
    $('times').innerHTML = html;

    $('dateIn').value = isoOf(c);
    var mins = (live || viewMin == null) ? localMinutesOf(instant) : viewMin;
    $('timeSl').value = String(mins);
    $('timeLab').textContent = pad2(Math.floor(mins / 60)) + ':' + pad2(mins % 60) + (live ? ' · live' : '');
    $('tzNote').textContent = 'Times in ' + tzLabel() + ' · Release ' + RELEASE;
  }

  function setLive(on) {
    live = !!on;
    if (live) {
      viewDate = null;
      viewMin = null;
      if (liveTimer) clearInterval(liveTimer);
      liveTimer = setInterval(function () { if (live) render(); }, 15000);
    } else if (liveTimer) {
      clearInterval(liveTimer);
      liveTimer = null;
    }
  }

  /* ---- place picker ---- */
  function setPlace(p, saved) {
    st.currentPlace = { id: p.id, name: p.name, lat: p.lat, lon: p.lon, tz: p.tz };
    if (saved) {
      var found = false, i;
      for (i = 0; i < st.places.length; i++) if (st.places[i].id === p.id) { st.places[i] = st.currentPlace; found = true; break; }
      if (!found) st.places.push(st.currentPlace);
    }
    save();
    render();
  }

  function openPlace() {
    var html =
      '<h2 style="margin-top:0">Place</h2>' +
      '<button type="button" class="btn lg" id="useGps">Use my location</button>' +
      '<p class="err" id="gpsErr"></p>' +
      '<label for="cityQ">Search cities</label>' +
      '<input id="cityQ" class="field" type="search" placeholder="Type a city" autocomplete="off">' +
      '<ul id="cityList"></ul>' +
      (st.places.length ? '<h2>Saved here</h2><ul id="savedList"></ul>' : '') +
      '<button type="button" class="btn ghost lg" id="enterLl">Enter coordinates</button>';
    var close = dialog(html, [{ label: 'Close', cls: 'ghost' }], function () {
      $('cityQ').focus();
      fillCities('');
      fillSaved();
      $('useGps').onclick = function (e) { e.preventDefault(); useGps($('gpsErr')); };
      $('enterLl').onclick = function (e) { e.preventDefault(); close(); openLatLon(); };
      $('cityQ').oninput = function () { fillCities($('cityQ').value); };
    });

    function fillCities(q) {
      q = (q || '').trim().toLowerCase();
      var list = $('cityList');
      if (!list) return;
      var out = '', n = 0, i, c, label;
      for (i = 0; i < Cities.length && n < 30; i++) {
        c = Cities[i];
        label = c[0] + ', ' + c[1];
        if (q && label.toLowerCase().indexOf(q) < 0) continue;
        out += '<li><button type="button" data-i="' + i + '">' + esc(label) + '</button></li>';
        n++;
      }
      if (!q) out = '<li><button type="button" disabled class="ghost" style="cursor:default;opacity:.7">Type to search ' + Cities.length + ' cities</button></li>' + out;
      list.innerHTML = out || '<li class="note">No matching city.</li>';
      list.onclick = function (e) {
        var b = e.target.closest ? e.target.closest('button[data-i]') : null;
        if (!b) return;
        var x = Cities[+b.getAttribute('data-i')];
        setPlace({ id: 'c-' + x[0] + '-' + x[2], name: x[0], lat: x[2], lon: x[3], tz: x[4] }, false);
        close();
      };
    }
    function fillSaved() {
      var list = $('savedList');
      if (!list) return;
      var out = '', i, p;
      for (i = 0; i < st.places.length; i++) {
        p = st.places[i];
        out += '<li><button type="button" class="who" data-id="' + esc(p.id) + '">' + esc(p.name) + '</button>' +
          '<button type="button" class="mini" data-del="' + esc(p.id) + '">Remove</button></li>';
      }
      list.innerHTML = out;
      list.onclick = function (e) {
        var t = e.target;
        if (t.getAttribute && t.getAttribute('data-del')) {
          var id = t.getAttribute('data-del');
          st.places = st.places.filter(function (x) { return x.id !== id; });
          save();
          fillSaved();
          return;
        }
        if (t.getAttribute && t.getAttribute('data-id')) {
          var id2 = t.getAttribute('data-id');
          var found = null;
          st.places.forEach(function (x) { if (x.id === id2) found = x; });
          if (found) { setPlace(found, false); close(); }
        }
      };
    }
  }

  function useGps(errEl) {
    if (!navigator.geolocation) {
      if (errEl) errEl.textContent = 'This browser cannot read a location.';
      return;
    }
    if (locBusy) return;
    locBusy = true;
    if (errEl) errEl.textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      locBusy = false;
      var lat = pos.coords.latitude, lon = pos.coords.longitude;
      var nearest = nearestCity(lat, lon);
      var name = 'My location';
      if (nearest && nearest.km < 40) name = 'Near ' + nearest.c[0];
      setPlace({ id: 'gps', name: name, lat: round4(lat), lon: round4(lon), tz: deviceTz() }, true);
      $('dlg').hidden = true;
    }, function (err) {
      locBusy = false;
      if (errEl) errEl.textContent = err && err.message ? err.message : 'Could not get a location.';
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 });
  }

  function nearestCity(lat, lon) {
    var best = null, i, c, d;
    for (i = 0; i < Cities.length; i++) {
      c = Cities[i];
      d = distKm(lat, lon, c[2], c[3]);
      if (!best || d < best.km) best = { c: c, km: d };
    }
    return best;
  }
  function distKm(a, b, c, d) {
    var p = Math.PI / 180;
    var hav = Math.sin((c - a) * p / 2);
    var hav2 = Math.sin((d - b) * p / 2);
    var h = hav * hav + Math.cos(a * p) * Math.cos(c * p) * hav2 * hav2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function round4(n) { return Math.round(n * 10000) / 10000; }

  function openLatLon() {
    var pl = place();
    dialog(
      '<h2 style="margin-top:0">Coordinates</h2>' +
      '<label for="fName">Name</label><input id="fName" class="field" maxlength="60" value="' + esc(pl.name === 'My location' ? '' : pl.name) + '" placeholder="e.g. Home">' +
      '<div class="row"><div><label for="fLat">Latitude</label><input id="fLat" class="field" inputmode="decimal" placeholder="25.84" value="' + esc(String(pl.lat)) + '"></div>' +
      '<div><label for="fLon">Longitude</label><input id="fLon" class="field" inputmode="decimal" placeholder="93.43" value="' + esc(String(pl.lon)) + '"></div></div>' +
      '<label for="fTz">Time zone for this place</label>' +
      '<select id="fTz" class="field">' + tzOptions(pl.tz) + '</select>' +
      '<div class="err" id="fErr"></div>',
      [
        { label: 'Cancel', cls: 'ghost' },
        { label: 'Save', fn: function () {
          var name = $('fName').value.trim() || 'Custom place';
          var lat = parseFloat($('fLat').value);
          var lon = parseFloat($('fLon').value);
          if (!isFinite(lat) || lat < -90 || lat > 90) { $('fErr').textContent = 'Latitude must be between -90 and 90.'; return false; }
          if (!isFinite(lon) || lon < -180 || lon > 180) { $('fErr').textContent = 'Longitude must be between -180 and 180.'; return false; }
          var tz = $('fTz').value || deviceTz();
          setPlace({ id: 'custom-' + Date.now().toString(36), name: name, lat: round4(lat), lon: round4(lon), tz: tz }, true);
        } }
      ],
      function () { $('fLat').focus(); }
    );
  }

  function tzOptions(selected) {
    var opts = [
      ['Asia/Kolkata', 'IST (India)'],
      ['device', 'This device\'s time zone']
    ];
    var extra = ['Europe/London', 'Europe/Oslo', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'UTC'];
    var i, v, lab, sel, out = '', dev = deviceTz();
    var seen = { 'Asia/Kolkata': 1 };
    for (i = 0; i < extra.length; i++) {
      if (!seen[extra[i]]) { opts.push([extra[i], extra[i].replace(/_/g, ' ')]); seen[extra[i]] = 1; }
    }
    if (selected && selected !== 'device' && !seen[selected] && selected !== dev) opts.push([selected, selected.replace(/_/g, ' ')]);
    for (i = 0; i < opts.length; i++) {
      v = opts[i][0] === 'device' ? dev : opts[i][0];
      lab = opts[i][1];
      if (opts[i][0] === 'device') lab += ' (' + dev.replace(/_/g, ' ') + ')';
      sel = (selected === v || (opts[i][0] === 'device' && selected === dev)) ? ' selected' : '';
      out += '<option value="' + esc(v) + '"' + sel + '>' + esc(lab) + '</option>';
    }
    return out;
  }

  function openSettings() {
    dialog(
      '<h2 style="margin-top:0">Theme</h2>' +
      '<div class="seg" id="themeSeg"><button type="button" data-v="auto">Auto</button><button type="button" data-v="light">Light</button><button type="button" data-v="dark">Dark</button></div>' +
      '<h2>Times</h2>' +
      '<div class="seg" id="tzSeg"><button type="button" data-v="ist">IST</button><button type="button" data-v="place">This place</button></div>' +
      '<p class="note">IST is India Standard Time, used everywhere in India. “This place” uses the time zone of the city or the zone you picked for a custom place (or this device, for GPS).</p>' +
      '<p class="note small">Release ' + RELEASE + ' · Works fully offline.</p>',
      [{ label: 'Done', cls: 'ghost' }],
      function () {
        markSeg($('themeSeg'), st.theme);
        markSeg($('tzSeg'), st.tzMode);
        $('themeSeg').onclick = function (e) {
          var v = e.target.getAttribute && e.target.getAttribute('data-v');
          if (!v) return;
          st.theme = v; save(); applyTheme(); markSeg($('themeSeg'), st.theme); render();
        };
        $('tzSeg').onclick = function (e) {
          var v = e.target.getAttribute && e.target.getAttribute('data-v');
          if (!v) return;
          st.tzMode = v; save(); markSeg($('tzSeg'), st.tzMode); render();
        };
      }
    );
  }
  function markSeg(el, v) {
    var b = el.querySelectorAll('button'), i;
    for (i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].getAttribute('data-v') === v);
  }

  /* ---- events ---- */
  $('placeBtn').onclick = openPlace;
  $('setBtn').onclick = openSettings;
  $('nowBtn').onclick = function () { setLive(true); render(); };
  $('dateIn').onchange = function () {
    var v = $('dateIn').value;
    var p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!p) return;
    viewDate = { y: +p[1], m: +p[2], d: +p[3] };
    var today = civilNow();
    if (viewDate.y === today.y && viewDate.m === today.m && viewDate.d === today.d && live) {
      /* still live on today */
    } else {
      if (viewMin == null) viewMin = localMinutesOf(new Date());
      setLive(false);
    }
    render();
  };
  $('timeSl').oninput = function () {
    viewMin = parseInt($('timeSl').value, 10);
    if (viewDate == null) viewDate = civilNow();
    setLive(false);
    render();
  };

  /* first visit: a short place prompt, default remains Diphu so it works offline at once */
  function firstVisit() {
    if (st.askedPlace) return;
    st.askedPlace = true; save();
    dialog(
      '<h2 style="margin-top:0">Where should we show the sun?</h2>' +
      '<p class="note">It starts with Diphu. You can use this device\'s location or pick a city. Everything stays on this device and works offline.</p>' +
      '<p class="err" id="gpsErr"></p>',
      [
        { label: 'Use my location', fn: function () { useGps($('gpsErr')); return false; } },
        { label: 'Choose a city', cls: 'ghost', fn: function () { openPlace(); return false; } },
        { label: 'Keep Diphu', cls: 'ghost' }
      ]
    );
  }

  buildRose();
  applyTheme();
  setLive(true);
  render();
  firstVisit();
})();
