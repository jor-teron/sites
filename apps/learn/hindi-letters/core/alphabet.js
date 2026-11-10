/* Classic script + Node export. Simple transliteration keeps vowel length and retroflex dots.
 * Teaching convention: 13 vowel/sign entries; 33 basic consonants + 3 conjuncts = 36.
 * अं and अः are अ with anusvara/visarga, not independent vowels. */
(function (root) {
  'use strict';
  const groups = [
    ['vowels', 'स्वर · Vowels and signs', [
      ['अ','a','Short a, like the unstressed a in about.','अनार','pomegranate','🍎'],
      ['आ','ā','Long aa, as in father.','आम','mango','🥭'],
      ['इ','i','Short i, as in sit.','इमली','tamarind','🌳'],
      ['ई','ī','Long ee, as in see.','ईख','sugar cane','🌱'],
      ['उ','u','Short u, as in put.','उल्लू','owl','🦉'],
      ['ऊ','ū','Long oo, as in moon.','ऊन','wool','🧶'],
      ['ऋ','ṛ','Usually ri in modern Hindi; not English r alone.','ऋषि','sage','🧘'],
      ['ए','e','A steady long e; avoid the English ay glide.','एक','one','1️⃣'],
      ['ऐ','ai','An open vowel, roughly a in care; varies by accent.','ऐनक','spectacles','👓'],
      ['ओ','o','A steady long o; avoid the English oh glide.','ओस','dew','💧'],
      ['औ','au','An open rounded vowel, roughly aw in saw.','औरत','woman','👩'],
      ['अं','aṃ','Anusvara: a nasal sound; its sound depends on the next letter.','अंगूर','grapes','🍇'],
      ['अः','aḥ','Visarga: a soft breath after a vowel; rare in everyday Hindi.','दुःख','sorrow','😔','Visarga appears inside this word, not at its start.']
    ]],
    ['ka','क-वर्ग · Back of the tongue', [
      ['क','ka','k without a puff of air.','कमल','lotus','🪷'],
      ['ख','kha','k with a puff of air; not the ch in loch.','खरगोश','rabbit','🐇'],
      ['ग','ga','g as in go.','गमला','flowerpot','🪴'],
      ['घ','gha','g with an extra breath.','घर','house','🏠'],
      ['ङ','ṅa','ng as in sing; mostly occurs in combinations.','अंग','body part','💪','The nasal sound before ग is usually written with ं in Hindi, as in अंग.']
    ]],
    ['cha','च-वर्ग · Middle of the tongue', [
      ['च','ca','ch as in chair, without a strong puff.','चम्मच','spoon','🥄'],
      ['छ','cha','ch with a puff of air.','छाता','umbrella','☂️'],
      ['ज','ja','j as in jam.','जहाज','ship','🚢'],
      ['झ','jha','j with an extra breath.','झंडा','flag','🚩'],
      ['ञ','ña','A palatal nasal, like ny; mostly in combinations.','पंच','five / group of five','🖐️','Before च, the nasal is usually written ं in Hindi; the traditional conjunct is ञ्च.']
    ]],
    ['retro','ट-वर्ग · Tongue curled back', [
      ['ट','ṭa','t with the tongue curled back (retroflex).','टमाटर','tomato','🍅'],
      ['ठ','ṭha','Curled-back t with a puff of air.','ठेला','handcart','🛒'],
      ['ड','ḍa','d with the tongue curled back.','डमरू','small drum','🥁'],
      ['ढ','ḍha','Curled-back d with an extra breath.','ढोल','drum','🥁'],
      ['ण','ṇa','n with the tongue curled back.','बाण','arrow','🏹','ण appears inside this word; it seldom starts everyday Hindi words.']
    ]],
    ['dental','त-वर्ग · Tongue touches teeth', [
      ['त','ta','Soft dental t: tongue against the upper teeth.','तरबूज','watermelon','🍉'],
      ['थ','tha','Dental t with a puff; not English th.','थाली','plate','🍽️'],
      ['द','da','Dental d: tongue against the upper teeth.','दरवाजा','door','🚪'],
      ['ध','dha','Dental d with an extra breath; not English th.','धनुष','bow','🏹'],
      ['न','na','n as in name.','नल','tap','🚰']
    ]],
    ['pa','प-वर्ग · Lips', [
      ['प','pa','p without a puff of air.','पतंग','kite','🪁'],
      ['फ','pha','p with a puff; often pronounced f in modern Hindi.','फल','fruit','🍎'],
      ['ब','ba','b as in ball.','बतख','duck','🦆'],
      ['भ','bha','b with an extra breath.','भालू','bear','🐻'],
      ['म','ma','m as in mother.','मछली','fish','🐟']
    ]],
    ['other','अन्तःस्थ और ऊष्म · Other consonants', [
      ['य','ya','y as in yes.','याक','yak','🐂'],
      ['र','ra','A light tap of the tongue; not a long English r.','रथ','chariot','🛞'],
      ['ल','la','l as in leaf.','लट्टू','spinning top','🌀'],
      ['व','va','Between English v and w; avoid biting the lip strongly.','वन','forest','🌳'],
      ['श','śa','sh, with the tongue towards the palate.','शेर','lion','🦁'],
      ['ष','ṣa','Traditionally a curled-back sh; often like श in Hindi.','षट्कोण','hexagon','⬡'],
      ['स','sa','s as in sun.','सेब','apple','🍎'],
      ['ह','ha','A gentle h, as in hat.','हाथी','elephant','🐘']
    ]],
    ['joined','संयुक्त अक्षर · Joined letters (not basic consonants)', [
      ['क्ष','kṣa','क् + ष: k followed by sh.','क्षमा','forgiveness','🤝'],
      ['त्र','tra','त् + र: dental t followed by r.','त्रिकोण','triangle','🔺'],
      ['ज्ञ','jña','ज् + ञ; commonly gya in modern Hindi.','ज्ञान','knowledge','📚']
    ]]
  ];
  const letters = groups.flatMap(([group, label, rows]) => rows.map((r, i) => ({
    id: group + '-' + i, group, label, glyph: r[0], roman: r[1], hint: r[2], word: r[3], meaning: r[4], emoji: r[5], note: r[6] || ''
  })));
  const H = { groups, letters, basic: letters.filter(l => !['vowels','joined'].includes(l.group)) };
  if (typeof module !== 'undefined') module.exports = H;
  root.Hindi = H;
})(typeof window !== 'undefined' ? window : globalThis);
