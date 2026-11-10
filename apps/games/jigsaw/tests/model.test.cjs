const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../core/model.js');
const fresh = () => M.create(24, 1.5, 12345);
const offset = (s,id,x,y) => {const p=s.pieces[id]; M.move(s,id,p.tx+x-p.x,p.ty+y-p.y);};
test('all seven counts are exact and grid follows image aspect',()=>{
  for(const n of [12,24,48,100,150,200,300])for(const aspect of [.5,1,1.5,3]){
    const s=M.create(n,aspect,11);assert.equal(s.cols*s.rows,n);assert.equal(s.pieces.length,n);
    if(aspect>1)assert.ok(s.cols>=s.rows);if(aspect<1)assert.ok(s.cols<=s.rows);
  }
});
test('seeded edges are reproducible and different seeds vary',()=>{
  assert.deepEqual(fresh(),fresh());assert.notDeepEqual(fresh().pieces,M.create(24,1.5,44).pieces);
});
test('all outside edges are flat and shared neighbours are complementary',()=>{
  for(const n of [12,24,48,100,150,200,300]){
    const s=M.create(n,1.5,n);
    for(const p of s.pieces){
      assert.equal(p.edges[0]===null,p.r===0);assert.equal(p.edges[1]===null,p.c===s.cols-1);
      assert.equal(p.edges[2]===null,p.r===s.rows-1);assert.equal(p.edges[3]===null,p.c===0);
      for(const [e,next,opp] of [[1,p.id+1,3],[2,p.id+s.cols,0]])if(p.edges[e]){
        const a=p.edges[e],b=s.pieces[next].edges[opp];assert.equal(a.sign,-b.sign);
        assert.equal(a.depth,b.depth);assert.equal(a.neck,b.neck);
      }
    }
  }
});
test('Bezier neighbour outlines fit exactly in reverse including control points',()=>{
  const s=fresh();
  for(const p of s.pieces)for(const side of [1,2])if(p.edges[side]){
    const q=s.pieces[p.id+(side===1?1:s.cols)],edge=p.edges[side],other=q.edges[side===1?3:0];
    const start=side===1?[p.tx+s.w,p.ty]:[p.tx+s.w,p.ty+s.h];
    const end=side===1?[p.tx+s.w,p.ty+s.h]:[p.tx,p.ty+s.h];
    function segments(a,b,e){let prev=a;return M.edgeSegments(...a,...b,e,Math.min(s.w,s.h)).map(k=>{
      const points=[prev,...k.points];prev=k.points.at(-1);return points;
    });}
    const a=segments(start,end,edge),b=segments(end,start,other).reverse().map(k=>k.reverse());
    a.forEach((points,i)=>points.forEach((point,j)=>point.forEach((v,k)=>assert.ok(Math.abs(v-b[i][j][k])<1e-9))));
  }
  assert.deepEqual(M.edgeSegments(0,0,100,0,null,50),[{kind:'line',points:[[100,0]]}]);
});
test('snap to board within tolerance; outside does not snap',()=>{
  let s=fresh();offset(s,0,10,8);assert.ok(M.settle(s,0,15));assert.ok(s.pieces[0].locked);
  s=fresh();offset(s,0,20,20);assert.equal(M.settle(s,0,15),false);assert.equal(s.pieces[0].locked,false);
});
test('correct neighbours snap into a movable group away from board',()=>{
  const s=fresh();offset(s,0,-200,400);offset(s,1,-194,405);assert.ok(M.settle(s,0,10));
  assert.equal(s.pieces[0].group,s.pieces[1].group);assert.equal(s.pieces[0].locked,false);
  const before=s.pieces[1].x;M.move(s,0,25,-10);assert.equal(s.pieces[1].x,before+25);
  assert.ok(Math.abs((s.pieces[1].x-s.pieces[0].x)-s.w)<1e-9);
});
test('non-neighbours never join even with matching offsets',()=>{
  const s=fresh();s.pieces.forEach(p=>offset(s,p.id,5000+p.id*1000,5000));
  offset(s,0,300,300);offset(s,2,300,300);assert.equal(M.settle(s,0,10),false);
  assert.notEqual(s.pieces[0].group,s.pieces[2].group);
});
test('chain merges and locking a joined group completes all its members',()=>{
  const s=fresh();for(const id of [0,1,2])offset(s,id,300+id,500);
  M.settle(s,0,10);assert.equal(M.group(s,s.pieces[0].group).length,3);
  const p=s.pieces[0];M.move(s,0,-(p.x-p.tx),-(p.y-p.ty));M.settle(s,0,10);
  for(const id of [0,1,2])assert.equal(s.pieces[id].locked,true);
  const old=s.pieces[0].x;M.move(s,0,9,9);assert.equal(s.pieces[0].x,old);
});
test('joining a locked neighbour locks moving group',()=>{
  const s=fresh();M.settle(s,1,1);offset(s,0,4,4);assert.ok(M.settle(s,0,8));assert.ok(s.pieces[0].locked);
});
test('save restores groups; corrupt positions and inconsistent groups are rejected',()=>{
  const s=fresh();offset(s,0,300,400);offset(s,1,301,400);M.settle(s,0,5);
  assert.deepEqual(M.restore(JSON.parse(JSON.stringify(s))),s);
  const bad=JSON.parse(JSON.stringify(s));bad.pieces[0].x+=12;assert.equal(M.restore(bad),null);
  assert.equal(M.restore({count:999}),null);assert.equal(M.restore(null),null);
});
test('normal move and snap solves a 300-piece puzzle',()=>{
  const s=M.create(300,1.5,6);for(const p of s.pieces)offset(s,p.id,3000+p.id*99,4000);
  for(const p of s.pieces){M.move(s,p.id,p.tx-p.x,p.ty-p.y);M.settle(s,p.id,5);}assert.ok(M.complete(s));
});
