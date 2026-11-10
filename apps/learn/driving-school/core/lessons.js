(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS = root.DS || {}, api);
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const basics = [
    { id: 'start', name: '1 · Move off and stop', spawn: [30, 100, 0],
      cards: ['Handbrake on. Press Start engine. Check the mirror and the empty lot.',
        'Hold C (clutch). Use E to select first. Check around, release H (handbrake).',
        'Hold W gently and release C. Drive along the blue guide towards the stop box.',
        'Release W. Brake (Space or S) into the stop box. Hold C before stopping.'],
      gates: [[78, 100]], finish: 'Stop in the blue box (72–90 m) with clutch down.' },
    { id: 'gears', name: '2 · Change gears', spawn: [25, 70, 0],
      cards: ['Start, select first with clutch down and release the handbrake.',
        'Accelerate above 15 km/h; clutch down then E to second. Release clutch gently.',
        'Above 27 km/h select third with clutch down. Slow down and stop with clutch down.'], gates: [[160, 70]] },
    { id: 'curve', name: '3 · Follow a curve', spawn: [40, 145, 0],
      cards: ['Start and move off slowly. Keep below 25 km/h.', 'Steer gently through each blue ring. Look ahead, not at the bonnet.'],
      gates: [[65, 145], [87, 138], [104, 120], [110, 97], [110, 75]] },
    { id: 'braking', name: '4 · Smooth braking', spawn: [25, 45, 0],
      cards: ['Move off and reach 25 km/h on the straight.', 'Release accelerator early. Brake progressively. Clutch down near stop; stop in the blue box.'],
      gates: [[95, 45]], finish: 'Stop between 89 and 101 m. Avoid slamming the brake.' },
    { id: 'reverse', name: '5 · Reverse straight', spawn: [100, 170, 0],
      cards: ['Stop, clutch down and select R using Q from neutral. Start; check behind in the mirror.',
        'Release handbrake. Reverse slowly along the guide. Steer lightly; stop in the blue box.'],
      gates: [[62, 170]], finish: 'Stop in the blue box at 56–68 m. Keep within 3 m of the guide.' },
    { id: 'eight', name: '6 · Figure of eight', spawn: [110, 105, -Math.PI / 4],
      cards: ['Use a low gear. Follow the blue rings in order at walking pace.', 'Look through the bend. Unwind steering as you cross the middle.'],
      gates: [[130, 85], [155, 85], [165, 105], [150, 125], [130, 125], [110, 105], [90, 85], [65, 85], [55, 105], [70, 125], [90, 125], [110, 105]] }
  ];
  function lesson(def) {
    return { def, phase: 0, gate: 0, elapsed: 0, distance: 0, done: false,
      score: 100, faults: [], stallCount: 0, harshTime: 0, reachedSpeed: false, moved: false };
  }
  function penalize(l, code, reason, amount = 5, severity = 'minor') {
    l.score = Math.max(0, l.score - amount);
    l.faults.push({ code, reason, severity, time: +l.elapsed.toFixed(1) });
  }
  function updateLesson(l, c, dt) {
    if (l.done) return;
    l.elapsed += dt; l.distance = c.distance;
    if (c.stalls > l.stallCount) { penalize(l, 'stall', 'Clutch released without enough engine torque.', 6); l.stallCount = c.stalls; }
    l.harshTime += c.acceleration < -4.5 && Math.abs(c.v) > 1 ? dt : 0;
    if (l.harshTime > 1) { penalize(l, 'harsh', 'Brake progressively for a smooth stop.', 3); l.harshTime = 0; }
    const id = l.def.id, stopped = Math.abs(c.v) < .18 && (c.auto || c.clutch > .7);
    if (id === 'start') {
      if (c.engine) l.phase = Math.max(l.phase, 1);
      if (c.gear === 1 && !c.handbrake) l.phase = Math.max(l.phase, 2);
      if (c.distance > 20) { l.phase = 3; l.moved = true; }
      if (l.moved && stopped && c.x >= 72 && c.x <= 90 && Math.abs(c.y - 100) < 4) l.done = true;
    } else if (id === 'gears') {
      if (c.gear === 2 && c.v > 4) l.phase = Math.max(l.phase, 1);
      if (l.phase >= 1 && c.gear >= 3 && c.v > 7) l.phase = 2;
      if (l.phase === 2 && stopped && c.distance > 40) l.done = true;
    } else if (id === 'braking') {
      if (c.v * 3.6 > 25) { l.reachedSpeed = true; l.phase = 1; }
      if (l.reachedSpeed && stopped && c.x >= 89 && c.x <= 101 && Math.abs(c.y - 45) < 3) l.done = true;
    } else if (id === 'reverse') {
      if (c.gear === -1 && c.engine) l.phase = 1;
      if (c.distance > 20 && c.gear === -1 && stopped && c.x >= 56 && c.x <= 68 && Math.abs(c.y - 170) < 3) l.done = true;
    } else {
      const g = l.def.gates[l.gate];
      if (g && Math.hypot(c.x - g[0], c.y - g[1]) < 6 && Math.abs(c.v) < 7) l.gate++;
      l.phase = c.distance > 2 ? 1 : 0;
      if (l.gate === l.def.gates.length) l.done = true;
    }
    if (l.done) l.score = Math.round(Math.max(0, Math.min(100, l.score)));
  }
  function hint(l, c) {
    if (l.done) return 'Lesson complete! Score ' + l.score + '/100. Choose the next lesson or retry.';
    if (c.stalled) return c.message;
    if (c.handbrake && c.engine) return 'Hold clutch, select a gear, check surroundings, then release handbrake (H).';
    return l.def.cards[Math.min(l.phase, l.def.cards.length - 1)];
  }
  return { basics, lesson, updateLesson, penalize, hint };
});
