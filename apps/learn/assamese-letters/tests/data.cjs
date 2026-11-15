const {test}=require('node:test');
const a=require('node:assert/strict');
const A=require('../core/words.js');
const AS=/^[\u0980-\u09ff]+$/;
test('52 entries: 11 vowels, 37 consonants and 4 signs',()=>{
  a.equal(A.letters.length,52); a.equal(A.basic.length,37); a.equal(A.letters.filter(l=>l.group==='vowels').length,11); a.equal(A.letters.filter(l=>l.group==='signs').length,4);
  a.equal(new Set(A.letters.map(l=>l.id)).size,52); a.equal(new Set(A.letters.map(l=>l.glyph)).size,52);
  a.equal(A.letters.slice(0,11).map(l=>l.glyph).join(' '),'অ আ ই ঈ উ ঊ ঋ এ ঐ ও ঔ');
  a.equal(A.basic.map(l=>l.glyph).join(' '),'ক খ গ ঘ ঙ চ ছ জ ঝ ঞ ট ঠ ড ঢ ণ ত থ দ ধ ন প ফ ব ভ ম য ৰ ল ৱ শ ষ স হ ক্ষ ড় ঢ় য়'.normalize('NFC'));
  a.equal(A.letters.filter(l=>l.group==='signs').map(l=>l.glyph).join(' '),'ৎ অং অঃ অঁ');
});
test('Assamese ৰ and ৱ are used, never Bengali র; strings are NFC',()=>{
  const all=[...A.letters.flatMap(l=>[l.glyph,l.word]),...A.words.map(w=>w.word),...A.joins.flatMap(j=>[j.glyph,j.word]),...A.halves.map(h=>h.word),...A.numbers.map(n=>n.name)];
  for(const s of all) {a.ok(!s.includes('\u09b0'),s); a.equal(s,s.normalize('NFC'));}
  a.equal(A.letters.find(l=>l.roman==='ra').glyph,'\u09f0'); a.equal(A.letters.find(l=>l.roman==='wa').glyph,'\u09f1');
});
test('valid Assamese glyphs and examples, nonempty hints, sounds and meanings; unique roman labels',()=>{
  for(const l of A.letters) {a.match(l.glyph,AS); a.match(l.word,AS); a.ok(l.hint && l.meaning && l.roman && l.say && l.emoji && l.tr);}
  a.equal(new Set(A.letters.map(l=>l.roman)).size,52);
  for(const g of ['শ','ষ','স']) a.match(A.letters.find(l=>l.glyph===g).roman,/\/xa$/);
});
test('grading requires coverage and precision; blank trace is not a star',()=>{
  a.equal(A.traceGrade(0,0).stars,0); a.equal(A.traceGrade(1,0).stars,0); a.equal(A.traceGrade(1,.1).stars,0);
  a.equal(A.traceGrade(.9,1).stars,3); a.equal(A.traceGrade(.7,1).stars,2); a.equal(A.traceGrade(.4,1).stars,1);
});
test('all 518 matra combinations compose by Unicode logical order',()=>{
  a.equal(A.matras.length,14); a.equal(A.matras.slice(1,11).map(m=>m.sign).join(' '),'া ি ী ু ূ ৃ ে ৈ ো ৌ');
  let n=0;
  for(const l of A.basic) {
    const forms=A.barakhadi(l.glyph); a.equal(forms.length,14); n+=forms.length;
    forms.forEach((m,i)=>{a.equal(m.glyph,l.glyph+A.matras[i].sign); a.match(m.glyph,AS);});
    a.equal(forms[2].glyph.codePointAt(forms[2].glyph.length-1),0x9bf);
  }
  a.equal(n,518);
  a.equal(A.barakhadi('ক').map(m=>m.glyph).join(' '),'ক কা কি কী কু কূ কৃ কে কৈ কো কৌ কং কঃ কঁ');
  a.equal(A.barakhadi('ক').map(m=>m.roman).join(' '),'ka kā ki kī ku kū kri ke koi ko kou kaṅ kaḥ kam̐');
  a.equal(A.barakhadi('শ')[1].roman,'śā'); a.throws(()=>A.barakhadi('a'));
});
test('hasanta forms and conjunct decomposition are explicit',()=>{
  a.equal(A.joins.length,10); a.equal(A.halves.length,4);
  a.equal(A.joins.map(j=>j.glyph).join(' '),'ক্ষ জ্ঞ ন্ত স্ত ক্ত ঙ্ক ন্দ ম্প ত্ৰ শ্ৰ');
  for(const j of A.joins) {a.equal(j.parts.replace(/ \+ /g,''),j.glyph); a.ok(j.word.includes(j.glyph),j.word);}
  for(const h of A.halves) {a.ok(h.glyph.endsWith('\u09cd')); a.match(h.word,AS);}
});
test('143 distinct picture words across eight themes, valid Unicode and unique ids',()=>{
  a.equal(A.words.length,143); a.equal(A.themes.length,8);
  a.equal(new Set(A.words.map(w=>w.id)).size,143);
  a.equal(new Set(A.words.map(w=>w.word.normalize('NFC'))).size,143);
  for(const w of A.words) {a.match(w.word,AS);a.ok(w.meaning && w.emoji);a.ok(A.themes.some(t=>t.id===w.theme));}
});
test('Assamese numerals 0–10 and names',()=>{
  a.equal(A.numbers.map(n=>n.glyph).join(' '),'০ ১ ২ ৩ ৪ ৫ ৬ ৭ ৮ ৯ ১০');
  a.equal(A.numbers.map(n=>n.name).join(' '),'শূন্য এক দুই তিনি চাৰি পাঁচ ছয় সাত আঠ ন দহ'.normalize('NFC'));
});
test('ids are unique across all learning data collections',()=>{
  const rows=[...A.letters,...A.matras,...A.halves,...A.joins,...A.numbers,...A.words];
  a.equal(new Set(rows.map(r=>r.id)).size,rows.length);
});
test('voice choice prefers as-IN, then bn-IN, then hi-IN',()=>{
  // ui/audio.js runs in the browser; its picker order is checked by reading the source.
  const src=require('node:fs').readFileSync(require('node:path').join(__dirname,'../ui/audio.js'),'utf8');
  const i=['/^as(','/^bn(','/^hi('].map(s=>src.indexOf(s)); a.ok(i.every(x=>x>0)); a.ok(i[0]<i[1]&&i[1]<i[2]);
});
