/* Turbo Lap — theme registry (TLQ1b). The ten themes (assets/themes/*.js) register here; the renderer, the HUD-free
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
})();
