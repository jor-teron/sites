const {test}=require('node:test');
const a=require('node:assert/strict');
const H=require('../core/logic.js');
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
