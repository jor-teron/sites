/* Agent — app/storage/usage.js: token usage log (AG7). HR.usage: record(provider, model, inTok, outTok, est), month(ym), ym(), day().
   Per day, per "provider|model": {p (prompt / input tokens), o (output tokens), n (calls), e (calls with estimated counts)}.
   Folder connected: agent/usage/YYYY_MM.json ({v:1, days:{'YYYY-MM-DD':{'provider|model':{p,o,n,e}}}}); no folder:
   the same JSON in IndexedDB 'agent-chats'/'kv' under 'usage:YYYY_MM'. Writes are queued one after another.
   Prices (Settings → Usage, online models only): setting 'prices' {'provider|model': {in, out}} in $ per 1M tokens; cost(key, p, o). */
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
  function record(prov, model, p, o, est) {
    p = Math.max(0, Math.round(+p || 0)); o = Math.max(0, Math.round(+o || 0)); if (!p && !o) return q;
    var m = ym(), d = day(), key = prov + '|' + model;
    q = q.then(async function () {
      var j = await month(m), dd = j.days[d] = j.days[d] || {}, r = dd[key] = dd[key] || { p: 0, o: 0, n: 0, e: 0 };
      r.p += p; r.o += o; r.n += 1; if (est) r.e += 1;
      await save(m, j); subs.forEach(function (f) { try { f(); } catch (e) {} });
    }).catch(function () { /* usage is best effort */ });
    return q;
  }
  function prices() { var v = HR.set.get('prices'); return v && typeof v === 'object' ? v : {}; }
  function setPrice(key, kind, val) { var p = prices(), r = p[key] = p[key] || {}; var n = parseFloat(val); if (isNaN(n) || n < 0) delete r[kind]; else r[kind] = n; if (!Object.keys(r).length) delete p[key]; HR.set.put('prices', p); }
  function cost(key, p, o) { var r = prices()[key]; if (!r || (r.in == null && r.out == null)) return null; return (p * (r.in || 0) + o * (r.out || 0)) / 1e6; }
  return { record: record, month: month, ym: ym, day: day, prices: prices, setPrice: setPrice, cost: cost, onChange: function (f) { subs.push(f); } };
})();
