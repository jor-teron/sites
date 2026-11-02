/* CT1 theme — the Hub's 'sites-hub.theme' (light/dark) when set, else the system. Live on changes. */
(function () {
  'use strict';
  var mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  function paint() {
    var t = ''; try { t = localStorage.getItem('sites-hub.theme') || ''; } catch (_) { /* */ }
    document.documentElement.classList.toggle('dark', t === 'light' || t === 'dark' ? t === 'dark' : !!(mq && mq.matches));
  }
  if (mq && mq.addEventListener) mq.addEventListener('change', paint);
  addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') paint(); });
  paint();
})();
