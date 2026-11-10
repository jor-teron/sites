/* Only committed turns are persisted. Mid-roll quit resumes before that roll. */
const SNLSave = (() => {
  const KEY = 'snake-ladder.save',
    VERSION = 2;
  function clean(raw) {
    if (
      !raw ||
      raw.version !== VERSION ||
      !Number.isInteger(raw.seed) ||
      raw.seed < 0 ||
      raw.seed > 99 ||
      !Array.isArray(raw.players) ||
      raw.players.length < 2 ||
      raw.players.length > 4 ||
      !Number.isInteger(raw.turn) ||
      raw.turn < 0 ||
      raw.turn >= raw.players.length ||
      raw.over
    )
      return null;
    const rules = Rules.normalize(raw.rules),
      ids = new Set(),
      players = [];
    for (const p of raw.players) {
      if (
        !p ||
        !Number.isInteger(p.id) ||
        p.id < 0 ||
        p.id > 3 ||
        ids.has(p.id) ||
        !Number.isInteger(p.pos) ||
        p.pos < 0 ||
        p.pos > 99 ||
        !Number.isInteger(p.rolls) ||
        p.rolls < 0 ||
        p.rolls > 1000000 ||
        typeof p.onBoard !== 'boolean' ||
        !['human', 'cpu'].includes(p.kind) ||
        !['easy', 'medium', 'hard'].includes(p.level) ||
        (p.onBoard && p.pos === 99) ||
        (!p.onBoard && (p.pos !== 0 || !rules.sixStart))
      )
        return null;
      ids.add(p.id);
      players.push({ ...Rules.createPlayer(p.id, p, rules), pos: p.pos, onBoard: p.onBoard, rolls: p.rolls });
    }
    return { version: VERSION, seed: raw.seed, players, rules, turn: raw.turn, over: false };
  }
  function snapshot(state) {
    return {
      version: VERSION,
      seed: state.seed,
      players: state.players.map((p) => ({ ...p })),
      rules: { ...state.rules },
      turn: state.turn,
      over: state.over,
    };
  }
  function store(snapshot) {
    try {
      localStorage.setItem(KEY, JSON.stringify(snapshot));
      return true;
    } catch (_) {
      return false;
    }
  }
  function load() {
    try {
      return clean(JSON.parse(localStorage.getItem(KEY) || 'null'));
    } catch (_) {
      return null;
    }
  }
  function clear() {
    try {
      localStorage.removeItem(KEY);
    } catch (_) {}
  }
  return { KEY, clean, snapshot, store, load, clear };
})();
