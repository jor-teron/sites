(function (root) {
  'use strict';
  const E = root.English || (typeof require !== 'undefined' ? require('./logic.js') : {});
  E.numbers = [
    ['0','zero'],['1','one'],['2','two'],['3','three'],['4','four'],['5','five'],
    ['6','six'],['7','seven'],['8','eight'],['9','nine'],['10','ten']
  ].map(([glyph, name], i) => ({ id: 'number-' + i, value: i, glyph, name }));
  E.digraphs = [
    ['sh','ship','ship','⛵','The two letters sh make one sound, as in ship, shop or fish.'],
    ['ch','chop','chop','🔪','The two letters ch make one sound, as in chop, chair or much.'],
    ['th','thin','thin','➖','th can be a quiet sound, as in thin or think, or a voiced sound, as in this or that.'],
    ['wh','whale','whale','🐋','The two letters wh usually say w, as in whale, when or white.'],
    ['ph','phone','phone','📱','The two letters ph say f, as in phone, photo or elephant.'],
    ['ck','duck','duck','🦆','The two letters ck say k at the end of a short-vowel word, as in duck, back or kick.'],
    ['ng','ring','ring','💍','The two letters ng say the sound at the end of ring, king or song.'],
    ['qu','queen','queen','👑','q is almost always written with u. Together they say kw, as in queen or quilt.']
  ].map(([glyph, word, meaning, emoji, hint], i) => ({ id: 'digraph-' + i, kind: 'digraph', glyph, word, meaning, emoji, hint }));
  E.blends = [
    ['bl','blue','blue','🔵'],['cl','clap','clap','👏'],['fl','flag','flag','🚩'],['gl','glue','glue','🧴'],
    ['pl','plum','plum','🟣'],['sl','slip','slip','👣'],['br','brown','brown','🟤'],['cr','crab','crab','🦀'],
    ['dr','drum','drum','🥁'],['fr','frog','frog','🐸'],['gr','green','green','🟢'],['pr','pram','pram','🍼'],
    ['tr','tree','tree','🌳'],['st','star','star','⭐'],['sm','smile','smile','😊'],['sn','snake','snake','🐍'],
    ['sw','swim','swim','🏊'],['tw','twin','twin','👯'],['sk','skip','skip','⏭️'],['sp','spoon','spoon','🥄']
  ].map(([glyph, word, meaning, emoji], i) => ({ id: 'blend-' + i, kind: 'blend', glyph, word, meaning, emoji, hint: 'The first two sounds are said closely together, as in ' + word + '.' }));
  E.cvc = [
    ['a','cat','bat','hat','mat','rat','bag','cap','fan','jam','man','pan','van','sad','dad','tap'],
    ['e','bed','red','hen','pen','ten','net','pet','wet','leg','yes','jet','web','set','men','fed'],
    ['i','big','dig','fig','pig','pin','tin','win','sit','hit','lip','six','kid','lid','bin','rip'],
    ['o','dog','log','hot','pot','top','hop','mop','box','fox','cot','dot','job','mom','pop','not'],
    ['u','sun','bun','run','cup','bus','hut','nut','bug','jug','mug','pup','tub','rug','cut','fun']
  ].map(([vowel, ...words]) => ({ id: 'cvc-' + vowel, vowel, words: [...new Set(words)] }));
  E.cvcWords = E.cvc.flatMap(g => g.words.map((word, i) => ({ id: 'cvc-' + g.vowel + '-' + i, vowel: g.vowel, word })));
  E.sight = ['the','is','a','and','to','i','you','it','in','of','that','was','for','on','are','as','with','they','at','be','this','have','from','or','one','had','by','but','not','what','all','we','when','your','can','said','there','she','he','do','how','if','will','up','out','so','some','her','him','my','go','see','no','yes','come','look','like','make','them','then','down','day','did','get']
    .map((word, i) => ({ id: 'sight-' + i, word, display: word === 'i' ? 'I' : word }));
  if (typeof module !== 'undefined') module.exports = E;
})(typeof window !== 'undefined' ? window : globalThis);
