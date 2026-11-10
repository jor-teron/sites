import {fresh,clone,move} from './rules.mjs';
export const SAVE_KEY='arrow-escape.save.v1';
export const emptyProgress=()=>({unlocked:1,stars:{}});
export function read(store) {
  try {
    const data=JSON.parse(store.getItem(SAVE_KEY));
    if (data?.version!==1) return {progress:emptyProgress()};
    const p=data.progress || {};
    const progress={unlocked:Math.max(1,Math.min(500,Math.floor(p.unlocked)||1)),stars:{}};
    for (const [k,v] of Object.entries(p.stars||{}))
      if (+k>=1 && +k<=500 && Number.isInteger(v) && v>=1 && v<=3) progress.stars[k]=v;
    return {...data,progress};
  } catch {return {progress:emptyProgress()};}
}
export function write(store, data) {
  try {store.setItem(SAVE_KEY,JSON.stringify({...data,version:1})); return true;}
  catch {return false;}
}
// Restore by replaying validated removals/bumps rather than trusting arbitrary saved cells.
export function restore(level, saved) {
  if (!saved || !Array.isArray(saved.history) || saved.history.length>180) return fresh(level);
  try {
  const s=fresh(level);
  const snapshots=[...saved.history,saved];
  for (let i=1;i<snapshots.length;i++) {
    const prev=snapshots[i-1], next=snapshots[i];
    const removed=prev.arrows?.find(a=>!next.arrows?.some(b=>b.id===a.id));
    s.hints=Math.max(0,Math.min(999,Math.floor(prev.hints)||0));
    const id=removed?.id ?? s.arrows.find(a=>!routeSafe(a,s,level.n))?.id;
    if (id===undefined || !move(s,id,level.n).changed) return fresh(level);
  }
  if (JSON.stringify(s.arrows)!==JSON.stringify(saved.arrows) || s.lives!==saved.lives || s.moves!==saved.moves)
    return fresh(level);
  s.hints=Math.max(0,Math.min(999,Math.floor(saved.hints)||0)); return s;
  } catch {return fresh(level);}
}
import {route} from './rules.mjs';
// A locked tap is not a bump; never use it to reconstruct a lost life.
const routeSafe=(a,s,n)=>{const r=route(a,s.arrows,n);return r.safe||r.reason==='locked';};
