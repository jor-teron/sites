/* Scripted legal build order: no free resources, teleporting or invulnerability. */
const SC = require('../core/sim.js');
const G = require('../core/growth.js');
function plan(s) {
  for (const [type, x, y] of [
    ['lab',17,15], ['dome',17,14], ['dome',17,16], ['dome',16,15], ['dome',16,14],
    ['solar',19,17], ['solar',20,17], ['battery',21,16], ['oxygen',18,17], ['battery',21,17],
    ['solar',16,16], ['battery',15,16], ['solar',15,15], ['battery',15,14]
  ]) {
    const result = SC.place(s, type, x, y);
    if (typeof result === 'string') throw Error(result);
  }
}
function act(s) {
  if (s.ship.waiting) G.chooseSupply(s, 'materials');
  if (!s.research.active) {
    const key = Object.keys(G.tree).find(k => !s.research.done.includes(k) && G.tree[k].requires.every(p => s.research.done.includes(p)));
    if (key) G.selectResearch(s, key);
  }
  if (s.research.done.includes('medbay') && !s.buildings.some(b => b.type === 'medbay')) SC.place(s, 'medbay', 18, 18);
  if (s.research.done.includes('drones') && !s.buildings.some(b => b.type === 'droneport')) SC.place(s, 'droneport', 19, 18);
}
function run(days = 30, seed = 4627) {
  const s = SC.create(seed); plan(s);
  for (let tick = 0; tick < days * SC.D.DAY / SC.D.STEP && !s.over; tick++) { act(s); SC.step(s); }
  return s;
}
if (require.main === module) {
  const s = run();
  console.log(JSON.stringify({ days: s.time / SC.D.DAY, settlers: s.colonists.length, stock: SC.totals(s), stats: s.stats, research: s.research, goals: s.goals, health: s.colonists.map(c => c.health), jobs: s.jobs.length, drones: s.drones.length }));
}
module.exports = { plan, act, run };
