/* Learn kit — text loader and parser (shared by all Learn apps). Content lives in plain .txt files; nothing here may throw on bad input:
   unknown or malformed lines are skipped (and counted in .skipped), a missing file becomes a notice, never a crash.
   The optional "| drawing: id" suffix on a step is parsed into step.drawing and otherwise ignored (drawings arrive in a later release). */
window.LRN = window.LRN || {};
(() => {
  const L = window.LRN;
  const DRAWING = /\s*\|\s*drawing\s*:\s*([\w.-]*)\s*$/i;      // trailing "| drawing: id"
  const ITEM = /^(?:\d+\s*[.)]|[-*\u2022])\s+(\S.*)$/;          // "1. text", "2) text", "- text", "* text"
  const KEY = /^([a-z]+)\s*:\s*(.*)$/i;                         // "title: Cuts"
  const lines = t => String(t == null ? '' : t).replace(/^\uFEFF/, '').split(/\r?\n/).map(s => s.trim()).filter(s => s && s[0] !== '#');
  const step = s => { const m = DRAWING.exec(s); return { text: (m ? s.slice(0, m.index) : s).trim(), drawing: m ? m[1] : '' }; };

  // card file -> {id,title,icon,summary,call,basics:[{text,drawing}],expert:[...],quiz:[{q,right,wrong[]}],skipped}
  L.parseCard = function (text, id) {
    const c = { id, title: '', icon: '', summary: '', call: '', basics: [], expert: [], quiz: [], skipped: 0 };
    let sec = '';
    for (const line of lines(text)) {
      const s = /^\[([a-z]+)\]$/i.exec(line);
      if (s) { sec = s[1].toLowerCase(); continue; }
      if (!sec) {                                                 // header: key: value
        const k = KEY.exec(line);
        if (k && k[2] && /^(title|icon|summary|call)$/i.test(k[1])) c[k[1].toLowerCase()] = k[2]; else c.skipped++;
      } else if (sec === 'basics' || sec === 'expert') {
        const m = ITEM.exec(line), st = m && step(m[1]);
        if (st && st.text) c[sec].push(st); else c.skipped++;
      } else if (sec === 'quiz') {                                // question | right answer | wrong answer | wrong answer ...
        const p = line.split('|').map(x => x.trim()).filter(Boolean);
        if (p.length >= 3) c.quiz.push({ q: p[0].replace(/^\d+[.)]\s*/, ''), right: p[1], wrong: p.slice(2) }); else c.skipped++;
      } else c.skipped++;                                         // unknown section
    }
    if (!c.title) c.title = String(id).replace(/[-_]+/g, ' ').replace(/^./, x => x.toUpperCase());
    return c;
  };

  // index.txt -> {meta:{title,disclaimer}, ids:[...]}: "key: value" lines, then one card file name per line (".txt" optional)
  L.parseIndex = function (text) {
    const out = { meta: {}, ids: [] };
    for (const line of lines(text)) {
      const k = KEY.exec(line);
      if (k && /^(title|disclaimer)$/i.test(k[1])) { out.meta[k[1].toLowerCase()] = k[2]; continue; }
      const id = line.replace(/\.txt$/i, '');
      if (/^[\w-]+$/.test(id) && out.ids.indexOf(id) < 0) out.ids.push(id);
    }
    return out;
  };

  const get = url => fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); });

  // load index + every card; returns {meta, cards:[{id, card|null}], notes:[strings]} and never rejects
  L.load = async function (base, ver, fallback) {
    const notes = [];   // ver is unused (kept so callers don't break)
    let idx = { meta: {}, ids: [] };
    try { idx = L.parseIndex(await get(base + 'index.txt')); } catch (e) { notes.push('index.txt could not be loaded'); }
    if (!idx.ids.length) idx.ids = (fallback || []).slice();
    const cards = await Promise.all(idx.ids.map(id => get(base + id + '.txt').then(t => ({ id, card: L.parseCard(t, id) }), () => { notes.push(id + '.txt could not be loaded'); return { id, card: null }; })));
    return { meta: idx.meta, cards, notes };
  };
})();
