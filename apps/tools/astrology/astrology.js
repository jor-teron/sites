/* AS1 Astrology — offline. Profiles (localStorage 'astrology-v1'), tropical sun sign, daily card, element match.
   Readings are traditional meanings, shown for fun; nothing here is a prediction. */
(function () {
  'use strict';
  var RELEASE = 'AS1';
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
      '<div class="err" id="fErr"></div>',
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Save', fn: function () {
        var n = $('fName').value.trim(), d = $('fDob').value;
        if (!n) { $('fErr').textContent = 'Please enter a name.'; return false; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !signOf(d)) { $('fErr').textContent = 'Please pick a birth date.'; return false; }
        if (p) { p.name = n; p.dob = d; } else { p = { id: 'p' + Date.now().toString(36), name: n, dob: d }; st.profiles.push(p); }
        st.current = p.id; save(); render();
      } }], function () { $('fName').focus(); });
  }
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
      '<div class="card" style="margin-top:12px"><div class="tag">Traditional meaning</div><p>' + z.t + '</p></div>';
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
  $('themeSeg').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; st.theme = b.getAttribute('data-v'); save(); applyTheme(); });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-add],[data-edit],[data-del]'); if (!t) return;
    if (t.hasAttribute('data-add')) editProfile(null);
    else if (t.hasAttribute('data-edit')) editProfile(find(t.getAttribute('data-edit')));
    else delProfile(find(t.getAttribute('data-del')));
  });

  $('rel').textContent = RELEASE;
  render(); show(st.tab || 'sign');
  window.Astrology = { RELEASE: RELEASE, signOf: signOf };
})();
