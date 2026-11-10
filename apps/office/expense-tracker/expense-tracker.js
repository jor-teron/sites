/* EXT1 Expense Tracker — offline. Storage: localStorage 'expense-tracker-v1'.
   Helpers in ex_core.js. In-app dialogs only; Auto theme follows sites-hub.theme. */
(function () {
  'use strict';

  var RELEASE = 'EXT1';
  var KEY = 'expense-tracker-v1';
  var Ex = window.ExCore;
  var $ = function (id) { return document.getElementById(id); };

  var st = Ex.emptyState();
  var view = 'main';
  var qType = 'expense';
  var toastTimer = null;
  var monthNow = Ex.monthKey(Ex.todayISO());

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
    st = Ex.normalizeState(raw);
    if (!st.month) st.month = monthNow;
    var exp = Ex.expandRecurring(st.recurrences, st.entries, st.cancelledRecurring, Ex.todayISO());
    if (exp.added.length) {
      st.entries = exp.entries;
      save();
      toast(exp.added.length === 1
        ? 'Added this month\'s recurring entry.'
        : 'Added ' + exp.added.length + ' recurring entries.');
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
      return true;
    } catch (e) {
      toast('Could not save. Storage may be full or blocked.');
      return false;
    }
  }

  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 4000);
  }

  // ---- theme ----
  function applyTheme() {
    var t = '';
    try { t = localStorage.getItem('sites-hub.theme') || ''; } catch (e) { /* blocked */ }
    var dark = st.theme === 'dark' || (st.theme === 'auto' && (t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches)));
    document.documentElement.classList.toggle('dark', !!dark);
    var b = $('themeSeg').querySelectorAll('button');
    var i;
    for (i = 0; i < b.length; i++) b[i].classList.toggle('on', b[i].getAttribute('data-v') === st.theme);
  }
  window.addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') applyTheme(); });
  if (window.matchMedia) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { if (st.theme === 'auto') applyTheme(); });
  }

  // ---- dialogs ----
  function dialog(html, acts, onOpen) {
    $('dlgBody').innerHTML = html;
    var box = $('dlgActs');
    box.innerHTML = '';
    acts.forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (a.cls ? ' ' + a.cls : '');
      b.textContent = a.label;
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

  function fillSelect(sel, items, value, withAll) {
    var h = withAll ? '<option value="">' + esc(withAll) + '</option>' : '';
    items.forEach(function (it) {
      h += '<option value="' + esc(it.value) + '"' + (it.value === value ? ' selected' : '') + '>' + esc(it.label) + '</option>';
    });
    sel.innerHTML = h;
    if (value) sel.value = value;
  }

  function catsOf(kind) {
    return st.categories.filter(function (c) { return c.kind === kind; });
  }

  function catOptions(kind, withAll) {
    var list = (kind ? catsOf(kind) : st.categories).map(function (c) {
      return { value: c.id, label: (c.emoji ? c.emoji + ' ' : '') + c.name };
    });
    return list;
  }

  function modeOptions() {
    return Ex.MODES.map(function (m) { return { value: m, label: m }; });
  }

  function fillQuickCats() {
    fillSelect($('qCat'), catOptions(qType), $('qCat').value, null);
    if (!$('qCat').value && $('qCat').options.length) $('qCat').selectedIndex = 0;
  }

  function fillFilters() {
    fillSelect($('fCat'), catOptions(null), $('fCat').value, 'All categories');
    fillSelect($('fMode'), modeOptions(), $('fMode').value, 'All modes');
  }

  function fillModes(sel, value) {
    fillSelect(sel, modeOptions(), value || 'UPI', null);
  }

  // ---- render ----
  function showPane(id) {
    view = id;
    $('pane-main').classList.toggle('on', id === 'main');
    $('pane-set').classList.toggle('on', id === 'set');
  }

  function render() {
    applyTheme();
    $('rel').textContent = RELEASE;
    $('monthBtn').textContent = Ex.monthLabel(st.month);
    fillQuickCats();
    fillFilters();
    renderSummary();
    renderList();
    renderCharts();
    renderSettings();
  }

  function currentTotals() {
    return Ex.monthTotals(st.entries, st.month);
  }

  function renderSummary() {
    var t = currentTotals();
    $('sumIn').textContent = Ex.rupee(t.income);
    $('sumOut').textContent = Ex.rupee(t.spent);
    $('sumBal').textContent = Ex.rupee(t.balance);
    var bal = $('sumBal').parentNode;
    bal.classList.toggle('neg', t.balance < 0);
    bal.classList.toggle('pos', t.balance > 0);
    var bud = Ex.budgetStatus(t, st.overallBudget, st.categoryBudgets, st.categories);
    $('budgetOverall').innerHTML = bud.overall ? budgetHtml('Overall budget', bud.overall) : '';
    var catH = '';
    bud.categories.forEach(function (c) {
      catH += budgetHtml(c.name, c);
    });
    $('catBudgets').innerHTML = catH;
  }

  function budgetHtml(label, b) {
    var pct = Math.min(100, Math.round(b.ratio * 100));
    var cls = b.over ? ' over' : (b.ratio >= 0.8 ? ' warn' : '');
    var over = b.over
      ? '<p class="warn-txt">Over budget by ' + esc(Ex.rupee(b.spent - b.budget)) + '</p>'
      : '';
    return '<div class="budget-row"><div class="meta"><span>' + esc(label) + '</span><span>' +
      esc(Ex.rupee(b.spent)) + ' of ' + esc(Ex.rupee(b.budget)) +
      (b.over ? '' : ' · ' + esc(Ex.rupee(b.remaining)) + ' left') +
      '</span></div><div class="bar' + cls + '"><i style="width:' + pct + '%"></i></div>' + over + '</div>';
  }

  function renderList() {
    var opts = {
      month: st.month,
      categoryId: $('fCat').value || '',
      mode: $('fMode').value || '',
      query: $('search').value || '',
      categories: st.categories
    };
    var rows = Ex.filterEntries(st.entries, opts);
    var groups = Ex.groupByDay(rows);
    if (!groups.length) {
      $('list').innerHTML = '<p class="empty">No entries this month. Add one above, or import a CSV in Settings.</p>';
      return;
    }
    var h = '';
    groups.forEach(function (g) {
      h += '<div class="day"><div class="day-h"><span>' + esc(Ex.formatDayHead(g.date)) + '</span><span>' +
        (g.income ? 'in ' + esc(Ex.rupee(g.income)) + ' · ' : '') +
        'out ' + esc(Ex.rupee(g.spent)) + '</span></div>';
      g.entries.forEach(function (e) {
        var cat = Ex.categoryById(st.categories, e.categoryId);
        var name = cat ? ((cat.emoji ? cat.emoji + ' ' : '') + cat.name) : 'Entry';
        var color = cat ? cat.color : '#7a7468';
        var emoji = cat && cat.emoji ? cat.emoji : '•';
        var sub = [e.mode].concat(e.note ? [e.note] : []).join(' · ');
        var amt = (e.type === 'income' ? '+' : '−') + '₹' + Ex.formatINR(e.amount);
        h += '<button type="button" class="entry" data-id="' + esc(e.id) + '">' +
          '<span class="dot" style="background:' + esc(color) + '22">' + esc(emoji) + '</span>' +
          '<span class="mid"><span class="name">' + esc(name) + '</span><span class="sub">' + esc(sub) + '</span></span>' +
          '<span class="amt ' + (e.type === 'income' ? 'inc' : 'out') + '">' + esc(amt) + '</span>' +
          '</button>';
      });
      h += '</div>';
    });
    $('list').innerHTML = h;
  }

  function cssSize(canvas, fallbackH) {
    var w = canvas.clientWidth || canvas.parentNode.clientWidth || 300;
    var h = fallbackH || 200;
    return { w: w, h: h };
  }

  function fitCanvas(c, cssW, cssH) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.max(1, Math.round(cssW * dpr));
    c.height = Math.max(1, Math.round(cssH * dpr));
    c.style.width = cssW + 'px';
    c.style.height = cssH + 'px';
    var ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function themeColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function renderCharts() {
    var t = currentTotals();
    var fg = themeColor('--fg', '#1c241e');
    var mut = themeColor('--mut', '#5e6b62');
    var acc = themeColor('--acc', '#1f7a4d');
    var line = themeColor('--line', '#dce4dd');
    var bg = themeColor('--card', '#fff');

    var slices = [];
    st.categories.forEach(function (c) {
      if (c.kind === 'income') return;
      var row = t.byCategory[c.id];
      if (row && row.spent > 0) slices.push({ label: (c.emoji ? c.emoji + ' ' : '') + c.name, value: row.spent, color: c.color });
    });
    Object.keys(t.byCategory).forEach(function (id) {
      if (Ex.categoryById(st.categories, id)) return;
      var row = t.byCategory[id];
      if (row && row.spent > 0) slices.push({ label: id || 'Other', value: row.spent, color: '#7a7468' });
    });
    slices.sort(function (a, b) { return b.value - a.value; });

    var pie = $('pie');
    var ps = cssSize(pie, 200);
    drawDonut(pie, ps.w, Math.min(200, Math.max(160, ps.w * 0.55)), slices, t.spent, fg, mut, bg);

    var leg = '';
    slices.forEach(function (s) {
      var pct = t.spent ? Math.round(s.value / t.spent * 100) : 0;
      leg += '<div><span class="swatch" style="background:' + esc(s.color) + '"></span>' +
        '<span>' + esc(s.label) + '</span><span class="val">' + esc(Ex.rupee(s.value)) + ' · ' + pct + '%</span></div>';
    });
    $('pieLeg').innerHTML = leg || '<p class="note">No spending in this month yet.</p>';

    var y = +st.month.slice(0, 4), m = +st.month.slice(5, 7);
    var dim = Ex.daysInMonth(y, m);
    var days = [];
    var d;
    for (d = 1; d <= dim; d++) {
      var key = Ex.pad2(d);
      days.push({ day: d, spent: (t.byDay[key] && t.byDay[key].spent) || 0 });
    }
    var bars = $('bars');
    var bs = cssSize(bars, 200);
    drawBars(bars, bs.w, 200, days, fg, mut, acc, line);
  }

  function drawDonut(canvas, w, h, slices, total, fg, mut, bg) {
    var ctx = fitCanvas(canvas, w, h);
    ctx.clearRect(0, 0, w, h);
    var cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.36, inner = r * 0.58;
    if (!slices.length || !total) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = mut;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = r - inner;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = mut;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '14px system-ui,sans-serif';
      ctx.fillText('No spending', cx, cy);
      return;
    }
    var a = -Math.PI / 2, i;
    for (i = 0; i < slices.length; i++) {
      var slice = slices[i].value / total * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a, a + slice);
      ctx.closePath();
      ctx.fillStyle = slices[i].color;
      ctx.fill();
      a += slice;
    }
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 13px system-ui,sans-serif';
    ctx.fillText('Spent', cx, cy - 12);
    ctx.font = '700 15px system-ui,sans-serif';
    ctx.fillText(Ex.rupee(total), cx, cy + 10);
  }

  function drawBars(canvas, w, h, days, fg, mut, acc, line) {
    var ctx = fitCanvas(canvas, w, h);
    ctx.clearRect(0, 0, w, h);
    var padL = 8, padR = 8, padT = 16, padB = 24;
    var max = 0, i;
    for (i = 0; i < days.length; i++) if (days[i].spent > max) max = days[i].spent;
    if (max <= 0) {
      ctx.fillStyle = mut;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '14px system-ui,sans-serif';
      ctx.fillText('No spending this month', w / 2, h / 2);
      return;
    }
    /* nice y max */
    var mag = Math.pow(10, Math.floor(Math.log(max) / Math.LN10));
    var ymax = Math.ceil(max / mag) * mag;
    if (ymax < max * 1.05) ymax += mag;
    var innerW = w - padL - padR, innerH = h - padT - padB;
    var gap = days.length > 20 ? 1 : 2;
    var bw = Math.max(2, (innerW / days.length) - gap);
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT + innerH);
    ctx.lineTo(padL + innerW, padT + innerH);
    ctx.stroke();
    for (i = 0; i < days.length; i++) {
      var bh = (days[i].spent / ymax) * innerH;
      var x = padL + i * (bw + gap);
      var y = padT + innerH - bh;
      ctx.fillStyle = acc;
      ctx.globalAlpha = days[i].spent ? 0.9 : 0.15;
      ctx.fillRect(x, y, bw, Math.max(bh, days[i].spent ? 1 : 0));
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = mut;
    ctx.font = '11px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    var step = days.length > 20 ? 5 : (days.length > 10 ? 2 : 1);
    for (i = 0; i < days.length; i++) {
      if ((i + 1) === 1 || (i + 1) === days.length || ((i + 1) % step === 0 && i + 1 !== days.length - 1)) {
        ctx.fillText(String(days[i].day), padL + i * (bw + gap) + bw / 2, padT + innerH + 6);
      }
    }
  }

  function renderSettings() {
    /* categories */
    var h = '';
    st.categories.forEach(function (c) {
      h += '<li><button type="button" class="who" data-edit-cat="' + esc(c.id) + '">' +
        '<b>' + esc((c.emoji ? c.emoji + ' ' : '') + c.name) + '</b>' +
        '<span>' + (c.kind === 'income' ? 'Income' : 'Expense') + '</span></button>' +
        '<button type="button" class="mini" data-del-cat="' + esc(c.id) + '">Delete</button></li>';
    });
    $('catList').innerHTML = h;

    var recH = '';
    st.recurrences.forEach(function (r) {
      var cat = Ex.categoryById(st.categories, r.categoryId);
      var name = cat ? ((cat.emoji ? cat.emoji + ' ' : '') + cat.name) : 'Recurring';
      var day = (function (n) {
        var v = n % 100;
        if (v >= 11 && v <= 13) return n + 'th';
        var k = n % 10;
        return n + (k === 1 ? 'st' : k === 2 ? 'nd' : k === 3 ? 'rd' : 'th');
      })(r.day);
      recH += '<li><button type="button" class="who" data-edit-rec="' + esc(r.id) + '">' +
        '<b>' + esc(name) + ' · ' + esc(Ex.rupee(r.amount)) + '</b>' +
        '<span>' + (r.active === false ? 'Paused · ' : '') + 'On the ' + day + ' · ' + esc(r.mode) +
        (r.note ? ' · ' + esc(r.note) : '') + '</span></button>' +
        '<button type="button" class="mini" data-del-rec="' + esc(r.id) + '">Delete</button></li>';
    });
    $('recList').innerHTML = recH || '<p class="note">No recurring entries yet.</p>';

    $('bOverall').value = st.overallBudget ? String(st.overallBudget) : '';
    var bh = '';
    catsOf('expense').forEach(function (c) {
      var v = st.categoryBudgets[c.id];
      bh += '<label>' + esc((c.emoji ? c.emoji + ' ' : '') + c.name) + ' budget (₹)' +
        '<input class="field bcat" data-cat="' + esc(c.id) + '" inputmode="decimal" placeholder="No limit" value="' +
        (v ? esc(String(v)) : '') + '"></label>';
    });
    $('bCats').innerHTML = bh;
  }

  // ---- actions ----
  function addEntry(fields, existingId) {
    var amount = Ex.parseAmount(fields.amount);
    if (amount == null || amount <= 0) return 'Enter an amount greater than zero.';
    if (!Ex.isValidISODate(fields.date)) return 'Choose a valid date.';
    if (!fields.categoryId) return 'Choose a category.';
    var entry = {
      id: existingId || uid('e-'),
      type: fields.type === 'income' ? 'income' : 'expense',
      amount: amount,
      categoryId: fields.categoryId,
      date: fields.date,
      note: (fields.note || '').trim().slice(0, 200),
      mode: Ex.normMode(fields.mode),
      recurringId: fields.recurringId || ''
    };
    if (existingId) {
      st.entries = st.entries.map(function (e) { return e.id === existingId ? entry : e; });
    } else {
      st.entries.push(entry);
    }
    save();
    render();
    return '';
  }

  function openEntry(id) {
    var e = st.entries.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    var catOpts = catOptions(e.type).map(function (c) {
      return '<option value="' + esc(c.value) + '"' + (c.value === e.categoryId ? ' selected' : '') + '>' + esc(c.label) + '</option>';
    }).join('');
    var modeOpts = modeOptions().map(function (c) {
      return '<option value="' + esc(c.value) + '"' + (c.value === e.mode ? ' selected' : '') + '>' + esc(c.label) + '</option>';
    }).join('');
    dialog(
      '<h3 id="dlgTitle">Edit entry</h3>' +
      '<div class="seg" id="eType"><button type="button" data-v="expense"' + (e.type === 'expense' ? ' class="on"' : '') + '>Expense</button>' +
      '<button type="button" data-v="income"' + (e.type === 'income' ? ' class="on"' : '') + '>Income</button></div>' +
      '<label>Amount (₹)<input id="eAmt" class="field" inputmode="decimal" value="' + esc(String(e.amount)) + '"></label>' +
      '<label>Category<select id="eCat" class="field">' + catOpts + '</select></label>' +
      '<label>Date<input id="eDate" class="field" type="date" value="' + esc(e.date) + '"></label>' +
      '<label>Paid by<select id="eMode" class="field">' + modeOpts + '</select></label>' +
      '<label>Note<input id="eNote" class="field" maxlength="200" value="' + esc(e.note || '') + '"></label>' +
      '<p class="err" id="eErr"></p>',
      [
        { label: 'Delete', cls: 'danger', fn: function () { confirmDelete(e); return false; } },
        { label: 'Cancel', cls: 'ghost' },
        { label: 'Save', fn: function () {
          var typeBtn = $('eType').querySelector('.on');
          var err = addEntry({
            type: typeBtn ? typeBtn.getAttribute('data-v') : e.type,
            amount: $('eAmt').value,
            categoryId: $('eCat').value,
            date: $('eDate').value,
            mode: $('eMode').value,
            note: $('eNote').value,
            recurringId: e.recurringId
          }, e.id);
          if (err) { $('eErr').textContent = err; return false; }
        } }
      ],
      function () {
        $('eAmt').focus();
        $('eType').addEventListener('click', function (ev) {
          var b = ev.target.closest('button');
          if (!b) return;
          var typ = b.getAttribute('data-v');
          var btns = $('eType').querySelectorAll('button');
          var i;
          for (i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i] === b);
          var cur = $('eCat').value;
          fillSelect($('eCat'), catOptions(typ), cur, null);
        });
      }
    );
  }

  function confirmDelete(e) {
    var cat = Ex.categoryById(st.categories, e.categoryId);
    var name = cat ? cat.name : 'this entry';
    dialog(
      '<h3 id="dlgTitle">Delete entry?</h3><p>This will remove ' + esc(Ex.rupee(e.amount)) +
      ' in ' + esc(name) + ' on ' + esc(Ex.formatDayHead(e.date)) + '. This cannot be undone.</p>',
      [
        { label: 'Cancel', cls: 'ghost' },
        { label: 'Delete', cls: 'danger', fn: function () {
          st.entries = st.entries.filter(function (x) { return x.id !== e.id; });
          if (e.recurringId) {
            var key = Ex.recKey(e.recurringId, e.date);
            if (st.cancelledRecurring.indexOf(key) === -1) st.cancelledRecurring.push(key);
          }
          save();
          render();
        } }
      ]
    );
  }

  function editCategory(cat) {
    var c = cat || { id: '', name: '', emoji: '📦', color: '#7a7468', kind: 'expense' };
    dialog(
      '<h3 id="dlgTitle">' + (cat ? 'Edit category' : 'Add category') + '</h3>' +
      '<label>Name<input id="cName" class="field" maxlength="40" value="' + esc(c.name) + '"></label>' +
      '<label>Emoji (optional)<input id="cEmoji" class="field" maxlength="4" value="' + esc(c.emoji || '') + '"></label>' +
      '<label>Colour<span class="color-row"><input id="cColor" type="color" value="' + esc(c.color || '#7a7468') + '"></span></label>' +
      '<div class="seg" id="cKind" style="margin-top:12px"><button type="button" data-v="expense"' + (c.kind !== 'income' ? ' class="on"' : '') + '>Expense</button>' +
      '<button type="button" data-v="income"' + (c.kind === 'income' ? ' class="on"' : '') + '>Income</button></div>' +
      '<p class="err" id="cErr"></p>',
      [
        { label: 'Cancel', cls: 'ghost' },
        { label: 'Save', fn: function () {
          var name = $('cName').value.trim();
          if (!name) { $('cErr').textContent = 'Enter a name.'; return false; }
          var kindBtn = $('cKind').querySelector('.on');
          var kind = kindBtn && kindBtn.getAttribute('data-v') === 'income' ? 'income' : 'expense';
          var color = $('cColor').value || '#7a7468';
          var emoji = $('cEmoji').value.trim().slice(0, 4);
          if (cat) {
            cat.name = name; cat.emoji = emoji; cat.color = color; cat.kind = kind;
          } else {
            st.categories.push({ id: uid('c-'), name: name, emoji: emoji, color: color, kind: kind });
          }
          save();
          render();
        } }
      ],
      function () {
        $('cName').focus();
        $('cKind').addEventListener('click', function (ev) {
          var b = ev.target.closest('button');
          if (!b) return;
          var btns = $('cKind').querySelectorAll('button');
          var i;
          for (i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i] === b);
        });
      }
    );
  }

  function deleteCategory(id) {
    var c = Ex.categoryById(st.categories, id);
    if (!c) return;
    var used = st.entries.some(function (e) { return e.categoryId === id; }) ||
      st.recurrences.some(function (r) { return r.categoryId === id; });
    var same = catsOf(c.kind);
    if (same.length <= 1) {
      dialog('<h3 id="dlgTitle">Keep this category</h3><p>You need at least one ' + esc(c.kind) + ' category.</p>',
        [{ label: 'OK' }]);
      return;
    }
    var other = Ex.fallbackCategory(st.categories.filter(function (x) { return x.id !== id; }), c.kind);
    var msg = used
      ? '<p>Existing entries in ' + esc(c.name) + ' will move to ' + esc(other ? other.name : 'Other') + '.</p>'
      : '<p>Remove ' + esc(c.name) + '?</p>';
    dialog('<h3 id="dlgTitle">Delete category?</h3>' + msg, [
      { label: 'Cancel', cls: 'ghost' },
      { label: 'Delete', cls: 'danger', fn: function () {
        var to = other ? other.id : '';
        st.entries.forEach(function (e) { if (e.categoryId === id) e.categoryId = to; });
        st.recurrences.forEach(function (r) { if (r.categoryId === id) r.categoryId = to; });
        delete st.categoryBudgets[id];
        st.categories = st.categories.filter(function (x) { return x.id !== id; });
        save();
        render();
      } }
    ]);
  }

  function editRecurrence(rec) {
    var r = rec || {
      id: '', type: 'expense', amount: '', categoryId: (catsOf('expense')[0] || {}).id,
      note: '', mode: 'Bank', start: Ex.todayISO(), day: 1, active: true
    };
    var typ = r.type || 'expense';
    function opts(kind, sel) {
      return catOptions(kind).map(function (c) {
        return '<option value="' + esc(c.value) + '"' + (c.value === sel ? ' selected' : '') + '>' + esc(c.label) + '</option>';
      }).join('');
    }
    var modeOpts = modeOptions().map(function (c) {
      return '<option value="' + esc(c.value) + '"' + (c.value === (r.mode || 'Bank') ? ' selected' : '') + '>' + esc(c.label) + '</option>';
    }).join('');
    dialog(
      '<h3 id="dlgTitle">' + (rec ? 'Edit recurring' : 'Add recurring') + '</h3>' +
      '<div class="seg" id="rType"><button type="button" data-v="expense"' + (typ !== 'income' ? ' class="on"' : '') + '>Expense</button>' +
      '<button type="button" data-v="income"' + (typ === 'income' ? ' class="on"' : '') + '>Income</button></div>' +
      '<label>Amount (₹)<input id="rAmt" class="field" inputmode="decimal" value="' + esc(r.amount ? String(r.amount) : '') + '"></label>' +
      '<label>Category<select id="rCat" class="field">' + opts(typ, r.categoryId) + '</select></label>' +
      '<label>Day of month<input id="rDay" class="field" type="number" min="1" max="31" value="' + esc(String(r.day || 1)) + '"></label>' +
      '<label>Start from<input id="rStart" class="field" type="date" value="' + esc(r.start || Ex.todayISO()) + '"></label>' +
      '<label>Paid by<select id="rMode" class="field">' + modeOpts + '</select></label>' +
      '<label>Note<input id="rNote" class="field" maxlength="200" value="' + esc(r.note || '') + '"></label>' +
      (rec ? '<div class="seg" id="rAct" style="margin-top:12px"><button type="button" data-v="on"' + (r.active !== false ? ' class="on"' : '') + '>Active</button>' +
        '<button type="button" data-v="off"' + (r.active === false ? ' class="on"' : '') + '>Paused</button></div>' : '') +
      '<p class="err" id="rErr"></p>',
      [
        { label: 'Cancel', cls: 'ghost' },
        { label: 'Save', fn: function () {
          var amount = Ex.parseAmount($('rAmt').value);
          var day = parseInt($('rDay').value, 10);
          var start = $('rStart').value;
          if (amount == null || amount <= 0) { $('rErr').textContent = 'Enter an amount greater than zero.'; return false; }
          if (!day || day < 1 || day > 31) { $('rErr').textContent = 'Day must be between 1 and 31.'; return false; }
          if (!Ex.isValidISODate(start)) { $('rErr').textContent = 'Choose a valid start date.'; return false; }
          var typeBtn = $('rType').querySelector('.on');
          var typ2 = typeBtn && typeBtn.getAttribute('data-v') === 'income' ? 'income' : 'expense';
          var active = true;
          if ($('rAct')) {
            var ab = $('rAct').querySelector('.on');
            active = !(ab && ab.getAttribute('data-v') === 'off');
          }
          var obj = {
            id: rec ? rec.id : uid('r-'),
            type: typ2,
            amount: amount,
            categoryId: $('rCat').value,
            note: $('rNote').value.trim().slice(0, 200),
            mode: $('rMode').value,
            start: start,
            day: day,
            active: active
          };
          if (rec) {
            st.recurrences = st.recurrences.map(function (x) { return x.id === rec.id ? obj : x; });
          } else {
            st.recurrences.push(obj);
          }
          var exp = Ex.expandRecurring(st.recurrences, st.entries, st.cancelledRecurring, Ex.todayISO());
          st.entries = exp.entries;
          save();
          render();
          if (exp.added.length) toast('Added ' + exp.added.length + ' due entr' + (exp.added.length === 1 ? 'y' : 'ies') + '.');
        } }
      ],
      function () {
        $('rAmt').focus();
        function hook(id) {
          var el = $(id);
          if (!el) return;
          el.addEventListener('click', function (ev) {
            var b = ev.target.closest('button');
            if (!b) return;
            var btns = el.querySelectorAll('button');
            var i;
            for (i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i] === b);
            if (id === 'rType') fillSelect($('rCat'), catOptions(b.getAttribute('data-v')), $('rCat').value, null);
          });
        }
        hook('rType');
        hook('rAct');
      }
    );
  }

  function deleteRecurrence(id) {
    var r = st.recurrences.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    dialog(
      '<h3 id="dlgTitle">Delete recurring entry?</h3><p>Future months will no longer be added automatically. Entries already added stay in the list.</p>',
      [
        { label: 'Cancel', cls: 'ghost' },
        { label: 'Delete', cls: 'danger', fn: function () {
          st.recurrences = st.recurrences.filter(function (x) { return x.id !== id; });
          save();
          render();
        } }
      ]
    );
  }

  function saveBudgets() {
    var overall = Ex.parseAmount($('bOverall').value);
    st.overallBudget = overall && overall > 0 ? overall : 0;
    st.categoryBudgets = {};
    var inputs = $('bCats').querySelectorAll('.bcat');
    var i;
    for (i = 0; i < inputs.length; i++) {
      var v = Ex.parseAmount(inputs[i].value);
      if (v && v > 0) st.categoryBudgets[inputs[i].getAttribute('data-cat')] = v;
    }
    save();
    render();
    toast('Budgets saved.');
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function exportCsv() {
    download('expense-tracker-' + Ex.todayISO() + '.csv', Ex.entriesToCsv(st.entries, st.categories), 'text/csv;charset=utf-8');
  }

  function exportJson() {
    download('expense-tracker-backup-' + Ex.todayISO() + '.json', JSON.stringify(Ex.backupWrap(st, RELEASE), null, 2), 'application/json');
  }

  function importCsvText(text) {
    var res = Ex.parseCsv(text, st.categories, function (i) { return uid('imp-') + i; });
    if (!res.added.length) {
      dialog('<h3 id="dlgTitle">Nothing imported</h3><p>' + esc((res.errors && res.errors[0]) || 'No valid rows were found.') + '</p>', [{ label: 'OK' }]);
      return;
    }
    dialog(
      '<h3 id="dlgTitle">Import CSV?</h3><p>This will add ' + res.added.length + ' entr' + (res.added.length === 1 ? 'y' : 'ies') +
      (res.skipped ? ' and skip ' + res.skipped + ' row' + (res.skipped === 1 ? '' : 's') : '') +
      '. Existing entries are kept.</p>',
      [
        { label: 'Cancel', cls: 'ghost' },
        { label: 'Import', fn: function () {
          st.entries = st.entries.concat(res.added);
          save();
          render();
          toast('Imported ' + res.added.length + ' entries.');
        } }
      ]
    );
  }

  function restoreBackup(obj) {
    var parsed = Ex.parseBackup(obj);
    if (parsed.error) {
      dialog('<h3 id="dlgTitle">Could not restore</h3><p>' + esc(parsed.error) + '</p>', [{ label: 'OK' }]);
      return;
    }
    dialog(
      '<h3 id="dlgTitle">Restore backup?</h3><p>This replaces every entry, category, budget and recurring rule on this device with the backup.</p>',
      [
        { label: 'Cancel', cls: 'ghost' },
        { label: 'Restore', cls: 'danger', fn: function () {
          var month = st.month;
          st = parsed.state;
          st.month = month;
          var exp = Ex.expandRecurring(st.recurrences, st.entries, st.cancelledRecurring, Ex.todayISO());
          st.entries = exp.entries;
          save();
          render();
          toast('Backup restored.');
        } }
      ]
    );
  }

  function readFile(input, cb) {
    var f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () { cb(String(reader.result || '')); };
    reader.onerror = function () { toast('Could not read that file.'); };
    reader.readAsText(f);
  }

  // ---- events ----
  $('typeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    qType = b.getAttribute('data-v') === 'income' ? 'income' : 'expense';
    var btns = $('typeSeg').querySelectorAll('button');
    var i;
    for (i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i] === b);
    fillQuickCats();
  });

  $('quick').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = addEntry({
      type: qType,
      amount: $('qAmt').value,
      categoryId: $('qCat').value,
      date: $('qDate').value,
      mode: $('qMode').value,
      note: $('qNote').value
    });
    $('qErr').textContent = err || '';
    if (!err) {
      $('qAmt').value = '';
      $('qNote').value = '';
      $('qAmt').focus();
    }
  });

  $('prevM').addEventListener('click', function () { st.month = Ex.shiftMonth(st.month, -1); save(); render(); });
  $('nextM').addEventListener('click', function () { st.month = Ex.shiftMonth(st.month, 1); save(); render(); });
  $('monthBtn').addEventListener('click', function () { st.month = monthNow; save(); render(); });

  $('search').addEventListener('input', function () { renderList(); });
  $('fCat').addEventListener('change', function () { renderList(); });
  $('fMode').addEventListener('change', function () { renderList(); });

  $('list').addEventListener('click', function (e) {
    var b = e.target.closest('.entry');
    if (b) openEntry(b.getAttribute('data-id'));
  });

  $('menuBtn').addEventListener('click', function () { showPane('set'); renderSettings(); applyTheme(); });
  $('setBack').addEventListener('click', function () { showPane('main'); render(); });

  $('themeSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    st.theme = b.getAttribute('data-v');
    save();
    applyTheme();
  });

  $('catAdd').addEventListener('click', function () { editCategory(null); });
  $('catList').addEventListener('click', function (e) {
    var ed = e.target.closest('[data-edit-cat]');
    var del = e.target.closest('[data-del-cat]');
    if (ed) editCategory(Ex.categoryById(st.categories, ed.getAttribute('data-edit-cat')));
    else if (del) deleteCategory(del.getAttribute('data-del-cat'));
  });

  $('recAdd').addEventListener('click', function () { editRecurrence(null); });
  $('recList').addEventListener('click', function (e) {
    var ed = e.target.closest('[data-edit-rec]');
    var del = e.target.closest('[data-del-rec]');
    if (ed) {
      var rec = st.recurrences.filter(function (x) { return x.id === ed.getAttribute('data-edit-rec'); })[0];
      if (rec) editRecurrence(rec);
    } else if (del) deleteRecurrence(del.getAttribute('data-del-rec'));
  });

  $('bSave').addEventListener('click', saveBudgets);
  $('csvOut').addEventListener('click', exportCsv);
  $('jsonOut').addEventListener('click', exportJson);
  $('csvInBtn').addEventListener('click', function () { $('csvIn').click(); });
  $('jsonInBtn').addEventListener('click', function () { $('jsonIn').click(); });
  $('csvIn').addEventListener('change', function () {
    readFile($('csvIn'), importCsvText);
  });
  $('jsonIn').addEventListener('change', function () {
    readFile($('jsonIn'), function (text) {
      try { restoreBackup(JSON.parse(text)); }
      catch (err) { dialog('<h3 id="dlgTitle">Could not restore</h3><p>That file is not valid JSON.</p>', [{ label: 'OK' }]); }
    });
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (view === 'main') renderCharts(); }, 120);
  });

  // ---- start ----
  fillModes($('qMode'), 'UPI');
  $('qDate').value = Ex.todayISO();
  load();
  render();
  window.ExpenseTracker = { RELEASE: RELEASE };
})();
