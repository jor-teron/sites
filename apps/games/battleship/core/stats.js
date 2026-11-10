/*
 * Battleship — save migration and career stats (SHIP-2c). Pure functions, no page code.
 * Old SHIP-1 / SHIP-2a / SHIP-2b saves (score + mode + game) still load: missing fields
 * get defaults (classic rules, empty career). Win chips keep using score.cpu / score.pvp.
 */
const BSStats = (() => {
  const LEVELS = ['easy', 'medium', 'hard', '2p'];
  const PLAYS = ['classic', 'salvo'];
  const FLEETS = ['classic', 'skirmish'];

  const emptyRow = () => ({ games: 0, wins: 0, losses: 0, shots: 0, hits: 0, winShots: 0, streak: 0, best: 0 });

  function copyRow(o) {
    const r = emptyRow();
    if (!o || typeof o !== 'object') return r;
    for (const k of Object.keys(r)) {
      const n = Number(o[k]);
      if (Number.isFinite(n) && n >= 0) r[k] = n;
    }
    if (r.best < r.streak) r.best = r.streak;
    return r;
  }
  function keyOf(playMode, level) { return (PLAYS.indexOf(playMode) >= 0 ? playMode : 'classic') + '|' + (LEVELS.indexOf(level) >= 0 ? level : 'medium'); }
  function parseKey(k) {
    const p = String(k || '').split('|');
    return { playMode: PLAYS.indexOf(p[0]) >= 0 ? p[0] : 'classic', level: LEVELS.indexOf(p[1]) >= 0 ? p[1] : 'medium' };
  }

  function record(career, playMode, level, ev) {
    if (!career) career = { all: emptyRow(), by: {} };
    if (!career.all) career.all = emptyRow();
    if (!career.by) career.by = {};
    const k = keyOf(playMode, level);
    if (!career.by[k]) career.by[k] = emptyRow();
    const bump = (row) => {
      row.games++;
      row.shots += ev.shots || 0;
      row.hits += ev.hits || 0;
      if (ev.win) {
        row.wins++;
        row.streak++;
        if (row.streak > row.best) row.best = row.streak;
        row.winShots += ev.shots || 0;
      } else {
        row.losses++;
        row.streak = 0;
      }
    };
    bump(career.all);
    bump(career.by[k]);
    return career;
  }

  const avgShots = (row) => (row && row.wins ? row.winShots / row.wins : 0);
  const accuracy = (row) => (row && row.shots ? row.hits / row.shots : 0);

  function loadState(raw, difficultyToLevel, defaultDiff) {
    const out = {
      score: { cpu: { 1: 0, 2: 0 }, pvp: { 1: 0, 2: 0 } },
      mode: (difficultyToLevel && difficultyToLevel[defaultDiff]) || 'medium',
      playMode: 'classic',
      fleet: 'classic',
      noTouch: false,
      career: { all: emptyRow(), by: {} },
      game: null,
    };
    if (!raw || typeof raw !== 'object') return out;
    if (raw.score && raw.score.cpu && raw.score.pvp) {
      for (const side of ['cpu', 'pvp']) for (const p of [1, 2]) {
        const n = Number(raw.score[side][p]);
        out.score[side][p] = Number.isFinite(n) && n >= 0 ? n : 0;
      }
    }
    if (LEVELS.indexOf(raw.mode) >= 0) out.mode = raw.mode;
    if (PLAYS.indexOf(raw.playMode) >= 0) out.playMode = raw.playMode;
    if (FLEETS.indexOf(raw.fleet) >= 0) out.fleet = raw.fleet;
    out.noTouch = !!raw.noTouch;
    if (raw.career && typeof raw.career === 'object') {
      out.career.all = copyRow(raw.career.all);
      if (raw.career.by && typeof raw.career.by === 'object') {
        for (const k of Object.keys(raw.career.by)) out.career.by[keyOf(parseKey(k).playMode, parseKey(k).level)] = copyRow(raw.career.by[k]);
      }
    }
    out.game = raw.game || null;
    return out;
  }

  function rowsForView(career) {
    const list = [];
    const by = (career && career.by) || {};
    for (const play of PLAYS) for (const level of LEVELS) {
      const k = keyOf(play, level);
      const r = by[k];
      if (r && r.games) list.push({ key: k, playMode: play, level, row: r });
    }
    return list;
  }

  return { LEVELS, PLAYS, FLEETS, emptyRow, copyRow, keyOf, parseKey, record, avgShots, accuracy, loadState, rowsForView };
})();
if (typeof globalThis !== 'undefined') globalThis.BSStats = BSStats;
