/* Image Gen ↔ Ollama: model list and streamed image generation. Errors carry .kind for friendly dialogs:
   'unreachable' (network/CORS), 'disabled' (image gen switched off in this Ollama), 'noedit' (start image refused),
   'nomodel', 'noimage', 'http'. IG3: generate() sends `images: [b64]` when a start photo is given. */
window.IGOllama = (function () {
  const base = (u) => String(u || '').trim().replace(/\/+$/, '') || 'http://localhost:11434';
  const NOEDIT = /image edit|input image|invalid image|does not support (image|images|vision)|images? (are|is) not supported/i;
  function err(kind, msg, status) { const e = new Error(msg); e.kind = kind; e.status = status; return e; }
  async function call(url, opt) {
    let r;
    try { r = await fetch(url, opt); } catch (e) {
      if (e && e.name === 'AbortError') throw e;
      throw err('unreachable', 'Could not reach Ollama at ' + url);
    }
    if (!r.ok) {
      let msg = ''; try { const t = await r.text(); try { msg = JSON.parse(t).error || t; } catch (_) { msg = t; } } catch (_) { /* */ }
      msg = String(msg || r.statusText || 'HTTP ' + r.status);
      if (NOEDIT.test(msg)) throw err('noedit', msg, r.status);
      if (/not (currently )?supported/i.test(msg) && /image/i.test(msg)) throw err('disabled', msg, r.status);
      if (r.status === 404 && /model/i.test(msg)) throw err('nomodel', msg, r.status);
      throw err('http', 'HTTP ' + r.status + ': ' + msg, r.status);
    }
    return r;
  }
  const looksImage = (name) => /^x\/|z-image|flux|stable-?diffusion|sdxl|image/i.test(name);
  /* -> [{name, image:true|false|null}], image models first */
  async function models(u, signal) {
    const r = await call(base(u) + '/api/tags', { signal });
    const j = await r.json(), list = (j.models || []).map((m) => ({ name: m.name || m.model, caps: m.capabilities || null }));
    /* /api/tags may not list capabilities; ask /api/show (best effort, small lists only) */
    if (list.length && list.length <= 30 && list.some((m) => !m.caps)) {
      await Promise.all(list.filter((m) => !m.caps).map(async (m) => {
        try { const s = await fetch(base(u) + '/api/show', { method: 'POST', body: JSON.stringify({ model: m.name }), signal }); if (s.ok) m.caps = (await s.json()).capabilities || null; } catch (_) { /* */ }
      }));
    }
    list.forEach((m) => { m.image = m.caps ? m.caps.includes('image') : (looksImage(m.name) ? null : false); });
    const rank = (m) => (m.image === true ? 0 : m.image === null ? 1 : 2);
    return list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }
  /* streams NDJSON; onProgress(completed, total); resolves {b64, info} */
  async function generate(o) {
    const req = { model: o.model, prompt: o.prompt, width: o.width, height: o.height, steps: o.steps, stream: true };
    if (o.images && o.images.length) req.images = o.images;
    const r = await call(base(o.url) + '/api/generate', {
      method: 'POST', signal: o.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req),
    });
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', img = null, last = null;
    const line = (s) => {
      s = s.trim(); if (!s) return;
      let j; try { j = JSON.parse(s); } catch (_) { return; }
      last = j;
      if (j.error) { const m = String(j.error); if (NOEDIT.test(m)) throw err('noedit', m); throw err(/not (currently )?supported/i.test(m) && /image/i.test(m) ? 'disabled' : 'http', m); }
      if (j.total) o.onProgress && o.onProgress(j.completed || 0, j.total);
      const b = j.image || (j.images && j.images[0]);
      if (b) img = b;
    };
    for (;;) {
      const { value, done } = await rd.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); }
    }
    line(buf + dec.decode());
    if (!img) throw err('noimage', last && last.response ? 'The model replied with text, not an image. Pick an image model.' : 'Ollama finished without returning an image.');
    return { b64: String(img).replace(/^data:image\/\w+;base64,/, ''), info: last };
  }
  function b64ToBlob(b64) {
    const bin = atob(b64), a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: 'image/png' });
  }
  return { base, models, generate, b64ToBlob };
})();
