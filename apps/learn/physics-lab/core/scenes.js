/*
 * Physics Lab PS1f - experiment scenes on the PS1c engine.
 * Every scene uses the same 10 m x 6 m world so the camera never moves.
 * window.PLScenes = { list, get(id) }. A scene builds bodies and says what to
 * watch; it never touches the DOM.
 */
(function (root) {
  'use strict';

  var P = root.PLPhysics;

  var TEAL = '#5fb8ad', AMBER = '#e0a458', BLUE = '#7aa2e3';

  function base(world) {
    world.addSegment(0, 0, 10, 0, 0.9);
    world.addSegment(0, 0, 0, 6, 0.5);
    world.addSegment(10, 0, 10, 6, 0.5);
  }

  function ramp(world, ax, ay, bx, by) {
    var s = world.addSegment(ax, ay, bx, by, 0.7);
    s.ramp = true;
    return s;
  }

  // a point a little above a ramp, at fraction t along it
  function onRamp(s, t, up) {
    var x = s.ax + (s.bx - s.ax) * t;
    var y = s.ay + (s.by - s.ay) * t;
    var dx = s.bx - s.ax, dy = s.by - s.ay;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: x + (-dy / len) * up, y: y + (dx / len) * up };
  }

  var scenes = [
    {
      id: 'sandbox', name: 'Sandbox',
      goal: 'Free play: drag a body to throw it, tap to add a ball, double-tap to remove one.',
      tip: 'Bounce, friction and gravity change everything.',
      gravity: 9.81, bounce: 0.5, friction: 0.4, trails: true,
      build: function (world) {
        base(world);
        ramp(world, 1.4, 0, 5.4, 2.5);
        world.addBody(P.circle({ x: 7.3, y: 4.6, r: 0.3, mass: 1, restitution: 0.5, friction: 0.4, color: TEAL, label: '1 kg' }));
        world.addBody(P.box({ x: 7.2, y: 0.4, w: 0.7, h: 0.5, mass: 2, angle: 0.12, restitution: 0.4, friction: 0.4, color: AMBER, label: '2 kg box' }));
      }
    },

    {
      id: 'fall', name: 'Falling',
      goal: 'Do heavy things fall faster? A 1 kg and a 5 kg ball start together at the same height.',
      tip: 'Both balls are the same size; only the mass differs.',
      gravity: 9.81, bounce: 0.15, friction: 0.3, trails: true,
      build: function (world) {
        base(world);
        world.addBody(P.circle({ x: 3.3, y: 5.2, r: 0.3, mass: 1, restitution: 0.15, friction: 0.3, color: TEAL, label: '1 kg' }));
        world.addBody(P.circle({ x: 6.7, y: 5.2, r: 0.3, mass: 5, restitution: 0.15, friction: 0.3, color: AMBER, label: '5 kg' }));
      }
    },

    {
      id: 'ramps', name: 'Ramps',
      goal: 'Which ramp wins the race? Both balls start at the same height, one on a steep ramp and one on a gentle ramp.',
      tip: 'Select a ball to watch its speed; both should reach a similar final speed.',
      gravity: 9.81, bounce: 0.2, friction: 0.1, trails: true,
      build: function (world) {
        base(world);
        var steep = ramp(world, 0.8, 0, 3.4, 2.7);
        var gentle = ramp(world, 5.3, 0, 9.4, 2.7);
        var a = onRamp(steep, 0.82, 0.31);
        var b = onRamp(gentle, 0.82, 0.31);
        world.addBody(P.circle({ x: a.x, y: a.y, r: 0.3, mass: 1, restitution: 0.2, friction: 0.1, color: TEAL, label: 'steep' }));
        world.addBody(P.circle({ x: b.x, y: b.y, r: 0.3, mass: 1, restitution: 0.2, friction: 0.1, color: BLUE, label: 'gentle' }));
      }
    },

    {
      id: 'bounce', name: 'Bounce',
      goal: 'Where does the energy go? Three balls drop together with different bounce.',
      tip: 'The bars show the selected ball: moving energy and height energy.',
      gravity: 9.81, bounce: 0.9, friction: 0.2, trails: true,
      build: function (world) {
        base(world);
        var es = [0.9, 0.6, 0.35];
        var xs = [2.2, 5, 7.8];
        var colours = [TEAL, AMBER, BLUE];
        for (var i = 0; i < 3; i++) {
          world.addBody(P.circle({
            x: xs[i], y: 3.8, r: 0.3, mass: 1, restitution: es[i], friction: 0.2,
            color: colours[i], label: 'bounce ' + es[i]
          }));
        }
      }
    },

    {
      id: 'collision', name: 'Collision',
      goal: 'A moving ball hits a still one. Watch the speed move across.',
      tip: 'Drag a ball to set up your own crash.',
      gravity: 9.81, bounce: 0.95, friction: 0.05, trails: true,
      build: function (world) {
        base(world);
        world.addBody(P.circle({ x: 1.1, y: 0.35, r: 0.3, mass: 2, vx: 4.6, restitution: 0.95, friction: 0.05, color: TEAL, label: '2 kg' }));
        world.addBody(P.circle({ x: 5.4, y: 0.35, r: 0.3, mass: 2, restitution: 0.95, friction: 0.05, color: AMBER, label: '2 kg' }));
      }
    },

    {
      id: 'launch', name: 'Launch',
      goal: 'Which angle travels farthest? The same speed launches balls at 30, 45 and 60 degrees.',
      tip: 'The trails stay on so the three arcs are easy to compare.',
      gravity: 9.81, bounce: 0.35, friction: 0.25, trails: true,
      build: function (world) {
        base(world);
        var angles = [30, 45, 60];
        var colours = [TEAL, AMBER, BLUE];
        var speed = 7.4, baseX = 0.5, baseY = 0.45;
        for (var i = 0; i < angles.length; i++) {
          var rad = angles[i] * Math.PI / 180;
          var dx = Math.cos(rad), dy = Math.sin(rad);
          var lead = 0.62 * i;          // separate the launch points a little
          world.addBody(P.circle({
            x: baseX + dx * lead, y: baseY + dy * lead, r: 0.22, mass: 1,
            vx: dx * speed, vy: dy * speed, restitution: 0.35, friction: 0.25,
            color: colours[i], label: angles[i] + '\u00b0'
          }));
        }
      }
    }
  ];

  var byId = {};
  for (var i = 0; i < scenes.length; i++) byId[scenes[i].id] = scenes[i];

  root.PLScenes = {
    list: scenes,
    get: function (id) { return byId[id] || scenes[0]; },
    has: function (id) { return !!byId[id]; }
  };
})(typeof window !== 'undefined' ? window : this);
