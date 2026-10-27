/* News — news_store.js: localStorage wrapper (keys "news.*"), settings, time display.
   Keys: places [names], tab, cache {key:{t,items}}, seen {link:ms}, saved [story+savedAt], set {theme,time,every}.
   Settings defaults: theme 'system' (follow Hub), time '12' (12-hour), every 12 (hours; 12 = at 6 AM / 6 PM). */
var NS = (function () {
  var P = 'news.';
  function get(k, d) { try { var v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  var DEF = { theme: 'system', time: '12', every: 12 };
  function setting(k) { var s = get('set', {}); return s[k] != null ? s[k] : DEF[k]; }
  function setSetting(k, v) { var s = get('set', {}); s[k] = v; set('set', s); }
  /* fmtTime(ms) -> '5:27 PM' or '17:27' */
  function fmtTime(t) {
    var d = new Date(t), h = d.getHours(), m = d.getMinutes(), mm = (m < 10 ? '0' : '') + m;
    if (setting('time') === '24') return (h < 10 ? '0' : '') + h + ':' + mm;
    return (h % 12 || 12) + ':' + mm + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  /* "2 h ago · 5:27 PM" (date added when not today) */
  function when(t) {
    if (!t) return '';
    var m = Math.round((Date.now() - t) / 60000);
    var rel = m < 1 ? 'now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago';
    var d = new Date(t), today = new Date().toDateString() === d.toDateString();
    return rel + ' · ' + (today ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ') + fmtTime(t);
  }
  return { get: get, set: set, setting: setting, setSetting: setSetting, fmtTime: fmtTime, when: when };
})();
