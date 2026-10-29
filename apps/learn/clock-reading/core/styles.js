/* Clock Reading CR3 — the 7 clock styles (data only, the drawing is in ui/clock.js) and the plain words for every part
   (hover or tap a part of the clock to see them). Each style: id, name, numerals ('arabic' | 'rail' | 'roman' | 'fancy'),
   hands (false = a shadow instead, the sundial), a 1-2 line history note, and its own words for the body and extra parts.
   CR.partInfo(styleId, key) -> { name, line } for a part key: face, rim, hour, minute, second, pin, h1..h12, m1..m59, or an extra. */
window.CR = window.CR || {};
(() => {
  const C = window.CR;
  C.styles = [
    { id: 'simple', name: 'Simple', numerals: 'arabic', hands: true,
      note: 'Clocks got a minute hand once the pendulum clock (1656) made them exact. This plain 1 to 12 dial is the one schools use to teach time.',
      parts: { face: ['Clock face', 'The round front of the clock with the numbers and marks.'], rim: ['Rim', 'The ring around the face that holds the glass.'] } },
    { id: 'rail', name: 'Railway station', numerals: 'rail', hands: true,
      note: 'Trains need every station on the same time, so big clocks hang on the platforms. Bars instead of numbers are quick to read from far away.',
      parts: { face: ['Station clock face', 'A plain white face with only 12, 3, 6 and 9 written, so it is easy to read from far.'],
        rim: ['Black rim', 'A thick black ring, easy to spot across a busy platform.'] } },
    { id: 'roman', name: 'Roman wall clock', numerals: 'roman', hands: true,
      note: 'Roman numbers come from ancient Rome. Many wall and tower clocks still use them, like Big Ben in London.',
      parts: { face: ['Clock face', 'The front of the clock, with the hours in Roman numbers.'], rim: ['Wooden frame', 'A wooden ring that hangs the clock on the wall.'] } },
    { id: 'pocket', name: 'Pocket watch', numerals: 'fancy', hands: true,
      note: 'Before wristwatches, people carried a watch in a pocket on a chain. They were popular for about 300 years, until around 1920.',
      parts: { face: ['Watch face', 'The small round front of the watch, with fancy numbers.'], rim: ['Gold case', 'The metal case that keeps the watch safe in a pocket.'],
        crown: ['Crown', 'The knob on top. Turn it to wind the watch and set the time.'], bow: ['Bow', 'The ring on top where the chain is fixed.'],
        chain: ['Chain', 'It clips the watch to a coat, so it does not fall or get lost.'] } },
    { id: 'grand', name: 'Grandfather clock', numerals: 'roman', hands: true,
      note: 'Tall "longcase" clocks were first made in England around 1680. The name grandfather clock comes from a song from 1876.',
      parts: { face: ['Clock face', 'The dial at the top of the tall case, with Roman numbers.'], rim: ['Dial ring', 'The brass ring around the clock face.'],
        case: ['Tall case', 'A wooden case taller than a person. The hood on top holds the dial, the trunk holds the long pendulum.'],
        pendulum: ['Pendulum', 'It swings from side to side once every second and keeps the clock on time.'] } },
    { id: 'cuckoo', name: 'Cuckoo clock', numerals: 'arabic', hands: true,
      note: 'Cuckoo clocks come from the Black Forest in Germany, from the 1700s. A little bird pops out and calls "cuckoo" every hour.',
      parts: { face: ['Clock face', 'The round dial in the middle of the little wooden house.'], rim: ['Carved case', 'The case is carved from wood, often with leaves and birds.'],
        roof: ['Carved roof', 'A roof like a little house, carved by hand.'], bird: ['Cuckoo bird', 'At every hour the door opens, the bird pops out and calls "cuckoo".'],
        weights: ['Pine cone weights', 'Heavy weights on chains slowly drop and power the clock. Pull them up to wind it.'],
        pendulum: ['Pendulum', 'The little leaf swings to and fro and keeps the clock on time.'] } },
    { id: 'sun', name: 'Sundial', numerals: 'roman', hands: false,
      note: 'Sundials are the oldest clocks: people in Egypt used shadow clocks over 3,000 years ago. They only work when the sun shines.',
      parts: { face: ['Dial plate', 'A flat stone plate with the hours marked in Roman numbers.'], rim: ['Stone edge', 'The edge of the stone dial.'],
        gnomon: ['Gnomon', 'The slanted fin in the middle. It blocks the sun and makes the shadow. Say it "NO-mon".'],
        shadow: ['Shadow', 'As the sun moves across the sky the shadow moves too and points at the hour.'] } }
  ];
  C.styleById = id => C.styles.find(s => s.id === id) || C.styles[0];
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  C.roman = n => ROMAN[n];
  C.hourLabel = (st, n) => st.numerals === 'roman' ? ROMAN[n] : st.numerals === 'rail' && n % 3 ? '' : String(n);
  const ROMAN_HOW = { 4: ' (one before five)', 9: ' (one before ten)', 6: ' (five and one)', 11: ' (ten and one)' };
  C.partInfo = (id, key) => {
    const st = C.styleById(id), own = st.parts[key], shadow = !st.hands;
    if (own) return { name: own[0], line: own[1] };
    const who = shadow ? 'the shadow' : 'the short hand';
    let m = /^h(\d+)$/.exec(key);
    if (m) {
      const n = +m[1], oc = n + ' o\u2019clock';
      if (st.numerals === 'roman') return { name: ROMAN[n] + ' \u2013 ' + oc, line: ROMAN[n] + ' is ' + n + ' in Roman numbers' + (ROMAN_HOW[n] || '') + '. When ' + who + ' points here, it\u2019s ' + n + '.' };
      if (st.numerals === 'rail' && n % 3) return { name: oc + ' (bar)', line: 'No number here, but this bar is ' + n + '. When the short hand points here, it\u2019s ' + n + '.' };
      return { name: oc, line: 'When ' + who + ' points here, it\u2019s ' + n + '.' + (shadow ? '' : ' The long hand here means ' + (n === 12 ? 'o\u2019clock.' : n * 5 + ' minutes past.')) };
    }
    m = /^m(\d+)$/.exec(key);
    if (m) {
      const n = +m[1];
      return shadow ? { name: 'Minute mark ' + n, line: 'A sundial only shows hours well. These small marks are just for the look.' }
        : { name: 'Minute ' + n, line: 'When the long hand points here, it\u2019s ' + n + ' minute' + (n === 1 ? '' : 's') + ' past the hour.' };
    }
    const base = {
      hour: ['Hour hand', 'The short black hand. It shows the hour and moves slowly round, once every 12 hours.'],
      minute: ['Minute hand', 'The long blue hand. It shows the minutes and goes round once every hour.'],
      second: ['Second hand', st.id === 'rail' ? 'The thin red hand with a round end. It goes round once every minute.' : 'The thin red hand. It goes round once every minute, one step each second.'],
      pin: ['Centre pin', 'All the hands turn around this pin in the middle.'],
      face: ['Clock face', 'The front of the clock.'], rim: ['Rim', 'The edge of the clock.']
    }[key];
    return base ? { name: base[0], line: base[1] } : null;
  };
})();
