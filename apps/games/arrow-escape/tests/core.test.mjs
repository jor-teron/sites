import test from 'node:test';
import assert from 'node:assert/strict';
import {generate,bent} from '../core/levels.mjs';
import {dailyLevel,dayStamp,dayNumber,completeDaily,visibleStreak,cleanDaily} from '../core/daily.mjs';
import {solve,route,trajectory,fresh,move,undo,stars,occupied,inside} from '../core/rules.mjs';
import {read,write,restore,SAVE_KEY} from '../core/storage.mjs';
const arrow=(id,cells,dir)=>({id,cells,dir});
test('all 500 seeded levels are deterministic, disjoint and solver-proven',()=>{
  const sizes=new Set();let first=0,last=0,snakes=0,locks=0;
  for(let number=1;number<=500;number++) {
    const level=generate(number);sizes.add(level.n);
    assert.equal(occupied(level.arrows).size,level.arrows.reduce((v,a)=>v+a.cells.length,0));
    assert.ok(level.arrows.every(a=>a.cells.every(c=>inside(c,level.n))));
    snakes+=level.arrows.filter(bent).length;locks+=level.arrows.filter(a=>a.lock!==undefined).length;
    const order=solve(level);assert.equal(order?.length,level.arrows.length,`level ${number}`);
    let state=fresh(level);
    for(const id of order) {
      const a=state.arrows.find(a=>a.id===id),other=occupied(state.arrows,a.id);
      if(a.lock!==undefined)assert.ok(!state.arrows.some(b=>b.id===a.lock));
      for(const frame of trajectory(a,route(a,state.arrows,level.n).steps)) {
        assert.equal(new Set(frame.map(c=>c.join(','))).size,frame.length);
        assert.ok(frame.every(c=>!other.has(c.join(','))),`geometric collision level ${number}`);
      }
      assert.equal(move(state,id,level.n).safe,true);
    }
    assert.equal(state.arrows.length,0);assert.equal(state.lives,3);
    if(number===1)first=level.arrows.length;if(number===500)last=level.arrows.length;
    if(number%50===1)assert.deepEqual(level,generate(number));
  }
  assert.equal(sizes.size,8);assert.ok(last>first*4);assert.ok(snakes>1000);assert.ok(locks>300);
});
test('clear exit and collision steps in all four directions',()=>{
  for(let dir=0;dir<4;dir++) {
    const a=arrow(0,[[2,2]],dir), b=arrow(1,[[[2,0],[4,2],[2,4],[0,2]][dir]],0);
    assert.equal(route(a,[a],5).safe,true);
    assert.deepEqual(route(a,[a,b],5),{safe:false,steps:1,reason:'blocked'});
  }
});
test('straight bodies slide off completely and bump follows free path',()=>{
  const a=arrow(0,[[0,2],[1,2],[2,2]],1), b=arrow(1,[[4,2]],0);
  const blocked=route(a,[a,b],5);assert.equal(blocked.steps,1);
  assert.deepEqual(trajectory(a,1).at(-1),[[1,2],[2,2],[3,2]]);
  const safe=route(a,[a],5);assert.equal(safe.steps,5);
  assert.ok(trajectory(a,safe.steps).at(-1).every(c=>!inside(c,5)));
});
test('three bumps lose; undo restores arrow, moves and life',()=>{
  const level={n:5,arrows:[arrow(0,[[0,0],[1,0]],1),arrow(1,[[3,0]],2)]};
  const s=fresh(level);for(let i=0;i<3;i++)assert.equal(move(s,0,5).safe,false);
  assert.equal(s.lives,0);assert.equal(move(s,0,5).changed,false);
  assert.equal(undo(s),true);assert.equal(s.lives,1);assert.equal(s.moves,2);
  undo(s);undo(s);s.hints=1;move(s,1,5);assert.equal(s.arrows.length,1);undo(s);
  assert.equal(s.arrows.length,2);assert.equal(s.hints,1);assert.equal(stars(s),2);
});
test('save and resume replay valid history; corrupt and blocked storage do not crash',()=>{
  const level=generate(89),s=fresh(level),order=solve(level);
  move(s,order[0],level.n);s.hints=1;move(s,order[1],level.n);
  const map=new Map(),store={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
  assert.equal(write(store,{number:89,state:s,progress:{unlocked:89,stars:{1:3}}}),true);
  const saved=read(store);assert.deepEqual(restore(level,saved.state),s);
  undo(s);assert.deepEqual(restore(level,s),s);
  map.set(SAVE_KEY,'{bad');assert.equal(read(store).progress.unlocked,1);
  assert.deepEqual(restore(level,{history:[],arrows:[],lives:99}),fresh(level));
  assert.equal(write({setItem:()=>{throw Error();}},{}),false);
});

test('snake follows its body one segment at a time and exits fully',()=>{
  const a=arrow(0,[[1,1],[1,2],[2,2],[3,2]],1);
  assert.deepEqual(trajectory(a,1).at(-1),[[1,2],[2,2],[3,2],[4,2]]);
  const trace=trajectory(a,route(a,[a],5).steps);
  assert.ok(trace.at(-1).every(c=>!inside(c,5)));
  const b=arrow(1,[[4,2]],0);
  assert.deepEqual(route(a,[a,b],5),{safe:false,steps:0,reason:'blocked'});
});
test('snake self-collision is forbidden but a vacating tail may be entered',()=>{
  const self=arrow(0,[[4,0],[3,0],[2,0],[2,1]],0);
  assert.equal(route(self,[self],5).reason,'self');
  const tail=arrow(0,[[2,0],[3,0],[3,1],[2,1]],0);
  assert.equal(route(tail,[tail],5).safe,true);
});
test('locked taps are free; key clearing releases lock; undo relocks it; lock cycles fail solver',()=>{
  const locked={...arrow(0,[[0,0],[1,0]],1),lock:1,lockLabel:'1'};
  const key={...arrow(1,[[0,4],[1,4]],1),keyLabel:'1'};
  const level={n:5,arrows:[locked,key]},s=fresh(level);
  assert.equal(move(s,0,5).reason,'locked');assert.equal(s.lives,3);assert.equal(s.moves,0);
  move(s,1,5);assert.equal(route(locked,s.arrows,5).safe,true);
  undo(s);assert.equal(route(locked,s.arrows,5).reason,'locked');
  assert.deepEqual(s,fresh(level));
  assert.equal(solve({n:5,arrows:[locked,{...key,lock:0}]}),null);
});
test('thirty distinct daily date seeds solve with snake and lock rules',()=>{
  const boards=new Set();
  for(let i=0;i<30;i++) {
    const date=new Date(Date.UTC(2026,10,1+i)).toISOString().slice(0,10),l=dailyLevel(date);
    assert.deepEqual(l,dailyLevel(date));boards.add(JSON.stringify(l.arrows));
    const order=solve(l);assert.equal(order.length,l.arrows.length);
    const s=fresh(l);for(const id of order)assert.equal(move(s,id,l.n).safe,true);
    assert.equal(s.lives,3);assert.equal(s.arrows.length,0);
  }
  assert.equal(boards.size,30);
});
test('daily midnight is IST and invalid dates are rejected',()=>{
  assert.equal(dayStamp(new Date('2026-11-10T18:29:59Z')),'2026-11-10');
  assert.equal(dayStamp(new Date('2026-11-10T18:30:00Z')),'2026-11-11');
  assert.ok(Number.isNaN(dayNumber('2026-02-30')));assert.throws(()=>dailyLevel('bad'));
});
test('daily streak is idempotent, consecutive, gap-aware and replay-safe',()=>{
  let r=completeDaily(null,'2026-11-09',2);assert.equal(r.streak,1);
  r=completeDaily(r,'2026-11-09',3);assert.equal(r.streak,1);assert.equal(r.completed['2026-11-09'],3);
  r=completeDaily(r,'2026-11-10',2);assert.equal(r.streak,2);
  assert.equal(visibleStreak(r,'2026-11-11'),2);assert.equal(visibleStreak(r,'2026-11-12'),0);
  r=completeDaily(r,'2026-11-12',1);assert.equal(r.streak,1);
  r=completeDaily(r,'2026-11-10',3);assert.equal(r.last,'2026-11-12');assert.equal(r.streak,1);
  assert.deepEqual(cleanDaily({last:'bad',streak:'oops',completed:{bad:7}}),{last:'',streak:0,completed:{}});
});
test('daily board with locks resumes and undoes exactly; damaged snapshots reset safely',()=>{
  const l=dailyLevel('2026-11-10'),s=fresh(l),order=solve(l);
  for(const id of order.slice(0,4))move(s,id,l.n);s.hints=2;
  assert.deepEqual(restore(l,JSON.parse(JSON.stringify(s))),s);
  assert.equal(undo(s),true);assert.deepEqual(restore(l,s),s);
  assert.deepEqual(restore(l,{history:[{arrows:'bad'}]}),fresh(l));
});

test('save/resume retains three collision penalties even when an earlier arrow is locked',()=>{
  const locked={...arrow(0,[[0,0],[1,0]],1),lock:1};
  const level={n:5,arrows:[locked,arrow(1,[[4,4]],2),arrow(2,[[0,2],[1,2]],1),arrow(3,[[3,2]],0)]};
  const s=fresh(level);
  for(let i=0;i<3;i++) {
    move(s,2,5);assert.deepEqual(restore(level,JSON.parse(JSON.stringify(s))),s);
  }
  const resumed=restore(level,s);undo(resumed);assert.equal(resumed.lives,1);assert.equal(resumed.moves,2);
});
