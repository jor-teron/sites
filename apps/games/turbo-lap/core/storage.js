/* Turbo Lap — localStorage helpers. All keys are prefixed 'turbo-lap.'. */
window.TL = window.TL || {};
(() => {
  const P = TL.CFG.storagePrefix;
  const S = TL.storage = {
    get(key, def) {
      try { const v = localStorage.getItem(P + key); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set(key, val) { try { localStorage.setItem(P + key, JSON.stringify(val)); } catch (e) { /* private mode */ } },
    fps() { const f = S.get('fps', TL.CFG.fpsDefault); return TL.CFG.fpsOptions.includes(f) ? f : TL.CFG.fpsDefault; },
    setFps(f) { S.set('fps', f); },
    autoGas(def) { const v = S.get('autogas', null); return typeof v === 'boolean' ? v : def; },
    setAutoGas(v) { S.set('autogas', !!v); },
    // picked circuit (0..99)
    circuit() { const n = S.get('circuit', null); return Number.isInteger(n) && n >= 0 && n < TL.CFG.circuits.count ? n : TL.CFG.circuits.defaultCircuit; },
    setCircuit(n) { S.set('circuit', n); },
    // look: 'auto' (theme by circuit number, the default) or a fixed theme id; anything else falls back to 'auto'
    theme() { const v = S.get('theme', 'auto'); return typeof v === 'string' && TL.themes ? TL.themes.valid(v) : 'auto'; },
    setTheme(v) { S.set('theme', v); },
    // car (TLQ1a): a model id and a body-paint swatch id; anything else falls back to the defaults
    car() { const v = S.get('car', null); return typeof v === 'string' && TL.carSet && TL.carSet.has(v) ? v : TL.CFG.cars.default; },
    setCar(v) { S.set('car', v); },
    carColor() { const v = S.get('carcolor', null); return typeof v === 'string' && TL.carSet && TL.carSet.hasSwatch(v) ? v : TL.CFG.cars.defaultSwatch; },
    setCarColor(v) { S.set('carcolor', v); },
    bestTotal(id) { const r = S.records(id); return r && r.bestTotal != null ? r.bestTotal : null; },
    // per track (key best.<nn>, nn = two-digit circuit number): { bestTotal, bestLap, bestPos }
    records(trackId) { return S.get('best.' + trackId, {}); },
    saveResult(trackId, total, bestLap, pos) {
      const r = S.records(trackId), out = { isNewTotal: false, isNewLap: false };
      if (total != null && (r.bestTotal == null || total < r.bestTotal)) { r.bestTotal = total; out.isNewTotal = true; }
      if (bestLap != null && (r.bestLap == null || bestLap < r.bestLap)) { r.bestLap = bestLap; out.isNewLap = true; }
      if (pos != null && (r.bestPos == null || pos < r.bestPos)) r.bestPos = pos;
      S.set('best.' + trackId, r);
      out.records = r;
      return out;
    }
  };
})();
