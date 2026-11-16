const {test}=require('node:test');
const a=require('node:assert/strict');
const E=require('../core/words.js');
const AZ='abcdefghijklmnopqrstuvwxyz';
const WORD=/^[a-z]+$/;
test('26 unique letters A–Z, five vowels and 21 consonants, capital and small forms',()=>{
  a.equal(E.letters.length,26); a.equal(E.vowels.length,5); a.equal(E.consonants.length,21); a.equal(E.basic.length,26);
  a.equal(new Set(E.letters.map(l=>l.id)).size,26); a.equal(new Set(E.letters.map(l=>l.small)).size,26);
  a.equal(E.letters.map(l=>l.capital).join(''),'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  a.equal(E.letters.map(l=>l.small).join(''),AZ);
  a.equal(E.vowels.map(l=>l.capital).join(''),'AEIOU');
  a.equal(E.consonants.map(l=>l.capital).join(''),'BCDFGHJKLMNPQRSTVWXYZ');
});
test('each letter has a picture word starting with that letter, plus name, phonics, hint and emoji',()=>{
  for(const l of E.letters) {
    a.match(l.word,WORD); a.equal(l.word[0],l.small); a.equal(l.capital,l.small.toUpperCase());
    a.ok(l.name && l.phonics && l.phrase && l.hint && l.meaning && l.emoji && l.nameSpoken);
    a.match(l.phrase,new RegExp(' as in '+l.word+'$'));
    a.ok(l.strokes.capital.length>=1); a.ok(l.strokes.small.length>=1);
  }
  a.equal(E.letter('A').small,'a'); a.equal(E.letter('z').capital,'Z');
  a.equal(E.letter('Z').name,'zed'); a.equal(E.letter('Z').nameSpoken,'zed');
  a.equal(E.letter('W').nameSpoken,'double u');
});
test('stroke guides cover A–Z and a–z, with points inside a 0–100 box',()=>{
  for(const l of E.letters) {
    a.deepEqual(Object.keys(E.strokes).filter(k=>k===l.capital||k===l.small).sort(),[l.capital,l.small].sort());
    for(const form of ['capital','small']) {
      for(const stroke of l.strokes[form]) {
        a.ok(stroke.length>=2, l.capital+' '+form+' needs two points');
        for(const [x,y] of stroke) { a.ok(x>=0 && x<=100, x); a.ok(y>=0 && y<=100, y); }
      }
    }
  }
  a.equal(Object.keys(E.strokes).length,52);
});
test('grading requires coverage and precision; blank trace is not a star',()=>{
  a.equal(E.traceGrade(0,0).stars,0); a.equal(E.traceGrade(1,0).stars,0); a.equal(E.traceGrade(1,.1).stars,0);
  a.equal(E.traceGrade(.9,1).stars,3); a.equal(E.traceGrade(.7,1).stars,2); a.equal(E.traceGrade(.4,1).stars,1);
});
test('150 distinct picture words across eight themes, lowercase a–z only, unique ids, all 26 starters',()=>{
  a.equal(E.words.length,150); a.equal(E.themes.length,8);
  a.equal(new Set(E.words.map(w=>w.id)).size,150);
  a.equal(new Set(E.words.map(w=>w.word)).size,150);
  for(const w of E.words) { a.match(w.word,WORD); a.ok(w.meaning && w.emoji); a.ok(E.themes.some(t=>t.id===w.theme)); }
  a.equal([...new Set(E.words.map(w=>w.word[0]))].sort().join(''),AZ);
  for(const l of E.letters) a.ok(E.words.some(w=>w.word===l.word), l.word);
  for(const need of ['mango','roti','rickshaw','auto','peacock','jamun','idli','lassi','chilli','tiger']) a.ok(E.words.some(w=>w.word===need), need);
});
test('numbers 0–10 with English spellings; lesson lists are valid a–z words',()=>{
  a.equal(E.numbers.map(n=>n.glyph).join(' '),'0 1 2 3 4 5 6 7 8 9 10');
  a.equal(E.numbers.map(n=>n.name).join(' '),'zero one two three four five six seven eight nine ten');
  for(const n of E.numbers) a.match(n.name,WORD);
  a.equal(E.digraphs.length,8); a.equal(E.blends.length,20);
  a.deepEqual(E.digraphs.map(d=>d.glyph),['sh','ch','th','wh','ph','ck','ng','qu']);
  for(const d of [...E.digraphs,...E.blends]) { a.match(d.word,WORD); a.ok(d.word.includes(d.glyph), d.glyph+' in '+d.word); a.ok(d.emoji && d.hint); }
  a.equal(E.cvc.length,5); a.equal(E.cvcWords.length,75);
  for(const g of E.cvc) {
    a.equal(g.words.length,15); a.equal(new Set(g.words).size,15);
    for(const w of g.words) { a.match(w,/^[a-z]{3}$/); a.equal(w[1],g.vowel); }
  }
  a.equal(E.sight.length,64); a.equal(new Set(E.sight.map(s=>s.word)).size,64);
  for(const s of E.sight) a.match(s.word,WORD);
  a.equal(E.sight.find(s=>s.word==='i').display,'I');
  a.ok(E.sight.some(s=>s.word==='the') && E.sight.some(s=>s.word==='said'));
});
test('ids are unique across all learning data collections',()=>{
  const rows=[...E.letters,...E.numbers,...E.digraphs,...E.blends,...E.cvcWords,...E.sight,...E.words];
  a.equal(new Set(rows.map(r=>r.id)).size,rows.length);
});
test('voice choice prefers en-IN, then en-GB, then en-US, then any en',()=>{
  const list=[{lang:'en-AU'},{lang:'en-US'},{lang:'en-GB'},{lang:'en-IN'},{lang:'hi-IN'}];
  a.equal(E.pickVoice(list).voice.lang,'en-IN');
  a.equal(E.pickVoice(list.filter(v=>v.lang!=='en-IN')).voice.lang,'en-GB');
  a.equal(E.pickVoice(list.filter(v=>!/^en-(IN|GB)$/.test(v.lang))).voice.lang,'en-US');
  a.equal(E.pickVoice([{lang:'en-AU'}]).voice.lang,'en-AU');
  a.equal(E.pickVoice([{lang:'hi-IN'}]),null);
  const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../ui/audio.js'),'utf8');
  a.ok(src.includes('E.pickVoice'));
});
