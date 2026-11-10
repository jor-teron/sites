import {DIRS,inside,cellKey,occupied,route,solve} from './rules.mjs';
export function random(seed) {
  let s=seed>>>0;
  return () => {s=(s+0x6D2B79F5)|0; let t=Math.imul(s^s>>>15,1|s);
    t^=t+Math.imul(t^t>>>7,61|t); return ((t^t>>>14)>>>0)/4294967296;};
}
// Reverse placement preserves a removal order even for curved bodies.
export function bent(a) {
  const [dx,dy]=DIRS[a.dir];
  return a.cells.some((c,i)=>i && (c[0]-a.cells[i-1][0]!==dx || c[1]-a.cells[i-1][1]!==dy));
}
function candidate(rng,n,number,id) {
  const pick=k=>Math.floor(rng()*k),dir=pick(4),head=[pick(n),pick(n)];
  const snake=number>=50 && rng()<.28+number/1000;
  const len=snake?3+pick(4):2+pick(3),cells=[head];let heading=dir;
  for(let i=1;i<len;i++) {
    if(snake && i>1 && rng()<.65)heading=(heading+(rng()<.5?1:3))%4;
    const [dx,dy]=DIRS[heading],tail=cells[0];cells.unshift([tail[0]-dx,tail[1]-dy]);
  }
  return {id,dir,cells};
}
export function generate(number, seed = number * 7919 + 4081) {
  const t=Math.max(0,Math.min(499,number-1))/499, n=5+Math.floor(t*7.999);
  const rng=random(seed), arrows=[];
  const target=Math.floor(n*n*(.40+.38*t));
  let used=0;
  while (used<target) {
    const taken=occupied(arrows); let best=null, bestScore=-Infinity;
    for (let trial=0;trial<65;trial++) {
      const a=candidate(rng,n,number,arrows.length),{cells}=a,head=cells.at(-1);
      if(new Set(cells.map(cellKey)).size!==cells.length)continue;
      if (cells.some(c=>!inside(c,n)||taken.has(cellKey(c)))) continue;
      if (!route(a,arrows,n).safe) continue;
      // Prefer candidates that block existing exits, building deeper dependencies.
      const score=arrows.filter(b=>route(b,arrows,n).safe && !route(b,[...arrows,a],n).safe).length*4
        + rng()*2 + Math.min(...head.map(v=>Math.min(v,n-1-v)))*t;
      if (score>bestScore) {best=a;bestScore=score;}
    }
    if(!best) {
      // Late dense boards need short gap-fillers, not endless failed long snakes.
      for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(let dir=0;dir<4;dir++) {
        const [dx,dy]=DIRS[dir],a={id:arrows.length,dir,cells:[[x,y],[x+dx,y+dy]]};
        if(a.cells.some(c=>!inside(c,n)||taken.has(cellKey(c)))||!route(a,arrows,n).safe)continue;
        const score=rng();if(score>bestScore){best=a;bestScore=score;}
      }
    }
    if (!best) break;
    arrows.push(best); used+=best.cells.length;
  }
  // Locks always depend on a later-inserted key, so reverse order still solves.
  // Distinct key/lock pairs have matching labels as well as colours.
  if(number>=125) {
    const paired=new Set();let label=0;
    for(let i=0;i<arrows.length-1;i++) {
      if(paired.has(i)||rng()>.12+t*.15)continue;
      const keys=arrows.slice(i+1).filter(a=>!paired.has(a.id));
      if(!keys.length)continue;
      const key=keys[Math.floor(rng()*keys.length)];
      arrows[i].lock=key.id;arrows[i].lockLabel=String(++label);key.keyLabel=String(label);
      paired.add(i);paired.add(key.id);
    }
  }
  const level={number,n,arrows};
  if (!solve(level)) throw new Error(`Unsolvable seed ${seed}`);
  return level;
}
