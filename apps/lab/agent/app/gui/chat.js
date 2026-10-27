/* Agent — app/gui/chat.js: input, Send / Stop, and the UI side of the agent loop (HR2).
   send() adds the user message and runs HR.loop with hooks that draw assistant bubbles (rAF-throttled streaming),
   tool chips, notes and step rows. Stop aborts the in-flight model call and halts the loop. Errors -> HR.view.errorCard.
   HR4: system prompt from HR.prompt.system() on every call; user / assistant / tool lines go to HR.logs (daily Markdown).
   AG2: Browser provider (story model) -> tools, loop and system prompt off, one quiet note in Steps only; an unreachable
   provider mid-chat -> HR.model.fall() switches to Browser; 'download' errors show the download card.
   AG3: auto-approve (HR.perms.auto) skips the card, sets info.auto and marks the step / chip / log 'auto';
   one Hub card when a run that took >20 s finishes (Settings → Hub card, default on).
   AG4: render() redraws the open chat (HR.chats switches chats; ＋ / New chat lives in app/gui/chats.js).
   AG5: retry(m) drops the last reply (and its tool steps) and re-runs; resend(m, text) edits a user message, drops
   everything after it and re-runs (both via run()); token counts land on the reply as usage {p, o}; HR.meter updates. */
HR.chat = (function () {
  var log, input, sendBtn, ctrl = null, curTool = null, LONG = 20000;
  function busy(on) { sendBtn.textContent = on ? '■' : '➤'; sendBtn.title = on ? 'Stop' : 'Send'; sendBtn.setAttribute('aria-label', on ? 'Stop' : 'Send'); sendBtn.classList.toggle('stop', on); }
  function renderAll() {
    log.innerHTML = ''; var l = HR.msgs.all(); if (!l.length) HR.view.hello();
    l.forEach(function (m) { if (m.error) return; if (m.role === 'tool') HR.view.tool(m); else HR.view.bubble(m); });
    log.scrollTop = log.scrollHeight; if (HR.meter) HR.meter.update();
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
        if (s.prompt_eval_count) a.usage = { p: s.prompt_eval_count, o: s.eval_count || 0 };
        HR.logs.assistant(a); setTimeout(HR.meter.update, 0);
        close('ok', { eval_count: s.eval_count, prompt_eval_count: s.prompt_eval_count, done_reason: s.done_reason, tps: a.stats.tps, tool_calls: a.tool_calls ? a.tool_calls.length : '' });
        return a;
      },
      stopped: function () { a.stats = { tokens: chunks, sec: (performance.now() - t0) / 1000, note: 'stopped' }; close('stop', {}); HR.logs.assistant(a, 'stopped'); if (a.content || a.thinking) return a; view.el.remove(); return null; },
      fail: function (e, retrying) { view.el.remove(); close(retrying ? 'stop' : 'err', { error: e.message + (retrying ? ' → retry without tools' : '') }); }
    };
  }
  function toolStart(c) {
    var m = { role: 'tool', tool_name: c.name, args: c.args }, chip = HR.view.tool(m), step = HR.steps.tool(c), t = curTool = { auto: false };
    return { done: function (ok, text, ms) {
      if (curTool === t) curTool = null;
      chip.done(ok, text, ms, t.auto); HR.logs.tool(c.name, c.args, ok, text, ms, t.auto); step.finish(ok ? 'ok' : 'err', { result: text, ms: ms, auto: t.auto }); } };
  }
  function note(t) { HR.view.note(t); HR.steps.note(t); HR.logs.note(t); }
  /* approve(info) is filled in by HR3 (app/gui/approve.js); default denies */
  function approve(info) {
    if (HR.perms.auto(info.kind)) { info.auto = true; if (curTool) curTool.auto = true; return Promise.resolve(true); }
    return HR.approve ? HR.approve(info, ctrl && ctrl.signal) : Promise.resolve(false);
  }
  function send() {
    if (ctrl) { ctrl.abort(); return; }
    var text = input.value.trim();
    if (!text) return;
    if (!HR.model.current()) { HR.model.load(); return; }
    var h = log.querySelector('.hello'); if (h) h.remove();
    input.value = ''; grow();
    var u = HR.msgs.add({ role: 'user', content: text }); HR.view.bubble(u); HR.logs.user(text);
    run();
  }
  /* AG5: re-run from a user message: retry (drop the reply after it) or edit (new text) */
  function from(m, text, label) {
    if (ctrl || !HR.model.current()) { if (!ctrl) HR.model.load(); return; }
    var l = HR.msgs.all(), i = l.indexOf(m); if (i < 0 || m.role !== 'user') return;
    if (text != null) m.content = text;
    HR.msgs.truncate(i + 1); renderAll(); HR.steps.note(label); HR.logs.note(label); if (text != null) HR.logs.user(text);
    run();
  }
  function retry(a) {
    var l = HR.msgs.all(), i = l.indexOf(a); while (i >= 0 && l[i].role !== 'user') i--;
    if (i >= 0) from(l[i], null, '↻ Retry: last reply dropped');
  }
  function resend(m, text) { text = String(text || '').trim(); if (text) from(m, text, '✎ Edited message: later turns dropped'); }
  function run() {
    var model = HR.model.current();
    HR.view.clearErrors();
    ctrl = new AbortController(); busy(true);
    var opts = { adapter: HR.models.current(), cfg: HR.models.cfg(), model: model, think: HR.set.get('think'), signal: ctrl.signal, maxSteps: HR.set.maxSteps(), useTools: HR.set.get('tools') !== 'off',
      system: function () { return HR.prompt.system().then(function (t) { HR.meter.sys = (t || '').length; return t; }); }, ui: { modelStart: modelStart, toolStart: toolStart, note: note, approve: approve } };
    if (opts.adapter.id === 'browser') { opts.useTools = false; opts.maxSteps = 1; opts.system = null; HR.meter.sys = 0; HR.steps.note('Browser model: tools and the loop are off (story model); it continues your text as a story.'); }
    var t0 = Date.now();
    HR.loop.run(opts).then(function (r) {
      var sec = (Date.now() - t0) / 1000;
      if (r.status === 'stop') note('■ Stopped.');
      else if (sec * 1000 > LONG && HR.set.get('notifyLong') !== 'off') HR.notify({ icon: '🧪', title: 'Agent', text: 'Finished in ' + Math.round(sec) + ' s · ' + model, onClick: function () { window.focus(); } });
      return r;
    }, function (e) {
      if (e.kind === 'download') { HR.view.errorCard(e); return; }
      if (HR.model.fall(e)) return;
      HR.view.errorCard(e);
      HR.notify({ icon: '⚠️', title: 'Agent', text: (opts.adapter.label) + ': ' + (e.kind === 'unreachable' ? 'can\'t reach ' + opts.cfg.base : e.message) });
    }).then(function () { ctrl = null; busy(false); HR.msgs.save(); HR.meter.update(); input.focus(); });
  }
  function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 180) + 'px'; }
  function init() {
    log = document.getElementById('log'); input = document.getElementById('input'); sendBtn = document.getElementById('btnSend');
    HR.view.init(log);
    sendBtn.onclick = send;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
    input.addEventListener('input', grow);
    renderAll();
    HR.fs.onChange(HR.view.folderHint);
  }
  return { init: init, render: renderAll, retry: retry, resend: resend, note: note, errorCard: function (e) { HR.view.errorCard(e); }, clearErrors: function () { HR.view.clearErrors(); }, busy: function () { return !!ctrl; } };
})();
