/* Everyday Assamese words in eight themes. Emoji are mnemonic approximations; English labels
 * disambiguate them. Words to recognise, not a dictionary. Spellings avoid the apostrophe forms
 * (e.g. ক'লা) so every word is pure Assamese script. */
(function(root) {
  'use strict';
  const A=root.Assamese || (typeof require!=='undefined' ? require('./lessons.js') : {});
  const themes=[
    ['fruits','ফল · Fruits',[
      ['আম','mango','🥭'],['কল','banana','🍌'],['আপেল','apple','🍎'],['আঙুৰ','grapes','🍇'],
      ['ডালিম','pomegranate','🔴'],['কমলা','orange','🍊'],['মধুৰিআম','guava','🍏'],['অমিতা','papaya','🍈'],
      ['তৰমুজ','watermelon','🍉'],['নাৰিকল','coconut','🥥'],['নেমু','lemon','🍋'],['আনাৰস','pineapple','🍍'],
      ['লিচু','lychee','🍒'],['কঠাল','jackfruit','🌳'],['জামু','java plum','🟣'],['বগৰি','jujube','🟤'],
      ['ঔটেঙা','elephant apple','🟢']
    ]],
    ['animals','জীৱ-জন্তু · Animals',[
      ['গৰু','cow','🐄'],['ছাগলী','goat','🐐'],['কুকুৰ','dog','🐕'],['মেকুৰী','cat','🐈'],
      ['হাতী','elephant','🐘'],['বাঘ','tiger','🐅'],['সিংহ','lion','🦁'],['ঘোঁৰা','horse','🐎'],
      ['গঁড়','rhinoceros','🦏'],['বান্দৰ','monkey','🐒'],['ভালুক','bear','🐻'],['হৰিণা','deer','🦌'],
      ['মাছ','fish','🐟'],['চৰাই','bird','🐦'],['হাঁহ','duck','🦆'],['কুকুৰা','chicken','🐔'],
      ['পৰুৱা','ant','🐜'],['ভেকুলী','frog','🐸'],['সাপ','snake','🐍'],['শিয়াল','jackal','🦊'],
      ['মহ','mosquito','🦟'],['কাছ','turtle','🐢'],['পখিলা','butterfly','🦋'],['এন্দুৰ','rat','🐀']
    ]],
    ['family','পৰিয়াল · Family',[
      ['মা','mother','👩'],['দেউতা','father','👨'],['ককাই','elder brother','👦'],['ভাই','younger brother','🧒'],
      ['বাইদেউ','elder sister','👧'],['ভনী','younger sister','👶'],['আইতা','grandmother','👵'],['ককা','grandfather','👴'],
      ['খুৰা','uncle: father\u2019s younger brother','🧔'],['মামা','uncle: mother\u2019s brother','👨‍🦱'],
      ['পেহী','aunt: father\u2019s sister','👩‍🦱'],['মাহী','aunt: mother\u2019s sister','👩‍🦰'],
      ['পৰিয়াল','family','👪'],['বন্ধু','friend','🤝']
    ]],
    ['colours','ৰং · Colours',[
      ['ৰং','colour','🎨'],['ৰঙা','red','🔴'],['নীলা','blue','🔵'],['সেউজীয়া','green','🟢'],
      ['হালধীয়া','yellow','🟡'],['বগা','white','⚪'],['গোলাপী','pink','🩷'],['বেঙুনীয়া','purple','🟣'],
      ['মটিয়া','brown','🟤'],['ধূসৰ','grey','🩶']
    ]],
    ['body','শৰীৰ · Body',[
      ['মূৰ','head','🙂'],['চকু','eye','👁️'],['কাণ','ear','👂'],['নাক','nose','👃'],
      ['মুখ','mouth / face','👄'],['দাঁত','tooth','🦷'],['জিভা','tongue','👅'],['চুলি','hair','💇'],
      ['হাত','hand / arm','✋'],['ভৰি','foot / leg','🦶'],['আঙুলি','finger','☝️'],['পেট','stomach','🫃'],
      ['ডিঙি','neck','🧣'],['কান্ধ','shoulder','💪'],['হৃদয়','heart','❤️'],['আঁঠু','knee','🦵']
    ]],
    ['home','ঘৰ · Home',[
      ['ঘৰ','house','🏠'],['দুৱাৰ','door','🚪'],['খিৰিকী','window','🪟'],['চকী','chair','🪑'],
      ['মেজ','table','🪵'],['বিচনা','bed','🛏️'],['গাৰু','pillow','🛌'],['কিতাপ','book','📕'],
      ['কলম','pen','🖊️'],['পানী','water','💧'],['বাটি','bowl','🥣'],['কাঁহী','plate','🍽️'],
      ['চামুচ','spoon','🥄'],['ঘড়ী','clock / watch','⏰'],['চাবি','key','🔑'],['চাকি','lamp','🪔'],
      ['ছাতি','umbrella','☂️'],['জোতা','shoe','👞'],['কাপোৰ','cloth / clothes','👕'],['গামোচা','gamosa: Assamese towel','🧣']
    ]],
    ['nature','প্ৰকৃতি · Nature',[
      ['বেলি','sun','☀️'],['জোন','moon','🌙'],['তৰা','star','⭐'],['আকাশ','sky','🌌'],
      ['ডাৱৰ','cloud','☁️'],['বৰষুণ','rain','🌧️'],['বতাহ','wind','🌬️'],['নদী','river','🏞️'],
      ['পাহাৰ','hill / mountain','⛰️'],['গছ','tree','🌳'],['ফুল','flower','🌼'],['পাত','leaf','🍃'],
      ['ঘাঁহ','grass','🌱'],['হাবি','forest','🌲'],['শিল','stone','🪨'],['নিয়ৰ','dew','💧'],
      ['ৰাতি','night','🌃'],['পুৱা','morning','🌅'],['আবেলি','afternoon','🌇'],['মাটি','soil / earth','🟫'],
      ['জুই','fire','🔥'],['পথাৰ','paddy field','🌾']
    ]],
    ['food','খাদ্য · Food',[
      ['ভাত','cooked rice','🍚'],['চাউল','uncooked rice','🌾'],['দাইল','lentils','🥣'],['গাখীৰ','milk','🥛'],
      ['দৈ','yogurt','🥛'],['কণী','egg','🥚'],['আলু','potato','🥔'],['পিঁয়াজ','onion','🧅'],
      ['বিলাহী','tomato','🍅'],['লোণ','salt','🧂'],['চেনী','sugar','🍬'],['মৌ','honey','🍯'],
      ['পিঠা','rice cake','🍘'],['চাহ','tea','🍵'],['তেল','oil','🫗'],['মাংস','meat','🍖'],
      ['লাও','bottle gourd','🥒'],['জলকীয়া','chilli','🌶️'],['আদা','ginger','🫚'],['নহৰু','garlic','🧄']
    ]]
  ];
  A.themes=themes.map(([id,label])=>({id,label}));
  A.words=themes.flatMap(([theme,label,rows])=>rows.map(([word,meaning,emoji],i)=>({id:theme+'-'+i,theme,label,word:A.nfc(word),meaning,emoji})));
  if(typeof module!=='undefined') module.exports=A;
})(typeof window!=='undefined'?window:globalThis);
