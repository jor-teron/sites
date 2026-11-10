/* SP3 Sun Position — offline. SP2 plan tools, plus point-at-the-sun (device heading and tilt,
   WMM true north), moon position/phase/rise, and in-app or Notification alerts. */
(function () {
  'use strict';
  var RELEASE = 'SP3';
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
    if (!(s.shadowH > 0)) s.shadowH = 1.8;
    if (s.alerts !== true) s.alerts = false;
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* full/blocked */ } }

  var st = load();
  var live = true;
  var liveTimer = null;
  var viewDate = null; /* {y,m,d} in the display time zone, or null = today */
  var viewMin = null;  /* minutes from local midnight, or null = now */
  var locBusy = false;
  var tab = 'now';
  var yearCache = null;
  var panelCache = null;

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

    /* Shadow bearing on the dial (ground direction, opposite the sun). */
    var sh = up ? Sp.shadow(st.shadowH || 0, pos.elevationApp) : null;
    var sg = $('shadowG');
    if (sg) {
      if (sh && st.shadowH > 0) {
        var shAz = Sp.shadowAzimuth(pos.azimuth);
        var a = shAz * Math.PI / 180;
        var len = R + 6;
        var x2 = Math.sin(a) * len, y2 = -Math.cos(a) * len;
        $('shadowLine').setAttribute('x2', x2.toFixed(1));
        $('shadowLine').setAttribute('y2', y2.toFixed(1));
        var hx = Math.sin(a) * (len + 9), hy = -Math.cos(a) * (len + 9);
        var lx = Math.sin(a - 0.18) * (len - 1), ly = -Math.cos(a - 0.18) * (len - 1);
        var rx = Math.sin(a + 0.18) * (len - 1), ry = -Math.cos(a + 0.18) * (len - 1);
        $('shadowHead').setAttribute('d', 'M' + hx.toFixed(1) + ' ' + hy.toFixed(1) + ' L' + lx.toFixed(1) + ' ' + ly.toFixed(1) + ' L' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ' Z');
        sg.removeAttribute('hidden');
      } else {
        sg.setAttribute('hidden', '');
      }
    }

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
    renderPlan(pos, sh, instant);
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


  /* ---- Plan tab (shadow, year, sun path, PNG) ---- */
  function planKey() {
    var pl = place(), c = chosenCivil();
    return pl.lat + ',' + pl.lon + ',' + c.y + ',' + displayTz();
  }
  function planData() {
    var k = planKey();
    if (yearCache && yearCache.k === k) return yearCache;
    var pl = place(), year = chosenCivil().y, tz = displayTz();
    var series = Sp.yearDaylight(pl.lat, pl.lon, year, tz);
    yearCache = {
      k: k,
      series: series,
      marks: Sp.solsticesEquinoxes(series),
      path: Sp.sunPathDiagram(pl.lat, pl.lon, year, tz)
    };
    return yearCache;
  }
  function fmtShort(day) {
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    if (!day) return '—';
    return day.d + ' ' + months[day.m - 1];
  }
  function fmtLen(day) {
    if (!day) return '—';
    if (day.polar === 'day') return '24 hours';
    if (day.polar === 'night') return 'no sunrise';
    return Sp.formatDayLength(day.dayLengthMinutes);
  }

  function renderShadowText(pos, sh) {
    var el = $('shadowOut');
    if (!el) return;
    var h = st.shadowH;
    if (!(h > 0)) { el.textContent = 'Enter a height to see the shadow.'; return; }
    if (!sh) { el.textContent = 'The sun is down, so there is no shadow.'; return; }
    var dir = Sp.shadowAzimuth(pos.azimuth);
    var az = Math.round(dir); if (az === 360) az = 0;
    var len = sh.length;
    var lenTxt = len >= 10 ? len.toFixed(1) : (len >= 1 ? len.toFixed(2) : len.toFixed(3));
    el.textContent = 'Shadow ' + lenTxt + ' m long, towards ' + az + '° ' + Sp.cardinal(dir) + ' (' + sh.ratio.toFixed(2) + ' × the height).';
  }

  function drawYearChart() {
    var svg = $('yearSvg');
    if (!svg) return;
    var data = planData(), series = data.series, marks = data.marks;
    var padL = 28, padR = 8, padT = 14, padB = 22;
    var W = 360, H = 230, pw = W - padL - padR, ph = H - padT - padB;
    function xOf(doy, n) { return padL + ((doy - 1) / (n - 1)) * pw; }
    function yOf(min) { return padT + (min / 1440) * ph; }
    var n = series.length, i, d, risePts = [], setPts = [], bandParts = [], runR = [], runS = [];
    function flushRun() {
      var j, pth;
      if (!runR.length) return;
      pth = 'M' + runR[0][0].toFixed(1) + ' ' + runR[0][1].toFixed(1);
      for (j = 1; j < runR.length; j++) pth += ' L' + runR[j][0].toFixed(1) + ' ' + runR[j][1].toFixed(1);
      for (j = runS.length - 1; j >= 0; j--) pth += ' L' + runS[j][0].toFixed(1) + ' ' + runS[j][1].toFixed(1);
      pth += ' Z';
      bandParts.push(pth);
      runR = []; runS = [];
    }
    for (i = 0; i < n; i++) {
      d = series[i];
      var x = xOf(d.doy, n);
      var y0, y1;
      if (d.polar === 'day') { y0 = yOf(0); y1 = yOf(1440); }
      else if (d.polar === 'night' || d.sunriseMin == null || d.sunsetMin == null) { flushRun(); continue; }
      else {
        y0 = yOf(d.sunriseMin);
        y1 = yOf(d.sunsetMin > 1440 ? 1440 : d.sunsetMin);
        if (y1 < y0) y1 = yOf(1440);
      }
      risePts.push([x, y0]);
      setPts.push([x, y1]);
      runR.push([x, y0]);
      runS.push([x, y1]);
    }
    flushRun();
    var band = bandParts.join(' ');
    function poly(pts) {
      var s = '', j, gap = true;
      for (j = 0; j < pts.length; j++) {
        if (j && pts[j][0] - pts[j - 1][0] > (pw / (n - 1)) * 1.8) gap = true;
        s += (gap ? 'M' : ' L') + pts[j][0].toFixed(1) + ' ' + pts[j][1].toFixed(1);
        gap = false;
      }
      return s;
    }
    var hours = [0, 6, 12, 18, 24], ht = '', hi, y;
    for (hi = 0; hi < hours.length; hi++) {
      y = yOf(hours[hi] * 60);
      ht += '<line class="axis" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '"></line>';
      ht += '<text class="lbl" x="2" y="' + (y + 3).toFixed(1) + '">' + pad2(hours[hi] === 24 ? 0 : hours[hi]) + ':00</text>';
    }
    var months = ['J','F','M','A','M','J','J','A','S','O','N','D'], mi, md;
    for (mi = 0; mi < 12; mi++) {
      md = series.filter(function (s) { return s.m === mi + 1; })[0];
      if (!md) continue;
      ht += '<text class="lbl" text-anchor="middle" x="' + xOf(md.doy, n).toFixed(1) + '" y="' + (H - 6) + '">' + months[mi] + '</text>';
    }
    function mark(day, lab) {
      if (!day) return '';
      var x = xOf(day.doy, n);
      return '<line class="mark" x1="' + x.toFixed(1) + '" y1="' + padT + '" x2="' + x.toFixed(1) + '" y2="' + (H - padB) + '"></line>' +
        '<text class="marklab" x="' + x.toFixed(1) + '" y="' + (padT - 2) + '">' + lab + '</text>';
    }
    var marksHtml = mark(marks.march, 'Equinox') + mark(marks.june, 'Solstice') + mark(marks.september, 'Equinox') + mark(marks.december, 'Solstice');
    svg.innerHTML = '<rect x="0" y="0" width="360" height="230" fill="none"></rect>' + ht +
      '<path class="band" d="' + band + '"></path>' +
      '<path class="rise" d="' + poly(risePts) + '"></path>' +
      '<path class="set" d="' + poly(setPts) + '"></path>' + marksHtml;
    var cap = $('yearCap');
    if (cap) {
      cap.textContent = chosenCivil().y + ': longest day ' + fmtShort(marks.longest) + ' (' + fmtLen(marks.longest) +
        '), shortest ' + fmtShort(marks.shortest) + ' (' + fmtLen(marks.shortest) + ').';
    }
  }

  function drawSunPath() {
    var svg = $('pathSvg');
    if (!svg) return;
    var data = planData().path;
    var NS = 'http://www.w3.org/2000/svg';
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    function add(tag, at, text) {
      var e = document.createElementNS(NS, tag);
      for (var k in at) e.setAttribute(k, at[k]);
      if (text) e.textContent = text;
      svg.appendChild(e);
      return e;
    }
    add('circle', { r: 152, 'class': 'face' });
    add('circle', { r: String(R), 'class': 'horizon' });
    var labs = [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']], i, a;
    for (i = 0; i < labs.length; i++) {
      a = labs[i][0] * Math.PI / 180;
      add('text', { x: (Math.sin(a) * 114).toFixed(1), y: (-Math.cos(a) * 114).toFixed(1), 'class': 'lb' }, labs[i][1]);
    }
    function pathOf(points) {
      var d = '', j, p, pt, started = false;
      for (j = 0; j < points.length; j++) {
        p = points[j];
        if (p.elevation < 0) { started = false; continue; }
        pt = polar(p.azimuth, p.elevation);
        d += (started ? ' L' : 'M') + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1);
        started = true;
      }
      return d;
    }
    var m, d, cls;
    for (m = 0; m < data.months.length; m++) {
      d = pathOf(data.months[m].points);
      if (!d) continue;
      cls = (data.months[m].month >= 11 || data.months[m].month <= 2) ? 'month win' : 'month';
      add('path', { d: d, 'class': cls });
    }
    var hour, pts, last, lbl, hp;
    for (hour = 6; hour <= 18; hour++) {
      pts = data.hours[hour] || [];
      d = pathOf(pts);
      if (d) add('path', { d: d, 'class': 'hour' });
      /* label at the last above-horizon point */
      last = null;
      for (i = 0; i < pts.length; i++) if (pts[i].elevation >= 0) last = pts[i];
      if (last) {
        hp = polar(last.azimuth, Math.max(last.elevation, 2));
        add('text', { x: hp.x.toFixed(1), y: (hp.y - 4).toFixed(1), 'class': 'hlbl' }, String(hour));
      }
    }
  }

  function renderPanel() {
    var el = $('panelOut');
    if (!el) return;
    var pl = place(), year = chosenCivil().y;
    var k = pl.lat + ',' + pl.lon + ',' + year;
    var res;
    if (panelCache && panelCache.k === k) res = panelCache.res;
    else {
      res = Sp.bestPanel(pl.lat, pl.lon, year);
      panelCache = { k: k, res: res };
    }
    var face = res.facing === 'south' ? 'south' : 'north';
    el.textContent = 'Best fixed solar panel for ' + year + ': tilt ' + res.tilt + '° from the ground, facing ' +
      face + ' (' + Math.round(res.azimuth) + '°). This is a clear-sky geometric estimate, not a weather model.';
  }

  var planDrawnKey = null;
  function renderPlan(pos, sh, instant) {
    renderShadowText(pos, sh);
    if (!$('shadowH').matches || document.activeElement !== $('shadowH')) {
      if ($('shadowH') && String($('shadowH').value) !== String(st.shadowH)) $('shadowH').value = st.shadowH;
    }
    if (tab !== 'plan') return;
    var k = planKey();
    if (planDrawnKey !== k) {
      drawYearChart();
      drawSunPath();
      renderPanel();
      planDrawnKey = k;
    }
  }

  function setTab(v) {
    tab = (v === 'plan' || v === 'point') ? v : 'now';
    $('pane-now').classList.toggle('on', tab === 'now');
    $('pane-plan').classList.toggle('on', tab === 'plan');
    $('pane-point').classList.toggle('on', tab === 'point');
    var b = $('tabs').querySelectorAll('button'), i;
    for (i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].getAttribute('data-v') === tab);
    if (tab === 'plan') {
      planDrawnKey = null;
      render();
    }
    if (tab === 'point') {
      renderPoint();
      if (!(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function')) {
        startPointing();
      }
    }
  }

  function cssVar(name, fallback) {
    var s = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (s && s.trim()) || fallback;
  }
  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 800);
  }
  function svgToPng(svg, w, h, filename, after) {
    var clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    var bg = cssVar('--bg', '#f4f1eb'), fg = cssVar('--fg', '#1c1915'), acc = cssVar('--acc', '#c47b12');
    var mut = cssVar('--mut', '#6b6560'), line = cssVar('--line', '#e5dfd4'), sun = cssVar('--sun', '#e8a020');
    var arc = cssVar('--arc', '#e8c46a'), card = cssVar('--card', '#fffdf8');
    var style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent =
      '.face{fill:' + card + ';stroke:' + line + ';stroke-width:2}' +
      '.tk{stroke:' + line + ';stroke-width:1}.tk.m{stroke:' + mut + ';stroke-width:1.5}' +
      '.lb{fill:' + fg + ';font:600 16px system-ui,sans-serif;text-anchor:middle;dominant-baseline:middle}' +
      '.horizon{fill:none;stroke:' + line + ';stroke-width:1.5}' +
      '.arc{stroke:' + arc + ';stroke-width:6;stroke-linecap:round;stroke-linejoin:round;fill:none}' +
      '.sun{fill:' + sun + ';stroke:' + bg + ';stroke-width:2}.sun.down{fill:' + mut + ';opacity:.55}' +
      '.shadow{stroke:' + mut + ';stroke-width:2;stroke-dasharray:5 4;fill:none}' +
      '.shadow-head{fill:' + mut + '}' +
      '.band{fill:' + arc + ';opacity:.45}.rise{fill:none;stroke:' + acc + ';stroke-width:1.4}' +
      '.set{fill:none;stroke:' + mut + ';stroke-width:1.4}' +
      '.axis{stroke:' + line + ';stroke-width:1}.lbl{fill:' + mut + ';font:10px system-ui,sans-serif}' +
      '.mark{stroke:' + acc + ';stroke-width:1;stroke-dasharray:2 2}.marklab{fill:' + fg + ';font:9px system-ui,sans-serif;text-anchor:middle}' +
      '.month{fill:none;stroke:' + acc + ';stroke-width:1.2;opacity:.85}.month.win{stroke:' + mut + ';opacity:.7}' +
      '.hour{fill:none;stroke:' + line + ';stroke-width:1}' +
      '.hlbl{fill:' + mut + ';font:9px system-ui,sans-serif;text-anchor:middle}';
    clone.insertBefore(style, clone.firstChild);
    var xml = new XMLSerializer().serializeToString(clone);
    var url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      if (!c.toBlob) { after('Saving pictures needs a newer browser.'); return; }
      c.toBlob(function (b) {
        if (!b) { after('Could not make the picture.'); return; }
        downloadBlob(b, filename);
        after();
      }, 'image/png');
    };
    img.onerror = function () { URL.revokeObjectURL(url); after('Could not draw the picture.'); };
    img.src = url;
  }

  function openSavePic() {
    dialog(
      '<h2 style="margin-top:0">Save picture</h2>' +
      '<p class="note">A PNG is saved on this device. The year and sun-path pictures use the current place and year.</p>' +
      '<p class="err" id="picErr"></p>',
      [
        { label: 'Dial', fn: function () {
          svgToPng($('dial'), 800, 800, 'sun-dial.png', function (err) { if (err) { $('picErr').textContent = err; return false; } });
          return false;
        } },
        { label: 'Year chart', fn: function () {
          if (planDrawnKey !== planKey()) { drawYearChart(); planDrawnKey = planKey(); }
          svgToPng($('yearSvg'), 1080, 690, 'sun-year.png', function (err) { if (err) { $('picErr').textContent = err; return false; } });
          return false;
        } },
        { label: 'Sun path', fn: function () {
          if (planDrawnKey !== planKey()) { drawSunPath(); renderPanel(); planDrawnKey = planKey(); }
          svgToPng($('pathSvg'), 800, 800, 'sun-path.png', function (err) { if (err) { $('picErr').textContent = err; return false; } });
          return false;
        } },
        { label: 'Close', cls: 'ghost' }
      ]
    );
  }


  /* ---- SP3 pointing, moon, alerts ---- */
  var headingMag = null, headingTrue = null, phoneEl = null, pointStarted = false, usingAbs = false, noSensor = false;
  var lastPointMs = 0, pointRoseReady = false, moonCache = null, notified = {}, bannerTimer = null;

  function buildPointRose() {
    if (pointRoseReady) return;
    var rose = $('pointRose');
    if (!rose) return;
    function add(tag, at, text) {
      var e = document.createElementNS(NS, tag);
      for (var k in at) e.setAttribute(k, at[k]);
      if (text != null) e.textContent = text;
      rose.appendChild(e);
      return e;
    }
    add('circle', { r: '152', 'class': 'face' });
    add('circle', { r: String(R), 'class': 'horizon' });
    var d, a, r1;
    for (d = 0; d < 360; d += 10) {
      r1 = d % 90 === 0 ? 126 : 132;
      a = d * Math.PI / 180;
      add('line', {
        x1: (Math.sin(a) * r1).toFixed(2), y1: (-Math.cos(a) * r1).toFixed(2),
        x2: (Math.sin(a) * 146).toFixed(2), y2: (-Math.cos(a) * 146).toFixed(2),
        'class': 'tk' + (d % 90 === 0 ? ' m' : '')
      });
    }
    var labs = [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W']];
    for (d = 0; d < labs.length; d++) {
      a = labs[d][0] * Math.PI / 180;
      add('text', { x: (Math.sin(a) * 114).toFixed(1), y: (-Math.cos(a) * 114).toFixed(1), 'class': 'lb' }, labs[d][1]);
    }
    add('circle', { id: 'mkSun', r: '10', 'class': 'mk-sun', cx: '0', cy: String(-R), hidden: 'hidden' });
    add('circle', { id: 'mkMoon', r: '8', 'class': 'mk-moon', cx: '0', cy: String(-R + 16), hidden: 'hidden' });
    add('path', { id: 'mkRise', 'class': 'mk-rise', d: '' });
    add('path', { id: 'mkSet', 'class': 'mk-set', d: '' });
    add('text', { id: 'mkRiseLab', 'class': 'mk-lab', x: '0', y: '0' }, 'rise');
    add('text', { id: 'mkSetLab', 'class': 'mk-lab', x: '0', y: '0' }, 'set');
    pointRoseReady = true;
  }

  function markerAt(az, r) {
    var a = az * Math.PI / 180;
    return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
  }
  function arrowPath(az, r) {
    var a = az * Math.PI / 180;
    var x = Math.sin(a) * r, y = -Math.cos(a) * r;
    var x1 = Math.sin(a - 0.14) * (r - 12), y1 = -Math.cos(a - 0.14) * (r - 12);
    var x2 = Math.sin(a + 0.14) * (r - 12), y2 = -Math.cos(a + 0.14) * (r - 12);
    return 'M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' L' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' L' + x2.toFixed(1) + ' ' + y2.toFixed(1) + ' Z';
  }

  function declinationNow() {
    var W = window.SpWmm;
    if (!W || !W.declination) return 0;
    var pl = place(), d = new Date();
    var yr = d.getFullYear() + (d - new Date(d.getFullYear(), 0, 1)) / 31557600000;
    try { return W.declination(pl.lat, pl.lon, 0, yr); } catch (e) { return 0; }
  }
  function trueHeading() {
    if (headingMag == null) return null;
    return Sp.norm360(headingMag + declinationNow());
  }
  function screenAngle() {
    if (window.screen && screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
    return typeof window.orientation === 'number' ? window.orientation : 0;
  }
  function feedHeading(h) {
    headingMag = Sp.norm360(h);
    headingTrue = trueHeading();
  }
  function cameraElevation(beta, gamma) {
    var b = (beta || 0) * Math.PI / 180, g = (gamma || 0) * Math.PI / 180;
    var s = -Math.cos(b) * Math.cos(g);
    if (s > 1) s = 1;
    if (s < -1) s = -1;
    return Math.asin(s) * 180 / Math.PI;
  }
  function onAbs(e) {
    if (e.alpha != null) {
      usingAbs = true;
      feedHeading(360 - e.alpha + screenAngle());
    }
    if (e.beta != null) phoneEl = cameraElevation(e.beta, e.gamma);
    schedulePoint();
  }
  function onOri(e) {
    if (!usingAbs) {
      if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
        feedHeading(e.webkitCompassHeading + screenAngle());
      } else if (e.absolute && e.alpha != null) {
        feedHeading(360 - e.alpha + screenAngle());
      }
    }
    if (e.beta != null) phoneEl = cameraElevation(e.beta, e.gamma);
    schedulePoint();
  }
  function schedulePoint() {
    var now = Date.now();
    if (now - lastPointMs < 80) return;
    lastPointMs = now;
    if (tab === 'point') renderPoint();
  }

  function startPointing() {
    if (pointStarted) { if (tab === 'point') renderPoint(); return; }
    function go() {
      pointStarted = true;
      $('pointStart').hidden = true;
      if ('ondeviceorientationabsolute' in window) window.addEventListener('deviceorientationabsolute', onAbs);
      window.addEventListener('deviceorientation', onOri);
      setTimeout(function () {
        if (headingMag == null) {
          noSensor = true;
          $('pointMsg').textContent = 'No compass sensor on this device. Laptops usually have none, and some browsers block sensors off the Hub. You can still see the moon and the sunrise and sunset directions below. Open this on a phone through the Hub (https) to point at the sun.';
          renderPoint();
        }
      }, 2500);
    }
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function (r) {
        if (r !== 'granted') {
          $('pointMsg').textContent = 'Motion permission was denied. Allow it in Settings, then try Start pointing again.';
          return;
        }
        go();
      }).catch(function (err) {
        $('pointMsg').textContent = 'Could not ask for motion permission: ' + (err && err.message || err);
      });
      return;
    }
    if (!window.DeviceOrientationEvent) {
      noSensor = true;
      $('pointStart').hidden = true;
      $('pointMsg').textContent = 'No compass sensor on this device. You can still see the moon and the sunrise and sunset directions below.';
      renderPoint();
      return;
    }
    go();
  }

  function getMoonEvents(pl, c) {
    var k = pl.lat + ',' + pl.lon + ',' + c.y + '-' + c.m + '-' + c.d + ',' + displayTz();
    if (moonCache && moonCache.k === k) return moonCache.ev;
    var ev = Sp.moonEvents(pl.lat, pl.lon, c.y, c.m, c.d, displayTz());
    moonCache = { k: k, ev: ev };
    return ev;
  }

  function renderPoint() {
    buildPointRose();
    var instant = new Date();
    var pl = place();
    var sun = Sp.position(pl.lat, pl.lon, instant);
    var moon = Sp.moonPosition(pl.lat, pl.lon, instant);
    var c = Sp.civilDateInTz(instant, displayTz());
    var ev = Sp.dayEvents(pl.lat, pl.lon, c.y, c.m, c.d);
    var mev = getMoonEvents(pl, c);
    var head = noSensor ? 0 : trueHeading();
    var headingUp = !noSensor && head != null;
    $('pointRose').setAttribute('transform', headingUp ? 'rotate(' + (-head).toFixed(2) + ')' : 'rotate(0)');

    function placeMark(id, az, r, hide) {
      var el = $(id);
      if (!el) return;
      if (hide || az == null) { el.setAttribute('hidden', ''); return; }
      el.removeAttribute('hidden');
      var p = markerAt(az, r);
      el.setAttribute('cx', p.x.toFixed(1));
      el.setAttribute('cy', p.y.toFixed(1));
    }
    placeMark('mkSun', sun.azimuth, sun.elevationApp >= 0 ? (1 - Math.min(sun.elevationApp, 90) / 90) * R : R, false);
    if (sun.elevationApp < 0) $('mkSun').classList.add('down'); else $('mkSun').classList.remove('down');
    placeMark('mkMoon', moon.azimuth, moon.elevationApp >= 0 ? (1 - Math.min(moon.elevationApp, 90) / 90) * R : R + 8, false);
    if (ev.sunrise) {
      var raz = Sp.position(pl.lat, pl.lon, ev.sunrise).azimuth;
      $('mkRise').setAttribute('d', arrowPath(raz, R + 8));
      var rp = markerAt(raz, R + 20);
      $('mkRiseLab').setAttribute('x', rp.x.toFixed(1));
      $('mkRiseLab').setAttribute('y', rp.y.toFixed(1));
      $('mkRiseLab').textContent = 'rise';
    }
    if (ev.sunset) {
      var saz = Sp.position(pl.lat, pl.lon, ev.sunset).azimuth;
      $('mkSet').setAttribute('d', arrowPath(saz, R + 8));
      var sp = markerAt(saz, R + 20);
      $('mkSetLab').setAttribute('x', sp.x.toFixed(1));
      $('mkSetLab').setAttribute('y', sp.y.toFixed(1));
      $('mkSetLab').textContent = 'set';
    }

    var guide = $('guideOut'), deg = $('pointDeg');
    if (noSensor || head == null) {
      guide.textContent = noSensor ? 'Directions are shown with north at the top.' : 'Waiting for the compass…';
      deg.textContent = '';
    } else {
      var dAz = ((sun.azimuth - head + 540) % 360) - 180;
      var sunEl = sun.elevationApp;
      var needEl = phoneEl == null ? null : sunEl - phoneEl;
      var parts = [], onAz = Math.abs(dAz) < 8, onEl = needEl == null || Math.abs(needEl) < 8;
      if (Math.abs(dAz) >= 8) parts.push(dAz > 0 ? 'Turn right ' + Math.round(Math.abs(dAz)) + '°' : 'Turn left ' + Math.round(Math.abs(dAz)) + '°');
      if (needEl != null && Math.abs(needEl) >= 8) {
        parts.push(needEl > 0 ? 'Tilt up ' + Math.round(Math.abs(needEl)) + '°' : 'Tilt down ' + Math.round(Math.abs(needEl)) + '°');
      }
      if (onAz && onEl) {
        guide.textContent = sunEl >= 0 ? 'On the sun' : 'On the sun’s direction (it is below the horizon)';
        guide.className = 'guide on';
      } else {
        guide.textContent = parts.length ? parts.join(' · ') : 'On the sun';
        guide.className = 'guide';
      }
      var hdg = Math.round(head); if (hdg === 360) hdg = 0;
      deg.textContent = 'Facing ' + hdg + '° ' + Sp.cardinal(head) + (phoneEl == null ? '' : ' · phone tilt ' + Math.round(phoneEl) + '°');
    }

    var moonTxt = '';
    if (moon.elevationApp >= 0) moonTxt = Math.round(moon.elevationApp) + '° up, ' + Math.round(moon.azimuth) + '° ' + Sp.cardinal(moon.azimuth);
    else moonTxt = Math.round(Math.abs(moon.elevationApp)) + '° down, ' + Math.round(moon.azimuth) + '° ' + Sp.cardinal(moon.azimuth);
    moonTxt += ' · ' + moon.phaseName + ', ' + Math.round(moon.illumination * 100) + '% lit';
    $('moonPos').textContent = moonTxt;
    var rows = '';
    function addRow(k, v) { rows += '<li><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></li>'; }
    if (mev.polar === 'up') addRow('Tonight', 'The moon does not set');
    else if (mev.polar === 'down') addRow('Tonight', 'The moon does not rise');
    else {
      addRow('Moonrise', mev.moonrise ? fmtClock(mev.moonrise) : '—');
      addRow('Moonset', mev.moonset ? fmtClock(mev.moonset) : '—');
    }
    $('moonTimes').innerHTML = rows;
    markSeg($('alertSeg'), st.alerts ? 'on' : 'off');
    updateAlertNote();
  }

  function showBanner(msg) {
    var b = $('banner');
    b.textContent = msg;
    b.hidden = false;
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { b.hidden = true; }, 20000);
  }
  function updateAlertNote() {
    var el = $('alertNote');
    if (!el) return;
    if (!st.alerts) { el.textContent = 'Alerts are off.'; return; }
    if (!('Notification' in window)) { el.textContent = 'You will see a banner in this tab (this browser has no notification permission).'; return; }
    if (Notification.permission === 'granted') el.textContent = 'A system notification and a banner will appear, only while this app is open.';
    else if (Notification.permission === 'denied') el.textContent = 'This browser blocked notifications, so you will see a banner in this tab instead.';
    else el.textContent = 'You will see a banner in this tab. You can also allow system notifications when asked.';
  }
  function setAlerts(on) {
    st.alerts = !!on; save();
    markSeg($('alertSeg'), st.alerts ? 'on' : 'off');
    updateAlertNote();
    if (st.alerts && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(function () { updateAlertNote(); });
    }
  }
  function tickAlerts() {
    if (!st.alerts) return;
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    var now = new Date();
    var pl = place();
    var c = Sp.civilDateInTz(now, displayTz());
    var ev = Sp.dayEvents(pl.lat, pl.lon, c.y, c.m, c.d);
    /* Also look at tomorrow for events just after midnight. */
    var nxt = new Date(Date.UTC(c.y, c.m - 1, c.d + 1));
    var ev2 = Sp.dayEvents(pl.lat, pl.lon, nxt.getUTCFullYear(), nxt.getUTCMonth() + 1, nxt.getUTCDate());
    var items = [
      { key: 'sunrise', date: ev.sunrise, msg: 'Sunrise in 15 minutes' },
      { key: 'sunset', date: ev.sunset, msg: 'Sunset in 15 minutes' },
      { key: 'goldM', date: ev.goldenMorning && ev.goldenMorning.start, msg: 'Morning golden hour starts in 15 minutes' },
      { key: 'goldE', date: ev.goldenEvening && ev.goldenEvening.start, msg: 'Evening golden hour starts in 15 minutes' },
      { key: 'sunrise2', date: ev2.sunrise, msg: 'Sunrise in 15 minutes' },
      { key: 'goldM2', date: ev2.goldenMorning && ev2.goldenMorning.start, msg: 'Morning golden hour starts in 15 minutes' }
    ];
    var i, it, dt, id, iso;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (!it.date) continue;
      dt = it.date.getTime() - now.getTime();
      if (dt <= 0 || dt > 15 * 60000) continue;
      iso = Sp.isoDateInTz(it.date, displayTz());
      id = it.key + '-' + iso;
      if (notified[id]) continue;
      notified[id] = 1;
      showBanner(it.msg);
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Sun Position', { body: it.msg }); } catch (e) { /* blocked */ }
      }
    }
  }

  /* ---- events ---- */
  $('placeBtn').onclick = openPlace;
  $('setBtn').onclick = openSettings;
  $('tabs').onclick = function (e) {
    var v = e.target.getAttribute && e.target.getAttribute('data-v');
    if (v) setTab(v);
  };
  $('nowBtn').onclick = function () { setLive(true); render(); };
  $('shadowH').onchange = $('shadowH').oninput = function () {
    var v = parseFloat($('shadowH').value);
    if (!(v > 0) || v > 10000) return;
    st.shadowH = v; save(); render();
  };
  $('savePic').onclick = openSavePic;
  $('pointStart').onclick = startPointing;
  $('alertSeg').onclick = function (e) {
    var v = e.target.getAttribute && e.target.getAttribute('data-v');
    if (v === 'on' || v === 'off') setAlerts(v === 'on');
  };
  $('banner').onclick = function () { $('banner').hidden = true; };
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
  buildPointRose();
  applyTheme();
  setLive(true);
  setInterval(tickAlerts, 15000);
  render();
  firstVisit();
})();
