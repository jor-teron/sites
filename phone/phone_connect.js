/*
 * Phone launcher PH14 — Connect on the phone (phone/phone_connect.js). Loaded after phone_app.js; needs the Hub core
 * (hub/core/hub_core.js, H127: SharedLink, SharedLinkDevices, SharedLinkUI, HubMesh, HubMeshLink) and PhoneLauncher.
 *
 * What it adds
 *   - #net-dot (phone.html, top right of the home screen): grey = offline / not linked, blue = public 00000 mesh,
 *     green = private (a Connect Code link is up, joined or hosting), with the number of OTHER devices. Tap = sheet.
 *   - Quick panel tile 🔗 Connect (phone_app.js tiles(), on = private) and the Connect sheet (bottom sheet, drag the
 *     grab bar down or tap the shade / Back to close): this phone's 5-digit number (big), the device name, a join box
 *     (5 digits + Join), 📷 Scan QR (shared/link/link_scan.js + the phone's own copy phone/vendor/jsQR.js, both loaded on
 *     first use; jsQR only when BarcodeDetector is missing),
 *     Host private (QR + Share / Copy of the Connect link), the connected devices list and a red Disconnect behind
 *     the launcher's in-app confirm dialog. No browser dialogs.
 *
 * Desktop-shell files are NOT loaded (desktop/desktop.html, hub/controller/*, hub_remote.js, hub_panels.js, Game Bar: they move to
 *   desktop/ later). Only hub/core/hub_core.js + shared/ scripts; the desktop host / join rules are re-implemented here.
 * Same keys and protocol as the desktop Hub (hub_role.js / hub_remote.js / hub-controller.js; none of them edited):
 *   - Join = SharedLink.join({ prefix:'jtsites-', code, meta:{ pad:1 } }) exactly like hub_remote.js; link_core saves
 *     the code in 'shared-link-join-code', so a reload rejoins. hub_role.js (in the core) also reads ?join=CODE
 *     (Connect QR / mesh invites) and a saved code on a touch device; here a saved code is used on any pointer
 *     (phone.html is always the phone shell) and window.__hubRemote = { code } is set like hub_role.js, so app frames
 *     borrow this page's link (link_core.js "borrowed link") instead of making their own peer. ?join=00000 = public.
 *   - Host private = SharedLink.host({ prefix:'jtsites-', code: SharedLinkDevices.code() }), the H92 rule (the link
 *     code IS the device's 5-digit number). No Gamepad pad alias (the phone is not a Gamepad host). Connect link =
 *     desktop/desktop.html?join=CODE (hub-controller.js connectUrl; hub.html?join= before H129a/H129d). Hosting survives a reload through the phone-only key
 *     'sites-phone.host' = '1' (the desktop always hosts, so it has no such key). 'jtsites-hub-ctrl-code' is NOT
 *     written (H92: it only seeds the desktop's Gamepad pad code).
 *   - Disconnect: joined → SharedLink.stop() (bye + forget 'shared-link-join-code', as hub_remote.js); hosting →
 *     SharedLink.stop(true) + drop 'sites-phone.host'. HubMeshLink then moves this phone back to the public 00000.
 *   - Reconnect on wake (visibilitychange → visible, online): a dropped join rejoins with a fresh backoff; a host
 *     whose peer died registers again. Like hub_remote.js H25, retries stop after 5 minutes without the Hub
 *     (SharedLink.pause(), code kept) and the next wake / Join / tap on the dot starts again. pagehide = quiet pause.
 * API window.PhoneConnect = { VERSION, open(), state() → 'off' | 'public' | 'private', count(), mode() → '' | 'join' | 'host',
 *   join(code) → Promise<bool>, host() → Promise<bool>, disconnect(confirm?) → Promise<bool> }
 */
(function () {
  'use strict';
  // var VERSION = 'PH14';   (PH14)
  // var VERSION = 'PH15';   (PH15)
  var VERSION = 'PH16';
  var L0 = window.PhoneLauncher;
  if (!L0) return;
  var $ = function (id) { return document.getElementById(id); };
  var PREFIX = 'jtsites-', JOIN_KEY = 'shared-link-join-code', HOST_KEY = 'sites-phone.host', PUB = '00000';
  var RE = /^\d{5}$/;
  var GIVE_UP_MS = +window.PHONE_CONNECT_GIVEUP_MS || 5 * 60 * 1000;   // hub_remote.js H25
  var get = function (k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } };
  var put = function (k, v) { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch (_) { /* blocked */ } };
  var L = function () { return window.SharedLink || null; };
  var M = function () { return window.HubMesh || null; };
  var ML = function () { return window.HubMeshLink || null; };
  var myNum = function () { var D = window.SharedLinkDevices; try { var n = D && D.code ? String(D.code()) : ''; return RE.test(n) && n !== PUB ? n : ''; } catch (_) { return ''; } };
  var toast = function (m) { if (L0.toast) L0.toast(m); else if (window.phoneToast) window.phoneToast(m, 2200); };
  var ask = function (m, b) { return L0.ask ? L0.ask(m, b) : Promise.resolve(-1); };

  /* ---------- state ---------- */
  function mode() { var S = L(); if (!S) return ''; if (S.role === 'join' && S.code) return 'join'; if (S.role === 'host' && get(HOST_KEY) === '1') return 'host'; return ''; }   // link_core stop() keeps role 'host': the phone key decides
  function isPrivate() { var H = ML(); return !!(H && H.isPrivate && H.isPrivate()); }
  function meshUp() { var H = M(); try { return !!(H && H.linked && H.linked()); } catch (_) { return false; } }
  function state() { if (isPrivate()) return 'private'; if (meshUp() && navigator.onLine !== false) return 'public'; return 'off'; }
  function others() {   // [{name, online}] of the devices this phone can see right now (not itself)
    var S = L(), H = M(), out = [], seen = {};
    if (isPrivate() && S) {
      S.devices.forEach(function (d) { if (d.id === 'host' && S.role === 'host') return; if (!d.online) return; var n = String(d.name || 'Device').slice(0, 40); out.push({ name: d.id === 'host' ? n + ' (Hub)' : n }); });
      if (S.role === 'join' && S.connected && !S.devices.some(function (d) { return d.id === 'host'; })) out.unshift({ name: 'Hub ' + S.code });
      // the joined list from the host includes this phone itself: drop one entry with this phone's name
      var me = window.SharedLinkDevices ? SharedLinkDevices.name() : '';
      for (var i = 0; i < out.length; i++) if (out[i].name === me) { out.splice(i, 1); break; }
      return out;
    }
    if (H && meshUp()) {
      var mine = H.me() || {};
      (H.peers ? H.peers() : []).forEach(function (r) { if (r.deviceId === mine.deviceId || seen[r.deviceId]) return; seen[r.deviceId] = 1; out.push({ name: String(r.name || 'Device').slice(0, 40) + (r.num ? ' · ' + r.num : '') }); });
    }
    return out;
  }
  function count() { return others().length; }

  /* ---------- join / host / disconnect ---------- */
  var downSince = 0, gaveUp = false;
  function markRemote(code) {   // like hub_role.js: app frames borrow this page's link (link_core.js)
    if (code) { window.__hubRemote = { code: code }; document.documentElement.classList.add('hub-remote'); }
    else { try { delete window.__hubRemote; } catch (_) { window.__hubRemote = undefined; } document.documentElement.classList.remove('hub-remote'); }
  }
  function join(code) {
    var S = L(); code = String(code || '').trim();
    if (!S) { toast('Connect is not loaded'); return Promise.resolve(false); }
    if (code === PUB) {   // 00000 = the public network (hub_role.js H55 rule)
      if (mode()) S.stop(); put(JOIN_KEY, ''); put(HOST_KEY, ''); markRemote(''); recheck(); paint();
      toast('On the public network 00000'); return Promise.resolve(true);
    }
    if (!RE.test(code)) { toast('Enter the 5-digit code'); return Promise.resolve(false); }
    if (code === myNum()) { toast('That is this phone\u2019s own number'); return Promise.resolve(false); }
    if (mode() === 'join' && S.code === code) { rejoin(true); return Promise.resolve(true); }
    if (mode()) S.stop(mode() === 'host');   // leave the old link first (host: keep nothing; join: forget the old code)
    put(HOST_KEY, '');
    gaveUp = false; downSince = Date.now();
    markRemote(code);
    put(JOIN_KEY, code);   // link_core.js saves it too; written first so a reload rejoins even if PeerJS is slow
    return S.join({ prefix: PREFIX, code: code, meta: { pad: 1 } }).then(function () { paint(); return true; }, function () { toast('PeerJS could not load (offline?)'); paint(); return false; });
  }
  function host() {
    var S = L(), n = myNum();
    if (!S) { toast('Connect is not loaded'); return Promise.resolve(false); }
    if (!n) { toast('This phone has no number yet'); return Promise.resolve(false); }
    if (mode() === 'host' && S.live) { paint(); return Promise.resolve(true); }
    if (mode() === 'join') S.stop();   // a joined phone leaves that Hub first (forgets its code)
    put(JOIN_KEY, ''); markRemote('');
    put(HOST_KEY, '1');
    gaveUp = false; downSince = Date.now();
    return S.host({ prefix: PREFIX, code: n }).then(function () { paint(); return true; }, function () { toast('PeerJS could not load (offline?)'); paint(); return false; });
  }
  function stopLink() {
    var S = L(), m = mode();
    if (S && m === 'join') S.stop();
    else if (S && m === 'host') S.stop(true);
    put(HOST_KEY, ''); put(JOIN_KEY, ''); markRemote('');
    gaveUp = false; downSince = 0;
    recheck(); paint();
  }
  function disconnect(confirmFirst) {
    var m = mode();
    if (!m) return Promise.resolve(false);
    if (confirmFirst === false) { stopLink(); return Promise.resolve(true); }
    var msg = m === 'join' ? 'Disconnect from Hub ' + (L().code || '') + '? This phone goes back to the public network 00000 and forgets the code.'
      : 'Stop hosting the private code ' + (L().code || '') + '? Connected devices are dropped and this phone goes back to the public network 00000.';
    return ask(msg, [{ label: 'Cancel' }, { label: 'Disconnect', cls: 'danger' }]).then(function (i) {
      if (i !== 1) return false;
      stopLink(); toast('Disconnected'); return true;
    });
  }
  function recheck() { if (typeof window.__hubMeshCheck === 'function') setTimeout(window.__hubMeshCheck, 0); }
  /** wake / online / manual: bring a dropped link back (fresh backoff) */
  function rejoin(force) {
    var S = L(), m = mode();
    if (!S || !m) return;
    if (m === 'join') {
      if (S.connected && !force) return;
      gaveUp = false; downSince = Date.now();
      if (!S.connected) S.join({ prefix: PREFIX, code: S.code, meta: { pad: 1 } });
    } else if (m === 'host') {
      if (S.live && !force) return;
      gaveUp = false; downSince = Date.now();
      if (!S.live) S.host({ prefix: PREFIX, code: S.code || myNum() }).catch(function () { /* offline */ });
    }
    paint();
  }
  function giveUpCheck() {   // hub_remote.js H25: stop retrying a joined Hub after 5 minutes away
    var S = L();
    if (!S || mode() !== 'join') { downSince = 0; return; }
    if (S.connected) { downSince = 0; gaveUp = false; return; }
    if (!downSince) downSince = Date.now();
    if (!gaveUp && Date.now() - downSince >= GIVE_UP_MS) { gaveUp = true; S.pause(); paint(); }
  }

  /* ---------- status dot (top right of home) ---------- */
  var dot = $('net-dot');
  var LABEL = { off: 'Offline', public: 'Public network 00000', private: 'Private' };
  function statusText() {
    var st = state(), n = count(), S = L(), m = mode();
    if (st === 'private') return (m === 'host' ? 'Private · hosting ' : 'Private · Hub ') + (S.code || '') + ' · ' + n + ' device' + (n === 1 ? '' : 's');
    if (m === 'join') return gaveUp ? 'Not connected to Hub ' + S.code + ' (tap Reconnect)' : 'Connecting to Hub ' + S.code + '…';
    if (m === 'host') return 'Hosting ' + (S.code || '') + ' · waiting for a device' + (st === 'public' ? ' · also on 00000' : '');
    if (st === 'public') return 'Public network 00000 · ' + n + ' device' + (n === 1 ? '' : 's');
    return navigator.onLine === false ? 'Offline' : 'Not connected (joining 00000…)';
  }
  function paintDot() {
    if (!dot) return;
    var st = state(), n = count();
    dot.dataset.st = st;
    dot.querySelector('.nd-n').textContent = st === 'off' ? '' : String(n);
    var t = 'Connect · ' + LABEL[st] + (st === 'off' ? '' : ' · ' + n + ' device' + (n === 1 ? '' : 's'));
    dot.title = t; dot.setAttribute('aria-label', t);
  }
  if (dot) dot.addEventListener('click', function () { if (mode() === 'join' && !L().connected) rejoin(); open(); });

  /* ---------- the sheet ---------- */
  var ui = null;   // elements of the open sheet
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(label, cls, fn) { var b = el('button', 'mini' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; }
  // The Connect link opens the desktop Hub page, like hub-controller.js connectUrl. When the desktop shell moves to
  // desktop/, only JOIN_PAGE changes (hub_role.js reads ?join=CODE on any shell page that loads the core).
  var JOIN_PAGE = window.PHONE_CONNECT_JOIN_PAGE || 'desktop/desktop.html';   // was 'hub.html' (redirects since H129a)
  function connectUrl(c) { try { var u = new URL(JOIN_PAGE, location.href); u.search = '?join=' + c; u.hash = ''; return u.href; } catch (_) { return JOIN_PAGE + '?join=' + c; } }
  var libs = {};
  function lib(src, ok) {   // one lazy <script> per file (QR libraries load only when used)
    if (ok()) return Promise.resolve(true);
    if (libs[src]) return libs[src];
    var base = (window.HubCore && HubCore.base) || '';
    return (libs[src] = new Promise(function (res) {
      var s = document.createElement('script'); s.src = base + src; s.async = true;
      s.onload = function () { res(ok()); }; s.onerror = function () { libs[src] = null; res(false); };
      document.head.appendChild(s);
    }));
  }
  function share(code) {
    var url = connectUrl(code);
    if (navigator.share) { navigator.share({ title: 'Join my Hub', text: 'Join my Hub with code ' + code, url: url }).catch(function () { /* cancelled */ }); return; }
    copy(url, 'Link copied');
  }
  function copy(text, done) {
    var ok = function () { toast(done || 'Copied'); };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(ok, function () { toast(text); }); return; } } catch (_) { /* old */ }
    toast(text);
  }
  function scan() {
    lib('shared/link/link_scan.js', function () { return !!window.SharedLinkScan; }).then(function (have) {
      if (!have) { toast('QR reader could not load (offline?)'); return null; }
      var qr = 'BarcodeDetector' in window ? Promise.resolve(true) : lib('phone/vendor/jsQR.js', function () { return !!window.jsQR; });
      return qr.then(function () { return window.SharedLinkScan.ask({ title: 'Join a Hub' }); });
    }).then(function (code) { if (code) join(code).then(function (ok) { if (ok) toast('Joining ' + code + '…'); }); });
  }
  var canScan = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  function drawQr(box, code) {
    box.textContent = '';
    lib('shared/vendor/qrcode.js', function () { return typeof window.qrcode === 'function'; }).then(function (have) {
      if (!have || !ui || ui.qr !== box) return;
      try {
        var q = window.qrcode(0, 'M'); q.addData(connectUrl(code)); q.make();
        box.innerHTML = q.createSvgTag(4, 16);
        var svg = box.querySelector('svg'); if (svg) { svg.setAttribute('width', '168'); svg.setAttribute('height', '168'); svg.style.background = '#fff'; svg.style.borderRadius = '10px'; }
      } catch (_) { box.textContent = ''; }
    });
  }
  function build(box) {
    box.classList.add('pc-sheet');
    var grab = el('div', 'grab pc-grab'); grab.setAttribute('aria-hidden', 'true'); box.appendChild(grab);
    var head = el('div', 'pc-head');
    var hd = el('span', 'pc-dot'); var ht = el('div', 'pc-ht'); ht.appendChild(el('b', '', 'Connect'));
    var stl = el('small', 'pc-st'); ht.appendChild(stl); head.append(hd, ht); box.appendChild(head);
    // this phone's number (big)
    var me = el('div', 'pc-me');
    me.appendChild(el('small', '', 'This phone\u2019s number'));
    var num = el('div', 'pc-num'); num.id = 'pc-num'; me.appendChild(num);
    var meRow = el('div', 'pc-row');
    meRow.appendChild(btn('Copy', '', function () { copy(myNum(), 'Number copied'); }));
    me.appendChild(meRow);
    box.appendChild(me);
    var nm = el('div', 'pc-name'); if (window.SharedLinkUI) SharedLinkUI.mountName(nm); box.appendChild(nm);
    // join
    var jw = el('div', 'pc-join');
    jw.appendChild(el('small', '', 'Join a Hub or another phone'));
    var jr = el('div', 'pc-row');
    var inp = el('input', 'pc-code'); inp.id = 'pc-code'; inp.type = 'text'; inp.inputMode = 'numeric'; inp.maxLength = 5; inp.placeholder = '5-digit code'; inp.autocomplete = 'off'; inp.setAttribute('aria-label', '5-digit code'); inp.pattern = '[0-9]*';
    inp.addEventListener('input', function () { var v = inp.value.replace(/\D/g, '').slice(0, 5); if (v !== inp.value) inp.value = v; });
    var doJoin = function () { var c = inp.value.trim(); join(c).then(function (ok) { if (ok && c !== PUB) toast('Joining ' + c + '…'); }); };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doJoin(); } });
    var jb = btn('Join', 'pc-go', doJoin); jb.id = 'pc-join';
    jr.append(inp, jb);
    var sb = null;
    if (canScan) { sb = btn('\uD83D\uDCF7 Scan QR', '', scan); sb.id = 'pc-scan'; jr.appendChild(sb); }
    jw.appendChild(jr); box.appendChild(jw);
    // host
    var hw = el('div', 'pc-host');
    var hb = btn('\uD83D\uDD12 Host private', '', function () { host().then(function (ok) { if (ok) toast('Hosting ' + myNum() + ' · share the code'); }); }); hb.id = 'pc-hostbtn';
    var hinfo = el('div', 'pc-hinfo');
    var qr = el('div', 'pc-qr');
    var hrow = el('div', 'pc-row');
    var shb = btn('Share link', '', function () { share(L().code || myNum()); }); shb.id = 'pc-share';
    var cpb = btn('Copy link', '', function () { copy(connectUrl(L().code || myNum()), 'Link copied'); });
    hrow.append(shb, cpb);
    hinfo.append(el('small', '', 'Others join with this code (Connect › Join, or scan):'), qr, hrow);
    hw.append(hb, hinfo); box.appendChild(hw);
    // reconnect (a joined phone that gave up)
    var rc = btn('\u21BB Reconnect', '', function () { rejoin(true); }); rc.id = 'pc-reconnect'; box.appendChild(rc);
    // devices
    box.appendChild(el('h4', 'pc-h', 'Devices'));
    var dl = el('ul', 'pc-devs'); dl.id = 'pc-devs'; box.appendChild(dl);
    // disconnect
    var db = el('button', 'sh-btn danger pc-disc'); db.type = 'button'; db.id = 'pc-disc';
    db.innerHTML = '<span class="e">\u23CF</span><span>Disconnect</span>';
    db.addEventListener('click', function () { disconnect(); });
    box.appendChild(db);
    ui = { box: box, dot: hd, st: stl, num: num, inp: inp, hb: hb, hinfo: hinfo, qr: qr, qrCode: '', rc: rc, dl: dl, db: db, jw: jw };
    // drag the grab bar / head down to close (gesture-friendly; the rest of the sheet scrolls)
    if (window.PhoneGesture) {
      [grab, head].forEach(function (g) {
        window.PhoneGesture.attach(g, {
          move: function (dx, dy, axis) { if (axis !== 'y') return; box.style.transition = 'none'; box.style.transform = 'translateY(' + Math.max(0, dy) + 'px)'; },
          end: function (dx, dy, axis, vx, vy) { box.style.transition = ''; box.style.transform = ''; if (axis === 'y' && window.PhoneGesture.passed(dy, vy, 1)) L0.back(); },
          cancel: function () { box.style.transition = ''; box.style.transform = ''; }
        });
      });
    }
    paint();
  }
  function open() {
    if (!L0.openSheet) return;
    L0.openSheet(build);
  }
  function sheetOpen() { var s = $('sheet'); return !!(ui && s && s.classList.contains('open') && ui.box.parentNode && ui.box.classList.contains('pc-sheet')); }
  function paintSheet() {
    if (!sheetOpen()) return;
    var st = state(), m = mode(), S = L();
    ui.dot.dataset.st = st;
    ui.st.textContent = statusText();
    ui.num.textContent = myNum() || '—————';
    var hosting = m === 'host';
    ui.hb.hidden = hosting;
    ui.hinfo.hidden = !hosting;
    if (hosting && ui.qrCode !== S.code) { ui.qrCode = S.code; drawQr(ui.qr, S.code); }
    ui.rc.hidden = !(m === 'join' && !S.connected);
    ui.db.hidden = !m;
    var list = others(); ui.dl.textContent = '';
    if (!list.length) ui.dl.appendChild(el('li', 'none', st === 'off' ? 'Not connected' : 'No other devices yet'));
    list.slice(0, 30).forEach(function (d) { var li = el('li'); li.appendChild(el('span', 'pc-on')); li.appendChild(document.createTextNode(d.name)); ui.dl.appendChild(li); });
    if (list.length > 30) ui.dl.appendChild(el('li', 'none', '+' + (list.length - 30) + ' more'));
  }
  var paintQ = 0;
  function paint() { if (paintQ) return; paintQ = setTimeout(function () { paintQ = 0; paintDot(); paintSheet(); if (L0.panelOpen && L0.panelOpen() && L0.renderPanel) L0.renderPanel(); }, 30); }

  /* ---------- start ---------- */
  function boot() {
    var S = L();
    if (S) ['status', 'open', 'close', 'devices', 'taken', 'notfound'].forEach(function (ev) { S.on(ev, paint); });
    if (S) S.on('taken', function (c) { if (mode() === 'host') toast('Number ' + c + ' is in use (is the Hub open on this device?)'); });
    var H = M();
    if (H) ['status', 'roster', 'lobby', 'peers'].forEach(function (ev) { try { H.on(ev, paint); } catch (_) { /* older */ } });
    addEventListener('hub-mesh-invites', paint);
    setInterval(function () { giveUpCheck(); paint(); }, 3000);
    // wake: re-join a link that dropped (HubMesh / HubMeshLink retry the 00000 mesh themselves, H55b / H95)
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { rejoin(); paint(); } });
    addEventListener('online', function () { rejoin(); paint(); });
    addEventListener('offline', paint);
    addEventListener('pagehide', function () { if (L() && mode()) L().pause(); });   // quiet: the Hub keeps us (hub_remote.js)
    // saved state → link again (reload / ?join=CODE via hub_role.js)
    var R = window.__hubRemote, saved = get(JOIN_KEY);
    var code = (R && RE.test(R.code) && R.code) || (RE.test(saved) && saved !== PUB ? saved : '');
    if (S && code && code !== myNum()) { markRemote(code); downSince = Date.now(); S.join({ prefix: PREFIX, code: code, meta: { pad: 1 } }).catch(function () { /* offline */ }); }
    else if (S && get(HOST_KEY) === '1' && myNum()) { downSince = Date.now(); S.host({ prefix: PREFIX, code: myNum() }).catch(function () { /* offline */ }); }
    paint();
  }
  window.PhoneConnect = { VERSION: VERSION, open: open, state: state, count: count, mode: mode, join: join, host: host, disconnect: disconnect, rejoin: rejoin, statusText: statusText };
  if (window.HubCore && HubCore.ready) HubCore.ready.then(boot); else boot();
})();
