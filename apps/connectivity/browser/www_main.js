/* Web Browser — www_main.js: WWW1 UI wiring (tabs, toolbar, frames, embed-blocked card, bookmarks, history, settings, help, shortcuts, theme) + WWW2a relay (Settings > Relay + Test, auto/per-tab routing, via-relay badge). */
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
  var relay = L.sanitizeRelay(S.relay());
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
    if (e.key === C.LS_RELAY) { relay = L.sanitizeRelay(S.relay()); renderTabs(); renderChrome(); }
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
    var tab = { id: nextId++, hist: hist || L.tabHistory(), title: '', status: 'home', timer: 0, pane: pane, frame: null, expect: '', mode: 'auto', via: false, slowUrl: '' };
    $('panes').appendChild(pane);
    tabs.push(tab);
    return tab;
  }

  function saveTabs() {
    var idx = Math.max(0, tabs.indexOf(activeTab()));
    S.saveTabs({ active: idx, tabs: tabs.map(function (t) { return { hist: t.hist, title: t.title, mode: t.mode }; }) });
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
      if (t.via) { var vb = el('span', 'via', 'relay'); vb.title = 'Loaded through the relay'; b.appendChild(vb); }
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
    $('viaBadge').hidden = !t.via;
    $('addrForm').classList.toggle('via', !!t.via);
    $('relayToggle').textContent = t.via ? '⇄ Load directly' : '⇄ Load through relay';
    $('relayToggle').disabled = isHome;
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

  /* ---------- relay (WWW2a) ---------- */
  function isHttpsHub() { return location.protocol === 'https:'; }

  /* 'direct' | 'relay' | 'newtab' for this tab and URL (see L.routeFor). */
  function routeOf(tab, url, timedOut) {
    return L.routeFor(url, { relay: relay, tabMode: tab.mode, isHttpsHub: isHttpsHub(), timedOut: !!timedOut });
  }

  /* Relay frames drop allow-same-origin when the relay shares this Hub's origin (proxied sites must not reach the app). */
  function setSandbox(f, viaRelay) {
    var want = viaRelay ? L.relaySandbox(C.FRAME_SANDBOX, relay.url, location.origin) : C.FRAME_SANDBOX;
    if (f.getAttribute('sandbox') !== want) f.setAttribute('sandbox', want);
  }

  /* Why the relay can't take this page right now, or '' when it can. */
  function relayProblem(url) {
    if (!/^https?:\/\//i.test(url || '')) return 'Only http and https pages can go through the relay.';
    if (!L.relayConfigured(relay)) return C.RELAY_NOT_SET;
    if (!relay.enabled) return C.RELAY_OFF;
    if (L.relayMixed(relay, isHttpsHub())) return 'This Hub is https, so the relay URL must be https too.';
    return '';
  }

  /* Menu: Load through relay / Load directly for the active tab (sticks for this tab). */
  function toggleRelay() {
    $('menu').hidden = true;
    var t = activeTab();
    var u = L.current(t.hist);
    if (u === C.HOME_URL) { toast('Open a page first'); return; }
    if (t.via) { t.mode = 'direct'; load(t, true); toast('This tab now loads pages directly'); return; }
    var why = relayProblem(u);
    if (why) { toast(why); if (!L.relayConfigured(relay) || !relay.enabled) openSheet('settings'); return; }
    t.mode = 'relay';
    load(t, true);
    toast('This tab now loads pages through the relay');
  }

  /* Load the tab's current URL: home page, a card, the frame, or the frame through the relay. timedOut: a direct load just timed out. */
  function load(tab, fromUser, timedOut) {
    clearTimeout(tab.timer);
    clearPaneExtras(tab);
    var url = L.current(tab.hist);
    tab.via = false;
    if (url === C.HOME_URL) {
      blankFrame(tab);
      tab.status = 'home';
      tab.pane.appendChild(renderHome());
    } else {
      var route = routeOf(tab, url, timedOut || tab.slowUrl === url);
      if (route === 'relay') {
        var rf = ensureFrame(tab);
        setSandbox(rf, true);
        rf.hidden = false;
        tab.status = 'loading';
        tab.via = true;
        var src = L.buildRelayUrl(relay.url, relay.secret, url, C.RELAY_SESSION);
        tab.expect = src;
        rf.src = src;
        tab.timer = setTimeout(function () {
          if (tab.status === 'loading' && L.current(tab.hist) === url) showCard(tab, C.RELAY_TIMEOUT_TITLE, C.RELAY_TIMEOUT_TEXT, true);
        }, C.RELAY_LOAD_TIMEOUT_MS);
      } else if (route === 'newtab' && L.isMixedContent(location.protocol, url)) {
        blankFrame(tab);
        tab.status = 'mixed';
        showCard(tab, C.MIXED_TITLE, C.MIXED_TEXT, false);
      } else if (route === 'newtab' && L.isKnownBlocked(url)) {
        blankFrame(tab);
        tab.status = 'blocked';
        showCard(tab, C.BLOCKED_TITLE, C.BLOCKED_TEXT, false);
        if (fromUser && settings.autoOpenBlocked) openExternal(url);
      } else if (route === 'newtab') {
        blankFrame(tab);
        tab.status = 'timeout';
        showCard(tab, C.TIMEOUT_TITLE, C.TIMEOUT_TEXT, false, true);
      } else {
        var f = ensureFrame(tab);
        setSandbox(f, false);
        f.hidden = false;
        tab.status = 'loading';
        tab.expect = url;
        f.src = url;
        tab.timer = setTimeout(function () {
          if (tab.status !== 'loading' || L.current(tab.hist) !== url) return;
          /* Auto mode + relay ready: a page that timed out is tried again through the relay. */
          if (routeOf(tab, url, true) === 'relay') {
            tab.slowUrl = url;
            toast('Slow or refusing site: trying through the relay');
            load(tab, false, true);
          } else {
            showCard(tab, C.TIMEOUT_TITLE, C.TIMEOUT_TEXT, true);
          }
        }, C.LOAD_TIMEOUT_MS);
      }
    }
    if (tab.id === activeId) { renderTabs(); renderChrome(true); saveTabs(); } else renderTabs();
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
      /* A same-origin relay frame shows the relay URL: keep only the original page URL (never the secret). */
      if (tab.via) href = L.unwrapRelayUrl(href, relay.url);
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
    var web = /^https?:\/\//i.test(url);
    if (web && tab.via) {
      var direct = el('button', 'ghost jelly', 'Load directly');
      direct.type = 'button';
      direct.onclick = function () { tab.mode = 'direct'; load(tab, true); };
      row.appendChild(direct);
    } else if (web && !relayProblem(url)) {
      var viaBtn = el('button', 'jelly', 'Load through relay ⇄');
      viaBtn.type = 'button';
      viaBtn.onclick = function () { tab.mode = 'relay'; load(tab, true); };
      row.appendChild(viaBtn);
    }
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
    if (web && !tab.via && relayProblem(url) && relayProblem(url) !== 'Only http and https pages can go through the relay.') {
      var note = el('p', 'hint', relayProblem(url) + ' ');
      var set = el('a', '', 'Relay settings');
      set.href = '#';
      set.onclick = function (e) { e.preventDefault(); openSheet('settings'); };
      note.appendChild(set);
      box.appendChild(note);
    }
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
      var tr = L.routeFor(b.url, { relay: relay, tabMode: 'auto', isHttpsHub: isHttpsHub() });
      if (tr === 'newtab') tile.appendChild(el('span', 'hint', 'opens in new tab'));
      else if (tr === 'relay') tile.appendChild(el('span', 'hint', 'via relay'));
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
    var note = el('p', 'hint', L.relayReady(relay)
      ? 'Sites that refuse to load inside this app go through your relay (marked "via relay"). '
      : 'Many big sites refuse to load inside this app; they show a card with "Open in new tab". Set up a relay in Settings to load them here. ');
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
      renderRelaySettings(body);
      body.appendChild(el('p', 'hint', 'Bookmarks history and settings are saved on this device only (localStorage keys starting browser_).'));
    } else {
      $('sheetTitle').textContent = 'Help';
      [
        'Type a web address or search words in the address bar. Pages open inside this app in a sandboxed frame.',
        "Many big sites (Google YouTube GitHub X Facebook DuckDuckGo and more) send a header that forbids loading inside another page. The app can't get around that: it shows \"This site doesn't allow embedding\" with an Open in new tab button. The ↗ button always opens the current page in a real browser tab.",
        "Some refusals can't be detected: a blocked page may show an empty or error frame. If nothing appears after a few seconds the app offers Open in new tab. Use ↗ any time.",
        'Back and Forward follow the addresses you opened from this app. Clicking links inside a page from another site is not tracked (browsers keep that private) so Back may skip those steps.',
        'On a secure (https) Hub, plain http pages are blocked inside the frame; open them in a new tab, or load them through the relay.',
        'Relay (Settings > Relay): with your Relay Server URL (ending in /relay) and its secret, sites that refuse embedding, plain http pages and pages that time out load through the relay instead, marked "via relay". Menu > Load through relay / Load directly switches the current tab. The address bar, history and bookmarks always keep the real address. Logins through the relay may not stick yet, and scripts on relayed pages that fetch data still go to the real site, so some pages look broken.',
        'Shortcuts (desktop, when the app has focus, not the page): Ctrl+L address bar · Ctrl+T new tab · Ctrl+W close tab · Alt+Left back · Alt+Right forward. Some browsers keep Ctrl+T and Ctrl+W for themselves.',
        'Logins and cookies inside frames may not work: browsers often block third-party cookies.'
      ].forEach(function (p) { body.appendChild(el('p', '', p)); });
    }
    $('sheetWrap').hidden = false;
  }

  /* ---------- Settings > Relay (WWW2a) ---------- */
  function timedFetch(url, opts, ms) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('no fetch'));
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var o = {};
    Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
    if (ctl) o.signal = ctl.signal;
    var timer = 0;
    return new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        if (ctl) ctl.abort();
        var e = new Error('timeout');
        e.name = 'AbortError';
        reject(e);
      }, ms || C.RELAY_TEST_TIMEOUT_MS);
      fetch(url, o).then(function (r) { clearTimeout(timer); resolve(r); }, function (e) { clearTimeout(timer); reject(e); });
    });
  }

  /* Health check, then (if www is on) the secret check. Calls done({level, text}). */
  function testRelay(done) {
    if (!L.relayConfigured(relay)) { done(L.healthMessage({ kind: 'notset' })); return; }
    if (L.relayMixed(relay, isHttpsHub())) { done(L.healthMessage({ kind: 'mixed' })); return; }
    var hurl = L.relayHealthUrl(relay.url);
    timedFetch(hurl, { cache: 'no-store' }).then(function (res) {
      return res.text().then(function (body) { return { kind: 'http', status: res.status, body: body }; });
    }, function (err) {
      if (err && err.name === 'AbortError') return { kind: 'timeout' };
      /* CORS or network failure: a no-cors probe only proves the relay is reachable. */
      return timedFetch(hurl, { mode: 'no-cors', cache: 'no-store' }).then(function () { return { kind: 'cors' }; },
        function (e2) { return { kind: e2 && e2.name === 'AbortError' ? 'timeout' : 'offline' }; });
    }).then(function (r) {
      var m = L.healthMessage(r);
      if (r.kind !== 'http' || m.www !== true) { done(m); return; }
      timedFetch(L.relaySecretProbeUrl(relay.url, relay.secret), { cache: 'no-store' })
        .then(function (res) { return res.status; }, function () { return 0; })
        .then(function (st) {
          var sm = L.secretProbeMessage(st);
          done({ level: sm.level === 'ok' ? 'ok' : sm.level, text: m.text + ' · ' + sm.text });
        });
    }).catch(function () { done(L.healthMessage({ kind: 'offline' })); });
  }

  function renderRelaySettings(body) {
    body.appendChild(el('h3', 'sec', 'Relay'));
    body.appendChild(el('p', 'hint', 'Your Relay Server (v0.7.0 or later, www module) loads sites that refuse embedding and plain http pages inside this app. Off until both fields are filled in.'));
    var field = function (text, type, value, ph) {
      var l = el('label', 'field');
      l.appendChild(el('span', '', text));
      var i = el('input');
      i.type = type;
      i.value = value;
      i.placeholder = ph;
      i.spellcheck = false;
      i.setAttribute('autocapitalize', 'off');
      i.setAttribute('autocomplete', type === 'password' ? 'new-password' : 'off');
      l.appendChild(i);
      body.appendChild(l);
      return i;
    };
    var urlIn = field('Relay URL', 'url', relay.url, 'https://machine.tailnet.ts.net/relay');
    var secIn = field('Secret', 'password', relay.secret, 'relay token');
    var enL = el('label');
    var en = el('input');
    en.type = 'checkbox';
    enL.appendChild(en);
    enL.appendChild(document.createTextNode('Use the relay for sites that need it'));
    body.appendChild(enL);
    var row = el('div', 'row');
    var test = el('button', 'jelly', 'Test');
    test.type = 'button';
    row.appendChild(test);
    body.appendChild(row);
    var out = el('p', 'relaystat');
    out.setAttribute('role', 'status');
    body.appendChild(out);
    var show = function (m) { out.className = 'relaystat ' + (m.level || ''); out.textContent = m.text || ''; };
    var sync = function () {
      var ok = L.relayConfigured(relay);
      en.disabled = !ok;
      en.checked = ok && relay.enabled;
      if (relay.url && !L.normalizeRelayBase(relay.url)) show({ level: 'error', text: 'The relay URL must start with https:// (or http://).' });
      else if (!ok) show({ level: '', text: C.RELAY_NOT_SET });
      else if (!relay.enabled) show({ level: '', text: C.RELAY_OFF });
      else if (L.relayMixed(relay, isHttpsHub())) show(L.healthMessage({ kind: 'mixed' }));
      else show({ level: '', text: 'Relay on. Tap Test to check it.' });
    };
    var save = function () {
      var was = L.relayConfigured(relay);
      relay.url = urlIn.value.trim();
      relay.secret = secIn.value.trim();
      var now = L.relayConfigured(relay);
      if (now && !was) relay.enabled = true; /* switch on the first time both fields are filled */
      if (!now) relay.enabled = false;
      S.saveRelay(relay);
      sync();
      renderTabs();
      renderChrome();
    };
    urlIn.oninput = save;
    secIn.oninput = save;
    en.onchange = function () { relay.enabled = en.checked && L.relayConfigured(relay); S.saveRelay(relay); sync(); renderTabs(); renderChrome(); };
    test.onclick = function () {
      test.disabled = true;
      show({ level: '', text: 'Testing…' });
      testRelay(function (m) { test.disabled = false; show(m); });
    };
    sync();
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
    $('relayToggle').onclick = toggleRelay;
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
        t.mode = (s && C.TAB_MODES.indexOf(s.mode) >= 0) ? s.mode : 'auto';
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
