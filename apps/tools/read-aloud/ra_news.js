/* Read Aloud RA1 -- ra_news.js: News tabs and story lists via News store/feed (NS, NF).
   Reads news.* cache, places, saved, and seen (for "only new"). Calls NF.refresh to share the cache.
   Does not write News settings, seen, saved, or places. */
var RANews = (function () {
  function rel(t) {
    if (!t) return '';
    var m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    var h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    var d = Math.round(h / 24);
    return d + (d === 1 ? ' day ago' : ' days ago');
  }

  function speakText(s) {
    var parts = [];
    if (s.src) parts.push(s.src);
    var ago = rel(s.t);
    if (ago) parts.push(ago);
    if (s.title) parts.push(s.title);
    return parts.join(', ');
  }

  function tabs() { return NF.tabs(); }
  function places() { return NF.places(); }
  function topics() { return NF.topics; }
  function label(key) { return key === 'saved' ? 'Saved' : NF.label(key); }

  function rawItems(key) {
    if (key === 'saved') return NF.saved() || [];
    var c = NF.list(key);
    return c ? (c.items || []) : [];
  }

  function items(key, onlyNew) {
    var list = rawItems(key);
    if (onlyNew) list = list.filter(function (s) { return NF.isNew(s); });
    return list;
  }

  function updated(key) {
    if (key === 'saved') return null;
    var c = NF.list(key);
    return c ? c.t : null;
  }

  function refresh(key) { return NF.refresh(key); }
  function due(key) { return NF.due(key); }
  function busy(key) { return NF.busy(key); }
  function isNew(s) { return NF.isNew(s); }
  function unseen(key) { return key === 'saved' ? 0 : NF.unseen(key); }

  return { rel: rel, speakText: speakText, tabs: tabs, places: places, topics: topics, label: label, rawItems: rawItems, items: items, updated: updated, refresh: refresh, due: due, busy: busy, isNew: isNew, unseen: unseen };
})();
