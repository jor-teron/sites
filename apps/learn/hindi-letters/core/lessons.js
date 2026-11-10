(function(root) {
  'use strict';
  const H=root.Hindi || (typeof require!=='undefined' ? require('./logic.js') : {});
  H.matras=[
    ['अ','','a','The consonant already carries the vowel अ.'],
    ['आ','ा','ā','Long aa: sign to the right.'],
    ['इ','ि','i','Short i: encoded AFTER the consonant but drawn to its left.'],
    ['ई','ी','ī','Long ee.'],
    ['उ','ु','u','Short u: sign below.'],
    ['ऊ','ू','ū','Long oo: sign below.'],
    ['ऋ','ृ','ṛ','Vocalic r, usually ri in Hindi.'],
    ['ए','े','e','Steady e: sign above.'],
    ['ऐ','ै','ai','Open ai: sign above.'],
    ['ओ','ो','o','Steady o.'],
    ['औ','ौ','au','Open au.'],
    ['अं','ं','aṃ','Anusvara is a nasal sign, not a vowel matra.'],
    ['अः','ः','aḥ','Visarga is a breath sign, not a vowel matra.']
  ].map(([vowel,sign,roman,hint],id)=>({id:'matra-'+id,vowel,sign,roman,hint}));
  H.barakhadi=consonant=>{
    const letter=H.basic.find(l=>l.glyph===consonant); if(!letter) throw new Error('Choose a basic consonant');
    const stem=letter.roman.slice(0,-1);
    return H.matras.map(m=>Object.assign({},m,{glyph:consonant+m.sign,roman:stem+m.roman}));
  };
  H.halves=[
    ['क्','क् + य → क्य','क्या','what','❔'],
    ['म्','म् + म → म्म','चम्मच','spoon','🥄'],
    ['ल्','ल् + ल → ल्ल','बिल्ली','cat','🐈'],
    ['न्','न् + ह → न्ह','नन्हा','tiny','🐣'],
    ['स्','स् + त → स्त','पुस्तक','book','📕']
  ].map(([glyph,parts,word,meaning,emoji],i)=>({id:'half-'+i,glyph,parts,word,meaning,emoji}));
  H.joins=[
    ['क्ष','क् + ष','kṣa','क्षमा','forgiveness','🤝'],
    ['त्र','त् + र','tra','त्रिकोण','triangle','🔺'],
    ['ज्ञ','ज् + ञ','jña · usually gya','ज्ञान','knowledge','📚'],
    ['श्र','श् + र','śra','श्रम','work / effort','🧑‍🌾'],
    ['प्र','प् + र','pra','प्रणाम','respectful greeting','🙏'],
    ['द्ध','द् + ध','ddha','बुद्ध','Buddha','🧘']
  ].map(([glyph,parts,roman,word,meaning,emoji],i)=>({id:'join-'+i,glyph,parts,roman,word,meaning,emoji}));
  H.numbers=[['एक','ek'],['दो','do'],['तीन','tīn'],['चार','cār'],['पाँच','pā̃c'],['छह','chah'],['सात','sāt'],['आठ','āṭh'],['नौ','nau'],['दस','das']].map(([name,roman],i)=>({id:'number-'+(i+1),value:i+1,glyph:String(i+1).replace(/\d/g,d=>'०१२३४५६७८९'[+d]),name,roman}));
  if(typeof module!=='undefined') module.exports=H;
})(typeof window!=='undefined'?window:globalThis);
