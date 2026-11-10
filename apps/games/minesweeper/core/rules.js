/* MINE-1 pure rules. No DOM or clock; classic browser script and Node API. */
(function(root) {
  'use strict';
  const PRESETS={easy:[9,9,10],medium:[16,16,40],hard:[30,16,99]};
  const clamp=(v,def,min,max)=>Math.max(min,Math.min(max,v!==''&&Number.isFinite(Number(v))?Math.floor(Number(v)):def));
  function config(level,w,h,mines) {
    if(Object.prototype.hasOwnProperty.call(PRESETS,level)) return {level,width:PRESETS[level][0],height:PRESETS[level][1],mines:PRESETS[level][2]};
    w=clamp(w,12,5,40); h=clamp(h,12,5,30);
    return {level:'custom',width:w,height:h,mines:clamp(mines,20,1,w*h-9)};
  }
  function create(level='easy',w,h,mines) {
    const c=config(level,w,h,mines);
    return {...c,status:'ready',opened:0,exploded:-1,cells:Array.from({length:c.width*c.height},()=>({mine:false,number:0,open:false,mark:0}))};
  }
  function neighbours(g,i) {
    const out=[],x=i%g.width,y=Math.floor(i/g.width);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++) {
      if((!dx&&!dy)||x+dx<0||x+dx>=g.width||y+dy<0||y+dy>=g.height)continue;
      out.push((y+dy)*g.width+x+dx);
    }
    return out;
  }
  function numbers(g) {g.cells.forEach((c,i)=>{c.number=neighbours(g,i).filter(n=>g.cells[n].mine).length;});}
  function plant(g,first,rng) {
    const safe=new Set([first,...neighbours(g,first)]);
    const pool=g.cells.map((_,i)=>i).filter(i=>!safe.has(i));
    for(let i=0;i<g.mines;i++) {
      const j=i+Math.floor(rng()*(pool.length-i)); [pool[i],pool[j]]=[pool[j],pool[i]];
      g.cells[pool[i]].mine=true;
    }
    numbers(g); g.status='playing';
  }
  const active=g=>g.status==='ready'||g.status==='playing';
  function flag(g,i,questions=false) {
    const c=g.cells[i]; if(!active(g)||!c||c.open)return false;
    c.mark=questions?(c.mark+1)%3:c.mark===1?0:1; return true;
  }
  function flood(g,starts) {
    const stack=starts.slice();
    while(stack.length) {
      const i=stack.pop(),c=g.cells[i]; if(c.open||c.mark===1||c.mine)continue;
      c.open=true; c.mark=0; g.opened++;
      if(!c.number)stack.push(...neighbours(g,i).filter(n=>!g.cells[n].open));
    }
  }
  function finish(g) {
    if(g.opened!==g.cells.length-g.mines)return;
    g.status='won'; g.cells.forEach(c=>{if(c.mine)c.mark=1;});
  }
  function reveal(g,i,rng=Math.random) {
    const c=g.cells[i]; if(!active(g)||!c||c.mark===1)return false;
    if(c.open)return chord(g,i);
    if(g.status==='ready')plant(g,i,rng);
    if(c.mine){g.exploded=i;g.status='lost';return true;}
    flood(g,[i]); finish(g); return true;
  }
  function chord(g,i) {
    const c=g.cells[i]; if(g.status!=='playing'||!c||!c.open||!c.number)return false;
    const around=neighbours(g,i);
    if(around.filter(n=>g.cells[n].mark===1).length!==c.number)return false;
    const targets=around.filter(n=>!g.cells[n].open&&g.cells[n].mark!==1);
    if(!targets.length)return false;
    // A wrong flag must lose even if safe cells in the same chord would finish the board.
    const hit=targets.find(n=>g.cells[n].mine); flood(g,targets);
    if(hit!==undefined){g.exploded=hit;g.status='lost';}else finish(g); return true;
  }
  const flags=g=>g.cells.filter(c=>c.mark===1).length;
  const bestKey=g=>g.level==='custom'?`custom-${g.width}x${g.height}-${g.mines}`:g.level;
  function restore(raw) {
    if(!raw||!['ready','playing'].includes(raw.status))return null;
    const g=create(raw.level,raw.width,raw.height,raw.mines);
    if(g.width!==raw.width||g.height!==raw.height||g.mines!==raw.mines||!Array.isArray(raw.cells)||raw.cells.length!==g.cells.length)return null;
    if(raw.cells.some(c=>!c||typeof c.mine!=='boolean'||typeof c.open!=='boolean'||![0,1,2].includes(c.mark)||(c.open&&(c.mine||c.mark))))return null;
    g.cells=raw.cells.map(c=>({mine:c.mine,open:c.open,mark:c.mark,number:0}));
    const actual=g.cells.filter(c=>c.mine).length; g.opened=g.cells.filter(c=>c.open).length;
    if(raw.status==='ready'?actual!==0||g.opened!==0:actual!==g.mines||g.opened<1||g.opened>=g.cells.length-g.mines)return null;
    g.status=raw.status; numbers(g); return g;
  }
  const api={PRESETS,config,create,neighbours,reveal,chord,flag,flags,bestKey,restore};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MineRules=api;
})(typeof window==='undefined'?globalThis:window);
