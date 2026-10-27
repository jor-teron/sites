/* Harness — app/gui/bubbles.js: chat views (HR.view). bubble(m) -> {paint(live), el} for user / assistant messages:
   plain text with ``` code blocks, folded Thinking box (<think>…</think> or Ollama 'thinking'), stats line, tool-call chips.
   tool(m) -> {done(ok,text,ms)}: folded 🔧 chip with args + result preview. note(text), hello() (+ folder hint, HR4), errorCard(e) (Ollama help; HR6 online provider key / URL errors). */
HR.view = (function () {
  var log;
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function rich(box, text) {
    box.innerHTML = '';
    String(text || '').split(/```/).forEach(function (part, i) {
      if (i % 2) { var nl = part.indexOf('\n'), pre = el('pre', 'code'); pre.appendChild(el('code', null, nl >= 0 ? part.slice(nl + 1) : part)); box.appendChild(pre); }
      else if (part) box.appendChild(el('div', 'txt', part));
    });
  }
  function bottom(force) { if (force || log.scrollHeight - log.scrollTop - log.clientHeight < 140) log.scrollTop = log.scrollHeight; }
  function short(v, n) { var s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + '…' : s; }
  function bubble(m) {
    var b = el('div', 'msg ' + m.role), think = el('details', 'think'), sum = el('summary', null, 'Thinking'),
      tb = el('div', 'think-body'), body = el('div', 'body'), calls = el('div', 'calls'), stat = el('div', 'stat');
    think.append(sum, tb); think.hidden = true;
    if (m.role === 'assistant') b.append(think);
    b.append(body, calls, stat); log.appendChild(b);
    function paint(live) {
      var sp = HR.msgs.splitThink(m.raw != null ? m.raw : m.content);
      var th = [m.thinkField != null ? m.thinkField : (m.raw == null ? m.thinking : ''), sp.thinking].filter(Boolean).join('\n');
      if (m.role === 'assistant') { m.content = sp.content; m.thinking = th; }
      var thinkingNow = !!live && (sp.open || (!!m.thinkField && !sp.content));
      think.hidden = !th; tb.textContent = th; think.classList.toggle('live', thinkingNow);
      sum.textContent = thinkingNow ? 'Thinking…' : 'Thinking · ' + th.length + ' chars';
      var tc = m.tool_calls || [];
      rich(body, m.content || (live || tc.length ? '' : '(empty reply)'));
      if (live && !m.content && !th) body.appendChild(el('span', 'dots', '•••'));
      calls.innerHTML = ''; tc.forEach(function (c) { var f = c.function || {}; calls.appendChild(el('span', 'call', '🔧 ' + f.name + '(' + short(f.arguments || {}, 60) + ')')); });
      var s = m.stats; stat.textContent = s ? [s.tokens ? s.tokens + ' tokens' : '', s.tps ? s.tps.toFixed(1) + ' tok/s' : '', s.sec ? s.sec.toFixed(1) + ' s' : '', s.note || ''].filter(Boolean).join(' · ') : '';
      stat.hidden = !stat.textContent;
    }
    paint(false); bottom(m.role === 'user');
    return { paint: paint, el: b };
  }
  function tool(m) {
    var d = el('details', 'tool run'), s = el('summary', null, '🔧 ' + m.tool_name + ' · running…'), pre = el('pre', 'tool-body');
    d.append(s, pre); log.appendChild(d);
    function done(ok, text, ms) {
      d.className = 'tool ' + (ok ? 'ok' : 'err');
      s.textContent = '🔧 ' + m.tool_name + ' ' + (ok ? '✓' : '✕') + ' · ' + Math.round(ms) + ' ms · ' + short(text.replace(/\s+/g, ' '), 70);
      pre.textContent = 'args: ' + JSON.stringify(m.args || {}) + '\n\n' + short(text, 2000);
      bottom();
    }
    if (m.content != null && m.ok != null) done(m.ok, m.content, m.ms || 0);
    bottom();
    return { done: done };
  }
  function note(text) { log.appendChild(el('div', 'note', text)); bottom(); }
  function hello() {
    var h = el('div', 'hello');
    h.append(el('div', 'hello-ico', '🧪'), el('div', 'hello-t', 'Harness'), el('div', 'hello-s', 'Chat with a local Ollama model. It can call tools; every model and tool call shows in Steps.'));
    h.appendChild(el('div', 'hello-f')); log.appendChild(h); folderHint();
  }
  function folderHint() {
    var f = log.querySelector('.hello-f'), s = HR.fs.state(); if (!f) return;
    f.textContent = s === 'ready' ? '📁 ' + HR.fs.name() + ': chats saved to harness/chats/, memory in harness/memory.md, system prompt in harness/prompts/system.md.'
      : s === 'unsupported' ? 'History stays in this tab. Folder logs and memory need desktop Chrome or Edge.'
      : 'No folder: history stays in this tab only. Pick a folder (📁) to save daily chat logs, memory notes and an editable system prompt.';
  }
  function clearErrors() { [].forEach.call(log.querySelectorAll('.ecard'), function (c) { c.remove(); }); }
  function code(t) { return el('code', null, t); }
  function errorCard(e) {
    clearErrors(); var h = log.querySelector('.hello'); if (h) h.remove();
    var base = HR.set.get('baseUrl'), origin = location.origin === 'null' ? '*' : location.origin;
    var c = el('div', 'ecard'), t = el('div', 'ec-t'), p = el('div', 'ec-b');
    var prov = HR.models.id(), lab = HR.models.current().label;
    if (prov !== 'ollama' && e.kind !== 'abort') {
      var cb = HR.models.base();
      if (e.kind === 'nokey') { t.textContent = '🔑 ' + lab + ' needs an API key'; p.textContent = 'Add it in Settings ⚙ → Provider. It is stored only in this browser on this device.'; }
      else if (e.kind === 'unreachable') { t.textContent = '🔌 Can\'t reach ' + cb; p.textContent = 'Check the base URL and your connection. The provider must allow browser (CORS) requests; OpenAI, Groq, OpenRouter and Gemini do. ' + (e.message || ''); }
      else if (e.kind === 'empty') { t.textContent = '📦 No models listed'; p.textContent = 'Type a model name in Settings ⚙ → Provider.'; }
      else { t.textContent = (e.status === 401 || e.status === 403 ? '🔑 API key rejected' : '⚠️ ' + lab + ' error') + (e.status ? ' (' + e.status + ')' : ''); p.textContent = e.message || String(e); }
    } else if (e.kind === 'unreachable') {
      t.textContent = '🔌 Can\'t reach Ollama at ' + base;
      var ol = el('ol'), li1 = el('li', null, 'Make sure Ollama is running: '), li2 = el('li', null, 'Allow this page\'s origin. Ollama blocks browser pages unless OLLAMA_ORIGINS includes ');
      li1.appendChild(code('ollama serve')); li2.appendChild(code(origin));
      ['Linux / macOS (terminal): OLLAMA_ORIGINS="' + origin + '" ollama serve', 'macOS app: launchctl setenv OLLAMA_ORIGINS "' + origin + '"  then restart Ollama',
        'Linux service: systemctl edit ollama  →  Environment="OLLAMA_ORIGINS=' + origin + '"  then restart', 'Windows: setx OLLAMA_ORIGINS "' + origin + '"  then quit and reopen Ollama']
        .forEach(function (x) { li2.appendChild(el('div', 'ec-cmd', x)); });
      ol.append(li1, li2, el('li', null, 'Check the Base URL in Settings ⚙. An https page can only reach http://localhost (not a LAN IP over http).')); p.appendChild(ol);
    } else if (e.kind === 'empty') { t.textContent = '📦 Ollama has no models'; p.append('Pull one in a terminal, e.g. ', code('ollama pull qwen3:4b'), ' then tap ↻.'); }
    else { t.textContent = '⚠️ Ollama error' + (e.status ? ' (' + e.status + ')' : ''); p.textContent = e.message || String(e); }
    var row = el('div', 'ec-row'), retry = el('button', 'hb wide', 'Retry'), x = el('button', 'hb', '✕');
    retry.type = x.type = 'button'; retry.onclick = function () { HR.model.load(); };
    x.setAttribute('aria-label', 'Dismiss'); x.onclick = function () { c.remove(); };
    row.append(retry, x); c.append(t, p, row); log.appendChild(c); bottom(true);
  }
  function init(l) { log = l; }
  return { init: init, el: el, bubble: bubble, tool: tool, note: note, hello: hello, folderHint: folderHint, errorCard: errorCard, clearErrors: clearErrors, bottom: bottom };
})();
