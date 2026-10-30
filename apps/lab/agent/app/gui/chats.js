/* Agent — app/gui/chats.js: multiple chats (AG4). HR.chats: init(), id(), dirty(), newChat(), open(id).
   Drawer (#chats): "+ New chat", search (AG8, app/gui/chatsearch.js), 📌 Pinned then Recent chats, newest first
   (tap = switch; ⋯ / long-press / right-click = small menu: Pin / Unpin, Rename, Delete; pinned:true lives in the index). Phone: slide-over with a
   backdrop (💬 opens, tap outside / pick closes). >=960px: docked left pane, 💬 shows / hides it (agent.chatsPane).
   The open chat id is kept in localStorage 'agent.chat' so a reload resumes it. Title = first user message (until renamed).
   Each chat stores its provider + model; opening a chat switches to them (AG5: HR.models.setChat, the Settings default is
   untouched; picked() records a pick from the model chip; a new chat starts on the Settings default). Saves are debounced (HR.msgs.save -> dirty()). */
HR.chats = (function () {
  /* AG-F3: base = what this tab last loaded / saved of the open chat {id, upd, n}; bc tells other tabs about saves */
  var base = { id: '', upd: '', n: 0 }, bc = null;
  try { bc = new BroadcastChannel('agent-chats'); } catch (e) { bc = null; }
  function setBase(id, upd, n) { base = { id: id, upd: String(upd || ''), n: n }; }
  var meta = null, rows = [], timer = 0, saving = Promise.resolve(), pane, listEl, KEY = 'agent.chat', $ = function (id) { return document.getElementById(id); };
  function stamp() { return new Date().toISOString().slice(0, 19); }
  function fresh() { return { id: HR.threads.newId(), title: '', provider: HR.models.chosen(), model: HR.model.current() || '', created: stamp(), updated: stamp() }; }
  /* AG-F1: stable id for an imported pre-AG4 chat: 'legacy-' + FNV-1a hash of its turns (same chat -> same id) */
  function legacyId(l) {
    var s = l.map(function (m) { return (m.role || '') + '\u0001' + (m.content || ''); }).join('\u0002'), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return 'legacy-' + ('0000000' + h.toString(16)).slice(-8);
  }
  function remember() { try { localStorage.setItem(KEY, meta.id); } catch (e) {} }
  function titleOf(l) { var u = l.filter(function (m) { return m.role === 'user' && m.content; })[0]; if (!u) return ''; var t = u.content.replace(/\s+/g, ' ').trim(); return t.length > 48 ? t.slice(0, 47) + '…' : t; }
  function dirty() { clearTimeout(timer); timer = setTimeout(flush, 400); }
  function flush() {
    clearTimeout(timer); timer = 0;
    var l = HR.msgs.all().filter(function (m) { return !m.error; }); if (!meta || !l.length) return saving;
    if (!meta.title) meta.title = titleOf(l);
    if (HR.models.id() === HR.models.chosen()) { meta.provider = HR.models.chosen(); meta.model = HR.model.current() || meta.model; }
    meta.updated = stamp();
    var m = Object.assign({}, meta), copy = l.slice();
    // saving = saving.then(function () { return HR.threads.save(m, copy); }).then(refresh, function (e) { HR.steps && HR.steps.note('Chat not saved: ' + (e && e.message || e)); });
    /* AG-F3: another tab saved this chat since we loaded it -> take its turns + append ours (nothing is overwritten or lost) */
    /* AG-F3: check + save under one cross-tab lock (Web Locks), so two tabs can't both read 'no change' and overwrite each other */
    function locked(fn) { try { if (navigator.locks && navigator.locks.request) return navigator.locks.request('agent-chat-save', fn); } catch (e) {} return fn(); }
    saving = saving.then(function () { return locked(async function () {
      var cur = (await HR.threads.list().catch(function () { return []; })).filter(function (r) { return r.id === m.id; })[0];
      if (cur && base.id === m.id && String(cur.updated) !== base.upd && l.length >= base.n) {
        var other = await HR.threads.load(m.id).catch(function () { return null; });
        if (other) {
          copy = other.concat(l.slice(base.n));
          if (meta && meta.id === m.id) { var live = HR.msgs.all(); live.splice(0, base.n, ...other); copy = live.filter(function (x) { return !x.error; }).slice(); if (!HR.chat.busy()) HR.chat.render(); }
          HR.chat.note('↻ This chat was also changed in another tab; its messages were added above yours.');
          if (cur.title && !meta.title) m.title = cur.title;
        }
      }
      await HR.threads.save(m, copy); setBase(m.id, m.updated, copy.length);
      if (bc) try { bc.postMessage({ id: m.id, updated: m.updated }); } catch (e) {}
    }); }).then(refresh, function (e) { HR.steps && HR.steps.note('Chat not saved: ' + (e && e.message || e)); });
    return saving;
  }
  async function refresh() { rows = await HR.threads.list().catch(function () { return []; }); draw(); }
  /* AG5: the chat's own provider + model (no saved pair -> Settings default) */
  function useModel(c) {
    var p = c && c.provider || '', m = c && c.model || '';
    if (p === HR.models.chosen() && m && m === HR.model.current() && !HR.models.fallen()) { HR.models.setChat(p, m); return; }
    HR.models.setChat(p, m); HR.model.load();
  }
  function picked() { if (!meta) return; meta.provider = HR.models.chosen(); meta.model = HR.models.chatModel(); if (HR.msgs.all().length) dirty(); draw(); }
  function show() { HR.steps.clear(); HR.chat.render(); remember(); draw(); }
  function busy() { if (HR.chat.busy()) { HR.chat.note('Stop the current reply first.'); return true; } return false; }
  async function newChat() {
    if (busy()) return; await flush();
    meta = fresh(); HR.msgs.set([]); show(); useModel(null); close(); $('input').focus();
  }
  async function open(id) {
    if (busy()) return;
    if (meta && id === meta.id) { close(); return; }
    await flush();
    var l = await HR.threads.load(id); if (!l) { HR.chat.note('Could not open that chat.'); refresh(); return; }
    var c = rows.filter(function (r) { return r.id === id; })[0] || { id: id };
    meta = Object.assign({}, c); HR.msgs.set(l); setBase(id, c.updated, l.length); show(); useModel(c); close();   /* AG-F3 base */
  }
  async function rename(c) {
    var t = prompt('Rename chat', c.title || ''); if (t == null) return; t = t.replace(/\s+/g, ' ').trim().slice(0, 80); if (!t) return;
    if (meta && meta.id === c.id) { meta.title = t; if (HR.msgs.all().length) { await flush(); return; } }
    var l = await HR.threads.load(c.id); if (!l) return;
    await HR.threads.save(Object.assign({}, c, { title: t }), l); refresh();
  }
  async function del(c) {
    if (!confirm('Delete chat “' + (c.title || 'New chat') + '”? Its file and session notes are removed (the daily log stays).')) return;
    if (meta && meta.id === c.id) { if (busy()) return; clearTimeout(timer); meta = fresh(); HR.msgs.set([]); show(); }
    await saving; await HR.threads.remove(c.id).catch(function () {}); if (HR.mem) await HR.mem.dropSession(c.id);
    refresh();
  }
  function when(s) { var d = new Date(s); if (isNaN(d)) return ''; var t = new Date(); return d.toDateString() === t.toDateString() ? d.toTimeString().slice(0, 5) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  /* AG8: one ⋯ button per row (also long-press / right-click) opens a small menu: Pin / Unpin, Rename, Delete */
  var menu = null;
  function closeMenu() { if (menu) { menu.remove(); menu = null; } }
  function openMenu(li, c) {
    closeMenu(); if (c.draft) return;
    menu = document.createElement('div'); menu.className = 'ch-menu'; menu.setAttribute('role', 'menu');
    [[c.pinned ? '📌 Unpin' : '📌 Pin', function () { pin(c, !c.pinned); }], ['✎ Rename', function () { rename(c); }], ['🗑 Delete', function () { del(c); }]].forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ch-mi'; b.setAttribute('role', 'menuitem'); b.textContent = x[0];
      b.onclick = function (e) { e.stopPropagation(); closeMenu(); x[1](); }; menu.appendChild(b);
    });
    li.appendChild(menu); menu.querySelector('button').focus();
  }
  async function pin(c, on) {
    await saving; if (meta && meta.id === c.id) meta.pinned = on;
    await HR.threads.pin(c.id, on).catch(function () {}); refresh();
  }
  function row(c) {
    var li = document.createElement('div'), b = document.createElement('button'), m = document.createElement('button'), press = 0;
    li.className = 'ch-row' + (meta && c.id === meta.id ? ' on' : '');
    b.type = m.type = 'button'; b.className = 'ch-open'; m.className = 'hb ch-act';
    var t = document.createElement('span'); t.className = 'ch-title'; t.textContent = (c.pinned ? '📌 ' : '') + (c.title || 'New chat');
    var s = document.createElement('span'); s.className = 'ch-sub'; s.textContent = [when(c.updated), c.model].filter(Boolean).join(' · ');
    b.append(t, s); b.onclick = function (e) { if (press === -1) { press = 0; e.stopPropagation(); return; } open(c.id); };
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); openMenu(li, c); });
    b.addEventListener('touchstart', function () { press = setTimeout(function () { press = -1; openMenu(li, c); }, 550); }, { passive: true });
    b.addEventListener('touchend', function () { if (press > 0) clearTimeout(press); });
    b.addEventListener('touchmove', function () { if (press > 0) clearTimeout(press); press = 0; }, { passive: true });
    m.textContent = '⋯'; m.title = 'Chat actions'; m.setAttribute('aria-label', 'Actions for ' + (c.title || 'chat')); m.setAttribute('aria-haspopup', 'menu');
    m.onclick = function (e) { e.stopPropagation(); if (menu && menu.parentNode === li) closeMenu(); else openMenu(li, c); };
    li.append(b); if (!c.draft) li.append(m); return li;
  }
  function head(t) { var h = document.createElement('div'); h.className = 'ch-sec'; h.textContent = t; return h; }
  function draw() {
    if (!listEl) return; if (HR.chatSearch && HR.chatSearch.active()) { HR.chatSearch.run(); return; }
    closeMenu(); listEl.innerHTML = '';
    var all = rows.slice(); if (meta && !all.some(function (r) { return r.id === meta.id; })) all.unshift({ id: meta.id, title: meta.title || 'New chat', updated: meta.updated, draft: true });
    var pins = all.filter(function (c) { return c.pinned; }), rest = all.filter(function (c) { return !c.pinned; });
    if (pins.length) { listEl.appendChild(head('Pinned')); pins.forEach(function (c) { listEl.appendChild(row(c)); }); if (rest.length) listEl.appendChild(head('Recent')); }
    rest.forEach(function (c) { listEl.appendChild(row(c)); });
    // $('chatsWhere').textContent = HR.fs.ready() && HR.set.get('saveChats') !== 'off' ? 'Saved in 📁 ' + HR.fs.name() + '/' + HR.threads.DIR : 'Saved in this browser (pick a folder to keep them as files)';
    /* AG-F2: folder remembered but not allowed yet -> say so and show Reconnect (no silent switch to browser storage) */
    var wait = HR.threads.waiting(), rb = $('chatsReconnect');
    $('chatsWhere').textContent = wait ? '⚠ Folder' + (HR.fs.name() ? ' “' + HR.fs.name() + '”' : '') + ' needs permission again. Chats are kept in this browser for now and go to the folder when you reconnect.'
      : HR.fs.ready() && HR.set.get('saveChats') !== 'off' ? 'Saved in 📁 ' + HR.fs.name() + '/' + HR.threads.DIR : 'Saved in this browser (pick a folder to keep them as files)';
    $('chatsWhere').classList.toggle('warn', wait);
    if (rb) { rb.hidden = !wait; if (wait) HR.threads.pendingCount().then(function (n) { rb.textContent = '📁 Reconnect folder' + (n ? ' · ' + n + ' waiting' : ''); }); }
  }
  function phone() { return !matchMedia('(min-width:960px)').matches; }
  function close() { if (phone()) document.body.classList.remove('chats-open'); }
  function toggle() {
    if (phone()) document.body.classList.toggle('chats-open');
    else { var off = document.body.classList.toggle('chats-off'); try { localStorage.setItem('agent.chatsPane', off ? 'off' : 'on'); } catch (e) {} }
  }
  async function init() {
    pane = $('chats'); listEl = $('chatList');
    document.addEventListener('click', function (e) { if (menu && !menu.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
    $('btnChats').onclick = toggle; $('chatsClose').onclick = function () { document.body.classList.remove('chats-open'); };
    if ($('chatsReconnect')) $('chatsReconnect').onclick = function () { HR.fs.reconnect().catch(function (e) { if (!e || e.name !== 'AbortError') HR.chat.note('Folder: ' + (e && e.message || e)); }); };   /* AG-F2: tap = user gesture */
    $('chatsBack').onclick = close; $('btnNewChat').onclick = newChat; $('btnClear').onclick = newChat;
    if (localStorage.getItem('agent.chatsPane') === 'off') document.body.classList.add('chats-off');
    /* AG-F3: another tab saved -> refresh the list; the open chat reloads when this tab has nothing unsaved */
    if (bc) bc.onmessage = function (ev) { var d = ev.data || {};
      if (meta && d.id === meta.id && !timer && !HR.chat.busy() && String(d.updated) !== base.upd)
        saving = saving.then(function () { return HR.threads.load(d.id); }).then(function (l) { if (l && meta && meta.id === d.id && !timer) { HR.msgs.set(l); setBase(d.id, d.updated, l.length); HR.chat.render(); } }).catch(function () {});
      saving.then(refresh); };
    addEventListener('pagehide', flush); document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
    HR.fs.onChange(function (s) { if (s !== 'ready') { refresh(); return; } HR.threads.merge().catch(function () {}).then(function () { if (meta && HR.msgs.all().length) dirty(); refresh(); }); });
    await refresh();
    // if (HR.msgs.all().length) { meta = fresh(); remember(); await flush(); return; }   /* typed before chats loaded */
    /* AG-F4: typed / sent before the chats loaded -> continue the last chat (its turns go above the new ones) instead of a new chat */
    if (HR.msgs.all().length) {
      var lastId = localStorage.getItem(KEY), pk = rows.filter(function (r) { return r.id === lastId; })[0] || rows[0], pl = pk && await HR.threads.load(pk.id).catch(function () { return null; });
      if (pl && pl.length) { var live = HR.msgs.all(); live.unshift.apply(live, pl); meta = Object.assign({}, pk); setBase(pk.id, pk.updated, pl.length); remember(); if (!HR.chat.busy()) HR.chat.render(); draw(); useModel(pk); }
      else { meta = fresh(); remember(); }
      await flush(); return;
    }
    var old = HR.msgs.legacy(), last = localStorage.getItem(KEY);
    // if (old.length) { meta = fresh(); HR.msgs.set(old); show(); await flush(); return; }   /* pre-AG-F1: new random id per load -> duplicates */
    /* AG-F1: the imported chat gets an id from its content (legacyId); already saved -> skip and open the last chat as usual */
    if (old.length) { var lid = legacyId(old);
      if (!rows.some(function (r) { return r.id === lid; })) { meta = fresh(); meta.id = lid; HR.msgs.set(old); show(); await flush(); return; } }
    var pick = rows.filter(function (r) { return r.id === last; })[0] || rows[0];
    if (pick) { var l = await HR.threads.load(pick.id); if (l) { meta = Object.assign({}, pick); HR.msgs.set(l); setBase(pick.id, pick.updated, l.length); show(); useModel(pick); return; } }   /* AG-F3 base */
    meta = fresh(); HR.msgs.set([]); show();
  }
  return { init: init, redraw: draw, rows: function () { return rows; }, id: function () { return meta ? meta.id : ''; }, dirty: dirty, flush: flush, newChat: newChat, open: open, picked: picked };
})();
