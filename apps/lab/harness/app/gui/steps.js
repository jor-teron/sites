/* Harness — app/gui/steps.js: steps pane. Each model call is one row: #, model, status, time, tok/s.
   Tap a row to expand the request summary (base, model, messages, last user text, think) and the response summary
   (chars, thinking chars, tokens, prompt tokens, done reason, error). Rows live in memory for this page.
   Phone: pane is a sheet toggled by the Steps button; big screens: side pane, button collapses it. */
HR.steps = (function () {
  var host, count, n = 0, rows = [];
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function kv(dl, k, v) { if (v == null || v === '') return; dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, String(v))); }
  function add(req) {
    var s = { id: ++n, req: req, status: 'run', t0: performance.now(), res: {} };
    var row = el('div', 'st-row run'), head = el('button', 'st-head'), body = el('div', 'st-body');
    head.type = 'button'; head.setAttribute('aria-expanded', 'false');
    var num = el('span', 'st-n', '#' + s.id), name = el('span', 'st-name', '🧠 ' + req.model), stat = el('span', 'st-stat', 'running…');
    head.append(num, name, stat); row.append(head, body); body.hidden = true;
    head.onclick = function () { body.hidden = !body.hidden; head.setAttribute('aria-expanded', String(!body.hidden)); if (!body.hidden) fill(); };
    function fill() {
      body.innerHTML = '';
      var a = el('dl', 'st-dl'), b = el('dl', 'st-dl');
      kv(a, 'POST', req.base + '/api/chat'); kv(a, 'model', req.model); kv(a, 'messages', req.messages);
      kv(a, 'last user', req.last.length > 160 ? req.last.slice(0, 160) + '…' : req.last); kv(a, 'think', req.think);
      var r = s.res;
      kv(b, 'status', s.status); kv(b, 'time', s.ms ? (s.ms / 1000).toFixed(2) + ' s' : '');
      kv(b, 'reply chars', r.chars); kv(b, 'thinking chars', r.thinkChars || '');
      kv(b, 'tokens', r.eval_count); kv(b, 'prompt tokens', r.prompt_eval_count); kv(b, 'tok/s', r.tps ? r.tps.toFixed(1) : '');
      kv(b, 'done reason', r.done_reason); kv(b, 'error', r.error);
      body.append(el('div', 'st-sub', 'Request'), a, el('div', 'st-sub', 'Response'), b);
    }
    s.update = function (res) { Object.assign(s.res, res); if (!body.hidden) fill(); };
    s.finish = function (status, res) {
      s.status = status; s.ms = performance.now() - s.t0; Object.assign(s.res, res || {});
      row.className = 'st-row ' + status;
      stat.textContent = (status === 'ok' ? '✓ ' : status === 'stop' ? '■ ' : '✕ ') + (s.ms / 1000).toFixed(1) + ' s' + (s.res.tps ? ' · ' + s.res.tps.toFixed(1) + ' tok/s' : '');
      if (!body.hidden) fill();
    };
    rows.push(s); host.prepend(row); count.textContent = rows.length;
    var empty = host.querySelector('.st-empty'); if (empty) empty.remove();
    return s;
  }
  function clear() { rows = []; n = 0; host.innerHTML = '<p class="st-empty">Model calls show here.</p>'; count.textContent = ''; }
  function init() {
    host = document.getElementById('stepList'); count = document.getElementById('stepCount');
    clear();
    var b = document.getElementById('btnSteps');
    b.onclick = function () { var on = !document.body.classList.contains('steps-off'); document.body.classList.toggle('steps-off', on);
      document.body.classList.toggle('steps-on', !on); b.setAttribute('aria-pressed', String(!on)); };
    document.getElementById('stepsClose').onclick = function () { document.body.classList.remove('steps-on'); document.body.classList.add('steps-off'); b.setAttribute('aria-pressed', 'false'); };
    /* phone starts closed, big screens open */
    var big = window.matchMedia('(min-width:960px)').matches;
    document.body.classList.add(big ? 'steps-on' : 'steps-off'); b.setAttribute('aria-pressed', String(big));
  }
  return { init: init, add: add, clear: clear };
})();
