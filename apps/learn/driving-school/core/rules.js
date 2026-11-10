(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS = root.DS || {}, api);
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const reasons = {
    no_indicator: ['Signal before turning or changing lanes.', 'minor'],
    speeding: ['Over the posted 30 km/h limit. Slow down.', 'minor'],
    red_light: ['Entered the junction on red. Stop before the white line.', 'serious'],
    stop_sign: ['Did not stop for one second before the STOP line.', 'serious'],
    pedestrian: ['Did not give way at the zebra crossing.', 'serious'],
    lane_line: ['Crossed the centre line or left the lane. Keep to your side.', 'minor'],
    collision: ['Collision. Brake and leave more space.', 'serious'],
    give_way: ['Give way to traffic already in the roundabout or on the main road.', 'serious']
  };
  function fault(w, l, code) {
    if ((w.cooldown[code] ?? -100) + 5 > w.time) return;
    w.cooldown[code] = w.time;
    const [reason, severity] = reasons[code], item = { code, reason, severity, time: +w.time.toFixed(1) };
    w.faults.push(item); w.totalFaults++; l.faults.push(item);
  }
  const cross = (a, b, line) => a < line && b >= line;
  function checkRules(w, c, l, dt) {
    const prev = w.previous || { x: c.x, y: c.y, heading: c.heading, indicator: c.indicator };
    const speed = Math.abs(c.v), o = w.side === 'left' ? -3.5 : 3.5;
    const light = w.time % 24 < 9 ? 'green' : w.time % 24 < 12 ? 'amber' : 'red';
    if (speed * 3.6 > 31) fault(w, l, 'speeding');
    if (Math.abs(c.y - (60 + o)) < 3 && cross(prev.x, c.x, 142) && light === 'red') fault(w, l, 'red_light');
    // Stop southbound on the minor arm, within the approach box, not after the line.
    if (Math.abs(c.x - (60 - o)) < 3 && c.y > 43 && c.y < 51.5 && speed < .15) w.stopDwell += dt;
    if (speed >= .15 && !w.stopSatisfied) w.stopDwell = 0;
    if (w.stopDwell >= 1) w.stopSatisfied = true;
    if (Math.abs(c.x - (60 - o)) < 3 && cross(prev.y, c.y, 52) && !w.stopSatisfied) fault(w, l, 'stop_sign');
    if (light === 'red' && c.x > 130 && c.x < 141 && Math.abs(c.y - (60 + o)) < 3 && speed < .15) w.waitDwell += dt;
    const horizontal = Math.abs(Math.cos(c.heading)) > .75;
    const roadY = Math.abs(c.y - 60) < Math.abs(c.y - 180) ? 60 : 180;
    const roadX = Math.abs(c.x - 60) < Math.abs(c.x - 180) ? 60 : 180;
    const intersection = Math.abs(c.x - roadX) < 12 && Math.abs(c.y - roadY) < 12;
    const ringDistance = Math.hypot(c.x - 180, c.y - 180);
    const parkingArea = (c.x > 82 && c.x < 126 && c.y > 34 && c.y < 57) || (c.x > 187 && c.x < 217 && c.y > 151 && c.y < 190);
    const expected = horizontal ? roadY + o * Math.sign(Math.cos(c.heading)) : roadX - o * Math.sign(Math.sin(c.heading));
    const offset = (horizontal ? c.y : c.x) - expected;
    if (!intersection && !(ringDistance < 26) && !parkingArea && Math.abs(offset) > 2.8 && speed > .6) fault(w, l, 'lane_line');
    // Measure heading change through a turn, with a prior indication requirement.
    const changing = Math.abs(c.steer) > .25 && speed > .5;
    if (changing) {
      if (w.turnStart == null) { w.turnStart = prev.heading; w.turnSignalled = !!prev.indicator; }
      const delta = Math.atan2(Math.sin(c.heading - w.turnStart), Math.cos(c.heading - w.turnStart));
      if (Math.abs(delta) > .32) {
        const correct = delta < 0 ? 'left' : 'right';
        if (!w.turnSignalled || c.indicator !== correct) fault(w, l, 'no_indicator');
        w.turnStart = c.heading; w.turnSignalled = !!c.indicator;
      }
    } else w.turnStart = null;
    // Swept approach line: the fault is failing to yield, even if no impact occurs.
    const crossing = w.pedestrians.some(p => p.active && p.y >= 52 && p.y <= 68);
    if (crossing && Math.abs(c.y - 60) < 7 && speed > .5 && ((c.v * Math.cos(c.heading) > 0 && cross(prev.x, c.x, 112)) || (c.v * Math.cos(c.heading) < 0 && cross(-prev.x, -c.x, -120)))) fault(w, l, 'pedestrian');
    const conflicting = w.cars.some(ai => Math.hypot(ai.x - c.x, ai.y - c.y) < 10 && ai.id === 3);
    if (ringDistance > 19 && ringDistance < 24 && speed > 1 && conflicting) fault(w, l, 'give_way');
    if (Math.abs(c.x - (60 - o)) < 4 && c.y > 53 && c.y < 67 && speed > 1 && w.cars.some(ai => Math.abs(ai.y - 60) < 6 && Math.abs(ai.x - c.x) < 10)) fault(w, l, 'give_way');
    const hit = w.cars.some(ai => Math.hypot(ai.x - c.x, ai.y - c.y) < 3.1) || w.pedestrians.some(p => Math.hypot(p.x - c.x, p.y - c.y) < 1.6) || ringDistance < 11.7;
    if (hit) { fault(w, l, 'collision'); c.v = 0; c.message = 'Collision: stop and check all around before moving again.'; }
    w.previous = { x: c.x, y: c.y, heading: c.heading, indicator: c.indicator };
  }
  return { checkRules, ruleReasons: reasons };
});
