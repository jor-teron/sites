/* Turbo Lap — registries: the theme registry (TLQ1b, TL.themes) and the car registry (TLQ1a, TL.carSet, at the end of this file).
   Theme registry (TLQ1b). The ten themes (assets/themes/*.js) register here; the renderer, the HUD-free
   preview code and the picker ask for the ACTIVE one through TL.theme.
   A theme is built by TL.makeTheme(spec) (assets/themes/base.js). Contract (all drawing is canvas code, sharp at any size):
     id, name, colors {light,dark,start} (road/grass/rumble/lane per band), fog,
     drawBackground(ctx, W, H, playerY, R, direct)  sky + sun/moon/stars + distant background, behind the road
     tree / bush / lamp / sign (ctx, cx, bottomY, w, extra)   roadside objects, drawn from the SAME SIZES as before
     fx(ctx, W, H, t, R)   optional light ambient effect (snow, leaves, dust, ash, sparkles) drawn over the scene
   Physics, collisions and cars never read a theme: only the look changes.
   Mode: 'auto' (theme by circuit number) or a fixed theme id (free play); saved by TL.storage ('theme'). */
window.TL = window.TL || {};
(() => {
  const CFG = TL.CFG;
  const T = TL.themes = {
    list: [], byId: {}, mode: CFG.themes.auto,
    register(th) { if (!T.byId[th.id]) T.list.push(th); T.byId[th.id] = th; },
    has(id) { return !!T.byId[id]; },
    get(id) { return T.byId[id] || T.byId[CFG.themes.cycle[0]]; },
    valid(v) { return v === CFG.themes.auto || T.has(v) ? v : CFG.themes.auto; },
    // the theme Auto gives a circuit: last digit of the circuit number picks it (circuit 50 = Coastline, like 00, 10 ... 90)
    forCircuit(n) {
      if (n === CFG.themes.handMadeCircuit) return T.get(CFG.themes.handMadeTheme);
      const c = CFG.themes.cycle; return T.get(c[((n % c.length) + c.length) % c.length]);
    },
    // which theme is drawn for circuit n under the current mode
    resolve(n) { return T.mode === CFG.themes.auto ? T.forCircuit(n) : T.get(T.mode); },
    // set the mode ('auto' or an id; anything else = auto) and activate the theme for circuit n; save unless save === false
    setMode(mode, n, save) {
      T.mode = T.valid(mode);
      if (save !== false && TL.storage) TL.storage.setTheme(T.mode);
      T.apply(n);
    },
    apply(n) {
      const th = T.resolve(n | 0);
      T.list.forEach(o => { if (o !== th) o._cache = null; });          // only the active theme keeps its pre-rendered layers
      TL.theme = th; return th;
    }
  };

  // ---------- cars (TLQ1a) ----------
  /* The ten car models (assets/cars/*.js) register here. A model is made by TL.makeCar(spec) (assets/cars/base.js):
       id, name, short, blurb, draw(ctx, cx, by, w, color, o)   a rear view that fits the SIZES.car box (width w, height w*312/500,
       bottom-centre cx, by) and honours o = {steer, braking, nitro, detail, accent, plate, t}
     The renderer calls TL.sprites.car(...), which asks this registry for the model: o.model (an opponent) or the player's pick.
     Nothing here touches physics: collision widths come from CFG.bump, never from a model. */
  const K = CFG.cars;
  const C = TL.carSet = {
    list: [], byId: {}, current: K.default, swatchId: K.defaultSwatch,
    register(m) { if (!C.byId[m.id]) C.list.push(m); C.byId[m.id] = m; C.list.sort((a, b) => K.order.indexOf(a.id) - K.order.indexOf(b.id)); },
    has(id) { return !!C.byId[id]; },
    get(id) { return C.byId[id] || C.byId[K.default]; },
    valid(v) { return C.has(v) ? v : K.default; },
    model() { return C.get(C.current); },                            // the player's car
    hasSwatch(id) { return K.swatches.some(s => s.id === id); },
    swatch(id) { return K.swatches.find(s => s.id === (id || C.swatchId)) || K.swatches[0]; },
    color() { return C.swatch().color; },
    accent() { return C.swatch().accent; },
    setCar(id, save) { C.current = C.valid(id); if (save !== false && TL.storage) TL.storage.setCar(C.current); },
    setSwatch(id, save) { C.swatchId = C.hasSwatch(id) ? id : K.defaultSwatch; if (save !== false && TL.storage) TL.storage.setCarColor(C.swatchId); },
    // Opponents: a model and a paint for grid slot i on circuit n. A seeded shuffle (own tiny generator, never Math.random), so
    // the same circuit always gives the same grid and the four cars differ in both model and colour. Paint skips Pearl (the player's).
    dress(ais, n) {
      const test = window.TURBO_LAP_TEST;
      const ids = K.order.filter(C.has), paints = K.swatches.slice(1);
      const shuffled = (arr, salt) => {
        const a = arr.slice(); let s = ((n + 1) * 7919 + salt * 104729) % 2147483647;
        for (let i = a.length - 1; i > 0; i--) { s = (s * 48271) % 2147483647; const j = s % (i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
        return a;
      };
      const ms = shuffled(ids, 1), ps = shuffled(paints, 2);
      ais.forEach((c, i) => {
        if (test && test.oldOpponents) { c.model = K.default; c.accent = null; return; }     // test hook: the pre-TLQ1a look (coupe, own colour)
        const p = ps[i % ps.length];
        c.model = ms[i % ms.length]; c.color = p.color; c.accent = p.accent;
      });
    }
  };
})();
