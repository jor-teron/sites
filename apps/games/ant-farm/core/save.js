// AF-4c save / resume. Typed arrays and the RNG state are stored so a reload
// continues the same colony. ?seed=N starts a fresh seeded farm instead.
(function () {
  var KEY = 'ant-farm.save', VER = 1;

  function arr(a) { return Array.prototype.slice.call(a); }
  function u8(a) { return new Uint8Array(a); }
  function f32(a) { return new Float32Array(a); }

  function packTips(tips, rooms) {
    return (tips || []).map(function (t) {
      return {
        x: t.x, y: t.y, mx: t.mx, my: t.my, left: t.left, len: t.len,
        busy: !!t.busy, perp: !!t.perp, roomI: t.room ? rooms.indexOf(t.room) : -1
      };
    });
  }
  function packAnts(ants, tips) {
    return (ants || []).map(function (a) {
      var o = {}, k;
      for (k in a) if (Object.prototype.hasOwnProperty.call(a, k) && k !== 'tip') o[k] = a[k];
      o.tipI = a.tip ? tips.indexOf(a.tip) : -1;
      return o;
    });
  }
  function link(w) {
    var i, a, t;
    for (i = 0; i < w.tips.length; i++) {
      t = w.tips[i];
      if (t.roomI >= 0 && w.rooms[t.roomI]) t.room = w.rooms[t.roomI];
      delete t.roomI;
    }
    for (i = 0; i < w.ants.length; i++) {
      a = w.ants[i];
      if (a.tipI >= 0 && w.tips[a.tipI]) a.tip = w.tips[a.tipI];
      delete a.tipI;
    }
  }

  AF.SAVE_KEY = KEY;
  AF.serialize = function (w) {
    return {
      v: VER, seed: w.seed, t: w.t, stored: w.stored, collected: w.collected || 0,
      dug: w.dug, laidT: w.laidT, natT: w.natT, tipT: w.tipT, phT: w.phT, dryT: w.dryT || 0,
      histT: w.histT || 0, fieldT: w.fieldT, qx: w.qx, qy: w.qy, sx: w.sx, sy: w.sy,
      bx: w.bx, by: w.by, ex: w.ex, ents: w.ents, tun: w.tun, layer: w.layer,
      rng: w.r && w.r.state ? w.r.state.s : 0,
      g: arr(w.g), wet: arr(w.wet), ph: arr(w.ph), mound: arr(w.mound), tone: arr(w.tone),
      food: w.food, drops: w.drops, falls: w.falls,
      ants: packAnts(w.ants, w.tips), brood: w.brood,
      tips: packTips(w.tips, w.rooms), rooms: w.rooms,
      hist: w.hist || [], splash: w.splash || null,
      pred: w.pred || null, predT: w.predT, predSeen: w.predSeen || 0,
      goals: w.goals || null, goalLog: w.goalLog || [], dead: w.dead || 0, lost: w.lost || 0
    };
  };
  AF.deserialize = function (data) {
    if (!data || data.v !== VER || data.g == null) return null;
    var w = {
      seed: data.seed, r: AF.rng(0), g: u8(data.g), wet: f32(data.wet), ph: f32(data.ph),
      mound: f32(data.mound), tone: f32(data.tone), layer: data.layer || [],
      food: data.food || [], drops: data.drops || [], falls: data.falls || [],
      ants: data.ants || [], brood: data.brood || [], stored: data.stored, t: data.t,
      dug: data.dug, dirty: [], full: true, fieldT: data.fieldT || 0, laidT: data.laidT || 0,
      phT: data.phT || 0, tips: data.tips || [], tun: data.tun || [], rooms: data.rooms || [],
      ents: data.ents || [], tipT: data.tipT || 2, natT: data.natT || 8, collected: data.collected || 0,
      qx: data.qx, qy: data.qy, sx: data.sx, sy: data.sy, bx: data.bx, by: data.by, ex: data.ex,
      dryT: data.dryT || 0, histT: data.histT || 0, hist: data.hist || [], splash: data.splash || null,
      pred: data.pred || null, predT: data.predT, predSeen: data.predSeen || 0,
      goals: data.goals || null, goalLog: data.goalLog || [], dead: data.dead || 0, lost: data.lost || 0
    };
    if (w.r.state) w.r.state.s = data.rng | 0;
    link(w);
    AF.fields(w);
    w.needField = false;
    return w;
  };
  AF.saveColony = function (w) {
    try { localStorage.setItem(KEY, JSON.stringify(AF.serialize(w))); return true; } catch (e) { return false; }
  };
  AF.loadColony = function () {
    try {
      var raw = localStorage.getItem(KEY); if (!raw) return null;
      return AF.deserialize(JSON.parse(raw));
    } catch (e) { return null; }
  };
  AF.clearSave = function () { try { localStorage.removeItem(KEY); } catch (e) { /* blocked */ } };
})();
