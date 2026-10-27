/* Agent — app/gui/chatsearch.js: chat search in the 💬 drawer (AG8). HR.chatSearch: init(), active(), run().
   The box (#chatSearch) filters every chat (HR.threads.every(): folder threads + IndexedDB-only chats) by title and
   message text (user + assistant, case-insensitive). Results replace the list: title + a short snippet with the hit
   marked. Tap -> HR.chats.open(id), then the first matching bubble is scrolled into view and highlighted.
   Chat texts are cached per id + updated, so typing doesn't reload files. Esc or ✕ clears the search. */
HR.chatSearch = (function () {
  var box, clr, listEl, timer = 0, cache = {}, seq = 0;
  function q() { return box ? box.value.trim() : ''; }
  function active() { return !!q(); }
  async function msgs(c) {
    var k = c.id + '|' + c.updated; if (cache[c.id] && cache[c.id].k === k) return cache[c.id].l;
    var l = await HR.threads.load(c.id).catch(function () { return null; }) || []; cache[c.id] = { k: k, l: l }; return l;
  }
  function clean(t) { return String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/\s+/g, ' ').trim(); }
  function snip(t, i, n) { var a = Math.max(0, i - 30), b = Math.min(t.length, i + n + 60); return { pre: (a ? '…' : '') + t.slice(a, i), hit: t.slice(i, i + n), post: t.slice(i + n, b) + (b < t.length ? '…' : '') }; }
  function find(c, l, ql) {
    var title = c.title || '', ti = title.toLowerCase().indexOf(ql);
    for (var j = 0; j < l.length; j++) {
      var m = l[j]; if (m.role !== 'user' && m.role !== 'assistant') continue;
      var t = clean(m.content), i = t.toLowerCase().indexOf(ql); if (i >= 0) return { s: snip(t, i, ql.length), role: m.role };
    }
    return ti >= 0 ? { s: snip(title, ti, ql.length), role: 'title' } : null;
  }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  async function run() {
    var text = q(), my = ++seq; if (!text) { HR.chats.redraw(); return; }
    var rows = await HR.threads.every().catch(function () { return []; }), ql = text.toLowerCase(), out = [];
    for (var i = 0; i < rows.length; i++) { var h = find(rows[i], await msgs(rows[i]), ql); if (h) out.push({ c: rows[i], h: h }); if (my !== seq) return; }
    out.sort(function (a, b) { return (b.c.pinned ? 1 : 0) - (a.c.pinned ? 1 : 0); });
    listEl.innerHTML = ''; listEl.appendChild(el('div', 'ch-sec', out.length ? out.length + ' chat' + (out.length > 1 ? 's' : '') + ' match' : 'No chats match “' + text + '”'));
    out.forEach(function (r) {
      var b = el('button', 'ch-open ch-res'); b.type = 'button';
      var sn = el('span', 'ch-snip'); sn.append(el('span', null, (r.h.role === 'user' ? 'You: ' : r.h.role === 'assistant' ? 'Agent: ' : '') + r.h.s.pre), el('mark', null, r.h.s.hit), el('span', null, r.h.s.post));
      b.append(el('span', 'ch-title', (r.c.pinned ? '📌 ' : '') + (r.c.title || 'New chat') + (r.c.browser ? ' (browser)' : '')), sn);
      b.onclick = function () { go(r.c.id, text); };
      var li = el('div', 'ch-row' + (r.c.id === HR.chats.id() ? ' on' : '')); li.appendChild(b); listEl.appendChild(li);
    });
  }
  async function go(id, text) {
    await HR.chats.open(id);
    setTimeout(function () { mark(text); }, 60);
  }
  /* first bubble in #log whose text contains the query: scroll to it, outline it, wrap the hit in <mark> */
  function mark(text) {
    var ql = text.toLowerCase(), bodies = document.querySelectorAll('#log .msg .body');
    for (var i = 0; i < bodies.length; i++) {
      var w = document.createTreeWalker(bodies[i], NodeFilter.SHOW_TEXT), n;
      while ((n = w.nextNode())) {
        var k = n.nodeValue.toLowerCase().indexOf(ql); if (k < 0) continue;
        var r = document.createRange(); r.setStart(n, k); r.setEnd(n, k + text.length);
        var mk = document.createElement('mark'); mk.className = 'hit'; try { r.surroundContents(mk); } catch (e) {}
        var msg = bodies[i].closest('.msg'); msg.classList.add('hit'); (mk.parentNode ? mk : msg).scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(function () { msg.classList.remove('hit'); }, 2500); return true;
      }
    }
    return false;
  }
  function init() {
    box = document.getElementById('chatSearch'); clr = document.getElementById('chatSearchX'); listEl = document.getElementById('chatList');
    box.addEventListener('input', function () { clr.hidden = !box.value; clearTimeout(timer); timer = setTimeout(run, 200); });
    box.addEventListener('keydown', function (e) { if (e.key === 'Escape' && box.value) { e.stopPropagation(); box.value = ''; clr.hidden = true; run(); } });
    clr.onclick = function () { box.value = ''; clr.hidden = true; run(); box.focus(); };
  }
  return { init: init, active: active, run: run };
})();
