/* Agent — app/gui/usageview.js: Settings → Usage (AG7). Today and This month: per provider · model calls, input / output
   tokens (≈ when some calls were estimated as chars/4) and, for online models with a price, estimated cost.
   AG6: 'Tavily: N/1000 this month' (web search credits, free plan size) above the tables.
   Price fields ($ per 1M input / output tokens) show under each online model of this month; saved in setting 'prices'. */
HR.usageView = (function () {
  var box;
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function k(n) { return n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
  function money(c) { return c == null ? '' : '$' + (c < 0.01 ? c.toFixed(4) : c.toFixed(2)); }
  function online(key) { var p = key.split('|')[0]; return p !== 'ollama' && p !== 'browser'; }
  function sum(days, only) {
    var out = {}; Object.keys(days).forEach(function (d) { if (only && d !== only) return; var dd = days[d];
      Object.keys(dd).forEach(function (key) { if (key === '_credits') return; var r = dd[key], t = out[key] = out[key] || { p: 0, o: 0, n: 0, e: 0 }; t.p += r.p; t.o += r.o; t.n += r.n; t.e += r.e || 0; }); });
    return out;
  }
  function table(title, rows, prices) {
    var sec = el('div', 'us-sec'); sec.appendChild(el('div', 'us-h', title));
    var keys = Object.keys(rows).sort(function (a, b) { return (rows[b].p + rows[b].o) - (rows[a].p + rows[a].o); });
    if (!keys.length) { sec.appendChild(el('p', 'hint', 'No model calls yet.')); return sec; }
    var t = el('table', 'us-t'), hr = el('tr'), tot = { p: 0, o: 0, n: 0, c: 0, priced: false };
    ['Model', 'Calls', 'In', 'Out', 'Cost'].forEach(function (h) { hr.appendChild(el('th', null, h)); }); t.appendChild(hr);
    keys.forEach(function (key) {
      var r = rows[key], c = HR.usage.cost(key, r.p, r.o), tr = el('tr'), ap = r.e ? '≈' : '';
      var parts = key.split('|'); tr.appendChild(el('td', 'us-m', parts[0] + ' · ' + parts.slice(1).join('|')));
      tr.append(el('td', null, String(r.n)), el('td', null, ap + k(r.p)), el('td', null, ap + k(r.o)), el('td', null, online(key) ? (money(c) || '—') : 'local'));
      t.appendChild(tr); tot.p += r.p; tot.o += r.o; tot.n += r.n; if (c != null) { tot.c += c; tot.priced = true; }
      if (prices && online(key)) {
        var pr = el('tr', 'us-price'), td = el('td'); td.colSpan = 5;
        var cur = HR.usage.prices()[key] || {};
        [['in', '$ / 1M in'], ['out', '$ / 1M out']].forEach(function (x) {
          var i = el('input', 'inp num us-in'); i.type = 'number'; i.min = '0'; i.step = '0.01'; i.placeholder = x[1]; i.setAttribute('aria-label', x[1] + ' for ' + key);
          if (cur[x[0]] != null) i.value = cur[x[0]];
          i.addEventListener('change', function () { HR.usage.setPrice(key, x[0], i.value); draw(); });
          td.appendChild(i);
        });
        pr.appendChild(td); t.appendChild(pr);
      }
    });
    var ft = el('tr', 'us-tot'); ft.append(el('td', null, 'Total'), el('td', null, String(tot.n)), el('td', null, k(tot.p)), el('td', null, k(tot.o)), el('td', null, tot.priced ? money(tot.c) : ''));
    t.appendChild(ft); sec.appendChild(t); return sec;
  }
  async function draw() {
    if (!box) return;
    var j = await HR.usage.month(), today = HR.usage.day();
    box.innerHTML = ''; var tav = (j.credits && j.credits.tavily) || 0;
    if (tav || HR.web && HR.web.key()) box.appendChild(el('div', 'us-h' + (tav >= 900 ? ' warn' : ''), 'Tavily: ' + tav + '/1000 this month' + (tav >= 1000 ? ' — free credits used up' : '')));
    box.append(table('Today', sum(j.days, today), false), table('This month (' + HR.usage.ym().replace('_', '-') + ')', sum(j.days), true),
      el('p', 'hint', (HR.fs.ready() ? 'Saved to agent/usage/' + HR.usage.ym() + '.json.' : 'Saved in this browser (pick a folder to keep it as agent/usage/YYYY_MM.json).') +
        ' Counts come from the provider; ≈ = some calls estimated as characters / 4. Costs are estimates from your prices.'));
  }
  function init() { box = document.getElementById('usageBox'); document.getElementById('btnSet').addEventListener('click', draw); HR.usage.onChange(function () { var d = document.getElementById('settings'); if (d.open) draw(); }); }
  return { init: init, draw: draw };
})();
