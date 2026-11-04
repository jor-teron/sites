/* AS3 Astrology — adds Vedic tab (vedic_calc.js): Rashi, Lagna, nakshatra, North/South Indian chart, Vimshottari dasha, Panchang; ayanamsa setting.
   Legacy header (AS2): */
/* AS2 Astrology — adds birth time/place, full Western chart (astro_calc.js), Chart tab, Sun/Moon/Rising summary.
   Legacy header (AS1): */
/* AS1 Astrology — offline. Profiles (localStorage 'astrology-v1'), tropical sun sign, daily card, element match.
   Readings are traditional meanings, shown for fun; nothing here is a prediction. */
(function () {
  'use strict';
  var RELEASE = 'AS3'; // legacy: 'AS2' (AS1 before)
  var KEY = 'astrology-v1';
  var $ = function (id) { return document.getElementById(id); };

  // Tropical date ranges: sign starts on [month, day] (approximate, years vary by a day).
  var SIGNS = [
    { n: 'Aries', s: '♈', from: [3, 21], el: 'Fire', q: 'Cardinal', r: 'Mars', nums: [1, 9], col: ['Red', '#d93025'], day: 'Tuesday',
      t: 'Traditionally described as direct, energetic and quick to start things. Aries is linked with courage and a liking for new challenges, sometimes with impatience.' },
    { n: 'Taurus', s: '♉', from: [4, 20], el: 'Earth', q: 'Fixed', r: 'Venus', nums: [2, 6], col: ['Green', '#2e7d32'], day: 'Friday',
      t: 'Traditionally described as steady, patient and practical. Taurus is associated with comfort, reliability and enjoying simple pleasures, sometimes with stubbornness.' },
    { n: 'Gemini', s: '♊', from: [5, 21], el: 'Air', q: 'Mutable', r: 'Mercury', nums: [3, 5], col: ['Yellow', '#f2c200'], day: 'Wednesday',
      t: 'Traditionally described as curious, talkative and adaptable. Gemini is linked with ideas, learning and variety, sometimes with restlessness.' },
    { n: 'Cancer', s: '♋', from: [6, 21], el: 'Water', q: 'Cardinal', r: 'Moon', nums: [2, 7], col: ['Silver', '#a8adb4'], day: 'Monday',
      t: 'Traditionally described as caring, protective and home-loving. Cancer is associated with memory and strong family ties, sometimes with moodiness.' },
    { n: 'Leo', s: '♌', from: [7, 23], el: 'Fire', q: 'Fixed', r: 'Sun', nums: [1, 4], col: ['Gold', '#e0a100'], day: 'Sunday',
      t: 'Traditionally described as warm, confident and generous. Leo is linked with creativity and leadership, sometimes with a love of attention.' },
    { n: 'Virgo', s: '♍', from: [8, 23], el: 'Earth', q: 'Mutable', r: 'Mercury', nums: [5, 3], col: ['Navy', '#283593'], day: 'Wednesday',
      t: 'Traditionally described as careful, helpful and detail-minded. Virgo is associated with service and analysis, sometimes with self-criticism.' },
    { n: 'Libra', s: '♎', from: [9, 23], el: 'Air', q: 'Cardinal', r: 'Venus', nums: [6, 9], col: ['Pink', '#e91e63'], day: 'Friday',
      t: 'Traditionally described as fair, sociable and diplomatic. Libra is linked with balance, beauty and partnership, sometimes with indecision.' },
    { n: 'Scorpio', s: '♏', from: [10, 23], el: 'Water', q: 'Fixed', r: 'Mars (and Pluto)', nums: [8, 9], col: ['Maroon', '#7b1fa2'], day: 'Tuesday',
      t: 'Traditionally described as intense, loyal and determined. Scorpio is associated with depth and privacy, sometimes with secrecy.' },
    { n: 'Sagittarius', s: '♐', from: [11, 22], el: 'Fire', q: 'Mutable', r: 'Jupiter', nums: [3, 9], col: ['Purple', '#6a1b9a'], day: 'Thursday',
      t: 'Traditionally described as optimistic, adventurous and frank. Sagittarius is linked with travel, learning and freedom, sometimes with bluntness.' },
    { n: 'Capricorn', s: '♑', from: [12, 22], el: 'Earth', q: 'Cardinal', r: 'Saturn', nums: [4, 8], col: ['Brown', '#6d4c41'], day: 'Saturday',
      t: 'Traditionally described as disciplined, ambitious and responsible. Capricorn is associated with long-term goals and patience, sometimes with reserve.' },
    { n: 'Aquarius', s: '♒', from: [1, 20], el: 'Air', q: 'Fixed', r: 'Saturn (and Uranus)', nums: [4, 7], col: ['Blue', '#1e88e5'], day: 'Saturday',
      t: 'Traditionally described as independent, inventive and friendly. Aquarius is linked with ideas, community and doing things differently, sometimes with detachment.' },
    { n: 'Pisces', s: '♓', from: [2, 19], el: 'Water', q: 'Mutable', r: 'Jupiter (and Neptune)', nums: [3, 7], col: ['Sea green', '#26a69a'], day: 'Thursday',
      t: 'Traditionally described as gentle, imaginative and sympathetic. Pisces is associated with art, intuition and compassion, sometimes with dreaminess.' }
  ];
  // AS2: short traditional Moon (emotional style) and Rising (outer manner) notes, index = sign 0 Aries..11 Pisces.
  var MOON_T = ['Feelings run hot and fast; needs action and independence.', 'Calm, steady emotions; needs comfort and security.',
    'Processes feelings by talking and thinking; needs variety.', 'Deeply sensitive and nurturing; needs home and belonging.',
    'Warm, proud heart; needs to feel appreciated.', 'Calms down by being useful; needs order and routine.',
    'Seeks harmony; needs partnership and fairness.', 'Intense, private feelings; needs trust and depth.',
    'Optimistic and restless; needs freedom and meaning.', 'Reserved, self-controlled; needs purpose and structure.',
    'Detached and friendly; needs space and ideas.', 'Dreamy and empathic; needs quiet and imagination.'];
  var RISE_T = ['Comes across as bold, quick and direct.', 'Comes across as calm, grounded and pleasant.',
    'Comes across as lively, chatty and curious.', 'Comes across as gentle, caring and a little guarded.',
    'Comes across as warm, confident and noticeable.', 'Comes across as neat, modest and observant.',
    'Comes across as charming, polite and easy-going.', 'Comes across as magnetic, watchful and private.',
    'Comes across as cheerful, open and adventurous.', 'Comes across as serious, capable and composed.',
    'Comes across as friendly, unusual and independent.', 'Comes across as soft, dreamy and kind.'];
  var PL_GLYPH = { Sun: '☉', Moon: '☽', Mercury: '☿', Venus: '♀', Mars: '♂', Jupiter: '♃', Saturn: '♄', Uranus: '♅', Neptune: '♆', Pluto: '♇' };
  function zIdx(lon) { return Math.floor(((lon % 360) + 360) % 360 / 30); }
  function dm(lon) { var x = ((lon % 30) + 30) % 30, d = Math.floor(x), m = Math.floor((x - d) * 60); return d + '°' + ('0' + m).slice(-2) + "'"; }
  // Offset (minutes) of IANA zone tz at UTC instant ms, using the browser's own zone data (offline).
  function tzOff(tz, ms) {
    try { var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
      var o = {}; f.formatToParts(new Date(ms)).forEach(function (x) { o[x.type] = +x.value; });
      return (Date.UTC(o.year, o.month - 1, o.day, o.hour % 24, o.minute) - Math.floor(ms / 60000) * 60000) / 60000; } catch (e) { return 0; }
  }
  // Birth instant (UTC ms) + whether time/place are known.
  function birth(p) {
    var a = p.dob.split('-').map(Number), tm = p.time && /^\d\d:\d\d$/.test(p.time) ? p.time.split(':').map(Number) : null;
    var local = Date.UTC(a[0], a[1] - 1, a[2], tm ? tm[0] : 12, tm ? tm[1] : 0), pl = p.place || null, off = 0;
    if (pl) { if (pl.tz) { off = tzOff(pl.tz, local); off = tzOff(pl.tz, local - off * 60000); } else off = (+pl.off || 0) * 60; }
    return { ms: local - off * 60000, timeKnown: !!(tm && pl), place: pl, off: off };
  }
  var chartCache = {};
  function chartOf(p) {
    var b = birth(p), k = p.id + '|' + b.ms + '|' + (b.place ? b.place.lat + ',' + b.place.lon : '');
    if (!chartCache[k]) { var c = window.AstroCalc.chart(b.ms, b.timeKnown ? b.place.lat : null, b.timeKnown ? b.place.lon : null); c.b = b; chartCache[k] = c; }
    return chartCache[k];
  }
  function houseStart(c) { return st.houses === 'equal' ? c.asc : Math.floor(c.asc / 30) * 30; }
  function houseOf(c, lon) { return Math.floor((((lon - houseStart(c)) % 360) + 360) % 360 / 30) + 1; }
  var EL_NOTE = {
    same: 'Same element: traditionally an easy, natural understanding.',
    'Fire-Air': 'Fire and Air: traditionally lively together, air feeds fire.',
    'Earth-Water': 'Earth and Water: traditionally supportive and nurturing.',
    'Fire-Earth': 'Fire and Earth: traditionally different paces, needs patience.',
    'Air-Water': 'Air and Water: traditionally head meets heart, needs effort.',
    'Fire-Water': 'Fire and Water: traditionally a strong contrast, steam or spark.',
    'Air-Earth': 'Air and Earth: traditionally ideas meet practicality, takes work.'
  };
  var EL_SCORE = { same: 85, 'Fire-Air': 80, 'Earth-Water': 80, 'Fire-Earth': 55, 'Air-Water': 55, 'Fire-Water': 45, 'Air-Earth': 50 };

  function signOf(iso) {
    var p = String(iso || '').split('-'); var m = +p[1], d = +p[2];
    if (!m || !d) return null;
    var idx = 9; // Capricorn default (Dec 22 – Jan 19)
    for (var i = 0; i < SIGNS.length; i++) {
      var f = SIGNS[i].from, nx = SIGNS[(i + 1) % 12].from;
      var v = m * 100 + d, a = f[0] * 100 + f[1], b = nx[0] * 100 + nx[1];
      if (a < b ? (v >= a && v < b) : (v >= a || v < b)) { idx = i; break; }
    }
    return SIGNS[idx];
  }

  // ---- state ----
  var st = load();
  function load() {
    var s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    if (!Array.isArray(s.profiles)) s.profiles = [];
    if (!s.theme) s.theme = 'auto';
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* full/blocked */ } }
  function cur() { for (var i = 0; i < st.profiles.length; i++) if (st.profiles[i].id === st.current) return st.profiles[i]; return st.profiles[0] || null; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(iso) { var d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }); }

  // ---- theme ----
  function applyTheme() {
    var t = ''; try { t = localStorage.getItem('sites-hub.theme') || ''; } catch (e) { /* blocked */ }
    var dark = st.theme === 'dark' || (st.theme === 'auto' && (t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)));
    document.documentElement.classList.toggle('dark', !!dark);
    var b = $('themeSeg').querySelectorAll('button');
    for (var i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].getAttribute('data-v') === st.theme);
  }
  window.addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') applyTheme(); });
  if (window.matchMedia) { var mq = matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', applyTheme); }

  // ---- dialogs (in-app only) ----
  function dialog(html, acts, onOpen) {
    $('dlgBody').innerHTML = html; var box = $('dlgActs'); box.innerHTML = '';
    acts.forEach(function (a) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (a.cls || ''); b.textContent = a.label;
      b.onclick = function () { if (a.fn && a.fn() === false) return; close(); }; box.appendChild(b);
    });
    $('dlg').hidden = false; if (onOpen) onOpen();
    function close() { $('dlg').hidden = true; }
    return close;
  }
  $('dlg').addEventListener('click', function (e) { if (e.target === $('dlg')) $('dlg').hidden = true; });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $('dlg').hidden = true; });

  function editProfile(p) {
    var today = new Date().toISOString().slice(0, 10);
    dialog('<h2 style="margin-top:0">' + (p ? 'Edit profile' : 'Add profile') + '</h2>' +
      '<label for="fName">Name</label><input id="fName" maxlength="40" value="' + esc(p ? p.name : '') + '">' +
      '<label for="fDob">Birth date</label><input id="fDob" type="date" max="' + today + '" value="' + esc(p ? p.dob : '') + '">' +
      '<label for="fTime">Birth time (local)</label><div class="row" style="margin:0"><input id="fTime" type="time" value="' + esc(p && p.time ? p.time : '') + '">' +
      '<label class="chk"><input type="checkbox" id="fTU"' + (p && !p.time ? ' checked' : '') + '> Time unknown</label></div>' +
      '<label for="fCity">Birth place</label><input id="fCity" list="cityList" placeholder="Search a city…" autocomplete="off" value="' + esc(p && p.place && p.place.tz ? cityLabel(p.place) : '') + '">' +
      '<datalist id="cityList">' + cityOpts() + '</datalist>' +
      '<details id="fMan"' + (p && p.place && !p.place.tz ? ' open' : '') + '><summary class="note">Or enter latitude / longitude</summary>' +
      '<div class="grid3"><input id="fLat" inputmode="decimal" placeholder="Lat (N +)" value="' + esc(p && p.place && !p.place.tz ? p.place.lat : '') + '">' +
      '<input id="fLon" inputmode="decimal" placeholder="Lon (E +)" value="' + esc(p && p.place && !p.place.tz ? p.place.lon : '') + '">' +
      '<input id="fOff" inputmode="decimal" placeholder="UTC ± h" value="' + esc(p && p.place && !p.place.tz ? p.place.off : '') + '"></div></details>' +
      '<p class="note small">Time and place are optional; they add the Moon\'s exact degree, Rising sign and houses.</p>' +
      '<div class="err" id="fErr"></div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Save', fn: function () {
        var n = $('fName').value.trim(), d = $('fDob').value;
        if (!n) { $('fErr').textContent = 'Please enter a name.'; return false; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !signOf(d)) { $('fErr').textContent = 'Please pick a birth date.'; return false; }
        var tm = $('fTU').checked ? '' : $('fTime').value, pl = null, cv = $('fCity').value.trim();
        if ($('fLat').value.trim() || $('fLon').value.trim()) {
          var la = parseFloat($('fLat').value), lo = parseFloat($('fLon').value), of = parseFloat($('fOff').value);
          if (!(Math.abs(la) <= 90) || !(Math.abs(lo) <= 180)) { $('fErr').textContent = 'Latitude -90…90, longitude -180…180.'; return false; }
          if (!(Math.abs(of) <= 14)) { $('fErr').textContent = 'Please enter the UTC offset in hours, e.g. 5.5.'; return false; }
          pl = { name: 'Custom', lat: la, lon: lo, off: of };
        } else if (cv) { pl = findCity(cv); if (!pl) { $('fErr').textContent = 'City not in the list. Pick one from the search, or enter lat/lon.'; return false; } }
        if (p) { p.name = n; p.dob = d; } else { p = { id: 'p' + Date.now().toString(36), name: n, dob: d }; st.profiles.push(p); }
        p.time = tm; p.place = pl; chartCache = {};
        st.current = p.id; save(); render();
      } }], function () { $('fName').focus(); });
  }
  function cityLabel(c) { return c.name + ', ' + c.country; }
  var CITIES = (window.ASTRO_CITIES || []).map(function (c) { return { name: c[0], country: c[1], lat: c[2], lon: c[3], tz: c[4] }; });
  function cityOpts() { return CITIES.map(function (c) { return '<option value="' + esc(cityLabel(c)) + '">'; }).join(''); }
  function findCity(v) { v = v.toLowerCase(); for (var i = 0; i < CITIES.length; i++) { if (cityLabel(CITIES[i]).toLowerCase() === v) return CITIES[i]; }
    for (i = 0; i < CITIES.length; i++) { if (CITIES[i].name.toLowerCase() === v) return CITIES[i]; } return null; }
  function delProfile(p) {
    dialog('<h2 style="margin-top:0">Delete profile?</h2><p>Delete <b>' + esc(p.name) + '</b> from this device? This cannot be undone.</p>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Delete', cls: 'danger', fn: function () {
        st.profiles = st.profiles.filter(function (x) { return x.id !== p.id; });
        if (st.current === p.id) st.current = st.profiles[0] && st.profiles[0].id; save(); render();
      } }]);
  }

  // ---- render ----
  function empty() { return '<div class="card empty"><div class="big">🔭</div><p>Add a profile with a name and birth date to see a sun sign.</p><button type="button" class="btn" data-add>＋ Add profile</button></div>'; }
  function renderSign(p) {
    if (!p) return empty(); var z = signOf(p.dob);
    return '<div class="card"><div class="big">' + z.s + '</div><div class="title">' + z.n + '</div><div class="sub">' + esc(p.name) + ' · ' + esc(fmtDate(p.dob)) + '</div></div>' +
      '<div class="grid"><div class="kv"><b>' + z.el + '</b><span>Element</span></div><div class="kv"><b>' + z.q + '</b><span>Quality</span></div>' +
      '<div class="kv" style="grid-column:1/-1"><b>' + z.r + '</b><span>Ruling planet</span></div></div>' +
      '<div class="card" style="margin-top:12px"><div class="tag">Traditional meaning</div><p>' + z.t + '</p></div>' + renderBig3(p);
  }
  function renderBig3(p) {
    var c = chartOf(p), sunI = zIdx(c.planets[0].lon), mI = zIdx(c.planets[1].lon), h = '<div class="card"><div class="tag">Sun · Moon · Rising</div><div class="grid g3">';
    h += '<div class="kv"><b>' + SIGNS[sunI].s + ' ' + SIGNS[sunI].n + '</b><span>☉ Sun</span></div>';
    h += '<div class="kv"><b>' + SIGNS[mI].s + ' ' + SIGNS[mI].n + '</b><span>☽ Moon' + (c.b.timeKnown ? '' : ' (approx.)') + '</span></div>';
    h += c.b.timeKnown ? '<div class="kv"><b>' + SIGNS[zIdx(c.asc)].s + ' ' + SIGNS[zIdx(c.asc)].n + '</b><span>↑ Rising</span></div>' : '<div class="kv"><b>?</b><span>Rising needs time + place</span></div>';
    h += '</div><p><b>Moon in ' + SIGNS[mI].n + ':</b> ' + MOON_T[mI] + '</p>';
    if (c.b.timeKnown) h += '<p><b>' + SIGNS[zIdx(c.asc)].n + ' Rising:</b> ' + RISE_T[zIdx(c.asc)] + '</p>';
    else h += '<p class="note">Without a birth time and place the Moon is worked out for midday and may be off by up to ~7°, so near a sign edge it can fall in the next sign.</p>';
    return h + '<p class="note small">Traditional meanings, for fun.</p></div>';
  }
  function renderChart(p) {
    if (!p) return empty(); var c = chartOf(p), tk = c.b.timeKnown, S = 320, C = S / 2, base = tk ? c.asc : 0, svg = [];
    function pt(lon, r) { var a = (180 + lon - base) * Math.PI / 180; return [C + r * Math.cos(a), C - r * Math.sin(a)]; }
    function ln(l, r1, r2, cls) { var a = pt(l, r1), b = pt(l, r2); return '<line class="' + cls + '" x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + b[0].toFixed(1) + '" y2="' + b[1].toFixed(1) + '"/>'; }
    svg.push('<circle class="w-o" cx="' + C + '" cy="' + C + '" r="155"/><circle class="w-l" cx="' + C + '" cy="' + C + '" r="128"/><circle class="w-l" cx="' + C + '" cy="' + C + '" r="70"/>');
    for (var i = 0; i < 12; i++) { svg.push(ln(i * 30, 128, 155, 'w-l')); var q = pt(i * 30 + 15, 141);
      svg.push('<text class="w-z el-' + SIGNS[i].el.toLowerCase() + '" x="' + q[0].toFixed(1) + '" y="' + q[1].toFixed(1) + '">' + SIGNS[i].s + '</text>'); }
    if (tk) { var hs = houseStart(c);
      for (i = 0; i < 12; i++) { svg.push(ln(hs + i * 30, 70, 128, i % 3 === 0 ? 'w-h w-hx' : 'w-h')); var hq = pt(hs + i * 30 + 15, 78);
        svg.push('<text class="w-n" x="' + hq[0].toFixed(1) + '" y="' + hq[1].toFixed(1) + '">' + (i + 1) + '</text>'); }
      svg.push(ln(c.asc, 0, 160, 'w-a')); svg.push(ln(c.mc, 0, 160, 'w-a'));
      var aq = pt(c.asc, 165), mq = pt(c.mc, 165);
      svg.push('<text class="w-t" x="' + Math.max(12, aq[0]).toFixed(1) + '" y="' + aq[1].toFixed(1) + '">AC</text><text class="w-t" x="' + mq[0].toFixed(1) + '" y="' + Math.max(8, mq[1]).toFixed(1) + '">MC</text>'); }
    // planets, nudged apart when closer than 7°
    var ps = c.planets.slice().sort(function (a, b) { return a.lon - b.lon; }), last = -99, lvl = 0;
    ps.forEach(function (pl) { lvl = (pl.lon - last < 7) ? lvl + 1 : 0; last = pl.lon; var r = 112 - (lvl % 3) * 16, q = pt(pl.lon, r);
      svg.push(ln(pl.lon, 124, 128, 'w-l')); svg.push('<text class="w-p" x="' + q[0].toFixed(1) + '" y="' + q[1].toFixed(1) + '"><title>' + pl.name + ' ' + dm(pl.lon) + ' ' + SIGNS[zIdx(pl.lon)].n + '</title>' + PL_GLYPH[pl.name] + '</text>'); });
    var rows = c.planets.map(function (pl) { var zi = zIdx(pl.lon);
      return '<tr><td>' + PL_GLYPH[pl.name] + ' ' + pl.name + '</td><td>' + SIGNS[zi].s + ' ' + SIGNS[zi].n + '</td><td>' + dm(pl.lon) + '</td><td>' + (tk ? houseOf(c, pl.lon) : '–') + '</td><td>' + (pl.retro ? 'R' : '') + '</td></tr>'; });
    if (tk) [['AC', 'Ascendant', c.asc], ['MC', 'Midheaven', c.mc]].forEach(function (a) { var zi = zIdx(a[2]);
      rows.push('<tr class="ang"><td>' + a[0] + ' ' + a[1] + '</td><td>' + SIGNS[zi].s + ' ' + SIGNS[zi].n + '</td><td>' + dm(a[2]) + '</td><td>' + (a[0] === 'AC' ? 1 : houseOf(c, a[2])) + '</td><td></td></tr>'); });
    var b = c.b, offTxt = 'UTC' + (b.off >= 0 ? '+' : '−') + Math.floor(Math.abs(b.off) / 60) + (Math.abs(b.off) % 60 ? ':' + ('0' + Math.abs(b.off) % 60).slice(-2) : '');
    var sub = esc(p.name) + ' · ' + esc(fmtDate(p.dob)) + (p.time ? ' ' + esc(p.time) : '') + (b.place ? ' · ' + esc(b.place.name === 'Custom' ? b.place.lat + ', ' + b.place.lon : b.place.name) + ' (' + offTxt + ')' : '');
    return '<div class="card"><div class="sub">' + sub + '</div><svg class="wheel" viewBox="0 0 ' + S + ' ' + S + '" role="img" aria-label="Chart wheel">' + svg.join('') + '</svg>' +
      (tk ? '<div class="seg" id="houseSeg"><button type="button" data-h="whole"' + (st.houses !== 'equal' ? ' class="on"' : '') + '>Whole Sign houses</button><button type="button" data-h="equal"' + (st.houses === 'equal' ? ' class="on"' : '') + '>Equal houses</button></div>'
        : '<p class="note">Birth time or place unknown: Rising sign, MC and houses are hidden, and the Moon (worked out for midday) may be off by a few degrees. <button type="button" class="mini" data-edit="' + p.id + '">Add time & place</button></p>') + '</div>' +
      '<div class="card"><table class="ptab"><thead><tr><th>Planet</th><th>Sign</th><th>Degree</th><th>House</th><th>R</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
      '<p class="note small">Tropical zodiac, geocentric. Positions from compact published formulas (about 1° or better). R = retrograde. Traditional chart, for fun.</p></div>';
  }
  // ---- AS3 Vedic (sidereal) ----
  var RASHI = [['Mesha', 'Aries'], ['Vrishabha', 'Taurus'], ['Mithuna', 'Gemini'], ['Karka', 'Cancer'], ['Simha', 'Leo'], ['Kanya', 'Virgo'],
    ['Tula', 'Libra'], ['Vrishchika', 'Scorpio'], ['Dhanu', 'Sagittarius'], ['Makara', 'Capricorn'], ['Kumbha', 'Aquarius'], ['Meena', 'Pisces']];
  var RASHI_T = ['Bold and enterprising; quick to act and to lead.', 'Steady and sensual; values security, food and comfort.',
    'Witty and communicative; loves learning and company.', 'Emotional and protective; deeply attached to home and mother.',
    'Dignified and generous; seeks respect and to shine.', 'Analytical and modest; careful with details and health.',
    'Balanced and courteous; seeks harmony and fair trade.', 'Intense and secretive; strong will and deep feelings.',
    'Principled and optimistic; drawn to dharma, teaching and travel.', 'Practical and hard-working; patient climb to success.',
    'Humanitarian and unconventional; thinks of the group.', 'Compassionate and spiritual; imaginative and giving.'];
  var NAK = [['Ashwini', 'Swift healer, energetic starts.'], ['Bharani', 'Bearer of burdens; strong will and restraint.'], ['Krittika', 'Sharp, purifying, frank.'],
    ['Rohini', 'Beauty, growth and charm.'], ['Mrigashira', 'Curious seeker, gentle and searching.'], ['Ardra', 'Storm and renewal; intense thinker.'],
    ['Punarvasu', 'Return of light; optimistic and forgiving.'], ['Pushya', 'Nourishing and dutiful; considered most auspicious.'], ['Ashlesha', 'Coiled serpent; perceptive and guarded.'],
    ['Magha', 'Royal and ancestral; pride in roots.'], ['Purva Phalguni', 'Pleasure, rest and creativity.'], ['Uttara Phalguni', 'Patronage and loyalty; reliable friend.'],
    ['Hasta', 'Skilful hands; clever and practical.'], ['Chitra', 'Bright architect; artistic flair.'], ['Swati', 'Independent like the wind; flexible trader.'],
    ['Vishakha', 'Goal-driven; determined to reach the prize.'], ['Anuradha', 'Devotion and friendship; organiser.'], ['Jyeshtha', 'Eldest; protective, responsible, proud.'],
    ['Mula', 'The root; digs deep, radical change.'], ['Purva Ashadha', 'Invincible; persuasive and confident.'], ['Uttara Ashadha', 'Final victory; principled and lasting.'],
    ['Shravana', 'The listener; learning and connection.'], ['Dhanishtha', 'Wealth and rhythm; musical and generous.'], ['Shatabhisha', 'Hundred healers; private, scientific.'],
    ['Purva Bhadrapada', 'Fiery idealist; intense convictions.'], ['Uttara Bhadrapada', 'Deep and calm; wisdom and restraint.'], ['Revati', 'Gentle guardian of journeys; kind ending.']];
  var VG = { Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me', Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke' };
  var VARA = ['Ravivara (Sunday)', 'Somavara (Monday)', 'Mangalavara (Tuesday)', 'Budhavara (Wednesday)', 'Guruvara (Thursday)', 'Shukravara (Friday)', 'Shanivara (Saturday)'];
  function aya() { return st.ayanamsa || 'lahiri'; }
  function vchartOf(p) { var b = birth(p); return window.VedicCalc.chart(b.ms, b.timeKnown ? b.place.lat : null, b.timeKnown ? b.place.lon : null, aya()); }
  function rName(i) { return RASHI[i][0] + ' (' + RASHI[i][1] + ')'; }
  function fmtD(ms) { return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
  function vDiagram(c, lagnaSign) {
    var byS = {}; c.planets.forEach(function (pl) { var z = zIdx(pl.lon); (byS[z] = byS[z] || []).push(VG[pl.name] + (pl.retro && pl.name !== 'Rahu' && pl.name !== 'Ketu' ? '℞' : '')); });
    var W = 300, svg = ['<rect class="w-o" x="1" y="1" width="298" height="298"/>'];
    function txt(x, y, s, cls) { return '<text class="' + cls + '" x="' + x + '" y="' + y + '">' + s + '</text>'; }
    function plist(x, y, z) { var a = byS[z] || [], h = ''; for (var i = 0; i < a.length; i += 3) h += txt(x, y + (i / 3) * 14, a.slice(i, i + 3).join(' '), 'w-p2'); return h; }
    if (st.vstyle === 'south') {
      var POS = [[1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [3, 3], [2, 3], [1, 3], [0, 3], [0, 2], [0, 1], [0, 0]];
      svg.push('<rect class="w-l" x="75" y="75" width="150" height="150"/>');
      POS.forEach(function (q, z) { var x = q[0] * 75, y = q[1] * 75; svg.push('<rect class="w-l" x="' + x + '" y="' + y + '" width="75" height="75"/>');
        svg.push(txt(x + 12, y + 10, SIGNS[z].s, 'w-n'));
        if (z === lagnaSign) svg.push('<line class="w-a" x1="' + x + '" y1="' + (y + 18) + '" x2="' + (x + 18) + '" y2="' + y + '"/>' + txt(x + 60, y + 10, 'Lg', 'w-t'));
        svg.push(plist(x + 37.5, y + 32, z)); });
      svg.push(txt(150, 150, 'South Indian', 'w-n'));
    } else {
      var T = [150, 0], R_ = [300, 150], B = [150, 300], L = [0, 150], C = [150, 150], TL = [0, 0], TR = [300, 0], BR = [300, 300], BL = [0, 300], P1 = [75, 75], P2 = [225, 75], P3 = [225, 225], P4 = [75, 225];
      var H = [[T, P2, C, P1], [TL, T, P1], [TL, P1, L], [L, P1, C, P4], [L, P4, BL], [BL, P4, B], [B, P4, C, P3], [B, P3, BR], [BR, P3, R_], [R_, P3, C, P2], [R_, P2, TR], [TR, P2, T]];
      svg.push('<path class="w-l" d="M0 0L300 300M300 0L0 300M150 0L300 150L150 300L0 150Z"/>');
      H.forEach(function (poly, h) { var cx = 0, cy = 0; poly.forEach(function (q) { cx += q[0]; cy += q[1]; }); cx /= poly.length; cy /= poly.length;
        var z = (lagnaSign + h) % 12; svg.push(txt(cx.toFixed(0), (cy - (poly.length === 4 ? 22 : 12)).toFixed(0), z + 1, h === 0 ? 'w-t' : 'w-n'));
        svg.push(plist(cx.toFixed(0), (cy - (poly.length === 4 ? 4 : 0)).toFixed(0), z)); });
    }
    return '<svg class="wheel vchart" viewBox="0 0 ' + W + ' ' + W + '" role="img" aria-label="Vedic chart">' + svg.join('') + '</svg>';
  }
  function renderVedic(p) {
    if (!p) return empty(); var b = birth(p), c = vchartOf(p), tk = b.timeKnown, mo = c.planets[1], su = c.planets[0], mi = zIdx(mo.lon), nk = window.VedicCalc.nakOf(mo.lon);
    var lg = tk ? zIdx(c.lagna) : mi, h = '<div class="card"><div class="tag">Vedic (sidereal) · ' + aya().toUpperCase() + ' ayanamsa ' + c.ayanamsa.toFixed(2) + '°</div><div class="grid g3" style="margin-top:8px">';
    h += '<div class="kv"><b>' + SIGNS[mi].s + ' ' + RASHI[mi][0] + '</b><span>Rashi · ' + RASHI[mi][1] + '</span></div>';
    h += tk ? '<div class="kv"><b>' + SIGNS[lg].s + ' ' + RASHI[lg][0] + '</b><span>Lagna · ' + RASHI[lg][1] + '</span></div>' : '<div class="kv"><b>?</b><span>Lagna needs time + place</span></div>';
    h += '<div class="kv"><b>' + SIGNS[zIdx(su.lon)].s + ' ' + RASHI[zIdx(su.lon)][0] + '</b><span>Sun · ' + RASHI[zIdx(su.lon)][1] + '</span></div></div>';
    h += '<p><b>Moon nakshatra: ' + NAK[nk.i][0] + '</b>, pada ' + nk.pada + ' · lord ' + nk.lord + '<br>' + NAK[nk.i][1] + '</p><p><b>' + rName(mi) + ' Rashi:</b> ' + RASHI_T[mi] + '</p>';
    if (!tk) h += '<p class="note">No birth time/place: Moon worked out for midday, so the nakshatra or pada may be off near a boundary.</p>';
    h += '<p class="note small">Traditional meanings, for fun.</p></div>';
    h += '<div class="card"><div class="seg" id="vstyleSeg"><button type="button" data-vs="north"' + (st.vstyle !== 'south' ? ' class="on"' : '') + '>North Indian</button><button type="button" data-vs="south"' + (st.vstyle === 'south' ? ' class="on"' : '') + '>South Indian</button></div>' +
      vDiagram(c, lg) + '<p class="note small">' + (tk ? 'Whole-sign houses from Lagna (' + rName(lg) + ').' : 'Chandra lagna: houses counted from the Moon sign, as birth time is unknown.') + ' Numbers in the North chart are signs (1 = Mesha). ℞ = retrograde.</p></div>';
    var rows = c.planets.map(function (pl) { var zi = zIdx(pl.lon), n = window.VedicCalc.nakOf(pl.lon);
      return '<tr><td>' + VG[pl.name] + ' ' + pl.name + '</td><td>' + RASHI[zi][0] + '</td><td>' + dm(pl.lon) + '</td><td>' + NAK[n.i][0] + ' ' + n.pada + '</td><td>' + (pl.retro && pl.name !== 'Rahu' && pl.name !== 'Ketu' ? 'R' : '') + '</td></tr>'; });
    if (tk) { var ln = window.VedicCalc.nakOf(c.lagna); rows.unshift('<tr class="ang"><td>Lg Lagna</td><td>' + RASHI[lg][0] + '</td><td>' + dm(c.lagna) + '</td><td>' + NAK[ln.i][0] + ' ' + ln.pada + '</td><td></td></tr>'); }
    h += '<div class="card"><table class="ptab"><thead><tr><th>Graha</th><th>Rashi</th><th>Degree</th><th>Nakshatra</th><th>R</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' +
      '<p class="note small">Sidereal = tropical minus ayanamsa. Rahu is the mean node, Ketu opposite.</p></div>';
    var ds = window.VedicCalc.dasha(b.ms, mo.lon, Date.now());
    h += '<div class="card"><div class="tag">Vimshottari dasha (now)</div><div class="grid" style="margin-top:8px"><div class="kv"><b>' + ds.maha.lord + '</b><span>Mahadasha<br>' + fmtD(ds.maha.start) + ' – ' + fmtD(ds.maha.end) + '</span></div>' +
      '<div class="kv"><b>' + ds.antar.lord + '</b><span>Antardasha<br>' + fmtD(ds.antar.start) + ' – ' + fmtD(ds.antar.end) + '</span></div></div>' +
      '<p class="note small">From the Moon\'s nakshatra at birth (balance ' + ds.balanceYears.toFixed(1) + ' yrs of ' + nk.lord + '). Dates are approximate' + (tk ? '' : ', more so without a birth time') + '. Traditional, for fun.</p></div>';
    return h + renderPanchang();
  }
  function panPlace() {
    if (st.panPlace) { var f = findCity(st.panPlace); if (f) return f; }
    var p0 = st.profiles[0]; if (p0 && p0.place) return p0.place; return findCity('Delhi') || { name: 'Delhi', lat: 28.704, lon: 77.102, tz: 'Asia/Kolkata' };
  }
  function renderPanchang() {
    var now = Date.now(), pl = panPlace(), P = window.VedicCalc.panchang(now, aya()), off = pl.tz ? tzOff(pl.tz, now) : (+pl.off || 0) * 60;
    var loc = new Date(now + off * 60000), wd = loc.getUTCDay(), tstr = ('0' + loc.getUTCHours()).slice(-2) + ':' + ('0' + loc.getUTCMinutes()).slice(-2);
    var opts = CITIES.map(function (c) { var l = cityLabel(c); return '<option value="' + esc(l) + '"' + (pl.tz && cityLabel(pl) === l ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
    if (!pl.tz) opts = '<option selected>' + esc(pl.lat + ', ' + pl.lon) + '</option>' + opts;
    return '<div class="card" id="panCard"><div class="tag">Panchang · now (' + tstr + ' local)</div><div class="row" style="margin:8px 0"><select id="panSel" aria-label="Panchang place">' + opts + '</select></div>' +
      '<div class="grid"><div class="kv"><b>' + P.paksha + ' ' + P.tithiName + '</b><span>Tithi ' + P.tithi + ' · ' + Math.round(P.tithiLeft * 100) + '% left</span></div>' +
      '<div class="kv"><b>' + NAK[P.nak.i][0] + '</b><span>Nakshatra · pada ' + P.nak.pada + '</span></div>' +
      '<div class="kv"><b>' + P.yogaName + '</b><span>Yoga</span></div><div class="kv"><b>' + P.karana + '</b><span>Karana</span></div>' +
      '<div class="kv" style="grid-column:1/-1"><b>' + VARA[wd] + '</b><span>Vara (weekday)</span></div></div>' +
      '<p class="note small">Worked out for this moment, not at sunrise as printed panchangs do, and the vara here changes at midnight rather than sunrise. Traditional, for fun.</p></div>';
  }
  function dayHash(iso, salt) { var h = 2166136261; var s = iso + '|' + salt; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function renderToday(p) {
    if (!p) return empty(); var z = signOf(p.dob);
    var now = new Date(); var iso = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
    // Lucky number: the sign's two traditional numbers plus a date-based pick (deterministic, not a prediction).
    var pool = z.nums.concat([(dayHash(iso, z.n) % 9) + 1]); var num = pool[dayHash(iso, 'n' + z.n) % pool.length];
    return '<div class="card"><div class="tag">Today · ' + esc(now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })) + '</div>' +
      '<div class="big" style="margin-top:8px">' + z.s + '</div><div class="title">' + z.n + '</div><div class="sub">' + esc(p.name) + '</div></div>' +
      '<div class="grid"><div class="kv"><b>' + num + '</b><span>Lucky number</span></div>' +
      '<div class="kv"><b><i class="swatch" style="background:' + z.col[1] + '"></i>' + z.col[0] + '</b><span>Lucky colour</span></div>' +
      '<div class="kv" style="grid-column:1/-1"><b>' + z.day + '</b><span>Lucky day (ruled by ' + z.r.split(' ')[0] + ')</span></div></div>' +
      '<p class="note">From fixed traditional tables; the number rotates by date. Just for fun, not a prediction.</p>';
  }
  function renderMatch() {
    var sa = $('mA'), sb = $('mB'), out = $('matchOut');
    if (st.profiles.length < 2) { sa.parentNode.style.display = 'none'; out.innerHTML = '<div class="card empty"><p>Add at least two profiles to compare sun signs.</p><button type="button" class="btn" data-add>＋ Add profile</button></div>'; return; }
    sa.parentNode.style.display = '';
    var opts = st.profiles.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
    var va = sa.value || st.profiles[0].id, vb = sb.value || st.profiles[1].id;
    sa.innerHTML = opts; sb.innerHTML = opts; sa.value = va; sb.value = vb;
    if (!sa.value) sa.value = st.profiles[0].id; if (!sb.value) sb.value = st.profiles[1].id;
    var A = find(sa.value), B = find(sb.value); var za = signOf(A.dob), zb = signOf(B.dob);
    var k = za.el === zb.el ? 'same' : (EL_SCORE[za.el + '-' + zb.el] ? za.el + '-' + zb.el : zb.el + '-' + za.el);
    var sc = EL_SCORE[k]; if (za.q === zb.q && za.n !== zb.n) sc -= 5; if (za.n === zb.n) sc = 80;
    out.innerHTML = '<div class="card"><div class="title">' + za.s + ' ' + za.n + ' &amp; ' + zb.s + ' ' + zb.n + '</div>' +
      '<div class="sub">' + esc(A.name) + ' (' + za.el + ') · ' + esc(B.name) + ' (' + zb.el + ')</div>' +
      '<div class="score">' + sc + '%</div><div class="bar"><i style="width:' + sc + '%"></i></div>' +
      '<p><span class="tag">Traditional meaning</span><br>' + EL_NOTE[k] + (za.q === zb.q && za.n !== zb.n ? ' Both are ' + za.q.toLowerCase() + ' signs, which is said to bring some friction over who leads.' : '') + '</p></div>' +
      '<p class="note">Simple element-based sun-sign match, for fun only. Real relationships depend on people, not signs.</p>';
  }
  function find(id) { for (var i = 0; i < st.profiles.length; i++) if (st.profiles[i].id === id) return st.profiles[i]; return null; }

  function render() {
    var p = cur(); if (p) st.current = p.id;
    $('profileSel').innerHTML = st.profiles.length ? st.profiles.map(function (x) { return '<option value="' + x.id + '"' + (p && x.id === p.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') : '<option>No profiles</option>';
    $('profileSel').disabled = !st.profiles.length;
    $('pane-sign').innerHTML = renderSign(p);
    $('pane-today').innerHTML = renderToday(p);
    $('pane-chart').innerHTML = renderChart(p);
    $('pane-vedic').innerHTML = renderVedic(p);
    var as = $('ayaSeg').querySelectorAll('button'); for (var ai = 0; ai < as.length; ai++) as[ai].classList.toggle('on', as[ai].getAttribute('data-v') === aya());
    renderMatch();
    $('profList').innerHTML = st.profiles.map(function (x) { var z = signOf(x.dob);
      return '<li><span>' + z.s + ' ' + esc(x.name) + ' <small class="note">' + esc(fmtDate(x.dob)) + '</small></span><button type="button" class="mini" data-edit="' + x.id + '">Edit</button><button type="button" class="mini" data-del="' + x.id + '">🗑</button></li>'; }).join('') || '<li><span class="note">No profiles yet.</span></li>';
    applyTheme();
  }

  // ---- events ----
  $('profileSel').addEventListener('change', function () { st.current = this.value; save(); render(); });
  $('addBtn').onclick = $('addBtn2').onclick = function () { editProfile(null); };
  $('mA').onchange = $('mB').onchange = renderMatch;
  $('tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; show(b.getAttribute('data-tab')); });
  function show(tab) { st.tab = tab; save();
    [].forEach.call($('tabs').children, function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === tab); });
    [].forEach.call(document.querySelectorAll('.pane'), function (s) { s.classList.toggle('on', s.id === 'pane-' + tab); }); }
  $('pane-chart').addEventListener('click', function (e) { var b = e.target.closest('[data-h]'); if (!b) return; st.houses = b.getAttribute('data-h'); save(); $('pane-chart').innerHTML = renderChart(cur()); });
  document.addEventListener('change', function (e) { if (e.target && e.target.id === 'fTU' && e.target.checked) $('fTime').value = ''; if (e.target && e.target.id === 'fTime' && e.target.value) $('fTU').checked = false; });
  document.addEventListener('input', function (e) { if (e.target && e.target.id === 'fTime' && e.target.value) $('fTU').checked = false; });
  $('pane-vedic').addEventListener('click', function (e) { var b = e.target.closest('[data-vs]'); if (!b) return; st.vstyle = b.getAttribute('data-vs'); save(); $('pane-vedic').innerHTML = renderVedic(cur()); });
  $('pane-vedic').addEventListener('change', function (e) { if (e.target.id !== 'panSel') return; st.panPlace = e.target.value; save(); var pc = $('panCard'); pc.outerHTML = renderPanchang(); });
  $('ayaSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; st.ayanamsa = b.getAttribute('data-v'); save(); render(); });
  $('themeSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; st.theme = b.getAttribute('data-v'); save(); applyTheme(); });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-add],[data-edit],[data-del]'); if (!t) return;
    if (t.hasAttribute('data-add')) editProfile(null);
    else if (t.hasAttribute('data-edit')) editProfile(find(t.getAttribute('data-edit')));
    else delProfile(find(t.getAttribute('data-del')));
  });

  $('rel').textContent = RELEASE;
  render(); show(st.tab || 'sign');
  window.Astrology = { RELEASE: RELEASE, signOf: signOf, chartOf: chartOf, birth: birth, vchartOf: vchartOf }; // legacy AS2: no vchartOf; legacy AS1: { RELEASE, signOf }
})();
