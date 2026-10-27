/* Harness — app/gui/chat.js: input, Send / Stop, and the UI side of the agent loop (HR2).
   send() adds the user message and runs HR.loop with hooks that draw assistant bubbles (rAF-throttled streaming),
   tool chips, notes and step rows. Stop aborts the in-flight model call and halts the loop. Errors -> HR.view.errorCard.
   HR4: system prompt from HR.prompt.system() on every call; user / assistant / tool lines go to HR.logs (daily Markdown). */
HR.chat = (function () {
  var log, input, sendBtn, ctrl = null;
  function busy(on) { sendBtn.textContent = on ? '■' : '➤'; sendBtn.title = on ? 'Stop' : 'Send'; sendBtn.setAttribute('aria-label', on ? 'Stop' : 'Send'); sendBtn.classList.toggle('stop', on); }
  function renderAll() {
    log.innerHTML = ''; var l = HR.msgs.all(); if (!l.length) HR.view.hello();
    l.forEach(function (m) { if (m.error) return; if (m.role === 'tool') HR.view.tool(m); else HR.view.bubble(m); });
    log.scrollTop = log.scrollHeight;
  }
  function modelStart(req) {
    var a = { role: 'assistant', content: '', raw: '', thinkField: '', model: req.model }, view = HR.view.bubble(a), step = HR.steps.model(req);
    var pending = false, t0 = performance.now(), first = 0, chunks = 0;
    function frame() { pending = false; if (first) a.stats = { tokens: chunks, tps: chunks / Math.max(.001, (performance.now() - first) / 1000), note: 'streaming' }; view.paint(true); HR.view.bottom(); }
    function close(status, res) {
      view.paint(false); delete a.raw; delete a.thinkField;
      res.chars = a.content.length; res.thinkChars = (a.thinking || '').length; step.finish(status, res);
    }
    return {
      delta: function (c, th) { if (!first) first = performance.now(); chunks++; a.raw += c; a.thinkField += th; if (!pending) { pending = true; requestAnimationFrame(frame); } },
      done: function (s) {
        var tps = HR.ollama.tps(s); a.tool_calls = (s.tool_calls || []).length ? s.tool_calls : undefined;
        a.stats = { tokens: s.eval_count || chunks, tps: tps || (first ? chunks / Math.max(.001, (performance.now() - first) / 1000) : 0), sec: (performance.now() - t0) / 1000 };
        HR.logs.assistant(a);
        close('ok', { eval_count: s.eval_count, prompt_eval_count: s.prompt_eval_count, done_reason: s.done_reason, tps: a.stats.tps, tool_calls: a.tool_calls ? a.tool_calls.length : '' });
        return a;
      },
      stopped: function () { a.stats = { tokens: chunks, sec: (performance.now() - t0) / 1000, note: 'stopped' }; close('stop', {}); HR.logs.assistant(a, 'stopped'); if (a.content || a.thinking) return a; view.el.remove(); return null; },
      fail: function (e, retrying) { view.el.remove(); close(retrying ? 'stop' : 'err', { error: e.message + (retrying ? ' → retry without tools' : '') }); }
    };
  }
  function toolStart(c) {
    var m = { role: 'tool', tool_name: c.name, args: c.args }, chip = HR.view.tool(m), step = HR.steps.tool(c);
    return { done: function (ok, text, ms) { chip.done(ok, text, ms); HR.logs.tool(c.name, c.args, ok, text, ms); step.finish(ok ? 'ok' : 'err', { result: text, ms: ms }); } };
  }
  function note(t) { HR.view.note(t); HR.steps.note(t); HR.logs.note(t); }
  /* approve(info) is filled in by HR3 (app/gui/approve.js); default denies */
  function approve(info) { return HR.approve ? HR.approve(info, ctrl && ctrl.signal) : Promise.resolve(false); }
  function send() {
    if (ctrl) { ctrl.abort(); return; }
    var text = input.value.trim(), model = HR.model.current();
    if (!text) return;
    if (!model) { HR.model.load(); return; }
    var h = log.querySelector('.hello'); if (h) h.remove();
    HR.view.clearErrors(); input.value = ''; grow();
    var u = HR.msgs.add({ role: 'user', content: text }); HR.view.bubble(u); HR.logs.user(text);
    ctrl = new AbortController(); busy(true);
    var opts = { adapter: HR.models.current(), cfg: HR.models.cfg(), model: model, think: HR.set.get('think'), signal: ctrl.signal, maxSteps: HR.set.maxSteps(), useTools: HR.set.get('tools') !== 'off',
      system: HR.prompt.system, ui: { modelStart: modelStart, toolStart: toolStart, note: note, approve: approve } };
    HR.loop.run(opts).then(function (r) {
      if (r.status === 'stop') note('■ Stopped.');
      if (document.hidden && r.status !== 'stop') HR.notify({ icon: '🧪', title: 'Harness', text: 'Reply ready from ' + model, onClick: function () { window.focus(); } });
      return r;
    }, function (e) {
      HR.view.errorCard(e);
      HR.notify({ icon: '⚠️', title: 'Harness', text: (opts.adapter.label) + ': ' + (e.kind === 'unreachable' ? 'can\'t reach ' + opts.cfg.base : e.message) });
    }).then(function () { ctrl = null; busy(false); HR.msgs.save(); input.focus(); });
  }
  function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; }
  function clearChat() { if (ctrl) ctrl.abort(); HR.msgs.clear(); HR.steps.clear(); renderAll(); }
  function init() {
    log = document.getElementById('log'); input = document.getElementById('input'); sendBtn = document.getElementById('btnSend');
    HR.view.init(log);
    sendBtn.onclick = send;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    input.addEventListener('input', grow);
    document.getElementById('btnClear').onclick = clearChat;
    renderAll();
    HR.fs.onChange(HR.view.folderHint);
  }
  return { init: init, note: note, errorCard: function (e) { HR.view.errorCard(e); }, clearErrors: function () { HR.view.clearErrors(); }, busy: function () { return !!ctrl; } };
})();
