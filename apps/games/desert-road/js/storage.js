/* Desert Road — localStorage: best time and chosen car colour. */
(() => {
  const DR = window.DR, CFG = DR.CFG;
  const get = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } };

  DR.storage = {
    loadBest() {
      try {
        const b = JSON.parse(get(CFG.storageKey));
        return b && typeof b.time === 'number' ? b : null;
      } catch (_) { return null; }
    },
    saveBest(b) { set(CFG.storageKey, JSON.stringify(b)); },
    bestHtml(b) {
      return b ? CFG.text.best.replace('{time}', b.time.toFixed(1)).replace('{rank}', b.rank) : '';
    },
    loadColor() {
      const id = get(CFG.colorKey);
      return CFG.carColors.some(c => c.id === id) ? id : CFG.carColors[0].id;
    },
    saveColor(id) { set(CFG.colorKey, id); },
  };
})();
