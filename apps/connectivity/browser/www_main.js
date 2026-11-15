/* Web Browser — www_main.js: WWW1 UI wiring (tabs, toolbar, frames, embed-blocked card, bookmarks, history, settings, help, shortcuts, theme). */
(function () {
  'use strict';

  var C = window.WWW_CONFIG;
  var L = window.WWW_LOGIC;
  var storage = null;
  try { storage = window.localStorage; } catch (_) { storage = null; }
  var S = window.WWW_STORE.createStore(storage);

  var $ = function (id) { return document.getElementById(id); };
  var el = function (tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  var settings = L.mergeSettings(S.settings());
  var bookmarks = S.bookmarks();
  var history = S.history();
  var tabs = [];
  var activeId = 0;
  var nextId = 1;

  /* ---------- theme (shared Hub key, read only) ---------- */
  function applyTheme() {
    var t = '';
    try { t = storage ? storage.getItem(C.HUB_THEME_KEY) || '' : ''; } catch (_) { t = ''; }
    var dark = t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  }
  window.addEventListener('storage', function (e) {
    if (e.key === C.HUB_THEME_KEY) applyTheme();
    if (e.key === C.LS_BOOKMARKS) { bookmarks = S.bookmarks(); renderBookmarks(); }
  });

  /* ---------- toast + in-app confirm (a Hub window blocks confirm()) ---------- */
  var toastTimer = 0;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function confirmIn(text, yesLabel, onYes) {
    $('confirmText').textContent = text;
    $('confirmYes').textContent = yesLabel || 'OK';
    $('confirmWrap').hidden = false;
    $('confirmYes').onclick = function () { $('confirmWrap').hidden = true; onYes(); };
    $('confirmNo').onclick = function () { $('confirmWrap').hidden = true; };
    $('confirmNo').focus();
  }

  /* ---------- open outside the app ---------- */
  function openExternal(url) {
    if (!url || url === C.HOME_URL) { toast('Nothing to open on the home page'); return; }
    var a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* ---------- tabs ---------- */
  function tabById(id) {
    for (var i = 0; i < tabs.length; i++) if (tabs[i].id === id) return tabs[i];
    return null;
  }
  function activeTab() { return tabById(activeId); }

  function makeTab(hist) {
    var pane = el('div', 'pane');
    var tab = { id: nextId++, hist: hist || L.tabHistory(), title: '', status: 'home', timer: 0, pane: pane, frame: null, expect: '' };
    $('panes').appendChild(pane);
    tabs.push(tab);
    return tab;
  }

  function saveTabs() {
    var idx = Math.max(0, tabs.indexOf(activeTab()));
    S.saveTabs({ active: idx, tabs: tabs.map(function (t) { return { hist: t.hist, title: t.title }; }) });
  }

  function newTab(url) {
    if (tabs.length >= C.TABS_MAX) { toast('Up to ' + C.TABS_MAX + ' tabs'); return null; }
    var tab = makeTab();
    switchTo(tab.id);
    if (url) navigate(tab, url, false); else { load(tab, false); $('addr').focus(); }
    return tab;
  }

  function closeTab(id) {
    var tab = tabById(id);
    if (!tab) return;
    clearTimeout(tab.timer);
    var i = tabs.indexOf(tab);
    tab.pane.remove();
    tabs.splice(i, 1);
    if (!tabs.length) { var t = makeTab(); load(t, false); activeId = t.id; }
    else if (activeId === id) activeId = tabs[Math.min(i, tabs.length - 1)].id;
    switchTo(activeId);
  }

  function switchTo(id) {
    activeId = id;
    tabs.forEach(function (t) { t.pane.hidden = t.id !== id; });
    renderTabs();
    renderChrome(true);
    saveTabs();
  }

  function renderTabs() {
    var nav = $('tabs');
    nav.textContent = '';
    tabs.forEach(function (t) {
      var b = el('div', 'tab' + (t.id === activeId ? ' on' : '') + (t.status === 'loading' ? ' loading' : ''));
      var u = L.current(t.hist);
      var title = el('button', 'tt', t.title || L.labelFor(u));
      title.type = 'button';
      title.style.background = 'transparent';
      title.style.color = 'inherit';
      title.style.padding = '0';
      title.title = u === C.HOME_URL ? 'Home' : u;
      title.onclick = function () { switchTo(t.id); };
      var x = el('button', 'ic tx', '✕');
      x.type = 'button';
      x.title = 'Close tab (Ctrl+W)';
      x.setAttribute('aria-label', 'Close tab');
      x.onclick = function (e) { e.stopPropagation(); closeTab(t.id); };
      b.appendChild(title);
      b.appendChild(x);
      nav.appendChild(b);
      if (t.id === activeId) setTimeout(function () { b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, 0);
    });
  }

  /* Toolbar state for the active tab. force: also replace the address text while the user is typing (tab switch or navigation). */
  function renderChrome(force) {
    var t = activeTab();
    if (!t) return;
    var u = L.current(t.hist);
    if (force || document.activeElement !== $('addr')) $('addr').value = u === C.HOME_URL ? '' : u;
    $('back').disabled = !L.canBack(t.hist);
    $('fwd').disabled = !L.canForward(t.hist);
    var loading = t.status === 'loading';
    $('reload').hidden = loading;
    $('stop').hidden = !loading;
    var isHome = u === C.HOME_URL;
    $('star').disabled = isHome;
    $('ext').disabled = isHome;
    var on = !isHome && L.hasBookmark(bookmarks, u);
    $('star').textContent = on ? '★' : '☆';
    $('star').title = on ? 'Remove bookmark' : 'Bookmark this page';
    document.title = (t.title || (isHome ? '' : L.labelFor(u))) ? (t.title || L.labelFor(u)) + ' — ' + C.APP_NAME : C.APP_NAME;
  }

  /* ---------- navigation ---------- */
  function navigate(tab, url, fromUser) {
    tab.hist = L.push(tab.hist, url);
    tab.title = '';
    if (url !== C.HOME_URL) {
      history = L.addHistory(history, url, L.labelFor(url), Date.now());
      S.saveHistory(history);
    }
    load(tab, fromUser);
  }

  function ensureFrame(tab) {
    if (tab.frame) return tab.frame;
    var f = document.createElement('iframe');
    f.setAttribute('sandbox', C.FRAME_SANDBOX);
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    f.setAttribute('allow', 'fullscreen; clipboard-write');
    f.title = 'Page';
    f.addEventListener('load', function () { onFrameLoad(tab); });
    tab.pane.appendChild(f);
    tab.frame = f;
    return f;
  }

  function blankFrame(tab) {
    if (tab.frame) { tab.expect = ''; tab.frame.src = 'about:blank'; tab.frame.hidden = true; }
  }

  function clearPaneExtras(tab) {
    Array.prototype.slice.call(tab.pane.querySelectorAll('.card,.home')).forEach(function (n) { n.remove(); });
  }

  /* Load the tab's current URL: home page, a card, or the frame. */
  function load(tab, fromUser) {
    clearTimeout(tab.timer);
    clearPaneExtras(tab);
    var url = L.current(tab.hist);
    if (url === C.HOME_URL) {
      blankFrame(tab);
      tab.status = 'home';
      tab.pane.appendChild(renderHome());
    } else if (L.isMixedContent(location.protocol, url)) {
      blankFrame(tab);
      tab.status = 'mixed';
      showCard(tab, C.MIXED_TITLE, C.MIXED_TEXT, false);
    } else if (L.isKnownBlocked(url)) {
      blankFrame(tab);
      tab.status = 'blocked';
      showCard(tab, C.BLOCKED_TITLE, C.BLOCKED_TEXT, false);
      if (fromUser && settings.autoOpenBlocked) openExternal(url);
    } else {
      var f = ensureFrame(tab);
      f.hidden = false;
      tab.status = 'loading';
      tab.expect = url;
      f.src = url;
      tab.timer = setTimeout(function () {
        if (tab.status === 'loading') showCard(tab, C.TIMEOUT_TITLE, C.TIMEOUT_TEXT, true);
      }, C.LOAD_TIMEOUT_MS);
    }
    if (tab.id === activeId) { renderTabs(); renderChrome(true); saveTabs(); }
  }

  function onFrameLoad(tab) {
    if (!tab.expect) return; /* about:blank */
    /* A late about:blank load from blankFrame() can arrive after a new src was set: ignore it. */
    try { if (tab.frame.contentWindow.location.href === 'about:blank' && tab.expect !== 'about:blank') return; } catch (_) { /* cross-origin: a real page */ }
    clearTimeout(tab.timer);
    tab.status = 'loaded';
    Array.prototype.slice.call(tab.pane.querySelectorAll('.card')).forEach(function (n) { n.remove(); });
    /* Same-origin pages can be read: follow in-page link clicks and pick up the title. Cross-origin throws. */
    try {
      var w = tab.frame.contentWindow;
      var href = w.location.href;
      if (href && href !== 'about:blank' && href !== L.current(tab.hist)) {
        tab.hist = L.push(tab.hist, href);
        history = L.addHistory(history, href, '', Date.now());
      }
      var title = w.document.title;
      if (title) {
        tab.title = title;
        history = L.addHistory(history, L.current(tab.hist), title, Date.now());
      }
      S.saveHistory(history);
    } catch (_) { /* cross-origin: keep the app-level URL and host label */ }
    if (tab.id === activeId) { renderTabs(); renderChrome(); saveTabs(); } else renderTabs();
  }

  function stop(tab) {
    if (tab.status !== 'loading') return;
    clearTimeout(tab.timer);
    blankFrame(tab);
    tab.status = 'stopped';
    clearPaneExtras(tab);
    showCard(tab, C.STOPPED_TITLE, C.STOPPED_TEXT, false, true);
    renderTabs();
    renderChrome();
  }

  /* The "can't embed" card, with Open in new tab (+ Keep waiting for a timeout, Reload for stopped). */
  function showCard(tab, title, text, overlay, reloadBtn) {
    Array.prototype.slice.call(tab.pane.querySelectorAll('.card')).forEach(function (n) { n.remove(); });
    var url = L.current(tab.hist);
    var card = el('div', 'card' + (overlay ? ' over' : ''));
    var box = el('div', 'box');
    box.appendChild(el('h2', '', title));
    box.appendChild(el('p', '', text));
    box.appendChild(el('p', 'hint', url));
    var row = el('div', 'row');
    var open = el('button', 'jelly', 'Open in new tab ↗');
    open.type = 'button';
    open.onclick = function () { openExternal(url); };
    row.appendChild(open);
    if (overlay) {
      var wait = el('button', 'ghost jelly', 'Keep waiting');
      wait.type = 'button';
      wait.onclick = function () { card.remove(); };
      row.appendChild(wait);
    }
    if (reloadBtn) {
      var re = el('button', 'ghost jelly', 'Reload');
      re.type = 'button';
      re.onclick = function () { load(tab, true); };
      row.appendChild(re);
    }
    box.appendChild(row);
    card.appendChild(box);
    tab.pane.appendChild(card);
  }

  /* ---------- home speed dial ---------- */
  function avatarColour(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return 'hsl(' + h + ',70%,48%)';
  }

  function renderHome() {
    var home = el('div', 'home');
    var h1 = el('h1');
    var img = el('img');
    img.src = 'browser_icon.png';
    img.alt = '';
    h1.appendChild(img);
    h1.appendChild(document.createTextNode(C.APP_NAME));
    h1.appendChild(el('span', 'tag', C.RELEASE));
    home.appendChild(h1);
    var dial = el('div', 'dial');
    bookmarks.forEach(function (b) {
      var tile = el('button', 'tile jelly');
      tile.type = 'button';
      tile.title = b.url;
      var av = el('span', 'av', (b.title || L.labelFor(b.url)).charAt(0).toUpperCase());
      av.style.background = avatarColour(L.hostOf(b.url) || b.url);
      tile.appendChild(av);
      tile.appendChild(el('span', 'nm', b.title || L.labelFor(b.url)));
      if (L.isKnownBlocked(b.url)) tile.appendChild(el('span', 'hint', 'opens in new tab'));
      tile.onclick = function () { go(b.url); };
      var rm = el('span', 'ic rm', '✕');
      rm.setAttribute('role', 'button');
      rm.setAttribute('aria-label', 'Remove bookmark ' + b.title);
      rm.onclick = function (e) {
        e.stopPropagation();
        confirmIn('Remove "' + b.title + '" from bookmarks?', 'Remove', function () { setBookmarks(L.removeBookmark(bookmarks, b.url)); });
      };
      tile.appendChild(rm);
      dial.appendChild(tile);
    });
    home.appendChild(dial);
    if (!bookmarks.length) home.appendChild(el('p', 'hint', 'No bookmarks yet. Open a page and tap ☆ to add it here.'));
    var recent = history.slice(0, 6);
    if (recent.length) {
      home.appendChild(el('h3', '', 'Recent'));
      home.appendChild(listOf(recent, function (e) { go(e.url); }, null, true));
    }
    var note = el('p', 'hint', 'Many big sites refuse to load inside this app; they show a card with "Open in new tab". ');
    var help = el('a', '', 'Help');
    help.href = '#';
    help.onclick = function (e) { e.preventDefault(); openSheet('help'); };
    note.appendChild(help);
    home.appendChild(note);
    return home;
  }

  /* Navigate the active tab to address-bar text. */
  function go(text) {
    var p = L.parseInput(text, settings.engine);
    if (!p) return;
    var tab = activeTab();
    if (p.kind === 'home') navigate(tab, C.HOME_URL, true);
    else navigate(tab, p.url, true);
    $('addr').blur();
  }

  /* ---------- bookmarks ---------- */
  function setBookmarks(list) {
    bookmarks = list;
    S.saveBookmarks(bookmarks);
    renderBookmarks();
  }

  function renderBookmarks() {
    var bar = $('bmbar');
    bar.textContent = '';
    if (settings.bookmarksBar) {
      bookmarks.forEach(function (b) {
        var btn = el('button', 'jelly', b.title || L.labelFor(b.url));
        btn.type = 'button';
        btn.title = b.url;
        btn.onclick = function () { go(b.url); };
        bar.appendChild(btn);
      });
    }
    renderChrome();
    tabs.forEach(function (t) {
      if (t.status === 'home') { clearPaneExtras(t); t.pane.appendChild(renderHome()); }
    });
    if (!$('sheetWrap').hidden && $('sheet').dataset.kind === 'bookmarks') openSheet('bookmarks');
  }

  function toggleStar() {
    var t = activeTab();
    var u = L.current(t.hist);
    if (u === C.HOME_URL) return;
    var had = L.hasBookmark(bookmarks, u);
    setBookmarks(L.toggleBookmark(bookmarks, u, t.title || L.labelFor(u)));
    toast(had ? 'Bookmark removed' : 'Bookmarked');
  }

  /* ---------- sheets: bookmarks / history / settings / help ---------- */
  function fmtTime(t) {
    try { return new Date(t).toLocaleString(); } catch (_) { return ''; }
  }

  /* A list of {url,title,t} rows; onGo(entry), onRemove(entry) or null. */
  function listOf(items, onGo, onRemove, showTime) {
    var ul = el('ul', 'list');
    items.forEach(function (e) {
      var li = el('li');
      var b = el('button', 'go');
      b.type = 'button';
      b.appendChild(el('b', '', e.title || L.labelFor(e.url)));
      b.appendChild(el('small', '', (showTime && e.t ? fmtTime(e.t) + ' · ' : '') + e.url));
      b.onclick = function () { onGo(e); };
      li.appendChild(b);
      if (onRemove) {
        var x = el('button', 'ic jelly', '✕');
        x.type = 'button';
        x.setAttribute('aria-label', 'Remove');
        x.onclick = function () { onRemove(e); };
        li.appendChild(x);
      }
      ul.appendChild(li);
    });
    return ul;
  }

  function closeSheet() { $('sheetWrap').hidden = true; }

  function openSheet(kind) {
    $('menu').hidden = true;
    var body = $('sheetBody');
    body.textContent = '';
    $('sheet').dataset.kind = kind;
    var goClose = function (e) { closeSheet(); go(e.url); };
    if (kind === 'bookmarks') {
      $('sheetTitle').textContent = 'Bookmarks';
      var t = activeTab();
      var u = L.current(t.hist);
      if (u !== C.HOME_URL && !L.hasBookmark(bookmarks, u)) {
        var add = el('button', 'jelly', '☆ Bookmark this page');
        add.type = 'button';
        add.onclick = function () { setBookmarks(L.addBookmark(bookmarks, u, t.title || L.labelFor(u))); toast('Bookmarked'); };
        body.appendChild(add);
      }
      if (!bookmarks.length) body.appendChild(el('p', 'hint', 'No bookmarks yet.'));
      body.appendChild(listOf(bookmarks, goClose, function (e) { setBookmarks(L.removeBookmark(bookmarks, e.url)); }, false));
    } else if (kind === 'history') {
      $('sheetTitle').textContent = 'History';
      var q = el('input');
      q.type = 'search';
      q.placeholder = 'Search history';
      var holder = el('div');
      var draw = function () {
        holder.textContent = '';
        var found = L.searchHistory(history, q.value);
        if (!found.length) holder.appendChild(el('p', 'hint', history.length ? 'No matches.' : 'History is empty.'));
        holder.appendChild(listOf(found, goClose, function (e) {
          history = L.removeHistory(history, e.url, e.t);
          S.saveHistory(history);
          draw();
        }, true));
      };
      q.oninput = draw;
      body.appendChild(q);
      body.appendChild(holder);
      var clr = el('button', 'danger jelly', 'Clear history');
      clr.type = 'button';
      clr.style.marginTop = '14px';
      clr.onclick = function () {
        confirmIn('Clear all ' + history.length + ' history entries on this device?', 'Clear', function () {
          history = [];
          S.saveHistory(history);
          draw();
          toast('History cleared');
        });
      };
      body.appendChild(clr);
      draw();
    } else if (kind === 'settings') {
      $('sheetTitle').textContent = 'Settings';
      var lab = el('label', '', 'Search engine');
      var sel = el('select');
      Object.keys(C.ENGINES).forEach(function (id) {
        var o = el('option', '', C.ENGINES[id].label + (C.ENGINES[id].frames ? '' : ' (results open in a new tab)'));
        o.value = id;
        if (id === settings.engine) o.selected = true;
        sel.appendChild(o);
      });
      sel.onchange = function () { settings.engine = sel.value; S.saveSettings(settings); toast('Search: ' + C.ENGINES[sel.value].label); };
      lab.appendChild(sel);
      body.appendChild(lab);
      var check = function (key, text) {
        var l = el('label');
        var c = el('input');
        c.type = 'checkbox';
        c.checked = !!settings[key];
        c.onchange = function () { settings[key] = c.checked; S.saveSettings(settings); renderBookmarks(); };
        l.appendChild(c);
        l.appendChild(document.createTextNode(text));
        body.appendChild(l);
      };
      check('bookmarksBar', 'Show the bookmarks bar');
      check('autoOpenBlocked', 'Open sites that refuse embedding straight in a new tab');
      body.appendChild(el('p', 'hint', 'Bookmarks history and settings are saved on this device only (localStorage keys starting browser_).'));
    } else {
      $('sheetTitle').textContent = 'Help';
      [
        'Type a web address or search words in the address bar. Pages open inside this app in a sandboxed frame.',
        "Many big sites (Google YouTube GitHub X Facebook DuckDuckGo and more) send a header that forbids loading inside another page. The app can't get around that: it shows \"This site doesn't allow embedding\" with an Open in new tab button. The ↗ button always opens the current page in a real browser tab.",
        "Some refusals can't be detected: a blocked page may show an empty or error frame. If nothing appears after a few seconds the app offers Open in new tab. Use ↗ any time.",
        'Back and Forward follow the addresses you opened from this app. Clicking links inside a page from another site is not tracked (browsers keep that private) so Back may skip those steps.',
        'On a secure (https) Hub, plain http pages are blocked inside the frame; open them in a new tab.',
        'Shortcuts (desktop, when the app has focus, not the page): Ctrl+L address bar · Ctrl+T new tab · Ctrl+W close tab · Alt+Left back · Alt+Right forward. Some browsers keep Ctrl+T and Ctrl+W for themselves.',
        'Logins and cookies inside frames may not work: browsers often block third-party cookies.'
      ].forEach(function (p) { body.appendChild(el('p', '', p)); });
    }
    $('sheetWrap').hidden = false;
  }

  /* ---------- wiring ---------- */
  function wire() {
    $('newTab').onclick = function () { newTab(); };
    $('back').onclick = function () { var t = activeTab(); if (L.canBack(t.hist)) { t.hist = L.back(t.hist); t.title = ''; load(t, true); } };
    $('fwd').onclick = function () { var t = activeTab(); if (L.canForward(t.hist)) { t.hist = L.forward(t.hist); t.title = ''; load(t, true); } };
    $('reload').onclick = function () { load(activeTab(), true); };
    $('stop').onclick = function () { stop(activeTab()); };
    $('home').onclick = function () { navigate(activeTab(), C.HOME_URL, true); };
    $('star').onclick = toggleStar;
    $('ext').onclick = function () { openExternal(L.current(activeTab().hist)); };
    $('addrForm').onsubmit = function (e) { e.preventDefault(); go($('addr').value); };
    $('addr').onfocus = function () { this.select(); };
    $('addr').onblur = function () { renderChrome(); };
    $('menuBtn').onclick = function (e) { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; };
    Array.prototype.slice.call(document.querySelectorAll('#menu [data-sheet]')).forEach(function (b) {
      b.onclick = function () { openSheet(b.getAttribute('data-sheet')); };
    });
    document.addEventListener('click', function (e) {
      if (!$('menu').hidden && !$('menu').contains(e.target)) $('menu').hidden = true;
    });
    $('sheetClose').onclick = closeSheet;
    $('sheetWrap').onclick = function (e) { if (e.target === $('sheetWrap')) closeSheet(); };

    document.addEventListener('keydown', function (e) {
      var k = (e.key || '').toLowerCase();
      var ctrl = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape') {
        if (!$('confirmWrap').hidden) { $('confirmWrap').hidden = true; return; }
        if (!$('sheetWrap').hidden) { closeSheet(); return; }
        $('menu').hidden = true;
        if (document.activeElement === $('addr')) $('addr').blur();
        return;
      }
      if (ctrl && !e.altKey && k === 'l') { e.preventDefault(); $('addr').focus(); $('addr').select(); }
      else if (ctrl && !e.altKey && k === 't') { e.preventDefault(); newTab(); }
      else if (ctrl && !e.altKey && k === 'w') { e.preventDefault(); closeTab(activeId); }
      else if (e.altKey && !ctrl && e.key === 'ArrowLeft') { e.preventDefault(); $('back').click(); }
      else if (e.altKey && !ctrl && e.key === 'ArrowRight') { e.preventDefault(); $('fwd').click(); }
    });
  }

  /* Restore saved tabs (pages reload) or start with one home tab. ?url= opens that address. */
  function start() {
    applyTheme();
    wire();
    var saved = S.tabs();
    var activeIdx = 0;
    if (saved && Array.isArray(saved.tabs) && saved.tabs.length) {
      saved.tabs.slice(0, C.TABS_MAX).forEach(function (s) {
        var t = makeTab(L.sanitizeTabHistory(s && s.hist));
        t.title = (s && typeof s.title === 'string') ? s.title : '';
      });
      activeIdx = Math.max(0, Math.min(tabs.length - 1, saved.active | 0));
    } else {
      makeTab();
    }
    activeId = tabs[activeIdx].id;
    tabs.forEach(function (t) { load(t, false); });
    renderBookmarks();
    switchTo(activeId);
    var m = /[?&]url=([^&#]*)/.exec(location.search);
    if (m) {
      var text = '';
      try { text = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (_) { text = ''; }
      if (text) newTab(L.parseInput(text, settings.engine) ? L.parseInput(text, settings.engine).url : null);
    }
  }

  start();
})();
