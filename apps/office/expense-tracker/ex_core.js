/* EXT1 Expense Tracker — pure helpers (no DOM).
   Used by expense-tracker.js in the browser and by test_ex_core.js in Node. */
(function (root) {
  'use strict';

  var MODES = ['Cash', 'UPI', 'Card', 'Bank'];
  var TYPES = ['expense', 'income'];

  var DEFAULT_CATEGORIES = [
    { id: 'food', name: 'Food', emoji: '\uD83C\uDF5B', color: '#e07a3d', kind: 'expense' },
    { id: 'groceries', name: 'Groceries', emoji: '\uD83D\uDED2', color: '#3d8b6e', kind: 'expense' },
    { id: 'transport', name: 'Transport', emoji: '\uD83D\uDE8C', color: '#3d6fb8', kind: 'expense' },
    { id: 'fuel', name: 'Fuel', emoji: '\u26FD', color: '#c45c26', kind: 'expense' },
    { id: 'bills', name: 'Bills', emoji: '\uD83D\uDCA1', color: '#7a5af0', kind: 'expense' },
    { id: 'rent', name: 'Rent', emoji: '\uD83C\uDFE0', color: '#5b7c99', kind: 'expense' },
    { id: 'shopping', name: 'Shopping', emoji: '\uD83D\uDECD', color: '#c44b7a', kind: 'expense' },
    { id: 'health', name: 'Health', emoji: '\uD83D\uDC8A', color: '#2a9d8f', kind: 'expense' },
    { id: 'education', name: 'Education', emoji: '\uD83D\uDCDA', color: '#2d6a9f', kind: 'expense' },
    { id: 'entertainment', name: 'Entertainment', emoji: '\uD83C\uDFAC', color: '#b53d6a', kind: 'expense' },
    { id: 'other', name: 'Other', emoji: '\uD83D\uDCE6', color: '#7a7468', kind: 'expense' },
    { id: 'salary', name: 'Salary', emoji: '\uD83D\uDCBC', color: '#1f7a4d', kind: 'income' },
    { id: 'business', name: 'Business', emoji: '\uD83C\uDFEA', color: '#3d7c4a', kind: 'income' },
    { id: 'interest', name: 'Interest', emoji: '\uD83D\uDCC8', color: '#2e6b8a', kind: 'income' },
    { id: 'other-income', name: 'Other income', emoji: '\uD83D\uDCB0', color: '#4a8f5c', kind: 'income' }
  ];

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function isValidISODate(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    var y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  function todayISO(now) {
    var d = now ? new Date(now) : new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function monthKey(iso) {
    if (!isValidISODate(iso)) return '';
    return iso.slice(0, 7);
  }

  function daysInMonth(year, month /* 1-12 */) {
    return new Date(year, month, 0).getDate();
  }

  function occurrenceDate(year, month, day) {
    var dim = daysInMonth(year, month);
    var d = day > dim ? dim : day;
    if (d < 1) d = 1;
    return year + '-' + pad2(month) + '-' + pad2(d);
  }

  function shiftMonth(yyyyMm, delta) {
    var y = +yyyyMm.slice(0, 4), m = +yyyyMm.slice(5, 7) + delta;
    while (m < 1) { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    return y + '-' + pad2(m);
  }

  function monthLabel(yyyyMm) {
    var months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    var y = +yyyyMm.slice(0, 4), m = +yyyyMm.slice(5, 7);
    if (!y || m < 1 || m > 12) return yyyyMm || '';
    return months[m - 1] + ' ' + y;
  }

  /* Indian grouping: 1,23,456.00 */
  function formatINR(n) {
    var num = Number(n);
    if (!isFinite(num)) num = 0;
    var neg = num < 0;
    num = Math.abs(num);
    var parts = num.toFixed(2).split('.');
    var intp = parts[0];
    var dec = parts[1];
    var last3 = intp.length > 3 ? intp.slice(-3) : intp;
    var rest = intp.length > 3 ? intp.slice(0, -3) : '';
    if (rest) {
      rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
      intp = rest + ',' + last3;
    } else {
      intp = last3;
    }
    return (neg ? '-' : '') + intp + '.' + dec;
  }

  function rupee(n) {
    var s = formatINR(n);
    return s.charAt(0) === '-' ? '-₹' + s.slice(1) : '₹' + s;
  }

  /* Accept 1234.5, 1,234.50, 1,23,456.00, ₹250, (250) */
  function parseAmount(s) {
    if (typeof s === 'number') return isFinite(s) ? Math.round(s * 100) / 100 : null;
    if (s == null) return null;
    var t = String(s).trim();
    if (!t) return null;
    var neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    t = t.replace(/₹/g, '').replace(/,/g, '').replace(/\s+/g, '');
    if (t.charAt(0) === '-') { neg = !neg; t = t.slice(1); }
    if (t.charAt(0) === '+') t = t.slice(1);
    if (!/^\d+(\.\d{1,2})?$/.test(t) && !/^\d+\.\d+$/.test(t)) {
      if (!/^\d+(\.\d+)?$/.test(t)) return null;
    }
    var n = Math.round(parseFloat(t) * 100) / 100;
    if (!isFinite(n)) return null;
    if (neg) n = -n;
    return n;
  }

  function emptyState() {
    return {
      version: 1,
      theme: 'auto',
      categories: DEFAULT_CATEGORIES.map(function (c) {
        return { id: c.id, name: c.name, emoji: c.emoji, color: c.color, kind: c.kind };
      }),
      entries: [],
      recurrences: [],
      cancelledRecurring: [],
      overallBudget: 0,
      categoryBudgets: {},
      month: ''
    };
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function normalizeState(raw) {
    var st = emptyState();
    if (!raw || typeof raw !== 'object') return st;
    if (raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'auto') st.theme = raw.theme;
    if (Array.isArray(raw.categories) && raw.categories.length) {
      st.categories = raw.categories.map(normCategory).filter(Boolean);
    }
    if (!st.categories.length) st.categories = emptyState().categories;
    if (Array.isArray(raw.entries)) st.entries = raw.entries.map(normEntry).filter(Boolean);
    if (Array.isArray(raw.recurrences)) st.recurrences = raw.recurrences.map(normRecurrence).filter(Boolean);
    if (Array.isArray(raw.cancelledRecurring)) {
      st.cancelledRecurring = raw.cancelledRecurring.map(function (x) { return String(x); }).filter(Boolean);
    }
    var b = parseAmount(raw.overallBudget);
    st.overallBudget = b && b > 0 ? b : 0;
    st.categoryBudgets = {};
    if (raw.categoryBudgets && typeof raw.categoryBudgets === 'object') {
      Object.keys(raw.categoryBudgets).forEach(function (k) {
        var v = parseAmount(raw.categoryBudgets[k]);
        if (v && v > 0) st.categoryBudgets[k] = v;
      });
    }
    if (raw.month && /^\d{4}-\d{2}$/.test(raw.month)) st.month = raw.month;
    return st;
  }

  function normCategory(c) {
    if (!c || !c.id || !c.name) return null;
    var kind = c.kind === 'income' ? 'income' : 'expense';
    var color = typeof c.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : '#7a7468';
    var emoji = (c.emoji && String(c.emoji).slice(0, 4)) || (kind === 'income' ? '\uD83D\uDCB0' : '\uD83D\uDCE6');
    return { id: String(c.id), name: String(c.name).slice(0, 40), emoji: emoji, color: color, kind: kind };
  }

  function normEntry(e) {
    if (!e) return null;
    var amount = parseAmount(e.amount);
    if (amount == null || amount <= 0) return null;
    if (!isValidISODate(e.date)) return null;
    var type = e.type === 'income' ? 'income' : 'expense';
    var mode = normMode(e.mode);
    return {
      id: String(e.id || ''),
      type: type,
      amount: amount,
      categoryId: String(e.categoryId || ''),
      date: e.date,
      note: e.note ? String(e.note).slice(0, 200) : '',
      mode: mode,
      recurringId: e.recurringId ? String(e.recurringId) : ''
    };
  }

  function normMode(m) {
    var s = String(m || 'Cash');
    var i, low = s.toLowerCase();
    for (i = 0; i < MODES.length; i++) if (MODES[i].toLowerCase() === low) return MODES[i];
    return 'Cash';
  }

  function normRecurrence(r) {
    if (!r || !r.id) return null;
    var amount = parseAmount(r.amount);
    if (amount == null || amount <= 0) return null;
    if (!isValidISODate(r.start)) return null;
    var day = parseInt(r.day, 10);
    if (!day || day < 1 || day > 31) day = +r.start.slice(8, 10) || 1;
    var out = {
      id: String(r.id),
      type: r.type === 'income' ? 'income' : 'expense',
      amount: amount,
      categoryId: String(r.categoryId || ''),
      note: r.note ? String(r.note).slice(0, 200) : '',
      mode: normMode(r.mode),
      start: r.start,
      day: day,
      active: r.active !== false
    };
    if (r.until && isValidISODate(r.until)) out.until = r.until;
    return out;
  }

  function inMonth(iso, yyyyMm) {
    return monthKey(iso) === yyyyMm;
  }

  function monthTotals(entries, yyyyMm) {
    var income = 0, spent = 0, count = 0;
    var byCategory = {}, byDay = {}, byMode = {};
    var y = +yyyyMm.slice(0, 4), m = +yyyyMm.slice(5, 7);
    var dim = (y && m) ? daysInMonth(y, m) : 0;
    var i, d;
    for (d = 1; d <= dim; d++) byDay[pad2(d)] = { spent: 0, income: 0 };
    var list = entries || [];
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !inMonth(e.date, yyyyMm)) continue;
      count += 1;
      var cat = e.categoryId || '';
      if (!byCategory[cat]) byCategory[cat] = { spent: 0, income: 0, count: 0 };
      byCategory[cat].count += 1;
      var mode = normMode(e.mode);
      if (!byMode[mode]) byMode[mode] = { spent: 0, income: 0, count: 0 };
      byMode[mode].count += 1;
      var day = e.date.slice(8, 10);
      if (e.type === 'income') {
        income += e.amount;
        byCategory[cat].income += e.amount;
        byMode[mode].income += e.amount;
        if (byDay[day]) byDay[day].income += e.amount;
      } else {
        spent += e.amount;
        byCategory[cat].spent += e.amount;
        byMode[mode].spent += e.amount;
        if (byDay[day]) byDay[day].spent += e.amount;
      }
    }
    return {
      income: round2(income),
      spent: round2(spent),
      balance: round2(income - spent),
      count: count,
      byCategory: byCategory,
      byDay: byDay,
      byMode: byMode
    };
  }

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  function budgetStatus(totals, overallBudget, categoryBudgets, categories) {
    var spent = totals ? totals.spent : 0;
    var overall = null;
    var b = Number(overallBudget) || 0;
    if (b > 0) {
      overall = {
        budget: b,
        spent: spent,
        remaining: round2(b - spent),
        ratio: spent / b,
        over: spent > b
      };
    }
    var cats = [];
    var budgets = categoryBudgets || {};
    var catList = categories || [];
    var seen = {};
    function pushCat(id, name) {
      var cb = Number(budgets[id]) || 0;
      if (cb <= 0) return;
      var row = (totals && totals.byCategory && totals.byCategory[id]) || { spent: 0 };
      cats.push({
        id: id,
        name: name || id,
        budget: cb,
        spent: row.spent || 0,
        remaining: round2(cb - (row.spent || 0)),
        ratio: (row.spent || 0) / cb,
        over: (row.spent || 0) > cb
      });
      seen[id] = true;
    }
    var i;
    for (i = 0; i < catList.length; i++) {
      if (catList[i].kind === 'income') continue;
      pushCat(catList[i].id, (catList[i].emoji ? catList[i].emoji + ' ' : '') + catList[i].name);
    }
    Object.keys(budgets).forEach(function (id) {
      if (!seen[id]) pushCat(id, id);
    });
    return { overall: overall, categories: cats };
  }

  function recKey(recId, date) {
    return recId + ':' + date;
  }

  /* Add any due monthly recurrences on or before today that are not already
     present and have not been cancelled (deleted by the user). */
  function expandRecurring(recurrences, entries, cancelled, today) {
    var added = [];
    var have = {};
    var i;
    var list = entries || [];
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].recurringId && list[i].date) {
        have[recKey(list[i].recurringId, list[i].date)] = true;
      }
    }
    var skip = {};
    var cancelledList = cancelled || [];
    for (i = 0; i < cancelledList.length; i++) skip[cancelledList[i]] = true;
    if (!isValidISODate(today)) return { added: [], entries: list.slice() };

    var recs = recurrences || [];
    for (i = 0; i < recs.length; i++) {
      var r = recs[i];
      if (!r || r.active === false || !isValidISODate(r.start)) continue;
      var dates = occurrenceDates(r, today);
      var j;
      for (j = 0; j < dates.length; j++) {
        var key = recKey(r.id, dates[j]);
        if (have[key] || skip[key]) continue;
        var entry = {
          id: 'rec-' + r.id + '-' + dates[j],
          type: r.type === 'income' ? 'income' : 'expense',
          amount: r.amount,
          categoryId: r.categoryId,
          date: dates[j],
          note: r.note || '',
          mode: normMode(r.mode),
          recurringId: r.id
        };
        added.push(entry);
        have[key] = true;
      }
    }
    return { added: added, entries: list.concat(added) };
  }

  function occurrenceDates(r, today) {
    var out = [];
    var start = r.start;
    var until = (r.until && r.until < today) ? r.until : today;
    if (until < start) return out;
    var y = +start.slice(0, 4), m = +start.slice(5, 7);
    var endY = +until.slice(0, 4), endM = +until.slice(5, 7);
    var guard = 0;
    while (y < endY || (y === endY && m <= endM)) {
      var iso = occurrenceDate(y, m, r.day);
      if (iso >= start && iso <= until) out.push(iso);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
      guard += 1;
      if (guard > 600) break; /* ~50 years */
    }
    return out;
  }

  function categoryById(categories, id) {
    var i, list = categories || [];
    for (i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function categoryByName(categories, name) {
    var n = String(name || '').trim().toLowerCase();
    var i, list = categories || [];
    for (i = 0; i < list.length; i++) if (list[i].name.toLowerCase() === n) return list[i];
    return null;
  }

  function fallbackCategory(categories, kind) {
    var want = kind === 'income' ? 'income' : 'expense';
    var i, list = categories || [], other = null, any = null;
    for (i = 0; i < list.length; i++) {
      if (list[i].kind !== want) continue;
      if (!any) any = list[i];
      if (/^other/i.test(list[i].name) || list[i].id === 'other' || list[i].id === 'other-income') return list[i];
      if (!other && /other/i.test(list[i].id)) other = list[i];
    }
    return other || any || null;
  }

  function csvEscape(s) {
    var t = s == null ? '' : String(s);
    if (/[",\n\r]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  }

  function entriesToCsv(entries, categories) {
    var lines = ['Date,Type,Amount,Category,Note,Mode'];
    var list = (entries || []).slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.id || '') < (b.id || '') ? -1 : 1;
    });
    var i;
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      var cat = categoryById(categories, e.categoryId);
      var name = cat ? cat.name : e.categoryId;
      lines.push([
        csvEscape(e.date),
        csvEscape(e.type),
        csvEscape(Number(e.amount).toFixed(2)),
        csvEscape(name),
        csvEscape(e.note || ''),
        csvEscape(normMode(e.mode))
      ].join(','));
    }
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  function splitCsvLine(line) {
    var out = [], cur = '', i, inQ = false;
    for (i = 0; i < line.length; i++) {
      var c = line[i];
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i += 1; }
          else inQ = false;
        } else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  }

  function parseCsv(text, categories, idFn) {
    var raw = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var lines = raw.split('\n').filter(function (l) { return l.trim() !== ''; });
    var added = [];
    var errors = [];
    if (!lines.length) return { added: added, errors: ['The file is empty.'], skipped: 0 };
    var header = splitCsvLine(lines[0]).map(function (h) { return h.trim().toLowerCase(); });
    var col = {};
    function findCol(names) {
      var i, j;
      for (i = 0; i < names.length; i++) {
        j = header.indexOf(names[i]);
        if (j !== -1) return j;
      }
      return -1;
    }
    col.date = findCol(['date']);
    col.type = findCol(['type', 'kind']);
    col.amount = findCol(['amount', 'amt', 'value']);
    col.category = findCol(['category', 'cat']);
    col.note = findCol(['note', 'notes', 'description', 'narration']);
    col.mode = findCol(['mode', 'payment', 'payment mode', 'method']);
    var start = 0;
    if (col.date !== -1 && col.amount !== -1) start = 1;
    else {
      /* no header: try first cell as a date */
      col = { date: 0, type: 1, amount: 2, category: 3, note: 4, mode: 5 };
      start = 0;
    }
    if (col.date === -1 || col.amount === -1) {
      return { added: added, errors: ['Could not find Date and Amount columns.'], skipped: 0 };
    }
    var skipped = 0;
    var i;
    for (i = start; i < lines.length; i++) {
      var cells = splitCsvLine(lines[i]);
      var date = (cells[col.date] || '').trim();
      if (!isValidISODate(date)) {
        /* also accept DD/MM/YYYY or D/M/YYYY */
        var dm = date.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
        if (dm) {
          date = dm[3] + '-' + pad2(+dm[2]) + '-' + pad2(+dm[1]);
        }
      }
      var amount = parseAmount(cells[col.amount]);
      var typeRaw = col.type >= 0 ? String(cells[col.type] || '').trim().toLowerCase() : 'expense';
      var type = (typeRaw === 'income' || typeRaw === 'in' || typeRaw === 'credit' || typeRaw === 'cr') ? 'income' : 'expense';
      if (!isValidISODate(date) || amount == null || amount <= 0) {
        skipped += 1;
        errors.push('Row ' + (i + 1) + ' was skipped.');
        continue;
      }
      var catName = col.category >= 0 ? (cells[col.category] || '').trim() : '';
      var cat = categoryByName(categories, catName);
      if (cat && cat.kind !== type) cat = null;
      if (!cat) cat = fallbackCategory(categories, type);
      var note = col.note >= 0 ? String(cells[col.note] || '').slice(0, 200) : '';
      if (catName && !categoryByName(categories, catName) && catName) {
        note = note ? (note + ' [' + catName + ']') : ('[' + catName + ']');
      }
      var id = idFn ? idFn(i) : ('imp-' + date + '-' + i);
      added.push({
        id: String(id),
        type: type,
        amount: amount,
        categoryId: cat ? cat.id : '',
        date: date,
        note: note,
        mode: col.mode >= 0 ? normMode(cells[col.mode]) : 'Cash',
        recurringId: ''
      });
    }
    return { added: added, errors: errors, skipped: skipped };
  }

  function backupWrap(state, release) {
    return {
      type: 'hub-expense-tracker-backup',
      format: 1,
      released: release || 'EXT1',
      exported: new Date().toISOString(),
      data: clone(normalizeState(state))
    };
  }

  function parseBackup(obj) {
    if (!obj || typeof obj !== 'object') return { error: 'That file is not a valid backup.' };
    if (obj.type && obj.type !== 'hub-expense-tracker-backup') {
      return { error: 'That file is not an Expense Tracker backup.' };
    }
    var data = obj.data || obj;
    return { state: normalizeState(data) };
  }

  function filterEntries(entries, opts) {
    opts = opts || {};
    return (entries || []).filter(function (e) {
      if (opts.month && !inMonth(e.date, opts.month)) return false;
      if (opts.categoryId && e.categoryId !== opts.categoryId) return false;
      if (opts.mode && normMode(e.mode) !== normMode(opts.mode)) return false;
      if (opts.type && e.type !== opts.type) return false;
      if (opts.query) {
        var q = String(opts.query).trim().toLowerCase();
        if (!q) return true;
        var cat = categoryById(opts.categories, e.categoryId);
        var blob = [
          e.note || '',
          e.mode || '',
          e.type || '',
          e.amount,
          formatINR(e.amount),
          cat ? cat.name : '',
          cat ? cat.emoji : '',
          e.date
        ].join(' ').toLowerCase();
        if (blob.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function groupByDay(entries) {
    var groups = [], map = {}, i;
    var list = (entries || []).slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date > b.date ? -1 : 1;
      return (a.id || '') > (b.id || '') ? -1 : 1;
    });
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      if (!map[e.date]) {
        map[e.date] = { date: e.date, entries: [], spent: 0, income: 0 };
        groups.push(map[e.date]);
      }
      map[e.date].entries.push(e);
      if (e.type === 'income') map[e.date].income += e.amount;
      else map[e.date].spent += e.amount;
    }
    return groups;
  }

  function formatDayHead(iso) {
    if (!isValidISODate(iso)) return iso || '';
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var d = new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
    return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  var api = {
    MODES: MODES,
    TYPES: TYPES,
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    pad2: pad2,
    isValidISODate: isValidISODate,
    todayISO: todayISO,
    monthKey: monthKey,
    daysInMonth: daysInMonth,
    occurrenceDate: occurrenceDate,
    occurrenceDates: occurrenceDates,
    shiftMonth: shiftMonth,
    monthLabel: monthLabel,
    formatINR: formatINR,
    rupee: rupee,
    parseAmount: parseAmount,
    emptyState: emptyState,
    normalizeState: normalizeState,
    normMode: normMode,
    monthTotals: monthTotals,
    budgetStatus: budgetStatus,
    expandRecurring: expandRecurring,
    recKey: recKey,
    categoryById: categoryById,
    categoryByName: categoryByName,
    fallbackCategory: fallbackCategory,
    entriesToCsv: entriesToCsv,
    parseCsv: parseCsv,
    splitCsvLine: splitCsvLine,
    backupWrap: backupWrap,
    parseBackup: parseBackup,
    filterEntries: filterEntries,
    groupByDay: groupByDay,
    formatDayHead: formatDayHead,
    round2: round2
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ExCore = api;
})(typeof window !== 'undefined' ? window : this);
