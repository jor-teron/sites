/* Vision ↔ Ollama: model list and streamed /api/chat with images. Errors carry .kind:
   'unreachable' (network/CORS), 'nomodel', 'novision' (model can't take images), 'blind' (answered as if no image), 'empty', 'http'. */
window.VSOllama = (function () {
  const base = (u) => String(u || '').trim().replace(/\/+$/, '') || 'http://localhost:11434';
  function err(kind, msg, status) { const e = new Error(msg); e.kind = kind; e.status = status; return e; }
  const visErr = (m) => /image|vision|multimodal/i.test(m) && /support|capab/i.test(m);
  async function call(url, opt) {
    let r;
    try { r = await fetch(url, opt); } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw err('unreachable', 'Could not reach Ollama at ' + url);
    }
    if (!r.ok) {
      let msg = ''; try { const t = await r.text(); try { msg = JSON.parse(t).error || t; } catch (_) { msg = t; } } catch (_) { /* */ }
      msg = String(msg || r.statusText || 'HTTP ' + r.status);
      if (visErr(msg)) throw err('novision', msg, r.status);
      if (r.status === 404 && /model/i.test(msg)) throw err('nomodel', msg, r.status);
      throw err('http', 'HTTP ' + r.status + ': ' + msg, r.status);
    }
    return r;
  }
  const looksVision = (n) => /llava|vision|qwen2\.?5-?vl|qwen-?vl|gemma3|minicpm-v|moondream|bakllava|llama4|mistral-small3/i.test(n);
  /* -> [{name, vision:true|false|null}] (null = guessed from the name), vision first */
  async function models(u, signal) {
    const r = await call(base(u) + '/api/tags', { signal });
    const j = await r.json(), list = (j.models || []).map((m) => ({ name: m.name || m.model, caps: m.capabilities || null }));
    if (list.length && list.length <= 30 && list.some((m) => !m.caps)) {
      await Promise.all(list.filter((m) => !m.caps).map(async (m) => {
        try { const s = await fetch(base(u) + '/api/show', { method: 'POST', body: JSON.stringify({ model: m.name }), signal }); if (s.ok) m.caps = (await s.json()).capabilities || null; } catch (_) { /* */ }
      }));
    }
    list.forEach((m) => { m.vision = m.caps ? m.caps.includes('vision') : (looksVision(m.name) ? null : false); });
    const rank = (m) => (m.vision === true ? 0 : m.vision === null ? 1 : 2);
    return list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }
  const BLIND = /(can(no|')t|unable to|don'?t|do not) (see|view|access|process|look at)[^.]{0,30}(image|photo|picture)|no (image|photo|picture) (was |has been )?(provided|attached|shared|included)|(provide|share|upload|attach) (an|the) (image|photo|picture)/i;
  /* streams one assistant reply; onText(chunk, all); resolves the full text */
  async function chat(o) {
    const r = await call(base(o.url) + '/api/chat', {
      method: 'POST', signal: o.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: o.model, messages: o.messages, stream: true }),
    });
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', text = '';
    const line = (s) => {
      s = s.trim(); if (!s) return;
      let j; try { j = JSON.parse(s); } catch (_) { return; }
      if (j.error) { const m = String(j.error); throw err(visErr(m) ? 'novision' : 'http', m); }
      const c = j.message && j.message.content;
      if (c) { text += c; o.onText && o.onText(c, text); }
    };
    for (;;) {
      const { value, done } = await rd.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
    line(buf + dec.decode());
    text = text.trim();
    if (!text) throw err('empty', 'The model returned no text.');
    if (o.first && BLIND.test(text.slice(0, 300))) { const e = err('blind', text.slice(0, 200)); e.text = text; throw e; }
    return text;
  }
  return { base, models, chat };
})();
