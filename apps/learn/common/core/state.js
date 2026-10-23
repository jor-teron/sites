/* Learn kit — small persistent state: Basics/Expert mode (key learn.mode, shared by every Learn app) and per-app progress
   (keys <prefix>viewed and <prefix>best, e.g. learn.first-aid.viewed). localStorage may be missing or full: every call is guarded. */
window.LRN = window.LRN || {};
(() => {
  const L = window.LRN;
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode / quota: keep going without saving */ } };
  L.store = { read, write };

  L.mode = {                                                       // 'basics' | 'expert'
    get() { return read('learn.mode', 'basics') === 'expert' ? 'expert' : 'basics'; },
    set(m) { write('learn.mode', m === 'expert' ? 'expert' : 'basics'); }
  };

  L.progress = prefix => ({
    viewed() { const v = read(prefix + 'viewed', {}); return v && typeof v === 'object' ? v : {}; },
    markViewed(id) { const v = this.viewed(); if (!v[id]) { v[id] = 1; write(prefix + 'viewed', v); } },
    best(id) { const b = read(prefix + 'best', {})[id]; return b && b.of > 0 ? b : null; },    // {score, of}
    saveScore(id, score, of) {                                      // keep only the best ratio
      const all = read(prefix + 'best', {}), b = all[id];
      if (!all || typeof all !== 'object') return false;
      if (b && b.of > 0 && b.score / b.of >= score / of) return false;
      all[id] = { score, of }; write(prefix + 'best', all); return true;
    }
  });
})();
