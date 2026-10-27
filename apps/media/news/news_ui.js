/* News — news_ui.js: tabs (places, topics, search, Saved), story cards, refresh, add/remove place, search box.
   Card: picture (if the feed gives one, else a coloured source letter), headline, source · time, ☆ save, new dot.
   New dots show for stories not yet seen; a tab's stories count as seen when you leave it or hide the page. */
var NUI = (function () {
  var tab = NS.get('tab', 'india'), adding = false, err = 0;
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === 'text') e.textContent = attrs[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null) e.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function valid(k) { return k === 'saved' || k.slice(0, 2) === 'q:' || NF.tabs().some(function (t) { return t[0] === k; }); }
  function items(k) { if (k === 'saved') return NF.saved(); var c = NF.list(k); return c ? c.items : []; }
  function leave() { if (tab !== 'saved') NF.markSeen(items(tab)); }
  function go(k) { if (k === tab) return; leave(); tab = k; adding = false; err = 0; NS.set('tab', k); render(); autoCheck(); }
  function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
  function doRefresh(auto) {
    var k = tab; if (k === 'saved' || NF.busy(k)) return;
    var had = !!NF.list(k); render();
    NF.refresh(k).then(function (added) {
      err = 0; if (k === tab) render();
      if (auto && had && added > 0) NNotify({ icon: '📰', title: 'News', text: added + ' new ' + (added === 1 ? 'story' : 'stories') + ' · ' + NF.label(k), onClick: function () { window.focus(); go(k); } });
    }, function (e) {
      if (e === 'busy') return; err = Date.now(); if (k === tab) render();
      if (!auto) NNotify({ icon: '📡', title: 'News', text: 'Could not refresh ' + NF.label(k) + (had ? ' — showing saved stories.' : '. Check the connection.') });
    });
    render();
  }
  function autoCheck() { if (navigator.onLine !== false && NF.due(tab) && !NF.busy(tab)) doRefresh(!!NF.list(tab)); }
  function tabBtn(k, name) {
    var on = k === tab, dot = !on && k !== 'saved' && NF.unseen(k) > 0;
    return el('button', { type: 'button', 'class': 'nt' + (on ? ' on' : ''), role: 'tab', 'aria-selected': on ? 'true' : 'false', onclick: function () { go(k); } },
      [name, dot ? el('span', { 'class': 'nt-dot', 'aria-label': 'new stories' }) : null]);
  }
  function drawTabs() {
    var row = document.getElementById('tabs'); row.innerHTML = '';
    NF.places().forEach(function (p) {
      row.appendChild(tabBtn(p[0], p[1]));
      if (p[0] === tab && tab.slice(0, 2) === 'p:') row.appendChild(el('button', { type: 'button', 'class': 'nb nx', title: 'Remove ' + p[1], 'aria-label': 'Remove ' + p[1],
        text: '×', onclick: function () { NF.removePlace(tab); tab = 'india'; NS.set('tab', tab); render(); autoCheck(); } }));
    });
    row.appendChild(el('button', { type: 'button', 'class': 'nb', title: 'Add a place', 'aria-label': 'Add a place', text: '+', onclick: function () { adding = !adding; render(); } }));
    row.appendChild(el('span', { 'class': 'nt-sep' }));
    NF.topics.forEach(function (t) { row.appendChild(tabBtn(t[0], t[1])); });
    if (tab.slice(0, 2) === 'q:') {
      row.appendChild(tabBtn(tab, '🔎 ' + tab.slice(2)));
      row.appendChild(el('button', { type: 'button', 'class': 'nb nx', title: 'Close search', 'aria-label': 'Close search', text: '×', onclick: function () { go('india'); } }));
    }
    var n = NF.saved().length;
    row.appendChild(tabBtn('saved', '★ Saved' + (n ? ' ' + n : '')));
    var cur = row.querySelector('.nt.on'); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function card(s, i) {
    var isNew = tab !== 'saved' && NF.isNew(s), sv = NF.isSaved(s);
    var pic = s.img ? el('img', { 'class': 'nc-img', src: s.img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: function () { this.remove(); } })
      : el('div', { 'class': 'nc-tile', style: 'background:hsl(' + hue(s.src || s.title) + ' 55% 45%)', 'aria-hidden': 'true', text: (s.src || s.title).charAt(0).toUpperCase() });
    var a = el('a', { 'class': 'nc-link', href: s.link, target: '_blank', rel: 'noopener noreferrer' }, [pic,
      el('div', { 'class': 'nc-txt' }, [el('div', { 'class': 'nc-h', text: s.title }),
        el('div', { 'class': 'nc-m' }, [isNew ? el('span', { 'class': 'nc-new', title: 'New' }) : null, (s.src ? s.src + ' · ' : '') + NS.when(s.t)])])]);
    var b = el('button', { type: 'button', 'class': 'nb nc-save' + (sv ? ' on' : ''), title: sv ? 'Remove from Saved' : 'Save for later', 'aria-label': sv ? 'Remove from Saved' : 'Save for later', 'aria-pressed': sv ? 'true' : 'false',
      text: sv ? '★' : '☆', onclick: function () { NF.toggleSave(s); b.classList.add('pop'); setTimeout(render, 180); } });
    return el('article', { 'class': 'nc', style: 'animation-delay:' + Math.min(i, 12) * 45 + 'ms' }, [a, b]);
  }
  function render() {
    if (!valid(tab)) { tab = 'india'; NS.set('tab', tab); }
    drawTabs();
    var add = document.getElementById('addRow'); add.innerHTML = ''; add.hidden = !adding;
    if (adding) {
      var inp = el('input', { type: 'text', placeholder: 'Place, e.g. Jorhat', 'aria-label': 'Place name', maxlength: '40' });
      var ok = function () { var k = NF.addPlace(inp.value); if (!k) return; adding = false; leave(); tab = k; NS.set('tab', k); render(); autoCheck(); };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok(); if (e.key === 'Escape') { adding = false; render(); } });
      add.appendChild(inp); add.appendChild(el('button', { type: 'button', 'class': 'nb wide pri', text: 'Add', onclick: ok }));
      add.appendChild(el('button', { type: 'button', 'class': 'nb wide', text: 'Cancel', onclick: function () { adding = false; render(); } }));
      setTimeout(function () { inp.focus(); }, 0);
    }
    var busy = NF.busy(tab), rb = document.getElementById('btnRef');
    rb.classList.toggle('spin', busy); rb.disabled = tab === 'saved';
    var c = tab === 'saved' ? null : NF.list(tab), list = items(tab), st = document.getElementById('status'), grid = document.getElementById('grid');
    var note = tab === 'saved' ? (list.length ? list.length + ' saved · readable offline' : '') :
      c ? 'Updated ' + NS.fmtTime(c.t) + ((navigator.onLine === false || err > c.t) ? ' · offline, showing saved' : '') : '';
    st.textContent = busy ? (note ? note + ' · refreshing…' : 'Loading…') : note;
    grid.innerHTML = '';
    if (!list.length) {
      grid.appendChild(el('p', { 'class': 'empty', text: tab === 'saved' ? 'Nothing saved yet. Tap ☆ on a story to keep it here.' :
        busy || !c && !err ? 'Loading stories…' : c ? 'No news for ' + NF.label(tab) + ' right now.' : 'Could not load news. Check the connection and tap ↻.' }));
      return;
    }
    list.forEach(function (s, i) { grid.appendChild(card(s, i)); });
  }
  function init() {
    document.getElementById('btnRef').onclick = function () { doRefresh(false); };
    var f = document.getElementById('search');
    f.addEventListener('submit', function (e) {
      e.preventDefault(); var q = f.q.value.trim().replace(/\s+/g, ' ').slice(0, 60); if (!q) return;
      f.q.value = ''; f.q.blur(); go('q:' + q); if (!NF.list(tab)) return; doRefresh(false);
    });
    document.addEventListener('visibilitychange', function () { if (document.hidden) leave(); else { render(); autoCheck(); } });
    window.addEventListener('online', function () { render(); autoCheck(); });
    window.addEventListener('offline', render);
    setInterval(function () { if (!document.hidden) autoCheck(); }, 60000);
    render(); autoCheck();
  }
  return { init: init, render: render, autoCheck: autoCheck };
})();
