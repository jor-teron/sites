import test from 'node:test';
import assert from 'node:assert/strict';
import {generate} from '../core/levels.mjs';
import {solve,route,trajectory,fresh,move,undo,stars,occupied,inside} from '../core/rules.mjs';
import {read,write,restore,SAVE_KEY} from '../core/storage.mjs';
const arrow=(id,cells,dir)=>({id,cells,dir});
test('all 500 seeded levels are deterministic, disjoint and solver-proven',()=>{
  const sizes=new Set();let first=0,last=0;
  for(let number=1;number<=500;number++) {
    const level=generate(number);sizes.add(level.n);
    assert.equal(occupied(level.arrows).size,level.arrows.reduce((v,a)=>v+a.cells.length,0));
    assert.ok(level.arrows.every(a=>a.cells.every(c=>inside(c,level.n))));
    const order=solve(level);assert.equal(order?.length,level.arrows.length,`level ${number}`);
    let state=fresh(level);for(const id of order)assert.equal(move(state,id,level.n).safe,true);
    assert.equal(state.arrows.length,0);assert.equal(state.lives,3);
    if(number===1)first=level.arrows.length;if(number===500)last=level.arrows.length;
    if(number%50===1)assert.deepEqual(level,generate(number));
  }
  assert.equal(sizes.size,8);assert.ok(last>first*4);
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
