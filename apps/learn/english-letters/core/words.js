/* Everyday English picture words in eight themes. Emoji are mnemonic approximations.
 * Every word is lowercase a–z only (no spaces, hyphens or apostrophes). India-friendly
 * examples include mango, roti, rickshaw, auto, peacock, jamun, idli and lassi. */
(function (root) {
  'use strict';
  const E = root.English || (typeof require !== 'undefined' ? require('./lessons.js') : {});
  const themes = [
    ['fruits', 'Fruits', [
      ['apple','apple','🍎'],['banana','banana','🍌'],['chikoo','chikoo: sapota','🟤'],['coconut','coconut','🥥'],
      ['grapes','grapes','🍇'],['guava','guava','🍏'],['jackfruit','jackfruit','🌳'],['jamun','jamun: Indian blackberry','🟣'],
      ['lemon','lemon','🍋'],['lychee','lychee','🍒'],['mango','mango','🥭'],['orange','orange','🍊'],
      ['papaya','papaya','🍈'],['pineapple','pineapple','🍍'],['plum','plum','🟣'],['pomegranate','pomegranate','🔴'],
      ['watermelon','watermelon','🍉']
    ]],
    ['animals', 'Animals', [
      ['ant','ant','🐜'],['bear','bear','🐻'],['camel','camel','🐫'],['cat','cat','🐈'],
      ['cow','cow','🐄'],['deer','deer','🦌'],['dog','dog','🐕'],['duck','duck','🦆'],
      ['elephant','elephant','🐘'],['fish','fish','🐟'],['fox','fox','🦊'],['frog','frog','🐸'],
      ['goat','goat','🐐'],['horse','horse','🐎'],['iguana','iguana','🦎'],['jackal','jackal','🦊'],
      ['lion','lion','🦁'],['monkey','monkey','🐒'],['parrot','parrot','🦜'],['peacock','peacock','🦚'],
      ['quail','quail','🐦'],['rabbit','rabbit','🐇'],['snake','snake','🐍'],['tiger','tiger','🐅'],
      ['yak','yak','🐃'],['zebra','zebra','🦓']
    ]],
    ['family', 'Family', [
      ['mother','mother','👩'],['father','father','👨'],['brother','brother','👦'],['sister','sister','👧'],
      ['baby','baby','👶'],['uncle','uncle','👨'],['aunt','aunt','👩'],['cousin','cousin','🧒'],
      ['grandmother','grandmother','👵'],['grandfather','grandfather','👴'],['family','family','👪'],
      ['friend','friend','🤝'],['child','child','🧒'],['parent','parent','🧑'],['queen','queen','👑']
    ]],
    ['colours', 'Colours', [
      ['red','red','🔴'],['blue','blue','🔵'],['green','green','🟢'],['yellow','yellow','🟡'],
      ['white','white','⚪'],['black','black','⚫'],['pink','pink','🩷'],['brown','brown','🟤'],
      ['purple','purple','🟣'],['grey','grey','🩶']
    ]],
    ['body', 'Body', [
      ['head','head','🙂'],['eye','eye','👁️'],['ear','ear','👂'],['nose','nose','👃'],
      ['mouth','mouth','👄'],['tooth','tooth','🦷'],['tongue','tongue','👅'],['hair','hair','💇'],
      ['hand','hand','✋'],['foot','foot','🦶'],['finger','finger','☝️'],['stomach','stomach','🫃'],
      ['neck','neck','🧣'],['shoulder','shoulder','💪'],['heart','heart','❤️'],['knee','knee','🦵']
    ]],
    ['home', 'Home and town', [
      ['house','house','🏠'],['door','door','🚪'],['window','window','🪟'],['chair','chair','🪑'],
      ['table','table','🪵'],['bed','bed','🛏️'],['pillow','pillow','🛌'],['book','book','📕'],
      ['pen','pen','🖊️'],['ink','ink','🖋️'],['plate','plate','🍽️'],['spoon','spoon','🥄'],
      ['clock','clock','⏰'],['key','key','🔑'],['lamp','lamp','🪔'],['umbrella','umbrella','☂️'],
      ['shoe','shoe','👞'],['quilt','quilt','🛏️'],['auto','auto: auto-rickshaw','🛺'],
      ['rickshaw','rickshaw','🚲'],['van','van','🚐'],['xray','X-ray','🩻']
    ]],
    ['nature', 'Nature', [
      ['sun','sun','☀️'],['moon','moon','🌙'],['star','star','⭐'],['sky','sky','🌌'],
      ['cloud','cloud','☁️'],['rain','rain','🌧️'],['wind','wind','🌬️'],['river','river','🏞️'],
      ['hill','hill','⛰️'],['tree','tree','🌳'],['flower','flower','🌼'],['leaf','leaf','🍃'],
      ['water','water','💧'],['forest','forest','🌲'],['kite','kite','🪁'],['night','night','🌃'],
      ['morning','morning','🌅'],['soil','soil','🟫'],['fire','fire','🔥'],['garden','garden','🏡'],
      ['nest','nest','🪺'],['village','village','🏘️']
    ]],
    ['food', 'Food', [
      ['rice','rice','🍚'],['roti','roti: Indian flatbread','🫓'],['dal','dal: lentils','🥣'],['milk','milk','🥛'],
      ['yogurt','yogurt','🥛'],['egg','egg','🥚'],['potato','potato','🥔'],['onion','onion','🧅'],
      ['tomato','tomato','🍅'],['salt','salt','🧂'],['sugar','sugar','🍬'],['honey','honey','🍯'],
      ['tea','tea','🍵'],['oil','oil','🫗'],['chilli','chilli','🌶️'],['ginger','ginger','🫚'],
      ['garlic','garlic','🧄'],['bread','bread','🍞'],['vegetable','vegetable','🥬'],['idli','idli: steamed rice cake','🍚'],
      ['lassi','lassi: yogurt drink','🥛'],['pickle','pickle','🥒']
    ]]
  ];
  E.themes = themes.map(([id, label]) => ({ id, label }));
  E.words = themes.flatMap(([theme, label, rows]) => rows.map(([word, meaning, emoji], i) => ({ id: theme + '-' + i, theme, label, word, meaning, emoji })));
  if (typeof module !== 'undefined') module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
