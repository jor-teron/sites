/* Harness — app/core/loop.js: the ONE agent loop (HR2).
   run(o): send history (+ tool schemas) to the model -> if it returns tool_calls, run each through HR.tools,
   append role 'tool' results -> repeat until a reply without tool calls, the step limit (o.maxSteps model calls), or Stop.
   o = {adapter (HR.models, HR6), cfg {provider, base, key}, model, think, signal, maxSteps, useTools, system() -> Promise<string|''>, ui}
   ui.modelStart(req) -> {delta(c,th), done(res) -> assistant msg, stopped() -> partial msg|null, fail(e, retrying)}
   ui.toolStart({name,args}) -> {done(ok, text, ms)}; ui.note(text); ui.approve(info) -> Promise<boolean>.
   'does not support tools' -> one retry without tools (noted). Resolves {status:'ok'|'stop'|'limit'}; other errors reject. */
HR.loop = (function () {
  var CAP = 20000;
  function parseArgs(a) { if (typeof a !== 'string') return a || {}; try { return JSON.parse(a); } catch (e) { return { _raw: a }; } }
  async function run(o) {
    var noTools = !o.useTools, calls = 0, retried = false;
    for (;;) {
      if (o.signal.aborted) return { status: 'stop' };
      if (calls >= o.maxSteps) { o.ui.note('Step limit reached (' + o.maxSteps + ' model calls). Raise it in Settings ⚙.'); return { status: 'limit' }; }
      calls++;
      var schemas = noTools ? [] : HR.tools.schemas();
      var sys = o.system ? await o.system() : '';
      var messages = (sys ? [{ role: 'system', content: sys }] : []).concat(HR.msgs.toApi());
      var lastUser = HR.msgs.all().filter(function (m) { return m.role === 'user'; }).pop();
      var view = o.ui.modelStart({ provider: o.adapter.label, base: o.cfg.base, model: o.model, messages: messages.length, last: lastUser ? lastUser.content : '', think: o.think,
        tools: schemas.map(function (s) { return s.function.name; }).join(', ') || 'none', step: calls });
      var res;
      try {
        res = await o.adapter.chat({ cfg: o.cfg, model: o.model, messages: messages, think: o.think === 'on' ? true : o.think === 'off' ? false : null,
          tools: schemas, signal: o.signal, onDelta: view.delta });
      } catch (e) {
        if (e.kind === 'abort') { var part = view.stopped(); if (part) HR.msgs.add(part); return { status: 'stop' }; }
        if (!retried && schemas.length && e.kind === 'http' && /(does not|doesn't) support tools|support tool use|tools? (use |calling )?(is |are )?not supported/i.test(e.message)) {
          view.fail(e, true); retried = true; noTools = true; calls--;
          o.ui.note('“' + o.model + '” does not support tools — retrying without tools.'); continue;
        }
        view.fail(e, false); throw e;
      }
      var msg = view.done(res); HR.msgs.add(msg);
      var tc = noTools ? [] : (res.tool_calls || []);
      if (!tc.length) return { status: 'ok' };
      for (var i = 0; i < tc.length; i++) {
        if (o.signal.aborted) return { status: 'stop' };
        var f = tc[i].function || {}, name = f.name || '?', args = parseArgs(f.arguments);
        var tv = o.ui.toolStart({ name: name, args: args }), t0 = performance.now(), ok = true, out;
        try { out = await HR.tools.run(name, args, { signal: o.signal, approve: o.ui.approve, note: o.ui.note }); }
        catch (err) { ok = false; out = 'Error: ' + (err && err.message || err); }
        var text = typeof out === 'string' ? out : JSON.stringify(out);
        if (text.length > CAP) text = text.slice(0, CAP) + '\n…[truncated at ' + CAP + ' chars]';
        var ms = performance.now() - t0;
        tv.done(ok, text, ms);
        HR.msgs.add({ role: 'tool', tool_name: name, tool_call_id: tc[i].id, args: args, content: text, ok: ok, ms: Math.round(ms) });
      }
    }
  }
  return { run: run };
})();
