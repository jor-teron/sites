const assert=require('node:assert/strict'),R=require('../core/rules.js');
const rng=seed=>()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
let openings=0;
for(const [level,w,h,mines] of [['easy',9,9,10],['medium',16,16,40],['hard',30,16,99],['custom',5,5,16]]){
  for(let seed=1;seed<=5;seed++)for(let i=0;i<w*h;i++){
    const g=R.create(level,w,h,mines);R.reveal(g,i,rng(seed*65537+i));
    assert.equal(g.cells.filter(c=>c.mine).length,mines);assert.equal(g.cells[i].number,0);
    for(const n of [i,...R.neighbours(g,i)])assert.equal(g.cells[n].mine,false);
    assert.ok(g.opened>=R.neighbours(g,i).length+1);assert.notEqual(g.status,'lost');openings++;
  }
}
assert.deepEqual(R.config('custom',-1,999,99999),{level:'custom',width:5,height:30,mines:141});
assert.deepEqual(R.config('custom',NaN,'',Infinity),{level:'custom',width:12,height:12,mines:20});
assert.equal(R.config('custom',5,5,'').mines,16);
assert.equal(R.config('__proto__',5,5,1).level,'custom');
let g=R.create();R.flag(g,0);assert.equal(R.flags(g),1);assert.equal(R.reveal(g,0),false);assert.equal(g.status,'ready');
R.flag(g,0,true);assert.equal(g.cells[0].mark,2);R.flag(g,0,true);assert.equal(g.cells[0].mark,0);
R.reveal(g,40,rng(31));const snapshot=structuredClone(g);assert.deepEqual(R.restore(snapshot),g);
assert.equal(R.restore({...snapshot,cells:[]}),null);assert.equal(R.restore({...snapshot,width:9999}),null);
const bad=structuredClone(snapshot);bad.cells.find(c=>c.open).mark=1;assert.equal(R.restore(bad),null);assert.ok(R.restore(R.create()));
R.reveal(g,g.cells.findIndex(c=>c.mine));assert.equal(g.status,'lost');assert.equal(R.flag(g,0),false);assert.equal(R.restore(g),null);
g=R.restore(snapshot);for(let i=0;i<g.cells.length;i++)if(!g.cells[i].mine)R.reveal(g,i);
assert.equal(g.status,'won');assert.equal(R.flags(g),g.mines);assert.equal(R.restore(g),null);
function fixture(){for(let seed=1;seed<100;seed++){const g=R.create();R.reveal(g,40,rng(seed));const n=g.cells.findIndex((c,i)=>c.open&&c.number&&R.neighbours(g,i).some(j=>!g.cells[j].mine&&!g.cells[j].open));if(n>=0)return[g,n];}throw Error('fixture');}
let[c,n]=fixture();assert.equal(R.chord(c,n),false);for(const i of R.neighbours(c,n))if(c.cells[i].mine)R.flag(c,i);
const before=c.opened;R.chord(c,n);assert.ok(c.opened>before);assert.notEqual(c.status,'lost');
[c,n]=fixture();const around=R.neighbours(c,n),mines=around.filter(i=>c.cells[i].mine);
for(const i of mines.slice(1))R.flag(c,i);R.flag(c,around.find(i=>!c.cells[i].open&&!c.cells[i].mine));
assert.equal(R.flags(c),c.cells[n].number);R.chord(c,n);assert.equal(c.status,'lost');assert.equal(c.exploded,mines[0]);
assert.notEqual(R.bestKey(R.create('custom',5,5,1)),R.bestKey(R.create('custom',5,5,2)));
console.log(`PASS: ${openings} seeded openings (all cells/presets + dense Custom); clamping, flags, ? cycle, restore validation, win, loss, correct/wrong chording and record keys`);
