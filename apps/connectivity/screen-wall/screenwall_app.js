/* Multi-Screen Wall MW1 — UI and wall logic.
   Screens: Wall · Content · Settings (dots + 75 px wrap-around swipes; no swipes in full screen or on tiles).
   Roles: one Host (layout editor + content), every other device is a Display (shows only its slice).
   Host → displays (through the lobby relay):
     {k:'wall', host:{id, since}, W, H, rects:{<dev>:{x,y,w,h,r,c,n}}, content:{…, t0, twu}}   on every change / roster change
     {k:'img', id, i, n, d}   picture chunks (16 000 chars of a JPEG data URL each), to all or to one device
     {k:'ident', n, name}     flash a big number for 3 s
     {k:'pong', t0, th}       answer to a ping (host clock)
   Display → host: {k:'ping', t0} (5 quick, then every 10 s) · {k:'need', img} (missing picture).
   Clock offset = th − (t0 + t1) / 2 from the ping with the lowest round trip of the last 8.
   Hub code, in order: #code= / ?hub= (QR), the Hub's {sharedLink:'hello'} (inside the Hub, after we post
   {sharedLink:'ready', app:'screen-wall'}), parent.__hubRemote.code, 'jtsites-hub-ctrl-code', 'shared-link-join-code',
   our last code, else the code dialog. */
(function () {
  'use strict';
  // FC5: Hub codes are 5 digits (H83); public lobby is SharedLink.LOBBY, else '00000'. Saved 4-digit codes are ignored.
  var PUB = (function () { try { var S = window.SharedLink || (window.parent && window.parent.SharedLink) || (window.top && window.top.SharedLink); if (S && /^\d{5}$/.test(String(S.LOBBY || ''))) return String(S.LOBBY); } catch (_) {} return '00000'; })();
  function c5(c) { c = String(c || ''); return /^\d{5}$/.test(c) ? c : ''; }   // FC5: drops saved 4-digit codes
  var $ = function (id) { return document.getElementById(id); };
  var inHub = window.parent !== window, page = 0, PAGES = 3, SW = 75, started = false, code = '';
  var ME = SWSave.dev(), role = SWSave.get('role'), since = role === 'host' ? Date.now() : 0;
  var st = SWSave.state();            // host layout + content (host only; saved)
  var wall = null;                    // last wall message (display) or computed wall (host)
  var images = {}, buf = {};          // img id → HTMLImageElement / chunk buffers
  var hostImg = null;                 // host: {id, data}
  var off = 0, samples = [], hostPeer = '';

  /* ---------- dialogs / toast ---------- */
  function dialog(text, buttons, ask) {
    return new Promise(function (res) {
      $('d-text').textContent = text;
      var inp = $('d-input'); inp.hidden = !ask; inp.value = '';
      var row = $('d-row'); row.innerHTML = '';
      (buttons || ['OK']).forEach(function (b, i, a) {
        var el = document.createElement('button'); el.className = i === a.length - 1 ? 'btn' : 'mini'; el.textContent = b;
        el.onclick = function () {
          if (ask && i === a.length - 1) { var c = (inp.value.match(/\d{5}/) || [''])[0]; if (!c) { $('d-text').textContent = 'Enter the 5-digit code.'; return; } $('dialog').hidden = true; return res(c); }
          $('dialog').hidden = true; res(ask ? null : i);
        };
        row.appendChild(el);
      });
      $('dialog').hidden = false; if (ask) setTimeout(function () { inp.focus(); }, 50);
    });
  }
  var toastT = 0;
  function toast(t) { var e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('show'); }, 2600); }

  /* ---------- code ---------- */
  var ls = SWSave.ls;
  function urlCode() { var m = (location.hash + '&' + location.search).match(/(?:code|hub|join)=(\d{5})/); return m ? m[1] : ''; }
  function localCode() {
    try { if (window.parent.__hubRemote && window.parent.__hubRemote.code) { var r0 = c5(window.parent.__hubRemote.code); if (r0) return r0; } } catch (_) { /* */ }
    var c = ls('jtsites-hub-ctrl-code'); if (/^\d{5}$/.test(c) && inHub) return c;
    c = ls('shared-link-join-code'); if (/^\d{5}$/.test(c) && inHub) return c;
    return '';
  }
  function myInfo() {
    var w = Math.round(innerWidth), h = Math.round(innerHeight);
    return { name: SWSave.name(), dev: ME, role: role, since: since, w: w, h: h, dpr: Math.round((devicePixelRatio || 1) * 100) / 100 };
  }
  function go(c) {
    if (started) { if (c === code) return; SWPeer.stop(); }
    started = true; code = c; $('code-lbl').textContent = c;
    SWSave.setLastCode(c);
    SWPeer.start(c, myInfo()).catch(function () { setStatus('PeerJS could not load (offline?)'); });
  }
  function askCode() { dialog('Enter the 5-digit Hub Connect Code shown on the Hub.', ['Cancel', 'Join'], true).then(function (c) { if (c) go(c); }); }
  function boot() {
    var c = urlCode();
    if (c) return go(c);
    if (inHub) {
      var got = false;
      addEventListener('message', function (e) {
        var d = e.data; if (e.source !== window.parent || !d || d.sharedLink !== 'hello' || got) return;
        if (/^\d{5}$/.test(String(d.code || ''))) { got = true; go(String(d.code)); }
      });
      try { window.parent.postMessage({ sharedLink: 'ready', app: 'screen-wall', types: ['x-none/'] }, '*'); } catch (_) { /* */ }
      setTimeout(function () { if (!got && !started) { var l = localCode() || c5(SWSave.lastCode()); if (l) go(l); else { setStatus('Not connected'); askCode(); } } }, 800);
      return;
    }
    c = c5(SWSave.lastCode()) || c5(ls('shared-link-join-code'));
    if (/^\d{5}$/.test(c)) go(c); else { setStatus('Not connected'); askCode(); }
  }
  $('btn-code').onclick = askCode; $('btn-code2').onclick = askCode;
  function setStatus(t) { $('status').textContent = t; }

  /* ---------- roles ---------- */
  function displays() { return SWPeer.roster().filter(function (d) { return d.role !== 'host'; }); }
  function devMap() { var m = {}; displays().forEach(function (d) { m[d.dev] = d; }); return m; }
  function otherHost() {
    var h = SWPeer.roster().filter(function (d) { return d.role === 'host'; }).sort(function (a, b) { return b.since - a.since; });
    return h[0] || null;
  }
  function setRole(r, quiet) {
    if (r === role) return;
    role = r; since = r === 'host' ? Date.now() : 0; SWSave.set('role', r); wall = null;
    if (r === 'host') { st = SWSave.state(); hostImg = SWSave.image(); if (hostImg && hostImg.id) loadImg(hostImg.id, hostImg.data); exitFs(); }
    SWPeer.update(myInfo()); paintRole(); paintSeg();
    if (r === 'host') sendWall(); else { wall = null; samples = []; hostPeer = ''; findHost(); }
    if (!quiet) toast(r === 'host' ? 'This device is now the host' : 'This device is now a display');
  }
  function paintRole() {
    var h = role === 'host';
    $('host-view').hidden = !h; $('disp-view').hidden = h;
    $('c-host').hidden = !h; $('c-disp').hidden = h;
    $('role-badge').textContent = h ? 'Host' : 'Display'; $('role-badge').classList.toggle('host', h);
    if (h) { paintEditor(); paintContent(); } else paintDisplay();
    redraw();
  }

  /* ---------- HOST: layout ---------- */
  function cleanCells() {
    // drop placements outside the grid; keep placements of devices that are offline (they come back to their cell)
    Object.keys(st.cells).forEach(function (d) { var p = st.cells[d]; if (!p || p.r >= st.rows || p.c >= st.cols) delete st.cells[d]; });
  }
  function computeWall() {
    cleanCells();
    var L = SWWall.layout(st, devMap());
    return { k: 'wall', host: { id: SWPeer.myId(), since: since }, W: L.W, H: L.H, rects: L.rects, L: L, content: st.content };
  }
  var sendT = 0;
  function changed(now) {
    SWSave.saveState(st);
    wall = computeWall(); paintEditor(); redraw();
    clearTimeout(sendT); sendT = setTimeout(sendWall, now ? 0 : 80);
  }
  function sendWall() {
    if (role !== 'host') return;
    wall = computeWall();
    var m = { k: 'wall', host: wall.host, W: wall.W, H: wall.H, rects: wall.rects, content: wall.content };
    SWPeer.send(m);
  }
  function cellAt(r, c) { var f = null; Object.keys(st.cells).forEach(function (d) { var p = st.cells[d]; if (p.r === r && p.c === c && devMap()[d]) f = d; }); return f; }
  function place(dev, r, c) {
    var from = st.cells[dev], other = cellAt(r, c);
    if (other && other !== dev) { if (from) st.cells[other] = { r: from.r, c: from.c }; else delete st.cells[other]; }
    st.cells[dev] = { r: r, c: c };
    changed();
  }
  function unplace(dev) { delete st.cells[dev]; changed(); }
  function autoPlace() {
    var ds = displays(), free = [], r, c;
    for (r = 0; r < st.rows; r++) for (c = 0; c < st.cols; c++) if (!cellAt(r, c)) free.push({ r: r, c: c });
    ds.forEach(function (d) { if (!st.cells[d.dev] && free.length) st.cells[d.dev] = free.shift(); });
    if (ds.some(function (d) { return !st.cells[d.dev]; })) toast('Not enough cells: add a row or column');
    changed();
  }
  document.querySelectorAll('[data-step]').forEach(function (b) {
    b.onclick = function () {
      var k = b.dataset.step, v = st[k] + (+b.dataset.d), max = k === 'rows' ? 4 : 6;
      if (v < 1 || v > max) return;
      st[k] = v; changed();
    };
  });
  $('bezel').addEventListener('input', function () { st.bezel = +this.value; $('bezel-n').textContent = st.bezel; changed(); });
  $('b-auto').onclick = autoPlace;

  var picked = '';
  function tileEl(d, n) {
    var el = document.createElement('div'); el.className = 'tile' + (picked === d.dev ? ' sel' : ''); el.dataset.dev = d.dev;
    var nn = document.createElement('span'); nn.className = 'n'; nn.textContent = n || '?';
    var t = document.createElement('span'); t.className = 't';
    var b = document.createElement('b'); b.textContent = d.name || 'Device';
    var s = document.createElement('small'); s.textContent = d.w + '×' + d.h + ' @' + d.dpr + 'x';
    t.append(b, s);
    var id = document.createElement('button'); id.className = 'id'; id.textContent = 'Identify'; id.title = 'Flash a big number on this device';
    id.onclick = function (e) { e.stopPropagation(); identify(d); };
    el.append(nn, t, id);
    dragify(el, d.dev);
    return el;
  }
  function identify(d) {
    var r = wall && wall.rects[d.dev];
    SWPeer.sendTo(d.id, { k: 'ident', n: r ? r.n : '?', name: d.name });
    document.querySelectorAll('.tile[data-dev="' + d.dev + '"]').forEach(function (t) { t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); });
  }
  function paintEditor() {
    if (role !== 'host') return;
    if (!wall) wall = computeWall();
    $('rows-n').textContent = st.rows; $('cols-n').textContent = st.cols;
    $('bezel').value = st.bezel; $('bezel-n').textContent = st.bezel;
    var ds = displays(), map = devMap(), tray = $('tray'), cells = $('cells');
    $('dev-count').textContent = ds.length ? ds.length + ' online' : '';
    $('tray-empty').hidden = ds.length > 0;
    tray.innerHTML = '';
    ds.forEach(function (d) { if (!wall.rects[d.dev]) { var li = document.createElement('li'); li.appendChild(tileEl(d)); tray.appendChild(li); } });
    // cells, scaled to the editor box (same transform as the preview canvas)
    var box = $('editor'), bw = box.clientWidth, bh = box.clientHeight, L = wall.L;
    if (!bw || !bh) return;
    var k = Math.min((bw - 16) / L.W, (bh - 16) / L.H), ox = (bw - L.W * k) / 2, oy = (bh - L.H * k) / 2;
    box._k = { k: k, ox: ox, oy: oy };
    cells.innerHTML = '';
    for (var r = 0; r < st.rows; r++) for (var c = 0; c < st.cols; c++) {
      var ce = document.createElement('div'); ce.className = 'cell'; ce.dataset.r = r; ce.dataset.c = c;
      ce.style.left = (ox + L.colX[c] * k) + 'px'; ce.style.top = (oy + L.rowY[r] * k) + 'px';
      ce.style.width = (L.colW[c] * k) + 'px'; ce.style.height = (L.rowH[r] * k) + 'px';
      var dv = cellAt(r, c);
      if (dv) {
        var rc = wall.rects[dv];
        var g = document.createElement('div'); g.className = 'ghostdev';
        g.style.left = ((rc.x - L.colX[c]) * k - 2) + 'px'; g.style.top = ((rc.y - L.rowY[r]) * k - 2) + 'px';
        g.style.width = (rc.w * k) + 'px'; g.style.height = (rc.h * k) + 'px';
        ce.appendChild(g); ce.appendChild(tileEl(map[dv], rc.n));
      } else { var e = document.createElement('span'); e.className = 'empty'; e.textContent = (r * st.cols + c + 1) + ' · drop here'; ce.appendChild(e); }
      ce.onclick = cellClick;
      cells.appendChild(ce);
    }
  }
  function cellClick(e) {
    if (e.target.closest('.tile')) return;
    if (!picked) return;
    var ce = e.currentTarget, d = picked; picked = ''; place(d, +ce.dataset.r, +ce.dataset.c);
  }
  /* pointer drag (mouse + touch); a short tap selects the tile for tap-to-place */
  function dragify(el, dev) {
    el.addEventListener('pointerdown', function (e) {
      if (e.button > 0 || e.target.closest('button')) return;
      e.preventDefault();
      var x0 = e.clientX, y0 = e.clientY, ghost = null, over = null;
      function at(x, y) {
        var t = document.elementFromPoint(x, y); if (!t) return null;
        return t.closest('.cell') || t.closest('#tray, .side');
      }
      function mv(ev) {
        if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        if (!ghost) { ghost = el.cloneNode(true); ghost.id = 'drag-ghost'; ghost.style.width = el.offsetWidth + 'px'; document.body.appendChild(ghost); }
        ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
        var o = at(ev.clientX, ev.clientY);
        if (over !== o) { if (over) over.classList.remove('over'); over = o; if (o && (o.classList.contains('cell') || o.id === 'tray')) o.classList.add('over'); else if (o) $('tray').classList.add('over'); }
        if (!o) $('tray').classList.remove('over');
      }
      function up(ev) {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
        $('tray').classList.remove('over'); if (over) over.classList.remove('over');
        if (!ghost) { picked = picked === dev ? '' : dev; paintEditor(); if (picked) toast('Now tap a cell to place it'); return; }
        ghost.remove();
        var o = at(ev.clientX, ev.clientY);
        if (o && o.classList.contains('cell')) place(dev, +o.dataset.r, +o.dataset.c);
        else if (o) unplace(dev);
      }
      addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    });
  }

  /* ---------- HOST: content ---------- */
  function C() { return st.content; }
  function setC(k, v, restart) {
    C()[k] = v;
    if (restart || k === 'kind' || k === 'text' || k === 'size') C().t0 = Date.now();
    if (k === 'text' || !C().twu) C().twu = SWWall.textWidth(C().text, 100) / 100;   // text width per 1 px of font size
    paintContent(); changed();
  }
  function paintContent() {
    if (role !== 'host') return;
    var c = C();
    document.querySelectorAll('#c-host .opt').forEach(function (o) { o.hidden = o.dataset.for !== c.kind; });
    $('c-text').value = c.text || ''; $('c-speed').value = c.speed; $('speed-n').textContent = c.speed + ' px/s';
    $('c-size').value = c.size; $('size-n').textContent = c.size;
    $('c-fg').value = c.fg; $('c-bg').value = c.bg; $('c-bg2').value = c.bg2;
    document.querySelector('.colors .bg2').hidden = !(c.kind === 'pattern' && c.pattern === 'gradient');
    $('img-info').textContent = hostImg && hostImg.id ? 'Picture ready (' + Math.round(hostImg.data.length * 0.75 / 1024) + ' KB)' : 'No picture picked yet';
    $('c-tip').textContent = { pattern: 'Line up the grid across the frames, then set the bezel gap until lines run straight.', clock: 'A big clock across the whole wall, kept in step with the host’s time.', text: 'Text scrolls right to left across every screen.', image: 'The picture is sent once (compressed) and split across the screens.' }[c.kind] || '';
    paintSeg();
  }
  $('c-text').addEventListener('input', function () { setC('text', this.value.slice(0, 300)); });
  $('c-speed').addEventListener('input', function () {
    var c = C(), now = Date.now(), el = (now - (c.t0 || now)) / 1000, pos = el * c.speed;   // keep the text where it is
    c.speed = +this.value; c.t0 = now - pos / c.speed * 1000; setC('speed', c.speed);
  });
  $('c-size').addEventListener('input', function () { setC('size', +this.value); });
  ['fg', 'bg', 'bg2'].forEach(function (k) { $('c-' + k).addEventListener('input', function () { setC(k, this.value); }); });
  $('b-pick').onclick = function () { $('f-img').click(); };
  $('f-img').onchange = function () {
    var f = this.files && this.files[0]; this.value = ''; if (!f) return;
    $('img-info').textContent = 'Compressing…';
    SWWall.compress(f).then(function (data) {
      var id = 'i' + Date.now().toString(36);
      hostImg = { id: id, data: data };
      if (!SWSave.saveImage(hostImg)) toast('Picture too big to keep after a reload, but it is on the wall');
      loadImg(id, data);
      C().img = id; C().kind = 'image';
      sendImg(null); paintContent(); changed(true);
    }).catch(function (e) { dialog(e.message, ['OK']); paintContent(); });
  };
  function sendImg(to) {
    if (!hostImg || !hostImg.id) return;
    var parts = SWWall.chunks(hostImg.data), id = hostImg.id, i = 0;
    (function next() {
      if (!hostImg || hostImg.id !== id || i >= parts.length) return;
      var m = { k: 'img', id: id, i: i, n: parts.length, d: parts[i] };
      if (to) SWPeer.sendTo(to, m); else SWPeer.send(m);
      i++; setTimeout(next, 8);
    })();
  }
  function loadImg(id, data) {
    var im = new Image(); im.onload = function () { images = {}; images[id] = im; redraw(); }; im.src = data;
  }

  /* ---------- DISPLAY ---------- */
  function now() { return Date.now() + (role === 'host' ? 0 : off); }
  function findHost() {
    var h = otherHost(), id = h ? h.id : '';
    if (role === 'host') {
      if (h && h.since > since) { setRole('display', true); toast((h.name || 'Another device') + ' is the host now'); }
      return;
    }
    if (id !== hostPeer) { hostPeer = id; samples = []; off = 0; if (id) pingBurst(); else { wall = null; paintDisplay(); redraw(); } }
  }
  var pingT = 0;
  function pingBurst() { var n = 0; clearInterval(pingT); pingT = setInterval(function () { ping(); if (++n >= 5) { clearInterval(pingT); pingT = setInterval(ping, 10000); } }, 400); ping(); }
  function ping() { if (role === 'display' && hostPeer) SWPeer.sendTo(hostPeer, { k: 'ping', t0: Date.now() }); }
  function onPong(m) {
    var t1 = Date.now(), rtt = t1 - m.t0; if (rtt < 0 || rtt > 10000) return;
    samples.push({ rtt: rtt, off: m.th - (m.t0 + t1) / 2 }); if (samples.length > 8) samples.shift();
    var best = samples.reduce(function (a, b) { return b.rtt < a.rtt ? b : a; });
    off = best.off; paintSync(best.rtt);
  }
  function paintSync(rtt) { $('d-sync').textContent = hostPeer ? 'Clock synced with host · ±' + Math.max(1, Math.round(rtt / 2)) + ' ms' : ''; }
  function myRect() { return wall && wall.rects && wall.rects[ME]; }
  function paintDisplay() {
    if (role !== 'display') return;
    var r = myRect(), h = otherHost();
    $('d-num').textContent = r ? r.n : '?';
    $('d-info').textContent = !SWPeer.online() ? 'Not connected yet' : !h ? 'Waiting for a host… (make one device the host)' : !wall ? 'Waiting for ' + (h.name || 'the host') + '…' :
      r ? 'Screen ' + r.n + ' · row ' + (r.r + 1) + ', column ' + (r.c + 1) : 'Not placed yet: ' + (h.name || 'the host') + ' drags this device into the wall';
  }
  var needT = 0;
  function onWall(m, from) {
    if (role === 'host') { if (m.host && m.host.since > since) findHost(); return; }
    hostPeer = from; wall = m;
    var c = m.content || {};
    if (c.kind === 'image' && c.img && !images[c.img]) {
      clearTimeout(needT);
      needT = setTimeout(function () { if (!images[c.img] && !(buf[c.img] && buf[c.img].got)) SWPeer.sendTo(from, { k: 'need', img: c.img }); }, 1500);
    }
    paintDisplay(); redraw();
  }
  function onImg(m) {
    if (typeof m.d !== 'string' || !(m.n > 0) || m.n > 2000) return;
    var b = buf[m.id] = buf[m.id] || { parts: new Array(m.n), got: 0 };
    if (b.parts[m.i] === undefined) { b.parts[m.i] = m.d; b.got++; }
    if (b.got === m.n) {
      var data = b.parts.join(''); delete buf[m.id];
      if (!/^data:image\/(jpeg|png|webp);base64,/.test(data)) return;
      Object.keys(buf).forEach(function (k) { if (k !== m.id) delete buf[k]; });
      loadImg(m.id, data);
    }
  }
  var identT = 0;
  function showIdent(n, name) {
    $('ident-n').textContent = n; $('ident-name').textContent = name || SWSave.name(); $('ident').hidden = false;
    clearTimeout(identT); identT = setTimeout(function () { $('ident').hidden = true; }, 3000);
  }
  $('ident').onclick = function () { $('ident').hidden = true; };

  SWPeer.on('signal', function (m, from) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'wall') onWall(m, from);
    else if (m.k === 'img' && role === 'display') onImg(m);
    else if (m.k === 'ident') showIdent(m.n, SWSave.name());
    else if (m.k === 'pong') onPong(m);
    else if (m.k === 'ping' && role === 'host') SWPeer.sendTo(from, { k: 'pong', t0: m.t0, th: Date.now() });
    else if (m.k === 'need' && role === 'host' && hostImg && hostImg.id === m.img) sendImg(from);
  });
  var rosterT = 0;
  SWPeer.on('roster', function () {
    findHost();
    if (role === 'host') { wall = computeWall(); paintEditor(); redraw(); clearTimeout(rosterT); rosterT = setTimeout(sendWall, 150); }
    else paintDisplay();
  });
  SWPeer.on('status', setStatus);
  SWPeer.on('online', function () { paintDisplay(); });

  /* ---------- drawing ---------- */
  function fitCanvas(cv, w, h) {
    var d = devicePixelRatio || 1, W = Math.max(1, Math.round(w * d)), H = Math.max(1, Math.round(h * d));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  }
  function drawHost(cv, box) {
    if (!wall) wall = computeWall();
    var bw = box.clientWidth, bh = box.clientHeight; if (!bw || !bh) return;
    fitCanvas(cv, bw, bh); cv.style.width = bw + 'px'; cv.style.height = bh + 'px';
    var L = wall.L, k = Math.min((bw - 16) / L.W, (bh - 16) / L.H), ox = (bw - L.W * k) / 2, oy = (bh - L.H * k) / 2, ctx = cv.getContext('2d');
    var d = devicePixelRatio || 1;
    SWWall.draw(ctx, { wall: { W: L.W, H: L.H }, view: { x: -ox / k, y: -oy / k, w: bw / k, h: bh / k }, px: { w: bw * d, h: bh * d }, content: st.content, img: images[st.content.img], now: now() });
    // bezel gaps darkened (what the frames hide)
    ctx.setTransform(d * k, 0, 0, d * k, d * ox, d * oy);
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    for (var c = 1; c < st.cols; c++) ctx.fillRect(L.colX[c] - st.bezel, 0, st.bezel, L.H);
    for (var r = 1; r < st.rows; r++) ctx.fillRect(0, L.rowY[r] - st.bezel, L.W, st.bezel);
  }
  function drawDisplay() {
    var cv = $('cv'), stg = $('stage'), w = stg.clientWidth, h = stg.clientHeight, ctx = cv.getContext('2d'), d = devicePixelRatio || 1, r = myRect();
    if (!w || !h) return;
    fitCanvas(cv, w, h);
    if (!wall || !r) {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#9aa3ae'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '600 ' + Math.round(Math.min(w, h) / 3 * d) + 'px system-ui,sans-serif';
      ctx.fillText(r ? r.n : '?', cv.width / 2, cv.height / 2); return;
    }
    // full screen: the rect is this screen (1:1). Windowed: the slice is scaled to fit the stage.
    var s = Math.min(w / r.w, h / r.h), vw = w / s, vh = h / s;
    SWWall.draw(ctx, { wall: { W: wall.W, H: wall.H }, view: { x: r.x - (vw - r.w) / 2, y: r.y - (vh - r.h) / 2, w: vw, h: vh }, px: { w: w * d, h: h * d }, content: wall.content, img: images[wall.content && wall.content.img], now: now() });
  }
  var dirty = true;
  function redraw() { dirty = true; }
  function animated(c) { return c && (c.kind === 'clock' || c.kind === 'text'); }
  (function loop() {
    var c = role === 'host' ? st.content : wall && wall.content;
    if (dirty || animated(c)) {
      dirty = false;
      if (role === 'host') { if (page === 0) drawHost($('pv'), $('editor')); if (page === 1) drawHost($('cpv'), $('cpv').parentNode); }
      else drawDisplay();
    }
    requestAnimationFrame(loop);
  })();
  $('cpv').style.width = '100%';

  /* ---------- full screen + wake lock ---------- */
  var lock = null, exitT = 0;
  function wake() {
    if (!navigator.wakeLock || lock || document.hidden) return;
    navigator.wakeLock.request('screen').then(function (l) { lock = l; l.addEventListener('release', function () { lock = null; }); }).catch(function () { /* not allowed */ });
  }
  function enterFs() {
    document.body.classList.add('fs');
    var el = document.documentElement, rq = el.requestFullscreen || el.webkitRequestFullscreen;
    if (rq) { try { var p = rq.call(el); if (p && p.catch) p.catch(function () { /* iframe without allow=fullscreen: pseudo full screen */ }); } catch (_) { /* */ } }
    wake(); setTimeout(reportSize, 400); redraw();
  }
  function exitFs() {
    document.body.classList.remove('fs'); $('fs-exit').hidden = true;
    if (document.fullscreenElement || document.webkitFullscreenElement) { try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (_) { /* */ } }
    if (lock) { try { lock.release(); } catch (_) { /* */ } lock = null; }
    setTimeout(reportSize, 400); redraw();
  }
  $('b-fs').onclick = enterFs;
  $('b-exit').onclick = function (e) { e.stopPropagation(); exitFs(); };
  $('stage').onclick = function () {
    if (!document.body.classList.contains('fs')) { enterFs(); return; }
    $('fs-exit').hidden = false; clearTimeout(exitT); exitT = setTimeout(function () { $('fs-exit').hidden = true; }, 3000);
  };
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (n) {
    document.addEventListener(n, function () { if (!(document.fullscreenElement || document.webkitFullscreenElement) && document.body.classList.contains('fs')) exitFs(); });
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && document.body.classList.contains('fs')) wake(); });
  if (inHub) { $('b-pop').hidden = false; $('b-pop').onclick = function () { window.open(location.href.split('#')[0].split('?')[0] + '#code=' + code, '_blank'); }; }

  /* size changes → tell the host (debounced) */
  var sizeT = 0, lastSize = '';
  function reportSize() { var i = myInfo(), s = i.w + 'x' + i.h + '@' + i.dpr; if (s === lastSize) return; lastSize = s; SWPeer.update(i); }
  addEventListener('resize', function () { clearTimeout(sizeT); sizeT = setTimeout(function () { reportSize(); if (role === 'host') paintEditor(); redraw(); }, 250); });

  /* ---------- screens + swipe (75 px, wrap-around) ---------- */
  function show(i) { page = i; $('viewport').scrollLeft = 0; $('track').style.transform = 'translateX(' + (-100 / PAGES * i) + '%)'; document.querySelectorAll('.dot').forEach(function (d, k) { d.classList.toggle('on', k === i); }); setTimeout(function () { if (role === 'host') paintEditor(); redraw(); }, 280); }
  document.querySelectorAll('.dot').forEach(function (d) { d.onclick = function () { show(+d.dataset.i); }; });
  (function () {
    var x0 = null, y0 = 0, vp = $('viewport');
    vp.addEventListener('pointerdown', function (e) {
      if (document.body.classList.contains('fs') || e.target.closest('input,select,button,textarea,a,.tile,.cell,#stage')) return;
      x0 = e.clientX; y0 = e.clientY;
    });
    vp.addEventListener('pointerup', function (e) {
      if (x0 === null) return; var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) < SW || Math.abs(dy) > Math.abs(dx)) return;
      show((page + (dx < 0 ? 1 : -1) + PAGES) % PAGES);
    });
  })();
  addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    if (e.key === 'Escape' && document.body.classList.contains('fs')) exitFs();
    else if (e.key === 'ArrowRight' && !document.body.classList.contains('fs')) show((page + 1) % PAGES);
    else if (e.key === 'ArrowLeft' && !document.body.classList.contains('fs')) show((page + PAGES - 1) % PAGES);
    else if ((e.key === 'f' || e.key === 'F') && role === 'display') { if (document.body.classList.contains('fs')) exitFs(); else enterFs(); }
  });

  /* ---------- settings ---------- */
  var inName = $('in-name');
  inName.value = SWSave.get('name') || SWSave.name();
  inName.addEventListener('change', function () { SWSave.set('name', inName.value.trim().slice(0, 40)); $('me-name').textContent = SWSave.name(); SWPeer.update(myInfo()); toast('Name saved'); });
  function paintSeg() {
    var vals = { theme: SWSave.get('theme'), role: role, kind: st.content.kind, pattern: st.content.pattern, fit: st.content.fit };
    document.querySelectorAll('.seg[data-key]').forEach(function (s) { s.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === vals[s.dataset.key]); }); });
  }
  document.querySelectorAll('.seg[data-key] button').forEach(function (b) {
    b.onclick = function () {
      var k = b.parentNode.dataset.key, v = b.dataset.v;
      if (k === 'theme') { SWSave.set('theme', v); paintSeg(); }
      else if (k === 'role') {
        var h = otherHost();
        if (v === 'host' && h) dialog((h.name || 'Another device') + ' is the host now. Take over? It becomes a display.', ['Cancel', 'Take over']).then(function (i) { if (i === 1) setRole('host'); });
        else setRole(v);
      } else setC(k, v);
    };
  });
  $('b-become').onclick = function () { var h = otherHost(); if (h) dialog((h.name || 'Another device') + ' is the host now. Take over? It becomes a display.', ['Cancel', 'Take over']).then(function (i) { if (i === 1) { setRole('host'); show(0); } }); else { setRole('host'); show(0); } };

  /* ---------- start ---------- */
  $('me-name').textContent = SWSave.name();
  if (role === 'host') { hostImg = SWSave.image(); if (hostImg && hostImg.id) loadImg(hostImg.id, hostImg.data); }
  st.content.t0 = st.content.t0 || Date.now(); st.content.twu = SWWall.textWidth(st.content.text, 100) / 100;
  paintSeg(); paintRole();
  boot();
  window.SWApp = { _wall: function () { return wall; }, _rect: myRect, _off: function () { return off; }, _state: function () { return st; } };   // test hooks
})();
