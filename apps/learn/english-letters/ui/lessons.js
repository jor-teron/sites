(function () {
  'use strict';
  const E = window.English, { el, button } = E, out = document.getElementById('content');
  function heading(title, note) { out.append(el('h2', title), el('p', note, 'intro')); }
  function soundButton(glyph, caption, speak) {
    const b = button('', speak, 'study-card'); b.append(el('span', glyph, 'glyph'), el('small', caption));
    b.setAttribute('aria-label', glyph + ' · ' + caption + ' · hear'); return b;
  }
  let lesson = 'vowels';
  const lessonNames = {
    vowels: 'Vowels & consonants',
    pairs: 'Capital & small',
    blends: 'Blends & digraphs',
    cvc: 'Three-letter words',
    sight: 'Sight words'
  };
  function lessonNav() {
    const nav = el('div', undefined, 'row lesson-nav');
    Object.entries(lessonNames).forEach(([id, name]) => {
      const b = button(name, () => { lesson = id; E.views.lessons(); });
      b.setAttribute('aria-pressed', lesson === id ? 'true' : 'false');
      nav.append(b);
    });
    return nav;
  }
  function renderVowels() {
    heading('Vowels and consonants', 'The five vowels are A, E, I, O and U. The other 21 letters are consonants. Y is a consonant at the start of a word (yak, yellow) and a vowel in words such as sky, gym and happy. Tap a card to hear the letter name and its sound.');
    out.append(el('h3', 'Vowels'));
    const vgrid = el('div', undefined, 'study-grid');
    E.vowels.forEach(l => {
      const b = soundButton(l.capital + ' ' + l.small, l.name + ' · ' + l.phrase, () => { E.speakLetter(l); setTimeout(() => E.speakPhonics(l), 1100); });
      b.append(el('span', l.emoji + ' ' + l.word, 'en')); vgrid.append(b);
    });
    out.append(vgrid, el('h3', 'Consonants'));
    const cgrid = el('div', undefined, 'study-grid');
    E.consonants.forEach(l => {
      const b = soundButton(l.capital + ' ' + l.small, l.name + ' · ' + l.phrase, () => { E.speakLetter(l); setTimeout(() => E.speakPhonics(l), 1100); });
      b.append(el('span', l.emoji + ' ' + l.word, 'en')); cgrid.append(b);
    });
    out.append(cgrid);
  }
  function renderPairs() {
    heading('Capital and small letters', 'Every letter has a capital (A) and a small (a) form. Use a capital at the start of a sentence and for names. Tap a pair to hear the letter name.');
    const grid = el('div', undefined, 'study-grid');
    E.letters.forEach(l => {
      const b = soundButton(l.capital + ' ' + l.small, l.name, () => E.speakLetter(l));
      b.append(el('small', l.phrase)); grid.append(b);
    });
    out.append(grid);
  }
  function renderBlends() {
    heading('Blends and digraphs', 'A digraph is two letters that make one sound, such as sh in ship. A blend is two consonant sounds said closely together, such as bl in blue. Tap a card to hear the example word.');
    out.append(el('h3', 'Digraphs'));
    const dgrid = el('div', undefined, 'study-grid');
    E.digraphs.forEach(d => {
      const b = soundButton(d.glyph, d.word, () => E.speakWord(d.word));
      b.append(el('span', d.emoji + ' ' + d.word, 'en'), el('small', d.hint)); dgrid.append(b);
    });
    out.append(dgrid, el('h3', 'Blends'));
    const bgrid = el('div', undefined, 'study-grid');
    E.blends.forEach(d => {
      const b = soundButton(d.glyph, d.word, () => E.speakWord(d.word));
      b.append(el('span', d.emoji + ' ' + d.word, 'en'), el('small', d.hint)); bgrid.append(b);
    });
    out.append(bgrid);
  }
  function renderCvc() {
    heading('Three-letter words', 'CVC words have a consonant, a short vowel and a consonant, such as cat, dog and sun. Tap a word to hear it.');
    E.cvc.forEach(g => {
      const letter = E.letter(g.vowel);
      out.append(el('h3', 'Short ' + letter.capital + ' · ' + letter.phrase));
      const grid = el('div', undefined, 'study-grid');
      g.words.forEach(word => {
        grid.append(soundButton(word, word, () => E.speakWord(word)));
      });
      out.append(grid);
    });
  }
  function renderSight() {
    heading('Sight words', 'These common words are useful to recognise on sight. Some, such as the and said, do not follow the usual sound rules. The word I is always written with a capital. Tap a word to hear it.');
    const grid = el('div', undefined, 'study-grid');
    E.sight.forEach(s => {
      grid.append(soundButton(s.display, s.display, () => E.speakWord(s.display)));
    });
    out.append(grid);
  }
  E.views.lessons = function () {
    out.replaceChildren(lessonNav());
    ({ vowels: renderVowels, pairs: renderPairs, blends: renderBlends, cvc: renderCvc, sight: renderSight }[lesson] || renderVowels)();
  };
  E.views.numbers = function () {
    out.replaceChildren();
    heading('0–10 · Number names', 'Read the numeral, the spelling and the value together. Tap a card to hear the English number name. Ten is written with two digits: 1 and 0.');
    const grid = el('div', undefined, 'study-grid');
    E.numbers.forEach(n => {
      const b = soundButton(n.glyph, n.name, () => E.speakWord(n.name));
      b.append(el('small', 'Value ' + n.value), el('span', n.value ? '●'.repeat(n.value) : '○', 'count-dots'));
      grid.append(b);
    });
    out.append(grid);
  };
  let theme = 'all', query = '';
  E.views.words = function () {
    out.replaceChildren();
    heading('Picture words · ' + E.words.length + ' words', 'Browse by theme or search in English. Emoji are memory cues, not exact pictures. Every word uses only the letters a–z. Tap to hear it.');
    const bar = el('div', undefined, 'word-filters'), label = el('label', 'Theme '), select = el('select'); select.id = 'word-theme';
    const all = el('option', 'All themes'); all.value = 'all'; select.append(all);
    E.themes.forEach(t => { const o = el('option', t.label); o.value = t.id; select.append(o); }); select.value = theme; label.append(select);
    const searchLabel = el('label', 'Find a word '), search = el('input'); search.type = 'search'; search.placeholder = 'Type a word'; search.value = query; search.id = 'word-search'; searchLabel.append(search);
    const count = el('p'), grid = el('div', undefined, 'word-grid');
    function render() {
      grid.replaceChildren(); const q = query.trim().toLowerCase();
      const words = E.words.filter(w => (theme === 'all' || w.theme === theme) && (!q || w.word.includes(q) || w.meaning.toLowerCase().includes(q)));
      count.textContent = words.length + ' words';
      words.forEach(w => { const b = button('', () => E.speakWord(w.word), 'picture-card'); b.append(el('span', w.emoji, 'emoji'), el('strong', w.word, 'en'), el('small', w.meaning)); b.setAttribute('aria-label', w.word + ' · ' + w.meaning + ' · hear'); grid.append(b); });
      if (!words.length) grid.append(el('p', 'No matches. Try another word or theme.'));
    }
    select.onchange = () => { theme = select.value; render(); }; search.oninput = () => { query = search.value; render(); };
    bar.append(label, searchLabel); out.append(bar, count, grid); render();
  };
})();
