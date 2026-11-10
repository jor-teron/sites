/* Run: node --test apps/games/bubble-shooter/tests/rules.test.cjs */
const {test}=require('node:test'),assert=require('node:assert/strict');
const B=require('../core/rules.js'),L=require('../core/levels.js');
function bare(board){const s=B.create(1,L,123);return {...s,board,current:0,next:0};}
function move(s){let best;
  for(let swap=0;swap<2;swap++)for(let i=0;i<=240;i++){
    const angle=-Math.PI+.26+(Math.PI-.52)*i/240,t=B.trajectory(s.board,angle,s.ceiling);
    if(!t.cell)continue;const p=structuredClone(s);if(swap)[p.current,p.next]=[p.next,p.current];
    const out=B.settle(p,t.cell),gain=out.popped.length+out.dropped.length*2;
    const length=t.points.slice(1).reduce((v,q,i)=>v+Math.hypot(q.x-t.points[i].x,q.y-t.points[i].y),0);
    if(!best||gain>best.gain||(gain===best.gain&&length<best.length))best={angle,swap,p,out,gain,length};
  }return best;
}
module.exports={move};
test('hex neighbours: six interior cells at exactly one diameter',()=>{
  for(const r of [2,3]){const b={r,c:4},p=B.point(b),ns=B.neighbors(b);assert.equal(ns.length,6);
    for(const n of ns){const q=B.point(n);assert.ok(Math.abs(Math.hypot(q.x-p.x,q.y-p.y)-40)<1e-8);}}
});
test('neighbour relations are reciprocal and clipped at all boundaries',()=>{
  for(let r=0;r<24;r++)for(let c=0;c<B.cols(r);c++)for(const n of B.neighbors({r,c})){assert.ok(B.valid(n.r,n.c));assert.ok(B.neighbors(n).some(b=>b.r===r&&b.c===c));}
});
test('snapping picks the nearest free hex neighbour',()=>{const hit={r:1,c:4,color:1},cell={r:2,c:5},p=B.point(cell);assert.deepEqual(B.snap([hit],p,hit),cell);});
test('snapping never overwrites an occupied cell',()=>{const hit={r:1,c:4,color:1},p=B.point({r:2,c:5}),s=B.snap([hit,{r:2,c:5,color:2}],p,hit);assert.notDeepEqual(s,{r:2,c:5});assert.ok(B.neighbors(hit).some(b=>B.key(b)===B.key(s)));});
test('roof snapping stays in top row and returns null if it is full',()=>{assert.deepEqual(B.snap([],B.point({r:0,c:3}),null),{r:0,c:3});assert.equal(B.snap(Array.from({length:10},(_,c)=>({r:0,c,color:1})),{x:200,y:38},null),null);});
test('matching flood crosses both parity offsets and ignores other colours',()=>{const b=[{r:0,c:0,color:0},{r:1,c:0,color:0},{r:2,c:1,color:0},{r:2,c:2,color:1}];assert.equal(B.flood(b,b[0]).length,3);assert.equal(B.flood(b,b[0],false).length,4);});
test('floating detection retains ceiling-connected mixed-colour clusters',()=>{const b=[{r:0,c:0,color:0},{r:1,c:0,color:1},{r:3,c:6,color:0},{r:4,c:6,color:1}];assert.deepEqual(B.floating(b),b.slice(2));});
test('straight trajectory contacts the roof at the correct point',()=>{const t=B.trajectory([],-Math.PI/2);assert.equal(t.kind,'roof');assert.equal(t.bounces,0);assert.ok(Math.abs(t.points.at(-1).x-200)<1e-8);assert.equal(t.points.at(-1).y,B.TOP+B.R);});
test('one-wall bounce obeys reflection geometry',()=>{const a=-Math.PI/4,t=B.trajectory([],a,0,1);assert.equal(t.bounces,1);assert.equal(t.points[1].x,B.W-B.R);assert.ok(Math.abs(t.points[1].y-(B.LAUNCH.y-180))<1e-8);assert.ok(t.points.at(-1).x<B.W-B.R);});
test('guide stops at the second wall while real shots can continue',()=>{const a=-.26,g=B.trajectory([],a,0,1),t=B.trajectory([],a);assert.equal(g.kind,'guide');assert.equal(g.bounces,1);assert.ok(t.bounces>1);assert.equal(t.kind,'roof');});
test('swept collision stops exactly one bubble diameter from the target',()=>{const b={r:4,c:4,color:1},p=B.point(b),a=Math.atan2(p.y-B.LAUNCH.y,p.x-B.LAUNCH.x),t=B.trajectory([b],a),q=t.points.at(-1);assert.equal(t.kind,'bubble');assert.ok(Math.abs(Math.hypot(q.x-p.x,q.y-p.y)-39.99)<1e-6);assert.ok(t.cell);});
test('three matching bubbles pop and score; disconnected bubbles drop',()=>{const s=bare([{r:0,c:0,color:0},{r:1,c:0,color:0},{r:2,c:0,color:1}]),out=B.settle(s,{r:0,c:1});assert.equal(out.popped.length,3);assert.equal(out.dropped.length,1);assert.equal(s.drops,1);assert.equal(s.status,'won');assert.equal(s.combo,1);assert.ok(s.score>=55);});
test('a pair does not pop; ceiling falls precisely on the miss limit',()=>{const s=bare([{r:0,c:0,color:1}]);s.miss=s.limit-1;B.settle(s,{r:1,c:0});assert.equal(s.ceiling,B.DY);assert.equal(s.miss,0);assert.equal(s.board.length,2);});
test('a pop resets pressure and grows the combo',()=>{const s=bare([{r:0,c:0,color:0},{r:0,c:1,color:0},{r:0,c:8,color:1}]);s.miss=3;s.combo=2;B.settle(s,{r:1,c:0});assert.equal(s.miss,0);assert.equal(s.combo,3);assert.equal(s.score,90);});
test('ceiling loss is triggered at the bottom line',()=>{const s=bare([{r:14,c:0,color:1}]);assert.equal(B.lost(s),false);B.ceilingDrop(s);assert.equal(s.status,'lost');});
test('invalid and occupied landing cells fail safely',()=>{for(const cell of [null,{r:-1,c:2},{r:0,c:0}]){const s=bare([{r:0,c:0,color:1}]);B.settle(s,cell);assert.equal(s.status,'lost');assert.equal(s.board.length,1);}});
test('dealt colours always exist on the board; extinct next colour is replaced',()=>{const s=bare([{r:0,c:0,color:0},{r:0,c:1,color:0},{r:0,c:8,color:4}]);s.next=0;B.settle(s,{r:1,c:0});assert.equal(s.current,4);assert.equal(s.next,4);for(let n=0;n<100;n++)assert.equal(B.deal(s),4);});
test('all twenty authored layouts are valid unique and initially anchored',()=>{assert.equal(L.length,20);assert.equal(new Set(L.map(l=>JSON.stringify(l[2]))).size,20);for(let n=1;n<=20;n++){const s=B.create(n,L,123);assert.ok(s.board.every(b=>B.valid(b.r,b.c)&&b.color>=0&&b.color<6));assert.equal(B.floating(s.board).length,0);assert.equal(B.lost(s),false);}});
test('endless adds a parity-preserving pair of rows on the tenth shot',()=>{const s=B.create(21,L,123);s.shots=9;s.limit=6;const before=s.board.length;B.settle(s,{r:5,c:0});assert.equal(s.shots,10);assert.equal(s.board.length,before+1+19);assert.equal(s.board.filter(b=>b.r<2).length,19);assert.ok(s.board.every(b=>B.valid(b.r,b.c)));});
test('save/restore round trip is exact',()=>{const s=B.create(17,L,345);assert.deepEqual(B.restore(JSON.stringify(s)),s);});
test('corrupt saves and impossible coordinates are ignored',()=>{for(const raw of ['{','null','{}','[]'])assert.equal(B.restore(raw),null);const s=B.create(1,L);for(const patch of [{level:99},{board:[{r:1,c:9,color:1}]},{score:-1},{current:8},{ceiling:1e8},{status:'oops'},{board:[s.board[0],s.board[0]]}])assert.equal(B.restore(JSON.stringify({...s,...patch})),null);});
test('scripted complete level one uses real trajectories and earns 3 stars',()=>{let s=B.create(1,L,123);for(let n=0;n<15&&s.status==='play';n++)s=move(s).p;assert.equal(s.status,'won');assert.equal(s.board.length,0);assert.equal(B.stars(s),3);assert.equal(s.shots,3);});
test('all twenty levels clear through real trajectories in a deterministic autoplay sweep',()=>{for(let level=1;level<=20;level++){let s=B.create(level,L,123);for(let n=0;n<60&&s.status==='play';n++){const m=move(s);assert.ok(m,`level ${level} has a legal shot`);s=m.p;}assert.equal(s.status,'won',`level ${level}`);}});
test('efficiency gives one two or three stars and failed rounds give none',()=>{const s=B.create(1,L,123);s.status='won';s.shots=100;assert.equal(B.stars(s),1);s.shots=6;assert.equal(B.stars(s),2);s.shots=3;assert.equal(B.stars(s),3);s.status='lost';assert.equal(B.stars(s),0);});
test('combo scoring is capped at five',()=>{const s=bare([{r:0,c:0,color:0},{r:0,c:1,color:0},{r:0,c:8,color:1}]);s.combo=5;B.settle(s,{r:1,c:0});assert.equal(s.combo,5);assert.equal(s.score,150);});
