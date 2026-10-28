/* Morse Code MC1 — turns key presses into letters (no DOM). Feed it down(ms) / up(ms) with timestamps.
   A press shorter than 2 units is a dot, longer is a dash. After release, silence of 2.5 units ends the letter and
   6 units ends the word (a little looser than the 3 / 7 standard, so slow beginners still decode).
   MC.makeKeyer({ wpm, onSymbol(sym, partial), onLetter(ch, code), onWord() }); .setWpm(n), .reset(). */
window.MC = window.MC || {};
(() => {
  const M = window.MC;
  M.makeKeyer = (o) => {
    let wpm = o.wpm || 12, partial = '', downAt = null, tLetter = null, tWord = null, wrote = false;
    const u = () => M.unit(wpm);
    const clear = () => { clearTimeout(tLetter); clearTimeout(tWord); };
    const endLetter = () => { if (!partial) return; const code = partial; partial = ''; wrote = true; o.onLetter && o.onLetter(M.rev[code] || '#', code); };
    return {
      setWpm(n) { wpm = n; },
      reset() { clear(); partial = ''; downAt = null; wrote = false; },
      down(t) { if (downAt != null) return; clear(); downAt = t; },
      up(t) {
        if (downAt == null) return;
        const sym = t - downAt < 2 * u() ? '.' : '-'; downAt = null; partial += sym;
        o.onSymbol && o.onSymbol(sym, partial);
        tLetter = setTimeout(endLetter, 2.5 * u());
        tWord = setTimeout(() => { if (wrote) { wrote = false; o.onWord && o.onWord(); } }, 6 * u());
      }
    };
  };
})();
