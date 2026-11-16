/* Classic script + Node export. English alphabet for beginners.
 * Chart: 26 letters A–Z with capital and small forms, letter name, phonics and a picture word.
 * Words use lowercase a–z only. Z is named zed (India / British English). */
(function (root) {
  'use strict';
  // [capital, name, phonics, phrase, hint, word, meaning, emoji]
  const rows = [
    ['A','ay','a','a as in apple','Short a, as in apple. A also has a long sound, as in acorn (the letter name ay).','apple','apple','🍎'],
    ['B','bee','b','b as in banana','b as in banana or bus. The lips come together, then open.','banana','banana','🍌'],
    ['C','see','c','c as in cat','Hard c, as in cat (like k). C is also a soft s sound, as in city or rice.','cat','cat','🐈'],
    ['D','dee','d','d as in dog','d as in dog or door. The tongue taps behind the top teeth.','dog','dog','🐕'],
    ['E','ee','e','e as in elephant','Short e, as in elephant or egg. E also has a long sound, as in even (the letter name ee).','elephant','elephant','🐘'],
    ['F','ef','f','f as in fish','f as in fish or fan. A soft breath through the top teeth and lower lip.','fish','fish','🐟'],
    ['G','jee','g','g as in goat','Hard g, as in goat or garden. G is also a soft j sound, as in giant or giraffe.','goat','goat','🐐'],
    ['H','aitch','h','h as in horse','h as in horse or hand. A quiet breath, as in hat.','horse','horse','🐎'],
    ['I','eye','i','i as in ink','Short i, as in ink or igloo. I also has a long sound, as in ice (the letter name eye).','ink','ink','🖋️'],
    ['J','jay','j','j as in jamun','j as in jamun or jug. The same sound as the soft g in giant.','jamun','jamun: Indian blackberry','🟣'],
    ['K','kay','k','k as in kite','k as in kite or key. The same sound as hard c in cat.','kite','kite','🪁'],
    ['L','el','l','l as in lion','l as in lion or leaf. The tongue tip touches behind the top teeth.','lion','lion','🦁'],
    ['M','em','m','m as in mango','m as in mango or mother. The lips stay together.','mango','mango','🥭'],
    ['N','en','n','n as in nest','n as in nest or nose. The tongue touches behind the top teeth, and the sound comes through the nose.','nest','nest','🪺'],
    ['O','oh','o','o as in orange','Short o, as in orange or ox. O also has a long sound, as in open (the letter name oh).','orange','orange','🍊'],
    ['P','pee','p','p as in peacock','p as in peacock or pen. A short pop of air from the lips.','peacock','peacock','🦚'],
    ['Q','cue','qu','qu as in queen','Q is almost always followed by u. Together they say kw, as in queen or quilt.','queen','queen','👑'],
    ['R','ar','r','r as in roti','r as in roti or river. A light tap or a longer r, depending on the speaker.','roti','roti: Indian flatbread','🫓'],
    ['S','ess','s','s as in sun','s as in sun or snake. A hissing sound. S is also a z sound at the end of some words, as in is or has.','sun','sun','☀️'],
    ['T','tee','t','t as in tiger','t as in tiger or tea. The tongue taps behind the top teeth.','tiger','tiger','🐅'],
    ['U','you','u','u as in umbrella','Short u, as in umbrella or up. U also has a long sound, as in unicorn (the letter name you).','umbrella','umbrella','☂️'],
    ['V','vee','v','v as in van','v as in van or village. The top teeth touch the lower lip, with voice.','van','van','🚐'],
    ['W','double-u','w','w as in water','w as in water or window. Round the lips, as in we.','water','water','💧'],
    ['X','ex','x','x as in xray','X usually says ks, as in box or xray. At the start of a few words it can sound like z, as in xylophone.','xray','X-ray','🩻'],
    ['Y','wye','y','y as in yak','Y is a consonant at the start of a word, as in yak or yellow. It is a vowel in words such as sky, gym and happy.','yak','yak','🐃'],
    ['Z','zed','z','z as in zebra','z as in zebra or zoo. In India and Britain the letter name is zed, not zee.','zebra','zebra','🦓']
  ];
  // Simplified school-print stroke hints in a 0–100 box (y down). Arrows are guides, not exact pen strokes.
  const strokes = {
    A:[[[20,90],[50,12]],[[50,12],[80,90]],[[32,58],[68,58]]],
    B:[[[25,12],[25,90]],[[25,12],[62,12],[72,22],[72,40],[62,50],[25,50]],[[25,50],[68,50],[80,62],[80,80],[68,90],[25,90]]],
    C:[[[80,28],[70,14],[50,10],[28,22],[20,50],[28,78],[50,90],[70,86],[80,72]]],
    D:[[[25,12],[25,90]],[[25,12],[60,12],[80,28],[84,50],[80,72],[60,90],[25,90]]],
    E:[[[25,12],[25,90]],[[25,12],[78,12]],[[25,50],[68,50]],[[25,90],[78,90]]],
    F:[[[25,12],[25,90]],[[25,12],[78,12]],[[25,50],[68,50]]],
    G:[[[80,28],[70,14],[50,10],[28,22],[20,50],[28,78],[50,90],[72,82],[80,64],[80,54],[58,54]]],
    H:[[[25,12],[25,90]],[[75,12],[75,90]],[[25,50],[75,50]]],
    I:[[[50,12],[50,90]],[[30,12],[70,12]],[[30,90],[70,90]]],
    J:[[[70,12],[70,70],[60,88],[40,90],[25,78]],[[50,12],[85,12]]],
    K:[[[25,12],[25,90]],[[75,12],[25,52]],[[25,52],[78,90]]],
    L:[[[25,12],[25,90]],[[25,90],[78,90]]],
    M:[[[18,90],[18,12]],[[18,12],[50,70]],[[50,70],[82,12]],[[82,12],[82,90]]],
    N:[[[25,90],[25,12]],[[25,12],[75,90]],[[75,90],[75,12]]],
    O:[[[50,10],[28,18],[18,40],[18,60],[28,82],[50,90],[72,82],[82,60],[82,40],[72,18],[50,10]]],
    P:[[[25,12],[25,90]],[[25,12],[65,12],[78,24],[78,42],[65,54],[25,54]]],
    Q:[[[50,10],[28,18],[18,40],[18,60],[28,82],[50,90],[72,82],[82,60],[82,40],[72,18],[50,10]],[[58,70],[82,92]]],
    R:[[[25,12],[25,90]],[[25,12],[65,12],[78,24],[78,42],[65,54],[25,54]],[[50,54],[78,90]]],
    S:[[[75,25],[65,12],[45,10],[28,20],[28,35],[45,48],[60,54],[75,66],[75,80],[58,90],[35,88],[22,75]]],
    T:[[[20,12],[80,12]],[[50,12],[50,90]]],
    U:[[[20,12],[20,68],[30,86],[50,90],[70,86],[80,68],[80,12]]],
    V:[[[18,12],[50,90]],[[50,90],[82,12]]],
    W:[[[12,12],[30,90]],[[30,90],[50,30]],[[50,30],[70,90]],[[70,90],[88,12]]],
    X:[[[20,12],[80,90]],[[80,12],[20,90]]],
    Y:[[[18,12],[50,50]],[[82,12],[50,50]],[[50,50],[50,90]]],
    Z:[[[20,12],[80,12]],[[80,12],[20,90]],[[20,90],[80,90]]],
    a:[[[62,40],[48,28],[32,32],[26,48],[32,66],[48,72],[62,62],[62,40]],[[62,28],[62,72]]],
    b:[[[28,10],[28,72]],[[28,40],[45,28],[62,32],[70,48],[62,68],[45,72],[28,68]]],
    c:[[[68,38],[55,28],[38,30],[26,45],[28,62],[42,72],[60,68],[70,55]]],
    d:[[[70,10],[70,72]],[[70,40],[52,28],[35,32],[26,48],[32,68],[50,72],[70,66]]],
    e:[[[28,50],[68,50],[62,32],[45,26],[30,36],[28,55],[38,70],[55,72],[68,60]]],
    f:[[[62,22],[50,10],[38,18],[38,72]],[[25,42],[55,42]]],
    g:[[[68,38],[52,28],[35,32],[26,48],[35,68],[52,72],[68,60],[68,28]],[[68,28],[68,78],[58,92],[40,92],[28,82]]],
    h:[[[28,10],[28,72]],[[28,40],[48,28],[65,36],[68,50],[68,72]]],
    i:[[[50,28],[50,72]],[[50,12],[50,16]]],
    j:[[[55,28],[55,80],[45,92],[32,90]],[[55,12],[55,16]]],
    k:[[[28,10],[28,72]],[[62,28],[28,50]],[[28,50],[65,72]]],
    l:[[[50,10],[50,72]]],
    m:[[[22,28],[22,72]],[[22,40],[35,28],[48,40],[48,72]],[[48,40],[62,28],[76,40],[76,72]]],
    n:[[[28,28],[28,72]],[[28,40],[48,28],[65,36],[68,50],[68,72]]],
    o:[[[50,28],[32,32],[24,48],[32,68],[50,72],[68,68],[76,48],[68,32],[50,28]]],
    p:[[[28,28],[28,95]],[[28,36],[48,26],[66,32],[72,48],[66,66],[48,72],[28,66]]],
    q:[[[70,28],[70,95]],[[70,36],[52,26],[34,32],[26,48],[32,66],[50,72],[70,66]]],
    r:[[[30,28],[30,72]],[[30,40],[48,28],[62,32]]],
    s:[[[65,38],[52,28],[35,30],[28,40],[42,50],[58,54],[68,64],[60,72],[40,74],[28,64]]],
    t:[[[48,16],[48,66],[55,74],[65,72]],[[35,36],[62,36]]],
    u:[[[26,28],[26,58],[36,72],[52,72],[64,58],[64,28],[64,72]]],
    v:[[[25,28],[50,72]],[[50,72],[75,28]]],
    w:[[[15,28],[32,72]],[[32,72],[50,36]],[[50,36],[68,72]],[[68,72],[85,28]]],
    x:[[[25,28],[72,72]],[[72,28],[25,72]]],
    y:[[[25,28],[50,72]],[[75,28],[50,72],[38,95]]],
    z:[[[28,28],[70,28]],[[70,28],[28,72]],[[28,72],[70,72]]]
  };
  const letters = rows.map((r, i) => {
    const capital = r[0], small = r[0].toLowerCase();
    const group = 'AEIOU'.includes(capital) ? 'vowels' : 'consonants';
    return {
      id: group + '-' + i, group,
      label: group === 'vowels' ? 'Vowels' : 'Consonants',
      capital, small, glyph: capital, roman: r[1],
      name: r[1], phonics: r[2], phrase: r[3], hint: r[4],
      word: r[5], meaning: r[6], emoji: r[7],
      nameSpoken: capital === 'Z' ? 'zed' : capital === 'W' ? 'double u' : r[1],
      strokes: { capital: strokes[capital], small: strokes[small] }
    };
  });
  // Vowels were given ids vowels-0..4 but consonants keep the row index (5..25).
  // Rebuild stable ids: vowels-a, consonants-b, ... so they stay unique and readable.
  letters.forEach(l => { l.id = l.group + '-' + l.small; });
  const E = {
    letters,
    groups: [
      ['vowels', 'Vowels'],
      ['consonants', 'Consonants']
    ],
    vowels: letters.filter(l => l.group === 'vowels'),
    consonants: letters.filter(l => l.group === 'consonants'),
    basic: letters,
    strokes,
    letter: ch => letters.find(l => l.small === String(ch).toLowerCase())
  };
  if (typeof module !== 'undefined') module.exports = E;
  root.English = E;
})(typeof window !== 'undefined' ? window : globalThis);
