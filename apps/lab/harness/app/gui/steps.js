/* Harness — app/gui/steps.js: steps pane. One row per model call (🧠) and per tool call (🔧), plus notes (ℹ).
   Tap a row to expand: model -> request (base, model, messages, tools offered, last user text, think) and response
   (chars, thinking, tokens, tok/s, tool calls, done reason, error); tool -> args, result preview, ms. Newest on top.
   Phone: pane is a sheet toggled by the ☰ button; big screens: side pane, ☰ collapses it. */
HR.steps = (function () {
  var host, count, n = 0, rows = 0;
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function kv(dl, k, v) { if (v == null || v === '') return; dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, String(v))); }
  function cut(s, n) { s = typeof s === 'string' ? s : JSON.stringify(s); return s.length > n ? s.slice(0, n) + '…' : s; }
  function row(icon, title, fill) {
    var s = { id: ++n, status: 'run', t0: performance.now(), res: {} };
    var r = el('div', 'st-row run'), head = el('button', 'st-head'), body = el('div', 'st-body'), stat = el('span', 'st-stat', 'running…');
    head.type = 'button'; head.setAttribute('aria-expanded', 'false'); body.hidden = true;
    head.append(el('span', 'st-n', '#' + s.id), el('span', 'st-name', icon + ' ' + title), stat); r.append(head, body);
    function draw() { body.innerHTML = ''; fill(body, s); }
    head.onclick = function () { body.hidden = !body.hidden; head.setAttribute('aria-expanded', String(!body.hidden)); if (!body.hidden) draw(); };
    s.finish = function (status, res) {
      s.status = status; s.ms = res && res.ms != null ? res.ms : performance.now() - s.t0; Object.assign(s.res, res || {});
      r.className = 'st-row ' + status;
      var sec = s.ms < 1000 ? Math.round(s.ms) + ' ms' : (s.ms / 1000).toFixed(1) + ' s';
      stat.textContent = (status === 'ok' ? '✓ ' : status === 'stop' ? '■ ' : '✕ ') + sec + (s.res.tps ? ' · ' + s.res.tps.toFixed(1) + ' tok/s' : '');
      if (!body.hidden) draw();
    };
    rows++; host.prepend(r); count.textContent = rows;
    var empty = host.querySelector('.st-empty'); if (empty) empty.remove();
    return s;
  }
  function model(req) {
    return row('🧠', req.model, function (body, s) {
      var a = el('dl', 'st-dl'), b = el('dl', 'st-dl'), r = s.res;
      kv(a, 'POST', req.base + '/api/chat'); kv(a, 'loop step', req.step); kv(a, 'messages', req.messages); kv(a, 'tools', req.tools);
      kv(a, 'last user', cut(req.last || '', 160)); kv(a, 'think', req.think);
      kv(b, 'status', s.status); kv(b, 'time', s.ms ? (s.ms / 1000).toFixed(2) + ' s' : '');
      kv(b, 'reply chars', r.chars); kv(b, 'thinking chars', r.thinkChars || ''); kv(b, 'tool calls', r.tool_calls);
      kv(b, 'tokens', r.eval_count); kv(b, 'prompt tokens', r.prompt_eval_count); kv(b, 'tok/s', r.tps ? r.tps.toFixed(1) : '');
      kv(b, 'done reason', r.done_reason); kv(b, 'error', r.error);
      body.append(el('div', 'st-sub', 'Request'), a, el('div', 'st-sub', 'Response'), b);
    });
  }
  function tool(c) {
    return row('🔧', c.name + ' ' + cut(c.args || {}, 40), function (body, s) {
      var a = el('dl', 'st-dl');
      kv(a, 'where', 'browser'); kv(a, 'args', cut(c.args || {}, 600)); kv(a, 'status', s.status);
      kv(a, 'time', s.ms != null ? Math.round(s.ms) + ' ms' : ''); kv(a, 'result', cut(s.res.result || '', 600));
      body.appendChild(a);
    });
  }
  function note(t) {
    var r = el('div', 'st-note', 'ℹ ' + t); host.prepend(r);
    var empty = host.querySelector('.st-empty'); if (empty) empty.remove();
  }
  function clear() { rows = 0; n = 0; host.innerHTML = '<p class="st-empty">Model and tool calls show here.</p>'; count.textContent = ''; }
  function init() {
    host = document.getElementById('stepList'); count = document.getElementById('stepCount');
    clear();
    var b = document.getElementById('btnSteps');
    b.onclick = function () { var on = !document.body.classList.contains('steps-off'); document.body.classList.toggle('steps-off', on);
      document.body.classList.toggle('steps-on', !on); b.setAttribute('aria-pressed', String(!on)); };
    document.getElementById('stepsClose').onclick = function () { document.body.classList.remove('steps-on'); document.body.classList.add('steps-off'); b.setAttribute('aria-pressed', 'false'); };
    var big = window.matchMedia('(min-width:960px)').matches;
    document.body.classList.add(big ? 'steps-on' : 'steps-off'); b.setAttribute('aria-pressed', String(big));
  }
  return { init: init, model: model, tool: tool, note: note, clear: clear };
})();
