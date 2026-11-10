/* BUB-1 pure hex geometry + rules. Classic-script and Node compatible. */
(function(root){
  'use strict';
  const R=20, DY=Math.sqrt(3)*R, W=400, H=640, TOP=18, LINE=550, LAUNCH={x:200,y:603};
  const key=b=>`${b.r},${b.c}`, cols=r=>r%2 ? 9:10;
  const valid=(r,c)=>Number.isInteger(r)&&Number.isInteger(c)&&r>=0&&r<24&&c>=0&&c<cols(r);
  function point(b,ceiling=0){return {x:R+2*R*b.c+(b.r%2)*R,y:TOP+R+DY*b.r+ceiling};}
  function neighbors(b){
    const d=b.r%2 ? [0,1]:[-1,0];
    return [[b.r,b.c-1],[b.r,b.c+1],[b.r-1,b.c+d[0]],[b.r-1,b.c+d[1]],
      [b.r+1,b.c+d[0]],[b.r+1,b.c+d[1]]].filter(([r,c])=>valid(r,c)).map(([r,c])=>({r,c}));
  }
  function flood(board,start,same=true){
    const cells=new Map(board.map(b=>[key(b),b])), seen=new Set(), out=[], todo=[start];
    const color=cells.get(key(start))?.color;
    while(todo.length){const p=todo.pop(),k=key(p),b=cells.get(k);
      if(seen.has(k)||!b||(same&&b.color!==color))continue;
      seen.add(k);out.push(b);todo.push(...neighbors(b));
    }return out;
  }
  function floating(board){
    const anchored=new Set();
    for(const b of board)if(b.r===0&&!anchored.has(key(b)))for(const p of flood(board,b,false))anchored.add(key(p));
    return board.filter(b=>!anchored.has(key(b)));
  }
  // At contact select the nearest legal adjacent cell, never overwrite an occupied cell.
  function snap(board,p,hit,ceiling=0){
    const occupied=new Set(board.map(key));
    const candidates=hit ? neighbors(hit) : Array.from({length:cols(0)},(_,c)=>({r:0,c}));
    return candidates.filter(b=>!occupied.has(key(b))).sort((a,b)=>{
      const x=point(a,ceiling),y=point(b,ceiling);
      return Math.hypot(x.x-p.x,x.y-p.y)-Math.hypot(y.x-p.x,y.y-p.y);
    })[0]||null;
  }
  /* Swept ray/circle intersections avoid tunnelling at any frame rate. Guide limits
   * reflections to one; a real shot can bounce again until it reaches the roof. */
  function trajectory(board,angle,ceiling=0,maxBounces=32){
    angle=Math.max(-Math.PI+0.26,Math.min(-0.26,angle));
    let p={...LAUNCH},dx=Math.cos(angle),dy=Math.sin(angle),bounces=0;
    const points=[{...p}];
    for(let n=0;n<40;n++){
      let t=(TOP+R+ceiling-p.y)/dy, hit=null, kind='roof';
      const wall=dx>0?(W-R-p.x)/dx:dx<0?(R-p.x)/dx:Infinity;
      if(wall>=0&&wall<t){t=wall;kind='wall';}
      for(const b of board){
        const q=point(b,ceiling),ox=p.x-q.x,oy=p.y-q.y;
        const v=ox*dx+oy*dy,disc=v*v-(ox*ox+oy*oy-(2*R-0.01)**2);
        if(disc<0)continue; const d=-v-Math.sqrt(disc);
        if(d>=-0.001&&d<t){t=Math.max(0,d);hit=b;kind='bubble';}
      }
      p={x:p.x+dx*t,y:p.y+dy*t};points.push({...p});
      if(kind!=='wall')return {points,cell:snap(board,p,hit,ceiling),hit,kind,bounces};
      if(bounces>=maxBounces)return {points,cell:null,kind:'guide',bounces};
      bounces++;dx=-dx;
    }return {points,cell:null,kind:'blocked',bounces};
  }
  function rng(s){s.seed^=s.seed<<13;s.seed^=s.seed>>>17;s.seed^=s.seed<<5;return (s.seed>>>0)/4294967296;}
  function deal(s){const colors=[...new Set(s.board.map(b=>b.color))];return colors[Math.floor(rng(s)*colors.length)]??0;}
  function create(level,levels,seed=Date.now()){
    const endless=level===21, def=endless?['Endless orbit',5,levels[15][2].slice(0,5)]:levels[level-1];
    const board=[];def[2].forEach((row,r)=>[...row].forEach((v,c)=>{if(v!=='.'&&valid(r,c))board.push({r,c,color:v.charCodeAt(0)-65});}));
    const s={version:1,level,board,seed:seed|0||1,ceiling:0,score:0,combo:0,miss:0,shots:0,drops:0,status:'play',limit:def[1],initial:board.length};
    s.current=deal(s);s.next=deal(s);return s;
  }
  function addRows(s){
    s.board.forEach(b=>b.r+=2);
    for(let r=0;r<2;r++)for(let c=0;c<cols(r);c++)s.board.push({r,c,color:Math.floor(rng(s)*6)});
  }
  function lost(s){return s.board.some(b=>point(b,s.ceiling).y+R>=LINE);}
  function ceilingDrop(s){s.ceiling+=DY;s.miss=0;if(lost(s))s.status='lost';}
  function settle(s,cell){
    if(s.status!=='play')return {popped:[],dropped:[],points:0};
    if(!cell||!valid(cell.r,cell.c)||s.board.some(b=>key(b)===key(cell))){s.status='lost';return {popped:[],dropped:[],points:0};}
    const b={...cell,color:s.current};s.board.push(b);s.shots++;
    const group=flood(s.board,b);const popped=group.length>=3?group:[], before=s.score;
    let dropped=[];
    if(popped.length){
      const popKeys=new Set(popped.map(key));s.board=s.board.filter(b=>!popKeys.has(key(b)));
      dropped=floating(s.board);const dropKeys=new Set(dropped.map(key));s.board=s.board.filter(b=>!dropKeys.has(key(b)));
      s.combo=Math.min(5,s.combo+1);s.miss=0;s.drops+=dropped.length;s.score+=popped.length*10*Math.min(5,s.combo)+dropped.length*25;
    }else{s.combo=0;s.miss++;if(s.miss>=s.limit)ceilingDrop(s);}
    if(s.level===21&&(s.shots%10===0||!s.board.length))addRows(s);
    if(lost(s))s.status='lost';else if(!s.board.length){s.status='won';s.score+=Math.max(0,500-s.shots*5);}
    const colors=new Set(s.board.map(b=>b.color));s.current=colors.has(s.next)?s.next:deal(s);s.next=deal(s);
    return {popped,dropped,points:s.score-before};
  }
  function stars(s){return s.status==='won'?1+(s.shots<=s.initial/2?1:0)+(s.shots<=s.initial/3+1?1:0):0;}
  function restore(raw){
    try{const s=JSON.parse(raw);
      if(!s||s.version!==1||!Number.isInteger(s.level)||s.level<1||s.level>21||!Array.isArray(s.board)||s.board.length>240)return null;
      if(!['play','won','lost'].includes(s.status)||!s.board.every(b=>valid(b.r,b.c)&&Number.isInteger(b.color)&&b.color>=0&&b.color<6)||new Set(s.board.map(key)).size!==s.board.length)return null;
      for(const k of ['score','combo','miss','shots','drops','ceiling','initial'])if(!Number.isFinite(s[k])||s[k]<0)return null;
      if(s.ceiling>H||!Number.isInteger(s.seed)||![4,5,6].includes(s.limit)||![s.current,s.next].every(v=>Number.isInteger(v)&&v>=0&&v<6))return null;
      return s;
    }catch(_){return null;}
  }
  root.BubbleRules={R,DY,W,H,TOP,LINE,LAUNCH,key,cols,valid,point,neighbors,flood,floating,snap,trajectory,create,deal,settle,stars,restore,ceilingDrop,lost};
  if(typeof module!=='undefined')module.exports=root.BubbleRules;
})(typeof window!=='undefined'?window:globalThis);
