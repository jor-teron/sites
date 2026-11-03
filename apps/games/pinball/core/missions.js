/*
 * Star Pinball — missions and ranks (PIN-1b). Pure logic, no page code (core/game.js shows the results).
 * Ranks (original names): Cadet → Pilot → Navigator → Captain → Commodore → Admiral.
 * A mission is started by sinking the ball in the hole while none is running; the next one in the
 * list is offered each time. Goals grow by one step each time round the list (round 1: hit 3 bumpers, ramp twice, ...). Finishing a mission scores
 * missionBase × (rank + 1) and raises the rank (Admiral is the top; missions still score after that).
 * Missions carry over between balls and are saved with the game in progress (see core/game.js).
 * state: { rank, idx (missions started so far), cur: { id, goal, n } | null, done (missions finished) }
 * PBMissions.event(state, type) → array of results:
 *   { kind: 'start' | 'progress' | 'complete' | 'rank', text, points }
 */
const PBMissions = (() => {
  const RANKS = ['Cadet', 'Pilot', 'Navigator', 'Captain', 'Commodore', 'Admiral'];
  // ev = the game event that counts; base goal in round 1, + step per later round
  const LIST = [
    { id: 'bumpers', name: 'Pulsar Patrol', ev: 'bumper', base: 3, step: 2, what: (g) => `hit ${g} pop bumpers` },
    { id: 'ramp', name: 'Comet Run', ev: 'ramp', base: 2, step: 1, what: (g) => `make the ramp ${g === 2 ? 'twice' : g + ' times'}` },
    { id: 'drops', name: 'Asteroid Sweep', ev: 'dropsClear', base: 1, step: 0, what: () => 'clear the drop targets' },
    { id: 'spin', name: 'Orbit Spin', ev: 'spin', base: 15, step: 5, what: (g) => `spin the spinner ${g} times` },
    { id: 'lanes', name: 'Star Chart', ev: 'lanes', base: 1, step: 0, what: () => 'light all 3 star lanes' },
    { id: 'slings', name: 'Shield Test', ev: 'sling', base: 4, step: 2, what: (g) => `hit the slingshots ${g} times` },
  ];
  const fresh = () => ({ rank: 0, idx: 0, cur: null, done: 0 });
  const def = (id) => LIST.find((m) => m.id === id);
  const goalOf = (m, round) => m.base + m.step * round;

  /** Make a saved state safe to use (bad or old saves fall back to a fresh state). */
  function load(s) {
    const st = fresh();
    if (!s || typeof s !== 'object') return st;
    st.rank = Math.max(0, Math.min(RANKS.length - 1, s.rank | 0));
    st.idx = Math.max(0, s.idx | 0); st.done = Math.max(0, s.done | 0);
    if (s.cur && def(s.cur.id)) { const g = Math.max(1, s.cur.goal | 0); st.cur = { id: s.cur.id, goal: g, n: Math.max(0, Math.min(g - 1, s.cur.n | 0)) }; }
    return st;
  }

  function event(st, type) {
    const out = [];
    if (type === 'hole') {
      if (!st.cur) {
        const m = LIST[st.idx % LIST.length], goal = goalOf(m, Math.floor(st.idx / LIST.length));
        st.cur = { id: m.id, goal, n: 0 }; st.idx++;
        out.push({ kind: 'start', text: `Mission: ${m.name} - ${m.what(goal)}`, points: 0 });
      } else out.push({ kind: 'progress', text: `${def(st.cur.id).name}: ${st.cur.n} / ${st.cur.goal}`, points: 0 });
      return out;
    }
    if (!st.cur) return out;
    const m = def(st.cur.id);
    if (m.ev !== type) return out;
    st.cur.n++;
    if (st.cur.n < st.cur.goal) { out.push({ kind: 'progress', text: `${m.name}: ${st.cur.n} / ${st.cur.goal}`, points: 0 }); return out; }
    const pts = C_BASE() * (st.rank + 1);
    st.cur = null; st.done++;
    out.push({ kind: 'complete', text: `${m.name} complete! +${pts.toLocaleString('en')}`, points: pts });
    if (st.rank < RANKS.length - 1) { st.rank++; out.push({ kind: 'rank', text: `Promoted to ${RANKS[st.rank]}!`, points: 0 }); }
    return out;
  }
  const C_BASE = () => (typeof PB_CONFIG !== 'undefined' ? PB_CONFIG.score.missionBase : 2500);

  /** Panel text for the running mission. */
  function status(st) {
    if (!st.cur) return { name: 'No mission', progress: '', frac: 0, hint: 'Shoot the hole to start a mission' };
    const m = def(st.cur.id);
    return { name: m.name, progress: `${st.cur.n} / ${st.cur.goal}`, frac: st.cur.n / st.cur.goal, hint: m.what(st.cur.goal) };
  }
  return { RANKS, LIST, fresh, load, event, status, rankName: (st) => RANKS[st.rank] };
})();
