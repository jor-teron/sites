/* Agent — app/storage/usage.js: token usage log (AG7). HR.usage: record(provider, model, inTok, outTok, est), month(ym), ym(), day().
   Per day, per "provider|model": {p (prompt / input tokens), o (output tokens), n (calls), e (calls with estimated counts),
   AG35: c / k / kp only when a provider reported cache reads (see record)}.
   Folder connected: agent/usage/YYYY_MM.json ({v:1, days:{'YYYY-MM-DD':{'provider|model':{p,o,n,e}}}}); no folder:
   the same JSON in IndexedDB 'agent-chats'/'kv' under 'usage:YYYY_MM'. Writes are queued one after another.
   AG6: credits(service, n) adds API credits (Tavily) to the month: j.credits {service: n} and j.days[d]._credits {service: n}.
   Prices (AG30: Usage page; AG7–AG29: Settings → Usage): setting 'prices' {'provider|model': {in, out}} in $ per 1M tokens; cost(key, p, o).
   AG30: listMonths() only reads which month files exist. record, credits, month, prices, setPrice and cost are unchanged. */
HR.usage = (function () {
  var q = Promise.resolve(), subs = [];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ym(d) { d = d || new Date(); return d.getFullYear() + '_' + pad(d.getMonth() + 1); }
  function day(d) { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function db(mode, fn) {
    return new Promise(function (ok, no) {
      var r = indexedDB.open('agent-chats', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onerror = function () { no(r.error); };
      r.onsuccess = function () { var d = r.result, tx = d.transaction('kv', mode), x = fn(tx.objectStore('kv'));
        tx.oncomplete = function () { d.close(); ok(x && x.result); }; tx.onerror = function () { d.close(); no(tx.error); }; };
    });
  }
  function path(m) { return 'agent/usage/' + m + '.json'; }
  async function month(m) {
    m = m || ym(); var t = null;
    try { t = HR.fs.ready() ? (await HR.fs.read(path(m))).text : await db('readonly', function (s) { return s.get('usage:' + m); }); } catch (e) { t = null; }
    try { var o = JSON.parse(t || '{}'); return o && o.days ? o : { v: 1, days: {} }; } catch (e) { return { v: 1, days: {} }; }
  }
  function save(m, o) { var t = JSON.stringify(o, null, 1); return HR.fs.ready() ? HR.fs.write(path(m), t) : db('readwrite', function (s) { return s.put(t, 'usage:' + m); }); }
  /* AG35: optional cache = HR.cacheMeta.read(res) ({cached, prompt}) or null/undefined (unknown). Stored beside the totals:
     c (reported cached input tokens), k (calls that reported), kp (those calls' input tokens). p / o / n / e are unchanged. */
  function record(prov, model, p, o, est, cache) {
    p = Math.max(0, Math.round(+p || 0)); o = Math.max(0, Math.round(+o || 0)); if (!p && !o) return q;
    var ck = cache && Number.isSafeInteger(cache.cached) && cache.cached >= 0 && cache.prompt === p && cache.cached <= p ? cache : null;
    var m = ym(), d = day(), key = prov + '|' + model;
    q = q.then(async function () {
      var j = await month(m), dd = j.days[d] = j.days[d] || {}, r = dd[key] = dd[key] || { p: 0, o: 0, n: 0, e: 0 };
      r.p += p; r.o += o; r.n += 1; if (est) r.e += 1;
      if (ck) { r.c = (r.c || 0) + ck.cached; r.k = (r.k || 0) + 1; r.kp = (r.kp || 0) + p; }
      await save(m, j); subs.forEach(function (f) { try { f(); } catch (e) {} });
    }).catch(function () { /* usage is best effort */ });
    return q;
  }
  function credits(svc, n) {
    n = +n || 0; if (n <= 0) return q; var m = ym(), d = day();
    q = q.then(async function () {
      var j = await month(m), c = j.credits = j.credits || {}, dd = j.days[d] = j.days[d] || {}, dc = dd._credits = dd._credits || {};
      c[svc] = (c[svc] || 0) + n; dc[svc] = (dc[svc] || 0) + n;
      await save(m, j); subs.forEach(function (f) { try { f(); } catch (e) {} });
    }).catch(function () {});
    return q;
  }
  function prices() { var v = HR.set.get('prices'); return v && typeof v === 'object' ? v : {}; }
  function setPrice(key, kind, val) { var p = prices(), r = p[key] = p[key] || {}; var n = parseFloat(val); if (isNaN(n) || n < 0) delete r[kind]; else r[kind] = n; if (!Object.keys(r).length) delete p[key]; HR.set.put('prices', p); }
  function cost(key, p, o) { var r = prices()[key]; if (!r || (r.in == null && r.out == null)) return null; return (p * (r.in || 0) + o * (r.out || 0)) / 1e6; }
  /* AG30: read-only list of stored month ids. Does not write a usage file and does not invent months.
     Folder: agent/usage/YYYY_MM.json. No folder: IndexedDB keys usage:YYYY_MM. A missing usage folder is an empty list.
     null listed means the months could not be listed (all-time must not pretend the current month is everything). */
  function dbKeys() {
    return new Promise(function (ok, no) {
      var r; try { r = indexedDB.open('agent-chats', 1); } catch (e) { no(e); return; }
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onerror = function () { no(r.error); };
      r.onsuccess = function () {
        var d = r.result;
        try {
          var tx = d.transaction('kv', 'readonly'), s = tx.objectStore('kv');
          if (typeof s.getAllKeys !== 'function') { d.close(); ok(null); return; }
          var q = s.getAllKeys();
          tx.oncomplete = function () { d.close(); ok(q.result || []); };
          tx.onerror = function () { d.close(); no(tx.error); };
        } catch (e) { try { d.close(); } catch (x) {} no(e); }
      };
    });
  }
  async function listMonths() {
    var ids = [], listed = false, entries = [];
    function add(m) { if (/^\d{4}_\d{2}$/.test(m) && ids.indexOf(m) < 0) ids.push(m); }
    if (HR.fs && HR.fs.ready()) {
      try { entries = await HR.fs.list('agent/usage'); listed = true; }
      catch (e) {
        var nm = String((e && e.name) || '') + ' ' + String((e && e.message) || '');
        if (/NotFound|not found/i.test(nm)) listed = true;
      }
      if (listed) (entries || []).forEach(function (e) {
        if (!e || e.kind === 'directory') return;
        var m = /^(\d{4}_\d{2})\.json$/.exec(e.name || '');
        if (m) add(m[1]);
      });
    } else {
      try {
        var keys = await dbKeys();
        if (keys == null) listed = false;
        else { listed = true; keys.forEach(function (k) { var m = /^usage:(\d{4}_\d{2})$/.exec(String(k)); if (m) add(m[1]); }); }
      } catch (e2) { listed = false; }
    }
    ids.sort();
    return { ids: ids, listed: listed };
  }
  /* AG30 Legacy: return { record, credits, month, ym, day, prices, setPrice, cost, onChange } — listMonths is only added beside those. */
  return { record: record, credits: credits, month: month, ym: ym, day: day, prices: prices, setPrice: setPrice, cost: cost, listMonths: listMonths, onChange: function (f) { subs.push(f); } };
})();
