const {test}=require('node:test');
const a=require('node:assert/strict');
const H=require('../core/games.js');
function seed(n) {return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
test('4 modes × 100 seeds: valid questions, unique ids/options, solvable tile multisets',()=>{
  for(const mode of ['find','picture','build','listen']) for(let seedNo=0;seedNo<100;seedNo++) {
    const g=H.createGame(mode,seed(seedNo));a.equal(g.questions.length,10);a.equal(new Set(g.questions.map(q=>q.target.id)).size,10);
    for(const q of g.questions) {
      if(mode==='build') a.deepEqual(q.tiles.map(t=>t.text).sort(),H.units(q.target.word).sort());
      else {a.equal(q.options.length,4);a.equal(new Set(q.options.map(x=>x.id)).size,4);a.ok(q.options.some(x=>x.id===q.target.id));}
    }
  }
});
test('each mode finishes ten correct questions; paused/repeated answers cannot inflate score',()=>{
  for(const mode of ['find','picture','build','listen']) {
    const g=H.createGame(mode,seed(10));
    a.equal(H.next(g),false);
    for(let i=0;i<10;i++) {
      const q=H.current(g),v=q.target.word && mode==='build'?q.target.word:q.target.id;
      g.paused=true;a.equal(H.answer(g,v),null);a.equal(H.next(g),false);g.paused=false;
      a.equal(H.answer(g,v),true);a.equal(H.answer(g,v),null);a.equal(H.next(g),true);
    }
    a.equal(g.correct,10);a.equal(g.finished,true);a.equal(H.next(g),false);a.equal(H.answer(g,''),null);
  }
});
test('wrong answer is locked, scores stay bounded, unknown modes rejected',()=>{
  const g=H.createGame('find',seed(7));a.equal(H.answer(g,'not-an-id'),false);a.equal(H.answer(g,H.current(g).target.id),null);a.equal(g.correct,0);
  a.deepEqual([0,3,4,6,7,8,9,10].map(H.gameStars),[0,0,1,1,2,2,3,3]);a.throws(()=>H.createGame('nope'));
});
test('Unicode letter groups preserve vowel marks, nukta and conjuncts, including fallback',()=>{
  for(const word of ['किताब','पापा','क्षमा','बुद्ध','आड़ू','माँ','स्ट्रॉबेरी']) a.equal(H.units(word).join(''),word);
  a.deepEqual(H.units('पापा'),['पा','पा']);
  const old=Intl.Segmenter;
  try {Intl.Segmenter=undefined; a.deepEqual(H.units('किताब'),['कि','ता','ब']);a.deepEqual(H.units('क्षमा'),['क्ष','मा']);a.deepEqual(H.units('बुद्ध'),['बु','द्ध']);a.equal(H.units('आड़ू').join(''),'आड़ू');}
  finally {Intl.Segmenter=old;}
});
test('tile indexes are reusable only after undo and repeated letters remain distinct',()=>{
  const g=H.createGame('build',seed(1));
  const q=H.current(g);q.target={word:'पापा'};q.tiles=[{id:1,text:'पा'},{id:0,text:'पा'}];
  a.equal(H.tile(g,0),true);a.equal(H.tile(g,0),false);a.equal(H.tile(g,-1),false);
  a.equal(H.tile(g,1),true);a.equal(H.built(g),'पापा');a.equal(H.answer(g,H.built(g)),true);
  a.equal(H.tile(g,0),false);
});
test('streak uses calendar days: same day, gap, leap day, year rollover and backwards clock',()=>{
  let s=H.activity({},'2026-11-10');a.equal(s.count,1);a.deepEqual(H.activity(s,'2026-11-10'),s);
  s=H.activity(s,'2026-11-11');a.equal(s.count,2);a.equal(H.activity(s,'2026-11-09').count,2);
  s=H.activity(s,'2026-11-13');a.equal(s.count,1);a.equal(s.best,2);
  a.equal(H.activity({day:'2024-02-28',count:2},'2024-02-29').count,3);
  a.equal(H.activity({day:'2026-12-31',count:3},'2027-01-01').count,4);
  a.equal(H.localDay(new Date(2026,10,10,23,30)),'2026-11-10');
});
