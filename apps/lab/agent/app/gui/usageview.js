/* Agent — app/gui/usageview.js: Usage page (AG30). Was Settings → Usage (AG7). AG38: back in Settings › Usage (same tables, ids).
   Two sections on usage.html: Token usage & spending, and Rates.
   Spending reads the stored usage files only (today / this month / all time). Rates are the saved 'prices' setting.
   Chat still calls init() so Settings → Web can refresh the Tavily N/1000 line. Nothing here records tokens.
   AG30 Legacy: the old Settings tables are commented at the bottom of this file. */
HR.usageView = (function () {
  var period = 'month', ticket = 0;
  var PERIODS = [['today', 'Today'], ['month', 'This month'], ['all', 'All time']];

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function int(n) {
    var neg = n < 0, s = String(Math.abs(Math.round(n))), out = '', i;
    for (i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0) out += ','; out += s[i]; }
    return (neg ? '-' : '') + out;
  }
  /* AG7 money(): amounts under one cent keep four decimals, so a zero estimate stays $0.0000. */
  function money(c) { return c == null || !Number.isFinite(c) ? '' : '$' + (c < 0.01 ? c.toFixed(4) : c.toFixed(2)); }
  function online(key) { var p = String(key).split('|')[0]; return p !== 'ollama' && p !== 'browser'; }
  function splitKey(key) {
    var i = String(key).indexOf('|');
    if (i < 0) return { provider: String(key), model: '(model not in the stored key)' };
    return { provider: String(key).slice(0, i) || '(provider not in the stored key)', model: String(key).slice(i + 1) || '(model not in the stored key)' };
  }
  function take(raw, optional) {
    if (raw == null && optional) return { n: 0, bad: false };
    var n = Number(raw); if (!Number.isFinite(n)) return { n: 0, bad: true };
    return { n: n, bad: false };
  }
  /* Sum stored rows. mode 'today' keeps one day key. 'month' and 'all' keep every day in the files they are given.
     Credits: today uses that day's _credits; month and all use each file's credits field (not both, so they are not doubled). */
  function rollup(files, mode, today) {
    var rows = Object.create(null), credits = 0, creditsSeen = false, bad = false;
    (files || []).forEach(function (file) {
      var doc = (file && file.doc) || {}, days = doc.days || {};
      Object.keys(days).forEach(function (d) {
        if (mode === 'today' && d !== today) return;
        var dd = days[d] || {};
        Object.keys(dd).forEach(function (key) {
          if (key === '_credits') return;
          var r = dd[key] || {}, t = rows[key] || (rows[key] = { p: 0, o: 0, n: 0, e: 0, c: 0, k: 0, kp: 0, badP: false, badO: false, badN: false, badE: false, badC: false });
          var p = take(r.p), o = take(r.o), n = take(r.n), e = take(r.e, true);
          if (p.bad) t.badP = bad = true; else t.p += p.n;
          if (o.bad) t.badO = bad = true; else t.o += o.n;
          if (n.bad) t.badN = bad = true; else t.n += n.n;
          if (e.bad) t.badE = bad = true; else t.e += e.n;
          if (r.k != null || r.c != null || r.kp != null) {   /* AG35: reported cache reads (absent = unknown, not 0) */
            var c = take(r.c), k = take(r.k), kp = take(r.kp);
            if (c.bad || k.bad || kp.bad || c.n > kp.n) t.badC = true; else { t.c += c.n; t.k += k.n; t.kp += kp.n; }
          }
        });
      });
      if (mode === 'today') {
        var dc = (days[today] && days[today]._credits) || {};
        if (dc.tavily != null) { var c = Number(dc.tavily); if (Number.isFinite(c)) { credits += c; creditsSeen = true; } else bad = true; }
      } else if (doc.credits && doc.credits.tavily != null) {
        var c2 = Number(doc.credits.tavily); if (Number.isFinite(c2)) { credits += c2; creditsSeen = true; } else bad = true;
      }
    });
    return { rows: rows, credits: credits, creditsSeen: creditsSeen, bad: bad };
  }
  function groupsOf(rows) {
    var g = Object.create(null);
    Object.keys(rows).forEach(function (key) {
      var parts = splitKey(key), b = g[parts.provider] || (g[parts.provider] = { provider: parts.provider, models: [] });
      b.models.push({ key: key, model: parts.model, row: rows[key] });
    });
    function tok(r) { return (r.badP ? 0 : r.p) + (r.badO ? 0 : r.o); }
    return Object.keys(g).map(function (k) { return g[k]; }).map(function (b) {
      b.models.sort(function (a, c) { return tok(c.row) - tok(a.row) || String(a.model).localeCompare(String(c.model)); });
      b.tokens = b.models.reduce(function (s, m) { return s + tok(m.row); }, 0);
      return b;
    }).sort(function (a, b) { return b.tokens - a.tokens || String(a.provider).localeCompare(String(b.provider)); });
  }
  function rateOf(key) {
    var r = HR.usage.prices()[key];
    if (!r || typeof r !== 'object') r = {};
    function side(v) { return v != null && Number.isFinite(Number(v)) ? Number(v) : null; }
    return { in: side(r.in), out: side(r.out) };
  }
  /* AG35: plain text only. Ratio uses only the calls that reported, against their own input tokens. */
  function cacheText(r) {
    if (r.badC) return 'unreadable';
    if (!r.k) return 'unknown';
    var s = r.c.toLocaleString() + ' of ' + r.kp.toLocaleString() + ' input' + (r.kp ? ' (' + Math.round(r.c / r.kp * 100) + '%)' : '');
    return s + (r.k < r.n ? ' · ' + r.k + ' of ' + r.n + ' calls reported' : '');
  }
  function th(text) { var h = el('th', null, text); h.setAttribute('scope', 'col'); return h; }
  function tokCell(n, approx, bad) { return bad ? el('td', 'us-na', 'Unreadable') : el('td', null, (approx ? '≈' : '') + int(n)); }
  function totalCell(n, bad) {
    if (!bad) return el('td', null, int(n));
    if (!n) return el('td', 'us-na', 'Unreadable');
    return el('td', null, int(n) + ' (unreadable omitted)');
  }
  function spendCell(key, row) {
    var td = el('td'), rate = rateOf(key);
    /* An unreadable token count is not a zero, so it is not priced. */
    if (row.badP || row.badO) { td.className = 'us-na'; td.textContent = 'Unreadable'; return td; }
    var c = HR.usage.cost(key, row.p, row.o);
    if (c == null) { td.className = 'us-na'; td.textContent = 'Rate unavailable'; return td; }
    var bits = [money(c) + ' estimated'];
    if (rate.in != null && rate.out == null) bits.push('output rate unavailable; the existing estimate counts that side as 0');
    if (rate.out != null && rate.in == null) bits.push('input rate unavailable; the existing estimate counts that side as 0');
    td.textContent = bits.join(' — ');
    return td;
  }
  function priceInput(key, kind, label) {
    var cur = HR.usage.prices()[key] || {}, i = el('input', 'inp num us-in');
    i.type = 'number'; i.min = '0'; i.step = '0.01'; i.placeholder = label; i.setAttribute('aria-label', label + ' for ' + key); i.setAttribute('inputmode', 'decimal');
    if (cur[kind] != null) i.value = String(cur[kind]);
    i.addEventListener('change', function () { HR.usage.setPrice(key, kind, i.value); return draw(); });
    return i;
  }
  function rateCell(key, kind, label) {
    var td = el('td'), rate = rateOf(key), v = rate[kind];
    if (v == null) td.appendChild(el('span', 'us-na', 'Rate unavailable'));
    else td.appendChild(el('span', null, String(v)));
    if (online(key) || HR.usage.prices()[key]) td.appendChild(priceInput(key, kind, label));
    return td;
  }
  function paintPeriod(box) {
    if (!box) return; clear(box);
    PERIODS.forEach(function (p) {
      var b = el('button', 'hb', p[1]); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', period === p[0] ? 'true' : 'false');
      b.addEventListener('click', function () { if (period === p[0]) return; period = p[0]; return draw(); });
      box.appendChild(b);
    });
  }
  function storageNote() {
    if (HR.fs && HR.fs.state && HR.fs.state() === 'need') return 'A folder is saved but this page does not have permission to read it, so these totals are the copy in this browser, not agent/usage/. Reconnect the folder from Chat.';
    if (HR.fs && HR.fs.ready()) return 'Saved to agent/usage/' + HR.usage.ym() + '.json.';
    return 'Saved in this browser (pick a folder to keep it as agent/usage/YYYY_MM.json).';
  }
  async function loadListed() {
    var listed; try { listed = await HR.usage.listMonths(); } catch (e) { listed = { ids: [], listed: false }; }
    if (!listed || !listed.listed) return { ok: false, files: [] };
    var files = [], i;
    for (i = 0; i < listed.ids.length; i++) files.push({ id: listed.ids[i], doc: await HR.usage.month(listed.ids[i]) });
    return { ok: true, files: files };
  }
  function renderSpend(host, view, meta) {
    clear(host);
    var label = period === 'today' ? 'Today (' + HR.usage.day() + ')' : period === 'month' ? 'This month (' + HR.usage.ym().replace('_', '-') + ')' : 'All time';
    host.appendChild(el('p', 'hint us-showing', 'Showing: ' + label + (period === 'all' && meta.listedOk ? ' (' + meta.files.length + ' stored month file' + (meta.files.length === 1 ? '' : 's') + ')' : '') + '.'));
    if (period === 'all' && !meta.listedOk) host.appendChild(el('p', 'hint', 'All-time totals are not shown because the saved usage months could not be listed. Today and This month still read the current month file.'));
    var groups = groupsOf(view.rows), any = groups.length > 0, priced = false, approx = false;
    var tot = { p: 0, o: 0, n: 0, c: 0, badP: false, badO: false, badN: false };
    if (!any) host.appendChild(el('p', 'hint', period === 'all' && !meta.listedOk ? 'No all-time table.' : 'No model calls stored for this period.'));
    groups.forEach(function (g) {
      host.appendChild(el('h3', 'us-prov', g.provider));
      var wrap = el('div', 'us-scroll'), t = el('table', 'us-t'), hr = el('tr');
      ['Model', 'Calls', 'Input tokens', 'Output tokens', 'Cached input (reported)', 'Estimated spend'].forEach(function (h) { hr.appendChild(th(h)); });
      t.appendChild(hr);
      g.models.forEach(function (m) {
        var r = m.row, tr = el('tr');
        if (r.e > 0 && !r.badE) approx = true;
        tr.appendChild(el('td', 'us-m', m.model));
        tr.appendChild(tokCell(r.n, false, r.badN));
        tr.appendChild(tokCell(r.p, r.e > 0 && !r.badE && !r.badP, r.badP));
        tr.appendChild(tokCell(r.o, r.e > 0 && !r.badE && !r.badO, r.badO));
        tr.appendChild(el('td', 'us-n', cacheText(r)));
        tr.appendChild(spendCell(m.key, r));
        t.appendChild(tr);
        if (!r.badN) tot.n += r.n; else tot.badN = true;
        if (!r.badP) tot.p += r.p; else tot.badP = true;
        if (!r.badO) tot.o += r.o; else tot.badO = true;
        if (r.badP || r.badO) return;
        var c = HR.usage.cost(m.key, r.p, r.o);
        if (c == null) return;
        tot.c += c; priced = true;
      });
      wrap.appendChild(t); host.appendChild(wrap);
    });
    if (any) {
      var gt = el('table', 'us-t us-grand'), head = el('tr'), gr = el('tr'), gc = el('td');
      ['Total', 'Calls', 'Input tokens', 'Output tokens', 'Estimated spend'].forEach(function (h) { head.appendChild(th(h)); });
      gt.appendChild(head);
      var label = el('th', null, 'All providers'); label.setAttribute('scope', 'row'); gr.appendChild(label);
      gr.appendChild(totalCell(tot.n, tot.badN));
      gr.appendChild(totalCell(tot.p, tot.badP));
      gr.appendChild(totalCell(tot.o, tot.badO));
      if (!priced) { gc.className = 'us-na'; gc.textContent = 'Rate unavailable'; }
      else gc.textContent = money(tot.c) + ' estimated';
      gr.appendChild(gc); gt.appendChild(gr);
      var gwrap = el('div', 'us-scroll'); gwrap.appendChild(gt); host.appendChild(gwrap);
      host.appendChild(el('p', 'hint', 'The estimated total includes only rows with a saved rate. Rate unavailable is not counted as zero.'));
    }
    host.appendChild(el('p', 'hint', storageNote() + ' Counts come from the provider; ≈ means some calls were estimated as characters / 4. Costs are estimates from your prices. Estimated spend is not a provider bill. No provider billing total is stored.'));
    host.appendChild(el('p', 'hint', 'Today and This month read the current month file. All time adds every stored month file. Dates are the YYYY-MM-DD keys already in those files. A file that does not parse is read as empty, same as before.'));
    host.appendChild(el('p', 'hint us-image', 'Image generation: no image-cost records are stored with each picture, so image spend is not listed here and is not mixed into the token totals.'));
    host.appendChild(el('p', 'hint us-credits', view.creditsSeen ? 'Tavily credits recorded for this period: ' + view.credits + '. Search credits are not token spend and not a provider bill.' : 'No Tavily credits recorded for this period. Search credits are not token spend.'));
    if (view.bad) host.appendChild(el('p', 'hint', 'A stored count was not a number and is marked Unreadable. It is not counted as zero.'));
    host.appendChild(el('p', 'hint', 'Cached input is what the provider said it read from its own prompt cache, as part of the input tokens (not extra, not a saving). unknown = not reported. Only some providers report it.'));
    if (approx) host.appendChild(el('p', 'hint', 'A mark of ≈ means at least one call in that row was estimated as characters / 4 because the provider did not send a token count.'));
  }
  function renderRates(host, rateRows, listedOk) {
    clear(host);
    var prices = HR.usage.prices(), keys = Object.create(null);
    Object.keys(rateRows).forEach(function (k) { keys[k] = 1; });
    Object.keys(prices).forEach(function (k) { if (k && k !== '_credits') keys[k] = 1; });
    var list = Object.keys(keys).sort(function (a, b) { return String(a).localeCompare(String(b)); });
    host.appendChild(el('p', 'hint', listedOk
      ? 'Rates are not filtered by the period. This list is every model in the saved usage files, plus any rate you saved.'
      : 'Rates below are this month\'s models plus saved rates. Older usage files could not be listed, so models that appear only there are missing from this list. Saved rates are still shown.'));
    host.appendChild(el('p', 'hint', 'Currency is not stored as its own field. These are $ per 1 million tokens, the same saved numbers as before. No rate-update time is stored. Nothing here is fetched from a provider.'));
    host.appendChild(el('p', 'hint', 'Manually entered marks a number saved in this app. Rate unavailable means no number is saved. A missing rate is not shown as zero.'));
    if (!list.length) { host.appendChild(el('p', 'hint', 'No saved rates and no models in the stored usage. Rate unavailable.')); return; }
    var wrap = el('div', 'us-scroll'), t = el('table', 'us-t'), hr = el('tr');
    ['Provider', 'Model', 'Input per million tokens', 'Output per million tokens', 'Recorded as'].forEach(function (h) { hr.appendChild(th(h)); });
    t.appendChild(hr);
    list.forEach(function (key) {
      var parts = splitKey(key), rate = rateOf(key), tr = el('tr'), rec = el('td');
      tr.appendChild(el('td', 'us-m', parts.provider));
      tr.appendChild(el('td', 'us-m', parts.model));
      tr.appendChild(rateCell(key, 'in', '$ / 1M in'));
      tr.appendChild(rateCell(key, 'out', '$ / 1M out'));
      if (rate.in == null && rate.out == null) { rec.className = 'us-na'; rec.textContent = 'Not recorded'; }
      else rec.textContent = 'Manually entered';
      tr.appendChild(rec); t.appendChild(tr);
    });
    wrap.appendChild(t); host.appendChild(wrap);
  }
  async function paintCredits() {
    var wc = document.getElementById('webCredits'); if (!wc || !HR.usage) return;
    var j = await HR.usage.month(), tav = (j.credits && j.credits.tavily) || 0;
    wc.textContent = 'Tavily: ' + tav + '/1000 credits this month' + (tav >= 1000 ? ' — free credits used up' : '');
    wc.classList.toggle('warn', tav >= 900);
  }
  async function draw() {
    var spend = document.getElementById('usageSpend'), rates = document.getElementById('usageRates');
    if (!spend || !rates) return paintCredits();
    var mine = ++ticket;
    paintPeriod(document.getElementById('usagePeriod'));
    var current = { id: HR.usage.ym(), doc: await HR.usage.month() };
    if (mine !== ticket) return;
    var listed = await loadListed();
    if (mine !== ticket) return;
    var spendFiles = period === 'all' ? (listed.ok ? listed.files : []) : [current];
    var view = period === 'all' && !listed.ok ? { rows: Object.create(null), credits: 0, creditsSeen: false, bad: false } : rollup(spendFiles, period, HR.usage.day());
    var rateSource = listed.ok ? rollup(listed.files, 'all', HR.usage.day()).rows : rollup([current], 'month', HR.usage.day()).rows;
    renderSpend(spend, view, { listedOk: listed.ok, files: listed.files });
    renderRates(rates, rateSource, listed.ok);
  }
  function boot() {
    var p = Promise.resolve();
    if (HR.fs && HR.fs.init) p = Promise.resolve().then(function () { return HR.fs.init(); }).catch(function () {});
    return p.then(draw);
  }
  function init() {
    var btn = document.getElementById('btnSet');
    if (btn) btn.addEventListener('click', function () { return paintCredits(); });
    if (HR.usage && HR.usage.onChange) HR.usage.onChange(function () {
      var d = document.getElementById('settings'); if (d && d.open) paintCredits();
      var pg = document.getElementById('usagePage'); if (pg && !(d && pg.closest && pg.closest('[hidden]'))) draw();
    });
    if (document.getElementById('usagePage') && !document.getElementById('settings')) return boot();   /* AG38: in Settings it draws when the Usage section is shown */
    return Promise.resolve();
  }
  return { init: init, draw: draw, rollup: rollup, groupsOf: groupsOf, cacheText: cacheText };   /* AG35: + cacheText */
})();

/* AG30 Legacy: Settings → Usage (AG7–AG29) rendered two tables into #usageBox and edited prices there.
   Today had no price fields. This month had a $ / 1M in and $ / 1M out box for online models (not ollama, not browser).
   A missing online price was an em dash. ollama and browser costs said "local". The total cost was blank when nothing was priced.
   Those words are not used on the Usage page: a missing rate says "Rate unavailable" and is not shown as local, free, or zero.
   The old draw() also wrote the Tavily N/1000 line into #webCredits. That line still updates from paintCredits() when Settings opens.
   Old table builder, kept so the previous layout can be read beside the new one:
   function table(title, rows, prices) {
     keys sorted by p+o; columns Model, Calls, In, Out, Cost;
     online ? (money(c) || '—') : 'local';
     price inputs only when prices && online(key), on change setPrice and draw.
   }
   draw() used month() for the current file only: table('Today', sum(days, today), false) and table('This month', sum(days), true).
   There was no all-time filter, because the old view never listed other month files. */
