/*
 * Desert Road — core: namespace, canvas, shared state, layout helpers.
 * All modules hang off window.DR; config is DESERT_ROAD_CONFIG (core/config.js).
 */
window.DR = (() => {
  const CFG = DESERT_ROAD_CONFIG;
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const DR = {
    CFG,
    canvas,
    ctx: canvas.getContext('2d'),
    el: {
      score: $('score'), time: $('time'), overlay: $('overlay'), startBtn: $('startBtn'),
      best: $('best'), pauseBtn: $('pauseBtn'), padL: $('padLeft'), padR: $('padRight'),
      colors: $('colors'),
    },
    view: { W: 0, H: 0, DPR: 1, sandGrad: null, road: { x: 0, w: 0 } },
    state: {
      running: false,
      paused: false,
      played: false,               // a run has started at least once (ends the idle preview)
      score: CFG.start.score,
      elapsed: 0,                  // game seconds (paused / hidden time does not count)
      speed: CFG.start.speed,      // scroll speed (px per 1/60 s tick)
      car: { x: 0, y: 0, w: CFG.car.width, h: CFG.car.height, targetX: 0 },
      obstacles: [],
      keys: { left: false, right: false },
      touchLeft: false,            // held touch / mouse on the left half
      touchRight: false,           // held touch / mouse on the right half
      spawnTimer: 0,               // seconds since the last spawn roll
      spawnInterval: CFG.start.spawnInterval,
      roadOffset: 0,
      shownTenths: -1,             // last time value written to the HUD
      needsDraw: true,             // redraw a static screen (paused / ended) once
    },
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
    /** True if the event's code or key is in the binding list. */
    isKey: (list, e) => list.includes(e.code) || list.includes(e.key),
  };

  // ----- Layout -----
  DR.roadGeom = (w) => {
    const rw = Math.min(w * CFG.road.widthFraction, CFG.road.maxWidth);
    return { x: (w - rw) / 2, w: rw };
  };
  DR.carY = () => Math.round(Math.min(DR.view.H * CFG.car.yFraction,
    DR.view.H - CFG.car.height / 2 - CFG.car.minBottomGap));
  /** Car x limits: inside the road. */
  DR.carMinX = () => DR.view.road.x + DR.state.car.w / 2 + CFG.car.edgeMargin;
  DR.carMaxX = () => DR.view.road.x + DR.view.road.w - DR.state.car.w / 2 - CFG.car.edgeMargin;

  return DR;
})();
