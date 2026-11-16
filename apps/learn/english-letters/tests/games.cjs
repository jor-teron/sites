const {test}=require('node:test');
const a=require('node:assert/strict');
const E=require('../core/games.js');
function seed(n) {return ()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
test('5 modes × 100 seeds: valid questions, unique targets/options, solvable tile multisets',()=>{
  for(const mode of E.gameModes) for(let seedNo=0;seedNo<100;seedNo++) {
    const g=E.createGame(mode,seed(seedNo)); a.equal(g.questions.length,10);
    const ids=g.questions.map(q=>q.target.id); a.equal(new Set(ids).size,10);
    for(const q of g.questions) {
      if(mode==='spell') a.deepEqual(q.tiles.map(t=>t.text).sort(),E.units(q.target.word).sort());
      else {
        a.equal(q.options.length,4); a.equal(new Set(q.options.map(x=>x.id)).size,4);
        const expect=mode==='first'||mode==='missing'?q.letter.id:q.target.id;
        a.ok(q.options.some(x=>x.id===expect));
      }
      if(mode==='missing') { a.equal(q.pattern.replace('_',q.missing),q.target.word); a.equal(q.letter.small,q.missing); }
      if(mode==='first') a.equal(q.letter.small,q.target.word[0]);
      if(mode==='match'||mode==='listen') a.equal(typeof q.showCapital,'boolean');
    }
  }
});
test('each mode finishes ten correct questions; paused/repeated answers cannot inflate score',()=>{
  for(const mode of E.gameModes) {
    const g=E.createGame(mode,seed(10));
    a.equal(E.next(g),false);
    for(let i=0;i<10;i++) {
      const q=E.current(g);
      const v=mode==='spell'?q.target.word:mode==='first'||mode==='missing'?q.letter.id:q.target.id;
      g.paused=true; a.equal(E.answer(g,v),null); a.equal(E.next(g),false); g.paused=false;
      a.equal(E.answer(g,v),true); a.equal(E.answer(g,v),null); a.equal(E.next(g),true);
    }
    a.equal(g.correct,10); a.equal(g.finished,true); a.equal(E.next(g),false); a.equal(E.answer(g,''),null);
  }
});
test('wrong answer is locked, scores stay bounded, unknown modes rejected',()=>{
  const g=E.createGame('listen',seed(7)); a.equal(E.answer(g,'not-an-id'),false); a.equal(E.answer(g,E.current(g).target.id),null); a.equal(g.correct,0);
  a.deepEqual([0,3,4,6,7,8,9,10].map(E.gameStars),[0,0,1,1,2,2,3,3]); a.throws(()=>E.createGame('nope'));
  a.deepEqual(E.gameModes,['match','listen','first','spell','missing']);
});
test('spell tiles are reusable only after undo and repeated letters remain distinct',()=>{
  const g=E.createGame('spell',seed(1));
  const q=E.current(g); q.target={word:'apple'}; q.tiles=[{id:0,text:'a'},{id:1,text:'p'},{id:2,text:'p'},{id:3,text:'l'},{id:4,text:'e'}];
  a.equal(E.tile(g,0),true); a.equal(E.tile(g,0),false); a.equal(E.tile(g,-1),false);
  a.equal(E.tile(g,1),true); a.equal(E.tile(g,2),true); a.equal(E.tile(g,3),true); a.equal(E.tile(g,4),true);
  a.equal(E.built(g),'apple'); a.equal(E.answer(g,E.built(g)),true);
  a.equal(E.tile(g,0),false);
});
test('units splits English words into single letters',()=>{
  a.deepEqual(E.units('cat'),['c','a','t']);
  a.deepEqual(E.units('apple'),['a','p','p','l','e']);
  a.equal(E.units('rickshaw').join(''),'rickshaw');
});
test('streak uses calendar days: same day, gap, leap day, year rollover and backwards clock',()=>{
  let s=E.activity({},'2026-11-10'); a.equal(s.count,1); a.deepEqual(E.activity(s,'2026-11-10'),s);
  s=E.activity(s,'2026-11-11'); a.equal(s.count,2); a.equal(E.activity(s,'2026-11-09').count,2);
  s=E.activity(s,'2026-11-13'); a.equal(s.count,1); a.equal(s.best,2);
  a.equal(E.activity({day:'2024-02-28',count:2},'2024-02-29').count,3);
  a.equal(E.activity({day:'2026-12-31',count:3},'2027-01-01').count,4);
  a.equal(E.localDay(new Date(2026,10,10,23,30)),'2026-11-10');
});
