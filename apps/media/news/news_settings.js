/* News — news_settings.js: theme (System / Light / Dark), time format (12 / 24 h), auto refresh (1–24 h) in a <dialog>.
   Theme System (default) follows the Hub's Dark / Light live via shared/theme/hub_theme.js (HubTheme.hub / onChange);
   the effective theme is written as html[data-nt] so hub_theme.js (class/data-theme/color-scheme) never fights it.
   The Hub accent (--accent) is used for buttons when set. */
var NSet = (function () {
  var EVERY = [1, 2, 3, 6, 9, 12, 24];
  function eff() { var m = NS.setting('theme'); return m === 'light' || m === 'dark' ? m : (window.HubTheme ? HubTheme.hub() : 'dark'); }
  function applyTheme() {
    var t = eff(); document.documentElement.dataset.nt = t;
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t === 'light' ? '#f5f6fa' : '#141821';
  }
  if (window.HubTheme) HubTheme.onChange(applyTheme);
  function seg(id, key, opts, after) {
    var box = document.getElementById(id); box.innerHTML = '';
    opts.forEach(function (o) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'nb'; b.textContent = o[1]; b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(NS.setting(key)) === String(o[0]) ? 'true' : 'false');
      b.onclick = function () { NS.setSetting(key, o[0]); seg(id, key, opts, after); if (after) after(); };
      box.appendChild(b);
    });
  }
  function draw() {
    seg('setTheme', 'theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], applyTheme);
    seg('setTime', 'time', [['12', '12-hour'], ['24', '24-hour']], function () { NUI.render(); });
    var sel = document.getElementById('setEvery'); sel.innerHTML = '';
    EVERY.forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n === 12 ? '12 hours (6 AM & 6 PM)' : n + (n === 1 ? ' hour' : ' hours'); sel.appendChild(o); });
    sel.value = NS.setting('every');
    sel.onchange = function () { NS.setSetting('every', +sel.value); NUI.autoCheck(); };
  }
  function init() {
    var dlg = document.getElementById('settings');
    document.getElementById('btnSet').onclick = function () { draw(); dlg.showModal(); };
    document.getElementById('setClose').onclick = function () { dlg.close(); };
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  }
  return { init: init, applyTheme: applyTheme };
})();
