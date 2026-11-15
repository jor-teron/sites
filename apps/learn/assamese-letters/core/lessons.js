(function(root) {
  'use strict';
  const A=root.Assamese || (typeof require!=='undefined' ? require('./logic.js') : {});
  const nfc=A.nfc;
  // Inherent vowel + the 10 vowel signs (কাৰ) + 3 nasal/breath signs.
  A.matras=[
    ['অ','','a','The consonant already carries the vowel অ (said o in Assamese).'],
    ['আ','া','ā','আ-কাৰ: sign to the right.'],
    ['ই','ি','i','ই-কাৰ: typed AFTER the consonant but drawn to its LEFT.'],
    ['ঈ','ী','ī','ঈ-কাৰ: sign to the right; sounds like ই.'],
    ['উ','ু','u','উ-কাৰ: sign below.'],
    ['ঊ','ূ','ū','ঊ-কাৰ: sign below; sounds like উ.'],
    ['ঋ','ৃ','ri','ঋ-কাৰ: small hook below.'],
    ['এ','ে','e','এ-কাৰ: typed after the consonant but drawn to its LEFT.'],
    ['ঐ','ৈ','oi','ঐ-কাৰ: drawn to the LEFT.'],
    ['ও','ো','o','ও-কাৰ: two parts, one on each side of the consonant.'],
    ['ঔ','ৌ','ou','ঔ-কাৰ: two parts, one on each side of the consonant.'],
    ['অং','ং','aṅ','Anusvara is a nasal sign (ng), not a vowel sign.'],
    ['অঃ','ঃ','aḥ','Visarga is a breath sign, not a vowel sign.'],
    ['অঁ','ঁ','am̐','Chandrabindu nasalises the vowel.']
  ].map(([vowel,sign,roman,hint],id)=>({id:'matra-'+id,vowel:nfc(vowel),sign:nfc(sign),roman,hint}));
  A.barakhadi=consonant=>{
    const letter=A.basic.find(l=>l.glyph===nfc(consonant)); if(!letter) throw new Error('Choose a basic consonant');
    const stem=letter.tr.slice(0,-1);
    return A.matras.map(m=>Object.assign({},m,{glyph:letter.glyph+m.sign,roman:stem+m.roman}));
  };
  // Bengali-Assamese script shows a hasanta (্) or a joined shape; there are few "half letters".
  A.halves=[
    ['ৰ্','ৰ্ + ম → ৰ্ম (ৰেফ: drawn as a mark on top)','ধৰ্ম','religion / duty','🛕'],
    ['ক্','ক্ + য → ক্য (য-ফলা)','বাক্য','sentence','💬'],
    ['ন্','ন্ + ন → ন্ন','অন্ন','cooked rice / food','🍚'],
    ['স্','স্ + ক → স্ক','স্কুল','school','🏫']
  ].map(([glyph,parts,word,meaning,emoji],i)=>({id:'half-'+i,glyph:nfc(glyph),parts:nfc(parts),word:nfc(word),meaning,emoji}));
  A.joins=[
    ['ক্ষ','ক্ + ষ','kṣa · said khya','ক্ষমা','forgiveness','🤝'],
    ['জ্ঞ','জ্ + ঞ','jña · said gya','জ্ঞান','knowledge','📚'],
    ['ন্ত','ন্ + ত','nta','শান্ত','calm','😌'],
    ['স্ত','স্ + ত','sta · said xta','ৰাস্তা','road','🛣️'],
    ['ক্ত','ক্ + ত','kta','ৰক্ত','blood','🩸'],
    ['ঙ্ক','ঙ্ + ক','ṅka','অঙ্ক','sum / maths','➕'],
    ['ন্দ','ন্ + দ','nda','আনন্দ','joy','😊'],
    ['ম্প','ম্ + প','mpa','কম্পিউটাৰ','computer','💻'],
    ['ত্ৰ','ত্ + ৰ','tra','ত্ৰিভুজ','triangle','🔺'],
    ['শ্ৰ','শ্ + ৰ','śra · said xra','শ্ৰম','work / effort','🧑‍🌾']
  ].map(([glyph,parts,roman,word,meaning,emoji],i)=>({id:'join-'+i,glyph:nfc(glyph),parts:nfc(parts),roman,word:nfc(word),meaning,emoji}));
  A.numbers=[['শূন্য','xunyo'],['এক','ek'],['দুই','dui'],['তিনি','tini'],['চাৰি','sari'],['পাঁচ','pas'],['ছয়','soy'],['সাত','xat'],['আঠ','ath'],['ন','no'],['দহ','doh']]
    .map(([name,roman],i)=>({id:'number-'+i,value:i,glyph:String(i).replace(/\d/g,d=>'০১২৩৪৫৬৭৮৯'[+d]),name:nfc(name),roman}));
  if(typeof module!=='undefined') module.exports=A;
})(typeof window!=='undefined'?window:globalThis);
