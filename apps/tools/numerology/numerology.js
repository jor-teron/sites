/* NU1 Numerology — offline. Profiles (localStorage 'numerology-v1'), Life Path and name numbers,
   Personal Year/Month/Day, Life Path compatibility, name checker, Western/Chaldean letter values.
   Readings are traditional meanings, shown for fun; nothing here is a fact or a prediction. */
(function () {
  'use strict';
  var RELEASE = 'NU1';
  var KEY = 'numerology-v1';
  var $ = function (id) { return document.getElementById(id); };
  var Nu = window.NuCalc;

  var KINDS = [
    { id: 'lifePath', lab: 'Life Path', one: 'From your date of birth', trad: 'Life Path', also: '' },
    { id: 'expression', lab: 'Name number', one: 'From every letter in your name', trad: 'Destiny or Expression', also: 'Traditionally called the Destiny or Expression number.' },
    { id: 'soulUrge', lab: 'Heart number', one: 'From the vowels in your name', trad: 'Soul Urge', also: 'Traditionally called the Soul Urge or Heart’s Desire number.' },
    { id: 'personality', lab: 'Outer number', one: 'From the consonants in your name', trad: 'Personality', also: 'Traditionally called the Personality number.' },
    { id: 'birthday', lab: 'Birthday', one: 'From the day you were born', trad: 'Birthday number', also: '' }
  ];

  // ---- state ----
  var st = load();
  var view = 'main'; // main | compare | name | set  (first-run is when there are no profiles)
  function load() {
    var s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    if (!Array.isArray(s.profiles)) s.profiles = [];
    if (!s.theme) s.theme = 'auto';
    if (s.system !== 'chaldean') s.system = 'pythagorean';
    return s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* full/blocked */ } }
  function cur() {
    for (var i = 0; i < st.profiles.length; i++) if (st.profiles[i].id === st.current) return st.profiles[i];
    return st.profiles[0] || null;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function todayISO() {
    var n = new Date();
    var m = n.getMonth() + 1, d = n.getDate();
    return n.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (d < 10 ? '0' : '') + d;
  }
  function fmtDate(iso) {
    var p = Nu.parseISO(iso);
    if (!p) return iso;
    return new Date(p.y, p.m - 1, p.d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function sysLabel() {
    return st.system === 'chaldean' ? 'Chaldean letter values' : 'Western letter values';
  }

  // ---- theme ----
  function applyTheme() {
    var t = ''; try { t = localStorage.getItem('sites-hub.theme') || ''; } catch (e) { /* blocked */ }
    var dark = st.theme === 'dark' || (st.theme === 'auto' && (t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)));
    document.documentElement.classList.toggle('dark', !!dark);
    var b = $('themeSeg').querySelectorAll('button');
    for (var i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].getAttribute('data-v') === st.theme);
  }
  window.addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') applyTheme(); });
  if (window.matchMedia) {
    var mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', applyTheme);
  }

  // ---- dialogs (in-app only) ----
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

  function validName(n) {
    return Nu.wordsOf(n).join('').length > 0;
  }
  function validDob(d) {
    return !!Nu.parseISO(d) && d <= todayISO();
  }

  function editProfile(p) {
    var today = todayISO();
    dialog(
      '<h2 style="margin-top:0">' + (p ? 'Edit' : 'Add someone') + '</h2>' +
      '<label for="fName">Full name</label><input id="fName" class="field" maxlength="80" autocomplete="name" value="' + esc(p ? p.name : '') + '">' +
      '<label for="fDob">Date of birth</label><input id="fDob" class="field" type="date" min="1800-01-01" max="' + today + '" value="' + esc(p ? p.dob : '') + '">' +
      '<div class="err" id="fErr"></div>',
      [
        { label: 'Cancel', cls: 'ghost' },
        { label: 'Save', fn: function () {
          var n = $('fName').value.trim(), d = $('fDob').value;
          if (!validName(n)) { $('fErr').textContent = 'Please enter a name with English letters.'; return false; }
          if (!validDob(d)) { $('fErr').textContent = 'Please pick a date of birth.'; return false; }
          if (p) { p.name = n; p.dob = d; }
          else { p = { id: 'p' + Date.now().toString(36), name: n, dob: d }; st.profiles.push(p); }
          st.current = p.id; save(); view = 'main'; render();
        } }
      ],
      function () { $('fName').focus(); }
    );
  }
  function delProfile(p) {
    dialog(
      '<h2 style="margin-top:0">Remove this person?</h2><p>Remove <b>' + esc(p.name) + '</b> from this device? This cannot be undone.</p>',
      [
        { label: 'Cancel', cls: 'ghost' },
        { label: 'Remove', cls: 'danger', fn: function () {
          st.profiles = st.profiles.filter(function (x) { return x.id !== p.id; });
          if (st.current === p.id) st.current = st.profiles[0] && st.profiles[0].id;
          save();
          if (!st.profiles.length) view = 'main';
          render();
        } }
      ]
    );
  }
  function openProfiles() {
    var h = '<h2 style="margin-top:0">People saved here</h2>';
    if (!st.profiles.length) h += '<p class="note">No one saved yet.</p>';
    st.profiles.forEach(function (p) {
      h += '<div class="row" style="margin:0 0 8px">' +
        '<button type="button" class="btn ghost" style="flex:1;text-align:left" data-pick="' + esc(p.id) + '">' + esc(p.name) + '</button>' +
        '<button type="button" class="btn ghost" data-ed="' + esc(p.id) + '">Edit</button>' +
        '<button type="button" class="btn ghost" data-del="' + esc(p.id) + '">Remove</button>' +
        '</div>';
    });
    var close = dialog(h, [{ label: 'Add someone', fn: function () { editProfile(null); return false; } }, { label: 'Close', cls: 'ghost' }]);
    $('dlgBody').addEventListener('click', function (e) {
      var t = e.target, id;
      if (!t.getAttribute) return;
      id = t.getAttribute('data-pick') || t.getAttribute('data-ed') || t.getAttribute('data-del');
      if (!id) return;
      var p = null;
      for (var i = 0; i < st.profiles.length; i++) if (st.profiles[i].id === id) p = st.profiles[i];
      if (!p) return;
      if (t.getAttribute('data-pick')) { st.current = p.id; save(); close(); view = 'main'; render(); }
      else if (t.getAttribute('data-ed')) { close(); editProfile(p); }
      else { close(); delProfile(p); }
    });
  }

  function showMeaning(kind, num, extra) {
    if (!num) return;
    var k = kind, title = k.lab, more = k.also;
    var body = '<h2 style="margin-top:0">' + esc(title) + '</h2>' +
      '<div class="score">' + num + '</div>' +
      '<p class="note center">' + esc(k.one) + (more ? ' ' + more : '') + '</p>' +
      '<p>' + esc(Nu.meaning(num)) + '</p>' +
      (extra || '') +
      '<p class="note small">A traditional reading, for fun — not a fact or a prediction.</p>';
    dialog(body, [{ label: 'Close', cls: 'ghost' }]);
  }

  // ---- first run ----
  function saveFirst() {
    var n = $('firstName').value.trim(), d = $('firstDob').value;
    if (!validName(n)) { $('firstErr').textContent = 'Please enter your name, using English letters.'; $('firstName').focus(); return; }
    if (!validDob(d)) { $('firstErr').textContent = 'Please pick your date of birth.'; $('firstDob').focus(); return; }
    var p = { id: 'p' + Date.now().toString(36), name: n, dob: d };
    st.profiles.push(p); st.current = p.id; save(); view = 'main'; render();
  }

  // ---- render ----
  function showPane(id) {
    var panes = document.querySelectorAll('.pane');
    for (var i = 0; i < panes.length; i++) panes[i].classList.toggle('on', panes[i].id === id);
  }

  function renderMain(p) {
    var asOf = todayISO();
    var n = Nu.profile(p.name, p.dob, st.system, asOf);
    var h = '<p class="sys">' + esc(p.name) + ' · ' + esc(fmtDate(p.dob)) + ' · ' + sysLabel() + '</p>';
    var life = KINDS[0];
    h += '<button type="button" class="card hero" data-kind="lifePath">' +
      '<div class="num">' + n.lifePath + '</div>' +
      '<div class="lab">' + life.lab + '</div>' +
      '<p class="one">' + life.one + '</p></button>';
    h += '<div class="grid">';
    for (var i = 1; i < KINDS.length; i++) {
      var k = KINDS[i], val = n[k.id];
      var shown = n.hasName || k.id === 'birthday' ? val : '—';
      h += '<button type="button" class="card" data-kind="' + k.id + '">' +
        '<div class="num">' + shown + '</div>' +
        '<div class="lab">' + k.lab + '</div>' +
        '<p class="one">' + k.one + '</p></button>';
    }
    h += '</div>';
    h += '<button type="button" class="card" id="todayCard">' +
      '<div class="tag">Today · ' + esc(fmtDate(asOf)) + '</div>' +
      '<div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin:10px 0 0">' +
      '<div><div class="num" style="font-size:36px">' + n.personalYear + '</div><div class="one">This year</div></div>' +
      '<div><div class="num" style="font-size:36px">' + n.personalMonth + '</div><div class="one">This month</div></div>' +
      '<div><div class="num" style="font-size:36px">' + n.personalDay + '</div><div class="one">Today</div></div>' +
      '</div>' +
      '<p class="one" style="margin-top:8px">' + esc(Nu.yearMeaning(n.personalYear)) + '</p>' +
      '</button>';
    $('pane-main').innerHTML = h;
    $('pane-main').onclick = function (e) {
      var btn = e.target.closest('button[data-kind], #todayCard');
      if (!btn) return;
      if (btn.id === 'todayCard') {
        var extra = '<p class="note">These use your birth month and day with the calendar year (from 1 January).</p>' +
          '<p><b>This year (' + n.personalYear + '):</b> ' + esc(Nu.yearMeaning(n.personalYear)) + '</p>' +
          '<p><b>This month (' + n.personalMonth + '):</b> ' + esc(Nu.meaning(n.personalMonth)) + '</p>' +
          '<p><b>Today (' + n.personalDay + '):</b> ' + esc(Nu.meaning(n.personalDay)) + '</p>';
        dialog('<h2 style="margin-top:0">Today</h2>' + extra +
          '<p class="note small">A traditional reading, for fun — not a fact or a prediction.</p>',
          [{ label: 'Close', cls: 'ghost' }]);
        return;
      }
      var id = btn.getAttribute('data-kind'), kind = null;
      for (var j = 0; j < KINDS.length; j++) if (KINDS[j].id === id) kind = KINDS[j];
      var val2 = n[id];
      if (!kind || !val2) return;
      showMeaning(kind, val2);
    };
  }

  function fillSelect(sel, pick) {
    var i, p, html = '';
    for (i = 0; i < st.profiles.length; i++) {
      p = st.profiles[i];
      html += '<option value="' + esc(p.id) + '"' + (p.id === pick ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }
    sel.innerHTML = html || '<option value="">—</option>';
    if (pick) sel.value = pick;
  }
  function renderCompare() {
    var a = cur(), b = null;
    for (var i = 0; i < st.profiles.length; i++) {
      if (st.profiles[i].id !== (a && a.id)) { b = st.profiles[i]; break; }
    }
    fillSelect($('mA'), a && a.id);
    fillSelect($('mB'), (b && b.id) || (a && a.id));
    paintCompare();
  }
  function paintCompare() {
    var out = $('matchOut');
    if (st.profiles.length < 2) {
      out.innerHTML = '<div class="card empty" style="cursor:default"><p>Add another person to compare Life Path numbers.</p>' +
        '<button type="button" class="btn" id="cmpAdd">Add someone</button></div>';
      var add = $('cmpAdd'); if (add) add.onclick = function () { editProfile(null); };
      return;
    }
    var idA = $('mA').value, idB = $('mB').value, pA = null, pB = null, i;
    for (i = 0; i < st.profiles.length; i++) {
      if (st.profiles[i].id === idA) pA = st.profiles[i];
      if (st.profiles[i].id === idB) pB = st.profiles[i];
    }
    if (!pA || !pB) { out.innerHTML = ''; return; }
    var nA = Nu.profile(pA.name, pA.dob, st.system), nB = Nu.profile(pB.name, pB.dob, st.system);
    var c = Nu.compat(nA.lifePath, nB.lifePath);
    out.innerHTML = '<div class="card" style="cursor:default">' +
      '<p class="note">' + esc(pA.name) + ' · Life Path ' + nA.lifePath + '<br>' + esc(pB.name) + ' · Life Path ' + nB.lifePath + '</p>' +
      '<div class="score">' + c.score + '</div>' +
      '<div class="score-lab">' + esc(c.label) + '</div>' +
      '<div class="bar"><i style="width:' + c.score + '%"></i></div>' +
      '<p>' + esc(c.note) + '</p>' +
      '<p class="note small">From a fixed table of Life Path pairs. A traditional reading, for fun — not a fact.</p>' +
      '</div>';
  }

  function paintName() {
    var raw = $('nameIn').value, out = $('nameOut');
    if (!raw.trim()) { out.innerHTML = ''; return; }
    var parts = Nu.nameParts(raw, st.system, 'all');
    if (!parts.letters) {
      out.innerHTML = '<p class="err">Please use a name with English letters.</p>';
      return;
    }
    out.innerHTML = '<button type="button" class="card hero" id="nameCard">' +
      '<div class="num">' + parts.reduced + '</div>' +
      '<div class="lab">Name number</div>' +
      '<p class="one">From every letter in this spelling · ' + sysLabel() + '</p>' +
      '<p class="one" style="margin-top:8px">' + esc(Nu.meaning(parts.reduced)) + '</p>' +
      '</button>';
    var card = $('nameCard');
    if (card) card.onclick = function () {
      showMeaning(KINDS[1], parts.reduced, '<p class="note">Checked spelling: “' + esc(raw.trim()) + '”.</p>');
    };
  }

  function renderSettings() {
    var b = $('sysSeg').querySelectorAll('button');
    for (var i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].getAttribute('data-v') === st.system);
    var ul = $('profList'), html = '';
    st.profiles.forEach(function (p) {
      html += '<li><button type="button" class="who" data-pick="' + esc(p.id) + '">' + esc(p.name) + '<br><span class="note">' + esc(fmtDate(p.dob)) + '</span></button>' +
        '<button type="button" class="mini" data-ed="' + esc(p.id) + '">Edit</button>' +
        '<button type="button" class="mini" data-del="' + esc(p.id) + '">Remove</button></li>';
    });
    ul.innerHTML = html || '<li class="note" style="border:0;background:none">No one saved yet.</li>';
  }

  function render() {
    applyTheme();
    $('rel').textContent = RELEASE;
    $('firstDob').max = todayISO();
    var has = st.profiles.length > 0;
    $('top').hidden = !has;
    $('more').hidden = !has || view !== 'main';
    if (!has) {
      showPane('pane-first');
      $('firstErr').textContent = '';
      return;
    }
    var p = cur();
    if (p) $('profBtn').textContent = p.name + ' ▾';
    if (view === 'compare') { showPane('pane-compare'); renderCompare(); }
    else if (view === 'name') { showPane('pane-name'); paintName(); }
    else if (view === 'set') { showPane('pane-set'); renderSettings(); }
    else { view = 'main'; showPane('pane-main'); renderMain(p); }
  }

  // ---- events ----
  $('firstGo').addEventListener('click', saveFirst);
  $('firstName').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('firstDob').focus(); });
  $('firstDob').addEventListener('keydown', function (e) { if (e.key === 'Enter') saveFirst(); });
  $('profBtn').addEventListener('click', openProfiles);
  $('cmpBack').addEventListener('click', function () { view = 'main'; render(); });
  $('nameBack').addEventListener('click', function () { view = 'main'; render(); });
  $('setBack').addEventListener('click', function () { view = 'main'; render(); });
  $('mA').addEventListener('change', paintCompare);
  $('mB').addEventListener('change', paintCompare);
  $('nameIn').addEventListener('input', paintName);
  $('addBtn2').addEventListener('click', function () { editProfile(null); });
  $('more').addEventListener('click', function (e) {
    var v = e.target && e.target.getAttribute && e.target.getAttribute('data-view');
    if (!v) return;
    view = v; render();
  });
  $('themeSeg').addEventListener('click', function (e) {
    var v = e.target && e.target.getAttribute && e.target.getAttribute('data-v');
    if (!v) return;
    st.theme = v; save(); applyTheme();
  });
  $('sysSeg').addEventListener('click', function (e) {
    var v = e.target && e.target.getAttribute && e.target.getAttribute('data-v');
    if (!v) return;
    st.system = v === 'chaldean' ? 'chaldean' : 'pythagorean';
    save(); render();
  });
  $('profList').addEventListener('click', function (e) {
    var t = e.target.closest('[data-pick],[data-ed],[data-del]');
    if (!t) return;
    var id = t.getAttribute('data-pick') || t.getAttribute('data-ed') || t.getAttribute('data-del'), p = null, i;
    for (i = 0; i < st.profiles.length; i++) if (st.profiles[i].id === id) p = st.profiles[i];
    if (!p) return;
    if (t.getAttribute('data-pick')) { st.current = p.id; save(); view = 'main'; render(); }
    else if (t.getAttribute('data-ed')) editProfile(p);
    else delProfile(p);
  });

  window.Numerology = { RELEASE: RELEASE };
  render();
})();
