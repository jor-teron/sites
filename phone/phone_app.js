/*
 * Phone launcher PH1 — UI. Needs PhoneSave, PhoneApps, PhoneGesture.
 * Layers (bottom → top): #home (pages + dots + dock) · #drawer · #panel · #apps (iframes) · #sheet · #dialog.
 * History: every layer that opens pushes {ph:depth}; Back (browser / Android WebView goBack) → popstate →
 *   close layers until the depth matches. Gestures that close a layer call history.back(), so the two agree.
 * Hub handshake for apps in the iframes: {sharedLink:'ready'} from OUR frame + OUR origin → {sharedLink:'hello',
 *   code, prefix:'jtsites-', devices:[]} when a Connect Code is saved on this device (join code, else the Hub's own).
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var A = window.PhoneApps, G = window.PhoneGesture, S = window.PhoneSave;
  var RELEASE = 'PH1';
  var d = S.load();
  var root = document.documentElement;

  /* ---------- data clean-up (apps that left the catalog) ---------- */
  function clean() {
    d.dock = d.dock.filter(A.has);
    d.pages = d.pages.map(function (p) { return p.filter(A.has); });
    d.pages = d.pages.filter(function (p, i) { return i === 0 || p.length; });
    if (d.pages.length < 2) d.pages.push([]);   // always a page to swipe to (+ hint)
    d.recent = d.recent.filter(A.has);
  }
  clean();
  function persist() { clean(); if (!S.save(d)) toast('Could not save (storage full or blocked)'); }
  var pageCap = function (i) { return i === 0 ? 16 : S.PAGE_MAX; };

  /* ---------- small UI helpers ---------- */
  var toastT = 0;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2200); }
  var dlgDone = null;
  /** In-app dialog: buttons [{label, cls}] → Promise(index, -1 = dismissed). */
  function ask(msg, buttons) {
    return new Promise(function (res) {
      if (dlgDone) dlgDone(-1);
      $('dialog-msg').textContent = msg;
      var row = $('dialog-row'); row.textContent = '';
      (buttons || [{ label: 'OK' }]).forEach(function (b, i) {
        var el = document.createElement('button');
        el.type = 'button'; el.className = 'mini' + (b.cls ? ' ' + b.cls : ''); el.textContent = b.label;
        el.addEventListener('click', function () { done(i); });
        row.appendChild(el);
      });
      $('dialog').hidden = false;
      var last = row.lastChild; if (last) last.focus();
      function done(i) { dlgDone = null; $('dialog').hidden = true; res(i); }
      dlgDone = done;
    });
  }
  $('dialog').addEventListener('pointerdown', function (e) { if (e.target === $('dialog') && dlgDone) dlgDone(-1); });
  function letterColor(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return 'hsl(' + h + ',45%,42%)'; }
  function iconBox(a) {
    var im = document.createElement('span'); im.className = 'im';
    var letter = function () { im.textContent = ''; im.style.background = letterColor(a.name); var l = document.createElement('span'); l.className = 'lt'; l.textContent = a.name.charAt(0).toUpperCase(); im.appendChild(l); };
    if (a.icon) {
      var img = document.createElement('img');
      img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.draggable = false;
      img.onerror = letter; img.src = a.icon;
      im.appendChild(img);
    } else letter();
    return im;
  }
  function iconBtn(a, where) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'ic'; b.dataset.app = a.id; b.dataset.where = where;
    b.title = a.name; b.setAttribute('aria-label', a.name);
    b.appendChild(iconBox(a));
    var l = document.createElement('span'); l.className = 'lbl'; l.textContent = a.name; b.appendChild(l);
    return b;
  }
  // keyboard / screen reader "click" (detail 0); pointer taps are handled by the gesture code
  document.addEventListener('click', function (e) {
    if (e.detail !== 0) return;
    var t = e.target.closest && e.target.closest('.ic, .tab, .dot, .tile');
    if (!t) return;
    if (t.classList.contains('ic')) openApp(t.dataset.app);
    else if (t.classList.contains('tab')) setCat(t.dataset.cat);
    else if (t.classList.contains('dot')) showPage(+t.dataset.page);
    else tileAction(t.dataset.tile);
  });

  /* ---------- theme + wallpaper ---------- */
  function hubTheme() { try { return localStorage.getItem('sites-hub.theme'); } catch (_) { return null; } }
  function applyTheme() {
    var m = d.settings.theme, t = hubTheme();
    var dark = m === 'dark' || (m === 'system' && (t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)));
    root.classList.toggle('dark', dark);
    // H80: the Hub accent (sites-hub.accent, Settings > Look) colours the phone too; unset = phone's own blue
    var acc = ''; try { acc = localStorage.getItem('sites-hub.accent') || ''; } catch (_) { /* blocked */ }
    if (/^#[0-9a-f]{6}$/i.test(acc)) root.style.setProperty('--acc', acc); else root.style.removeProperty('--acc');
  }
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme); } catch (_) { /* old */ }
  // addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') applyTheme(); });   (PH1)
  addEventListener('storage', function (e) { if (!e.key || e.key === 'sites-hub.theme' || e.key === 'sites-hub.accent') applyTheme(); });   // H80
  // H80: Hub Settings in a phone frame posts {type:'hub-prefs'} after each change (settings_store.js)
  addEventListener('message', function (e) { if (e.origin === location.origin && e.data && e.data.type === 'hub-prefs') applyTheme(); });
  var qs = new URLSearchParams(location.search);
  var isWebView = /; wv\)/.test(navigator.userAgent) || qs.get('webview') === '1';
  /** ?bg=none|transparent|auto|<hex> beats the setting (for testing in a browser). */
  function wallValue() {
    var q = (qs.get('bg') || '').trim().replace(/^#/, '');
    if (q) {
      if (/^(none|transparent|0)$/i.test(q)) return 'none';
      if (/^auto$/i.test(q)) return 'auto';
      if (/^[0-9a-f]{3}$/i.test(q)) q = q.replace(/(.)/g, '$1$1');
      if (/^[0-9a-f]{6}$/i.test(q)) return '#' + q.toLowerCase();
    }
    return d.settings.wall;
  }
  function applyWall() {
    var w = wallValue(), el = $('wall');
    if (w === 'none' || (w === 'auto' && isWebView)) { el.hidden = true; el.style.background = ''; return; }
    el.hidden = false;
    el.style.background = w === 'auto' ? '' : w;
  }

  /* ---------- clock ---------- */
  var clockT = 0;
  function fmtTime(dt) {
    var h = dt.getHours(), m = dt.getMinutes();
    if (!d.settings.clock24) { h = h % 12 || 12; }
    return (d.settings.clock24 && h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function fmtDate(dt) { return dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }); }
  function tick() {
    var now = new Date();
    var t = document.querySelector('.clock .t'), dd = document.querySelector('.clock .d');
    if (t) t.textContent = fmtTime(now);
    if (dd) dd.textContent = fmtDate(now);
    $('panel-clock').textContent = fmtTime(now) + ' · ' + fmtDate(now);
    clearTimeout(clockT);
    clockT = setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });

  /* ---------- home pages + dock ---------- */
  var page = 0;
  function renderHome() {
    var pages = $('pages'); pages.textContent = '';
    d.pages.forEach(function (p, i) {
      var pg = document.createElement('div'); pg.className = 'page'; pg.dataset.page = i;
      if (i === 0) {
        var c = document.createElement('div'); c.className = 'clock';
        c.innerHTML = '<div class="t"></div><div class="d"></div>';
        pg.appendChild(c);
      }
      if (p.length) {
        var g = document.createElement('div'); g.className = 'grid';
        p.forEach(function (id) { g.appendChild(iconBtn(A.get(id), 'home')); });
        pg.appendChild(g);
      } else if (i > 0) {
        var e = document.createElement('div'); e.className = 'empty';
        e.textContent = 'Swipe up for all apps. Long-press an app to pin it here.';
        pg.appendChild(e);
      }
      pages.appendChild(pg);
    });
    var dots = $('dots'); dots.textContent = '';
    d.pages.forEach(function (_, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'dot'; b.dataset.page = i;
      b.setAttribute('aria-label', 'Page ' + (i + 1)); b.setAttribute('role', 'tab');
      dots.appendChild(b);
    });
    var dock = $('dock'); dock.textContent = '';
    d.dock.forEach(function (id) { dock.appendChild(iconBtn(A.get(id), 'dock')); });
    dock.style.gridTemplateColumns = 'repeat(' + Math.max(4, d.dock.length) + ',1fr)';
    if (page >= d.pages.length) page = d.pages.length - 1;
    showPage(page, true);
    tick();
  }
  function showPage(i, instant) {
    page = Math.max(0, Math.min(d.pages.length - 1, i));
    var pg = $('pages');
    if (instant) pg.classList.add('drag');
    pg.style.transform = 'translateX(' + (-page * 100) + '%)';
    if (instant) { void pg.offsetWidth; pg.classList.remove('drag'); }
    Array.prototype.forEach.call($('dots').children, function (b, k) { b.classList.toggle('on', k === page); b.setAttribute('aria-selected', k === page); });
  }

  /* ---------- history / layers ---------- */
  var stack = [];
  function push(layer) { stack.push(layer); history.pushState({ ph: stack.length, layer: layer }, ''); }
  function back() { if (stack.length) history.back(); }
  function replaceTop(layer) { stack[stack.length - 1] = layer; history.replaceState({ ph: stack.length, layer: layer }, ''); }
  history.replaceState({ ph: 0 }, '');
  addEventListener('popstate', function (e) {
    var depth = (e.state && typeof e.state.ph === 'number') ? e.state.ph : 0;
    while (stack.length > depth) closeLayer(stack.pop());
  });
  function closeLayer(l) {
    if (l === 'drawer') closeDrawerUI();
    else if (l === 'panel') closePanelUI();
    else if (l === 'app') closeAppUI();
    else if (l === 'sheet') closeSheetUI();
  }
  function setOpen(el, on) { el.classList.toggle('open', on); el.setAttribute('aria-hidden', on ? 'false' : 'true'); }
  var top = function () { return stack[stack.length - 1] || ''; };

  /* ---------- drawer ---------- */
  var cats = ['All'].concat(A.cats()), cat = 'All';
  function renderTabs() {
    var t = $('tabs'); t.textContent = '';
    cats.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'tab' + (c === cat ? ' on' : '');
      b.dataset.cat = c; b.textContent = c; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', c === cat);
      t.appendChild(b);
    });
  }
  function renderList() {
    var q = $('search').value, list = $('list');
    var items = q.trim() ? A.search(q) : A.list(cat);
    list.textContent = '';
    if (!items.length) { var n = document.createElement('div'); n.className = 'none'; n.textContent = 'No apps match “' + q.trim() + '”'; list.appendChild(n); return; }
    var g = document.createElement('div'); g.className = 'grid'; g.setAttribute('role', 'list');
    items.forEach(function (a) { g.appendChild(iconBtn(a, 'drawer')); });
    list.appendChild(g);
    list.scrollTop = 0;
  }
  function setCat(c) {
    if (cats.indexOf(c) < 0 || (c === cat && !$('search').value)) return;
    cat = c;
    if ($('search').value) $('search').value = '';
    renderTabs(); renderList();
    var on = $('tabs').querySelector('.tab.on');
    if (on) { var t = $('tabs'); t.scrollLeft = on.offsetLeft - t.clientWidth / 2 + on.offsetWidth / 2; }
  }
  $('search').addEventListener('input', function () {
    $('tabs').querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', !$('search').value && b.dataset.cat === cat); });
    renderList();
  });
  $('search').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { var f = $('list').querySelector('.ic'); if (f) openApp(f.dataset.app); }
  });
  var drawerBuilt = false;
  function openDrawer() {
    if (top() === 'drawer') return;
    if (!drawerBuilt) { renderTabs(); renderList(); drawerBuilt = true; }
    var dr = $('drawer'); dr.style.transform = ''; dr.classList.remove('peek', 'drag');
    setOpen(dr, true); document.body.classList.add('drawer-open');
    push('drawer');
  }
  function closeDrawerUI() {
    var dr = $('drawer'); dr.style.transform = ''; dr.classList.remove('peek', 'drag');
    setOpen(dr, false); document.body.classList.remove('drawer-open');
    if (document.activeElement === $('search')) $('search').blur();
    if ($('search').value) { $('search').value = ''; renderTabs(); renderList(); }
  }

  /* ---------- quick panel ---------- */
  var notices = [];   // PH1: empty; later releases add Hub notices here
  function tiles() {
    var th = d.settings.theme;
    var fs = !!document.fullscreenElement;
    return [
      { id: 'theme', e: th === 'dark' ? '🌙' : th === 'light' ? '☀️' : '🌓', label: 'Theme: ' + (th === 'system' ? 'Hub' : th[0].toUpperCase() + th.slice(1)) },   // H80: system = follow Hub
      { id: 'fullscreen', e: '⛶', label: fs ? 'Exit full screen' : 'Full screen', on: fs, off: !(root.requestFullscreen || root.webkitRequestFullscreen) },
      { id: 'intercom', e: '📢', label: 'Intercom', off: !A.has('intercom') },
      { id: 'telephone', e: '📞', label: 'Telephone', off: !A.has('telephone') },
      { id: 'location', e: '📍', label: 'Location', off: !locationApp() },
      { id: 'settings', e: '⚙️', label: 'Settings' },
      { id: 'hub-settings', e: '🛠️', label: 'Hub Settings' }   // H80
    ];
  }
  function locationApp() { return ['live-location', 'location', 'live-location-share'].filter(A.has)[0] || ''; }
  function renderPanel() {
    var t = $('tiles'); t.textContent = '';
    tiles().forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'tile' + (x.on ? ' on' : '') + (x.off ? ' off' : '');
      b.dataset.tile = x.id; b.setAttribute('aria-label', x.label);
      b.innerHTML = '<span class="e"></span><span class="l"></span>';
      b.firstChild.textContent = x.e; b.lastChild.textContent = x.label;
      t.appendChild(b);
    });
    if (window.HubNotify && HubNotify.render) HubNotify.render(); else {   // H81: Hub notices (phone/phone_notify.js)
    var n = $('notices'); n.textContent = '';
    if (!notices.length) { var li = document.createElement('li'); li.className = 'none'; li.textContent = 'No notices'; n.appendChild(li); }
    notices.forEach(function (x) { var l = document.createElement('li'); l.textContent = x; n.appendChild(l); });
    }
    tick();
  }
  function openPanel() {
    if (top() === 'panel') return;
    renderPanel();
    var b = $('panel-box'); b.style.transform = ''; b.classList.remove('drag'); $('panel').classList.remove('peek');
    setOpen($('panel'), true);
    push('panel');
  }
  function closePanelUI() { var b = $('panel-box'); b.style.transform = ''; b.classList.remove('drag'); $('panel').classList.remove('peek'); setOpen($('panel'), false); }
  function tileAction(id) {
    if (id === 'theme') {
      var order = ['dark', 'light', 'system'];
      d.settings.theme = order[(order.indexOf(d.settings.theme) + 1) % 3];
      persist(); applyTheme(); renderPanel(); toast('Theme: ' + (d.settings.theme === 'system' ? 'follow Hub' : d.settings.theme));
    } else if (id === 'fullscreen') {
      toggleFullscreen();
    } else if (id === 'intercom' || id === 'telephone') {
      if (A.has(id)) openApp(id); else ask(id + ' is not in the Hub catalog on this device.');
    } else if (id === 'location') {
      var l = locationApp();
      if (l) openApp(l);
      else ask('Live Location (LL1) is not built yet. This tile will open it once it is.');
    } else if (id === 'settings') {
      openSettings();
    } else if (id === 'hub-settings') {
      openApp(HUB_SETTINGS.id);   // H80
    }
  }
  function toggleFullscreen() {
    var on = document.fullscreenElement || document.webkitFullscreenElement;
    var p;
    try {
      p = on ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
        : (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
    } catch (_) { p = Promise.reject(); }
    Promise.resolve(p).catch(function () { toast('Full screen is not available here'); }).then(function () { setTimeout(renderPanel, 150); });
  }
  document.addEventListener('fullscreenchange', function () { if (top() === 'panel') renderPanel(); });

  /* ---------- apps (iframes) ---------- */
  var frames = [];   // [{id, el}] most recent first
  var cur = '';
  function hubCode() {
    try { return (localStorage.getItem('shared-link-join-code') || localStorage.getItem('jtsites-hub-ctrl-code') || '').toUpperCase(); } catch (_) { return ''; }
  }
  // H80: Hub Settings (apps/system/settings/) is a system app, not in the catalog; opened in a phone frame
  var HUB_SETTINGS = { id: 'hub-settings', name: 'Settings', url: 'apps/system/settings/index.html' };
  function openApp(id) {
    var a = id === HUB_SETTINGS.id ? HUB_SETTINGS : A.get(id);
    if (!a) { ask('That app is no longer in the Hub catalog.'); return; }
    if (a !== HUB_SETTINGS) {   // H80: not in recent (recent lists catalog apps)
      d.recent = [id].concat(d.recent.filter(function (x) { return x !== id; })).slice(0, 8);
      persist();
    }
    var f = frames.filter(function (x) { return x.id === id; })[0];
    if (!f) {
      var el = document.createElement('iframe');
      el.title = a.name;
      el.setAttribute('allow', 'camera; microphone; geolocation; fullscreen; autoplay; clipboard-read; clipboard-write; display-capture; screen-wake-lock; picture-in-picture');
      el.setAttribute('allowfullscreen', '');
      el.dataset.app = id;
      el.src = a.url;
      $('frames').appendChild(el);
      f = { id: id, el: el };
    }
    frames = [f].concat(frames.filter(function (x) { return x !== f; }));
    // keep at most keepAlive frames (the open one included)
    while (frames.length > d.settings.keepAlive) { var old = frames.pop(); old.el.src = 'about:blank'; old.el.remove(); }
    frames.forEach(function (x) { x.el.hidden = x !== f; });
    cur = id;
    var ap = $('apps'); ap.style.transform = ''; ap.classList.remove('drag');
    setOpen(ap, true); document.body.classList.add('app-open');
    document.title = a.name + ' · Phone ' + RELEASE;
    if (top() === 'drawer') { closeDrawerUI(); replaceTop('app'); }
    else if (top() === 'panel') { closePanelUI(); replaceTop('app'); }
    else if (top() === 'sheet') { closeSheetUI(); replaceTop('app'); }   // over the drawer: Back returns to the drawer
    else if (top() === 'app') { /* already in an app: switch */ }
    else push('app');
    setTimeout(function () { try { f.el.focus(); } catch (_) { /* */ } }, 50);
  }
  function closeAppUI() {
    var ap = $('apps'); ap.style.transform = ''; ap.classList.remove('drag');
    $('edge-arrow').style.cssText = '';
    setOpen(ap, false); document.body.classList.remove('app-open');
    frames.forEach(function (x) { x.el.hidden = true; });
    cur = ''; document.title = 'Phone ' + RELEASE;
  }
  // Hub handshake (R57 rules: our own frame AND our own origin)
  addEventListener('message', function (e) {
    var f = frames.filter(function (x) { return x.el.contentWindow === e.source; })[0];
    if (!f) return;
    var file = location.protocol === 'file:';
    if (!file && e.origin !== location.origin) return;
    var m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.sharedLink === 'ready') {
      // var code = hubCode();   (PH1)
      var H = window.HubMeshLink;   // H79: follow the Hub mesh: private code only while linked, else no hello (apps use 0000 via HubMeshLink)
      var code = H ? H.privateCode() : hubCode();
      if (code) f.el.contentWindow.postMessage({ sharedLink: 'hello', code: code, prefix: 'jtsites-', devices: [] }, file ? '*' : location.origin);
    }
  });

  /* ---------- sheet: long-press menu, app info, settings ---------- */
  function openSheet(build) {
    var box = $('sheet-box'); box.textContent = '';
    build(box);
    if (top() === 'sheet') return;
    setOpen($('sheet'), true);
    if (top() === 'panel') { closePanelUI(); replaceTop('sheet'); }   // Settings from the quick panel replaces it
    else push('sheet');
  }
  function closeSheetUI() { setOpen($('sheet'), false); }
  function sheetBtn(box, e, label, fn, cls) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'sh-btn' + (cls ? ' ' + cls : '');
    b.innerHTML = '<span class="e"></span><span></span>'; b.firstChild.textContent = e; b.lastChild.textContent = label;
    b.dataset.act = label;
    b.addEventListener('click', fn); box.appendChild(b); return b;
  }
  function sheetHead(box, a, sub) {
    var h = document.createElement('div'); h.className = 'sh-head';
    h.appendChild(iconBox(a));
    var t = document.createElement('div'); t.innerHTML = '<b></b><small></small>';
    t.firstChild.textContent = a.name; t.lastChild.textContent = sub || a.cat;
    h.appendChild(t); box.appendChild(h);
  }
  function onHome(id) { return d.pages.some(function (p) { return p.indexOf(id) >= 0; }); }
  function pin(id) {
    if (onHome(id)) return;
    for (var i = 0; i < d.pages.length; i++) { if (d.pages[i].length < pageCap(i)) { d.pages[i].push(id); break; } }
    if (i === d.pages.length) d.pages.push([id]);
    persist(); renderHome();
    toast(A.get(id).name + ' pinned to page ' + (i + 1));
  }
  function unpin(id) {
    d.pages = d.pages.map(function (p) { return p.filter(function (x) { return x !== id; }); });
    persist(); renderHome(); toast(A.get(id).name + ' removed from home');
  }
  function dockAdd(id) {
    if (d.dock.indexOf(id) >= 0) return;
    if (d.dock.length >= S.DOCK_MAX) { ask('The dock is full (' + S.DOCK_MAX + ' apps). Remove one from the dock first.'); return false; }
    d.dock.push(id); persist(); renderHome(); toast(A.get(id).name + ' added to the dock');
  }
  function dockRemove(id) { d.dock = d.dock.filter(function (x) { return x !== id; }); persist(); renderHome(); toast(A.get(id).name + ' removed from the dock'); }
  function menu(id) {
    var a = A.get(id); if (!a) return;
    openSheet(function (box) {
      sheetHead(box, a);
      sheetBtn(box, '▶', 'Open', function () { openApp(id); });
      if (onHome(id)) sheetBtn(box, '✕', 'Remove from home', function () { back(); unpin(id); });
      else sheetBtn(box, '📌', 'Pin to home', function () { back(); pin(id); });
      if (d.dock.indexOf(id) >= 0) sheetBtn(box, '⤓', 'Remove from dock', function () { back(); dockRemove(id); });
      else sheetBtn(box, '⤒', 'Add to dock', function () { back(); dockAdd(id); });
      sheetBtn(box, 'ⓘ', 'App info', function () { info(id); });
    });
  }
  function info(id) {
    var a = A.get(id);
    openSheet(function (box) {
      sheetHead(box, a, 'App info');
      var dl = document.createElement('dl'); dl.className = 'info';
      [['Name', a.name], ['Category', a.cat], ['Description', a.desc || '(none in the catalog)'], ['Path', a.url.replace(/^\.\.\//, '')],
        ['On home', onHome(id) ? 'Yes' : 'No'], ['In dock', d.dock.indexOf(id) >= 0 ? 'Yes' : 'No']].forEach(function (r) {
        var dt = document.createElement('dt'); dt.textContent = r[0]; var dd = document.createElement('dd'); dd.textContent = r[1];
        dl.appendChild(dt); dl.appendChild(dd);
      });
      box.appendChild(dl);
      sheetBtn(box, '▶', 'Open', function () { openApp(id); });
    });
  }
  function seg(key, opts, labels) {
    var s = document.createElement('div'); s.className = 'seg'; s.dataset.key = key;
    opts.forEach(function (v, i) {
      var b = document.createElement('button'); b.type = 'button'; b.dataset.v = String(v); b.textContent = labels[i];
      b.classList.toggle('on', d.settings[key] === v);
      b.addEventListener('click', function () {
        d.settings[key] = v; persist();
        s.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
        if (key === 'theme') applyTheme();
        if (key === 'clock24') tick();
        if (key === 'keepAlive') while (frames.length > v) { var old = frames.pop(); if (old.id === cur) { frames.unshift(old); break; } old.el.src = 'about:blank'; old.el.remove(); }
      });
      s.appendChild(b);
    });
    return s;
  }
  function row(box, label, ctl) { var r = document.createElement('div'); r.className = 'set-row'; var s = document.createElement('span'); s.textContent = label; r.appendChild(s); r.appendChild(ctl); box.appendChild(r); }
  var WALLS = [['auto', 'Auto'], ['none', 'None'], ['#0f172a', ''], ['#1e3a8a', ''], ['#14532d', ''], ['#7c2d12', ''], ['#e5e7eb', '']];
  function openSettings() {
    openSheet(function (box) {
      var h = document.createElement('div'); h.className = 'sh-head'; h.innerHTML = '<div><b>Phone settings</b><small>Release ' + RELEASE + '</small></div>'; box.appendChild(h);
      row(box, 'Theme', seg('theme', ['system', 'light', 'dark'], ['Hub', 'Light', 'Dark']));
      row(box, 'Clock', seg('clock24', [true, false], ['24 h', '12 h']));
      row(box, 'Apps kept open', seg('keepAlive', [1, 2], ['1', '2']));
      var w = document.createElement('div'); w.className = 'sw-c';
      WALLS.forEach(function (x) {
        var b = document.createElement('button'); b.type = 'button'; b.dataset.wall = x[0]; b.title = x[1] || x[0];
        b.setAttribute('aria-label', 'Test wallpaper ' + (x[1] || x[0]));
        b.style.background = x[0] === 'auto' ? 'linear-gradient(160deg,#1e3a5f,#3b1f4f)' : x[0] === 'none' ? 'repeating-conic-gradient(#999 0 25%,#fff 0 50%) 0 0/10px 10px' : x[0];
        b.classList.toggle('on', d.settings.wall === x[0]);
        b.addEventListener('click', function () { d.settings.wall = x[0]; persist(); applyWall(); w.querySelectorAll('button').forEach(function (y) { y.classList.toggle('on', y === b); }); });
        w.appendChild(b);
      });
      row(box, 'Test wallpaper', w);
      var rs = document.createElement('button'); rs.type = 'button'; rs.className = 'mini'; rs.textContent = 'Reset';
      rs.addEventListener('click', function () {
        ask('Reset the home pages, dock and settings to the defaults?', [{ label: 'Cancel' }, { label: 'Reset', cls: 'danger' }]).then(function (i) {
          if (i !== 1) return;
          d = S.reset(); clean(); persist(); page = 0; applyTheme(); applyWall(); renderHome(); back(); toast('Home reset');
        });
      });
      row(box, 'Home layout', rs);
      var ab = document.createElement('div'); ab.className = 'about'; ab.id = 'about';
      ab.innerHTML = '<b>About · Phone ' + RELEASE + '</b><br>A phone-style home screen for the Hub, made to run as the Android home screen in a WebView. ' +
        'Swipe left / right for pages, up for all apps, down for the quick panel. Long-press an app to pin it, dock it or see its info. ' +
        'In an app, swipe from the left edge or press Back to come home. The background is see-through, so the phone wallpaper shows; ' +
        '“Test wallpaper” (or <code>?bg=</code>) is only for trying it in a browser. ' + A.count() + ' apps from the Hub catalog. Saved on this device only.';
      box.appendChild(ab);
    });
  }

  /* ---------- gestures ---------- */
  var H = function () { return innerHeight; }, W = function () { return innerWidth; };
  // HOME: x = pages, up = drawer, down = quick panel, tap = open, long = menu
  var homeMode = '';
  G.attach($('home'), {
    start: function () { if (stack.length) return false; homeMode = ''; },
    move: function (dx, dy, axis) {
      if (axis === 'x') {
        var n = d.pages.length, edge = (page === 0 && dx > 0) || (page === n - 1 && dx < 0);
        var pg = $('pages'); pg.classList.add('drag');
        pg.style.transform = 'translateX(calc(' + (-page * 100) + '% + ' + (edge ? dx / 3 : dx) + 'px))';
        homeMode = 'pages';
      } else if (dy < 0 || homeMode === 'drawer') {
        if (homeMode !== 'drawer') { if (!drawerBuilt) { renderTabs(); renderList(); drawerBuilt = true; } homeMode = 'drawer'; }
        var dr = $('drawer'); dr.classList.add('peek');
        dr.style.transform = 'translateY(' + Math.max(0, H() + Math.min(0, dy)) + 'px)';
      } else {
        if (homeMode !== 'panel') { renderPanel(); homeMode = 'panel'; }
        $('panel').classList.add('peek'); var b = $('panel-box'); b.classList.add('drag');
        b.style.transform = 'translateY(calc(-100% + ' + Math.max(0, dy) + 'px))';
      }
    },
    end: function (dx, dy, axis, vx, vy) {
      if (homeMode === 'pages') {
        var pg = $('pages'); pg.classList.remove('drag');
        if (G.passed(dx, vx, -1)) showPage(page + 1); else if (G.passed(dx, vx, 1)) showPage(page - 1); else showPage(page);
      } else if (homeMode === 'drawer') {
        var dr = $('drawer');
        if (G.passed(dy, vy, -1)) { dr.classList.remove('peek'); dr.style.transform = ''; openDrawer(); }
        else { dr.style.transform = ''; requestAnimationFrame(function () { dr.classList.remove('peek'); }); }
      } else if (homeMode === 'panel') {
        if (G.passed(dy, vy, 1)) openPanel(); else closePanelUI();
      }
      homeMode = '';
    },
    cancel: function () { $('pages').classList.remove('drag'); showPage(page); closePanelUI(); var dr = $('drawer'); dr.style.transform = ''; dr.classList.remove('peek'); homeMode = ''; },
    tap: function (e) {
      var ic = e.target.closest('.ic'); if (ic) { press(ic); openApp(ic.dataset.app); return; }
      var dot = e.target.closest('.dot'); if (dot) showPage(+dot.dataset.page);
    },
    long: function (e) { var ic = e.target.closest('.ic'); if (ic) { vibrate(); menu(ic.dataset.app); } }
  });
  function press(el) { el.classList.add('press'); setTimeout(function () { el.classList.remove('press'); }, 140); }
  function vibrate() { try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) { /* */ } }

  // DRAWER: header/top-of-list pull down = close, list = own scrolling with a fling, x = categories
  var dm = '', st0 = 0, fling = 0;
  function stopFling() { cancelAnimationFrame(fling); fling = 0; }
  G.attach($('drawer'), {
    start: function (e) {
      if (top() !== 'drawer') return false;
      stopFling();   // any touch stops a fling (like a real list)
      dm = ''; st0 = $('list').scrollTop;
    },
    move: function (dx, dy, axis, e) {
      var list = $('list');
      if (axis === 'y') {
        if (!dm) dm = (dy > 0 && (st0 <= 0 || !list.contains(e.target) && $('drawer-head').contains(e.target))) ? 'close' : 'scroll';
        if (dm === 'close') { var dr = $('drawer'); dr.classList.add('drag'); dr.style.transform = 'translateY(' + Math.max(0, dy) + 'px)'; }
        else list.scrollTop = st0 - dy;
      } else { dm = 'cat'; list.style.transform = 'translateX(' + dx * 0.25 + 'px)'; }
    },
    end: function (dx, dy, axis, vx, vy) {
      var list = $('list'), dr = $('drawer');
      if (dm === 'close') {
        dr.classList.remove('drag');
        if (G.passed(dy, vy, 1)) back(); else dr.style.transform = '';
      } else if (dm === 'scroll') {
        var v = -vy * 16;
        var step = function () { if (Math.abs(v) < 0.5) { fling = 0; return; } list.scrollTop += v; v *= 0.95; fling = requestAnimationFrame(step); };
        if (Math.abs(v) > 2) fling = requestAnimationFrame(step);
      } else if (dm === 'cat') {
        list.style.transform = '';
        var i = cats.indexOf($('search').value ? 'All' : cat);
        if (G.passed(dx, vx, -1) && i < cats.length - 1) setCat(cats[i + 1]);
        else if (G.passed(dx, vx, 1) && i > 0) setCat(cats[i - 1]);
      }
      dm = '';
    },
    cancel: function () { $('list').style.transform = ''; var dr = $('drawer'); dr.classList.remove('drag'); dr.style.transform = ''; dm = ''; },
    tap: function (e) {
      // Chrome drops the native click on a tap that stops our fling, so the search box is focused here too
      if (e.target === $('search')) { $('search').focus(); return; }
      var tab = e.target.closest('.tab'); if (tab) { setCat(tab.dataset.cat); return; }
      var ic = e.target.closest('.ic'); if (ic) { press(ic); openApp(ic.dataset.app); }
      if (document.activeElement === $('search') && !e.target.closest('#search')) $('search').blur();
    },
    long: function (e) { var ic = e.target.closest('.ic'); if (ic) { vibrate(); menu(ic.dataset.app); } }
  });

  // QUICK PANEL: swipe up = close, tap outside = close
  G.attach($('panel'), {
    start: function () { if (top() !== 'panel') return false; },
    move: function (dx, dy, axis) { if (axis !== 'y') return; var b = $('panel-box'); b.classList.add('drag'); b.style.transform = 'translateY(' + Math.min(0, dy) + 'px)'; },
    end: function (dx, dy, axis, vx, vy) { var b = $('panel-box'); b.classList.remove('drag'); if (axis === 'y' && G.passed(dy, vy, -1)) back(); else b.style.transform = ''; },
    cancel: function () { var b = $('panel-box'); b.classList.remove('drag'); b.style.transform = ''; },
    tap: function (e) {
      var t = e.target.closest('.tile'); if (t) { tileAction(t.dataset.tile); return; }
      if (e.target === $('panel-shade')) back();
    }
  });

  // APP: left-edge swipe right = Back
  G.attach($('edge'), {
    captureOnDown: true,
    start: function () { if (top() !== 'app') return false; },
    move: function (dx, dy, axis) {
      if (axis !== 'x') return;
      var x = Math.max(0, dx), ap = $('apps'); ap.classList.add('drag');
      ap.style.transform = 'translateX(' + x * 0.35 + 'px)';
      var ar = $('edge-arrow'); ar.style.opacity = Math.min(1, x / 75); ar.style.transform = 'translateX(' + (Math.min(x, 90) * 0.6 - 50) + 'px)';
    },
    end: function (dx, dy, axis, vx) {
      var ap = $('apps'); ap.classList.remove('drag'); $('edge-arrow').style.cssText = '';
      if (axis === 'x' && G.passed(dx, vx, 1)) back(); else ap.style.transform = '';
    },
    cancel: function () { var ap = $('apps'); ap.classList.remove('drag'); ap.style.transform = ''; $('edge-arrow').style.cssText = ''; }
  });

  // SHEET: tap the shade = close; drag down on the sheet = close
  G.attach($('sheet-shade'), { tap: function () { back(); } });

  // keyboard + mouse wheel (desktop testing)
  addEventListener('keydown', function (e) {
    if (!$('dialog').hidden) { if (e.key === 'Escape' && dlgDone) dlgDone(-1); return; }
    if (e.key === 'Escape' || (e.key === 'Backspace' && e.altKey)) { if (stack.length) { e.preventDefault(); back(); } return; }
    if (stack.length) return;
    if (e.key === 'ArrowRight') showPage(page + 1);
    else if (e.key === 'ArrowLeft') showPage(page - 1);
    else if (e.key === 'ArrowUp' || e.key === '/') { e.preventDefault(); openDrawer(); if (e.key === '/') $('search').focus(); }
    else if (e.key === 'ArrowDown') openPanel();
  });
  var wheelT = 0;
  $('home').addEventListener('wheel', function (e) {
    if (stack.length || Date.now() - wheelT < 450) return;
    var ax = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    var v = ax ? e.deltaX : e.deltaY;
    if (Math.abs(v) < 25) return;
    wheelT = Date.now();
    if (ax) showPage(page + (v > 0 ? 1 : -1));
    else if (v > 0) openDrawer(); else openPanel();
  }, { passive: true });

  /* ---------- start ---------- */
  applyTheme(); applyWall(); renderHome();
  document.title = 'Phone ' + RELEASE;
  addEventListener('resize', function () { showPage(page, true); });
  window.PhoneLauncher = {
    RELEASE: RELEASE, state: function () { return JSON.parse(JSON.stringify(d)); }, stack: function () { return stack.slice(); },
    page: function () { return page; }, cat: function () { return cat; }, frames: function () { return frames.map(function (f) { return f.id; }); },
    open: openApp, back: back
  };
})();
