/* DS-5: live 0–100 driving score, horn hold timing and edge-alert helpers.
   DOM-free and Web Audio-free, so Node can test the maths. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS = root.DS || {}, api);
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const SCORE_MIN = 0, SCORE_MAX = 100, MINOR_PENALTY = 5, SERIOUS_PENALTY = 25, REGAIN_M = 200, HORN_MIN_S = .6;
  function clampScore(n) {
    const x = Number(n);
    return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Number.isFinite(x) ? x : SCORE_MAX));
  }
  function scoreState(value) {
    return { value: clampScore(value == null ? SCORE_MAX : value), cleanM: 0, mark: 0 };
  }
  function lessonScoreState(l) {
    if (!l.scoreState) l.scoreState = scoreState(l.score);
    return l.scoreState;
  }
  function penaltyFor(severity) { return severity === 'serious' ? SERIOUS_PENALTY : MINOR_PENALTY; }
  function applyFault(st, severity) {
    const s = st || scoreState();
    s.value = clampScore(s.value - penaltyFor(severity));
    s.cleanM = 0;
    return s;
  }
  function applyDistance(st, metres) {
    const s = st || scoreState();
    const d = Number(metres), add = Number.isFinite(d) && d > 0 ? d : 0;
    s.cleanM += add;
    const gained = Math.floor(s.cleanM / REGAIN_M);
    if (gained) { s.value = clampScore(s.value + gained); s.cleanM -= gained * REGAIN_M; }
    return s;
  }
  function applyLessonFault(l, severity) {
    const st = lessonScoreState(l);
    applyFault(st, severity);
    l.score = st.value;
    return l.score;
  }
  // Convert a running car.distance reading into clean-driving recovery (session reset does not subtract).
  function advanceLessonScore(l, distance) {
    const st = lessonScoreState(l);
    const n = Number(distance), at = Number.isFinite(n) && n > 0 ? n : 0;
    const delta = at >= st.mark ? at - st.mark : 0;
    st.mark = at;
    applyDistance(st, delta);
    l.score = st.value;
    return l.score;
  }
  function scoreColour(value) {
    const n = clampScore(value);
    return n >= 80 ? 'green' : n >= 50 ? 'amber' : 'red';
  }
  function scoreLabel(value) { return Math.round(clampScore(value)) + '%'; }
  function recordBest(stored, id, score) {
    const out = Object.assign({}, stored && typeof stored === 'object' ? stored : {});
    if (id == null || id === '') return out;
    const prev = Number(out[id]);
    out[id] = Math.max(Number.isFinite(prev) ? prev : 0, Math.round(clampScore(score)));
    return out;
  }
  // A tap or a short press still sounds for HORN_MIN_S; a longer hold ends at release.
  function hornStopAt(startedAt, releasedAt, minS = HORN_MIN_S) {
    const a = Number(startedAt), b = Number(releasedAt);
    const start = Number.isFinite(a) ? a : 0, end = Number.isFinite(b) ? b : start;
    return Math.max(end, start + (Number.isFinite(minS) && minS > 0 ? minS : HORN_MIN_S));
  }
  function edgeAlertOn(prefs) { return !prefs || prefs.edgeAlert !== false; }
  function edgeAlertPulse(severity, reducedMotion) {
    const tone = severity === 'serious' ? 'red' : 'amber';
    return (reducedMotion ? 'show-' : 'pulse-') + tone;
  }
  return { SCORE_MIN, SCORE_MAX, MINOR_PENALTY, SERIOUS_PENALTY, REGAIN_M, HORN_MIN_S,
    scoreState, lessonScoreState, penaltyFor, applyFault, applyDistance, applyLessonFault, advanceLessonScore,
    scoreColour, scoreLabel, recordBest, hornStopAt, edgeAlertOn, edgeAlertPulse };
});
