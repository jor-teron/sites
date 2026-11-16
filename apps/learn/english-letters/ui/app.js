(function () {
  'use strict';
  const E = window.English, $ = id => document.getElementById(id);
  const raw = E.read('progress', {});
  E.progress = { learned: raw.learned && typeof raw.learned === 'object' ? raw.learned : {}, traced: raw.traced && typeof raw.traced === 'object' ? raw.traced : {} };
  E.el = function (tag, text, cls) { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  E.button = function (text, fn, cls) { const b = E.el('button', text, cls); b.onclick = fn; return b; };
  const { el, button } = E;
  function tracedStars(letter) {
    return Math.max(E.progress.traced[letter.id] || 0, E.progress.traced[letter.id + '-s'] || 0);
  }
  function progress() {
    const traced = E.letters.filter(l => tracedStars(l)).length;
    $('progress').textContent = Object.keys(E.progress.learned).length + '/' + E.letters.length + ' learned · ' + traced + ' traced';
    E.write('progress', E.progress);
  }
  E.updateProgress = progress;
  E.showLetter = function (letter) {
    E.stopSpeech(); const box = $('letter-detail'); box.replaceChildren(); $('letter-title').textContent = letter.capital + ' ' + letter.small + ' · ' + letter.name;
    const layout = el('div', undefined, 'detail-grid'), info = el('section', undefined, 'letter-info');
    const glyph = el('p', letter.capital + ' ' + letter.small, 'big-letter en'); glyph.lang = 'en'; info.append(glyph);
    const example = el('div'); example.append(el('span', letter.emoji + ' ', 'emoji'), el('strong', letter.word, 'en example'), el('p', letter.meaning)); info.append(example);
    const controls = el('div', undefined, 'row');
    controls.append(button('Hear letter', () => E.speakLetter(letter)), button('Hear sound', () => E.speakPhonics(letter)), button('Hear word', () => E.speakWord(letter.word)));
    info.append(controls, el('p', 'Letter name: ' + letter.name, 'say'), el('p', 'Sound: ' + letter.phrase, 'say'), el('p', letter.hint));
    const learned = button(E.progress.learned[letter.id] ? '✓ Learned' : 'Mark learned', () => { E.progress.learned[letter.id] = true; learned.textContent = '✓ Learned'; if (E.recordActivity) E.recordActivity(); progress(); E.renderChart(); }, 'primary'); info.append(learned);
    const practice = el('section'); practice.append(el('h3', 'Trace with a finger or mouse'));
    const formRow = el('div', undefined, 'row');
    let form = 'capital';
    const wrap = el('div', undefined, 'trace-wrap'), canvas = el('canvas'); canvas.id = 'trace'; canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Trace ' + letter.capital + ' over the faint guide'); wrap.append(canvas);
    const row = el('div', undefined, 'row trace-buttons'), result = el('p', 'Follow the faint letter, stroke by stroke.'); result.id = 'trace-result'; result.setAttribute('role', 'status');
    let trace;
    const bars = el('div', undefined, 'trace-bars'); bars.setAttribute('aria-hidden', 'true');
    const bar = (name, kind) => { const r = el('div', undefined, 'trace-bar ' + kind), track = el('span', undefined, 'track'), fill = el('span', undefined, 'fill'), val = el('span', '0%', 'val'); track.append(fill); r.append(el('span', name, 'name'), track, val); bars.append(r); return (v) => { fill.style.width = v + '%'; val.textContent = v + '%'; }; };
    const setCover = bar('Covered', 'cover'), setGuide = bar('On the guide', 'guide');
    function onGrade(r) {
      const c = Math.round(r.coverage * 100), g = Math.round(r.precision * 100); setCover(c); setGuide(g);
      result.replaceChildren(el('span', '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars), 'trace-stars'), el('span', ' · ' + c + '% covered · ' + g + '% on the guide', 'sr-only'));
      if (r.stars) {
        if (E.recordActivity) E.recordActivity();
        const key = form === 'capital' ? letter.id : letter.id + '-s';
        E.progress.traced[key] = Math.max(E.progress.traced[key] || 0, r.stars); progress(); E.renderChart();
      }
    }
    function phaseButtons(list) {
      row.replaceChildren();
      list.forEach((_, i) => row.append(button('Stroke ' + (i + 1), () => trace.setPhase(i + 1))));
      row.append(button('Clear', () => trace.clear()));
    }
    function startTrace() {
      const glyph = form === 'capital' ? letter.capital : letter.small;
      const list = letter.strokes[form] || [];
      canvas.setAttribute('aria-label', 'Trace ' + glyph + ' over the faint guide');
      setCover(0); setGuide(0);
      result.textContent = 'Follow the faint ' + (form === 'capital' ? 'capital' : 'small') + ' letter, stroke by stroke.';
      trace = E.createTrace(canvas, glyph, onGrade, list);
      E.trace = trace;
      phaseButtons(list);
    }
    const capBtn = button('Capital ' + letter.capital, () => { form = 'capital'; capBtn.setAttribute('aria-pressed', 'true'); smallBtn.setAttribute('aria-pressed', 'false'); startTrace(); }, 'primary');
    const smallBtn = button('Small ' + letter.small, () => { form = 'small'; smallBtn.setAttribute('aria-pressed', 'true'); capBtn.setAttribute('aria-pressed', 'false'); startTrace(); });
    capBtn.setAttribute('aria-pressed', 'true'); smallBtn.setAttribute('aria-pressed', 'false');
    formRow.append(capBtn, smallBtn);
    practice.append(formRow, wrap, row, result, bars, el('p', 'Numbered arrows show a simple school-print stroke order. Fonts vary, so follow the faint shape as well as the arrows. Trace the capital and the small letter for a complete practice. Clear starts a new attempt; your best result stays saved.', 'note'));
    layout.append(info, practice); box.append(layout);
    startTrace();
    if (!$('letter-card').open) $('letter-card').showModal();
  };
  E.renderChart = function () {
    if (E.mode !== 'chart') return;
    const out = $('content'); out.replaceChildren();
    out.append(el('p', '26 letters, A to Z. Each tile shows the capital and the small letter. Tap a tile to hear the letter name and the phonics sound, see a picture word and trace both forms.', 'intro'));
    E.groups.forEach(([id, label]) => {
      const section = el('section', undefined, 'group'); section.append(el('h2', label + (id === 'vowels' ? ' · A E I O U' : ' · the other 21 letters'))); const grid = el('div', undefined, 'letter-grid');
      E.letters.filter(l => l.group === id).forEach(l => {
        const b = button('', () => E.showLetter(l), 'letter'); b.setAttribute('aria-label', l.capital + ' ' + l.small + ' · ' + l.name + ' · ' + l.word);
        const pair = el('span', undefined, 'glyph-pair'); pair.append(el('span', l.capital, 'glyph'), el('span', l.small, 'glyph small-form'));
        b.append(pair, el('small', l.name));
        const stars = tracedStars(l);
        if (E.progress.learned[l.id] || stars) b.append(el('span', stars ? '★'.repeat(stars) : '✓', 'badge'));
        grid.append(b);
      }); section.append(grid); out.append(section);
    });
  };
  E.views = { chart: E.renderChart };
  E.navigate = function (mode) { E.stopSpeech(); E.mode = mode; document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode)); (E.views[mode] || E.views.chart)(); };
  $('modes').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) E.navigate(b.dataset.mode); };
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).close());
  $('letter-card').addEventListener('close', E.stopSpeech);
  if (HubTheme.own() !== 'system') HubTheme.setOwn('system');
  function syncTheme() {
    if (HubTheme.own() !== 'system') return;
    let theme = '', auto = ''; try { theme = localStorage.getItem('sites-hub.theme'); auto = localStorage.getItem('sites-hub.themeAuto'); } catch (_) {}
    if (!theme || auto === '1') { const dark = matchMedia('(prefers-color-scheme: dark)').matches; document.documentElement.classList.toggle('light', !dark); document.documentElement.dataset.theme = dark ? 'dark' : 'light'; document.documentElement.style.colorScheme = dark ? 'dark' : 'light'; }
  }
  HubTheme.onChange(syncTheme); window.addEventListener('storage', syncTheme); window.addEventListener('focus', syncTheme);
  window.addEventListener('message', e => { if (e.origin === location.origin && e.data?.type === 'hub-prefs') syncTheme(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme); syncTheme();
  window.addEventListener('pagehide', E.stopSpeech); document.addEventListener('visibilitychange', () => { if (document.hidden) E.stopSpeech(); });
  LearnHubBar.attach(document.querySelector('.lrn-head'), { buttons: '#help,#mute' });
  E.navigate('chart'); progress();
})();
