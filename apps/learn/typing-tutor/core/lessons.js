/* Typing Tutor TT1 — lessons and practice text.
   TT.STAGES: graded stages (home row, top row, bottom row, Shift, numbers, punctuation, words and sentences), each with lessons.
   A lesson: {id, title, keys (the new keys, shown as the focus), make(rand) -> practice text}. Text is generated fresh per attempt.
   TT.testText(words): common-word text for the free test. No DOM here. */
window.TT = window.TT || {};
(() => {
  const T = window.TT;
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // 200 common English words (all lower case, letters only)
  const COMMON = ('the of and to in is you that it he was for on are as with his they at be this have from or one had by word but not what all were ' +
    'we when your can said there use an each which she do how their if will up other about out many then them these so some her would make like ' +
    'him into time has look two more write go see number no way could people my than first water been call who oil its now find long down day did ' +
    'get come made may part over new sound take only little work know place year live me back give most very after thing our just name good ' +
    'sentence man think say great where help through much before line right too mean old any same tell boy follow came want show also around ' +
    'form three small set put end does another well large must big even such because turn here why ask went men read need land different home ' +
    'us move try kind hand picture again change off play spell air away animal house point page letter mother answer found study still learn ' +
    'should world high every near add food between own below country plant last school father keep tree never start city earth eye light ' +
    'thought head under story saw left few while along might close something seem next hard open example begin life always those both paper ' +
    'together got group often run important until children side feet car mile night walk white sea began grow took river four carry state once book').split(' ');
  const EXTRA = ('rush rug dull full fur jar far lurk dark shark guard hug sugar ash dash flask glass hall jag salad shall add lad fall gas sash ask all had has half lag flag sag dad lass alas ' +
    'quiet quite power tower write tree rope pour your pipe ripe type yeti puppy tiger outer water wire query ' +
    'zebra exam vex cozy mix box brown climb jump zone vivid lamb crab maze nimble zinc ' +
    'keyboard practice finger rhythm accuracy balance gentle steady').split(' ');
  const WORDS = COMMON.concat(EXTRA);
  const SENTENCES = [
    'The quick brown fox jumps over the lazy dog.', 'Practice a little every day and your speed will grow.',
    'Keep your eyes on the screen, not on your hands.', 'Rest your fingers on the home row before you start.',
    'Slow and steady typing beats fast and sloppy typing.', 'Pack my box with five dozen liquor jugs.',
    'Good posture helps you type for a long time.', 'Every key has a finger, and every finger has a home.',
    'Accuracy comes first; speed follows later.', 'Sphinx of black quartz, judge my vow.',
    'A short break now and then keeps your hands fresh.', 'Type each word with a calm and even rhythm.'
  ];
  const NAMES = ['Asha', 'Ben', 'Dina', 'Kiran', 'Leo', 'Maya', 'Omar', 'Priya', 'Ravi', 'Sara', 'Tom', 'Uma', 'India', 'Monday', 'June', 'London', 'Delhi', 'Friday'];

  // words made only of the allowed letters (falls back to drill groups when too few)
  const wordsFrom = allowed => WORDS.filter(w => [...w].every(c => allowed.includes(c)));
  // drill: groups of 2-5 chars, weighted towards the focus keys; letters-only pools mostly
  function drill(focus, pool, n) {
    const out = [];
    for (let g = 0; g < n; g++) {
      const len = 2 + Math.floor(Math.random() * 4); let s = '';
      for (let i = 0; i < len; i++) s += Math.random() < 0.6 ? pick(focus) : pick(pool);
      out.push(s);
    }
    return out.join(' ');
  }
  function wordText(allowed, n, focus) {
    const list = wordsFrom(allowed), f = focus ? list.filter(w => [...focus].some(c => w.includes(c))) : [];
    if (list.length < 6) return drill(focus || allowed, allowed, n);
    const out = []; for (let i = 0; i < n; i++) out.push(f.length >= 3 && Math.random() < 0.75 ? pick(f) : pick(list));
    return out.join(' ');
  }
  const cap = w => w[0].toUpperCase() + w.slice(1);

  const HOME = 'asdfghjkl;', TOP = 'qwertyuiop', BOT = 'zxcvbnm,./';
  const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
  let n = 0;
  const L = (title, keys, make) => ({ id: 'L' + (++n), title, keys, make });
  const mixDrill = (focus, pool) => () => drill(focus, pool, 14);
  const mixWords = (allowed, focus) => () => wordText(allowed, 14, focus);

  T.STAGES = [
    { name: 'Home row', lessons: [
      L('F and J', 'fj', mixDrill('fj', 'fj')),
      L('D and K', 'dk', mixDrill('dk', 'fjdk')),
      L('S and L', 'sl', mixDrill('sl', 'fjdksl')),
      L('A and ;', 'a;', mixDrill('a;', 'fjdksla;')),
      L('G and H', 'gh', mixDrill('gh', HOME)),
      L('Home row words', '', mixWords('asdfghjkl', ''))
    ] },
    { name: 'Top row', lessons: [
      L('R and U', 'ru', mixWords(HOME + 'ru', 'ru')),
      L('E and I', 'ei', mixWords(HOME + 'ruei', 'ei')),
      L('W and O', 'wo', mixWords(HOME + 'rueiwo', 'wo')),
      L('Q and P', 'qp', mixDrill('qp', HOME + TOP)),
      L('T and Y', 'ty', mixWords(HOME + TOP, 'ty')),
      L('Top row words', '', mixWords(HOME + TOP, 'qwertyuiop'))
    ] },
    { name: 'Bottom row', lessons: [
      L('V and M', 'vm', mixWords(HOME + TOP + 'vm', 'vm')),
      L('C and comma', 'c,', () => wordText(HOME + TOP + 'vmc', 12, 'c').split(' ').map((w, i) => i % 3 === 2 ? w + ',' : w).join(' ')),
      L('X and full stop', 'x.', () => wordText(HOME + TOP + 'vmcx', 12, 'x').split(' ').map((w, i) => i % 4 === 3 ? w + '.' : w).join(' ')),
      L('Z and slash', 'z/', mixDrill('z/', LETTERS)),
      L('B and N', 'bn', mixWords(LETTERS, 'bn')),
      L('All letters', '', mixWords(LETTERS, ''))
    ] },
    { name: 'Shift and capitals', lessons: [
      L('Left-hand capitals', 'ASDFGQWERTZXCVB', () => shuffle(WORDS.filter(w => 'asdfgqwertzxcvb'.includes(w[0]))).slice(0, 12).map(cap).join(' ')),
      L('Right-hand capitals', 'HJKLYUIOPNM', () => shuffle(WORDS.filter(w => 'hjklyuiopnm'.includes(w[0]))).slice(0, 12).map(cap).join(' ')),
      L('Names and places', '', () => shuffle(NAMES).slice(0, 6).map(nm => nm + ' ' + pick(WORDS)).join(' ')),
      L('Capital sentences', '', () => shuffle(SENTENCES.filter(s => /^[A-Za-z ,.]+$/.test(s))).slice(0, 2).join(' '))
    ] },
    { name: 'Numbers', lessons: [
      L('1 2 3 4 5', '12345', mixDrill('12345', '12345')),
      L('6 7 8 9 0', '67890', mixDrill('67890', '1234567890')),
      L('Numbers and words', '', () => { const o = []; for (let i = 0; i < 10; i++) o.push(Math.random() < 0.5 ? String(Math.floor(Math.random() * 1000)) : pick(COMMON)); return o.join(' '); })
    ] },
    { name: 'Punctuation', lessons: [
      L("Apostrophe and question", "'?", () => shuffle(["don't", "it's", "can't", "I'm", "you're", 'why?', 'how?', 'what?', "isn't", 'who?', "we'll", "they'd"]).join(' ')),
      L('Exclaim, dash, colon', '!-:', () => shuffle(['yes!', 'wow!', 'well-known', 'part-time', 'note:', 'time: 9:30', 'go!', 'day-to-day', 'list: a b c', 'stop!']).join(' ')),
      L('Quotes and brackets', '"()', () => shuffle(['"hello"', '(note)', '"yes"', '(page 4)', '"stop"', '(see below)', '"ok"', '(a)']).join(' ')),
      L('Mixed punctuation', '', () => shuffle(['Hi, Asha!', "It's 5:30.", 'Ready? Go!', 'Yes (maybe).', '"Well done," she said.', 'Wait - why?']).slice(0, 5).join(' '))
    ] },
    { name: 'Words and sentences', lessons: [
      L('Common words', '', () => shuffle(COMMON).slice(0, 18).join(' ')),
      L('Longer words', '', () => shuffle(WORDS.filter(w => w.length >= 6)).slice(0, 12).join(' ')),
      L('Sentences', '', () => shuffle(SENTENCES).slice(0, 2).join(' ')),
      L('Paragraph', '', () => shuffle(SENTENCES).slice(0, 4).join(' '))
    ] }
  ];
  T.LESSONS = T.STAGES.flatMap((s, si) => s.lessons.map(l => Object.assign(l, { stage: si, stageName: s.name })));
  T.lesson = id => T.LESSONS.find(l => l.id === id) || null;
  T.testText = count => { const o = []; for (let i = 0; i < count; i++) o.push(pick(COMMON)); return o.join(' '); };
})();
