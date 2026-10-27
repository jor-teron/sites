/* Harness — app/gui/chat.js: chat area + input. send() streams a reply from Ollama into an assistant bubble
   (rAF-throttled), Send turns into Stop (AbortController). Thinking (<think>…</think> in text or Ollama's 'thinking'
   field) goes into a folded "Thinking" box. Stats line: tokens, tok/s, seconds. Errors show as cards in the chat
   (unreachable -> how to set OLLAMA_ORIGINS for this page's origin). No tools / loop in HR1. */
HR.chat = (function () {
  var log, input, sendBtn, ctrl = null;
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  /* plain text with ``` fenced code blocks */
  function rich(box, text) {
    box.innerHTML = '';
    String(text || '').split(/```/).forEach(function (part, i) {
      if (i % 2) { var nl = part.indexOf('\n'), pre = el('pre', 'code'), code = el('code', null, nl >= 0 ? part.slice(nl + 1) : part); pre.appendChild(code); box.appendChild(pre); }
      else if (part) box.appendChild(el('div', 'txt', part));
    });
  }
  function bottom() { var near = log.scrollHeight - log.scrollTop - log.clientHeight < 120; if (near) log.scrollTop = log.scrollHeight; }
  function bubble(m) {
    var b = el('div', 'msg ' + m.role + (m.error ? ' err' : '')), think = el('details', 'think'), sum = el('summary', null, 'Thinking'),
      tb = el('div', 'think-body'), body = el('div', 'body'), stat = el('div', 'stat');
    think.append(sum, tb); think.hidden = true;
    if (m.role === 'assistant') b.append(think);
    b.append(body, stat); log.appendChild(b);
    function paint(live) {
      var sp = HR.msgs.splitThink(m.raw != null ? m.raw : m.content), th = [m.thinkField != null ? m.thinkField : (m.raw == null ? m.thinking : ''), sp.thinking].filter(Boolean).join('\n');
      if (m.role === 'assistant') { m.content = sp.content; m.thinking = th; }
      think.hidden = !th; tb.textContent = th;
      sum.textContent = live && (sp.open || (m.thinkField && !sp.content)) ? 'Thinking…' : 'Thinking · ' + th.length + ' chars';
      think.classList.toggle('live', !!live && (sp.open || (!!m.thinkField && !sp.content)));
      rich(body, m.content || (live ? '' : m.error ? '' : '(empty reply)'));
      if (live && !m.content && !th) body.appendChild(el('span', 'dots', '•••'));
      var s = m.stats; stat.textContent = s ? [s.tokens ? s.tokens + ' tokens' : '', s.tps ? s.tps.toFixed(1) + ' tok/s' : '', s.sec ? s.sec.toFixed(1) + ' s' : '', s.note || ''].filter(Boolean).join(' · ') : '';
      stat.hidden = !stat.textContent;
    }
    paint(false); bottom();
    return { paint: paint, el: b };
  }
  function renderAll() { log.innerHTML = ''; var l = HR.msgs.all(); if (!l.length) hello(); l.forEach(function (m) { if (!m.error) bubble(m); }); log.scrollTop = log.scrollHeight; }
  function hello() { var h = el('div', 'hello'); h.append(el('div', 'hello-ico', '🧪'), el('div', 'hello-t', 'Harness'), el('div', 'hello-s', 'Chat with a local Ollama model. Steps show every model call.')); log.appendChild(h); }
  function clearErrors() { [].forEach.call(log.querySelectorAll('.ecard'), function (c) { c.remove(); }); }
  function code(t) { return el('code', null, t); }
  function errorCard(e) {
    clearErrors(); var h = log.querySelector('.hello'); if (h) h.remove();
    var base = HR.set.get('baseUrl'), origin = location.origin === 'null' ? '*' : location.origin;
    var c = el('div', 'ecard'), t = el('div', 'ec-t'), p = el('div', 'ec-b');
    if (e.kind === 'unreachable') {
      t.textContent = '🔌 Can\'t reach Ollama at ' + base;
      var ol = el('ol');
      var li1 = el('li', null, 'Make sure Ollama is running: '); li1.appendChild(code('ollama serve'));
      var li2 = el('li', null, 'Allow this page\'s origin. Ollama blocks browser pages unless OLLAMA_ORIGINS includes '); li2.appendChild(code(origin));
      li2.appendChild(el('div', 'ec-cmd', 'Linux / macOS (terminal): OLLAMA_ORIGINS="' + origin + '" ollama serve'));
      li2.appendChild(el('div', 'ec-cmd', 'macOS app: launchctl setenv OLLAMA_ORIGINS "' + origin + '"  then restart Ollama'));
      li2.appendChild(el('div', 'ec-cmd', 'Linux service: systemctl edit ollama  →  Environment="OLLAMA_ORIGINS=' + origin + '"  then restart'));
      li2.appendChild(el('div', 'ec-cmd', 'Windows: setx OLLAMA_ORIGINS "' + origin + '"  then quit and reopen Ollama'));
      var li3 = el('li', null, 'Check the Base URL in Settings ⚙. An https page can only reach http://localhost (not a LAN IP over http).');
      ol.append(li1, li2, li3); p.appendChild(ol);
    } else if (e.kind === 'empty') {
      t.textContent = '📦 Ollama has no models'; p.append('Pull one in a terminal, e.g. ', code('ollama pull llama3.2'), ' then tap ↻.');
    } else {
      t.textContent = '⚠️ Ollama error' + (e.status ? ' (' + e.status + ')' : ''); p.textContent = e.message || String(e);
    }
    var row = el('div', 'ec-row'), retry = el('button', 'hb wide', 'Retry'); retry.type = 'button';
    retry.onclick = function () { HR.model.load(); };
    var x = el('button', 'hb', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Dismiss'); x.onclick = function () { c.remove(); };
    row.append(retry, x); c.append(t, p, row); log.appendChild(c); log.scrollTop = log.scrollHeight;
  }
  function busy(on) { sendBtn.textContent = on ? '■' : '➤'; sendBtn.title = on ? 'Stop' : 'Send'; sendBtn.setAttribute('aria-label', on ? 'Stop' : 'Send'); sendBtn.classList.toggle('stop', on); }
  function send() {
    if (ctrl) { ctrl.abort(); return; }
    var text = input.value.trim(), model = HR.model.current();
    if (!text) return;
    if (!model) { HR.model.load(); return; }
    var h = log.querySelector('.hello'); if (h) h.remove();
    clearErrors(); input.value = ''; grow();
    var u = HR.msgs.add({ role: 'user', content: text }); bubble(u);
    var messages = HR.msgs.toApi(), think = HR.set.get('think'), base = HR.set.get('baseUrl');
    var a = { role: 'assistant', content: '', raw: '', thinkField: '', model: model };
    var view = bubble(a), pending = false, t0 = performance.now(), first = 0, chunks = 0;
    var step = HR.steps.add({ base: base, model: model, messages: messages.length, last: text, think: think });
    ctrl = new AbortController(); busy(true);
    function frame() { pending = false; if (first) a.stats = { tokens: chunks, tps: chunks / Math.max(.001, (performance.now() - first) / 1000), note: 'streaming' }; view.paint(true); bottom(); }
    HR.ollama.chat({ base: base, model: model, messages: messages, think: think === 'on' ? true : think === 'off' ? false : null, signal: ctrl.signal,
      onDelta: function (c, th) { if (!first) first = performance.now(); chunks++; a.raw += c; a.thinkField += th; if (!pending) { pending = true; requestAnimationFrame(frame); } } })
      .then(function (s) {
        var tps = HR.ollama.tps(s);
        a.stats = { tokens: s.eval_count || chunks, tps: tps || (first ? chunks / ((performance.now() - first) / 1000) : 0), sec: (performance.now() - t0) / 1000 };
        done('ok', { eval_count: s.eval_count, prompt_eval_count: s.prompt_eval_count, done_reason: s.done_reason, tps: a.stats.tps });
        if (document.hidden) HR.notify({ icon: '🧪', title: 'Harness', text: 'Reply ready from ' + model, onClick: function () { window.focus(); } });
      }, function (e) {
        var stop = e.kind === 'abort';
        a.stats = { tokens: chunks || 0, sec: (performance.now() - t0) / 1000, note: stop ? 'stopped' : 'failed' };
        if (!stop && !a.raw && !a.thinkField) a.error = e.message;
        done(stop ? 'stop' : 'err', { error: stop ? '' : e.message });
        if (!stop) { if (a.error) view.el.remove(); errorCard(e); HR.notify({ icon: '⚠️', title: 'Harness', text: e.kind === 'unreachable' ? 'Can\'t reach Ollama' : 'Ollama: ' + e.message }); }
      });
    function done(status, res) {
      ctrl = null; busy(false); view.paint(false); delete a.raw;
      res.chars = a.content.length; res.thinkChars = (a.thinking || '').length; step.finish(status, res);
      delete a.thinkField; HR.msgs.add(a); bottom(); input.focus();
    }
  }
  function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; }
  function clearChat() { if (ctrl) ctrl.abort(); HR.msgs.clear(); HR.steps.clear(); renderAll(); }
  function init() {
    log = document.getElementById('log'); input = document.getElementById('input'); sendBtn = document.getElementById('btnSend');
    sendBtn.onclick = send;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    input.addEventListener('input', grow);
    document.getElementById('btnClear').onclick = clearChat;
    renderAll();
  }
  return { init: init, errorCard: errorCard, clearErrors: clearErrors };
})();
