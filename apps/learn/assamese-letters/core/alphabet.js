/* Classic script + Node export. Assamese (অসমীয়া) alphabet for beginners.
 * Chart: 11 vowels (স্বৰবৰ্ণ), 37 consonants (25 grouped + য ৰ ল ৱ শ ষ স হ + ক্ষ ড় ঢ় য়) and 4 signs (ৎ ং ঃ ঁ) = 52.
 * Assamese uses ৰ (ra) and ৱ (wa), not Bengali র / ব-for-w.
 * Romanisation (see README): roman = tile label. Mostly a simple script transliteration; where the
 * Assamese sound differs a lot it is shown after a slash, e.g. শ śa/xa, চ ca/sa, জ ja/za.
 * say = how the letter sounds in Assamese; tr = plain transliteration used to build syllable labels.
 * All Assamese strings are NFC-normalised (ড় ঢ় য় become base + nukta). */
(function (root) {
  'use strict';
  const nfc = s => (s || '').normalize('NFC');
  // [glyph, roman label, say, hint, word, meaning, emoji, note]
  const groups = [
    ['vowels', 'স্বৰবৰ্ণ · Vowels', [
      ['অ','a','ô','The inherent vowel: in Assamese a rounded o, like the o in hot.','অজগৰ','python','🐍'],
      ['আ','ā','a','Open a, as in father.','আম','mango','🥭'],
      ['ই','i','i','i as in sit or see; Assamese does not separate short and long i in speech.','ইটা','brick','🧱'],
      ['ঈ','ī','i','Written long ī; sounds the same as ই in Assamese.','ঈগল','eagle','🦅'],
      ['উ','u','u','u as in put or moon.','উট','camel','🐪'],
      ['ঊ','ū','u','Written long ū; sounds the same as উ in Assamese.','ঊষা','dawn','🌅'],
      ['ঋ','ri','ri','Said ri; not English r alone.','ঋষি','sage','🧘'],
      ['এ','e','e','e as in bed or a steady ay.','এন্দুৰ','rat','🐀'],
      ['ঐ','oi','oi','oi as in oil.','ঐৰাৱত','Airavata: the elephant of Indra','🐘'],
      ['ও','o','o','A close o, near the oo in good.','ওঁঠ','lips','👄'],
      ['ঔ','ou','ou','ou: o gliding to u.','ঔষধ','medicine','💊']
    ]],
    ['ka','ক-বৰ্গ · Back of the tongue', [
      ['ক','ka','ko','k without a puff of air.','কল','banana','🍌'],
      ['খ','kha','kho','k with a puff of air.','খাৰু','bangle','⭕'],
      ['গ','ga','go','g as in go.','গৰু','cow','🐄'],
      ['ঘ','gha','gho','g with an extra breath.','ঘৰ','house','🏠'],
      ['ঙ','ṅa','ngo','ng as in sing; never starts a word.','ৰঙা','red','🔴','ঙ appears inside this word, not at its start.']
    ]],
    ['ca','চ-বৰ্গ · Middle of the tongue', [
      ['চ','ca/sa','so','In Assamese চ sounds like s in sun (not ch).','চৰাই','bird','🐦'],
      ['ছ','cha/sa','so','Also sounds like s in Assamese; written with a separate letter.','ছাতি','umbrella','☂️'],
      ['জ','ja/za','zo','In Assamese জ sounds like z in zoo (often j in loanwords).','জাহাজ','ship','🚢'],
      ['ঝ','jha/za','zo','z with an extra breath.','ঝৰণা','waterfall','🏞️'],
      ['ঞ','ña','nyo','A ny sound; mostly inside joined letters.','পঞ্চ','five (in compound words)','🖐️','ঞ appears inside the joined letter ঞ্চ here.']
    ]],
    ['retro','ট-বৰ্গ · Tongue tip up', [
      ['ট','ṭa','to','t with the tongue tip on the ridge behind the teeth. Assamese says ট and ত alike.','টকা','money / rupee','💰'],
      ['ঠ','ṭha','tho','t with a puff of air; sounds like থ in Assamese.','ঠেং','leg','🦵'],
      ['ড','ḍa','do','d with the tongue tip up; sounds like দ in Assamese.','ডাৱৰ','cloud','☁️'],
      ['ঢ','ḍha','dho','d with an extra breath; sounds like ধ in Assamese.','ঢোল','drum','🥁'],
      ['ণ','ṇa','no','Sounds like ন in Assamese; seldom starts a word.','বাণ','arrow','🏹','ণ appears inside this word, not at its start.']
    ]],
    ['dental','ত-বৰ্গ · Tongue near the teeth', [
      ['ত','ta','to','t without a puff of air.','তৰা','star','⭐'],
      ['থ','tha','tho','t with a puff of air; not English th.','থাল','plate','🍽️'],
      ['দ','da','do','d as in dog.','দাঁত','tooth','🦷'],
      ['ধ','dha','dho','d with an extra breath; not English th.','ধান','paddy (rice plant)','🌾'],
      ['ন','na','no','n as in name.','নদী','river','🏞️']
    ]],
    ['pa','প-বৰ্গ · Lips', [
      ['প','pa','po','p without a puff of air.','পখিলা','butterfly','🦋'],
      ['ফ','pha','pho','p with a puff of air; often like f.','ফুল','flower','🌼'],
      ['ব','ba','bo','b as in ball.','বাঘ','tiger','🐅'],
      ['ভ','bha','bho','b with an extra breath.','ভালুক','bear','🐻'],
      ['ম','ma','mo','m as in mother.','মাছ','fish','🐟']
    ]],
    ['other','অন্তঃস্থ আৰু উষ্ম বৰ্ণ · Other consonants', [
      ['য','ya/za','zo','Antastha ja: in Assamese it sounds like জ (z).','যাত্ৰা','journey','🧳'],
      ['ৰ','ra','ro','Assamese ৰ: a light tap r. Different from Bengali র.','ৰথ','chariot','🛞'],
      ['ল','la','lo','l as in leaf.','লাও','bottle gourd','🥒'],
      ['ৱ','wa','wo','Assamese ৱ: w as in water; mostly inside words.','দুৱাৰ','door','🚪','ৱ appears inside this word, not at its start.'],
      ['শ','śa/xa','xo','Assamese x: a soft breathy sound from the back of the mouth, like ch in Scottish loch.','শিয়াল','jackal','🦊'],
      ['ষ','ṣa/xa','xo','Also the Assamese x sound, same as শ.','ষড়ভুজ','hexagon','⬡'],
      ['স','sa/xa','xo','Also the Assamese x sound (স is s only in some loanwords).','সাপ','snake','🐍'],
      ['হ','ha','ho','A gentle h, as in hat.','হাতী','elephant','🐘']
    ]],
    ['extra','অন্য আখৰ · More letters', [
      ['ক্ষ','kṣa','khyo','ক্ + ষ joined: said khy in Assamese.','ক্ষমা','forgiveness','🤝'],
      ['ড়','ṛa','ro','A flapped r with a dot below; sounds like ৰ. Never starts a word.','গঁড়','rhinoceros','🦏','ড় appears at the end of this word.'],
      ['ঢ়','ṛha','rho','A breathy flapped r; rare. Never starts a word.','আষাঢ়','Ahar: a monsoon month','🌧️','ঢ় appears at the end of this word.'],
      ['য়','ẏa','yo','Antastha ya: y as in yes; mostly inside words.','ভয়','fear','😨','য় appears at the end of this word.']
    ]],
    ['signs','চিহ্ন · Signs', [
      ['ৎ','t','t','Khanda ta: a t with no vowel after it.','জগৎ','world','🌍'],
      ['অং','aṅ','ng','Anusvara ং: an ng sound after the vowel.','ৰং','colour','🎨','Shown with অ; in words ং sits after a letter as in ৰং.'],
      ['অঃ','aḥ','h','Visarga ঃ: a soft breath after the vowel; rare.','দুঃখ','sorrow','😔','Shown with অ; visarga appears inside this word.'],
      ['অঁ','am̐','nasal','Chandrabindu ঁ: says the vowel through the nose.','ঘোঁৰা','horse','🐎','Shown with অ; in ঘোঁৰা it sits over ো.']
    ]]
  ];
  const letters = groups.flatMap(([group, label, rows]) => rows.map((r, i) => ({
    id: group + '-' + i, group, label, glyph: nfc(r[0]), roman: r[1], tr: r[1].split('/')[0], say: r[2], hint: r[3], word: nfc(r[4]), meaning: r[5], emoji: r[6], note: r[7] || ''
  })));
  const A = { groups, letters, nfc,
    basic: letters.filter(l => !['vowels','signs'].includes(l.group)),
    // Letters that share a sound with another chart letter in Assamese: kept out of Listen & pick.
    listenSkip: ['ঈ','ঊ','ঙ','ঞ','ছ','ঝ','ট','ঠ','ড','ঢ','ণ','য','শ','ষ','ক্ষ','ড়','ঢ়'].map(nfc) };
  if (typeof module !== 'undefined') module.exports = A;
  root.Assamese = A;
})(typeof window !== 'undefined' ? window : globalThis);
