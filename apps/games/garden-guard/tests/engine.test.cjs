const {test}=require('node:test');
const assert=require('node:assert/strict');
const G=require('../core/data.js');
require('../core/levels.js');
const Engine=require('../core/engine.js');
const defend=require('./strategy.js');
const run=(g,seconds,policy)=>{for(let i=0;i<seconds/G.STEP && g.status==='playing';i++){if(policy)policy(g);g.tick();}return g;};

test('sun starts at 50; planting validates cost and occupied / invalid tiles',()=>{
  const g=new Engine(); assert.equal(g.sun,50); assert.equal(g.plant('pea',0,0),false);
  assert.equal(g.plant('sun',2,0),true); assert.equal(g.sun,0);
  g.sun=1000; assert.equal(g.plant('wall',2,0),false);
  for(const [r,c] of [[-1,0],[5,0],[0,9],[0,.5],[NaN,0]]) assert.equal(g.plant('sun',r,c),false);
  assert.equal(g.plant('unknown',0,0),false);
});
test('cooldowns are per seed and expire in fixed simulation seconds',()=>{
  const g=new Engine();g.sun=500;g.plant('pea',2,2);
  assert.equal(g.plant('pea',1,2),false);assert.equal(g.plant('wall',1,3),true);
  run(g,5.1);assert.equal(g.cooldowns.pea,0);assert.equal(g.plant('pea',1,2),true);
});
test('sky sun and flower production are collectible once and expire',()=>{
  const g=new Engine();g.plant('sun',0,0);run(g,8.1);
  assert.ok(g.suns.length>=2);const id=g.suns[0].id;assert.equal(g.collect(id),true);assert.equal(g.sun,25);
  assert.equal(g.collect(id),false);const expired=g.suns[0].id;run(g,20);assert.equal(g.collect(expired),false);
});
test('shooter fires only when an invader is ahead in its lane',()=>{
  const g=new Engine();g.sun=500;g.plant('pea',2,2);run(g,3);assert.equal(g.shots.length,0);
  g.spawn('basic',1);run(g,1);assert.equal(g.shots.length,0);
  g.spawn('basic',2);run(g,.1);assert.ok(g.shots.some(b=>b.row===2));
  run(g,12);assert.equal(g.enemies.filter(e=>e.row===2).length,0);assert.ok(g.enemies.some(e=>e.row===1));
});
test('invader stops to chew a blocker before continuing',()=>{
  const g=new Engine();g.plant('wall',1,3);g.spawn('basic',1);const e=g.enemies[0];e.x=4;
  run(g,2);assert.equal(e.x,4);assert.ok(g.at(1,3).hp<950);assert.ok(g.at(1,3).hp>800);
  g.at(1,3).hp=1;run(g,.2);assert.equal(g.at(1,3),undefined);assert.ok(e.x<4);
});
test('frost damages and slows movement then wears off',()=>{
  const g=new Engine();g.sun=175;g.plant('frost',2,0);g.spawn('bucket',2);g.enemies[0].x=2;
  run(g,.5);const e=g.enemies[0];assert.ok(e.slow>0);assert.ok(e.hp<520);
  g.plants=[];const before=e.x;run(g,1);assert.ok(before-e.x<.08);run(g,5);assert.equal(e.slow,0);
});
test('berry blasts exactly the neighbouring 3x3 tiles after its fuse',()=>{
  const g=new Engine();g.sun=150;g.plant('bomb',2,3);
  for(const [row,x] of [[1,2.5],[2,3.5],[3,4.8],[0,3.5],[2,5.5]]) {g.spawn('bucket',row);g.enemies.at(-1).x=x;}
  run(g,.5);assert.equal(g.enemies.length,5);run(g,.8);
  assert.equal(g.at(2,3),undefined);assert.equal(g.enemies.length,2);assert.ok(g.enemies.some(e=>e.row===0));
});
test('first breach uses one mower; it sweeps only that lane; second breach loses',()=>{
  const g=new Engine();g.spawn('basic',2);g.enemies[0].x=0;
  g.spawn('bucket',2);g.enemies[1].x=8;g.spawn('basic',1);
  run(g,2);assert.equal(g.mowers[2].used,true);assert.equal(g.mowers[2].active,false);
  assert.equal(g.enemies.filter(e=>e.row===2).length,0);assert.equal(g.enemies.filter(e=>e.row===1).length,1);
  g.spawn('basic',2);g.enemies.at(-1).x=-.51;g.tick();assert.equal(g.status,'lost');
});
test('wave events spawn once with scripted rows/types; all five levels are sorted',()=>{
  for(const l of G.LEVELS) {
    assert.equal(l.flags.length,3);assert.ok(l.events.every((e,i)=>i===0||l.events[i-1].at<=e.at));
    assert.ok(l.events.every(e=>G.INVADERS[e.kind]&&e.row>=0&&e.row<5));
  }
  const g=new Engine();run(g,25.1);assert.equal(g.next,1);assert.equal(g.enemies[0].row,2);
  const id=g.enemies[0].id;run(g,1);assert.equal(g.next,1);assert.equal(g.enemies[0].id,id);
});
test('snapshot round trip preserves every entity and deterministic future',()=>{
  const a=run(new Engine(),70,defend), b=Engine.restore(a.snapshot());assert.ok(b);assert.deepEqual(a.snapshot(),b.snapshot());
  run(a,25,defend);run(b,25,defend);assert.deepEqual(a.snapshot(),b.snapshot());
});
test('malformed saves fail safely without crashing',()=>{
  for(const raw of [null,{},[],{level:999}, {...new Engine().snapshot(),suns:[null]}, {...new Engine().snapshot(),cooldowns:null}, {...new Engine().snapshot(),status:'wat'}]) assert.equal(Engine.restore(raw),null);
});
test('level 1 is won with only legal paid planting and collection',()=>{
  const g=run(new Engine(),300,defend);assert.equal(g.status,'won');assert.equal(g.next,G.LEVELS[0].events.length);
  assert.ok(g.plants.some(p=>p.kind==='pea'));assert.ok(g.plants.some(p=>p.kind==='sun'));assert.ok(g.sun>=0);
});
test('doing nothing loses without running out the level',()=>{
  const g=run(new Engine(),300);assert.equal(g.status,'lost');assert.ok(g.mowers.some(m=>m.used));
});
test('finished games do not mutate and large dt is bounded to one step',()=>{
  const g=new Engine();g.tick(100);assert.equal(g.time,G.STEP);
  g.status='lost';const s=g.snapshot();g.tick();assert.deepEqual(g.snapshot(),s);assert.equal(g.plant('sun',0,0),false);
});

for(let level=0;level<5;level++) test(`level ${level+1}: legal defensive policy can complete scripted waves`,()=>{
  const g=run(new Engine(level),400,defend);assert.equal(g.status,'won');
  assert.equal(g.next,G.LEVELS[level].events.length);assert.ok(g.mowers.filter(m=>m.used).length<=1);
});
