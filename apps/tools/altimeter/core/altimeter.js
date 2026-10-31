/* Altimeter AL1 — helpers. */
window.AL = window.AL || {};

AL.format = function (metres) {
  if (metres == null || isNaN(metres)) return '—';
  return Math.round(metres);
};

AL.feet = function (metres) {
  if (metres == null || isNaN(metres)) return '—';
  return Math.round(metres * 3.28084);
};
