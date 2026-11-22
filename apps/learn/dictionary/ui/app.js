/* Dictionary DC-1 / DC-1a / DC-4 / DC-1b — screens: search box with prefix suggestions, the entry (word, IPA, Hear it, senses grouped by part of
   speech in Open English WordNet order, top 3 each with the rest under More meanings; examples and tappable synonyms / opposites;
   DC-4 irregular forms, Word family and Phrases chips), not-found suggestions, home (word of the day + recent searches)
   and About (credits). Data: data/*.json shards made by tools/build_data.py, fetched only when needed and kept in memory.
   The looked-up word lives in the URL hash (#apple) so Back works. Saves: learn.dictionary.recent (last 20 words). */
(() => {
  const D = window.DictCore, store = LRN.store, VER = 'DC1b', KEY = 'learn.dictionary.recent';
  const root = document.getElementById('app');
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { const v = attrs[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); }
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : String(c)));
    return el;
  };

  // ---- data (fetched on demand, cached) ----
  const cache = {};
  const get = name => cache[name] || (cache[name] = fetch('data/' + name + '.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .catch(e => { delete cache[name]; if (String(e.message) === '404') return null; throw e; }));
  let man = { split: [] };
  const ready = get('manifest').then(m => { if (m) man = m; });
  const shard = async w => (await get('d_' + D.shardKey(w, man.split))) || { w: {} };
  const index = w => get('i_' + D.letter(D.norm(w))).then(l => l || []);
  async function find(w) {   // -> {word, senses, ipa, from} or null
    await ready;
    const k = D.norm(w), sh = await shard(k);
    if (sh.w[k]) return { word: k, senses: sh.w[k], ipa: (sh.p || {})[k] || '', rel: D.related(sh, k) };
    const base = (sh.f || {})[k];
    const tries = base ? [base] : D.stems(k);
    for (const b of tries) {
      const s2 = await shard(b);
      if (s2.w[b]) return { word: b, senses: s2.w[b], ipa: (s2.p || {})[b] || '', from: k, rel: D.related(s2, b) };
    }
    return null;
  }

  // ---- layout ----
  const aboutBtn = h('button', { type: 'button', class: 'lrn-qc dc-about-btn', 'data-hb': 'about', onclick: () => go('#about') }, 'About');
  const head = h('header', { class: 'lrn-head' }, h('h1', null, h('span', { class: 'lrn-here' }, 'Dictionary')), aboutBtn, h('span', { class: 'dc-ver' }, VER));
  const input = h('input', { type: 'search', class: 'dc-q', placeholder: 'Type a word', 'aria-label': 'Word to look up', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search' });
  const sugg = h('ul', { class: 'dc-sugg', role: 'listbox', hidden: true });
  const form = h('form', { class: 'dc-form', role: 'search', onsubmit: e => { e.preventDefault(); const v = pickSel() || input.value; if (D.norm(v)) go('#' + encodeURIComponent(D.norm(v))); } },
    h('div', { class: 'dc-box' }, input, sugg), h('button', { type: 'submit', class: 'dc-go' }, 'Look up'));
  const out = h('div', { class: 'dc-out', 'aria-live': 'polite' });
  const main = h('main', { class: 'lrn-main dc-main', id: 'lrn-main' }, form, out);
  root.className = 'lrn dc'; root.replaceChildren(head, main);
  if (window.LearnHubBar) LearnHubBar.attach(head, { buttons: '.dc-about-btn' });

  // ---- autocomplete ----
  let sel = -1, typed = 0;
  const items = () => Array.from(sugg.children);
  const pickSel = () => (sel >= 0 && !sugg.hidden && items()[sel] ? items()[sel].dataset.w : '');
  const closeSugg = () => { sugg.hidden = true; sel = -1; };
  input.addEventListener('input', async () => {
    const q = input.value, n = ++typed;
    if (!D.norm(q)) return closeSugg();
    let list = [];
    try { list = D.prefix(await index(q), q, 8); } catch (e) { /* offline: no suggestions */ }
    if (n !== typed) return;   // a newer keystroke won
    sel = -1;
    sugg.replaceChildren(...list.map(w => h('li', { role: 'option', 'data-w': w, onmousedown: e => { e.preventDefault(); go('#' + encodeURIComponent(w)); } }, w)));
    sugg.hidden = !list.length;
  });
  input.addEventListener('keydown', e => {
    const li = items();
    if (sugg.hidden || !li.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = li.length + 1;   // -1 = back in the box
      sel = ((sel + 1 + (e.key === 'ArrowDown' ? 1 : -1)) % n + n) % n - 1;
      li.forEach((x, i) => x.setAttribute('aria-selected', String(i === sel)));
    } else if (e.key === 'Escape') closeSugg();
  });
  input.addEventListener('blur', () => setTimeout(closeSugg, 150));

  // ---- screens ----
  const wordBtn = w => h('button', { type: 'button', class: 'dc-chip', onclick: () => go('#' + encodeURIComponent(D.norm(w))) }, w);
  const canSpeak = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
  function speak(w) {
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(w); u.lang = 'en-GB'; u.rate = 0.9; speechSynthesis.speak(u); } catch (e) { /* no voice */ }
  }
  const msg = (t, cls) => h('p', { class: 'dc-msg' + (cls ? ' ' + cls : '') }, t);

  function entry(r) {
    const top = h('div', { class: 'dc-top' }, h('h2', { class: 'dc-word', tabindex: '-1' }, r.word),
      r.ipa ? h('span', { class: 'dc-ipa' }, '/' + r.ipa + '/') : null,
      canSpeak ? h('button', { type: 'button', class: 'lrn-qc dc-hear', onclick: () => speak(r.word) }, '🔊 Hear it') : null);
    const note = r.from ? msg('“' + r.from + '” is a form of “' + r.word + '”.', 'dc-note') : null;
    const sense = s => h('li', null, h('div', { class: 'dc-def' }, s.def),
      s.ex.map(x => h('div', { class: 'dc-ex' }, '“' + x + '”')),
      s.syn.length ? h('div', { class: 'dc-rel' }, h('span', { class: 'dc-lab' }, 'Similar:'), s.syn.map(wordBtn)) : null,
      s.ant.length ? h('div', { class: 'dc-rel' }, h('span', { class: 'dc-lab' }, 'Opposite:'), s.ant.map(wordBtn)) : null);
    // DC-1a/DC-1b: meanings in OEWN order, top 3; the rest of each part of speech folds under "More meanings" (numbering continues)
    const groups = D.layout(r.senses, 3).map(g => h('section', { class: 'dc-pos' }, h('h3', null, g.name),
      h('ol', null, g.top.map(sense)),
      g.more.length ? h('details', { class: 'dc-more' }, h('summary', null, g.more.length + ' more ' + g.name + ' meaning' + (g.more.length > 1 ? 's' : '')),
        h('ol', { start: String(g.top.length + 1) }, g.more.map(sense))) : null));
    // DC-4: irregular forms (plain text), word family and phrases (tappable chips; phrases show 8, rest under a tap)
    const rel = r.rel || { family: [], phrases: [], forms: [] };
    const forms = rel.forms.length ? h('p', { class: 'dc-forms' }, h('span', { class: 'dc-lab' }, 'Forms: '), rel.forms.join(', ')) : null;
    const fam = rel.family.length ? h('section', { class: 'dc-pos dc-fam' }, h('h3', null, 'Word family'), h('div', { class: 'dc-rel' }, rel.family.map(wordBtn))) : null;
    const pc = D.cap(rel.phrases, 8);
    const phr = rel.phrases.length ? h('section', { class: 'dc-pos dc-phr' }, h('h3', null, 'Phrases'), h('div', { class: 'dc-rel' }, pc.top.map(wordBtn)),
      pc.more.length ? h('details', { class: 'dc-more' }, h('summary', null, pc.more.length + ' more phrase' + (pc.more.length > 1 ? 's' : '')), h('div', { class: 'dc-rel' }, pc.more.map(wordBtn))) : null) : null;
    return [top, note, forms, ...groups, fam, phr];
  }

  async function notFound(w) {
    let list = [];
    try { list = D.suggest(w, await index(w), 6); } catch (e) { /* offline */ }
    return [h('h2', { class: 'dc-word', tabindex: '-1' }, w), msg('No entry for this word.'),
      list.length ? h('div', { class: 'dc-rel' }, h('span', { class: 'dc-lab' }, 'Did you mean:'), list.map(wordBtn)) : msg('Check the spelling and try again.')];
  }

  async function home() {
    const parts = [];
    try {
      const pick = D.wordOfDay(await get('wod'));
      if (pick) parts.push(h('button', { type: 'button', class: 'dc-wod', onclick: () => go('#' + encodeURIComponent(pick[0])) },
        h('span', { class: 'dc-lab' }, 'Word of the day'), h('b', null, pick[0]), h('i', null, D.POS[pick[1]] || ''), h('span', null, pick[2])));
    } catch (e) { parts.push(msg('Could not load the word list. Open the app from the Hub or a web server.')); }
    const rec = store.read(KEY, []);
    if (Array.isArray(rec) && rec.length) {
      parts.push(h('section', { class: 'dc-recent' }, h('div', { class: 'dc-row' }, h('h3', null, 'Recent'),
        h('button', { type: 'button', class: 'dc-clear', onclick: () => { store.write(KEY, []); render(); } }, 'Clear')), h('div', { class: 'dc-rel' }, rec.map(wordBtn))));
    }
    return parts;
  }

  function about() {
    return [h('h2', { class: 'dc-word', tabindex: '-1' }, 'About'),
      h('p', null, 'An offline English dictionary with about ' + (man.words ? Math.round(man.words / 1000) + ',000' : '120,000') + ' words and phrases. Type a word, pick a suggestion or tap any similar word to look it up. Hear it uses the voice built into your device.'),
      h('p', null, 'Word data: ', h('a', { href: 'https://en-word.net/', target: '_blank', rel: 'noopener' }, 'Open English WordNet'), ' ' + (man.v || '').replace('oewn-', '') + ' by the Open English WordNet team, licensed under ',
        h('a', { href: 'https://creativecommons.org/licenses/by/4.0/', target: '_blank', rel: 'noopener' }, 'CC BY 4.0'), '. Converted to small files for this app (shortened examples and synonym lists; word families from WordNet word links, phrases from entries that contain the word). Meanings are listed in the order Open English WordNet gives them.'),
      h('p', null, h('a', { href: 'LICENSE-OEWN.txt', target: '_blank' }, 'Full licence and credits'))];
  }

  let seq = 0;
  async function render() {
    const n = ++seq, raw = decodeURIComponent(location.hash.slice(1)), w = D.norm(raw);
    closeSugg();
    let parts;
    if (raw === 'about') parts = about();
    else if (!w) parts = await home();
    else {
      if (D.norm(input.value) !== w) input.value = w;
      out.replaceChildren(msg('Looking up…'));
      try {
        const r = await find(w);
        parts = r ? entry(r) : await notFound(w);
        if (r) store.write(KEY, D.addRecent(store.read(KEY, []), r.word, 20));
      } catch (e) { parts = [msg('Could not load the dictionary data. Check the connection and try again.')]; }
    }
    if (n !== seq) return;
    out.replaceChildren(...parts.filter(Boolean));
    out.scrollTop = 0; main.scrollTop = 0;
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; input.blur(); }
  window.addEventListener('hashchange', render);
  render();
  if (!location.hash) input.focus();
})();
