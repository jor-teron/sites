/* Whiteboard WB1 — UI + sync glue: screens (Board, Settings), dots + 75 px wrap-around swipes, toolbar on the right,
   in-app dialogs, Hub code, live sync, autosave.
   Hub code, in order: #code= / ?hub= (QR), the Hub's {sharedLink:'hello'} (inside the Hub),
   parent.__hubRemote.code (phone Hub), localStorage 'jtsites-hub-ctrl-code' (desktop Hub),
   'shared-link-join-code', our last code, else the code dialog (the board still works offline).
   Sync (through WBPeer's lobby, reliable + ordered): live strokes lb/lp/ls/le/lx (points batched every 40 ms),
   committed ops add/del/clear, cursors cur (every 70 ms). A new device gets {k:'state'} from the lobby: the lobby's
   board replaces ours, then ops we made while offline are replayed and sent. If the lobby's board is empty, ours seeds it. */
(function () {
  'use strict';
  // FC5: Hub codes are 5 digits (H83); public lobby is SharedLink.LOBBY, else '00000'. Saved 4-digit codes are ignored.
  var PUB = (function () { try { var S = window.SharedLink || (window.parent && window.parent.SharedLink) || (window.top && window.top.SharedLink); if (S && /^\d{5}$/.test(String(S.LOBBY || ''))) return String(S.LOBBY); } catch (_) {} return '00000'; })();
  function c5(c) { c = String(c || ''); return /^\d{5}$/.test(c) ? c : ''; }   // FC5: drops saved 4-digit codes
  var $ = function (id) { return document.getElementById(id); };
  var inHub = window.parent !== window, page = 0, SW = 75, started = false, code = '', myId = '';
  var LAST = 'whiteboard-last-code';
  var COLORS = ['ink', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#a16207'];
  var SIZES = [2, 4, 8, 16];
  var PEOPLE = ['#f43f5e', '#f59e0b', '#10b981', '#0ea5e9', '#a855f7', '#ec4899', '#84cc16', '#14b8a6'];
  var B = WBBoard;

  /* ---------- dialogs / toast ---------- */
  function dialog(text, buttons, ask) { // ask: 'code' | 'text' | falsy
    return new Promise(function (res) {
      $('d-text').textContent = text;
      var inp = $('d-input'), area = $('d-area');
      inp.hidden = ask !== 'code'; area.hidden = ask !== 'text'; inp.value = ''; area.value = '';
      var row = $('d-row'); row.innerHTML = '';
      (buttons || ['OK']).forEach(function (b, i, a) {
        var el = document.createElement('button'); el.className = i === a.length - 1 ? 'btn sm' + (/Clear/.test(b) ? ' bad' : '') : 'mini'; el.textContent = b;
        el.onclick = function () {
          var last = i === a.length - 1;
          if (ask === 'code' && last) { var c = (inp.value.match(/\d{5}/) || [''])[0]; if (!c) { $('d-text').textContent = 'Enter the 5-digit code.'; return; } $('dialog').hidden = true; return res(c); }
          if (ask === 'text') { $('dialog').hidden = true; return res(last ? area.value.replace(/\s+$/, '') : null); }
          $('dialog').hidden = true; res(ask ? null : i);
        };
        row.appendChild(el);
      });
      $('dialog').hidden = false;
      if (ask) setTimeout(function () { (ask === 'code' ? inp : area).focus(); }, 50);
    });
  }
  var toastT = 0;
  function toast(t) { var e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('show'); }, 2200); }
  function dialogOpen() { return !$('dialog').hidden; }

  /* ---------- code ---------- */
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function urlCode() { var m = (location.hash + '&' + location.search).match(/(?:code|hub|join)=(\d{5})/); return m ? m[1] : ''; }
  function localCode() {
    try { if (window.parent.__hubRemote && window.parent.__hubRemote.code) { var r0 = c5(window.parent.__hubRemote.code); if (r0) return r0; } } catch (_) { /* */ }
    var c = ls('jtsites-hub-ctrl-code'); if (/^\d{5}$/.test(c) && inHub) return c;
    c = ls('shared-link-join-code'); if (/^\d{5}$/.test(c) && inHub) return c;
    return '';
  }
  function boardKey() { return code || 'local'; }
  function go(c) {
    if (started && c === code) return;
    var prev = code;
    flushSave();
    if (started) WBPeer.stop();
    started = true; code = c; pending = [];
    try { localStorage.setItem(LAST, c); } catch (_) { /* */ }
    $('code-lbl').textContent = c;
    WBSave.load(boardKey()).then(function (d) {
      if (d && d.items) B.setAll(d.items, d.clr);
      else if (prev) B.setAll([], 0); // a different code starts with its own board
      // first code ever: keep whatever was drawn offline (it becomes this code's board)
      return WBPeer.start(c);
    }).catch(function () { $('status').textContent = 'PeerJS could not load (offline?)'; });
  }
  function askCode() { dialog('Enter the 5-digit Hub Connect Code shown on the Hub. Every device on the same code shares this board.', ['Cancel', 'Join'], 'code').then(function (c) { if (c) go(c); }); }
  function boot() {
    var c = urlCode();
    if (c) return go(c);
    if (inHub) {
      var got = false;
      addEventListener('message', function (e) {
        var d = e.data; if (e.source !== window.parent || !d || d.sharedLink !== 'hello' || got) return;
        if (/^\d{5}$/.test(String(d.code || ''))) { got = true; go(String(d.code)); }
      });
      try { window.parent.postMessage({ sharedLink: 'ready', app: 'whiteboard', types: ['x-none/'] }, '*'); } catch (_) { /* */ }
      setTimeout(function () { if (!got && !started) { var l = localCode() || c5(ls(LAST)); if (l) go(l); else { $('status').textContent = 'Not connected · drawing on this device'; askCode(); } } }, 800);
      return;
    }
    c = c5(ls(LAST)) || c5(ls('shared-link-join-code'));
    if (/^\d{5}$/.test(c)) go(c); else { $('status').textContent = 'Not connected · drawing on this device'; askCode(); }
  }
  $('btn-code').onclick = function () { closePops(); askCode(); };
  $('btn-code2').onclick = askCode;

  /* ---------- sync ---------- */
  var pending = [], buf = {}, flushT = 0, curT = 0, curLast = null, roster = [];
  function online() { return WBPeer.online(); }
  function flushLive() {
    flushT = 0;
    Object.keys(buf).forEach(function (id) {
      var b = buf[id];
      if (b.p && b.p.length) WBPeer.send({ k: 'lp', id: id, p: b.p });
      if (b.s) WBPeer.send({ k: 'ls', id: id, p: b.s });
    });
    buf = {};
  }
  B.on('live', function (m) {
    if (!online()) return;
    if (m.k === 'lp') { (buf[m.id] = buf[m.id] || { p: [] }).p.push.apply(buf[m.id].p, m.p); if (!flushT) flushT = setTimeout(flushLive, 40); return; }
    if (m.k === 'ls') { (buf[m.id] = buf[m.id] || { p: [] }).s = m.p; if (!flushT) flushT = setTimeout(flushLive, 40); return; }
    if (m.k === 'le' || m.k === 'lx') { clearTimeout(flushT); if (m.k === 'le') flushLive(); else { delete buf[m.id]; flushLive(); } }
    WBPeer.send(m);
  });
  B.on('op', function (m) {
    if (m.k === 'add') m.its.forEach(function (it) { delete buf[it.id]; });
    if (online()) WBPeer.send(m); else if (pending.length < 2000) pending.push(m);
  });
  B.on('cursor', function (p) {
    curLast = p;
    if (curT || !roster.length || !online()) return;
    curT = setTimeout(function () { curT = 0; if (curLast && online()) WBPeer.send({ k: 'cur', x: Math.round(curLast.x), y: Math.round(curLast.y) }); }, 70);
  });
  WBPeer.provide(function () { return { k: 'state', its: B.items(), clr: B.clr() }; });
  WBPeer.on('me', function (id) { myId = id; B.setMe(id); paintPeople(); });
  WBPeer.on('status', function (t) { $('status').textContent = t; });
  WBPeer.on('online', function (on) {
    if (on && WBPeer.isLobby()) pending = []; // our board is the source of truth
    paintPeople();
  });
  WBPeer.on('roster', function (l) {
    var ids = l.map(function (d) { return d.id; });
    roster.forEach(function (d) { if (ids.indexOf(d.id) < 0) B.dropPeer(d.id); });
    roster = l; paintPeople();
  });
  WBPeer.on('signal', function (m, from) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'state') {
      var mine = B.items();
      if (!(m.its || []).length && !m.clr && mine.length) { WBPeer.send({ k: 'add', its: mine }); pending = []; return; }
      B.setAll(m.its, m.clr);
      var ops = pending; pending = [];
      ops.forEach(function (op) { B.apply(op, myId); WBPeer.send(op); });
      if (ops.length) toast('Sent your offline changes');
      return;
    }
    if (m.k === 'cur') { var p = person(from); m.name = p.name; m.color = p.color; }
    if (m.k === 'clear') toast((person(from).name || 'Someone') + ' cleared the board');
    B.apply(m, from);
  });

  /* ---------- people ---------- */
  function colorOf(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return PEOPLE[Math.abs(h) % PEOPLE.length]; }
  function person(id) { var d = roster.filter(function (r) { return r.id === id; })[0]; return { name: (d && d.name) || 'Device', color: colorOf(id || '') }; }
  function paintPeople() {
    var ul = $('people'); ul.innerHTML = '';
    [{ id: myId, name: WBStore.name(), me: true }].concat(roster).forEach(function (d) {
      var li = document.createElement('li'), i = document.createElement('i'), s = document.createElement('span');
      i.style.background = colorOf(d.id || 'me'); s.textContent = d.name || 'Device'; li.append(i, s);
      if (d.me) { var em = document.createElement('em'); em.textContent = 'you'; li.appendChild(em); }
      ul.appendChild(li);
    });
    $('n-people').textContent = roster.length + 1;
    $('people-hint').hidden = roster.length > 0;
  }

  /* ---------- toolbar ---------- */
  var tool = WBStore.get('tool'), shape = WBStore.get('shape'), color = WBStore.get('color'), size = +WBStore.get('size') || 4;
  var SHAPE_ICON = { line: '╱', rect: '▭', ell: '◯', arrow: '➚' };
  if (['pen', 'hl', 'eraser', 'shape', 'text', 'hand'].indexOf(tool) < 0) tool = 'pen';
  if (!SHAPE_ICON[shape]) shape = 'rect';
  if (COLORS.indexOf(color) < 0) color = 'ink';
  if (SIZES.indexOf(size) < 0) size = 4;
  function closePops(except) { ['pop-shape', 'pop-color', 'pop-people'].forEach(function (p) { if (p !== except) $(p).hidden = true; }); }
  function toggle(id) { closePops(id); $(id).hidden = !$(id).hidden; }
  function effColor() { return tool === 'hl' && color === 'ink' ? '#eab308' : color; }
  function swatchCss(c) { return c === 'ink' ? (document.documentElement.classList.contains('dark') ? B.colors.INK_D : B.colors.INK_L) : c; }
  function paintTools() {
    document.querySelectorAll('#tools [data-tool]').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === tool); });
    $('b-shape').textContent = SHAPE_ICON[shape];
    document.querySelectorAll('#pop-shape button').forEach(function (b) { b.classList.toggle('on', b.dataset.shape === shape); });
    $('swatch').style.background = swatchCss(effColor());
    document.querySelectorAll('.cl').forEach(function (b) { b.classList.toggle('on', b.dataset.c === color); b.style.background = swatchCss(b.dataset.c); });
    document.querySelectorAll('.sz').forEach(function (b) { b.classList.toggle('on', +b.dataset.s === size); });
    B.setTool(tool); B.setShape(shape); B.setColor(effColor()); B.setSize(size);
  }
  function setTool(t) { tool = t; WBStore.set('tool', t); paintTools(); }
  document.querySelectorAll('#tools [data-tool]').forEach(function (b) {
    b.onclick = function () {
      if (b.dataset.tool === 'shape' && tool === 'shape') { toggle('pop-shape'); return; }
      closePops(); setTool(b.dataset.tool);
      if (b.dataset.tool === 'shape') toggle('pop-shape');
    };
  });
  document.querySelectorAll('#pop-shape button').forEach(function (b) { b.onclick = function () { shape = b.dataset.shape; WBStore.set('shape', shape); closePops(); setTool('shape'); }; });
  COLORS.forEach(function (c) {
    var b = document.createElement('button'); b.className = 'cl'; b.dataset.c = c; b.title = c === 'ink' ? 'Ink (black on light, white on dark)' : c;
    b.onclick = function () { color = c; WBStore.set('color', c); if (tool === 'eraser' || tool === 'hand') setTool('pen'); else paintTools(); };
    $('colors').appendChild(b);
  });
  SIZES.forEach(function (s) {
    var b = document.createElement('button'); b.className = 'sz'; b.dataset.s = s; b.title = 'Size ' + s;
    var i = document.createElement('i'); i.style.width = i.style.height = Math.min(20, s + 2) + 'px'; b.appendChild(i);
    b.onclick = function () { size = s; WBStore.set('size', s); paintTools(); };
    $('sizes').appendChild(b);
  });
  $('b-color').onclick = function () { toggle('pop-color'); };
  $('b-people').onclick = function () { paintPeople(); toggle('pop-people'); };
  $('b-undo').onclick = function () { B.undo(); };
  $('b-redo').onclick = function () { B.redo(); };
  $('b-fit').onclick = function () { closePops(); B.fit(); };
  $('b-save').onclick = function () {
    closePops();
    WBSave.png(B.items(), WBStore.get('bg'), document.documentElement.classList.contains('dark')).then(function (n) { toast('Saved ' + n); }).catch(function (e) { dialog(e.message, ['OK']); });
  };
  $('b-clear').onclick = function () {
    closePops();
    if (!B.count()) { toast('The board is already empty'); return; }
    var others = online() && roster.length;
    dialog(others ? 'Clear the board for everyone on code ' + code + '? This can\'t be undone.' : 'Clear the board? This can\'t be undone.', ['Cancel', 'Clear']).then(function (i) { if (i === 1) { B.clear(); toast('Board cleared'); } });
  };
  function paintStack() { $('b-undo').disabled = !B.canUndo(); $('b-redo').disabled = !B.canRedo(); }
  B.on('stack', paintStack);
  B.on('view', function (v) { $('zoom-lbl').textContent = Math.round(v.z * 100) + '%'; });
  B.on('text', function (p) {
    dialog('Text', ['Cancel', 'Add'], 'text').then(function (t) { if (t) B.addText(p.x, p.y, t); });
  });
  $('board').addEventListener('pointerdown', function () { closePops(); });

  /* ---------- autosave ---------- */
  var saveT = 0;
  function flushSave() { if (!saveT) return; clearTimeout(saveT); saveT = 0; WBSave.store(boardKey(), { items: B.items(), clr: B.clr(), ts: Date.now() }); }
  B.on('change', function () { clearTimeout(saveT); saveT = setTimeout(function () { saveT = 1; flushSave(); }, 700); });
  addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', function () { if (document.hidden) flushSave(); });

  /* ---------- keys ---------- */
  addEventListener('keydown', function (e) {
    if (dialogOpen() || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || page !== 0) return;
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? B.redo() : B.undo(); return; }
    if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); B.redo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var map = { p: 'pen', h: 'hl', e: 'eraser', t: 'text' }, sh = { l: 'line', r: 'rect', o: 'ell', a: 'arrow' };
    if (map[k]) setTool(map[k]);
    else if (sh[k]) { shape = sh[k]; WBStore.set('shape', shape); setTool('shape'); }
    else if (k === '0') B.fit();
    else if (k === '+' || k === '=') B.zoom(1.25);
    else if (k === '-') B.zoom(0.8);
    else if (k === 'escape') closePops();
  });

  /* ---------- screens + swipe (75 px, wrap-around; not from the board itself) ---------- */
  function show(i) { page = i; closePops(); $('track').style.transform = 'translateX(' + (-50 * i) + '%)'; document.querySelectorAll('.dot').forEach(function (d, k) { d.classList.toggle('on', k === i); }); }
  document.querySelectorAll('.dot').forEach(function (d) { d.onclick = function () { show(+d.dataset.i); }; });
  (function () {
    var x0 = null, y0 = 0, vp = $('viewport');
    vp.addEventListener('pointerdown', function (e) { if (e.target.closest('#stage,input,select,button,textarea')) return; x0 = e.clientX; y0 = e.clientY; });
    vp.addEventListener('pointerup', function (e) {
      if (x0 === null) return; var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) < SW || Math.abs(dy) > Math.abs(dx)) return;
      show((page + (dx < 0 ? 1 : -1) + 2) % 2);
    });
  })();

  /* ---------- settings ---------- */
  var inName = $('in-name');
  inName.value = WBStore.get('name') || WBStore.name();
  inName.addEventListener('change', function () { WBStore.set('name', inName.value.trim().slice(0, 40)); WBPeer.rename(); paintPeople(); toast('Name saved'); });
  function paintSeg() {
    document.querySelectorAll('.seg').forEach(function (s) { var key = s.dataset.key; s.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === WBStore.get(key)); }); });
  }
  document.querySelectorAll('.seg button').forEach(function (b) {
    b.onclick = function () { var key = b.parentNode.dataset.key; WBStore.set(key, b.dataset.v); if (key === 'bg') B.setBg(b.dataset.v); paintSeg(); };
  });
  WBStore.onTheme(function (dark) { B.setDark(dark); paintTools(); });

  /* ---------- start ---------- */
  B.init($('board'));
  B.setBg(WBStore.get('bg')); B.setDark(document.documentElement.classList.contains('dark'));
  paintSeg(); paintTools(); paintStack(); paintPeople();
  WBSave.load('local').then(function (d) { if (!started && d && d.items) B.setAll(d.items, d.clr); boot(); });
})();
