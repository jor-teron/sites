// Cells run tail → head. Removing a safe arrow can never obstruct another.
export const DIRS = [[0,-1],[1,0],[0,1],[-1,0]];
export const inside = ([x,y], n) => x >= 0 && y >= 0 && x < n && y < n;
export const cellKey = ([x,y]) => `${x},${y}`;
export const clone = value => JSON.parse(JSON.stringify(value));
export function occupied(arrows, except = -1) {
  return new Set(arrows.filter(a => a.id !== except).flatMap(a => a.cells.map(cellKey)));
}
export function route(arrow, arrows, n) {
  if (arrow.lock !== undefined && arrows.some(a=>a.id===arrow.lock))
    return {safe:false,steps:0,reason:'locked'};
  const taken = occupied(arrows, arrow.id), [dx,dy] = DIRS[arrow.dir];
  let body=arrow.cells;
  const [hx,hy] = arrow.cells.at(-1);
  let steps = 0;
  for (let x=hx+dx,y=hy+dy; inside([x,y],n); x+=dx,y+=dy) {
    if (taken.has(cellKey([x,y]))) return {safe:false, steps, reason:'blocked'};
    // Tail vacates first; entering any other own cell would fold the snake.
    if (body.slice(1).some(c=>cellKey(c)===cellKey([x,y])))
      return {safe:false,steps,reason:'self'};
    body=[...body.slice(1),[x,y]];
    steps++;
  }
  return {safe:true, steps:steps+arrow.cells.length, reason:'clear'};
}
export function solve(level) {
  let arrows = clone(level.arrows), order = [];
  while (arrows.length) {
    const a = arrows.find(a => route(a,arrows,level.n).safe);
    if (!a) return null;
    order.push(a.id); arrows = arrows.filter(b => b.id !== a.id);
  }
  return order;
}
// Greedy removal is a complete solver: an exit only removes occupied cells.
export function trajectory(a, steps) {
  const frames = [clone(a.cells)], [dx,dy] = DIRS[a.dir];
  for (let i=0;i<steps;i++) {
    const cells=frames.at(-1), [x,y]=cells.at(-1);
    frames.push([...cells.slice(1),[x+dx,y+dy]]);
  }
  return frames;
}
export function fresh(level) {
  return {arrows:clone(level.arrows), lives:3, moves:0, bumps:0, hints:0, history:[]};
}
export function move(state, id, n) {
  if (state.lives <= 0) return {changed:false};
  const a = state.arrows.find(a => a.id === id);
  if (!a) return {changed:false};
  const result = route(a,state.arrows,n);
  if (result.reason==='locked') return {...result,changed:false};
  state.history.push(clone({...state,history:undefined}));
  state.history = state.history.slice(-180);
  state.moves++;
  if (result.safe) state.arrows = state.arrows.filter(a => a.id !== id);
  else {state.lives--; state.bumps++;}
  return {...result,changed:true};
}
export function undo(state) {
  const old = state.history.pop();
  if (!old) return false;
  // Hint penalties are permanent: undo must not turn a hinted solve into 3 stars.
  const hints=state.hints, history=state.history;
  Object.assign(state,old,{hints,history}); return true;
}
export const stars = state => Math.max(1,3-Math.min(2,state.bumps+state.hints));
