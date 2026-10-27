/* News — news_feed.js: tabs, feed URLs, fetch pipeline, per-tab cache (2-day keep), seen/new, saved, auto-refresh rule.
   Source: Google News RSS (en-IN) read through feedrapp.info (free RSS->JSON, Access-Control-Allow-Origin:*, no key);
   fallback api.allorigins.win/raw (raw XML, parsed here). Same pipeline as My Day's News card (PD8.1).
   Tab keys: 'india' (top stories), 'assam' / 'p:<place>' / 'q:<search>' (search "<x> when:2d"), 't:WORLD|SPORTS|TECHNOLOGY|BUSINESS' (topic feeds), 'saved'. */
var NF = (function () {
  var GN = 'https://news.google.com/rss', TAIL = 'hl=en-IN&gl=IN&ceid=IN:en', KEEP = 2 * 864e5, MAX = 60;
  var TOPICS = [['t:WORLD', 'World'], ['t:SPORTS', 'Sports'], ['t:TECHNOLOGY', 'Tech'], ['t:BUSINESS', 'Business']];
  function places() { return [['india', 'India'], ['assam', 'Assam']].concat(NS.get('places', []).map(function (n) { return ['p:' + n, n]; })); }
  function tabs() { return places().concat(TOPICS); }
  function label(key) {
    if (key === 'saved') return 'Saved';
    if (key.slice(0, 2) === 'q:') return '“' + key.slice(2) + '”';
    var t = tabs().filter(function (x) { return x[0] === key; })[0]; return t ? t[1] : key;
  }
  function url(key) {
    if (key === 'india') return GN + '?' + TAIL;
    if (key.slice(0, 2) === 't:') return GN + '/headlines/section/topic/' + key.slice(2) + '?' + TAIL;
    var q = key === 'assam' ? 'Assam' : key.slice(2);
    return GN + '/search?q=' + encodeURIComponent(q) + '+when:2d&' + TAIL;
  }
  function imgIn(html) { var m = /<img[^>]+src="([^"]+)"/i.exec(html || ''); return m ? m[1] : ''; }
  function viaFeedr(u) {
    return fetch('https://feedrapp.info/?num=40&q=' + encodeURIComponent(u)).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) {
        if (j.responseStatus && j.responseStatus !== 200) throw 0;
        return ((j.responseData && j.responseData.feed && j.responseData.feed.entries) || []).map(function (e) {
          return { title: e.title, link: e.link, t: Date.parse(e.publishedDate) || 0, img: imgIn(e.content) };
        });
      });
  }
  function viaOrigins(u) {
    return fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent(u)).then(function (r) { if (!r.ok) throw 0; return r.text(); })
      .then(function (x) {
        var d = new DOMParser().parseFromString(x, 'text/xml'); if (!d.querySelector('channel')) throw 0;
        return [].map.call(d.querySelectorAll('item'), function (it) {
          var g = function (n) { var e = it.querySelector(n); return e ? e.textContent : ''; };
          var media = it.getElementsByTagName('media:content')[0] || it.getElementsByTagName('media:thumbnail')[0] || it.querySelector('enclosure[type^="image"]');
          return { title: g('title'), link: g('link'), t: Date.parse(g('pubDate')) || 0, src: g('source'), img: media ? media.getAttribute('url') : imgIn(g('description')) };
        });
      });
  }
  /* Google News titles end with " - Source" */
  function tidy(list) {
    return list.filter(function (x) { return x.title && /^https?:/.test(x.link); }).map(function (x) {
      var i = x.title.lastIndexOf(' - '), tail = i > 0 ? x.title.slice(i + 3) : '';
      var src = x.src || tail, ti = i > 0 && (!x.src || tail === x.src) ? x.title.slice(0, i) : x.title;
      return { title: ti, src: src, link: x.link, t: x.t, img: /^https:/.test(x.img || '') ? x.img : '' };
    });
  }
  function cache() { return NS.get('cache', {}) || {}; }
  function list(key) { var c = cache()[key]; return c || null; }
  /* Merge fresh stories into the tab's list: dedupe by link/title, keep 2 days, newest first. Returns number of new links. */
  function merge(key, fresh) {
    var c = cache(), old = (c[key] && c[key].items) || [], cut = Date.now() - KEEP, seenT = {}, out = [];
    fresh.concat(old).forEach(function (s) {
      var k = s.title.toLowerCase(); if (seenT[k] || seenT[s.link] || (s.t && s.t < cut)) return;
      seenT[k] = seenT[s.link] = 1; out.push(s);
    });
    out.sort(function (a, b) { return b.t - a.t; });
    var oldL = {}; old.forEach(function (s) { oldL[s.link] = 1; });
    var added = out.filter(function (s) { return !oldL[s.link]; }).length;
    c[key] = { t: Date.now(), items: out.slice(0, MAX) };
    /* drop search caches older than 2 days, and caches of removed places */
    var keys = tabs().map(function (x) { return x[0]; });
    Object.keys(c).forEach(function (k) { if (k === key) return; if ((k.slice(0, 2) === 'q:' && c[k].t < cut) || ((k.slice(0, 2) === 'p:') && keys.indexOf(k) < 0)) delete c[k]; });
    if (!NS.set('cache', c)) { Object.keys(c).forEach(function (k) { if (k !== key) delete c[k]; }); NS.set('cache', c); }
    return added;
  }
  var busy = {};
  function refresh(key) {
    if (key === 'saved' || busy[key]) return Promise.reject('busy');
    busy[key] = 1; var u = url(key);
    return viaFeedr(u).catch(function () { return viaOrigins(u); })
      .then(function (l) { delete busy[key]; return merge(key, tidy(l)); }, function (e) { delete busy[key]; throw e; });
  }
  /* Auto-refresh: every N hours from last refresh; N = 12 aligns to 6 AM / 6 PM local. */
  function boundary() {
    var d = new Date(), b = new Date(d); b.setMinutes(0, 0, 0);
    if (d.getHours() >= 18) b.setHours(18); else if (d.getHours() >= 6) b.setHours(6); else { b.setDate(b.getDate() - 1); b.setHours(18); }
    return b.getTime();
  }
  function due(key) {
    if (key === 'saved') return false;
    var c = list(key); if (!c) return true;
    var n = +NS.setting('every') || 12;
    return n === 12 ? c.t < boundary() : Date.now() - c.t >= n * 36e5;
  }
  /* Seen / new */
  function seen() { return NS.get('seen', {}) || {}; }
  function isNew(s) { return !seen()[s.link]; }
  function markSeen(items) {
    var m = seen(), cut = Date.now() - 3 * 864e5, ch = 0;
    items.forEach(function (s) { if (!m[s.link]) { m[s.link] = Date.now(); ch = 1; } });
    Object.keys(m).forEach(function (k) { if (m[k] < cut) { delete m[k]; ch = 1; } });
    if (ch) NS.set('seen', m);
  }
  function unseen(key) { var c = list(key), m = seen(); return c ? c.items.filter(function (s) { return !m[s.link]; }).length : 0; }
  /* Saved for later (headline, link, source, time, picture URL) */
  function saved() { return NS.get('saved', []) || []; }
  function isSaved(s) { return saved().some(function (x) { return x.link === s.link; }); }
  function toggleSave(s) {
    var l = saved(), on = !isSaved(s);
    l = on ? [Object.assign({ savedAt: Date.now() }, s)].concat(l) : l.filter(function (x) { return x.link !== s.link; });
    NS.set('saved', l); return on;
  }
  function addPlace(n) {
    n = String(n || '').trim().replace(/\s+/g, ' ').slice(0, 40); if (!n) return '';
    var hit = places().filter(function (p) { return p[1].toLowerCase() === n.toLowerCase(); })[0];
    if (hit) return hit[0];
    var l = NS.get('places', []); l.push(n); NS.set('places', l); return 'p:' + n;
  }
  function removePlace(key) {
    var n = key.slice(2); NS.set('places', NS.get('places', []).filter(function (x) { return x !== n; }));
    var c = cache(); delete c[key]; NS.set('cache', c);
  }
  return { tabs: tabs, places: places, topics: TOPICS, label: label, list: list, refresh: refresh, due: due, busy: function (k) { return !!busy[k]; },
    isNew: isNew, markSeen: markSeen, unseen: unseen, saved: saved, isSaved: isSaved, toggleSave: toggleSave, addPlace: addPlace, removePlace: removePlace };
})();
