/* Agent — app/gui/setnav.js: full-page Settings navigation (AG38). HR.setNav.
   Like Hub Settings: categories on the left, the chosen section on the right. Categories are the existing
   <details class="scard"> cards (ids sc_model, sc_folder, sc_know, sc_perms, sc_web, sc_helper, sc_mcp, sc_display,
   sc_usage, sc_adv). AG44 adds sc_mcp. Their summaries become the section titles (no collapsing).
   Older cards keep their controls, ids and storage keys.
   (before AG44) the id list was sc_model, sc_folder, sc_know, sc_perms, sc_web, sc_helper, sc_display, sc_usage, sc_adv.
   The nav also links API & Providers (providers.html, AG37). Last category: localStorage 'agent.setCard' (same key as AG10).
   Narrow (<760px): the category list first; picking one shows that section with "‹ Categories" (body class set-sec).
   open(name) opens Settings at a category ('usage' or 'sc_usage'); '#settings/<name>' in the URL does the same on load
   (usage.html redirects to agent.html#settings/usage). Showing Usage draws the AG30 tables (HR.usageView.draw). */
HR.setNav = (function () {
  var KEY = 'agent.setCard', dlg, nav, cards = [], cur = '';
  function wide() { return !window.matchMedia || matchMedia('(min-width:760px)').matches; }
  function id(n) { n = String(n || ''); return /^sc_/.test(n) ? n : 'sc_' + n; }
  function label(c) { var s = c.querySelector('summary'); return s ? s.textContent.trim() : c.id; }
  function show(n, focus) {
    var c = document.getElementById(id(n)); if (!c || cards.indexOf(c) < 0) c = cards[0]; if (!c) return;
    cur = c.id; cards.forEach(function (d) { d.hidden = d !== c; d.open = true; });
    [].forEach.call(nav.querySelectorAll('button[data-card]'), function (b) { var on = b.dataset.card === cur; b.setAttribute('aria-current', on ? 'page' : 'false'); b.classList.toggle('on', on); });
    try { localStorage.setItem(KEY, cur); } catch (e) {}
    if (dlg) dlg.classList.add('set-sec');
    if (cur === 'sc_usage' && HR.usageView && HR.usageView.draw) { try { HR.usageView.draw(); } catch (e) {} }
    if (focus) { var s = c.querySelector('summary'); if (s) { s.tabIndex = -1; s.focus(); } }
  }
  function back() { if (dlg) dlg.classList.remove('set-sec'); var b = nav.querySelector('button.on') || nav.querySelector('button'); if (b) b.focus(); }
  function open(n) {
    var btn = document.getElementById('btnSet'); if (dlg && !dlg.open && btn) btn.click();
    show(n || localStorage.getItem(KEY) || 'sc_model', false);
  }
  function fromHash() { var m = /^#settings(?:\/([a-z_]+))?$/.exec(location.hash || ''); if (!m) return false; open(m[1] || ''); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} return true; }
  function init() {
    dlg = document.getElementById('settings'); nav = document.getElementById('setNav'); if (!dlg || !nav) return;
    cards = [].slice.call(dlg.querySelectorAll('.scard')); nav.innerHTML = '';
    cards.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'set-cat'; b.dataset.card = c.id; b.textContent = label(c);
      b.onclick = function () { show(c.id, !wide()); }; nav.appendChild(b);
      var s = c.querySelector('summary'); if (s) s.addEventListener('click', function (e) { e.preventDefault(); });   /* sections never collapse */
    });
    var a = document.createElement('a'); a.className = 'set-cat set-ext'; a.href = 'providers.html'; a.textContent = '🔑 API & Providers ↗'; nav.appendChild(a);
    document.getElementById('setBack').onclick = back;
    document.getElementById('btnSet').addEventListener('click', function () { if (!wide()) dlg.classList.remove('set-sec'); show(cur || localStorage.getItem(KEY) || 'sc_model', false); if (!wide()) dlg.classList.remove('set-sec'); });
    var u = document.getElementById('btnUsage'); if (u) u.addEventListener('click', function (e) { e.preventDefault(); open('usage'); });
    show(localStorage.getItem(KEY) || 'sc_model', false); dlg.classList.remove('set-sec');
    window.addEventListener('hashchange', fromHash);
  }
  return { init: init, open: open, show: show, back: back, fromHash: fromHash, current: function () { return cur; } };
})();
