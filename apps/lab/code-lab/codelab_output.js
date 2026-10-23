/* Code Lab — output rendering (CL4). Plain script, no build; exposes window.CodeLabOutput.
   A cell is { outputs: [...nbformat-like outputs], outEl: <div class=out> }. The app calls init/reset/add/forget; this file owns the DOM.
   - stream text is processed like a terminal (\r overwrites the current line, \b erases one char), only ever on the LAST line,
     so a long run is appended incrementally and never re-processed;
   - display_data / update_display_data with the same display_id update the existing output in place;
   - per cell at most ~2000 lines / ~200 KB of stream text are in the DOM; "Show more" reveals more in chunks, "Show all" the rest.
     At most 5 MB of stream text per cell is kept in memory (the rest is discarded and said so). Saved text is capped at 200 KB per stream;
   - text/html is untrusted: shown in an iframe with an EMPTY sandbox (no scripts, no same-origin, no forms, no top navigation). */
(function () {
  'use strict';
  const LIM_LINES = 2000, LIM_CHARS = 200000, MORE_LINES = 2000, MORE_CHARS = 200000, HARD_CHARS = 5000000, SAVE_CHARS = 200000, LINE_MAX = 200000;
  const PART_LINES = 256, PART_CHARS = 32768; /* settled text is stored in small parts so "Show more" can reveal it in chunks */
  const ST = new WeakMap();   /* stream output -> its text state (not enumerable, never saved) */
  const NODE = new WeakMap(); /* output -> its DOM node */
  const displays = new Map(); /* display_id -> [{ c, o }] (any cell: update_display_data may target an earlier cell) */

  const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
  const txt = (s) => (Array.isArray(s) ? s.join('') : String(s == null ? '' : s)).replace(ANSI, '');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* ---------- HTML (sandboxed iframe, as in CL2) ---------- */
  function htmlDoc(h) {
    const dark = document.documentElement.classList.contains('dark');
    const fg = dark ? '#eef0f3' : '#15181d', bg = dark ? '#1c1f24' : '#ffffff', line = dark ? '#2b3037' : '#e3e6ea', link = dark ? '#60a5fa' : '#2563eb';
    return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: https:; style-src \'unsafe-inline\'; font-src data:">' +
      '<base target="_blank"><meta name="color-scheme" content="' + (dark ? 'dark' : 'light') + '">' +
      '<style>html,body{margin:0;background:' + bg + ';color:' + fg + ';font:13px/1.4 system-ui,sans-serif}body{padding:2px 4px}' +
      'table{border-collapse:collapse}td,th{border:1px solid ' + line + ';padding:2px 6px}a{color:' + link + '}img{max-width:100%}</style></head><body>' + h + '</body></html>';
  }
  function estHeight(h) {
    let n = 1;
    try {
      const d = new DOMParser().parseFromString(h, 'text/html'); /* inert: no scripts run, nothing is fetched */
      d.querySelectorAll('script,style').forEach((e) => e.remove());
      n = d.querySelectorAll('tr,li,p,br,div,pre,h1,h2,h3,h4,h5,h6').length + Math.ceil((d.body.textContent || '').trim().length / 60);
      if (d.querySelector('img,svg')) n += 8;
    } catch (_) { /* default */ }
    return Math.min(480, Math.max(40, n * 19 + 10));
  }
  function htmlFrame(h) {
    const f = document.createElement('iframe');
    f.className = 'html'; f.setAttribute('sandbox', 'allow-popups'); f.setAttribute('referrerpolicy', 'no-referrer'); /* no scripts, no same-origin */
    f.title = 'HTML output'; f.loading = 'eager'; f._raw = h; f.style.height = estHeight(h) + 'px'; f.srcdoc = htmlDoc(h);
    return f;
  }
  function refreshFrames() { document.querySelectorAll('iframe.html').forEach((f) => { f.srcdoc = htmlDoc(f._raw || ''); }); } /* frames follow the theme */

  /* ---------- stream text (terminal-like, incremental) ---------- */
  function newStream(name) {
    const o = { output_type: 'stream', name: name === 'stderr' ? 'stderr' : 'stdout' };
    const s = { parts: [], len: 0, line: '', cur: 0, pi: 0, pre: null, done: null, ln: null, cache: null };
    ST.set(o, s);
    /* `text` is what gets saved (capped); the in-memory text lives in the state, so saving never walks the DOM */
    Object.defineProperty(o, 'text', { enumerable: true, configurable: true, get() { return savedText(s); } });
    return o;
  }
  function savedText(s) {
    if (s.cache != null) return s.cache;
    let t = '', n = 0, i = 0;
    for (; i < s.parts.length && n < SAVE_CHARS; i++) { t += s.parts[i].s; n += s.parts[i].s.length; }
    if (i < s.parts.length) { let rest = 0; for (let j = i; j < s.parts.length; j++) rest += s.parts[j].n; t += '\n[… ' + rest + ' more line(s) not saved …]\n'; }
    else t += s.line;
    s.cache = t;
    return t;
  }
  const count = (str) => { let n = 0, i = -1; while ((i = str.indexOf('\n', i + 1)) >= 0) n++; return n; };

  /* feed one chunk into a stream; returns the text that became "settled" (complete lines) */
  function feed(s, text) {
    let settled = ''; s.cache = null;
    if (!/[\r\b]/.test(text) && s.cur === s.line.length) { /* fast path: plain text appended at the end of the current line */
      const t = s.line + text, i = t.lastIndexOf('\n');
      if (i < 0) s.line = t; else { settled = t.slice(0, i + 1); s.line = t.slice(i + 1); }
      s.cur = s.line.length;
    } else {
      const re = /[\r\b\n]/g; let pos = 0, m;
      const put = (seg) => { if (!seg) return; s.line = s.line.slice(0, s.cur) + seg + s.line.slice(s.cur + seg.length); s.cur += seg.length; };
      while ((m = re.exec(text))) {
        put(text.slice(pos, m.index)); pos = m.index + 1; const ch = m[0];
        if (ch === '\n') { settled += s.line + '\n'; s.line = ''; s.cur = 0; }
        else if (ch === '\r') s.cur = 0;
        else if (s.cur > 0) { s.line = s.line.slice(0, s.cur - 1) + s.line.slice(s.cur); s.cur--; }
      }
      put(text.slice(pos));
    }
    if (s.line.length > LINE_MAX) { settled += s.line; s.line = ''; s.cur = 0; } /* absurdly long line: settle it so it can be capped */
    return settled;
  }
  /* store settled text as parts of <=256 lines / 32 KB, within the per-cell memory cap */
  function store(c, s, settled) {
    const room = HARD_CHARS - c._tot;
    if (settled.length > room) { settled = settled.slice(0, Math.max(0, room)); c._dropped = true; }
    let a = 0;
    while (a < settled.length) {
      let b = a, n = 0;
      while (b < settled.length && b - a < PART_CHARS && n < PART_LINES) { const i = settled.indexOf('\n', b); if (i < 0 || i >= a + PART_CHARS) { b = Math.min(settled.length, a + PART_CHARS); break; } b = i + 1; n++; }
      if (b === a) b = Math.min(settled.length, a + PART_CHARS);
      const str = settled.slice(a, b); s.parts.push({ s: str, n: count(str) }); c._totLn += s.parts[s.parts.length - 1].n; a = b;
    }
    s.len += settled.length; c._tot += settled.length; s.cache = null;
  }
  /* put as many hidden parts of this stream into the DOM as the cell's budget allows; the current (unfinished) line is shown when all settled text is */
  function show(c, o) {
    const s = ST.get(o); if (!s || !s.pre) return;
    let add = '';
    while (s.pi < s.parts.length && c._shCh < c._limCh && c._shLn < c._limLn) { const p = s.parts[s.pi++]; add += p.s; c._shCh += p.s.length; c._shLn += p.n; }
    if (add) s.done.appendData(add);
    const all = s.pi === s.parts.length;
    if (s.ln.data !== (all ? s.line : '')) s.ln.data = all ? s.line : '';
  }
  function fill(c) { for (const o of c.outputs) if (o.output_type === 'stream') show(c, o); clearTimeout(c._footT); c._footT = 0; footNow(c); }

  /* ---------- "output truncated" control (one per cell, under the output box) ---------- */
  function footEl(c) {
    if (c._foot) return c._foot;
    const f = el('div', 'more'); f.hidden = true;
    f.innerHTML = '<span class="mt" role="status"></span><button type="button" class="mini more1">Show more</button><button type="button" class="mini moreall">Show all</button>';
    f.querySelector('.more1').onclick = () => { c._limCh += MORE_CHARS; c._limLn += MORE_LINES; fill(c); };
    f.querySelector('.moreall').onclick = () => { c._limCh = c._limLn = Infinity; fill(c); };
    c.outEl.after(f); c._foot = f; return f;
  }
  function foot(c) { /* throttled: a flood of messages updates the text a few times per second, not per message */
    if (c._footT) return; c._footT = setTimeout(() => { c._footT = 0; footNow(c); }, 120);
  }
  function footNow(c) {
    const hidden = c._totLn - c._shLn, hc = c._tot - c._shCh;
    if (hc <= 0 && !c._dropped) { if (c._foot) c._foot.hidden = true; return; }
    const f = footEl(c);
    f.querySelector('.mt').textContent = 'Output truncated: ' + (hidden > 0 ? hidden.toLocaleString() + ' more line' + (hidden === 1 ? '' : 's') : 'more text') + ' hidden' +
      (c._dropped ? '; output beyond ' + (HARD_CHARS / 1e6) + ' MB was discarded' : '') + '.';
    f.querySelector('.more1').hidden = f.querySelector('.moreall').hidden = hc <= 0;
    f.hidden = false;
  }

  /* ---------- nodes ---------- */
  function dataNode(o) {
    const d = o.data || {};
    const img = (mime, src) => { const i = document.createElement('img'); i.src = src; i.alt = 'output'; return i; };
    if (d['image/png']) return img('png', 'data:image/png;base64,' + txt(d['image/png']).replace(/\s/g, ''));
    if (d['image/jpeg']) return img('jpeg', 'data:image/jpeg;base64,' + txt(d['image/jpeg']).replace(/\s/g, ''));
    if (d['image/svg+xml']) { const i = document.createElement('img'); i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(txt(d['image/svg+xml'])); return i; }
    if (d['text/html']) return htmlFrame(txt(d['text/html']));
    if (d['text/plain'] != null) return el('pre', 'result', txt(d['text/plain']));
    return null;
  }
  function nodeFor(c, o) {
    if (o.output_type === 'stream') {
      const s = ST.get(o), pre = el('pre', o.name === 'stderr' ? 'stderr' : 'stdout');
      s.pre = pre; s.done = document.createTextNode(''); s.ln = document.createTextNode(''); pre.appendChild(s.done); pre.appendChild(s.ln);
      s.pi = 0; /* nothing shown yet: show() fills it within the budget */
      return pre;
    }
    if (o.output_type === 'error') return el('pre', 'err', o.traceback && o.traceback.length ? txt(o.traceback.join('\n')) : o.ename + ': ' + o.evalue);
    return dataNode(o);
  }
  function attach(c, o) {
    const n = nodeFor(c, o); if (!n) return;
    NODE.set(o, n); c.outEl.appendChild(n);
    if (o.output_type === 'stream') show(c, o);
  }

  /* ---------- API ---------- */
  function resetState(c) {
    c._tot = 0; c._totLn = 0; c._shCh = 0; c._shLn = 0; c._limCh = LIM_CHARS; c._limLn = LIM_LINES; c._dropped = false;
    clearTimeout(c._footT); c._footT = 0; if (c._foot) c._foot.hidden = true;
    displays.forEach((list, id) => { const k = list.filter((e) => e.c !== c); if (k.length) displays.set(id, k); else displays.delete(id); });
  }
  /* build c.outputs and the DOM from saved outputs (old data with raw \r is cleaned by the same terminal logic) */
  function init(c, saved) {
    resetState(c); c.outputs = []; c.outEl.textContent = '';
    (saved || []).forEach((o) => {
      let n = o;
      if (o.output_type === 'stream') { n = newStream(o.name); const s = ST.get(n); store(c, s, feed(s, txt(o.text))); }
      c.outputs.push(n); attach(c, n);
    });
    foot(c);
  }
  function reset(c) { init(c, []); }
  function forget(c) { resetState(c); if (c._foot) { c._foot.remove(); c._foot = null; } }

  /* update_display_data: same output object, new data, new node, in whichever cell shows that display_id. Returns false if there is none. */
  function update(o) {
    const list = displays.get(o.display_id); if (!list || !list.length) return false;
    list.forEach((e) => {
      e.o.data = o.data || {}; const nn = dataNode(e.o), old = NODE.get(e.o);
      if (nn && old && old.parentNode) { old.replaceWith(nn); NODE.set(e.o, nn); }
    });
    return true;
  }
  function add(c, o) {
    if (o.output_type === 'stream') {
      const last = c.outputs[c.outputs.length - 1], name = o.name === 'stderr' ? 'stderr' : 'stdout';
      let t = last && last.output_type === 'stream' && last.name === name ? last : null;
      if (!t) { t = newStream(name); c.outputs.push(t); attach(c, t); }
      const s = ST.get(t); store(c, s, feed(s, txt(o.text))); show(c, t); foot(c);
      return;
    }
    if (o.output_type === 'display_data' && o.display_id) {
      if (o.update && update(o)) return; /* an update with no matching display is shown as a new output */
      const out = { output_type: 'display_data', data: o.data || {}, execution_count: null };
      c.outputs.push(out); attach(c, out); const list = displays.get(o.display_id) || []; list.push({ c, o: out }); displays.set(o.display_id, list);
      return;
    }
    const out = { output_type: o.output_type, data: o.data, ename: o.ename, evalue: o.evalue, traceback: o.traceback, execution_count: o.execution_count };
    Object.keys(out).forEach((k) => { if (out[k] === undefined) delete out[k]; });
    c.outputs.push(out); attach(c, out);
  }

  window.CodeLabOutput = { init, reset, add, update, forget, refreshFrames, htmlDoc, txt, limits: { LIM_LINES, LIM_CHARS, HARD_CHARS } };
})();
