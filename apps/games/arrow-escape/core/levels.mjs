import {DIRS,inside,cellKey,occupied,route,solve} from './rules.mjs';
export function random(seed) {
  let s=seed>>>0;
  return () => {s=(s+0x6D2B79F5)|0; let t=Math.imul(s^s>>>15,1|s);
    t^=t+Math.imul(t^t>>>7,61|t); return ((t^t>>>14)>>>0)/4294967296;};
}
export function generate(number, seed = number * 7919 + 4081) {
  const t=Math.max(0,Math.min(499,number-1))/499, n=5+Math.floor(t*7.999);
  const rng=random(seed), pick=k=>Math.floor(rng()*k), arrows=[];
  const target=Math.floor(n*n*(.40+.38*t));
  let used=0;
  while (used<target) {
    const taken=occupied(arrows); let best=null, bestScore=-Infinity;
    for (let trial=0;trial<65;trial++) {
      const dir=pick(4), [dx,dy]=DIRS[dir], len=2+pick(3), head=[pick(n),pick(n)];
      const cells=Array.from({length:len},(_,i)=>[head[0]-dx*(len-1-i),head[1]-dy*(len-1-i)]);
      if (cells.some(c=>!inside(c,n)||taken.has(cellKey(c)))) continue;
      const a={id:arrows.length,dir,cells};
      if (!route(a,arrows,n).safe) continue;
      // Prefer candidates that block existing exits, building deeper dependencies.
      const score=arrows.filter(b=>route(b,arrows,n).safe && !route(b,[...arrows,a],n).safe).length*4
        + rng()*2 + Math.min(...head.map(v=>Math.min(v,n-1-v)))*t;
      if (score>bestScore) {best=a;bestScore=score;}
    }
    if (!best) break;
    arrows.push(best); used+=best.cells.length;
  }
  const level={number,n,arrows};
  if (!solve(level)) throw new Error(`Unsolvable seed ${seed}`);
  return level;
}
