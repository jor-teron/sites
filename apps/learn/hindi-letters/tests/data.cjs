const {test}=require('node:test');
const a=require('node:assert/strict');
const H=require('../core/words.js');
test('49 entries: 13 vowel/sign entries, 33 basic consonants and 3 joined forms',()=>{
  a.equal(H.letters.length,49); a.equal(H.basic.length,33); a.equal(H.letters.filter(l=>l.group==='vowels').length,13);
  a.equal(new Set(H.letters.map(l=>l.id)).size,49); a.equal(new Set(H.letters.map(l=>l.glyph)).size,49);
  a.equal(H.letters.slice(0,13).map(l=>l.glyph).join(' '),'अ आ इ ई उ ऊ ऋ ए ऐ ओ औ अं अः');
});
test('valid Devanagari glyphs and examples, nonempty hints and meanings',()=>{
  for(const l of H.letters) {
    a.match(l.glyph,/^[\u0900-\u097f]+$/); a.match(l.word,/^[\u0900-\u097f]+$/); a.ok(l.hint && l.meaning && l.roman && l.emoji);
    for(const c of l.glyph+l.word) a.ok(c.codePointAt(0)>=0x900 && c.codePointAt(0)<=0x97f);
  }
});
test('grading requires coverage and precision; blank trace is not a star',()=>{
  a.equal(H.traceGrade(0,0).stars,0); a.equal(H.traceGrade(1,0).stars,0); a.equal(H.traceGrade(1,.1).stars,0);
  a.equal(H.traceGrade(.9,1).stars,3); a.equal(H.traceGrade(.7,1).stars,2); a.equal(H.traceGrade(.4,1).stars,1);
});

test('all 429 barakhadi combinations compose by Unicode logical order',()=>{
  a.equal(H.matras.length,13);
  for(const l of H.basic) {
    const forms=H.barakhadi(l.glyph); a.equal(forms.length,13);
    forms.forEach((m,i)=>a.equal(m.glyph,l.glyph+H.matras[i].sign));
    a.equal(forms[2].glyph.codePointAt(1),0x93f);
  }
  a.equal(H.barakhadi('क').map(m=>m.glyph).join(' '),'क का कि की कु कू कृ के कै को कौ कं कः');
  a.throws(()=>H.barakhadi('a'));
});
test('half forms and conjunct decomposition are explicit',()=>{
  a.equal(H.joins.length,6); a.equal(H.halves.length,5);
  for(const j of H.joins) a.equal(j.parts.replace(/ \+ /g,''),j.glyph);
  for(const h of H.halves) a.ok(h.glyph.endsWith('्'));
});
test('200 distinct picture words across eight themes, valid Unicode and unique ids',()=>{
  a.equal(H.words.length,200); a.equal(H.themes.length,8);
  a.equal(new Set(H.words.map(w=>w.id)).size,200);
  a.equal(new Set(H.words.map(w=>w.word.normalize('NFC'))).size,200);
  for(const w of H.words) {a.match(w.word,/^[\u0900-\u097f]+$/);a.ok(w.meaning && w.emoji);a.ok(H.themes.some(t=>t.id===w.theme));}
});
test('Hindi numerals 1–10 and names',()=>{
  a.equal(H.numbers.map(n=>n.glyph).join(' '),'१ २ ३ ४ ५ ६ ७ ८ ९ १०');
  a.equal(H.numbers.map(n=>n.name).join(' '),'एक दो तीन चार पाँच छह सात आठ नौ दस');
});

test('ids are unique across all learning data collections',()=>{
  const rows=[...H.letters,...H.matras,...H.halves,...H.joins,...H.numbers,...H.words];
  a.equal(new Set(rows.map(r=>r.id)).size,rows.length);
});
